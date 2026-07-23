import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { userStore, verifyPassword } from "../lib/store.js";
import { postStore } from "../lib/posts.js";
import { MEDIA_DIR } from "../lib/paths.js";
import { signSessionToken } from "../plugins/auth.js";
import { postForMe } from "../lib/postForMe.js";
import { manualStore } from "../lib/manualConnections.js";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// Tight limit on credential endpoints to blunt brute-force / enumeration.
const authRateLimit = {
  config: {
    rateLimit: { max: 10, timeWindow: "1 minute" },
  },
};

export default async function authRoutes(app: FastifyInstance) {
  // Signup: create the app user. Post for Me has no per-user "profile" — social
  // accounts are created lazily when the user connects them.
  app.post("/auth/signup", authRateLimit, async (req, reply) => {
    const body = credentialsSchema.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.issues[0]?.message });
    }
    if (userStore.findByEmail(body.data.email)) {
      return reply.code(409).send({ error: "Email already registered" });
    }

    const user = userStore.create(body.data.email, body.data.password);

    return reply.code(201).send({
      token: signSessionToken(user.id),
      user: { id: user.id, email: user.email },
    });
  });

  app.post("/auth/login", authRateLimit, async (req, reply) => {
    const body = credentialsSchema.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.issues[0]?.message });
    }
    const user = userStore.findByEmail(body.data.email);
    if (!user || !verifyPassword(body.data.password, user.passwordHash)) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }
    return {
      token: signSessionToken(user.id),
      user: { id: user.id, email: user.email },
    };
  });

  app.get(
    "/auth/me",
    { preHandler: (req, reply) => app.requireAuth(req, reply) },
    async (req) => ({ user: { id: req.user.id, email: req.user.email } })
  );

  // In-app account deletion — required by App Store Guideline 5.1.1(v).
  // Disconnects the user's connected social accounts and Discord/Telegram
  // credentials, removes their post history and persisted media, and finally
  // the local account itself.
  app.delete(
    "/auth/me",
    { preHandler: (req, reply) => app.requireAuth(req, reply) },
    async (req, reply) => {
      const userId = req.user.id;

      // Cancel provider-side future posts before disconnecting their accounts.
      const scheduledPosts = postStore
        .listByUser(userId)
        .filter(
          (post) =>
            post.pfmPostId &&
            post.scheduledAt &&
            new Date(post.scheduledAt).getTime() > Date.now()
        );
      await Promise.all(
        scheduledPosts.map((post) =>
          postForMe.deletePost(post.pfmPostId!).catch((err) =>
            req.log.warn({ err, postId: post.id }, "Failed to cancel scheduled post")
          )
        )
      );

      // Best-effort: disconnect every Post for Me social account for this user.
      // Don't block account removal if a call fails — log and continue.
      try {
        const accounts = await postForMe.listAccounts(userId);
        await Promise.all(
          accounts.map((a) =>
            postForMe.disconnectAccount(a.id).catch((err) =>
              req.log.warn({ err, accountId: a.id }, "Failed to disconnect account")
            )
          )
        );
      } catch (err) {
        req.log.error({ err, userId }, "Listing accounts for deletion failed; continuing");
      }
      manualStore.deleteAll(userId);

      // Remove post history and any media directories kept for retries.
      const removedPosts = postStore.deleteByUser(userId);
      for (const post of removedPosts) {
        const dir = post.mediaFiles?.[0]
          ? dirname(post.mediaFiles[0].path)
          : join(MEDIA_DIR, post.id);
        try {
          rmSync(dir, { recursive: true, force: true });
        } catch (err) {
          req.log.warn({ err, dir }, "Failed to remove media directory");
        }
      }

      userStore.delete(userId);
      return reply.code(204).send();
    }
  );
}
