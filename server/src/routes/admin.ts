import { createHmac, createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { db } from "../lib/db.js";
import { subscriptionStore, usageForUser, type PlanId } from "../lib/plans.js";
import {
  adminDashboardPage,
  adminLoginPage,
  adminUserPage,
  type AdminPostRow,
  type AdminUserRow,
} from "../lib/adminSite.js";

/**
 * Single-password, read-only console over the production database.
 *
 * Not registered at all unless ADMIN_PASSWORD is set, so a deployment that
 * hasn't configured one exposes no /admin surface. Read-only with a single
 * deliberate exception: clearing a user's *sandbox* subscription records.
 * Nothing here writes to production entitlements, and no route impersonates a
 * user. Password hashes, reset tokens, and push token values are never
 * rendered.
 */

const COOKIE = "bl_admin";
const SESSION_MS = 12 * 60 * 60 * 1000;

const pageHeaders = {
  // No inline scripts anywhere in the console — only inline styles.
  "content-security-policy":
    "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "x-robots-tag": "noindex, nofollow",
  "cache-control": "no-store",
};

// Sessions are signed with a key derived from both the admin password and the
// app secret: rotating either one invalidates every outstanding session.
function sessionKey(password: string) {
  return createHash("sha256")
    .update(`${password}:${config.APP_JWT_SECRET}`)
    .digest();
}

function sign(value: string, password: string) {
  return createHmac("sha256", sessionKey(password)).update(value).digest("hex");
}

function equals(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws on a length mismatch, which would itself leak length.
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

function issueSession(password: string) {
  const expires = Date.now() + SESSION_MS;
  const body = `${expires}.${randomUUID()}`;
  return `${body}.${sign(body, password)}`;
}

function sessionValid(token: string | undefined, password: string) {
  if (!token) return false;
  const at = token.lastIndexOf(".");
  if (at < 0) return false;
  const body = token.slice(0, at);
  if (!equals(token.slice(at + 1), sign(body, password))) return false;
  const expires = Number(body.split(".")[0]);
  return Number.isFinite(expires) && expires > Date.now();
}

function readCookie(req: FastifyRequest, name: string) {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}

function setCookie(reply: FastifyReply, value: string, maxAgeSeconds: number) {
  const secure = config.PUBLIC_BASE_URL.startsWith("https://") ? " Secure;" : "";
  reply.header(
    "set-cookie",
    `${COOKIE}=${encodeURIComponent(value)}; Path=/admin; HttpOnly;${secure} SameSite=Strict; Max-Age=${maxAgeSeconds}`
  );
}

interface StoredPost {
  kind?: string;
  title?: string;
  platforms?: string[];
  results?: Array<{ platform: string; success: boolean; pending?: boolean; error?: string }>;
}

function toPostRow(
  row: { id: string; userId: string; createdAt: string; scheduledAt: string | null; data: string },
  email: string
): AdminPostRow {
  let parsed: StoredPost = {};
  try {
    parsed = JSON.parse(row.data) as StoredPost;
  } catch {
    // A row we can't parse still belongs in the list — just with empty detail.
  }
  return {
    id: row.id,
    userId: row.userId,
    email,
    kind: parsed.kind ?? "—",
    title: parsed.title ?? "",
    createdAt: row.createdAt,
    scheduledAt: row.scheduledAt,
    platforms: parsed.platforms ?? [],
    results: parsed.results ?? [],
  };
}

export default async function adminRoutes(app: FastifyInstance) {
  const password = config.ADMIN_PASSWORD;
  if (!password) {
    app.log.info("ADMIN_PASSWORD is not set — /admin is disabled");
    return;
  }

  // The login form posts urlencoded. Declared inside this plugin, so it is
  // scoped to the admin routes and doesn't change how the API parses bodies.
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, done) => {
      try {
        done(null, Object.fromEntries(new URLSearchParams(body as string)));
      } catch (error) {
        done(error as Error);
      }
    }
  );

  const page = (reply: FastifyReply, html: string) =>
    reply.headers(pageHeaders).type("text/html; charset=utf-8").send(html);

  const redirect = (reply: FastifyReply, to: string) =>
    reply.headers(pageHeaders).code(303).header("location", to).send();

  const authed = (req: FastifyRequest) =>
    sessionValid(readCookie(req, COOKIE), password);

  // ------------------------------------------------------------ auth

  app.get("/admin/login", async (req, reply) =>
    authed(req) ? redirect(reply, "/admin") : page(reply, adminLoginPage())
  );

  app.post<{ Body: { password?: string } }>(
    "/admin/login",
    // Deliberately far tighter than the global throttle: this is the only
    // endpoint on the server where guessing gets you anything.
    { config: { rateLimit: { max: 5, timeWindow: "5 minutes" } } },
    async (req, reply) => {
      const supplied = typeof req.body?.password === "string" ? req.body.password : "";
      if (!equals(supplied, password)) {
        req.log.warn({ ip: req.ip }, "failed admin login");
        return reply.code(401).headers(pageHeaders).type("text/html; charset=utf-8")
          .send(adminLoginPage("Incorrect password."));
      }
      setCookie(reply, issueSession(password), SESSION_MS / 1000);
      return redirect(reply, "/admin");
    }
  );

  app.post("/admin/logout", async (_req, reply) => {
    setCookie(reply, "", 0);
    return redirect(reply, "/admin/login");
  });

  // Everything below requires a valid session.
  app.addHook("preHandler", async (req, reply) => {
    if (req.url.startsWith("/admin/login") || req.url.startsWith("/admin/logout")) return;
    if (!authed(req)) return redirect(reply, "/admin/login");
  });

  // ------------------------------------------------------- dashboard

  app.get("/admin", async (_req, reply) => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    const one = (sql: string, ...params: unknown[]) =>
      (db.prepare(sql).get(...params) as { n: number }).n;

    const users = db
      .prepare("SELECT id, email, createdAt FROM users ORDER BY createdAt DESC")
      .all() as Array<{ id: string; email: string; createdAt: string }>;

    const postCounts = new Map(
      (
        db
          .prepare("SELECT userId, COUNT(*) AS n FROM posts GROUP BY userId")
          .all() as Array<{ userId: string; n: number }>
      ).map((r) => [r.userId, r.n])
    );

    const planCounts: Record<PlanId, number> = { free: 0, creator: 0, pro: 0 };
    const userRows: AdminUserRow[] = users.map((u) => {
      const entitlement = subscriptionStore.entitlementForUser(u.id);
      planCounts[entitlement.plan] += 1;
      return {
        id: u.id,
        email: u.email,
        createdAt: u.createdAt,
        plan: entitlement.plan,
        status: entitlement.status,
        expiresAt: entitlement.expiresAt,
        posts: postCounts.get(u.id) ?? 0,
        channels: null,
      };
    });

    const emailById = new Map(users.map((u) => [u.id, u.email]));
    const recentPosts = (
      db
        .prepare(
          "SELECT id, userId, createdAt, scheduledAt, data FROM posts ORDER BY createdAt DESC LIMIT 40"
        )
        .all() as Array<{
        id: string;
        userId: string;
        createdAt: string;
        scheduledAt: string | null;
        data: string;
      }>
    ).map((row) => toPostRow(row, emailById.get(row.userId) ?? "(deleted user)"));

    // A post counts as failed when every recorded result failed and none is
    // still pending — a partial success is not a failure worth alerting on.
    const failed7d = recentPosts.filter(
      (p) =>
        p.createdAt >= sevenDaysAgo &&
        p.results.length > 0 &&
        p.results.every((r) => !r.success && !r.pending)
    ).length;

    return page(
      reply,
      adminDashboardPage({
        stats: {
          users: users.length,
          posts: one("SELECT COUNT(*) AS n FROM posts"),
          posts7d: one("SELECT COUNT(*) AS n FROM posts WHERE createdAt >= ?", sevenDaysAgo),
          scheduled: one("SELECT COUNT(*) AS n FROM posts WHERE scheduledAt > ?", now),
          paying: planCounts.creator + planCounts.pro,
          failed7d,
        },
        planCounts,
        users: userRows,
        posts: recentPosts,
      })
    );
  });

  // ----------------------------------------------------- user detail

  app.get<{ Params: { id: string } }>("/admin/users/:id", async (req, reply) => {
    const user = db
      .prepare("SELECT id, email, createdAt, socialExternalId FROM users WHERE id = ?")
      .get(req.params.id) as
      | { id: string; email: string; createdAt: string; socialExternalId: string | null }
      | undefined;
    if (!user) return reply.code(404).headers(pageHeaders).send("Not found");

    const posts = (
      db
        .prepare(
          "SELECT id, userId, createdAt, scheduledAt, data FROM posts WHERE userId = ? ORDER BY createdAt DESC LIMIT 100"
        )
        .all(user.id) as Array<{
        id: string;
        userId: string;
        createdAt: string;
        scheduledAt: string | null;
        data: string;
      }>
    ).map((row) => toPostRow(row, user.email));

    return page(
      reply,
      adminUserPage({
        user,
        entitlement: subscriptionStore.entitlementForUser(user.id),
        usage: usageForUser(user.id),
        subscriptions: db
          .prepare(
            "SELECT originalTransactionId, productId, status, environment, expiresAt, autoRenewStatus FROM apple_subscriptions WHERE userId = ? ORDER BY updatedAt DESC"
          )
          .all(user.id) as never,
        devices: (
          db
            .prepare("SELECT COUNT(*) AS n FROM push_tokens WHERE userId = ?")
            .get(user.id) as { n: number }
        ).n,
        posts,
      })
    );
  });

  // Deletes only sandbox rows. A review pass leaves its purchase bound to
  // whichever account claimed it, and the App Store won't sell that product to
  // the same Apple ID twice, so the next reviewer is left with a buy button
  // that cannot succeed. Production entitlements are deliberately not
  // removable here — a paying customer's plan must never be one click from
  // deletion, and Apple would re-record it on the next renewal anyway.
  app.post<{ Params: { id: string } }>(
    "/admin/users/:id/subscriptions/sandbox",
    async (req, reply) => {
      const removed = db
        .prepare(
          "DELETE FROM apple_subscriptions WHERE userId = ? AND lower(environment) = 'sandbox'"
        )
        .run(req.params.id).changes;
      req.log.warn(
        { userId: req.params.id, removed },
        "Cleared sandbox subscription records"
      );
      return redirect(reply, `/admin/users/${req.params.id}`);
    }
  );
}
