import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Contract checks for the direct TikTok integration.
 *
 * Covers the parts that must hold without reaching TikTok: token encryption at
 * rest, the chunking arithmetic an upload depends on, the shape of the consent
 * URL, and the refresh/expiry rules that decide whether a creator has to
 * reconnect. Anything requiring live credentials is verified by connecting a
 * real account, not here.
 */

const dataDir = mkdtempSync(join(tmpdir(), "beamloop-tiktok-"));
process.env.DATA_DIR = dataDir;
process.env.APP_JWT_SECRET = "tiktok-contract-secret-at-least-32-characters";
process.env.POSTFORME_API_KEY = "contract-test-key";
process.env.TIKTOK_CLIENT_KEY = "contract-client-key";
process.env.TIKTOK_CLIENT_SECRET = "contract-client-secret";
process.env.TIKTOK_REDIRECT_URL = "https://example.com/connections/tiktok/callback";

const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

try {
  const { encryptSecret, decryptSecret } = await import("../dist/lib/secrets.js");
  const { tiktok, chunkPlan, describeTikTokError, TikTokError, isTikTokConfigured } =
    await import("../dist/lib/tiktok.js");
  const { tiktokAccountStore, accessTokenForUser } = await import(
    "../dist/lib/tiktokAccounts.js"
  );
  const { db } = await import("../dist/lib/db.js");

  // --- credentials at rest -------------------------------------------------
  const token = "act.a-realistic-looking-access-token";
  const sealed = encryptSecret(token);
  expect(decryptSecret(sealed) === token, "Encrypted secrets must round-trip");
  expect(!sealed.includes(token), "Ciphertext must not contain the plaintext");
  expect(
    encryptSecret(token) !== encryptSecret(token),
    "Each encryption must use a fresh IV"
  );
  expect(
    decryptSecret(sealed.slice(0, -3) + "aaa") === undefined,
    "A tampered ciphertext must not decrypt"
  );
  expect(decryptSecret("nonsense") === undefined, "Malformed input must not throw");

  // --- upload chunking -----------------------------------------------------
  const MB = 1024 * 1024;
  expect(chunkPlan(5 * MB).totalChunkCount === 1, "A small video is a single chunk");
  expect(chunkPlan(64 * MB).totalChunkCount === 1, "64MB still fits one chunk");
  const large = chunkPlan(150 * MB);
  expect(large.totalChunkCount === 2, "150MB must split into chunks");
  expect(
    large.chunkSize * large.totalChunkCount <= 150 * MB,
    "Chunks must not overrun the file; the last one absorbs the remainder"
  );

  // --- consent URL ---------------------------------------------------------
  expect(isTikTokConfigured(), "Configured credentials must report as configured");
  const url = new URL(tiktok.authorizeUrl("STATE"));
  expect(url.host === "www.tiktok.com", "Consent lives on the www host");
  expect(
    url.searchParams.get("client_key") === "contract-client-key",
    "The consent URL must carry our client key"
  );
  expect(url.searchParams.get("state") === "STATE", "State must be forwarded");
  expect(
    url.searchParams.get("redirect_uri") ===
      "https://example.com/connections/tiktok/callback",
    "Redirect URI must match the configured one exactly"
  );
  expect(
    url.searchParams.get("scope") === "user.info.basic,video.publish",
    "Only the scopes BeamLoop demonstrates may be requested"
  );

  // --- creator-facing errors ----------------------------------------------
  expect(
    describeTikTokError(new TikTokError("x", "reached_active_user_cap", 403)).includes(
      "today"
    ),
    "The active-user cap must be explained in terms a creator can act on"
  );
  expect(
    describeTikTokError(new TikTokError("x", "access_token_invalid", 401)).includes(
      "Reconnect"
    ),
    "An invalid token must tell the creator to reconnect"
  );
  expect(
    describeTikTokError(new TikTokError("odd", "unmapped_code", 400)) === "odd",
    "Unmapped codes must pass their message through"
  );

  // --- account storage -----------------------------------------------------
  const now = Date.now();
  const live = {
    accessToken: "access-token-value",
    refreshToken: "refresh-token-value",
    openId: "open-id-1",
    scope: "user.info.basic,video.publish",
    accessExpiresAt: new Date(now + 3_600_000).toISOString(),
    refreshExpiresAt: new Date(now + 86_400_000).toISOString(),
  };
  tiktokAccountStore.save("user-live", live, { username: "creator" });

  const account = tiktokAccountStore.find("user-live");
  expect(account?.openId === "open-id-1", "A saved account must be findable");
  expect(account?.username === "creator", "The cached profile must persist");
  expect(
    !JSON.stringify(account).includes("access-token-value"),
    "The public account shape must never expose tokens"
  );
  expect(
    (await accessTokenForUser("user-live")) === "access-token-value",
    "A live token must be returned as-is"
  );

  const stored = db
    .prepare("SELECT accessToken, refreshToken FROM tiktok_accounts WHERE userId = ?")
    .get("user-live");
  expect(
    !stored.accessToken.includes("access-token-value") &&
      !stored.refreshToken.includes("refresh-token-value"),
    "Tokens must be encrypted in the database"
  );

  // An expired refresh token means the creator has to reconnect; it must never
  // be used, and must not throw.
  tiktokAccountStore.save("user-dead", {
    ...live,
    openId: "open-id-2",
    accessExpiresAt: new Date(now - 1_000).toISOString(),
    refreshExpiresAt: new Date(now - 1_000).toISOString(),
  });
  expect(
    (await accessTokenForUser("user-dead")) === undefined,
    "An expired refresh token must yield no access token"
  );

  tiktokAccountStore.delete("user-live");
  expect(
    tiktokAccountStore.find("user-live") === undefined,
    "Disconnecting must remove the account"
  );

  console.log("TikTok contract checks passed");
} finally {
  rmSync(dataDir, { recursive: true, force: true });
}
