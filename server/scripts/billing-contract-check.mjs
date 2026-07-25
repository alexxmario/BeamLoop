import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = mkdtempSync(join(tmpdir(), "beamloop-billing-"));
process.env.DATA_DIR = dataDir;
process.env.APP_JWT_SECRET = "billing-contract-secret-at-least-32-characters";
process.env.POSTFORME_API_KEY = "contract-test-key";

try {
  const { db } = await import("../dist/lib/db.js");
  const {
    PLAN_LIMITS,
    PRODUCT_IDS,
    planForProduct,
    subscriptionStore,
    usageForUser,
  } = await import("../dist/lib/plans.js");

  const userId = "11111111-1111-4111-8111-111111111111";
  db.prepare(
    "INSERT INTO users (id, email, passwordHash, socialExternalId, createdAt) VALUES (?, ?, ?, ?, ?)"
  ).run(userId, "billing@example.com", "hash", userId, new Date().toISOString());

  if (subscriptionStore.entitlementForUser(userId).plan !== "free") {
    throw new Error("A user without a verified subscription must remain on Free");
  }
  if (PLAN_LIMITS.free.postsPerMonth !== 10 || PLAN_LIMITS.free.channels !== 2) {
    throw new Error("Free plan limits changed unexpectedly");
  }
  if (planForProduct(PRODUCT_IDS.proYearly) !== "pro") {
    throw new Error("Pro yearly product does not map to Pro");
  }

  subscriptionStore.upsert({
    originalTransactionId: "2000000000000000",
    userId,
    transactionId: "2000000000000001",
    productId: PRODUCT_IDS.creatorMonthly,
    environment: "Sandbox",
    status: "active",
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    autoRenewStatus: 1,
  });
  const creator = subscriptionStore.entitlementForUser(userId);
  if (creator.plan !== "creator" || creator.willRenew !== true) {
    throw new Error("Verified Creator subscription did not grant entitlement");
  }
  if (usageForUser(userId).postsThisMonth !== 0) {
    throw new Error("Fresh account has incorrect post usage");
  }

  subscriptionStore.upsert({
    originalTransactionId: "2000000000000000",
    userId,
    transactionId: "2000000000000002",
    productId: PRODUCT_IDS.creatorMonthly,
    environment: "Sandbox",
    status: "revoked",
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    autoRenewStatus: 0,
  });
  if (subscriptionStore.entitlementForUser(userId).plan !== "free") {
    throw new Error("Revoked subscription must not grant paid access");
  }

  console.log("Apple subscription entitlement and limit contract check passed.");
} finally {
  rmSync(dataDir, { recursive: true, force: true });
}
