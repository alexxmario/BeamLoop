import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import Fastify from "fastify";
import multipart from "@fastify/multipart";

const dataDir = mkdtempSync(join(tmpdir(), "beamloop-history-check-"));
process.env.DATA_DIR = dataDir;
process.env.APP_JWT_SECRET = "history-contract-check-session-secret";
process.env.POSTFORME_API_KEY = "history-contract-check-provider-key";
process.env.POSTFORME_WEBHOOK_SECRET = "history-contract-check-webhook-secret";

globalThis.fetch = async (url) => {
  if (String(url).includes("/v1/social-accounts")) {
    return Response.json({
      data: [
        {
          id: "account_deleted_instagram",
          platform: "instagram",
          username: "old_account",
          profile_photo_url: null,
          external_id: "social_contract_user",
          status: "connected",
        },
      ],
    });
  }
  return Response.json({ data: [] });
};

try {
  const [
    { postStore },
    { default: uploadRoutes },
    { default: connectionRoutes },
  ] = await Promise.all([
    import("../dist/lib/posts.js"),
    import("../dist/routes/uploads.js"),
    import("../dist/routes/connections.js"),
  ]);

  const mediaPath = join(dataDir, "media", "post_history_check", "photo.jpg");
  const thumbnailPath = join(
    dataDir,
    "thumbnails",
    "post_history_check",
    "preview.jpg"
  );
  mkdirSync(dirname(mediaPath), { recursive: true });
  mkdirSync(dirname(thumbnailPath), { recursive: true });
  writeFileSync(mediaPath, Buffer.from("full-photo"));
  writeFileSync(thumbnailPath, Buffer.from("private-preview"));

  postStore.add({
    id: "post_history_check",
    userId: "contract_user",
    kind: "photos",
    title: "History contract check",
    platforms: ["instagram"],
    results: [
      {
        platform: "instagram",
        success: false,
        error:
          "Failed to post: Error validating access token: You cannot access the app till you log in.",
      },
    ],
    mediaFiles: [
      { path: mediaPath, filename: "photo.jpg", mimetype: "image/jpeg" },
    ],
    thumbnailFile: {
      path: thumbnailPath,
      filename: "preview.jpg",
      mimetype: "image/jpeg",
    },
    pfmAccountPlatforms: {
      account_deleted_instagram: "instagram",
    },
  });

  const app = Fastify({ logger: false });
  await app.register(multipart);
  app.decorate("requireAuth", async (request) => {
    request.user = {
      id: "contract_user",
      email: "contract@example.test",
      socialExternalId: "social_contract_user",
    };
  });
  await app.register(uploadRoutes);
  await app.register(connectionRoutes);

  const history = await app.inject({ method: "GET", url: "/uploads/history" });
  assert.equal(history.statusCode, 200);
  const publicPost = history.json().posts[0];
  assert.equal(publicPost.hasThumbnail, true);
  assert.equal(publicPost.thumbnailFile, undefined);
  assert.equal(publicPost.mediaFiles, undefined);
  assert.equal(publicPost.results[0].connectionIssue, "reconnect");

  const thumbnail = await app.inject({
    method: "GET",
    url: "/uploads/post_history_check/thumbnail",
  });
  assert.equal(thumbnail.statusCode, 200);
  assert.equal(thumbnail.headers["content-type"], "image/jpeg");
  assert.equal(thumbnail.body, "private-preview");

  const connections = await app.inject({
    method: "GET",
    url: "/connections",
  });
  assert.equal(connections.statusCode, 200);
  const instagram = connections
    .json()
    .connections.find((item) => item.platform === "instagram");
  assert.equal(instagram.connected, false);
  assert.equal(instagram.needsReconnect, true);

  const unsafeRetry = await app.inject({
    method: "POST",
    url: "/uploads/post_history_check/retry",
    payload: {},
  });
  assert.equal(unsafeRetry.statusCode, 400);
  assert.equal(unsafeRetry.json().error, "Nothing to retry");

  await app.close();
  console.log(
    "Private History thumbnail and stale-account retry safety contract check passed."
  );
} finally {
  rmSync(dataDir, { recursive: true, force: true });
}
