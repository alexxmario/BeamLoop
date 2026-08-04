export type Platform =
  | "tiktok"
  | "instagram"
  | "youtube"
  | "facebook"
  | "x"
  | "threads"
  | "linkedin";

export interface Connection {
  platform: Platform;
  connected: boolean;
  needsReconnect?: boolean;
  statusMessage?: string;
  details: {
    display_name?: string;
    username?: string;
    social_images?: string;
  } | null;
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
  url?: string;
  post_id?: string;
  error?: string;
  connectionIssue?: "reconnect";
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
  hasThumbnail?: boolean;
}

export type PostPlacement = "timeline" | "reels" | "stories";

/**
 * What a creator decides about a TikTok post. TikTok's Direct Post rules put
 * these choices with the person posting rather than with the app, so they are
 * part of the composer and travel with each post.
 */
export interface TikTokOptions {
  // null until the creator picks one. TikTok's Content Posting audit requires
  // the privacy selector to have NO default — the creator must choose, and a
  // post can't be sent until they have.
  privacy: "public" | "private" | null;
  allowComment: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  // UI-only: the "this promotes a brand" switch. Never sent — the server reads
  // the two specific disclosures below. When this is on, TikTok requires at
  // least one of them to be selected.
  discloseCommercial: boolean;
  discloseYourBrand: boolean;
  discloseBrandedContent: boolean;
  isAiGenerated: boolean;
}

/**
 * The creator's live TikTok posting permissions.
 *
 * TikTok requires the posting screen to reflect this: only the privacy options
 * it returns may be offered, and an interaction the creator disabled in their
 * TikTok settings must not be selectable here.
 */
export interface TikTokCreatorInfo {
  creator: { username: string; nickname: string; avatarUrl: string };
  privacyOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoDurationSec: number;
}

// TikTok's audit requires nothing to be pre-selected: no privacy level, no
// interaction checked, nothing declared commercial.
export const DEFAULT_TIKTOK_OPTIONS: TikTokOptions = {
  privacy: null,
  allowComment: false,
  allowDuet: false,
  allowStitch: false,
  discloseCommercial: false,
  discloseYourBrand: false,
  discloseBrandedContent: false,
  isAiGenerated: false,
};

export interface UploadUsage {
  count: number;
  limit: number;
  last_reset: string;
}

export type PlanId = "free" | "creator" | "pro";

export interface BillingStatus {
  entitlement: {
    plan: PlanId;
    productId: string | null;
    status: string;
    expiresAt: string | null;
    willRenew: boolean | null;
    limits: {
      channels: number;
      postsPerMonth: number;
      scheduledPosts: number;
      ideas: number | null;
      historyDays: number | null;
      platformCaptions: boolean;
      // Facebook placement. Instagram's Post/Reel/Story choice is free on every
      // plan — it is how Instagram works, not an upgrade.
      placements: boolean;
      instagramCover: boolean;
      launchDrops: boolean;
    };
  };
  usage: {
    postsThisMonth: number;
    scheduledPosts: number;
    resetsAt: string;
  };
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  facebook: "Facebook",
  x: "X",
  threads: "Threads",
  linkedin: "LinkedIn",
};

// Platforms not yet enabled. LinkedIn is blocked upstream — the provider's
// shared LinkedIn OAuth app isn't authorized for the `openid` scope, so
// LinkedIn rejects the grant before consent and no auth code is ever issued.
// Shown with a "Soon" badge, not connectable or selectable. Remove a platform
// from this set to make it live (mirror the change in the server's
// COMING_SOON_PLATFORMS).
export const COMING_SOON = new Set<Platform>(["threads", "linkedin"]);

export const isComingSoon = (platform: Platform) => COMING_SOON.has(platform);
