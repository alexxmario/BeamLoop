import { join } from "node:path";

/**
 * Where persistent data lives (SQLite DB + retry media). Defaults to
 * `<cwd>/data`, but set DATA_DIR to a mounted volume in production
 * (e.g. Railway) since container filesystems are ephemeral.
 */
export const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), "data");
export const MEDIA_DIR = join(DATA_DIR, "media");
// Small previews outlive full retry media so History stays visual without
// retaining a user's original upload indefinitely.
export const THUMBNAIL_DIR = join(DATA_DIR, "thumbnails");
