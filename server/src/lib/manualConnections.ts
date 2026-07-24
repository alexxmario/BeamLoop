import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { openAsBlob } from "node:fs";
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

export async function validateDiscordWebhook(webhookUrl: string): Promise<void> {
  const response = await fetch(webhookUrl);
  if (!response.ok) throw new Error("Discord could not verify that webhook");
}

export async function validateTelegramCredentials(
  botToken: string,
  chatId: string
): Promise<void> {
  const api = (method: string) =>
    `https://api.telegram.org/bot${botToken}/${method}?chat_id=${encodeURIComponent(chatId)}`;
  const me = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
  const chat = await fetch(api("getChat"));
  const meJson = (await me.json().catch(() => ({}))) as { ok?: boolean };
  const chatJson = (await chat.json().catch(() => ({}))) as { ok?: boolean };
  if (!me.ok || !chat.ok || !meJson.ok || !chatJson.ok) {
    throw new Error("Telegram could not verify that bot and chat");
  }
}

// ------------------------------------------------------------------ senders

// Discord: one multipart POST to the webhook with the caption + attachments.
export async function postToDiscord(
  webhookUrl: string,
  caption: string,
  media: MediaFile[]
): Promise<void> {
  const form = new FormData();
  form.append("payload_json", JSON.stringify({ content: caption.slice(0, 2000) }));
  for (const [i, f] of media.entries()) {
    form.append(`files[${i}]`, await openAsBlob(f.path, { type: f.mimetype }), f.filename);
  }
  let res: Response;
  try {
    res = await fetch(`${webhookUrl}?wait=true`, { method: "POST", body: form });
  } catch {
    throw new ManualDeliveryError(
      "Discord may have accepted this post, but BeamLoop could not confirm it. It will not be sent again automatically.",
      "unknown"
    );
  }
  if (!res.ok) {
    throw new ManualDeliveryError(`Discord webhook failed (${res.status})`, "rejected");
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

  async function send(method: string, fileField: string, file: MediaFile, withCaption: boolean) {
    const form = new FormData();
    form.append("chat_id", chatId);
    if (withCaption && cap) form.append("caption", cap);
    form.append(fileField, await openAsBlob(file.path, { type: file.mimetype }), file.filename);
    let res: Response;
    try {
      res = await fetch(api(method), { method: "POST", body: form });
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
      res = await fetch(api("sendMediaGroup"), { method: "POST", body: form });
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
