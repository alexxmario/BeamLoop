import { readFile } from "node:fs/promises";
import type { FastifyInstance } from "fastify";

const privacyPolicy = new URL("../../legal/privacy-policy.md", import.meta.url);
const termsOfService = new URL("../../legal/terms-of-service.md", import.meta.url);

export default async function legalRoutes(app: FastifyInstance) {
  app.get("/legal/privacy", async (_req, reply) => {
    const policy = await readFile(privacyPolicy, "utf8");
    return reply.type("text/markdown; charset=utf-8").send(policy);
  });

  app.get("/legal/terms", async (_req, reply) => {
    const terms = await readFile(termsOfService, "utf8");
    return reply.type("text/markdown; charset=utf-8").send(terms);
  });
}
