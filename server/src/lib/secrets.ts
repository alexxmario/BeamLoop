import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { config } from "../config.js";

/**
 * Encryption for third-party credentials held at rest.
 *
 * BeamLoop stores no platform tokens except TikTok's, because TikTok is the
 * one integration we run ourselves. A TikTok refresh token is valid for a year
 * and can publish to somebody's account, so it must not sit in the database in
 * readable form — a leaked volume snapshot would otherwise be enough to post
 * as every connected creator.
 *
 * The key is derived from APP_JWT_SECRET rather than configured separately, so
 * there is no second secret to lose. Rotating APP_JWT_SECRET therefore
 * invalidates stored tokens: decryption fails, the account reads as
 * disconnected, and the creator reconnects. That is the safe failure.
 */

const KEY_LENGTH = 32;
const IV_LENGTH = 12; // GCM standard
const SALT = "beamloop.tokens.v1";

let cachedKey: Buffer | undefined;

function key(): Buffer {
  cachedKey ??= scryptSync(config.APP_JWT_SECRET, SALT, KEY_LENGTH);
  return cachedKey;
}

/** iv.ciphertext.tag, each base64url — self-describing and single-column. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return [iv, encrypted, cipher.getAuthTag()]
    .map((part) => part.toString("base64url"))
    .join(".");
}

/**
 * Returns undefined rather than throwing on anything unreadable — a tampered
 * or key-rotated row should log the user out of that platform, not crash a
 * publish. Callers treat undefined as "not connected".
 */
export function decryptSecret(value: string): string | undefined {
  try {
    const [ivPart, dataPart, tagPart] = value.split(".");
    if (!ivPart || !dataPart || !tagPart) return undefined;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(),
      Buffer.from(ivPart, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return undefined;
  }
}
