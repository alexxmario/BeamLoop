import assert from "node:assert/strict";

process.env.APP_JWT_SECRET ||= "provider-contract-check-secret";
process.env.POSTFORME_API_KEY ||= "provider-contract-check-key";

const calls = [];
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  if (init.method === "DELETE") return new Response(null, { status: 204 });
  if (String(url).includes("/v1/social-account-feeds/")) {
    return Response.json({
      data: [
        {
          platform: "instagram",
          social_post_id: "post_contract_check",
          platform_post_id: "ig_contract_check",
          platform_url: "https://example.test/live-post",
        },
      ],
    });
  }
  if ((init.method ?? "GET") === "GET") {
    return Response.json({
      data: [
        {
          id: "post_contract_check",
          caption: "Launch",
          status: "scheduled",
          external_id: "beamloop_contract_check",
          created_at: new Date().toISOString(),
        },
      ],
    });
  }
  return new Response(
    JSON.stringify({
      id: "post_contract_check",
      caption: "Launch",
      status: "scheduled",
      created_at: new Date().toISOString(),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

const { postForMe } = await import("../dist/lib/postForMe.js");
const scheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
await postForMe.createPost({
  caption: "Launch",
  socialAccountIds: ["account_1"],
  mediaUrls: ["https://example.test/media.jpg"],
  scheduledAt,
  platformConfigurations: {
    instagram: { caption: "Launch on IG", placement: "reels" },
  },
  externalId: "beamloop_contract_check",
});
const recovered = await postForMe.findPostByExternalId("beamloop_contract_check");
const feed = await postForMe.listAccountFeed("account_1");
await postForMe.deletePost("post_contract_check");

const create = calls[0];
assert.equal(create?.url.endsWith("/v1/social-posts"), true);
const payload = JSON.parse(String(create?.init.body));
assert.equal(payload.scheduled_at, scheduledAt);
assert.equal(payload.platform_configurations.instagram.placement, "reels");
assert.deepEqual(payload.social_accounts, ["account_1"]);
assert.equal(payload.external_id, "beamloop_contract_check");
assert.equal(recovered?.id, "post_contract_check");
assert.equal(feed[0]?.social_post_id, "post_contract_check");
assert.equal(feed[0]?.platform_post_id, "ig_contract_check");
assert.equal(
  calls[1]?.url.includes("/v1/social-posts?external_id=beamloop_contract_check"),
  true
);
assert.equal(
  calls[2]?.url.includes("/v1/social-account-feeds/account_1"),
  true
);
assert.equal(calls[3]?.init.method, "DELETE");
assert.equal(calls[3]?.url.endsWith("/v1/social-posts/post_contract_check"), true);

console.log("Post for Me scheduling, feed, and duplicate-recovery contract check passed.");
