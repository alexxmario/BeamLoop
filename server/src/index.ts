import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config.js";
import authPlugin from "./plugins/auth.js";
import authRoutes from "./routes/auth.js";
import connectionRoutes from "./routes/connections.js";
import uploadRoutes from "./routes/uploads.js";
import legalRoutes from "./routes/legal.js";
import webhookRoutes from "./routes/webhooks.js";
import { PostForMeError } from "./lib/postForMe.js";

// Railway terminates TLS and forwards the client address. Trusting that proxy
// lets the rate limiter operate per client rather than per Railway instance.
const app = Fastify({ logger: true, trustProxy: true });

// Native clients do not need CORS. Keep browser access closed unless a web
// origin has explicitly been configured.
await app.register(cors, {
  origin: config.CORS_ORIGIN
    ? config.CORS_ORIGIN.split(",").map((o) => o.trim())
    : false,
});
// Global abuse throttle. Per-route overrides tighten the auth endpoints.
await app.register(rateLimit, {
  global: true,
  max: 120,
  timeWindow: "1 minute",
});
await app.register(multipart, {
  limits: {
    fileSize: 500 * 1024 * 1024,
    files: 10,
    fields: 30,
    parts: 40,
  },
});
await app.register(authPlugin);

app.setErrorHandler((err, req, reply) => {
  if (err instanceof PostForMeError) {
    req.log.error({ status: err.status, body: err.body }, err.message);
    // Provider payloads can contain implementation details; keep the client
    // error stable while retaining the full payload in protected server logs.
    return reply.code(err.status >= 500 ? 502 : err.status).send({
      error: "Upstream publishing service error",
    });
  }
  req.log.error(err);
  return reply.code(500).send({ error: "Internal server error" });
});

app.get("/health", async () => ({ ok: true }));

await app.register(legalRoutes);
await app.register(webhookRoutes);
await app.register(authRoutes);
await app.register(connectionRoutes);
await app.register(uploadRoutes);

await app.listen({ port: config.PORT, host: "0.0.0.0" });
