import { api, apiUpload, tokenStorage } from "./client";
import type {
  Connection,
  Platform,
  PostPlacement,
  PostRecord,
  SessionUser,
  UploadUsage,
} from "./types";

interface AuthResponse {
  token: string;
  user: SessionUser;
}

export async function signup(email: string, password: string) {
  const res = await api<AuthResponse>("/auth/signup", {
    method: "POST",
    body: { email, password },
    auth: false,
  });
  await tokenStorage.set(res.token);
  return res.user;
}

export async function login(email: string, password: string) {
  const res = await api<AuthResponse>("/auth/login", {
    method: "POST",
    body: { email, password },
    auth: false,
  });
  await tokenStorage.set(res.token);
  return res.user;
}

export async function fetchMe() {
  const res = await api<{ user: SessionUser }>("/auth/me");
  return res.user;
}

export async function deleteAccount() {
  await api("/auth/me", { method: "DELETE" });
  await tokenStorage.clear();
}

export async function fetchConnections() {
  const res = await api<{ connections: Connection[] }>("/connections");
  return res.connections;
}

export async function fetchConnectUrl(platforms?: Platform[]) {
  return api<{ access_url: string; duration: string }>("/connections/link", {
    method: "POST",
    body: platforms ? { platforms } : {},
  });
}

export interface PickedMedia {
  uri: string;
  name: string;
  type: string; // mime type
  size?: number;
  width?: number;
  height?: number;
  durationMs?: number;
}

interface UploadResult {
  post: PostRecord;
  usage: UploadUsage | null;
}

export interface UploadOptions {
  title: string;
  platforms: Platform[];
  description?: string;
  // Per-platform caption overrides, forwarded as `<platform>_title`.
  overrides?: Partial<Record<Platform, string>>;
  placements?: Partial<Record<Platform, PostPlacement>>;
  scheduledAt?: string;
  launchDrop?: boolean;
}

function baseUploadForm({
  title,
  platforms,
  description,
  overrides,
  placements,
  scheduledAt,
  launchDrop,
}: UploadOptions) {
  const form = new FormData();
  form.append("title", title);
  if (description) form.append("description", description);
  for (const p of platforms) form.append("platform[]", p);
  for (const [platform, text] of Object.entries(overrides ?? {})) {
    if (text?.trim()) form.append(`${platform}_title`, text.trim());
  }
  for (const [platform, placement] of Object.entries(placements ?? {})) {
    if (placement) form.append(`${platform}_placement`, placement);
  }
  if (scheduledAt) form.append("scheduled_at", scheduledAt);
  if (launchDrop) form.append("launch_drop", "true");
  return form;
}

export function uploadVideo(
  video: PickedMedia,
  options: UploadOptions,
  idempotencyKey: string,
  thumbnail?: PickedMedia
) {
  const form = baseUploadForm(options);
  // React Native FormData takes { uri, name, type } for files.
  form.append("video", video as unknown as Blob);
  if (thumbnail) form.append("thumbnail", thumbnail as unknown as Blob);
  return apiUpload<UploadResult>("/uploads/video", form, { "Idempotency-Key": idempotencyKey });
}

export function uploadPhotos(
  photos: PickedMedia[],
  options: UploadOptions,
  idempotencyKey: string,
  thumbnail?: PickedMedia
) {
  const form = baseUploadForm(options);
  for (const photo of photos) {
    form.append("photos[]", photo as unknown as Blob);
  }
  if (thumbnail) form.append("thumbnail", thumbnail as unknown as Blob);
  return apiUpload<UploadResult>("/uploads/photos", form, { "Idempotency-Key": idempotencyKey });
}

export function retryPost(postId: string, platforms?: Platform[]) {
  return api<UploadResult>(`/uploads/${postId}/retry`, {
    method: "POST",
    body: platforms ? { platforms } : {},
  });
}

export function cancelScheduledPost(postId: string) {
  return api(`/uploads/${postId}`, { method: "DELETE" });
}

export async function fetchHistory() {
  const res = await api<{ posts: PostRecord[] }>("/uploads/history");
  return res.posts;
}

export async function fetchPostStatus(postId: string) {
  const res = await api<{ post: PostRecord }>(`/uploads/${postId}`);
  return res.post;
}

export function connectDiscord(webhookUrl: string, name?: string) {
  return api<{ success: boolean; message: string }>("/connections/discord", {
    method: "POST",
    body: { webhook_url: webhookUrl, name },
  });
}

export function connectTelegram(botToken: string, chatId: string, name?: string) {
  return api<{ success: boolean; message: string }>("/connections/telegram", {
    method: "POST",
    body: { bot_token: botToken, chat_id: chatId, name },
  });
}

export function disconnectPlatform(platform: Platform) {
  return api<{ success: boolean }>(`/connections/${platform}`, { method: "DELETE" });
}
