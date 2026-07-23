import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { userStore, type AppUser } from "../lib/store.js";

declare module "fastify" {
  interface FastifyRequest {
    user: AppUser;
  }
  interface FastifyInstance {
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export function signSessionToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.APP_JWT_SECRET, { expiresIn: "30d" });
}

export default fp(async function authPlugin(app: FastifyInstance) {
  app.decorateRequest("user");

  app.decorate(
    "requireAuth",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const header = req.headers.authorization;
      if (!header?.startsWith("Bearer ")) {
        return reply.code(401).send({ error: "Missing bearer token" });
      }
      try {
        const payload = jwt.verify(header.slice(7), config.APP_JWT_SECRET);
        const userId = typeof payload === "object" ? payload.sub : undefined;
        const user = userId ? userStore.findById(userId) : undefined;
        if (!user) {
          return reply.code(401).send({ error: "Unknown user" });
        }
        req.user = user;
      } catch {
        return reply.code(401).send({ error: "Invalid or expired token" });
      }
    }
  );
});
