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
/**
 * TikTok's privacy levels, spelled the way TikTok spells them.
 *
 * The composer offers exactly the ones `creator_info` returns for the connected
 * account, which is why this can't be a simplified public/private pair — most
 * accounts can also post to friends, and some can only post to followers.
 */
export type TikTokPrivacy =
  | "PUBLIC_TO_EVERYONE"
  | "MUTUAL_FOLLOW_FRIENDS"
  | "FOLLOWER_OF_CREATOR"
  | "SELF_ONLY";

/** How each level reads to a creator, in the order TikTok's own composer uses. */
export const TIKTOK_PRIVACY_LABELS: ReadonlyArray<{
  value: TikTokPrivacy;
  label: string;
  detail: string;
}> = [
  { value: "PUBLIC_TO_EVERYONE", label: "Everyone", detail: "Public" },
  { value: "MUTUAL_FOLLOW_FRIENDS", label: "Friends", detail: "Mutual follows" },
  { value: "FOLLOWER_OF_CREATOR", label: "Followers", detail: "People who follow you" },
  { value: "SELF_ONLY", label: "Only me", detail: "Private" },
];

// A paid partnership is advertising, and TikTok won't let advertising go out to
// a narrower audience than everyone or the creator's friends.
export const TIKTOK_BRANDED_CONTENT_AUDIENCES: readonly TikTokPrivacy[] = [
  "PUBLIC_TO_EVERYONE",
  "MUTUAL_FOLLOW_FRIENDS",
];

export interface TikTokOptions {
  // null until the creator picks one. TikTok's Content Posting audit requires
  // the privacy selector to have NO default — the creator must choose, and a
  // post can't be sent until they have.
  privacy: TikTokPrivacy | null;
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
  privacyOptions: TikTokPrivacy[];
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

// Platforms not yet enabled, shown with a "Soon" badge rather than being
// connectable or selectable.
//
// LinkedIn is blocked upstream — the provider's shared LinkedIn OAuth app
// isn't authorized for the `openid` scope, so LinkedIn rejects the grant
// before consent and no auth code is ever issued.
export const COMING_SOON = new Set<Platform>(["threads", "linkedin"]);

export const isComingSoon = (platform: Platform) => COMING_SOON.has(platform);
