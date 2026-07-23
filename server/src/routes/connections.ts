import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { postForMe, type PfmPlatform, PFM_PLATFORMS } from "../lib/postForMe.js";
import {
  manualStore,
  validateDiscordWebhook,
  validateTelegramCredentials,
} from "../lib/manualConnections.js";
import { OAUTH_PLATFORMS, MANUAL_PLATFORMS, type Platform } from "../lib/platforms.js";

const linkSchema = z.object({
  platforms: z.array(z.enum([...OAUTH_PLATFORMS, ...MANUAL_PLATFORMS])).optional(),
});

const discordSchema = z.object({
  webhook_url: z
    .string()
    .url()
    .refine((u) => u.startsWith("https://discord.com/api/webhooks/"), {
      message: "Must be a Discord webhook URL",
    }),
  name: z.string().max(100).optional(),
});

const telegramSchema = z.object({
  bot_token: z.string().min(10),
  chat_id: z.string().min(1),
  name: z.string().max(100).optional(),
});

const platformSchema = z.enum([...OAUTH_PLATFORMS, ...MANUAL_PLATFORMS]);

export default async function connectionRoutes(app: FastifyInstance) {
  app.addHook("preHandler", (req, reply) => app.requireAuth(req, reply));

  // Current connection status for every platform we support. OAuth platforms
  // come from Post for Me (scoped by external_id = our user id); Discord &
  // Telegram from our own credential store.
  app.get("/connections", async (req) => {
    const accounts = await postForMe.listAccounts(req.user.id);
    const byPlatform = new Map(
      accounts.filter((a) => a.status === "connected").map((a) => [a.platform, a])
    );

    const oauth = OAUTH_PLATFORMS.map((platform) => {
      const acc = byPlatform.get(platform);
      return {
        platform,
        connected: Boolean(acc),
        details: acc
          ? { username: acc.username ?? undefined, social_images: acc.profile_photo_url ?? undefined }
          : null,
        connectVia: "oauth" as const,
      };
    });

    const manual = MANUAL_PLATFORMS.map((platform) => {
      const stored = manualStore.get(req.user.id, platform);
      return {
        platform,
        connected: Boolean(stored),
        details: stored?.name ? { display_name: stored.name } : null,
        connectVia: "manual" as const,
      };
    });

    return { connections: [...oauth, ...manual] };
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

    const { url } = await postForMe.createAuthUrl(req.user.id, platform);
    return { access_url: url, duration: "" };
  });

  // Discord: the user pastes a channel webhook URL, which we store.
  app.post("/connections/discord", async (req, reply) => {
    const body = discordSchema.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.issues[0]?.message });
    }
    try {
      await validateDiscordWebhook(body.data.webhook_url);
    } catch {
      return reply.code(400).send({ error: "Discord could not verify that webhook" });
    }
    manualStore.set(req.user.id, "discord", { webhook_url: body.data.webhook_url }, body.data.name);
    return { success: true, message: "Discord connected" };
  });

  // Telegram: the user pastes a bot token + chat id, which we store.
  app.post("/connections/telegram", async (req, reply) => {
    const body = telegramSchema.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.issues[0]?.message });
    }
    try {
      await validateTelegramCredentials(body.data.bot_token, body.data.chat_id);
    } catch {
      return reply.code(400).send({ error: "Telegram could not verify that bot and chat" });
    }
    manualStore.set(
      req.user.id,
      "telegram",
      { bot_token: body.data.bot_token, chat_id: body.data.chat_id },
      body.data.name
    );
    return { success: true, message: "Telegram connected" };
  });

  // Remove one connection without requiring the user to delete their whole
  // BeamLoop account. Manual credentials are removed locally; OAuth accounts
  // are explicitly disconnected at the provider.
  app.delete<{ Params: { platform: string } }>("/connections/:platform", async (req, reply) => {
    const parsed = platformSchema.safeParse(req.params.platform);
    if (!parsed.success) return reply.code(404).send({ error: "Unknown platform" });
    const platform = parsed.data;

    if ((MANUAL_PLATFORMS as readonly string[]).includes(platform)) {
      manualStore.delete(req.user.id, platform as (typeof MANUAL_PLATFORMS)[number]);
      return { success: true };
    }

    const accounts = await postForMe.listAccounts(req.user.id);
    const matching = accounts.filter((account) => account.platform === platform);
    await Promise.all(matching.map((account) => postForMe.disconnectAccount(account.id)));
    return { success: true };
  });
}
