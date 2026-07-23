import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "./paths.js";

/**
 * SQLite-backed persistence (better-sqlite3 — synchronous, matching the
 * store interfaces). Replaces the earlier JSON-file scaffold. Existing
 * data/users.json and data/posts.json are imported once on first boot.
 */

mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(join(DATA_DIR, "beamloop.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    passwordHash TEXT NOT NULL,
    socialExternalId TEXT,
    createdAt TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
    ON users (email COLLATE NOCASE);

  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    idempotencyKey TEXT,
    scheduledAt TEXT,
    data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_posts_user ON posts (userId);

  -- Discord webhook / Telegram bot credentials, stored by us (these platforms
  -- don't use OAuth and aren't handled by the posting provider).
  CREATE TABLE IF NOT EXISTS manual_connections (
    userId TEXT NOT NULL,
    platform TEXT NOT NULL,
    credentials TEXT NOT NULL,
    name TEXT,
    createdAt TEXT NOT NULL,
    PRIMARY KEY (userId, platform)
  );
`);

// Existing installations created the posts table before idempotency support.
// SQLite does not support ADD COLUMN IF NOT EXISTS, so tolerate that migration
// having already run.
try {
  db.exec("ALTER TABLE posts ADD COLUMN idempotencyKey TEXT");
} catch {
  // Column already exists.
}
try {
  db.exec("ALTER TABLE posts ADD COLUMN scheduledAt TEXT");
} catch {
  // Column already exists.
}
try {
  db.exec("ALTER TABLE users ADD COLUMN socialExternalId TEXT");
} catch {
  // Column already exists.
}
// Keep the publishing-provider identity stable independently of session/user
// IDs. Existing users retain their original ID unless explicitly recovered
// from an earlier environment.
db.exec("UPDATE users SET socialExternalId = id WHERE socialExternalId IS NULL");
// Recover the value from records created by the JSON-only scheduling build.
try {
  db.exec(
    `UPDATE posts SET scheduledAt = json_extract(data, '$.scheduledAt')
     WHERE scheduledAt IS NULL AND json_extract(data, '$.scheduledAt') IS NOT NULL`
  );
} catch {
  // A SQLite build without JSON functions can safely skip this local migration.
}
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_social_external_id
    ON users (socialExternalId);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_user_idempotency
    ON posts (userId, idempotencyKey)
    WHERE idempotencyKey IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_posts_scheduled ON posts (scheduledAt);
`);

// One-time migration from the legacy JSON files. Runs only when the target
// table is still empty; the source file is then renamed so it won't re-import.
function importJson(file: string, table: "users" | "posts", insert: (row: any) => void) {
  const path = join(DATA_DIR, file);
  if (!existsSync(path)) return;
  const count = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
  if (count.n > 0) return;
  try {
    const rows = JSON.parse(readFileSync(path, "utf8")) as any[];
    const tx = db.transaction((items: any[]) => items.forEach(insert));
    tx(rows);
    renameSync(path, `${path}.migrated`);
  } catch {
    // A malformed legacy file shouldn't stop the server from booting.
  }
}

importJson("users.json", "users", (u) => {
  db.prepare(
    `INSERT OR IGNORE INTO users (id, email, passwordHash, socialExternalId, createdAt)
     VALUES (?, ?, ?, ?, ?)`
  ).run(u.id, u.email, u.passwordHash, u.socialExternalId ?? u.id, u.createdAt);
});

importJson("posts.json", "posts", (p) => {
  const { id, userId, createdAt, scheduledAt, ...rest } = p;
  db.prepare(
    `INSERT OR IGNORE INTO posts (id, userId, createdAt, scheduledAt, data)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, userId, createdAt, scheduledAt ?? null, JSON.stringify(rest));
});
