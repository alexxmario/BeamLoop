import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { config } from "../config.js";

/**
 * Direct TikTok integration — the one platform BeamLoop publishes to itself.
 *
 * Everything else goes through Post for Me. TikTok does not, for three reasons
 * that only direct access solves:
 *
 *  - Post for Me sends media as PULL_FROM_URL from their own storage domain,
 *    and TikTok requires that domain to be verified on the posting app. We
 *    can't verify a domain we don't own. FILE_UPLOAD has no such requirement.
 *  - TikTok's Content Posting audit requires the composer to reflect a live
 *    creator_info query. Post for Me makes that call internally and doesn't
 *    expose it, so it could not be satisfied through them.
 *  - The OAuth consent screen names whoever owns the client key. Through them
 *    it reads "PostForMe"; ours reads "BeamLoop".
 *
 * Endpoints verified against developers.tiktok.com (Content Posting API and
 * OAuth v2) on 2026-08-04.
 */

const OAUTH_HOST = "https://open.tiktokapis.com";
// The consent screen lives on the www host, not the API host. Confirmed
// against a real authorization URL rather than taken from the docs.
const AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";

// What BeamLoop actually needs. video.list is deliberately absent: publishing
// outcomes come from the status endpoint, and TikTok delays a review over any
// scope it can't see used.
export const TIKTOK_SCOPES = ["user.info.basic", "video.publish"] as const;

// TikTok accepts one chunk up to 64 MB. Larger videos are split, with the
// final chunk carrying the remainder (so it may exceed chunk_size).
const MAX_CHUNK_BYTES = 64 * 1024 * 1024;

const REQUEST_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 300_000;

export class TikTokError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly logId?: string
  ) {
    super(message);
    this.name = "TikTokError";
  }
}

export interface TikTokTokens {
  accessToken: string;
  refreshToken: string;
  openId: string;
  scope: string;
  /** Absolute expiry instants, already resolved from the relative seconds. */
  accessExpiresAt: string;
  refreshExpiresAt: string;
}

export interface TikTokCreatorInfo {
  creator_username: string;
  creator_nickname: string;
  creator_avatar_url: string;
  privacy_level_options: string[];
  comment_disabled: boolean;
  duet_disabled: boolean;
  stitch_disabled: boolean;
  max_video_post_duration_sec: number;
}

export interface TikTokPostInfo {
  privacy_level: string;
  title?: string;
  disable_comment?: boolean;
  disable_duet?: boolean;
  disable_stitch?: boolean;
  video_cover_timestamp_ms?: number;
  brand_content_toggle?: boolean;
  brand_organic_toggle?: boolean;
  is_aigc?: boolean;
}

export type TikTokPublishStatus =
  | "PROCESSING_UPLOAD"
  | "PROCESSING_DOWNLOAD"
  | "SEND_TO_USER_INBOX"
  | "PUBLISH_COMPLETE"
  | "FAILED";

export const isTikTokConfigured = () =>
  Boolean(config.TIKTOK_CLIENT_KEY && config.TIKTOK_CLIENT_SECRET);

// TikTok answers 200 with an error object inside, so status alone proves
// nothing — every response goes through here.
function unwrap<T>(json: unknown, httpStatus: number): T {
  const body = json as {
    data?: T;
    error?: { code?: string; message?: string; log_id?: string };
    // The OAuth endpoints put the error at the top level instead.
    error_description?: string;
  };
  const error = body?.error;
  const code = typeof error === "string" ? error : error?.code;
  if (code && code !== "ok") {
    throw new TikTokError(
      error?.message || body?.error_description || `TikTok error ${code}`,
      code,
      httpStatus,
      error?.log_id
    );
  }
  if (httpStatus >= 400) {
    throw new TikTokError(
      body?.error_description || `TikTok request failed (${httpStatus})`,
      "http_error",
      httpStatus
    );
  }
  return (body?.data ?? (body as T)) as T;
}

async function postJson<T>(path: string, accessToken: string, body: unknown): Promise<T> {
  const res = await fetch(`${OAUTH_HOST}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return unwrap<T>(await res.json().catch(() => ({})), res.status);
}

async function postForm<T>(path: string, form: Record<string, string>): Promise<T> {
  const res = await fetch(`${OAUTH_HOST}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return unwrap<T>(await res.json().catch(() => ({})), res.status);
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  open_id: string;
  refresh_token: string;
  refresh_expires_in: number;
  scope: string;
  token_type: string;
}

function toTokens(res: TokenResponse): TikTokTokens {
  const now = Date.now();
  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token,
    openId: res.open_id,
    scope: res.scope,
    accessExpiresAt: new Date(now + res.expires_in * 1000).toISOString(),
    refreshExpiresAt: new Date(now + res.refresh_expires_in * 1000).toISOString(),
  };
}

// Split a file the way TikTok expects: one chunk when it fits, otherwise
// equal chunks with the remainder folded into the last one.
export function chunkPlan(videoSize: number) {
  if (videoSize <= MAX_CHUNK_BYTES) {
    return { chunkSize: videoSize, totalChunkCount: 1 };
  }
  const totalChunkCount = Math.floor(videoSize / MAX_CHUNK_BYTES);
  return { chunkSize: MAX_CHUNK_BYTES, totalChunkCount };
}

export const tiktok = {
  /** Where to send the creator to authorize. `state` is checked on return. */
  authorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_key: config.TIKTOK_CLIENT_KEY ?? "",
      scope: TIKTOK_SCOPES.join(","),
      response_type: "code",
      redirect_uri: config.TIKTOK_REDIRECT_URL,
      state,
      // Always show the account chooser rather than silently reusing whoever
      // is logged in on the device.
      disable_auto_auth: "1",
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  },

  async exchangeCode(code: string): Promise<TikTokTokens> {
    return toTokens(
      await postForm<TokenResponse>("/v2/oauth/token/", {
        client_key: config.TIKTOK_CLIENT_KEY ?? "",
        client_secret: config.TIKTOK_CLIENT_SECRET ?? "",
        code,
        grant_type: "authorization_code",
        redirect_uri: config.TIKTOK_REDIRECT_URL,
      })
    );
  },

  async refreshTokens(refreshToken: string): Promise<TikTokTokens> {
    return toTokens(
      await postForm<TokenResponse>("/v2/oauth/token/", {
        client_key: config.TIKTOK_CLIENT_KEY ?? "",
        client_secret: config.TIKTOK_CLIENT_SECRET ?? "",
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      })
    );
  },

  async revoke(accessToken: string): Promise<void> {
    await postForm("/v2/oauth/revoke/", {
      client_key: config.TIKTOK_CLIENT_KEY ?? "",
      client_secret: config.TIKTOK_CLIENT_SECRET ?? "",
      token: accessToken,
    });
  },

  /**
   * The creator's current posting permissions. TikTok requires this to be
   * queried when the posting screen is shown — the privacy options offered
   * must be the ones it returns, and interactions it reports as disabled must
   * be unavailable.
   */
  creatorInfo(accessToken: string): Promise<TikTokCreatorInfo> {
    return postJson<TikTokCreatorInfo>(
      "/v2/post/publish/creator_info/query/",
      accessToken,
      {}
    );
  },

  /** Reserve a publish and get the URL the bytes go to. */
  async initDirectPost(
    accessToken: string,
    postInfo: TikTokPostInfo,
    videoSize: number
  ): Promise<{ publishId: string; uploadUrl: string }> {
    const { chunkSize, totalChunkCount } = chunkPlan(videoSize);
    const data = await postJson<{ publish_id: string; upload_url: string }>(
      "/v2/post/publish/video/init/",
      accessToken,
      {
        post_info: postInfo,
        source_info: {
          source: "FILE_UPLOAD",
          video_size: videoSize,
          chunk_size: chunkSize,
          total_chunk_count: totalChunkCount,
        },
      }
    );
    return { publishId: data.publish_id, uploadUrl: data.upload_url };
  },

  /**
   * PUT the file to the reserved URL. Chunks are streamed rather than read
   * into memory — a 500 MB upload must not become 500 MB of heap.
   */
  async uploadVideo(
    uploadUrl: string,
    filePath: string,
    mimetype: string
  ): Promise<void> {
    const { size } = await stat(filePath);
    const { chunkSize, totalChunkCount } = chunkPlan(size);

    for (let index = 0; index < totalChunkCount; index += 1) {
      const start = index * chunkSize;
      // The final chunk absorbs any remainder left by integer division.
      const end = index === totalChunkCount - 1 ? size - 1 : start + chunkSize - 1;
      const stream = createReadStream(filePath, { start, end });
      const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": mimetype,
          "Content-Length": String(end - start + 1),
          "Content-Range": `bytes ${start}-${end}/${size}`,
        },
        // Node needs `duplex` to stream a request body rather than buffer it,
        // which is the whole point of reading the chunk as a stream.
        body: stream,
        duplex: "half",
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      } as unknown as RequestInit);
      if (!res.ok) {
        throw new TikTokError(
          `Uploading the video to TikTok failed (${res.status})`,
          "upload_failed",
          res.status
        );
      }
    }
  },

  publishStatus(
    accessToken: string,
    publishId: string
  ): Promise<{
    status: TikTokPublishStatus;
    fail_reason?: string;
    publicaly_available_post_id?: string[];
  }> {
    return postJson("/v2/post/publish/status/fetch/", accessToken, {
      publish_id: publishId,
    });
  },
};

/**
 * TikTok's failure codes are terse and often account-specific. Turn the ones a
 * creator can act on into plain instructions, and pass anything else through.
 */
export function describeTikTokError(error: unknown): string {
  if (!(error instanceof TikTokError)) {
    return error instanceof Error ? error.message : "Publishing to TikTok failed";
  }
  switch (error.code) {
    case "reached_active_user_cap":
      return "TikTok is limiting how many people can post through BeamLoop today. Try again tomorrow.";
    // Until the Direct Post audit passes, TikTok refuses to post to any account
    // that isn't itself private — separately from the post's own privacy level.
    // Their own message is a bare link to the guidelines, which tells a creator
    // nothing about what to change.
    case "unaudited_client_can_only_post_to_private_accounts":
      return "TikTok currently only accepts posts from BeamLoop to private accounts. Set your TikTok account to private in Settings and privacy → Privacy, then try again.";
    case "spam_risk_too_many_posts":
      return "You've hit TikTok's daily posting limit for this account. Try again tomorrow.";
    case "spam_risk_user_banned_from_posting":
      return "TikTok has restricted posting on this account.";
    case "privacy_level_option_mismatch":
      return "That privacy setting isn't available on this TikTok account. Choose another.";
    case "access_token_invalid":
    case "scope_not_authorized":
      return "Reconnect TikTok in BeamLoop to keep posting.";
    case "video_pull_failed":
    case "upload_failed":
      return "TikTok couldn't accept this video. Try a different file.";
    default:
      return error.message || "Publishing to TikTok failed";
  }
}
