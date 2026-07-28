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
    const accounts = await postForMe.listAccounts(socialExternalId);
    const oauthCount = new Set(
      accounts
        .filter((account) => account.status === "connected")
        .map((account) => account.platform)
    ).size;
    if (
      targetPlatform &&
      accounts.some(
        (account) =>
          account.status === "connected" && account.platform === targetPlatform
      )
    ) {
      return false;
    }
    return (
oauthCount >= entitlement.limits.channels
    );
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

    const oauth = OAUTH_PLATFORMS.map((platform) => {
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

    const { url } = await postForMe.createAuthUrl(req.user.socialExternalId, platform);
    return { access_url: url, duration: "" };
  });

  // Remove one connection without requiring the user to delete their whole
  // BeamLoop account. The account is explicitly disconnected at the provider.
  app.delete<{ Params: { platform: string } }>("/connections/:platform", async (req, reply) => {
    const parsed = platformSchema.safeParse(req.params.platform);
    if (!parsed.success) return reply.code(404).send({ error: "Unknown platform" });
    const platform = parsed.data;

    const accounts = await postForMe.listAccounts(req.user.socialExternalId);
    const matching = accounts.filter((account) => account.platform === platform);
    await Promise.all(matching.map((account) => postForMe.disconnectAccount(account.id)));
    return { success: true };
  });
}
