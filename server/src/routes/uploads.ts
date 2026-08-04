import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, openAsBlob, promises as fsp } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import {
  postStore,
  type MediaFile,
  type PostRecord,
  type StoredMedia,
  type TikTokOptions,
} from "../lib/posts.js";
import {
  formatResetDate,
  gatedPlacements,
  subscriptionStore,
  usageForUser,
} from "../lib/plans.js";
import { notifyPostSettled } from "../lib/postNotifications.js";
import { COVER_DIR, MEDIA_DIR, THUMBNAIL_DIR } from "../lib/paths.js";
import {
  OAUTH_PLATFORMS,
  isReconnectError,
  type Platform,
  type PlatformResult,
} from "../lib/platforms.js";
import { config } from "../config.js";
import {
  describeTikTokError,
  isTikTokConfigured,
  tiktok,
  TikTokError,
} from "../lib/tiktok.js";
import { accessTokenForUser } from "../lib/tiktokAccounts.js";
import {
  postForMe,
  type PfmPlatform,
  type PfmPlatformConfig,
  type PfmFeedPost,
  type PfmPostResult,
} from "../lib/postForMe.js";

const ALL_PLATFORMS = OAUTH_PLATFORMS;

const fieldsSchema = z.object({
  title: z.string().min(1, "A caption/title is required").max(2200),
  description: z.string().max(5000).optional(),
  platforms: z.array(z.enum(ALL_PLATFORMS)).min(1, "Select at least one platform"),
  scheduledAt: z.string().datetime().optional(),
  launchDrop: z.boolean().default(false),
});

const retrySchema = z.object({
  platforms: z.array(z.enum(ALL_PLATFORMS)).optional(),
});

const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/);
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/x-m4v"]);
const inFlightUploads = new Set<string>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Ceiling and spacing for user-initiated retries. Three attempts is enough to
// ride out a transient provider fault; beyond that the failure is structural
// (revoked token, rejected media) and re-sending only burns the account's
// daily platform quota.
const RETRY_LIMIT = 3;
const RETRY_COOLDOWN_MS = 60_000;

// Drain a multipart request: files go to temp storage (so large videos are
// never buffered in memory), fields are collected with multi-value support.
async function collectParts(req: FastifyRequest) {
  const files: Record<string, MediaFile[]> = {};
  const fields: Record<string, string[]> = {};

  for await (const part of req.parts()) {
    if (part.type === "file") {
      const path = join(tmpdir(), `beamloop-${randomUUID()}`);
      await pipeline(part.file, createWriteStream(path));
      (files[part.fieldname] ??= []).push({
        path,
        filename: part.filename || "upload",
        mimetype: part.mimetype,
        truncated: part.file.truncated,
      });
    } else {
      (fields[part.fieldname] ??= []).push(String(part.value));
    }
  }
  return { files, fields };
}

function parseFields(fields: Record<string, string[]>) {
  return fieldsSchema.safeParse({
    title: fields.title?.[0],
    description: fields.description?.[0],
    platforms: fields["platform[]"] ?? [],
    scheduledAt: fields.scheduled_at?.[0],
    launchDrop: fields.launch_drop?.[0] === "true",
  });
}

// Per-platform caption overrides arrive as `<platform>_title` fields.
function parseOverrides(fields: Record<string, string[]>) {
  const overrides: Record<string, string> = {};
  for (const platform of ALL_PLATFORMS) {
    const value = fields[`${platform}_title`]?.[0];
    if (value) overrides[platform] = value;
  }
  return overrides;
}

function parsePlacements(fields: Record<string, string[]>) {
  const placements: Record<string, "timeline" | "reels" | "stories"> = {};
  for (const platform of ["instagram", "facebook"] as const) {
    const value = fields[`${platform}_placement`]?.[0];
    if (value === "timeline" || value === "reels" || value === "stories") {
      placements[platform] = value;
    }
  }
  return placements;
}

// TikTok posting options. Nothing is enabled by default: TikTok's audit
// requires that no interaction is pre-checked and nothing is pre-declared, so
// an absent field means "not chosen", never "yes".
//
// TIKTOK_PRIVACY is a CEILING, not a default: an unaudited TikTok client may
// only publish SELF_ONLY, so the deployment caps what any creator can choose.
// Within that ceiling the creator's own choice wins — treating the config as a
// default silently republished "Everyone" as a private post.
function parseTikTokOptions(fields: Record<string, string[]>): TikTokOptions {
  const flag = (name: string, fallback: boolean) => {
    const value = fields[name]?.[0];
    return value === undefined ? fallback : value === "true";
  };
  const requested = fields.tiktok_privacy?.[0];
  const chosen = requested === "public" || requested === "private" ? requested : null;
  return {
    // A null here means the creator never chose, which validation rejects.
    privacy:
      chosen === null
        ? null
        : config.TIKTOK_PRIVACY === "private"
          ? "private"
          : chosen,
    allowComment: flag("tiktok_allow_comment", false),
    allowDuet: flag("tiktok_allow_duet", false),
    allowStitch: flag("tiktok_allow_stitch", false),
    discloseYourBrand: flag("tiktok_disclose_your_brand", false),
    discloseBrandedContent: flag("tiktok_disclose_branded_content", false),
    isAiGenerated: flag("tiktok_is_ai_generated", false),
  };
}

// TikTok treats a paid partnership as advertising, and advertising cannot be
// hidden — the platform rejects branded content on a private post.
function validateTikTokOptions(options: TikTokOptions): string | undefined {
  // TikTok's Content Posting rules give this choice to the creator and forbid a
  // pre-selected default, so there is nothing sensible to fall back to.
  if (options.privacy === null) {
    return "Choose who can see your TikTok post before publishing.";
  }
  if (options.discloseBrandedContent && options.privacy === "private") {
    return "TikTok branded content has to be visible to everyone. Make the post public or turn off the paid-partnership disclosure.";
  }
  return undefined;
}

function validateMedia(kind: "video" | "photos", media: MediaFile[]): string | undefined {
  if (kind === "video" && media.length !== 1) return "Upload exactly one video";
  if (media.some((file) => file.truncated)) return "A media file exceeds the 500 MB limit";
  const allowed = kind === "video" ? VIDEO_TYPES : PHOTO_TYPES;
  if (media.some((file) => !allowed.has(file.mimetype.toLowerCase()))) {
    return kind === "video"
      ? "Use an MP4, MOV, or M4V video"
      : "Use JPEG, PNG, or WebP photos";
  }
  return undefined;
}

function validatePlatformCaptions(
  caption: string,
  platforms: readonly Platform[],
  overrides: Record<string, string>
): string | undefined {
  // Fail before a potentially large media upload reaches the destination,
  // rather than letting the platform truncate the caption silently.
  const limits: Partial<Record<Platform, number>> = {
    x: 280,
    linkedin: 3000,
  };
  for (const platform of platforms) {
    const limit = limits[platform];
    const effectiveCaption = overrides[platform] || caption;
    if (limit && effectiveCaption.length > limit) {
      const name =
        platform === "x"
          ? "X"
          : platform === "linkedin"
            ? "LinkedIn"
            : platform[0]!.toUpperCase() + platform.slice(1);
      return `${name} captions must be ${limit} characters or fewer`;
    }
  }
  return undefined;
}

function publicPost(post: PostRecord) {
  const {
    userId: _userId,
    mediaFiles: _mediaFiles,
    thumbnailFile: _thumbnailFile,
    // Holds an absolute path on the server's disk — never send it out.
    instagramCoverFile: _instagramCoverFile,
    idempotencyKey: _idempotencyKey,
    pfmPostId: _pfmPostId,
    pfmExternalId: _pfmExternalId,
    pfmAccountPlatforms: _pfmAccountPlatforms,
    ...safe
  } = post;
  return {
    ...safe,
    hasThumbnail: Boolean(post.thumbnailFile),
    results: safe.results.map((result) =>
      !result.success && !result.pending && isReconnectError(result.error)
        ? { ...result, connectionIssue: "reconnect" as const }
        : result
    ),
  };
}

// Poll for per-account results until every expected account has one (or we
// give up). Post for Me publishes asynchronously, so results settle over a
// few seconds.
async function awaitResults(postId: string, expectedIds: string[]) {
  // These are read-only confirmation checks, never publish retries. Keep the
  // initial window deliberately small; slower platforms resolve via the
  // throttled History refresh instead of being polled aggressively.
  const delays = [0, 2_000, 5_000];
  for (const delay of delays) {
    if (delay > 0) await sleep(delay);
    let results: PfmPostResult[];
    try {
      results = await postForMe.listPostResults(postId);
    } catch {
      // The post itself was already accepted. A failed status check must not
      // turn into another create request.
      return [];
    }
    const complete = expectedIds.every((id) =>
      results.some((r) => r.social_account_id === id)
    );
    if (complete || delay === delays[delays.length - 1]) return results;
  }
  return [];
}

// Map a Post for Me result to our normalized shape.
function toResult(platform: string, r?: PfmPostResult): { platform: string } & PlatformResult {
  if (!r) return { platform, success: false, pending: true };
  return {
    platform,
    success: Boolean(r.success),
    url: r.platform_data?.url,
    post_id: r.platform_data?.id,
    error: r.success ? undefined : errText(r.error),
  };
}

function toFeedResult(
  platform: string,
  postId: string,
  feed: PfmFeedPost[]
): ({ platform: string } & PlatformResult) | undefined {
  const live = feed.find((entry) => entry.social_post_id === postId);
  if (!live?.platform_post_id && !live?.platform_url) return undefined;
  return {
    platform,
    success: true,
    url: live.platform_url,
    post_id: live.platform_post_id,
  };
}

// Post for Me can occasionally leave the result job in "processing" even
// after a channel is live. Its account feed carries the exact social_post_id,
// so this is a deterministic confirmation rather than a caption/time guess.
async function resolveProviderResults(
  postId: string,
  platforms: PfmPlatform[],
  idByPlatform: Map<string, string>,
  results: PfmPostResult[]
): Promise<Array<{ platform: string } & PlatformResult>> {
  return Promise.all(
    platforms.map(async (platform) => {
      const accountId = idByPlatform.get(platform)!;
      const normalized = toResult(
        platform,
        results.find((result) => result.social_account_id === accountId)
      );
      if (normalized.success) return normalized;
      try {
        const feed = await postForMe.listAccountFeed(accountId);
        return toFeedResult(platform, postId, feed) ?? normalized;
      } catch {
        return normalized;
      }
    })
  );
}

function errText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === "string") return msg;
    return "Publishing failed";
  }
  return "Publishing failed";
}

// TikTok caps a title at 2200 UTF-16 units.
const TIKTOK_TITLE_LIMIT = 2200;

/**
 * Publish one video to TikTok through our own integration.
 *
 * Returns a normalized result rather than throwing, so a TikTok failure reads
 * like any other channel's and never takes the rest of the post down with it.
 *
 * TikTok has no scheduling API, so a scheduled post reaches here only when the
 * queue fires it — by which point it is an immediate publish.
 */
async function publishToTikTok(input: {
  userId: string;
  caption: string;
  title: string;
  kind: "video" | "photos";
  media: MediaFile[];
  options?: TikTokOptions;
  scheduledAt?: string;
  log?: { warn: (obj: unknown, msg: string) => void };
}): Promise<{ platform: string } & PlatformResult> {
  const fail = (error: string, extra: Partial<PlatformResult> = {}) => ({
    platform: "tiktok",
    success: false,
    error,
    ...extra,
  });

  if (!isTikTokConfigured()) {
    return fail("TikTok isn't available yet.");
  }
  // Photo posts use a different TikTok endpoint we haven't built; refuse
  // clearly rather than sending a video payload that can only fail.
  if (input.kind !== "video") {
    return fail("TikTok posts from BeamLoop have to be videos.");
  }
  const file = input.media[0];
  if (!file) return fail("The video for this post is no longer available.");

  const accessToken = await accessTokenForUser(input.userId, input.log);
  if (!accessToken) {
    return fail("Reconnect TikTok in BeamLoop to keep posting.", {
      connectionIssue: "reconnect" as const,
    });
  }

  const options = input.options;
  // Validation guarantees a chosen privacy on any post carrying options; the
  // fallback covers a post stored before these controls existed.
  const privacy =
    options?.privacy === "private"
      ? "SELF_ONLY"
      : options?.privacy === "public"
        ? "PUBLIC_TO_EVERYONE"
        : config.TIKTOK_PRIVACY === "private"
          ? "SELF_ONLY"
          : "PUBLIC_TO_EVERYONE";

  try {
    const { size } = await fsp.stat(file.path);
    const { publishId, uploadUrl } = await tiktok.initDirectPost(
      accessToken,
      {
        privacy_level: privacy,
        title: input.title.slice(0, TIKTOK_TITLE_LIMIT),
        // TikTok's flags are the inverse of the composer's "let viewers…".
        disable_comment: !(options?.allowComment ?? false),
        disable_duet: !(options?.allowDuet ?? false),
        disable_stitch: !(options?.allowStitch ?? false),
        brand_organic_toggle: options?.discloseYourBrand ?? false,
        brand_content_toggle: options?.discloseBrandedContent ?? false,
        is_aigc: options?.isAiGenerated ?? false,
      },
      size
    );
    await tiktok.uploadVideo(uploadUrl, file.path, file.mimetype);
    // TikTok processes asynchronously. The upload is accepted here; History
    // resolves the outcome from the status endpoint.
    return {
      platform: "tiktok",
      success: false,
      pending: true,
      post_id: publishId,
    };
  } catch (err) {
    const message = describeTikTokError(err);
    input.log?.warn({ err, userId: input.userId }, "Publishing to TikTok failed");
    return fail(
      message,
      err instanceof TikTokError &&
        (err.code === "access_token_invalid" || err.code === "scope_not_authorized")
        ? { connectionIssue: "reconnect" as const }
        : {}
    );
  }
}

// Publish one post to the chosen platforms and return a normalized per-platform
// result array. Everything goes through Post for Me except TikTok, which
// BeamLoop publishes to itself (see lib/tiktok.ts for why).
async function publish(opts: {
  userId: string;
  socialExternalId?: string;
  caption: string;
  platforms: Platform[];
  overrides: Record<string, string>;
  kind: "video" | "photos";
  media: MediaFile[];
  placements?: Record<string, "timeline" | "reels" | "stories">;
  instagramCover?: MediaFile;
  tiktokOptions?: TikTokOptions;
  scheduledAt?: string;
  providerExternalId?: string;
  log?: { warn: (obj: unknown, msg: string) => void };
  onProviderAccepted?: (
    postId: string,
    accountPlatforms: Record<string, string>
  ) => void;
}): Promise<{
  results: Array<{ platform: string } & PlatformResult>;
  pfmPostId?: string;
}> {
  const {
    userId,
    socialExternalId = userId,
    caption,
    platforms,
    overrides,
    kind,
    media,
    placements,
    instagramCover,
    tiktokOptions,
    scheduledAt,
    providerExternalId,
    log,
    onProviderAccepted,
  } = opts;
  const results: Array<{ platform: string } & PlatformResult> = [];
  let pfmPostId: string | undefined;

  // TikTok is handled by our own client, so it never reaches Post for Me.
  const oauthPlatforms = platforms.filter(
    (p): p is PfmPlatform =>
      p !== "tiktok" && (OAUTH_PLATFORMS as readonly string[]).includes(p)
  );

  if (platforms.includes("tiktok")) {
    results.push(
      await publishToTikTok({
        userId,
        caption,
        title: overrides.tiktok || caption,
        kind,
        media,
        options: tiktokOptions,
        scheduledAt,
        log,
      })
    );
  }

  if (oauthPlatforms.length > 0) {
    const accounts = await postForMe.listAccounts(socialExternalId);
    const idByPlatform = new Map<string, string>();
    for (const a of accounts) {
      if (a.status === "connected") idByPlatform.set(a.platform, a.id);
    }

    const selected = oauthPlatforms.filter((p) => idByPlatform.has(p));
    for (const p of oauthPlatforms) {
      if (!idByPlatform.has(p)) {
        results.push({ platform: p, success: false, error: "Account not connected" });
      }
    }

    if (selected.length > 0) {
      const platformConfigurations: Partial<
        Record<PfmPlatform, PfmPlatformConfig>
      > = {};
      for (const p of selected) {
        const cfg: PfmPlatformConfig = {};
        if (overrides[p]) cfg.caption = overrides[p];
        if ((p === "instagram" || p === "facebook") && placements?.[p]) {
          cfg.placement = placements[p];
        }
        // TikTok requires a privacy level on every post. The rest is what the
        // creator chose in the composer; older clients send nothing and fall
        // back to the platform defaults.
        if (p === "tiktok") {
          cfg.privacy_status = tiktokOptions?.privacy ?? config.TIKTOK_PRIVACY;
          // Validation guarantees a chosen privacy for any post carrying
          // options; this only covers the no-options path.
          if (tiktokOptions) {
            cfg.allow_comment = tiktokOptions.allowComment;
            cfg.disclose_your_brand = tiktokOptions.discloseYourBrand;
            cfg.disclose_branded_content = tiktokOptions.discloseBrandedContent;
            cfg.is_ai_generated = tiktokOptions.isAiGenerated;
            // Duet and stitch are video-only concepts on TikTok.
            if (kind === "video") {
              cfg.allow_duet = tiktokOptions.allowDuet;
              cfg.allow_stitch = tiktokOptions.allowStitch;
            }
          }
        }
        if (Object.keys(cfg).length > 0) platformConfigurations[p] = cfg;
      }

      const accountIds = selected.map((p) => idByPlatform.get(p)!);
      // If a previous create response was lost, recover the provider post by
      // our stable external id instead of creating a duplicate.
      let post = providerExternalId
        ? await postForMe.findPostByExternalId(providerExternalId)
        : undefined;
      if (!post) {
        // Upload media once; every platform references the same public URLs.
        const mediaUrls: string[] = [];
        for (const f of media) {
          const blob = await openAsBlob(f.path, { type: f.mimetype });
          mediaUrls.push(await postForMe.uploadMedia(blob, f.mimetype));
        }
        // A cover is expressed as an Instagram-only override of the post media,
        // carrying the same video URL plus a thumbnail. Every other platform
        // keeps the untouched post-level media.
        if (instagramCover && selected.includes("instagram") && mediaUrls[0]) {
          const blob = await openAsBlob(instagramCover.path, {
            type: instagramCover.mimetype,
          });
          const coverUrl = await postForMe.uploadMedia(
            blob,
            instagramCover.mimetype
          );
          platformConfigurations.instagram = {
            ...platformConfigurations.instagram,
            media: [{ url: mediaUrls[0], thumbnail_url: coverUrl }],
          };
        }
        post = await postForMe.createPost({
          caption,
          socialAccountIds: accountIds,
          mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
          platformConfigurations,
          scheduledAt,
          externalId: providerExternalId,
        });
      }
      pfmPostId = post.id;
      onProviderAccepted?.(
        post.id,
        Object.fromEntries(
          selected.map((platform) => [idByPlatform.get(platform)!, platform])
        )
      );

      if (scheduledAt) {
        for (const p of selected) results.push({ platform: p, success: false, pending: true });
      } else {
        const pfmResults = await awaitResults(post.id, accountIds);
        results.push(
          ...(await resolveProviderResults(
            post.id,
            selected,
            idByPlatform,
            pfmResults
          ))
        );
      }
    }
  }

  return { results, pfmPostId };
}

const PENDING_REFRESH_MIN_MS = 10_000;
const pendingRefreshAt = new Map<string, number>();

// Re-fetch async results for posts still showing "pending" and merge them in,
// so History self-heals once the platforms finish publishing. Calls are
// throttled per user and all pending provider post ids are fetched in one
// request.
/**
 * Resolve TikTok posts still waiting on the platform.
 *
 * TikTok accepts an upload and processes it asynchronously, so the publish id
 * captured at upload time is exchanged here for a real outcome. Never throws:
 * a status lookup that fails leaves the result pending for the next pass.
 */
async function refreshPendingTikTok(
  userId: string,
  posts: PostRecord[],
  log?: { warn: (obj: unknown, msg: string) => void }
): Promise<void> {
  const waiting = posts.filter((post) =>
    post.results.some((r) => r.platform === "tiktok" && r.pending && r.post_id)
  );
  if (waiting.length === 0) return;

  const accessToken = await accessTokenForUser(userId, log);
  if (!accessToken) return;

  for (const post of waiting) {
    const pending = post.results.find(
      (r) => r.platform === "tiktok" && r.pending && r.post_id
    );
    if (!pending?.post_id) continue;
    try {
      const status = await tiktok.publishStatus(accessToken, pending.post_id);
      if (status.status === "PUBLISH_COMPLETE") {
        const platformId = status.publicaly_available_post_id?.[0];
        postStore.updateResults(post.id, [
          {
            platform: "tiktok",
            success: true,
            ...(platformId ? { post_id: platformId } : {}),
          },
        ]);
        await notifyPostSettled(post.id, log as never);
      } else if (status.status === "FAILED") {
        postStore.updateResults(post.id, [
          {
            platform: "tiktok",
            success: false,
            error: describeTikTokError(
              new TikTokError(
                status.fail_reason || "TikTok couldn't publish this video.",
                status.fail_reason || "failed",
                200
              )
            ),
          },
        ]);
        await notifyPostSettled(post.id, log as never);
      }
      // Any other status means TikTok is still working; leave it pending.
    } catch (err) {
      log?.warn({ err, postId: post.id }, "TikTok publish status lookup failed");
    }
  }
}

async function refreshPending(
  userId: string,
  socialExternalId = userId,
  log?: { warn: (obj: unknown, msg: string) => void }
): Promise<void> {
  const now = Date.now();
  const lastRefresh = pendingRefreshAt.get(userId) ?? 0;
  if (now - lastRefresh < PENDING_REFRESH_MIN_MS) return;
  pendingRefreshAt.set(userId, now);

  const settled = postStore
    .listByUser(userId)
    .filter((p) => !p.scheduledAt || new Date(p.scheduledAt).getTime() <= now);

  // TikTok is ours to poll, and is resolved independently so a Post for Me
  // outage can't hold up a TikTok result (or the reverse).
  await refreshPendingTikTok(userId, settled, log).catch(() => {});

  const posts = settled.filter((p) =>
    p.results.some(
      (r) =>
        r.pending &&
        r.platform !== "tiktok" &&
        (OAUTH_PLATFORMS as readonly string[]).includes(r.platform)
    )
  );
  if (posts.length === 0) return;

  // A process may exit after Post for Me accepted a create request but before
  // its id reached SQLite. Recover it by external_id; never create it again.
  for (const post of posts) {
    if (post.pfmPostId || !post.pfmExternalId) continue;
    try {
      const recovered = await postForMe.findPostByExternalId(post.pfmExternalId);
      if (recovered) {
        post.pfmPostId = recovered.id;
        postStore.update(post.id, { pfmPostId: recovered.id });
      }
    } catch {
      // Keep the result unconfirmed. A read failure is never a reason to write.
    }
  }

  const pollable = posts.filter((post) => post.pfmPostId);
  if (pollable.length === 0) return;

  const accounts = await postForMe.listAccounts(socialExternalId);
  const idByPlatform = new Map<string, string>();
  for (const a of accounts) {
    if (a.status === "connected") idByPlatform.set(a.platform, a.id);
  }

  const postIds = [...new Set(pollable.map((post) => post.pfmPostId!))];
  const allResults = await postForMe.listPostResults(postIds);
  for (const post of pollable) {
    const pfmResults = allResults.filter((result) => result.post_id === post.pfmPostId);
    const pendingPlatforms = post.results
      .filter(
        (r) =>
          r.pending &&
          (OAUTH_PLATFORMS as readonly string[]).includes(r.platform)
      )
      .map((r) => r.platform)
      .filter((platform): platform is PfmPlatform =>
        idByPlatform.has(platform)
      );
    const resolved = await resolveProviderResults(
      post.pfmPostId!,
      pendingPlatforms,
      idByPlatform,
      pfmResults
    );
    const updated = resolved.filter((result) => !result.pending);
    if (updated.length > 0) {
      postStore.updateResults(post.id, updated);
      await notifyPostSettled(post.id);
    }
  }
}

// Move upload temp files into data/media/<postId>/ so retries can re-send.
async function persistMedia(postId: string, files: MediaFile[]): Promise<StoredMedia[]> {
  const dir = join(MEDIA_DIR, postId);
  await fsp.mkdir(dir, { recursive: true });
  const stored: StoredMedia[] = [];
  for (const [i, file] of files.entries()) {
    const dest = join(dir, `${i}-${file.filename.replace(/[^\w.-]/g, "_")}`);
    await fsp.copyFile(file.path, dest);
    stored.push({ path: dest, filename: file.filename, mimetype: file.mimetype });
  }
  return stored;
}

function imageExtension(mimetype: string) {
  const value = mimetype.toLowerCase();
  return value === "image/png" ? "png" : value === "image/webp" ? "webp" : "jpg";
}

async function persistThumbnail(postId: string, file: MediaFile): Promise<StoredMedia> {
  const dir = join(THUMBNAIL_DIR, postId);
  await fsp.mkdir(dir, { recursive: true });
  const extension = imageExtension(file.mimetype);
  const dest = join(dir, `preview.${extension}`);
  await fsp.copyFile(file.path, dest);
  return {
    path: dest,
    filename: `preview.${extension}`,
    mimetype: file.mimetype,
  };
}

async function persistCover(postId: string, file: MediaFile): Promise<StoredMedia> {
  const dir = join(COVER_DIR, postId);
  await fsp.mkdir(dir, { recursive: true });
  const extension = imageExtension(file.mimetype);
  const dest = join(dir, `cover.${extension}`);
  await fsp.copyFile(file.path, dest);
  return {
    path: dest,
    filename: `cover.${extension}`,
    mimetype: file.mimetype,
  };
}

async function cleanup(files: Record<string, MediaFile[]>) {
  for (const list of Object.values(files)) {
    for (const f of list) {
      await fsp.unlink(f.path).catch(() => {});
    }
  }
}

async function purgeExpiredMedia(): Promise<void> {
  const cutoff = new Date(
    Date.now() - config.MEDIA_RETENTION_HOURS * 60 * 60 * 1000
  ).toISOString();
  const expired = postStore.listWithMediaBefore(cutoff);
  for (const post of expired) {
    const directory = post.mediaFiles?.[0]
      ? join(post.mediaFiles[0].path, "..")
      : join(MEDIA_DIR, post.id);
    await fsp.rm(directory, { recursive: true, force: true });
    // The cover is only meaningful while the post can still be re-sent, so it
    // expires with the retry media rather than with the History preview.
    await fsp.rm(join(COVER_DIR, post.id), { recursive: true, force: true });
    postStore.clearMedia(post.id);
  }
}

function buildCaption(title: string, description?: string) {
  return description ? `${title}\n\n${description}` : title;
}

export default async function uploadRoutes(app: FastifyInstance) {
  app.addHook("preHandler", (req, reply) => app.requireAuth(req, reply));

  const cleanExpiredMedia = () =>
    purgeExpiredMedia().catch((err) => app.log.error({ err }, "Media cleanup failed"));
  cleanExpiredMedia();
  const cleanupTimer = setInterval(cleanExpiredMedia, 60 * 60 * 1000);
  cleanupTimer.unref();

  const handleUpload = (kind: "video" | "photos") =>
    async function (req: FastifyRequest, reply: FastifyReply) {
      const rawKey = req.headers["idempotency-key"];
      const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
      if (!key) {
        return reply.code(400).send({ error: "An Idempotency-Key is required" });
      }
      if (!idempotencyKeySchema.safeParse(key).success) {
        return reply.code(400).send({ error: "Invalid Idempotency-Key" });
      }
      const previous = postStore.findByIdempotencyKey(req.user.id, key);
      if (previous) {
        const entitlement = subscriptionStore.entitlementForUser(req.user.id);
        const usage = usageForUser(req.user.id);
        return {
          post: publicPost(previous),
          usage: {
            count: usage.postsThisMonth,
            limit: entitlement.limits.postsPerMonth,
            last_reset: usage.resetsAt,
          },
        };
      }

      const entitlement = subscriptionStore.entitlementForUser(req.user.id);
      const initialUsage = usageForUser(req.user.id);
      if (initialUsage.postsThisMonth >= entitlement.limits.postsPerMonth) {
        const resetsOn = formatResetDate(initialUsage.resetsAt);
        return reply.code(403).send({
          error:
            entitlement.plan === "pro"
              ? `You've used all ${entitlement.limits.postsPerMonth} posts this month. Your limit resets on ${resetsOn}.`
              : `You've used all ${entitlement.limits.postsPerMonth} posts this month. Your limit resets on ${resetsOn}, or upgrade for a higher limit.`,
          code: "PLAN_LIMIT",
        });
      }

      const inFlightKey = `${req.user.id}:${key}`;
      if (inFlightUploads.has(inFlightKey)) {
        return reply.code(409).send({
          error: "This post is already being sent. Check History in a moment.",
        });
      }
      inFlightUploads.add(inFlightKey);

      let collected: Awaited<ReturnType<typeof collectParts>>;
      try {
        collected = await collectParts(req);
      } catch (error) {
        inFlightUploads.delete(inFlightKey);
        throw error;
      }
      const { files, fields } = collected;
      try {
        const parsed = parseFields(fields);
        if (!parsed.success) {
          return reply.code(400).send({ error: parsed.error.issues[0]?.message });
        }
        const media = kind === "video" ? files.video ?? [] : files["photos[]"] ?? [];
        if (media.length === 0) {
          return reply.code(400).send({
            error: kind === "video" ? "A video file is required" : "At least one photo is required",
          });
        }
        if (kind === "photos" && media.length > 10) {
          return reply.code(400).send({ error: "At most 10 photos per post" });
        }
        const mediaError = validateMedia(kind, media);
        if (mediaError) return reply.code(400).send({ error: mediaError });
        const thumbnails = files.thumbnail ?? [];
        if (thumbnails.length > 1) {
          return reply.code(400).send({ error: "Upload exactly one thumbnail" });
        }
        const thumbnail = thumbnails[0];
        if (
          thumbnail &&
          (thumbnail.truncated ||
            !PHOTO_TYPES.has(thumbnail.mimetype.toLowerCase()))
        ) {
          return reply.code(400).send({ error: "Use a JPEG, PNG, or WebP thumbnail" });
        }

        // The Instagram cover the composer picked — either a frame lifted from
        // the video or an image chosen from the library. Both arrive here as a
        // plain image, so there is one path to validate and one to publish.
        const covers = files.instagram_cover ?? [];
        if (covers.length > 1) {
          return reply.code(400).send({ error: "Upload exactly one Instagram cover" });
        }
        const cover = covers[0];
        if (
          cover &&
          (cover.truncated || !PHOTO_TYPES.has(cover.mimetype.toLowerCase()))
        ) {
          return reply
            .code(400)
            .send({ error: "Use a JPEG, PNG, or WebP Instagram cover" });
        }

        const { title, description, platforms } = parsed.data;
        const overrides = parseOverrides(fields);
        const placements = parsePlacements(fields);
        const tiktokOptions = platforms.includes("tiktok")
          ? parseTikTokOptions(fields)
          : undefined;
        if (tiktokOptions) {
          const tiktokError = validateTikTokOptions(tiktokOptions);
          if (tiktokError) return reply.code(400).send({ error: tiktokError });
        }
        const scheduledAt = parsed.data.scheduledAt;
        const launchDrop = parsed.data.launchDrop;
        if (platforms.length > entitlement.limits.channels) {
          return reply.code(403).send({
            error: `Your plan supports up to ${entitlement.limits.channels} channels per post`,
            code: "PLAN_LIMIT",
          });
        }
        if (
          Object.keys(overrides).length > 0 &&
          !entitlement.limits.platformCaptions
        ) {
          return reply.code(403).send({
            error: "Per-platform captions require a Creator or Pro plan",
            code: "PLAN_FEATURE",
          });
        }
        // Instagram placement is free on every plan (see
        // UNGATED_PLACEMENT_PLATFORMS) — only the rest is a paid feature.
        if (gatedPlacements(placements).length > 0 && !entitlement.limits.placements) {
          return reply.code(403).send({
            error: "Facebook placements require a Creator or Pro plan",
            code: "PLAN_FEATURE",
          });
        }
        if (cover) {
          if (!entitlement.limits.instagramCover) {
            return reply.code(403).send({
              error: "Instagram covers require a Creator or Pro plan",
              code: "PLAN_FEATURE",
            });
          }
          if (kind !== "video" || !platforms.includes("instagram")) {
            return reply.code(400).send({
              error: "An Instagram cover only applies to a video posted to Instagram",
            });
          }
        }
        if (launchDrop && !entitlement.limits.launchDrops) {
          return reply.code(403).send({
            error: "Launch Drops require a Pro plan",
            code: "PLAN_FEATURE",
          });
        }
        if (scheduledAt) {
          if (initialUsage.scheduledPosts >= entitlement.limits.scheduledPosts) {
            return reply.code(403).send({
              // A concurrent cap, not a monthly one — publishing or deleting a
              // queued post frees a slot immediately.
              error:
                entitlement.plan === "pro"
                  ? `You already have ${entitlement.limits.scheduledPosts} posts scheduled, the most your plan allows. Publish or delete one to schedule another.`
                  : `You already have ${entitlement.limits.scheduledPosts} posts scheduled, the most your plan allows. Publish or delete one to free a slot, or upgrade to schedule more.`,
              code: "PLAN_LIMIT",
            });
          }
          const delay = new Date(scheduledAt).getTime() - Date.now();
          if (delay < 5 * 60 * 1000) {
            return reply.code(400).send({ error: "Schedule at least 5 minutes from now" });
          }
          if (delay > 366 * 24 * 60 * 60 * 1000) {
            return reply.code(400).send({ error: "Schedule within the next year" });
          }
        }
        if (launchDrop && (!scheduledAt || platforms.length < 2)) {
          return reply.code(400).send({
            error: "A Launch Drop needs a future time and at least two channels",
          });
        }
        const caption = buildCaption(title, description);
        const captionError = validatePlatformCaptions(caption, platforms, overrides);
        if (captionError) return reply.code(400).send({ error: captionError });

        // Persist the idempotency record and retry media before the first
        // external write. A client timeout or server restart can now return
        // this same post instead of creating another one.
        const postId = randomUUID();
        const hasOauthPlatform = platforms.some((platform) =>
          (OAUTH_PLATFORMS as readonly string[]).includes(platform)
        );
        const post = postStore.add({
          id: postId,
          userId: req.user.id,
          idempotencyKey: key,
          kind,
          title,
          description,
          platforms,
          results: platforms.map((platform) => ({
            platform,
            success: false,
            pending: true,
          })),
          overrides,
          placements,
          tiktokOptions,
          scheduledAt,
          launchDrop,
          pfmExternalId: hasOauthPlatform ? postId : undefined,
        });
        let mediaFiles: StoredMedia[];
        let thumbnailFile: StoredMedia | undefined;
        let instagramCoverFile: StoredMedia | undefined;
        try {
          mediaFiles = await persistMedia(post.id, media);
          if (thumbnail) {
            thumbnailFile = await persistThumbnail(post.id, thumbnail);
          }
          if (cover) {
            instagramCoverFile = await persistCover(post.id, cover);
          }
        } catch (error) {
          // No platform write has started yet, so removing this reservation is
          // safe and lets the same idempotency key be tried again.
          postStore.delete(post.id);
          await Promise.all([
            fsp.rm(join(MEDIA_DIR, post.id), { recursive: true, force: true }),
            fsp.rm(join(THUMBNAIL_DIR, post.id), { recursive: true, force: true }),
            fsp.rm(join(COVER_DIR, post.id), { recursive: true, force: true }),
          ]);
          throw error;
        }
        postStore.update(post.id, { mediaFiles, thumbnailFile, instagramCoverFile });

        try {
          const { results, pfmPostId } = await publish({
            userId: req.user.id,
            socialExternalId: req.user.socialExternalId,
            caption,
            platforms,
            overrides,
            kind,
            media: mediaFiles,
            placements,
            instagramCover: instagramCoverFile,
            tiktokOptions,
            log: app.log,
            scheduledAt,
            providerExternalId: hasOauthPlatform ? postId : undefined,
            onProviderAccepted: (pfmPostId, pfmAccountPlatforms) =>
              postStore.update(post.id, { pfmPostId, pfmAccountPlatforms }),
          });
          postStore.updateResults(post.id, results);
          if (pfmPostId) postStore.update(post.id, { pfmPostId });
        } catch (err) {
          // The outcome of an interrupted provider call may be ambiguous.
          // Preserve "pending" and recover by provider external_id later;
          // never turn this into an automatic second publish.
          app.log.error({ err, postId: post.id }, "Publish outcome unconfirmed");
          const current = postStore.findById(post.id);
          if (current) {
            postStore.updateResults(
              post.id,
              current.results
                .filter((result) => result.pending)
                .map((result) => ({
                  ...result,
                  error:
                    result.error ??
                    "BeamLoop could not confirm this delivery. It will not be sent again automatically.",
                }))
            );
          }
        }

        const stored = postStore.findById(post.id)!;
        const finalUsage = usageForUser(req.user.id);
        return {
          post: publicPost(stored),
          usage: {
            count: finalUsage.postsThisMonth,
            limit: entitlement.limits.postsPerMonth,
            last_reset: finalUsage.resetsAt,
          },
        };
      } finally {
        await cleanup(files);
        inFlightUploads.delete(inFlightKey);
      }
    };

  app.post("/uploads/video", handleUpload("video"));
  app.post("/uploads/photos", handleUpload("photos"));

  // Re-send a post to its failed platforms (or a given subset) using the media
  // persisted at upload time.
  app.post<{ Params: { id: string } }>("/uploads/:id/retry", async (req, reply) => {
    const post = postStore.findById(req.params.id);
    if (!post || post.userId !== req.user.id) {
      return reply.code(404).send({ error: "Post not found" });
    }
    if (!post.mediaFiles || post.mediaFiles.length === 0) {
      return reply.code(409).send({ error: "Media for this post is no longer available" });
    }

    const body = retrySchema.safeParse(req.body ?? {});
    if (!body.success) {
      return reply.code(400).send({ error: body.error.issues[0]?.message });
    }
    if (post.results.some((result) => result.pending)) {
      return reply.code(409).send({
        error:
          "Wait for every channel to finish confirming before retrying a failed one.",
      });
    }
    // Never retry a merely-unconfirmed platform: it may already be live and a
    // retry could create a duplicate. Only explicit provider failures qualify.
    const failed = post.results
      .filter(
        (r) =>
          !r.success &&
          !r.pending &&
          !isReconnectError(r.error)
      )
      .map((r) => r.platform);
    const platforms = [
      ...new Set((body.data.platforms ?? failed) as Platform[]),
    ];
    if (platforms.length === 0) {
      return reply.code(400).send({ error: "Nothing to retry" });
    }
    const invalid = platforms.filter((platform) => !failed.includes(platform));
    if (invalid.length > 0) {
      return reply.code(409).send({
        error: "Only channels with an explicit failure can be retried.",
      });
    }

    // Every retry is a fresh publish attempt against the platform, and the
    // per-account caps are far tighter than our own plan limits: TikTok allows
    // roughly 15-25 posts a day per creator and 6 publish requests a minute,
    // shared across every app the creator uses. A retry button with no ceiling
    // lets a frustrated user hammer those caps and get their account flagged,
    // so cap the attempts and space them out.
    const retryCount = post.retryCount ?? 0;
    if (retryCount >= RETRY_LIMIT) {
      return reply.code(429).send({
        error: `This post has been retried ${RETRY_LIMIT} times already. Reconnect the channel or compose a new post rather than sending it again.`,
        code: "RETRY_LIMIT",
      });
    }
    const waitMs =
      (post.lastRetryAt ? new Date(post.lastRetryAt).getTime() : 0) +
      RETRY_COOLDOWN_MS -
      Date.now();
    if (waitMs > 0) {
      return reply.code(429).send({
        error: `Give the channel a moment — you can retry again in ${Math.ceil(waitMs / 1000)}s.`,
        code: "RETRY_COOLDOWN",
      });
    }
    postStore.update(post.id, {
      retryCount: retryCount + 1,
      lastRetryAt: new Date().toISOString(),
    });

    // Claim this user-approved retry durably before the first external write.
    // A double tap, timeout, or restart will now see "pending" and cannot
    // dispatch the same retry again.
    postStore.updateResults(
      post.id,
      platforms.map((platform) => ({
        platform,
        success: false,
        pending: true,
      }))
    );
    const hasOauthPlatform = platforms.some((platform) =>
      (OAUTH_PLATFORMS as readonly string[]).includes(platform)
    );
    const providerExternalId = hasOauthPlatform
      ? `retry-${randomUUID()}`
      : undefined;
    if (providerExternalId) {
      postStore.update(post.id, {
        pfmExternalId: providerExternalId,
        pfmPostId: undefined,
      });
    }

    try {
      const { results: retried, pfmPostId } = await publish({
        userId: req.user.id,
        socialExternalId: req.user.socialExternalId,
        caption: buildCaption(post.title, post.description),
        platforms,
        overrides: post.overrides ?? {},
        placements: post.placements,
        instagramCover: post.instagramCoverFile,
        tiktokOptions: post.tiktokOptions,
        log: app.log,
        kind: post.kind,
        media: post.mediaFiles,
        providerExternalId,
        onProviderAccepted: (pfmPostId, pfmAccountPlatforms) =>
          postStore.update(post.id, { pfmPostId, pfmAccountPlatforms }),
      });

      postStore.updateResults(post.id, retried);
      if (pfmPostId) postStore.update(post.id, { pfmPostId });
    } catch (err) {
      app.log.error({ err, postId: post.id }, "Retry outcome unconfirmed");
      const current = postStore.findById(post.id);
      if (current) {
        postStore.updateResults(
          post.id,
          current.results
            .filter(
              (result) =>
                result.pending &&
                platforms.includes(result.platform as Platform)
            )
            .map((result) => ({
              ...result,
              error:
                result.error ??
                "BeamLoop could not confirm this delivery. It will not be sent again automatically.",
            }))
        );
      }
    }

    const updated = postStore.findById(post.id);
    return { post: updated ? publicPost(updated) : undefined, usage: null };
  });

  // Cancel a future post. Provider-side OAuth scheduling and our local manual
  // queue are both cleared before removing the local record and retained media.
  app.delete<{ Params: { id: string } }>("/uploads/:id", async (req, reply) => {
    const post = postStore.findById(req.params.id);
    if (!post || post.userId !== req.user.id) {
      return reply.code(404).send({ error: "Post not found" });
    }
    if (!post.scheduledAt || new Date(post.scheduledAt).getTime() <= Date.now()) {
      return reply.code(409).send({ error: "Only future scheduled posts can be canceled" });
    }
    if (post.pfmPostId) await postForMe.deletePost(post.pfmPostId);
    postStore.delete(post.id);
    const mediaDirectory = post.mediaFiles?.[0]
      ? dirname(post.mediaFiles[0].path)
      : join(MEDIA_DIR, post.id);
    const thumbnailDirectory = post.thumbnailFile
      ? dirname(post.thumbnailFile.path)
      : join(THUMBNAIL_DIR, post.id);
    const coverDirectory = post.instagramCoverFile
      ? dirname(post.instagramCoverFile.path)
      : join(COVER_DIR, post.id);
    await Promise.all([
      fsp.rm(mediaDirectory, { recursive: true, force: true }),
      fsp.rm(thumbnailDirectory, { recursive: true, force: true }),
      fsp.rm(coverDirectory, { recursive: true, force: true }),
    ]);
    return reply.code(204).send();
  });

  // History previews stay private: the mobile Image request carries the same
  // bearer token as every other BeamLoop API call.
  app.get<{ Params: { id: string } }>("/uploads/:id/thumbnail", async (req, reply) => {
    const post = postStore.findById(req.params.id);
    if (!post || post.userId !== req.user.id) {
      return reply.code(404).send({ error: "Post not found" });
    }
    const thumbnail = post.thumbnailFile;
    if (!thumbnail) {
      return reply.code(404).send({ error: "Thumbnail not found" });
    }
    try {
      await fsp.access(thumbnail.path);
    } catch {
      return reply.code(404).send({ error: "Thumbnail not found" });
    }
    return reply
      .type(thumbnail.mimetype)
      .header("Cache-Control", "private, max-age=86400")
      .send(createReadStream(thumbnail.path));
  });

  // Focused status lookup used by the live result screen. Provider refreshes
  // remain throttled, while webhook-confirmed results return immediately.
  app.get<{ Params: { id: string } }>("/uploads/:id", async (req, reply) => {
    const post = postStore.findById(req.params.id);
    if (!post || post.userId !== req.user.id) {
      return reply.code(404).send({ error: "Post not found" });
    }
    await refreshPending(req.user.id, req.user.socialExternalId, app.log).catch((err) =>
      app.log.warn({ err, postId: post.id }, "Provider status refresh failed")
    );
    const updated = postStore.findById(post.id);
    return { post: updated ? publicPost(updated) : publicPost(post) };
  });

  // History returns stored posts (media paths stripped — server-side only).
  // First refresh any still-"pending" async results so they resolve to
  // success/failure once the platforms finish publishing.
  app.get("/uploads/history", async (req) => {
    await refreshPending(req.user.id, req.user.socialExternalId, app.log).catch((err) =>
      app.log.warn({ err }, "Provider status refresh failed")
    );
    const { limits } = subscriptionStore.entitlementForUser(req.user.id);
    const cutoff = limits.historyDays
      ? Date.now() - limits.historyDays * 24 * 60 * 60 * 1000
      : null;
    return {
      posts: postStore
        .listByUser(req.user.id)
        .filter(
          (post) => cutoff === null || new Date(post.createdAt).getTime() >= cutoff
        )
        .map(publicPost),
    };
  });
}
