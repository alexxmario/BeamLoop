import { randomUUID, scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "./db.js";

/**
 * SQLite-backed user store (see lib/db.ts). Same interface the routes have
 * always used; the JSON-file scaffold it replaced is imported once on boot.
 */

export interface AppUser {
  id: string;
  email: string;
  passwordHash: string; // format: <saltHex>:<scryptHex>
  // When the password last changed. Sessions minted before this are refused,
  // so a reset actually ejects whoever was signed in.
  passwordChangedAt?: string;
  // Kept separate from the login ID so an account can safely recover social
  // connections created in an earlier BeamLoop environment.
  socialExternalId: string;
  createdAt: string;
}

interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  socialExternalId: string | null;
  passwordChangedAt: string | null;
  createdAt: string;
}

function rowToUser(row: UserRow): AppUser {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    socialExternalId: row.socialExternalId ?? row.id,
    ...(row.passwordChangedAt ? { passwordChangedAt: row.passwordChangedAt } : {}),
    createdAt: row.createdAt,
  };
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const hash = scryptSync(password, Buffer.from(saltHex, "hex"), 64);
  const stored_ = Buffer.from(hashHex, "hex");
  // timingSafeEqual throws on a length mismatch; a malformed row is just a
  // failed comparison, not a crash.
  if (hash.length !== stored_.length) return false;
  return timingSafeEqual(hash, stored_);
}

export const userStore = {
  findByEmail(email: string): AppUser | undefined {
    const row = db
      .prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE")
      .get(email) as UserRow | undefined;
    return row ? rowToUser(row) : undefined;
  },

  findById(id: string): AppUser | undefined {
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as
      | UserRow
      | undefined;
    return row ? rowToUser(row) : undefined;
  },

  create(email: string, password: string): AppUser {
    const user: AppUser = {
      id: randomUUID(),
      email,
      passwordHash: hashPassword(password),
      socialExternalId: "",
      createdAt: new Date().toISOString(),
    };
    user.socialExternalId = user.id;
    db.prepare(
      `INSERT INTO users (id, email, passwordHash, socialExternalId, createdAt)
       VALUES (?, ?, ?, ?, ?)`
    ).run(user.id, user.email, user.passwordHash, user.socialExternalId, user.createdAt);
    return user;
  },

  setPassword(id: string, password: string) {
    db.prepare(
      "UPDATE users SET passwordHash = ?, passwordChangedAt = ? WHERE id = ?"
    ).run(hashPassword(password), new Date().toISOString(), id);
  },

  delete(id: string) {
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
  },
};
