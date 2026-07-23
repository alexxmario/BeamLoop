import { randomUUID, scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "./db.js";

/**
 * SQLite-backed user store (see lib/db.ts). Same interface the routes have
 * always used; the JSON-file scaffold it replaced is imported once on boot.
 */

export interface AppUser {
  id: string; // also used to scope this user's connected social accounts
  email: string;
  passwordHash: string; // format: <saltHex>:<scryptHex>
  createdAt: string;
}

interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

function rowToUser(row: UserRow): AppUser {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
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
  return timingSafeEqual(hash, Buffer.from(hashHex, "hex"));
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
      createdAt: new Date().toISOString(),
    };
    db.prepare(
      `INSERT INTO users (id, email, passwordHash, createdAt)
       VALUES (?, ?, ?, ?)`
    ).run(user.id, user.email, user.passwordHash, user.createdAt);
    return user;
  },

  delete(id: string) {
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
  },
};
