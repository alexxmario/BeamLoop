import { db } from "./db.js";

export const PRODUCT_IDS = {
  creatorMonthly: "com.beamloop.app.creator.monthly",
  creatorYearly: "com.beamloop.app.creator.yearly",
  proMonthly: "com.beamloop.app.pro.monthly",
  proYearly: "com.beamloop.app.pro.yearly",
} as const;

export type PlanId = "free" | "creator" | "pro";

export interface PlanLimits {
  channels: number;
  postsPerMonth: number;
  scheduledPosts: number;
  ideas: number | null;
  historyDays: number | null;
  platformCaptions: boolean;
  placements: boolean;
  launchDrops: boolean;
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    channels: 2,
    postsPerMonth: 10,
    scheduledPosts: 5,
    ideas: null,
    historyDays: 30,
    platformCaptions: false,
    placements: false,
    launchDrops: false,
  },
  creator: {
    channels: 4,
    postsPerMonth: 100,
    scheduledPosts: 50,
    ideas: null,
    historyDays: 365,
    platformCaptions: true,
    placements: true,
    launchDrops: false,
  },
  pro: {
    // Every destination BeamLoop supports (6 OAuth + Discord + Telegram).
    // Keep in sync with OAUTH_PLATFORMS + MANUAL_PLATFORMS in platforms.ts.
    channels: 8,
    postsPerMonth: 500,
    // A high, explicit fair-use ceiling is safer and clearer than an
    // unenforceable "unlimited" promise.
    scheduledPosts: 1000,
    ideas: null,
    historyDays: null,
    platformCaptions: true,
    placements: true,
    launchDrops: true,
  },
};

const PRODUCT_PLAN = new Map<string, PlanId>([
  [PRODUCT_IDS.creatorMonthly, "creator"],
  [PRODUCT_IDS.creatorYearly, "creator"],
  [PRODUCT_IDS.proMonthly, "pro"],
  [PRODUCT_IDS.proYearly, "pro"],
]);

export function planForProduct(productId: string): Exclude<PlanId, "free"> | undefined {
  const plan = PRODUCT_PLAN.get(productId);
  return plan === "free" ? undefined : plan;
}

export function isKnownProduct(productId: string): boolean {
  return PRODUCT_PLAN.has(productId);
}

interface SubscriptionRow {
  originalTransactionId: string;
  userId: string;
  transactionId: string;
  productId: string;
  environment: string;
  status: string;
  expiresAt: string | null;
  autoRenewStatus: number | null;
  updatedAt: string;
}

export interface Entitlement {
  plan: PlanId;
  productId: string | null;
  status: string;
  expiresAt: string | null;
  willRenew: boolean | null;
  limits: PlanLimits;
}

function isEntitled(row: SubscriptionRow, now = Date.now()) {
  if (row.status === "revoked" || row.status === "expired") return false;
  return Boolean(row.expiresAt && new Date(row.expiresAt).getTime() > now);
}

export const subscriptionStore = {
  findByOriginalTransactionId(originalTransactionId: string) {
    return db
      .prepare("SELECT * FROM apple_subscriptions WHERE originalTransactionId = ?")
      .get(originalTransactionId) as SubscriptionRow | undefined;
  },

  upsert(row: Omit<SubscriptionRow, "updatedAt">) {
    db.prepare(
      `INSERT INTO apple_subscriptions (
         originalTransactionId, userId, transactionId, productId, environment,
         status, expiresAt, autoRenewStatus, updatedAt
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(originalTransactionId) DO UPDATE SET
         userId = excluded.userId,
         transactionId = excluded.transactionId,
         productId = excluded.productId,
         environment = excluded.environment,
         status = excluded.status,
         expiresAt = excluded.expiresAt,
         autoRenewStatus = COALESCE(excluded.autoRenewStatus, apple_subscriptions.autoRenewStatus),
         updatedAt = excluded.updatedAt`
    ).run(
      row.originalTransactionId,
      row.userId,
      row.transactionId,
      row.productId,
      row.environment,
      row.status,
      row.expiresAt,
      row.autoRenewStatus,
      new Date().toISOString()
    );
  },

  entitlementForUser(userId: string): Entitlement {
    const rows = db
      .prepare("SELECT * FROM apple_subscriptions WHERE userId = ? ORDER BY expiresAt DESC")
      .all(userId) as SubscriptionRow[];
    const active = rows
      .filter((row) => isEntitled(row))
      .sort((a, b) => {
        const rank = (id: string) => (planForProduct(id) === "pro" ? 2 : 1);
        return rank(b.productId) - rank(a.productId);
      })[0];
    if (!active) {
      return {
        plan: "free",
        productId: null,
        status: "free",
        expiresAt: null,
        willRenew: null,
        limits: PLAN_LIMITS.free,
      };
    }
    const plan = planForProduct(active.productId) ?? "free";
    return {
      plan,
      productId: active.productId,
      status: active.status,
      expiresAt: active.expiresAt,
      willRenew:
        active.autoRenewStatus === null ? null : active.autoRenewStatus === 1,
      limits: PLAN_LIMITS[plan],
    };
  },

  markNotification(notificationUUID: string): boolean {
    const result = db
      .prepare(
        "INSERT OR IGNORE INTO apple_notifications (notificationUUID, receivedAt) VALUES (?, ?)"
      )
      .run(notificationUUID, new Date().toISOString());
    return result.changes === 1;
  },

  hasNotification(notificationUUID: string): boolean {
    return Boolean(
      db
        .prepare("SELECT 1 FROM apple_notifications WHERE notificationUUID = ?")
        .get(notificationUUID)
    );
  },

  deleteByUser(userId: string) {
    db.prepare("DELETE FROM apple_subscriptions WHERE userId = ?").run(userId);
  },
};

function utcMonthRange(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

// Monthly quotas roll over on the 1st (UTC). A hard "limit reached" with no
// stated reset date reads as a dead end, so error copy always names the day.
export function formatResetDate(resetsAt: string) {
  return new Date(resetsAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function usageForUser(userId: string) {
  const { start, end } = utcMonthRange();
  const posts = db
    .prepare(
      "SELECT COUNT(*) AS count FROM posts WHERE userId = ? AND createdAt >= ? AND createdAt < ?"
    )
    .get(userId, start, end) as { count: number };
  const scheduled = db
    .prepare(
      "SELECT COUNT(*) AS count FROM posts WHERE userId = ? AND scheduledAt > ?"
    )
    .get(userId, new Date().toISOString()) as { count: number };
  const manual = db
    .prepare("SELECT COUNT(*) AS count FROM manual_connections WHERE userId = ?")
    .get(userId) as { count: number };
  return {
    postsThisMonth: posts.count,
    scheduledPosts: scheduled.count,
    manualConnections: manual.count,
    resetsAt: end,
  };
}
