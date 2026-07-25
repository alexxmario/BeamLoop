import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { openAsBlob } from "node:fs";
import { stat } from "node:fs/promises";
import { db } from "./db.js";
import { config } from "../config.js";

/**
 * Discord & Telegram don't use OAuth and aren't handled by Post for Me, so we
 * store their credentials ourselves and post to them directly:
 *   - Discord: a channel webhook URL (POST the message + files to it).
 *   - Telegram: a bot token + chat id (Bot API sendVideo/sendPhoto).
 */

export interface DiscordCredentials {
  webhook_url: string;
}
export interface TelegramCredentials {
  bot_token: string;
  chat_id: string;
}
export type ManualPlatform = "discord" | "telegram";

// A failed HTTP response is an explicit rejection and can be offered for a
// user-initiated retry. A transport failure is ambiguous: the platform may
// have accepted the write before the connection dropped, so it must never be
// retried automatically.
export class ManualDeliveryError extends Error {
  constructor(
    message: string,
    public readonly outcome: "rejected" | "unknown"
  ) {
    super(message);
    this.name = "ManualDeliveryError";
  }
}

interface StoredRow {
  credentials: string;
  name: string | null;
}

const ENCRYPTION_PREFIX = "v1";
const encryptionKey = createHash("sha256").update(config.APP_JWT_SECRET).digest();

function encrypt(credentials: object): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(credentials), "utf8"),
    cipher.final(),
  ]);
  return [
    ENCRYPTION_PREFIX,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

function decrypt<T>(stored: string): { credentials: T; legacy: boolean } {
  if (!stored.startsWith(`${ENCRYPTION_PREFIX}:`)) {
    return { credentials: JSON.parse(stored) as T, legacy: true };
  }
  const [, ivText, tagText, encryptedText] = stored.split(":");
  if (!ivText || !tagText || !encryptedText) throw new Error("Invalid encrypted credentials");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey, Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  return { credentials: JSON.parse(plaintext) as T, legacy: false };
}

export interface MediaFile {
  path: string;
  filename: string;
  mimetype: string;
  truncated?: boolean;
}

export const manualStore = {
  set(userId: string, platform: ManualPlatform, credentials: object, name?: string) {
    db.prepare(
      `INSERT INTO manual_connections (userId, platform, credentials, name, createdAt)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(userId, platform) DO UPDATE SET
         credentials = excluded.credentials, name = excluded.name`
    ).run(userId, platform, encrypt(credentials), name ?? null, new Date().toISOString());
  },

  get<T extends object = Record<string, string>>(
    userId: string,
    platform: ManualPlatform
  ): { credentials: T; name: string | null } | undefined {
    const row = db
      .prepare("SELECT credentials, name FROM manual_connections WHERE userId = ? AND platform = ?")
      .get(userId, platform) as StoredRow | undefined;
    if (!row) return undefined;
    const decoded = decrypt<T>(row.credentials);
    // Read-time migration keeps existing local installations working while
    // ensuring every subsequently used credential is encrypted at rest.
    if (decoded.legacy) this.set(userId, platform, decoded.credentials, row.name ?? undefined);
    return { credentials: decoded.credentials, name: row.name };
  },

  delete(userId: string, platform: ManualPlatform) {
    db.prepare("DELETE FROM manual_connections WHERE userId = ? AND platform = ?").run(
      userId,
      platform
    );
  },

  deleteAll(userId: string) {
    db.prepare("DELETE FROM manual_connections WHERE userId = ?").run(userId);
  },
};

// Connect-time checks run while the user waits on a form, so they get a much
// shorter leash than a publish.
const VALIDATE_TIMEOUT_MS = 15_000;
const validateInit = { signal: AbortSignal.timeout(VALIDATE_TIMEOUT_MS) };

export async function validateDiscordWebhook(webhookUrl: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(webhookUrl, validateInit);
  } catch {
    throw new Error("Couldn't reach Discord to verify that webhook");
  }
  if (!response.ok) throw new Error("Discord could not verify that webhook");
}

export async function validateTelegramCredentials(
  botToken: string,
  chatId: string
): Promise<void> {
  const api = (method: string) =>
    `https://api.telegram.org/bot${botToken}/${method}?chat_id=${encodeURIComponent(chatId)}`;
  let me: Response;
  let chat: Response;
  try {
    me = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, validateInit);
    chat = await fetch(api("getChat"), validateInit);
  } catch {
    throw new Error("Couldn't reach Telegram to verify that bot");
  }
  const meJson = (await me.json().catch(() => ({}))) as { ok?: boolean };
  const chatJson = (await chat.json().catch(() => ({}))) as { ok?: boolean };
  if (!me.ok || !chat.ok || !meJson.ok || !chatJson.ok) {
    throw new Error("Telegram could not verify that bot and chat");
  }
}

// ------------------------------------------------------------------ senders

// We accept uploads far larger than either platform will take: Discord
// webhooks cap at 10 MB unless the server is boosted, and Telegram bots cap at
// 50 MB of video and 10 MB per photo. Checking up front turns an opaque 413
// from the platform into a message that names the actual limit.
const DISCORD_MAX_BYTES = 10 * 1024 * 1024;
const TELEGRAM_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
const TELEGRAM_PHOTO_MAX_BYTES = 10 * 1024 * 1024;

// Neither platform should be able to hang a publish indefinitely.
const SEND_TIMEOUT_MS = 120_000;

const asMb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);

async function assertWithinLimit(
  media: MediaFile[],
  perFileMax: number,
  platform: string
): Promise<void> {
  let total = 0;
  for (const file of media) {
    const { size } = await stat(file.path);
    total += size;
    if (size > perFileMax) {
      throw new ManualDeliveryError(
        `${file.filename} is ${asMb(size)} MB. ${platform} accepts up to ${asMb(perFileMax)} MB.`,
        "rejected"
      );
    }
  }
  // Discord counts every attachment in one request against the same ceiling.
  if (platform === "Discord" && total > perFileMax) {
    throw new ManualDeliveryError(
      `These files total ${asMb(total)} MB. Discord accepts up to ${asMb(perFileMax)} MB per message.`,
      "rejected"
    );
  }
}

// Discord: one multipart POST to the webhook with the caption + attachments.
export async function postToDiscord(
  webhookUrl: string,
  caption: string,
  media: MediaFile[]
): Promise<void> {
  await assertWithinLimit(media, DISCORD_MAX_BYTES, "Discord");

  const form = new FormData();
  form.append("payload_json", JSON.stringify({ content: caption.slice(0, 2000) }));
  for (const [i, f] of media.entries()) {
    form.append(`files[${i}]`, await openAsBlob(f.path, { type: f.mimetype }), f.filename);
  }
  // Build the URL properly: a webhook may already carry a query string (a
  // thread_id, for instance), and appending "?wait=true" would corrupt it.
  const url = new URL(webhookUrl);
  url.searchParams.set("wait", "true");
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch {
    throw new ManualDeliveryError(
      "Discord may have accepted this post, but BeamLoop could not confirm it. It will not be sent again automatically.",
      "unknown"
    );
  }
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after"));
    throw new ManualDeliveryError(
      Number.isFinite(retryAfter) && retryAfter > 0
        ? `Discord is rate limiting this webhook. Try again in ${Math.ceil(retryAfter)}s.`
        : "Discord is rate limiting this webhook. Try again shortly.",
      "rejected"
    );
  }
  if (!res.ok) {
    throw new ManualDeliveryError(
      res.status === 404
        ? "That Discord webhook no longer exists. Reconnect the channel."
        : `Discord webhook failed (${res.status})`,
      "rejected"
    );
  }
}

// Telegram: sendVideo for a video, or one sendPhoto per image (caption on the
// first). Reads the bot token from the stored credentials.
export async function postToTelegram(
  botToken: string,
  chatId: string,
  caption: string,
  media: MediaFile[],
  kind: "video" | "photos"
): Promise<void> {
  const api = (method: string) => `https://api.telegram.org/bot${botToken}/${method}`;
  const cap = caption.slice(0, 1024);

  await assertWithinLimit(
    media,
    kind === "video" ? TELEGRAM_VIDEO_MAX_BYTES : TELEGRAM_PHOTO_MAX_BYTES,
    "Telegram"
  );

  async function send(method: string, fileField: string, file: MediaFile, withCaption: boolean) {
    const form = new FormData();
    form.append("chat_id", chatId);
    if (withCaption && cap) form.append("caption", cap);
    form.append(fileField, await openAsBlob(file.path, { type: file.mimetype }), file.filename);
    let res: Response;
    try {
      res = await fetch(api(method), {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
    } catch {
      throw new ManualDeliveryError(
        "Telegram may have accepted this post, but BeamLoop could not confirm it. It will not be sent again automatically.",
        "unknown"
      );
    }
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (!res.ok || !json.ok) {
      throw new ManualDeliveryError(
        `Telegram ${method} failed: ${json.description ?? res.status}`,
        "rejected"
      );
    }
  }

  if (kind === "video") {
    const file = media[0];
    if (!file) throw new Error("No video to send");
    await send("sendVideo", "video", file, true);
  } else if (media.length === 1) {
    const file = media[0];
    if (!file) throw new Error("No photo to send");
    await send("sendPhoto", "photo", file, true);
  } else {
    // A single atomic Telegram request prevents a retry from duplicating the
    // first few photos if a later sequential send fails.
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append(
      "media",
      JSON.stringify(
        media.map((file, index) => ({
          type: "photo",
          media: `attach://photo${index}`,
          ...(index === 0 && cap ? { caption: cap } : {}),
        }))
      )
    );
    for (const [index, file] of media.entries()) {
      form.append(
        `photo${index}`,
        await openAsBlob(file.path, { type: file.mimetype }),
        file.filename
      );
    }
    let res: Response;
    try {
      res = await fetch(api("sendMediaGroup"), {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
    } catch {
      throw new ManualDeliveryError(
        "Telegram may have accepted this album, but BeamLoop could not confirm it. It will not be sent again automatically.",
        "unknown"
      );
    }
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (!res.ok || !json.ok) {
      throw new ManualDeliveryError(
        `Telegram sendMediaGroup failed: ${json.description ?? res.status}`,
        "rejected"
      );
    }
  }
}
