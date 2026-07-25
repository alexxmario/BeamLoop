import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "./db.js";

/**
 * Single-use password reset tokens.
 *
 * Only the SHA-256 of a token is stored. The plaintext exists once, in the
 * email we send, so a database leak cannot be turned into account takeover.
 * SHA-256 (rather than scrypt) is right here because the token is 32 random
 * bytes — there is no low-entropy secret to slow an attacker down over.
 */

export const RESET_TTL_MINUTES = 60;

interface ResetRow {
  tokenHash: string;
  userId: string;
  expiresAt: string;
  usedAt: string | null;
}

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export const passwordResetStore = {
  /** Issue a token, invalidating any earlier outstanding one for this user. */
  create(userId: string): string {
    db.prepare("DELETE FROM password_resets WHERE userId = ? AND usedAt IS NULL").run(userId);
    const token = randomBytes(32).toString("base64url");
    db.prepare(
      "INSERT INTO password_resets (tokenHash, userId, expiresAt, usedAt) VALUES (?, ?, ?, NULL)"
    ).run(
      hash(token),
      userId,
      new Date(Date.now() + RESET_TTL_MINUTES * 60_000).toISOString()
    );
    return token;
  },

  /** The user this token belongs to, or undefined if it is unusable. */
  verify(token: string): string | undefined {
    if (!token) return undefined;
    const row = db
      .prepare("SELECT * FROM password_resets WHERE tokenHash = ?")
      .get(hash(token)) as ResetRow | undefined;
    if (!row || row.usedAt) return undefined;
    if (new Date(row.expiresAt).getTime() <= Date.now()) return undefined;
    // Constant-time confirmation, so the lookup itself can't be used as an oracle.
    const a = Buffer.from(hash(token));
    const b = Buffer.from(row.tokenHash);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined;
    return row.userId;
  },

  consume(token: string) {
    db.prepare("UPDATE password_resets SET usedAt = ? WHERE tokenHash = ?").run(
      new Date().toISOString(),
      hash(token)
    );
  },

  deleteByUser(userId: string) {
    db.prepare("DELETE FROM password_resets WHERE userId = ?").run(userId);
  },

  /** Housekeeping: drop rows that can no longer be used. */
  purgeExpired() {
    db.prepare(
      "DELETE FROM password_resets WHERE expiresAt <= ? OR usedAt IS NOT NULL"
    ).run(new Date().toISOString());
  },
};
