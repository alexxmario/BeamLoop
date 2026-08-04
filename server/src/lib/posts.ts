import { randomUUID } from "node:crypto";
import { db } from "./db.js";
import type { PlatformResult } from "./platforms.js";

/**
 * SQLite-backed post history (see lib/db.ts). id/userId/createdAt are indexed
 * columns; the rest of each record is stored as JSON in the `data` column.
 */

// A file as it arrives on an upload request, before it is persisted.
export interface MediaFile {
  path: string;
  filename: string;
  mimetype: string;
  truncated?: boolean;
}

export interface StoredMedia {
  path: string; // absolute path under data/media/<postId>/
  filename: string;
  mimetype: string;
}

/**
 * What the composer lets a creator decide about a TikTok post.
 *
 * TikTok's Direct Post rules require the creator — not the app — to choose who
 * sees a post and to declare commercial content, so these travel with the post
 * rather than coming from server configuration.
 */
export interface TikTokOptions {
  privacy: "public" | "private";
  allowComment: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  // "Your brand" = promoting yourself; "branded content" = a paid partnership.
  // TikTok treats the second as advertising, which is why it can't be private.
  discloseYourBrand: boolean;
  discloseBrandedContent: boolean;
  isAiGenerated: boolean;
}

export interface PostRecord {
  id: string;
  userId: string;
  // Client-generated key used to safely replay a timed-out upload.
  idempotencyKey?: string;
  kind: "video" | "photos";
  title: string;
  description?: string;
  platforms: string[];
  // Per-platform outcome, normalized from Post for Me's results.
  results: Array<{ platform: string } & PlatformResult>;
  createdAt: string;
  // Future delivery time. Post for Me durably holds the post until then.
  scheduledAt?: string;
  // Coordinated multi-channel launch, surfaced distinctly in the app.
  launchDrop?: boolean;
  // Media kept on disk so failed platforms can be retried (Phase 4).
  mediaFiles?: StoredMedia[];
  // A small, private preview retained for History after retry media expires.
  thumbnailFile?: StoredMedia;
  // Per-platform caption overrides (sent as `<platform>_title`).
  overrides?: Record<string, string>;
  // Instagram/Facebook destination selected in the composer.
  placements?: Record<string, "timeline" | "reels" | "stories">;
  // Instagram cover image for a video post (Creator/Pro). Kept on disk so a
  // retry re-sends the same cover the user chose.
  instagramCoverFile?: StoredMedia;
  // TikTok posting options chosen in the composer. Stored so a retry re-sends
  // the same privacy and disclosure the user agreed to, never a fresh default.
  tiktokOptions?: TikTokOptions;
  facebookPageId?: string;
  // The Post for Me post id, so we can refresh async results later.
  pfmPostId?: string;
  // Our stable provider-side lookup key. This lets us recover the provider
  // post after an ambiguous response without creating a duplicate.
  pfmExternalId?: string;
  // Provider account ids captured at acceptance time, so result webhooks can
  // resolve the correct BeamLoop channel without another provider request.
  pfmAccountPlatforms?: Record<string, string>;
  // Publish attempts count against per-account platform caps that are much
  // tighter than our plan limits, so retries are counted and spaced out.
  retryCount?: number;
  lastRetryAt?: string;
  // Set when the "your post settled" push went out, so several platforms
  // finishing at once can't each notify.
  notifiedAt?: string;
}

interface PostRow {
  id: string;
  userId: string;
  createdAt: string;
  idempotencyKey: string | null;
  scheduledAt: string | null;
  data: string;
}

function rowToPost(row: PostRow): PostRecord {
  return {
    id: row.id,
    userId: row.userId,
    createdAt: row.createdAt,
    ...(row.idempotencyKey ? { idempotencyKey: row.idempotencyKey } : {}),
    ...(JSON.parse(row.data) as Omit<PostRecord, "id" | "userId" | "createdAt">),
    ...(row.scheduledAt ? { scheduledAt: row.scheduledAt } : {}),
  };
}

// Persist the full record: fixed columns plus everything else as JSON.
function write(record: PostRecord) {
  const { id, userId, createdAt, idempotencyKey, scheduledAt, ...rest } = record;
  db.prepare(
    `INSERT INTO posts (id, userId, createdAt, idempotencyKey, scheduledAt, data)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET userId = excluded.userId,
       createdAt = excluded.createdAt, idempotencyKey = excluded.idempotencyKey,
       scheduledAt = excluded.scheduledAt, data = excluded.data`
  ).run(
    id,
    userId,
    createdAt,
    idempotencyKey ?? null,
    scheduledAt ?? null,
    JSON.stringify(rest)
  );
}

export const postStore = {
  add(
    post: Omit<PostRecord, "id" | "createdAt"> & { id?: string }
  ): PostRecord {
    const { id = randomUUID(), ...data } = post;
    const record: PostRecord = {
      ...data,
      id,
      createdAt: new Date().toISOString(),
    };
    write(record);
    return record;
  },

  listByUser(userId: string): PostRecord[] {
    const rows = db
      .prepare("SELECT * FROM posts WHERE userId = ? ORDER BY createdAt DESC")
      .all(userId) as PostRow[];
    return rows.map(rowToPost);
  },

  listWithMediaBefore(cutoff: string): PostRecord[] {
    const rows = db
      .prepare("SELECT * FROM posts")
      .all() as PostRow[];
    return rows
      .map(rowToPost)
      .filter((post) => {
        const retentionStartsAt = post.scheduledAt ?? post.createdAt;
        return retentionStartsAt < cutoff && (post.mediaFiles?.length ?? 0) > 0;
      });
  },

  listScheduledDue(now: string): PostRecord[] {
    const rows = db
      .prepare("SELECT * FROM posts WHERE scheduledAt IS NOT NULL AND scheduledAt <= ?")
      .all(now) as PostRow[];
    return rows.map(rowToPost);
  },

  clearMedia(id: string): PostRecord | undefined {
    return this.update(id, { mediaFiles: undefined });
  },

  findById(id: string): PostRecord | undefined {
    const row = db.prepare("SELECT * FROM posts WHERE id = ?").get(id) as
      | PostRow
      | undefined;
    return row ? rowToPost(row) : undefined;
  },

  findByIdempotencyKey(userId: string, idempotencyKey: string): PostRecord | undefined {
    const row = db
      .prepare("SELECT * FROM posts WHERE userId = ? AND idempotencyKey = ?")
      .get(userId, idempotencyKey) as PostRow | undefined;
    return row ? rowToPost(row) : undefined;
  },

  findByPfmPostId(pfmPostId: string): PostRecord | undefined {
    try {
      const row = db
        .prepare(
          "SELECT * FROM posts WHERE json_extract(data, '$.pfmPostId') = ? LIMIT 1"
        )
        .get(pfmPostId) as PostRow | undefined;
      return row ? rowToPost(row) : undefined;
    } catch {
      // Keep compatibility with SQLite builds lacking JSON functions.
      const rows = db.prepare("SELECT * FROM posts").all() as PostRow[];
      return rows.map(rowToPost).find((post) => post.pfmPostId === pfmPostId);
    }
  },

  delete(id: string): PostRecord | undefined {
    const current = this.findById(id);
    if (!current) return undefined;
    db.prepare("DELETE FROM posts WHERE id = ?").run(id);
    return current;
  },

  update(id: string, patch: Partial<PostRecord>): PostRecord | undefined {
    const current = this.findById(id);
    if (!current) return undefined;
    const updated = { ...current, ...patch, id };
    write(updated);
    return updated;
  },

  // Remove all posts for a user, returning them so the caller can clean up
  // any persisted media directories.
  deleteByUser(userId: string): PostRecord[] {
    const removed = this.listByUser(userId);
    if (removed.length > 0) {
      db.prepare("DELETE FROM posts WHERE userId = ?").run(userId);
    }
    return removed;
  },

  // Merge in fresh per-platform results (used by Phase 4 retries).
  updateResults(
    id: string,
    updated: Array<{ platform: string } & PlatformResult>
  ): PostRecord | undefined {
    const post = this.findById(id);
    if (!post) return undefined;
    for (const result of updated) {
      const idx = post.results.findIndex(
        (r) => r.platform === result.platform
      );
      if (idx >= 0) post.results[idx] = result;
      else post.results.push(result);
    }
    write(post);
    return post;
  },
};
