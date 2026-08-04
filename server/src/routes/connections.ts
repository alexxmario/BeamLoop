import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { postForMe, type PfmPlatform, PFM_PLATFORMS } from "../lib/postForMe.js";
import { postStore } from "../lib/posts.js";
import {
  OAUTH_PLATFORMS,
  isComingSoon,
  isReconnectError,
  type Platform,
} from "../lib/platforms.js";
import { subscriptionStore } from "../lib/plans.js";
import { isTikTokConfigured, tiktok } from "../lib/tiktok.js";
import { accessTokenForUser, tiktokAccountStore } from "../lib/tiktokAccounts.js";
import { signTikTokState } from "./tiktokAuth.js";

const linkSchema = z.object({
  platforms: z.array(z.enum(OAUTH_PLATFORMS)).optional(),
});

const platformSchema = z.enum(OAUTH_PLATFORMS);

export default async function connectionRoutes(app: FastifyInstance) {
  app.addHook("preHandler", (req, reply) => app.requireAuth(req, reply));

  async function connectionLimitReached(
    userId: string,
    socialExternalId: string,
    targetPlatform?: Platform
  ) {
    const entitlement = subscriptionStore.entitlementForUser(userId);
    // A Post for Me outage must not block connecting TikTok, which doesn't
    // involve them. Counting what we can and allowing the connect is the safe
    // failure: the channel limit is enforced again at publish time, so the
    // worst case is one channel over for a while, not a bypass.
    let connected = new Set<string>();
    try {
      const accounts = await postForMe.listAccounts(socialExternalId);
      connected = new Set(
        accounts
          .filter((account) => account.status === "connected")
          .map((account) => account.platform)
      );
    } catch (err) {
      app.log.warn({ err, userId }, "Counting provider channels failed; allowing connect");
      return false;
    }
    // TikTok is ours, not Post for Me's, so it has to be counted separately or
    // it would be free of the plan's channel limit.
    if (tiktokAccountStore.find(userId)) connected.add("tiktok");
    // Reconnecting a channel already connected never counts as a new one.
    if (targetPlatform && connected.has(targetPlatform)) return false;
    return connected.size >= entitlement.limits.channels;
  }

  // Names the limit and the way out. Pro includes every platform we support, so
  // its branch is effectively unreachable — but "upgrade" must never be
  // suggested to someone already on the top plan.
  function channelLimitError(userId: string) {
    const { plan, limits } = subscriptionStore.entitlementForUser(userId);
    return {
      error:
        plan === "pro"
          ? `Your plan includes all ${limits.channels} channels. Disconnect one to connect a different account.`
          : `Your plan includes ${limits.channels} channels. Disconnect one, or upgrade to connect more.`,
      code: "PLAN_LIMIT",
    };
  }

  // Current connection status for every platform we support, from Post for Me
  // (scoped by external_id = our user id).
  app.get("/connections", async (req) => {
    const accounts = await postForMe.listAccounts(req.user.socialExternalId);
    const byPlatform = new Map(
      accounts.filter((a) => a.status === "connected").map((a) => [a.platform, a])
    );
    const latestResultByPlatform = new Map<
      string,
      { success: boolean; pending?: boolean; error?: string; accountId?: string }
    >();
    for (const post of postStore.listByUser(req.user.id)) {
      for (const result of post.results) {
        if (!latestResultByPlatform.has(result.platform)) {
          const accountId = Object.entries(post.pfmAccountPlatforms ?? {}).find(
            ([, platform]) => platform === result.platform
          )?.[0];
          latestResultByPlatform.set(result.platform, { ...result, accountId });
        }
      }
    }

    const tiktokAccount = tiktokAccountStore.find(req.user.id);

    const oauth = OAUTH_PLATFORMS.map((platform) => {
      // TikTok is integrated directly; its connection lives in our database
      // rather than in Post for Me's account list.
      if (platform === "tiktok") {
        return {
          platform,
          connected: Boolean(tiktokAccount),
          needsReconnect: false,
          statusMessage: isTikTokConfigured()
            ? undefined
            : "TikTok isn't available yet.",
          details: tiktokAccount
            ? {
                username: tiktokAccount.username,
                display_name: tiktokAccount.displayName,
                social_images: tiktokAccount.avatarUrl,
              }
            : null,
        };
      }
      const acc = byPlatform.get(platform);
      const latest = latestResultByPlatform.get(platform);
      const needsReconnect = Boolean(
        acc &&
          latest &&
          !latest.success &&
          !latest.pending &&
          (!latest.accountId || latest.accountId === acc.id) &&
          isReconnectError(latest.error)
      );
      return {
        platform,
        connected: Boolean(acc) && !needsReconnect,
        needsReconnect,
        statusMessage: needsReconnect
          ? "This account is unavailable. Remove or reconnect it."
          : undefined,
        details: acc
          ? { username: acc.username ?? undefined, social_images: acc.profile_photo_url ?? undefined }
          : null,
      };
    });

    return { connections: oauth };
  });

  // Generate the headless connect URL for a single OAuth platform. Kept the
  // `access_url` field name so the mobile client is unchanged.
  app.post("/connections/link", async (req, reply) => {
    const body = linkSchema.safeParse(req.body ?? {});
    if (!body.success) {
      return reply.code(400).send({ error: body.error.issues[0]?.message });
    }
    const platform = (body.data.platforms ?? []).find((p): p is PfmPlatform =>
      (PFM_PLATFORMS as readonly string[]).includes(p)
    );
    if (!platform) {
      return reply.code(400).send({ error: "Pick one OAuth platform to connect" });
    }
    // Minting an auth URL for these succeeds, but the grant always fails at the
    // platform — fail fast instead of handing back a link that dead-ends.
    if (isComingSoon(platform)) {
      return reply
        .code(400)
        .send({ error: "This channel isn't available yet.", code: "COMING_SOON" });
    }
    if (
      await connectionLimitReached(
        req.user.id,
        req.user.socialExternalId,
        platform
      )
    ) {
      return reply.code(403).send(channelLimitError(req.user.id));
    }

    if (platform === "tiktok") {
      if (!isTikTokConfigured()) {
        return reply
          .code(503)
          .send({ error: "TikTok isn't available yet.", code: "COMING_SOON" });
      }
      // Our own consent URL, so the screen names BeamLoop. The signed state
      // identifies the user when TikTok redirects a browser back to us.
      return {
        access_url: tiktok.authorizeUrl(signTikTokState(req.user.id)),
        duration: "",
      };
    }

    const { url } = await postForMe.createAuthUrl(req.user.socialExternalId, platform);
    return { access_url: url, duration: "" };
  });

  /**
   * The creator's live TikTok posting permissions, for the composer.
   *
   * TikTok requires the posting screen to reflect this: the privacy options
   * offered must be the ones returned here, and an interaction the creator has
   * turned off in their TikTok settings must not be offerable. Queried on each
   * open rather than cached, because that is what their rules ask for.
   */
  app.get("/connections/tiktok/creator", async (req, reply) => {
    const accessToken = await accessTokenForUser(req.user.id, req.log);
    if (!accessToken) {
      return reply
        .code(409)
        .send({ error: "Connect TikTok to post to it.", code: "NOT_CONNECTED" });
    }
    try {
      const info = await tiktok.creatorInfo(accessToken);
      tiktokAccountStore.saveProfile(req.user.id, {
        username: info.creator_username,
        displayName: info.creator_nickname,
        avatarUrl: info.creator_avatar_url,
      });
      return {
        creator: {
          username: info.creator_username,
          nickname: info.creator_nickname,
          avatarUrl: info.creator_avatar_url,
        },
        privacyOptions: info.privacy_level_options,
        commentDisabled: info.comment_disabled,
        duetDisabled: info.duet_disabled,
        stitchDisabled: info.stitch_disabled,
        maxVideoDurationSec: info.max_video_post_duration_sec,
      };
    } catch (err) {
      req.log.warn({ err, userId: req.user.id }, "TikTok creator info lookup failed");
      return reply.code(502).send({
        error: "BeamLoop couldn't reach TikTok just now. Try again in a moment.",
      });
    }
  });

  // Remove one connection without requiring the user to delete their whole
  // BeamLoop account. The account is explicitly disconnected at the provider.
  app.delete<{ Params: { platform: string } }>("/connections/:platform", async (req, reply) => {
    const parsed = platformSchema.safeParse(req.params.platform);
    if (!parsed.success) return reply.code(404).send({ error: "Unknown platform" });
    const platform = parsed.data;

    if (platform === "tiktok") {
      // Revoke at TikTok first so the grant is gone even if our own row
      // somehow survives; a failure there must not strand the local record.
      const token = tiktokAccountStore.rawAccessToken(req.user.id);
      if (token) {
        await tiktok.revoke(token).catch((err) => {
          req.log.warn({ err, userId: req.user.id }, "Revoking the TikTok token failed");
        });
      }
      tiktokAccountStore.delete(req.user.id);
      return { success: true };
    }

    const accounts = await postForMe.listAccounts(req.user.socialExternalId);
    const matching = accounts.filter((account) => account.platform === platform);
    await Promise.all(matching.map((account) => postForMe.disconnectAccount(account.id)));
    return { success: true };
  });
}
