import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  APP_JWT_SECRET: z.string().min(16, "APP_JWT_SECRET must be at least 16 chars"),
  // Post for Me — our social publishing provider. Backend only.
  POSTFORME_API_KEY: z.string().min(1, "POSTFORME_API_KEY is required"),
  POSTFORME_BASE_URL: z.string().url().default("https://api.postforme.dev"),
  // Secret returned when the production Post for Me webhook is created.
  // Webhook requests are rejected unless this is configured.
  POSTFORME_WEBHOOK_SECRET: z.string().min(16).optional(),
  // TikTok is integrated directly rather than through Post for Me (see
  // lib/tiktok.ts for why). Without these the channel reports itself as
  // unavailable instead of failing at publish time.
  TIKTOK_CLIENT_KEY: z.string().min(1).optional(),
  TIKTOK_CLIENT_SECRET: z.string().min(1).optional(),
  // Must match a Redirect URI registered on the TikTok app exactly. It is our
  // own domain, so nothing here depends on a third party's callback.
  TIKTOK_REDIRECT_URL: z
    .string()
    .url()
    .default("https://beamloop-production.up.railway.app/connections/tiktok/callback"),
  // Privacy level sent with every TikTok post. Post for Me takes its own
  // "public"/"private" values here, NOT TikTok's raw PUBLIC_TO_EVERYONE /
  // SELF_ONLY enum (verified against their OpenAPI spec), so TikTok's names are
  // accepted and translated rather than rejected — a deployment still carrying
  // TIKTOK_PRIVACY=SELF_ONLY must not fail to boot. Anything short of fully
  // public maps to "private", which is the safe direction to round in.
  //
  // Public works because we publish through Post for Me's own TikTok client on
  // the Quickstart plan. On a White Label project with your own TikTok app,
  // set this to private until that app passes TikTok's Direct Post audit — an
  // unaudited client may only post privately and TikTok rejects anything else.
  TIKTOK_PRIVACY: z.preprocess(
    (value) => {
      if (value === undefined || value === null || value === "") return undefined;
      const raw = String(value).trim().toUpperCase();
      if (raw === "PUBLIC" || raw === "PUBLIC_TO_EVERYONE") return "public";
      if (
        raw === "PRIVATE" ||
        raw === "SELF_ONLY" ||
        raw === "MUTUAL_FOLLOW_FRIENDS" ||
        raw === "FOLLOWER_OF_CREATOR"
      ) {
        return "private";
      }
      return String(value);
    },
    z.enum(["public", "private"]).default("public")
  ),
  // The deep link the platform login returns to. Must ALSO be set as the
  // Project Redirect URL in the Post for Me dashboard (the free plan doesn't
  // allow a per-request override).
  CONNECT_REDIRECT_URL: z.string().default("beamloop://connections/callback"),
  CORS_ORIGIN: z.string().optional(),
  // Site-ownership verification for platform developer portals (TikTok's
  // "URL prefix" method, and the same shape Google/Meta use): they hand you a
  // filename and a string, and check the file is served from the site root.
  // Kept in env so re-verifying — or verifying a second platform — is a config
  // change rather than a deploy. Filename only, no path separators.
  SITE_VERIFICATION_FILENAME: z
    .string()
    .trim()
    .regex(/^[\w.-]{1,128}$/, "SITE_VERIFICATION_FILENAME must be a bare filename")
    .optional(),
  SITE_VERIFICATION_CONTENT: z.string().optional(),
  // Public website details. Override these in Railway with the exact legal
  // operator and monitored support inbox used for the App Store listing.
  PUBLIC_LEGAL_NAME: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .default("Alexandru Mario Ionescu"),
  SUPPORT_EMAIL: z.string().trim().email().default("alexionescu870@gmail.com"),
  PUBLIC_BASE_URL: z
    .string()
    .url()
    .default("https://beamloop-production.up.railway.app"),
  APP_STORE_URL: z.string().url().optional(),
  // Transactional email (password resets), sent through Brevo. Without a key
  // the reset link is written to the server log instead of being emailed, so
  // local development works and a misconfiguration is visible rather than silent.
  BREVO_API_KEY: z.string().min(1).optional(),
  // Must be an address verified under Brevo -> Senders. Brevo verifies an
  // individual address, so this works without owning a domain.
  MAIL_FROM: z.string().default("BeamLoop <beamlooptest@gmail.com>"),
  // StoreKit 2 / App Store Server API. Transaction JWS verification only
  // needs the public app identifiers; the private API key is optional and is
  // reserved for server-to-server reconciliation jobs.
  APPLE_BUNDLE_ID: z.string().default("com.beamloop.app"),
  APPLE_APP_ID: z.coerce.number().int().positive().default(6794000898),
  APPLE_IAP_ISSUER_ID: z.string().uuid().optional(),
  APPLE_IAP_KEY_ID: z.string().min(1).optional(),
  APPLE_IAP_PRIVATE_KEY: z.string().min(1).optional(),
  // Retry media is useful only briefly. Keep it long enough for a user to
  // recover a failed delivery, then remove it automatically.
  MEDIA_RETENTION_HOURS: z.coerce.number().int().min(1).max(720).default(168),
  // Single-password gate for the /admin read-only console. When this is unset
  // the admin routes are not registered at all, so an unconfigured deployment
  // has no surface to attack rather than a guessable default.
  ADMIN_PASSWORD: z.string().min(12, "ADMIN_PASSWORD must be at least 12 chars").optional(),
  PORT: z.coerce.number().default(3000),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

const appleApiValues = [
  parsed.data?.APPLE_IAP_ISSUER_ID,
  parsed.data?.APPLE_IAP_KEY_ID,
  parsed.data?.APPLE_IAP_PRIVATE_KEY,
];
if (parsed.success && appleApiValues.some(Boolean) && !appleApiValues.every(Boolean)) {
  console.error(
    "Invalid environment configuration: APPLE_IAP_ISSUER_ID, APPLE_IAP_KEY_ID, and APPLE_IAP_PRIVATE_KEY must be set together"
  );
  process.exit(1);
}

export const config = parsed.data;
