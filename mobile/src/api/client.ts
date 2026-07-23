import * as SecureStore from "expo-secure-store";

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

const TOKEN_KEY = "beamloop.sessionToken";

export const tokenStorage = {
  get: () => SecureStore.getItemAsync(TOKEN_KEY),
  set: (token: string) => SecureStore.setItemAsync(TOKEN_KEY, token),
  clear: () => SecureStore.deleteItemAsync(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

// Surface unreachable-server situations as errors instead of hanging the
// UI forever (e.g. when the backend host/IP changes).
const REQUEST_TIMEOUT_MS = 15_000;
const UPLOAD_TIMEOUT_MS = 180_000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (controller.signal.aborted) {
      throw new ApiError(
        "Can't reach the BeamLoop server — is it running and on the same network?",
        0
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {}
): Promise<T> {
  const { method = "GET", body, auth = true } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = await tokenStorage.get();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetchWithTimeout(
    `${API_BASE_URL}${path}`,
    {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    },
    REQUEST_TIMEOUT_MS
  );

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(
      typeof json.error === "string" ? json.error : `Request failed (${res.status})`,
      res.status
    );
  }
  return json as T;
}

// Multipart POST for media uploads. Content-Type is left to fetch so the
// boundary is set correctly.
export async function apiUpload<T>(
  path: string,
  form: FormData,
  extraHeaders: Record<string, string> = {}
): Promise<T> {
  const token = await tokenStorage.get();
  const res = await fetchWithTimeout(
    `${API_BASE_URL}${path}`,
    {
      method: "POST",
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extraHeaders },
      body: form,
    },
    UPLOAD_TIMEOUT_MS
  );

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(
      typeof json.error === "string" ? json.error : `Upload failed (${res.status})`,
      res.status
    );
  }
  return json as T;
}
