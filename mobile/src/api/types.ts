export type Platform =
  | "tiktok"
  | "instagram"
  | "youtube"
  | "facebook"
  | "x"
  | "threads"
  | "discord"
  | "telegram";

export interface Connection {
  platform: Platform;
  connected: boolean;
  details: {
    display_name?: string;
    username?: string;
    social_images?: string;
  } | null;
  connectVia: "oauth" | "manual";
}

export interface SessionUser {
  id: string;
  email: string;
}

export interface PlatformResult {
  platform: Platform;
  success: boolean;
  // Accepted by the provider but the platform result hasn't landed yet
  // (publishing is async; video can take a while). Not a failure.
  pending?: boolean;
  // Present when a direct delivery has started. An unconfirmed delivery is
  // deliberately not sent again automatically.
  attemptedAt?: string;
  url?: string;
  post_id?: string;
  error?: string;
}

export interface PostRecord {
  id: string;
  kind: "video" | "photos";
  title: string;
  description?: string;
  platforms: Platform[];
  results: PlatformResult[];
  createdAt: string;
  scheduledAt?: string;
  launchDrop?: boolean;
}

export type PostPlacement = "timeline" | "reels" | "stories";

export interface UploadUsage {
  count: number;
  limit: number;
  last_reset: string;
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  facebook: "Facebook",
  x: "X",
  threads: "Threads",
  discord: "Discord",
  telegram: "Telegram",
};

// Platforms not yet enabled at launch. TikTok is pending its Content Posting
// audit — shown with a "Soon" badge, not connectable or selectable. Remove a
// platform from this set to make it live.
export const COMING_SOON = new Set<Platform>(["tiktok", "threads"]);

export const isComingSoon = (platform: Platform) => COMING_SOON.has(platform);
