import { db } from "./db.js";

/**
 * Expo push delivery. The app registers its Expo push token after signing in
 * and we send through Expo's service (https://docs.expo.dev/push-notifications),
 * which fronts APNs — so no Apple push key ever lives on this server.
 *
 * Delivery is strictly best-effort: a post's outcome is already recorded in
 * SQLite before anything is sent, and History is the source of truth. A push
 * that fails must never affect publishing.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const SEND_TIMEOUT_MS = 15_000;
// Expo accepts up to 100 messages per request.
const CHUNK_SIZE = 100;

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

interface ExpoTicket {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
}

// Expo tokens look like ExponentPushToken[xxxxxxxx] (or ExpoPushToken[...]).
// Reject anything else rather than storing junk we will never be able to use.
export function isExpoPushToken(token: string): boolean {
  return /^Expo(nent)?PushToken\[[^\]\s]+\]$/.test(token);
}

export const pushTokenStore = {
  save(userId: string, token: string) {
    // The token is the primary key, so signing in as a different user on the
    // same device reassigns it instead of notifying the previous account.
    db.prepare(
      `INSERT INTO push_tokens (token, userId, createdAt)
       VALUES (?, ?, ?)
       ON CONFLICT(token) DO UPDATE SET userId = excluded.userId`
    ).run(token, userId, new Date().toISOString());
  },

  listForUser(userId: string): string[] {
    return (
      db
        .prepare("SELECT token FROM push_tokens WHERE userId = ?")
        .all(userId) as Array<{ token: string }>
    ).map((row) => row.token);
  },

  delete(token: string) {
    db.prepare("DELETE FROM push_tokens WHERE token = ?").run(token);
  },

  deleteByUser(userId: string) {
    db.prepare("DELETE FROM push_tokens WHERE userId = ?").run(userId);
  },
};

async function deliver(tokens: string[], message: PushMessage): Promise<void> {
  const body = tokens.map((to) => ({
    to,
    title: message.title,
    body: message.body,
    data: message.data,
    sound: "default" as const,
  }));

  const res = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Expo push responded ${res.status}`);

  const json = (await res.json()) as { data?: ExpoTicket[] };
  // Expo returns one ticket per message, in order. A DeviceNotRegistered
  // ticket means the app was deleted or the token rotated — drop it so we
  // stop sending to a dead device.
  json.data?.forEach((ticket, index) => {
    if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
      const token = tokens[index];
      if (token) pushTokenStore.delete(token);
    }
  });
}

/**
 * Send one notification to every device a user has registered. Never throws:
 * callers are publishing paths, and a push failure must not fail a post.
 */
export async function sendPush(
  userId: string,
  message: PushMessage,
  log?: { warn: (obj: unknown, msg: string) => void }
): Promise<void> {
  try {
    const tokens = pushTokenStore.listForUser(userId);
    if (tokens.length === 0) return;
    for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
      await deliver(tokens.slice(i, i + CHUNK_SIZE), message);
    }
  } catch (err) {
    log?.warn({ err, userId }, "Push notification could not be delivered");
  }
}
