import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  APP_JWT_SECRET: z.string().min(16, "APP_JWT_SECRET must be at least 16 chars"),
  // Post for Me — our social publishing provider. Backend only.
  POSTFORME_API_KEY: z.string().min(1, "POSTFORME_API_KEY is required"),
  POSTFORME_BASE_URL: z.string().url().default("https://api.postforme.dev"),
  // TikTok requires a privacy level on every post. Unaudited TikTok apps may
  // ONLY post SELF_ONLY (private); flip to PUBLIC_TO_EVERYONE once your TikTok
  // app passes the Direct Post audit.
  TIKTOK_PRIVACY: z
    .enum([
      "SELF_ONLY",
      "PUBLIC_TO_EVERYONE",
      "MUTUAL_FOLLOW_FRIENDS",
      "FOLLOWER_OF_CREATOR",
    ])
    .default("SELF_ONLY"),
  // The deep link the platform login returns to. Must ALSO be set as the
  // Project Redirect URL in the Post for Me dashboard (the free plan doesn't
  // allow a per-request override).
  CONNECT_REDIRECT_URL: z.string().default("beamloop://connections/callback"),
  CORS_ORIGIN: z.string().optional(),
  // Public website details. Override these in Railway with the exact legal
  // operator and monitored support inbox used for the App Store listing.
  PUBLIC_LEGAL_NAME: z.string().trim().min(2).max(120).default("Alex Ionescu"),
  SUPPORT_EMAIL: z.string().trim().email().default("alexionescu870@gmail.com"),
  PUBLIC_BASE_URL: z
    .string()
    .url()
    .default("https://beamloop-production.up.railway.app"),
  APP_STORE_URL: z.string().url().optional(),
  // Retry media is useful only briefly. Keep it long enough for a user to
  // recover a failed delivery, then remove it automatically.
  MEDIA_RETENTION_HOURS: z.coerce.number().int().min(1).max(720).default(168),
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

export const config = parsed.data;
