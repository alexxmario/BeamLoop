import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const serverDir = resolve(here, "..");
const mobileDir = resolve(serverDir, "../mobile");
const failures = [];
let productionApiUrl;

function fail(message) {
  failures.push(message);
}

function read(path) {
  if (!existsSync(path)) {
    fail(`Missing required file: ${path}`);
    return "";
  }
  return readFileSync(path, "utf8");
}

for (const name of [
  "APP_JWT_SECRET",
  "POSTFORME_API_KEY",
  "CONNECT_REDIRECT_URL",
]) {
  const value = process.env[name];
  if (!value || /change-me|your-post-for-me-api-key|replace-with/i.test(value)) {
    fail(`${name} is missing or still uses its example value.`);
  }
}

for (const name of ["PUBLIC_LEGAL_NAME", "SUPPORT_EMAIL"]) {
  const value = process.env[name];
  if (!value) fail(`${name} must be set to the public App Store contact value.`);
}

if (
  process.env.SUPPORT_EMAIL &&
  !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(process.env.SUPPORT_EMAIL)
) {
  fail("SUPPORT_EMAIL must be a valid monitored email address.");
}

if ((process.env.APP_JWT_SECRET?.length ?? 0) < 32) {
  fail("APP_JWT_SECRET must be a unique, random value of at least 32 characters.");
}

const retention = Number(process.env.MEDIA_RETENTION_HOURS ?? 168);
if (!Number.isInteger(retention) || retention < 1 || retention > 720) {
  fail("MEDIA_RETENTION_HOURS must be an integer between 1 and 720.");
}

for (const name of ["privacy-policy.md", "terms-of-service.md"]) {
  const document = read(resolve(serverDir, "legal", name));
  if (/\[LEGAL ENTITY \/ YOUR NAME\]|\[SUPPORT EMAIL\]/.test(document)) {
    fail(`server/legal/${name} still contains legal-entity or support-email placeholders.`);
  }
}

const easRaw = read(resolve(mobileDir, "eas.json"));
try {
  const eas = JSON.parse(easRaw);
  const ios = eas.submit?.production?.ios;
  if (!ios?.ascAppId || /REPLACE_WITH/.test(ios.ascAppId)) {
    fail("mobile/eas.json needs the real App Store Connect numeric app ID (ascAppId).");
  }
  if (!ios?.appleTeamId || /REPLACE_WITH/.test(ios.appleTeamId)) {
    fail("mobile/eas.json needs the real Apple Developer Team ID.");
  }
  productionApiUrl = eas.build?.production?.env?.EXPO_PUBLIC_API_URL;
  if (!productionApiUrl || !/^https:\/\//.test(productionApiUrl)) {
    fail("The production EXPO_PUBLIC_API_URL must be a public HTTPS URL.");
  }
} catch {
  fail("mobile/eas.json is not valid JSON.");
}

if (productionApiUrl?.startsWith("https://")) {
  try {
    const healthUrl = new URL("/health", productionApiUrl);
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
      fail(`Production API health check returned HTTP ${response.status}.`);
    } else {
      const body = await response.json();
      if (body?.ok !== true) fail("Production API health check did not return { ok: true }.");
    }
    for (const path of [
      "/",
      "/support",
      "/account-deletion",
      "/legal/privacy",
      "/legal/terms",
    ]) {
      const pageResponse = await fetch(new URL(path, productionApiUrl), {
        signal: AbortSignal.timeout(10_000),
      });
      if (!pageResponse.ok || !pageResponse.headers.get("content-type")?.includes("text/html")) {
        fail(`Public page ${path} is unavailable or is not HTML.`);
      }
    }
  } catch {
    fail(`Production API is unreachable at ${productionApiUrl}/health.`);
  }
}

if (failures.length) {
  console.error("Release preflight failed:\n");
  for (const message of failures) console.error(`- ${message}`);
  process.exitCode = 1;
} else {
  console.log("Release preflight passed.");
}
