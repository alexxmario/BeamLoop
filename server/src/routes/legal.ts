import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  accountDeletionPage,
  landingPage,
  privacyPage,
  robotsText,
  securityText,
  sitemapXml,
  supportPage,
  termsPage,
} from "../lib/publicSite.js";

async function readPublicAsset(packagedName: string, localName: string) {
  try {
    return await readFile(resolve(process.cwd(), "public", packagedName));
  } catch {
    return readFile(resolve(process.cwd(), "..", localName));
  }
}

const pageHeaders = {
  "content-security-policy":
    "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "cache-control": "public, max-age=300",
};

export default async function legalRoutes(app: FastifyInstance) {
  const sendPage = (reply: FastifyReply, html: string) =>
    reply.headers(pageHeaders).type("text/html; charset=utf-8").send(html);

  app.get("/", async (_req, reply) => sendPage(reply, landingPage()));
  app.get("/support", async (_req, reply) => sendPage(reply, supportPage()));
  app.get("/account-deletion", async (_req, reply) =>
    sendPage(reply, accountDeletionPage())
  );

  app.get("/legal/privacy", async (_req, reply) => {
    return sendPage(reply, privacyPage());
  });

  app.get("/legal/terms", async (_req, reply) => {
    return sendPage(reply, termsPage());
  });

  app.get("/privacy", async (_req, reply) => reply.redirect("/legal/privacy", 308));
  app.get("/terms", async (_req, reply) => reply.redirect("/legal/terms", 308));
  app.get("/delete-account", async (_req, reply) =>
    reply.redirect("/account-deletion", 308)
  );

  app.get("/assets/app-icon.png", async (_req, reply) =>
    reply
      .header("cache-control", "public, max-age=86400")
      .type("image/png")
      .send(await readPublicAsset("app-icon.png", "beamloop-icon-1024.png"))
  );
  app.get("/assets/archivo-expanded-extra-bold.ttf", async (_req, reply) =>
    reply
      .header("cache-control", "public, max-age=86400")
      .type("font/ttf")
      .send(
        await readPublicAsset(
          "archivo-expanded-extra-bold.ttf",
          "mobile/assets/fonts/ArchivoExpanded-ExtraBold.ttf"
        )
      )
  );
  app.get("/favicon.svg", async (_req, reply) =>
    reply.redirect("/assets/app-icon.png", 308)
  );
  app.get("/robots.txt", async (_req, reply) =>
    reply.type("text/plain; charset=utf-8").send(robotsText())
  );
  app.get("/sitemap.xml", async (_req, reply) =>
    reply.type("application/xml; charset=utf-8").send(sitemapXml())
  );
  app.get("/.well-known/security.txt", async (_req, reply) =>
    reply.type("text/plain; charset=utf-8").send(securityText())
  );
}
