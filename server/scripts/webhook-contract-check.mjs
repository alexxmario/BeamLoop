import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";

const dataDir = mkdtempSync(join(tmpdir(), "beamloop-webhook-check-"));
process.env.DATA_DIR = dataDir;
process.env.APP_JWT_SECRET = "webhook-contract-check-session-secret";
process.env.POSTFORME_API_KEY = "webhook-contract-check-api-key";
process.env.POSTFORME_WEBHOOK_SECRET = "webhook-contract-check-provider-secret";

try {
  const [{ postStore }, { default: webhookRoutes }] = await Promise.all([
    import("../dist/lib/posts.js"),
    import("../dist/routes/webhooks.js"),
  ]);

  const post = postStore.add({
    userId: "user_contract_check",
    kind: "photos",
    title: "Webhook contract check",
    platforms: ["instagram"],
    results: [{ platform: "instagram", success: false, pending: true }],
    pfmPostId: "sp_contract_check",
    pfmAccountPlatforms: { spc_contract_check: "instagram" },
  });

  const app = Fastify({ logger: false });
  await app.register(webhookRoutes);

  const denied = await app.inject({
    method: "POST",
    url: "/webhooks/post-for-me",
    headers: { "post-for-me-webhook-secret": "wrong-secret-value" },
    payload: {
      event_type: "social.post.result.created",
      data: {},
    },
  });
  assert.equal(denied.statusCode, 401);

  const accepted = await app.inject({
    method: "POST",
    url: "/webhooks/post-for-me",
    headers: {
      "post-for-me-webhook-secret":
        process.env.POSTFORME_WEBHOOK_SECRET,
    },
    payload: {
      event_type: "social.post.result.created",
      data: {
        post_id: "sp_contract_check",
        social_account_id: "spc_contract_check",
        success: true,
        error: null,
        platform_data: {
          id: "ig_contract_check",
          url: "https://example.test/live-post",
        },
      },
    },
  });
  assert.equal(accepted.statusCode, 204);

  const updated = postStore.findById(post.id);
  assert.equal(updated?.results[0]?.success, true);
  assert.equal(updated?.results[0]?.pending, undefined);
  assert.equal(updated?.results[0]?.post_id, "ig_contract_check");
  assert.equal(updated?.results[0]?.url, "https://example.test/live-post");

  await app.close();
  console.log("Post for Me webhook confirmation contract check passed.");
} finally {
  rmSync(dataDir, { recursive: true, force: true });
}
