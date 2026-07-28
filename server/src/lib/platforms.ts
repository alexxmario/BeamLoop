/**
 * Provider-agnostic platform definitions, shared by routes and stores.
 * (Lives here rather than in a provider client so swapping providers doesn't
 * ripple through the whole codebase.)
 */

// Every platform BeamLoop publishes to. All of them are OAuth accounts driven
// through Post for Me, so there is exactly one publishing path.
export const OAUTH_PLATFORMS = [
  "tiktok",
  "instagram",
  "youtube",
  "facebook",
  "x",
  "threads",
  "linkedin",
] as const;

export type Platform = (typeof OAUTH_PLATFORMS)[number];

// Platforms that exist in the model but cannot be connected yet. TikTok is
// pending its Content Posting audit; LinkedIn is blocked upstream (the
// provider's shared LinkedIn OAuth app isn't authorized for the `openid`
// scope, so LinkedIn refuses the grant and never issues an auth code).
// Mirrors COMING_SOON in the mobile client — the client hides them, this
// stops a hand-rolled request from starting an OAuth flow that can only fail.
export const COMING_SOON_PLATFORMS = new Set<Platform>([
  "tiktok",
  "threads",
  "linkedin",
]);

export const isComingSoon = (platform: Platform) =>
  COMING_SOON_PLATFORMS.has(platform);

// Normalized per-platform publish outcome (provider-agnostic).
// `pending` = accepted by the provider but the platform result hasn't landed
// yet (publishing is asynchronous; video can take minutes). Not a failure.
export interface PlatformResult {
  success: boolean;
  pending?: boolean;
  url?: string;
  post_id?: string;
  error?: string;
  // The destination still exists in the provider account list, but the most
  // recent publish proved its authorization/account is no longer usable.
  connectionIssue?: "reconnect";
}

export function isReconnectError(error?: string): boolean {
  if (!error) return false;
  const value = error.toLocaleLowerCase();
  return [
    "account not connected",
    "error validating access token",
    "invalid access token",
    "expired access token",
    "access token has expired",
    "cannot access the app till you log in",
    "please log in",
    "account has been deleted",
    "account was deleted",
    "account is disabled",
    "account has been disabled",
    "account is deactivated",
    "account has been deactivated",
    "authorization has been revoked",
  ].some((phrase) => value.includes(phrase));
}
