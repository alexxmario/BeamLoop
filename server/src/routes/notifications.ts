import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { isExpoPushToken, pushTokenStore } from "../lib/push.js";

const tokenSchema = z.object({
  token: z.string().min(1).max(255).refine(isExpoPushToken, {
    message: "Not an Expo push token",
  }),
});

export default async function notificationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", (req, reply) => app.requireAuth(req, reply));

  // Register (or re-register) this device for the signed-in user. The app
  // calls this on every launch, because Expo can rotate a token at any time.
  app.post("/notifications/token", async (req, reply) => {
    const body = tokenSchema.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.issues[0]?.message });
    }
    pushTokenStore.save(req.user.id, body.data.token);
    return { registered: true };
  });

  // Called on sign-out so the next person to use the device doesn't receive
  // the previous account's notifications.
  app.delete("/notifications/token", async (req, reply) => {
    const body = tokenSchema.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.issues[0]?.message });
    }
    pushTokenStore.delete(body.data.token);
    return reply.code(204).send();
  });
}
