import type { FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { tiktok, isTikTokConfigured } from "../lib/tiktok.js";
import { tiktokAccountStore } from "../lib/tiktokAccounts.js";

/**
 * The public half of the TikTok connect flow.
 *
 * TikTok redirects a browser here, so this route cannot require a bearer token
 * — the browser has none. The `state` parameter carries a short-lived signed
 * token identifying the user instead, which also serves as the CSRF check: a
 * state we did not sign is rejected before any code is exchanged.
 *
 * Registered outside the authenticated connections plugin on purpose.
 */

const STATE_TTL = "10m";

export function signTikTokState(userId: string): string {
  return jwt.sign({ sub: userId, use: "tiktok-connect" }, config.APP_JWT_SECRET, {
    expiresIn: STATE_TTL,
  });
}

function userIdFromState(state: string): string | undefined {
  try {
    const payload = jwt.verify(state, config.APP_JWT_SECRET);
    if (typeof payload !== "object" || payload.use !== "tiktok-connect") {
      return undefined;
    }
    return typeof payload.sub === "string" ? payload.sub : undefined;
  } catch {
    return undefined;
  }
}

// Hand control back to the app either way. The app re-reads /connections on
// return, so the outcome is confirmed from the server rather than trusted from
// this redirect.
function backToApp(outcome: "success" | "error", reason?: string) {
  const url = new URL(config.CONNECT_REDIRECT_URL);
  url.searchParams.set("platform", "tiktok");
  url.searchParams.set("isSuccess", outcome === "success" ? "true" : "false");
  if (reason) url.searchParams.set("error", reason);
  return url.toString();
}

export default async function tiktokAuthRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { code?: string; state?: string; error?: string; error_description?: string } }>(
    "/connections/tiktok/callback",
    async (req, reply) => {
      const { code, state, error, error_description } = req.query;

      // The creator declined, or TikTok refused before issuing a code.
      if (error) {
        req.log.warn({ error, error_description }, "TikTok authorization declined");
        return reply.redirect(
          backToApp("error", error_description || "TikTok did not authorize the connection."),
          302
        );
      }
      if (!code || !state) {
        return reply.redirect(backToApp("error", "TikTok returned an incomplete response."), 302);
      }
      const userId = userIdFromState(state);
      if (!userId) {
        // Either forged or the creator sat on the consent screen too long.
        return reply.redirect(
          backToApp("error", "That connection link expired. Try connecting again."),
          302
        );
      }
      if (!isTikTokConfigured()) {
        return reply.redirect(backToApp("error", "TikTok isn't configured on this server."), 302);
      }

      try {
        const tokens = await tiktok.exchangeCode(code);
        tiktokAccountStore.save(userId, tokens);
        // Best-effort: gives the composer a username and avatar to show
        // immediately instead of waiting for the first creator_info call.
        try {
          const info = await tiktok.creatorInfo(tokens.accessToken);
          tiktokAccountStore.saveProfile(userId, {
            username: info.creator_username,
            displayName: info.creator_nickname,
            avatarUrl: info.creator_avatar_url,
          });
        } catch (err) {
          req.log.warn({ err, userId }, "Fetching TikTok creator info after connect failed");
        }
        return reply.redirect(backToApp("success"), 302);
      } catch (err) {
        req.log.error({ err, userId }, "Exchanging the TikTok authorization code failed");
        return reply.redirect(
          backToApp("error", "BeamLoop couldn't finish connecting TikTok. Try again."),
          302
        );
      }
    }
  );
}
