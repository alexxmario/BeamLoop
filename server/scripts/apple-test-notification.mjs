import "dotenv/config";
import {
  AppStoreServerAPIClient,
  Environment,
} from "@apple/app-store-server-library";

/**
 * Ask Apple to deliver a TEST notification to our App Store Server
 * Notifications V2 URL, then report what Apple saw when it tried.
 *
 * This is the only way to prove the notification path end to end without
 * making a real purchase: App Store Connect has no "send test" button, and a
 * browser hitting the endpoint only proves GET is unrouted.
 *
 * Requires an In-App Purchase key (App Store Connect -> Users and Access ->
 * Integrations -> In-App Purchase), exposed as:
 *   APPLE_IAP_ISSUER_ID, APPLE_IAP_KEY_ID, APPLE_IAP_PRIVATE_KEY
 *
 * Usage:  node scripts/apple-test-notification.mjs [sandbox|production]
 */

const target = (process.argv[2] ?? "sandbox").toLowerCase();
if (target !== "sandbox" && target !== "production") {
  console.error("Usage: node scripts/apple-test-notification.mjs [sandbox|production]");
  process.exit(2);
}

const issuerId = process.env.APPLE_IAP_ISSUER_ID;
const keyId = process.env.APPLE_IAP_KEY_ID;
// Railway and .env files carry the PEM as a single line with escaped newlines.
const privateKey = process.env.APPLE_IAP_PRIVATE_KEY?.replace(/\\n/g, "\n");
const bundleId = process.env.APPLE_BUNDLE_ID ?? "com.beamloop.app";

const missing = [
  ["APPLE_IAP_ISSUER_ID", issuerId],
  ["APPLE_IAP_KEY_ID", keyId],
  ["APPLE_IAP_PRIVATE_KEY", privateKey],
].filter(([, value]) => !value).map(([name]) => name);

if (missing.length > 0) {
  console.error(`Missing: ${missing.join(", ")}`);
  console.error(
    "Create an In-App Purchase key in App Store Connect (Users and Access -> " +
      "Integrations -> In-App Purchase), then set these in server/.env."
  );
  process.exit(2);
}

const client = new AppStoreServerAPIClient(
  privateKey,
  keyId,
  issuerId,
  bundleId,
  target === "production" ? Environment.PRODUCTION : Environment.SANDBOX
);

console.log(`Requesting a TEST notification (${target})…`);
const { testNotificationToken } = await client.requestTestNotification();
console.log(`Apple accepted the request. Token: ${testNotificationToken}`);

// Apple delivers asynchronously; the status only exists once it has tried.
for (let attempt = 1; attempt <= 10; attempt++) {
  await new Promise((r) => setTimeout(r, 3000));
  try {
    const status = await client.getTestNotificationStatus(testNotificationToken);
    const history = status.sendAttempts ?? [];
    const latest = history[history.length - 1];
    if (!latest) {
      console.log(`  attempt ${attempt}: Apple hasn't delivered yet…`);
      continue;
    }
    console.log(`\nApple's delivery result: ${latest.sendAttemptResult}`);
    if (latest.sendAttemptResult === "SUCCESS") {
      console.log("Your server accepted the notification. The V2 path works.");
      process.exit(0);
    }
    console.log(
      "Apple could not deliver. Check the URL saved in App Store Connect and " +
        "that it points at POST /webhooks/apple."
    );
    process.exit(1);
  } catch (err) {
    // 404 simply means the result isn't available yet.
    if (attempt === 10) {
      console.error("Gave up waiting for a delivery result:", err?.message ?? err);
      process.exit(1);
    }
  }
}
console.error("Apple never reported a delivery result.");
process.exit(1);
