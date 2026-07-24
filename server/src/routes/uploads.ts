import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { createWriteStream, openAsBlob, promises as fsp } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import { postStore, type PostRecord, type StoredMedia } from "../lib/posts.js";
import { MEDIA_DIR } from "../lib/paths.js";
import {
  OAUTH_PLATFORMS,
  MANUAL_PLATFORMS,
  type Platform,
  type PlatformResult,
} from "../lib/platforms.js";
import { config } from "../config.js";
import {
  postForMe,
  type PfmPlatform,
  type PfmPlatformConfig,
  type PfmFeedPost,
  type PfmPostResult,
} from "../lib/postForMe.js";
import {
  manualStore,
  ManualDeliveryError,
  postToDiscord,
  postToTelegram,
  type DiscordCredentials,
  type TelegramCredentials,
  type MediaFile,
} from "../lib/manualConnections.js";

const ALL_PLATFORMS = [...OAUTH_PLATFORMS, ...MANUAL_PLATFORMS] as const;

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
  // Fail before a potentially large media upload reaches the destination.
  // The direct APIs would otherwise truncate Discord/Telegram silently.
  const limits: Partial<Record<Platform, number>> = {
    x: 280,
    discord: 2000,
    telegram: 1024,
  };
  for (const platform of platforms) {
    const limit = limits[platform];
    const effectiveCaption = overrides[platform] || caption;
    if (limit && effectiveCaption.length > limit) {
      return `${platform === "x" ? "X" : platform[0]!.toUpperCase() + platform.slice(1)} captions must be ${limit} characters or fewer`;
    }
  }
  return undefined;
}

function publicPost(post: PostRecord) {
  const {
    userId: _userId,
    mediaFiles: _mediaFiles,
    idempotencyKey: _idempotencyKey,
    pfmPostId: _pfmPostId,
    pfmExternalId: _pfmExternalId,
    pfmAccountPlatforms: _pfmAccountPlatforms,
    ...safe
  } = post;
  return safe;
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

// Publish one post to the chosen platforms and return a normalized per-platform
// result array. OAuth platforms go through Post for Me; Discord/Telegram are
// posted to directly.
async function publish(opts: {
  userId: string;
  socialExternalId?: string;
  caption: string;
  platforms: Platform[];
  overrides: Record<string, string>;
  kind: "video" | "photos";
  media: MediaFile[];
  placements?: Record<string, "timeline" | "reels" | "stories">;
  scheduledAt?: string;
  providerExternalId?: string;
  onManualDispatch?: (platform: Platform, attemptedAt: string) => void;
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
    scheduledAt,
    providerExternalId,
    onManualDispatch,
    onProviderAccepted,
  } = opts;
  const results: Array<{ platform: string } & PlatformResult> = [];
  let pfmPostId: string | undefined;

  const oauthPlatforms = platforms.filter((p): p is PfmPlatform =>
    (OAUTH_PLATFORMS as readonly string[]).includes(p)
  );
  const manualPlatforms = platforms.filter((p) =>
    (MANUAL_PLATFORMS as readonly string[]).includes(p)
  );

  // --- OAuth platforms via Post for Me ---
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
        // TikTok requires a privacy level on every post.
        if (p === "tiktok") cfg.privacy_status = config.TIKTOK_PRIVACY;
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

  // --- Discord / Telegram: direct sends ---
  const manualResults = await Promise.all(
    manualPlatforms.map(async (p) => {
      const text = overrides[p] || caption;
      if (scheduledAt) {
        return { platform: p, success: false, pending: true };
      }
      const attemptedAt = new Date().toISOString();
      onManualDispatch?.(p, attemptedAt);
      try {
        if (p === "discord") {
          const stored = manualStore.get<DiscordCredentials>(userId, "discord");
          if (!stored) throw new Error("Discord not connected");
          await postToDiscord(stored.credentials.webhook_url, text, media);
        } else {
          const stored = manualStore.get<TelegramCredentials>(userId, "telegram");
          if (!stored) throw new Error("Telegram not connected");
          await postToTelegram(
            stored.credentials.bot_token,
            stored.credentials.chat_id,
            text,
            media,
            kind
          );
        }
        return { platform: p, success: true };
      } catch (e) {
        if (e instanceof ManualDeliveryError && e.outcome === "unknown") {
          return {
            platform: p,
            success: false,
            pending: true,
            attemptedAt,
            error: e.message,
          };
        }
        return {
          platform: p,
          success: false,
          error: e instanceof Error ? e.message : "Send failed",
        };
      }
    })
  );
  results.push(...manualResults);

  return { results, pfmPostId };
}

const PENDING_REFRESH_MIN_MS = 10_000;
const pendingRefreshAt = new Map<string, number>();

// Re-fetch async results for posts still showing "pending" and merge them in,
// so History self-heals once the platforms finish publishing. Calls are
// throttled per user and all pending provider post ids are fetched in one
// request.
async function refreshPending(userId: string, socialExternalId = userId): Promise<void> {
  const now = Date.now();
  const lastRefresh = pendingRefreshAt.get(userId) ?? 0;
  if (now - lastRefresh < PENDING_REFRESH_MIN_MS) return;
  pendingRefreshAt.set(userId, now);

  const posts = postStore
    .listByUser(userId)
    .filter(
      (p) =>
        (!p.scheduledAt || new Date(p.scheduledAt).getTime() <= now) &&
        p.results.some(
          (r) =>
            r.pending &&
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
    if (updated.length > 0) postStore.updateResults(post.id, updated);
  }
}

const scheduledInFlight = new Set<string>();

function markManualDispatch(postId: string, platform: Platform, attemptedAt: string) {
  const post = postStore.findById(postId);
  const current = post?.results.find((result) => result.platform === platform);
  if (!current) return;
  postStore.updateResults(postId, [{ ...current, attemptedAt }]);
}

// Post for Me durably holds OAuth posts until their scheduled time. Discord
// and Telegram are direct integrations, so this small durable worker picks up
// their pending deliveries from SQLite and also catches up after a restart.
async function publishDueManualPosts(app: FastifyInstance): Promise<void> {
  const due = postStore.listScheduledDue(new Date().toISOString());
  for (const post of due) {
    const platforms = post.results
      .filter(
        (result) =>
          result.pending &&
          !result.attemptedAt &&
          (MANUAL_PLATFORMS as readonly string[]).includes(result.platform)
      )
      .map((result) => result.platform as Platform);
    if (platforms.length === 0 || scheduledInFlight.has(post.id)) continue;
    scheduledInFlight.add(post.id);
    try {
      if (!post.mediaFiles?.length) {
        postStore.updateResults(
          post.id,
          platforms.map((platform) => ({
            platform,
            success: false,
            error: "Scheduled media is no longer available",
          }))
        );
        continue;
      }
      const { results } = await publish({
        userId: post.userId,
        caption: buildCaption(post.title, post.description),
        platforms,
        overrides: post.overrides ?? {},
        placements: post.placements,
        kind: post.kind,
        media: post.mediaFiles,
        onManualDispatch: (platform, attemptedAt) =>
          markManualDispatch(post.id, platform, attemptedAt),
      });
      postStore.updateResults(post.id, results);
    } catch (err) {
      app.log.error({ err, postId: post.id }, "Scheduled manual delivery failed");
    } finally {
      scheduledInFlight.delete(post.id);
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

  const sendDue = () =>
    publishDueManualPosts(app).catch((err) =>
      app.log.error({ err }, "Scheduled delivery scan failed")
    );
  sendDue();
  // A one-second cadence keeps direct community channels close to the exact
  // provider-managed OAuth launch time without busy-waiting.
  const scheduleTimer = setInterval(sendDue, 1_000);
  scheduleTimer.unref();

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
      if (previous) return { post: publicPost(previous), usage: null };

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

        const { title, description, platforms } = parsed.data;
        const overrides = parseOverrides(fields);
        const placements = parsePlacements(fields);
        const scheduledAt = parsed.data.scheduledAt;
        const launchDrop = parsed.data.launchDrop;
        if (scheduledAt) {
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
          scheduledAt,
          launchDrop,
          pfmExternalId: hasOauthPlatform ? postId : undefined,
        });
        let mediaFiles: StoredMedia[];
        try {
          mediaFiles = await persistMedia(post.id, media);
        } catch (error) {
          // No platform write has started yet, so removing this reservation is
          // safe and lets the same idempotency key be tried again.
          postStore.delete(post.id);
          throw error;
        }
        postStore.update(post.id, { mediaFiles });

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
            scheduledAt,
            providerExternalId: hasOauthPlatform ? postId : undefined,
            onProviderAccepted: (pfmPostId, pfmAccountPlatforms) =>
              postStore.update(post.id, { pfmPostId, pfmAccountPlatforms }),
            onManualDispatch: (platform, attemptedAt) =>
              markManualDispatch(post.id, platform, attemptedAt),
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
        return { post: publicPost(stored), usage: null };
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
      .filter((r) => !r.success && !r.pending)
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
        kind: post.kind,
        media: post.mediaFiles,
        providerExternalId,
        onProviderAccepted: (pfmPostId, pfmAccountPlatforms) =>
          postStore.update(post.id, { pfmPostId, pfmAccountPlatforms }),
        onManualDispatch: (platform, attemptedAt) =>
          markManualDispatch(post.id, platform, attemptedAt),
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
    const directory = post.mediaFiles?.[0]
      ? join(post.mediaFiles[0].path, "..")
      : join(MEDIA_DIR, post.id);
    await fsp.rm(directory, { recursive: true, force: true });
    return reply.code(204).send();
  });

  // Focused status lookup used by the live result screen. Provider refreshes
  // remain throttled, while webhook-confirmed results return immediately.
  app.get<{ Params: { id: string } }>("/uploads/:id", async (req, reply) => {
    const post = postStore.findById(req.params.id);
    if (!post || post.userId !== req.user.id) {
      return reply.code(404).send({ error: "Post not found" });
    }
    await refreshPending(req.user.id, req.user.socialExternalId).catch((err) =>
      app.log.warn({ err, postId: post.id }, "Provider status refresh failed")
    );
    const updated = postStore.findById(post.id);
    return { post: updated ? publicPost(updated) : publicPost(post) };
  });

  // History returns stored posts (media paths stripped — server-side only).
  // First refresh any still-"pending" async results so they resolve to
  // success/failure once the platforms finish publishing.
  app.get("/uploads/history", async (req) => {
    await refreshPending(req.user.id, req.user.socialExternalId).catch((err) =>
      app.log.warn({ err }, "Provider status refresh failed")
    );
    return {
      posts: postStore
        .listByUser(req.user.id)
        .map(publicPost),
    };
  });
}
