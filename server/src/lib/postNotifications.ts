import { postStore, type PostRecord } from "./posts.js";
import { sendPush } from "./push.js";

/**
 * Turns a settled post into a push notification.
 *
 * BeamLoop schedules posts and publishes video asynchronously, so the outcome
 * routinely lands long after the user has closed the app. Without this they
 * have to reopen History and check by hand.
 */

const LABELS: Record<string, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  facebook: "Facebook",
  x: "X",
  threads: "Threads",
  linkedin: "LinkedIn",
};

const label = (platform: string) => LABELS[platform] ?? platform;

// Join platform names the way a person would read them out.
function listOf(platforms: string[]): string {
  const names = platforms.map(label);
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// An immediate post that resolves this quickly resolved while the user was
// still watching the transmit screen, so notifying them would just be telling
// them what they already saw. Scheduled posts always notify.
const WATCHING_WINDOW_MS = 90_000;

function buildMessage(post: PostRecord) {
  const succeeded = post.results.filter((r) => r.success).map((r) => r.platform);
  const failed = post.results.filter((r) => !r.success).map((r) => r.platform);

  if (failed.length === 0) {
    return {
      title: post.launchDrop ? "Launch Drop is live" : "Your post is live",
      body: `Published to ${listOf(succeeded)}.`,
    };
  }
  if (succeeded.length === 0) {
    return {
      title: "Post didn't go out",
      body: `${listOf(failed)} couldn't be published. Open History to see why.`,
    };
  }
  return {
    title: "Partly published",
    body: `Live on ${listOf(succeeded)}, but ${listOf(failed)} failed.`,
  };
}

/**
 * Call after any write that may have settled a post's last pending platform.
 * Safe to call repeatedly: the first send stamps the record, and nothing is
 * ever sent twice.
 */
export async function notifyPostSettled(
  postId: string,
  log?: { warn: (obj: unknown, msg: string) => void }
): Promise<void> {
  const post = postStore.findById(postId);
  if (!post || post.notifiedAt) return;
  if (post.results.length === 0 || post.results.some((r) => r.pending)) return;

  const wasScheduled = Boolean(post.scheduledAt);
  const age = Date.now() - new Date(post.createdAt).getTime();
  if (!wasScheduled && age < WATCHING_WINDOW_MS) return;

  // Stamp before sending so two platforms settling at once can't both notify.
  postStore.update(post.id, { notifiedAt: new Date().toISOString() });

  const { title, body } = buildMessage(post);
  await sendPush(
    post.userId,
    { title, body, data: { type: "post-settled", postId: post.id } },
    log
  );
}
