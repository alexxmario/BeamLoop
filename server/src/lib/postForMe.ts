import { config } from "../config.js";

/**
 * Thin client for the Post for Me API (https://api.postforme.dev). Bearer-
 * authenticated, so this module must only ever run on the server.
 *
 * Endpoint shapes verified against the official SDK
 * (github.com/DayMoonDevelopment/post-for-me-typescript) on 2026-07-20.
 *
 * Unlike Upload-Post there is NO per-user "profile" object. Each connected
 * account is tagged with `external_id` = our BeamLoop user id, which we use to
 * scope listing and posting to a single user (multi-tenant).
 */

// OAuth platforms BeamLoop drives through Post for Me. Discord & Telegram are
// posted to directly by our backend, not via this provider.
export const PFM_PLATFORMS = [
  "tiktok",
  "instagram",
  "youtube",
  "facebook",
  "x",
  "threads",
] as const;
export type PfmPlatform = (typeof PFM_PLATFORMS)[number];

export interface PfmSocialAccount {
  id: string;
  platform: string;
  username: string | null;
  profile_photo_url: string | null;
  external_id: string | null;
  status: "connected" | "disconnected";
}

// One account's outcome for a post, from GET /v1/social-post-results.
// The platform isn't on the result itself — resolve it via social_account_id.
export interface PfmPostResult {
  id: string;
  post_id?: string;
  social_account_id?: string;
  success?: boolean;
  error?: unknown;
  details?: unknown;
  // The published post's id + permalink on the platform.
  platform_data?: { id?: string; url?: string };
}

export interface PfmFeedPost {
  platform: string;
  social_post_id?: string | null;
  platform_post_id?: string;
  platform_url?: string;
  posted_at?: string | null;
}

export interface PfmSocialPost {
  id: string;
  caption: string;
  status: "draft" | "scheduled" | "processing" | "processed";
  created_at: string;
  external_id?: string | null;
}

// Per-platform overrides sent as `platform_configurations`. `caption` covers
// our `<platform>_title` override; `title` is used by TikTok/YouTube;
// `privacy_status` is required by TikTok.
export interface PfmPlatformConfig {
  caption?: string;
  title?: string;
  privacy_status?: string;
  placement?: "timeline" | "reels" | "stories";
}

export class PostForMeError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(message);
    this.name = "PostForMeError";
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${config.POSTFORME_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.POSTFORME_API_KEY ?? ""}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    throw new PostForMeError(
      `Post for Me ${method} ${path} failed with ${res.status}`,
      res.status,
      json
    );
  }
  return json as T;
}

export const postForMe = {
  // POST /v1/social-accounts/auth-url — headless connect link for one platform.
  // Returns a URL that goes straight to the platform's own login. The account
  // is tagged with external_id = our user id for later scoping.
  //
  // NOTE: we deliberately do NOT send redirect_url_override — the free
  // "Quickstart" plan rejects it ("set the Project Redirect URL using the
  // dashboard instead"). The return-to-app URL (beamloop://connections/callback,
  // = config.CONNECT_REDIRECT_URL) must be set once as the Project Redirect URL
  // in the Post for Me dashboard.
  createAuthUrl(userId: string, platform: PfmPlatform) {
    return request<{ platform: string; url: string }>(
      "POST",
      "/v1/social-accounts/auth-url",
      {
        platform,
        external_id: userId,
        permissions: ["posts"],
        // Instagram requires a connection type. "instagram" = direct Instagram
        // Login (Professional accounts, no Facebook Page needed); "facebook"
        // would route via a linked Facebook Page instead.
        ...(platform === "instagram"
          ? { platform_data: { instagram: { connection_type: "instagram" } } }
          : {}),
      }
    );
  },

  // GET /v1/social-accounts?external_id=<userId> — this user's connections.
  async listAccounts(userId: string): Promise<PfmSocialAccount[]> {
    const res = await request<{ data?: PfmSocialAccount[] } | PfmSocialAccount[]>(
      "GET",
      `/v1/social-accounts?external_id=${encodeURIComponent(userId)}`
    );
    return Array.isArray(res) ? res : res.data ?? [];
  },

  getAccount(id: string) {
    return request<PfmSocialAccount>(
      "GET",
      `/v1/social-accounts/${encodeURIComponent(id)}`
    );
  },

  getPost(id: string) {
    return request<PfmSocialPost>(
      "GET",
      `/v1/social-posts/${encodeURIComponent(id)}`
    );
  },

  async listAccountFeed(accountId: string, limit = 10): Promise<PfmFeedPost[]> {
    const res = await request<{ data?: PfmFeedPost[] } | PfmFeedPost[]>(
      "GET",
      `/v1/social-account-feeds/${encodeURIComponent(accountId)}?limit=${limit}`
    );
    return Array.isArray(res) ? res : res.data ?? [];
  },

  // POST /v1/social-accounts/{id}/disconnect
  disconnectAccount(id: string) {
    return request<unknown>(
      "POST",
      `/v1/social-accounts/${encodeURIComponent(id)}/disconnect`
    );
  },

  // Media: POST /v1/media/create-upload-url → PUT bytes → reference media_url.
  async uploadMedia(
    body: Blob,
    contentType: string
  ): Promise<string> {
    const { upload_url, media_url } = await request<{
      upload_url: string;
      media_url: string;
    }>("POST", "/v1/media/create-upload-url");

    const put = await fetch(upload_url, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body,
    });
    if (!put.ok) {
      throw new PostForMeError(
        `Post for Me media upload (PUT) failed with ${put.status}`,
        put.status,
        await put.text().catch(() => "")
      );
    }
    return media_url;
  },

  // POST /v1/social-posts — publish to the given accounts, with optional
  // per-platform caption/title overrides.
  createPost(input: {
    caption: string;
    socialAccountIds: string[];
    mediaUrls?: string[];
    platformConfigurations?: Partial<Record<PfmPlatform, PfmPlatformConfig>>;
    scheduledAt?: string;
    externalId?: string;
  }) {
    return request<PfmSocialPost>("POST", "/v1/social-posts", {
      caption: input.caption,
      social_accounts: input.socialAccountIds,
      ...(input.mediaUrls && input.mediaUrls.length > 0
        ? { media: input.mediaUrls.map((url) => ({ url })) }
        : {}),
      ...(input.platformConfigurations
        ? { platform_configurations: input.platformConfigurations }
        : {}),
      ...(input.scheduledAt ? { scheduled_at: input.scheduledAt } : {}),
      ...(input.externalId ? { external_id: input.externalId } : {}),
    });
  },

  // Recover a post after an ambiguous create response. The provider documents
  // external_id as both a create field and an exact list filter.
  async findPostByExternalId(externalId: string): Promise<PfmSocialPost | undefined> {
    const res = await request<{ data?: PfmSocialPost[] } | PfmSocialPost[]>(
      "GET",
      `/v1/social-posts?external_id=${encodeURIComponent(externalId)}&limit=1`
    );
    const posts = Array.isArray(res) ? res : res.data ?? [];
    return posts[0];
  },

  // Cancels a provider-side draft or scheduled post before it is published.
  deletePost(id: string) {
    return request<unknown>("DELETE", `/v1/social-posts/${encodeURIComponent(id)}`);
  },

  // GET /v1/social-post-results?post_id=<id> — one result per account.
  async listPostResults(postId: string | string[]): Promise<PfmPostResult[]> {
    const postIds = Array.isArray(postId) ? postId : [postId];
    const query = postIds
      .map((id) => `post_id=${encodeURIComponent(id)}`)
      .join("&");
    const res = await request<{ data?: PfmPostResult[] } | PfmPostResult[]>(
      "GET",
      `/v1/social-post-results?${query}`
    );
    return Array.isArray(res) ? res : res.data ?? [];
  },
};
