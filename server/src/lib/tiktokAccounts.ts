import { db } from "./db.js";
import { decryptSecret, encryptSecret } from "./secrets.js";
import { tiktok, type TikTokTokens } from "./tiktok.js";

/**
 * Connected TikTok accounts, one per BeamLoop user.
 *
 * Tokens are encrypted at rest (lib/secrets.ts). Access tokens last a day and
 * refresh tokens a year, so `accessTokenForUser` quietly refreshes rather than
 * making a creator reconnect every morning.
 */

export interface TikTokAccount {
  userId: string;
  openId: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  scope?: string;
}

interface Row {
  userId: string;
  openId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  scope: string | null;
  createdAt: string;
  updatedAt: string;
}

// Refresh a little early: a token that expires mid-upload fails the post.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

const publicFields = (row: Row): TikTokAccount => ({
  userId: row.userId,
  openId: row.openId,
  ...(row.username ? { username: row.username } : {}),
  ...(row.displayName ? { displayName: row.displayName } : {}),
  ...(row.avatarUrl ? { avatarUrl: row.avatarUrl } : {}),
  accessExpiresAt: row.accessExpiresAt,
  refreshExpiresAt: row.refreshExpiresAt,
  ...(row.scope ? { scope: row.scope } : {}),
});

export const tiktokAccountStore = {
  save(
    userId: string,
    tokens: TikTokTokens,
    profile: { username?: string; displayName?: string; avatarUrl?: string } = {}
  ) {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tiktok_accounts (
         userId, openId, username, displayName, avatarUrl, accessToken,
         refreshToken, accessExpiresAt, refreshExpiresAt, scope, createdAt, updatedAt
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(userId) DO UPDATE SET
         openId = excluded.openId,
         username = COALESCE(excluded.username, tiktok_accounts.username),
         displayName = COALESCE(excluded.displayName, tiktok_accounts.displayName),
         avatarUrl = COALESCE(excluded.avatarUrl, tiktok_accounts.avatarUrl),
         accessToken = excluded.accessToken,
         refreshToken = excluded.refreshToken,
         accessExpiresAt = excluded.accessExpiresAt,
         refreshExpiresAt = excluded.refreshExpiresAt,
         scope = excluded.scope,
         updatedAt = excluded.updatedAt`
    ).run(
      userId,
      tokens.openId,
      profile.username ?? null,
      profile.displayName ?? null,
      profile.avatarUrl ?? null,
      encryptSecret(tokens.accessToken),
      encryptSecret(tokens.refreshToken),
      tokens.accessExpiresAt,
      tokens.refreshExpiresAt,
      tokens.scope,
      now,
      now
    );
  },

  /** Cache the profile shown in the composer, straight from creator_info. */
  saveProfile(
    userId: string,
    profile: { username?: string; displayName?: string; avatarUrl?: string }
  ) {
    db.prepare(
      `UPDATE tiktok_accounts
         SET username = COALESCE(?, username),
             displayName = COALESCE(?, displayName),
             avatarUrl = COALESCE(?, avatarUrl),
             updatedAt = ?
       WHERE userId = ?`
    ).run(
      profile.username ?? null,
      profile.displayName ?? null,
      profile.avatarUrl ?? null,
      new Date().toISOString(),
      userId
    );
  },

  find(userId: string): TikTokAccount | undefined {
    const row = db
      .prepare("SELECT * FROM tiktok_accounts WHERE userId = ?")
      .get(userId) as Row | undefined;
    return row ? publicFields(row) : undefined;
  },

  delete(userId: string) {
    db.prepare("DELETE FROM tiktok_accounts WHERE userId = ?").run(userId);
  },

  /** Only for disconnect, which has to revoke the token with TikTok first. */
  rawAccessToken(userId: string): string | undefined {
    const row = db
      .prepare("SELECT accessToken FROM tiktok_accounts WHERE userId = ?")
      .get(userId) as { accessToken: string } | undefined;
    return row ? decryptSecret(row.accessToken) : undefined;
  },
};

/**
 * A usable access token, refreshing first if it is close to expiry.
 *
 * Returns undefined when the account can no longer be used — no connection, a
 * refresh token that has itself expired, an undecryptable row after a secret
 * rotation, or a refresh TikTok rejected. Every one of those means the same
 * thing to the caller: the creator has to reconnect.
 */
export async function accessTokenForUser(
  userId: string,
  log?: { warn: (obj: unknown, msg: string) => void }
): Promise<string | undefined> {
  const row = db
    .prepare("SELECT * FROM tiktok_accounts WHERE userId = ?")
    .get(userId) as Row | undefined;
  if (!row) return undefined;

  const stillFresh =
    new Date(row.accessExpiresAt).getTime() - REFRESH_MARGIN_MS > Date.now();
  if (stillFresh) {
    const token = decryptSecret(row.accessToken);
    if (token) return token;
    // Undecryptable means the signing secret changed; reconnecting is the fix.
    log?.warn({ userId }, "Stored TikTok token could not be decrypted");
    return undefined;
  }

  if (new Date(row.refreshExpiresAt).getTime() <= Date.now()) return undefined;
  const refreshToken = decryptSecret(row.refreshToken);
  if (!refreshToken) return undefined;

  try {
    const tokens = await tiktok.refreshTokens(refreshToken);
    tiktokAccountStore.save(userId, tokens);
    return tokens.accessToken;
  } catch (err) {
    log?.warn({ err, userId }, "Refreshing the TikTok token failed");
    return undefined;
  }
}
