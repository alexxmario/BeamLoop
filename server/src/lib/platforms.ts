/**
 * Provider-agnostic platform definitions, shared by routes and stores.
 * (Lives here rather than in a provider client so swapping providers doesn't
 * ripple through the whole codebase.)
 */

// OAuth platforms, published through Post for Me.
export const OAUTH_PLATFORMS = [
  "tiktok",
  "instagram",
  "youtube",
  "facebook",
  "x",
  "threads",
] as const;

// Credential-based platforms, posted to directly by our backend.
export const MANUAL_PLATFORMS = ["discord", "telegram"] as const;

export type Platform =
  | (typeof OAUTH_PLATFORMS)[number]
  | (typeof MANUAL_PLATFORMS)[number];

// Normalized per-platform publish outcome (provider-agnostic).
// `pending` = accepted by the provider but the platform result hasn't landed
// yet (publishing is asynchronous; video can take minutes). Not a failure.
export interface PlatformResult {
  success: boolean;
  pending?: boolean;
  // Persisted immediately before a direct Discord/Telegram write. If the
  // process exits or the network response is ambiguous, workers must not
  // automatically send the same content again.
  attemptedAt?: string;
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
