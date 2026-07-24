import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { postForMe } from "../lib/postForMe.js";
import { postStore } from "../lib/posts.js";
import { OAUTH_PLATFORMS, type Platform } from "../lib/platforms.js";

const envelopeSchema = z.object({
  event_type: z.string(),
  data: z.unknown(),
});

const resultSchema = z.object({
  post_id: z.string(),
  social_account_id: z.string(),
  success: z.boolean(),
  error: z.unknown().optional(),
  platform_data: z
    .object({
      id: z.string().optional(),
      url: z.string().optional(),
    })
    .nullable()
    .optional(),
});

function secureEquals(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function extractResult(data: unknown) {
  const direct = resultSchema.safeParse(data);
  if (direct.success) return direct.data;
  if (!data || typeof data !== "object") return undefined;
  const wrapped = data as Record<string, unknown>;
  for (const key of ["result", "social_post_result"]) {
    const parsed = resultSchema.safeParse(wrapped[key]);
    if (parsed.success) return parsed.data;
  }
  return undefined;
}

function errorText(error: unknown): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Publishing failed";
}

export default async function webhookRoutes(app: FastifyInstance) {
  let activeSecret = config.POSTFORME_WEBHOOK_SECRET;
  const webhookUrl = new URL("/webhooks/post-for-me", config.PUBLIC_BASE_URL).toString();
  const eventTypes = ["social.post.result.created"];

  const ensureWebhook = async () => {
    if (config.POSTFORME_WEBHOOK_SECRET) return;
    const webhooks = await postForMe.listWebhooks();
    const existing = webhooks.find((webhook) => webhook.url === webhookUrl);
    const webhook =
      existing ?? (await postForMe.createWebhook(webhookUrl, eventTypes));
    activeSecret = webhook.secret;
    app.log.info(
      { webhookId: webhook.id, created: !existing },
      "Post for Me confirmation webhook is ready"
    );
  };

  // The API key can securely recover the generated webhook secret after a
  // restart. An explicit env secret still takes precedence and skips this
  // provider call.
  if (!activeSecret) {
    void ensureWebhook().catch((err) =>
      app.log.error({ err }, "Could not configure Post for Me webhook")
    );
  }

  app.post("/webhooks/post-for-me", async (req, reply) => {
    if (!activeSecret) {
      app.log.error("Post for Me webhook secret is not ready");
      return reply.code(503).send({ error: "Webhook is not configured" });
    }

    const rawSecret = req.headers["post-for-me-webhook-secret"];
    const suppliedSecret = Array.isArray(rawSecret) ? rawSecret[0] : rawSecret;
    if (!suppliedSecret || !secureEquals(suppliedSecret, activeSecret)) {
      return reply.code(401).send({ error: "Invalid webhook secret" });
    }

    const envelope = envelopeSchema.safeParse(req.body);
    if (!envelope.success) {
      return reply.code(400).send({ error: "Invalid webhook payload" });
    }
    if (envelope.data.event_type !== "social.post.result.created") {
      return reply.code(204).send();
    }

    const result = extractResult(envelope.data.data);
    if (!result) {
      app.log.warn({ eventType: envelope.data.event_type }, "Webhook result payload was invalid");
      return reply.code(400).send({ error: "Invalid result payload" });
    }

    const post = postStore.findByPfmPostId(result.post_id);
    if (!post) {
      // The post may have been deleted locally. Acknowledging avoids a day of
      // retries; the polling fallback handles the narrow acceptance race.
      app.log.warn({ pfmPostId: result.post_id }, "Webhook post was not found");
      return reply.code(202).send();
    }

    let platform = post.pfmAccountPlatforms?.[result.social_account_id];
    if (!platform) {
      const account = await postForMe.getAccount(result.social_account_id);
      platform = account.platform;
    }
    if (!(OAUTH_PLATFORMS as readonly string[]).includes(platform)) {
      app.log.warn(
        { pfmPostId: result.post_id, platform },
        "Webhook result used an unsupported platform"
      );
      return reply.code(202).send();
    }

    let confirmed = {
      platform: platform as Platform,
      success: result.success,
      url: result.platform_data?.url,
      post_id: result.platform_data?.id,
      error: result.success ? undefined : errorText(result.error),
    };
    if (!confirmed.success) {
      try {
        const feed = await postForMe.listAccountFeed(result.social_account_id);
        const live = feed.find((entry) => entry.social_post_id === result.post_id);
        if (live?.platform_post_id || live?.platform_url) {
          confirmed = {
            platform: platform as Platform,
            success: true,
            url: live.platform_url,
            post_id: live.platform_post_id,
            error: undefined,
          };
        }
      } catch {
        // The explicit result still applies when the feed is unavailable.
      }
    }

    postStore.updateResults(post.id, [confirmed]);
    app.log.info(
      { postId: post.id, platform, success: confirmed.success },
      "Post result confirmed by webhook"
    );
    return reply.code(204).send();
  });
}
