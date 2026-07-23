import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { cancelScheduledPost, fetchHistory, retryPost } from "../../src/api/beamloop";
import {
  PLATFORM_LABELS,
  type Platform,
  type PostRecord,
} from "../../src/api/types";
import { SpinArc } from "../../src/components/SpinArc";
import { PlatformGlyph } from "../../src/components/PlatformGlyph";
import { Stripes } from "../../src/components/Stripes";
import {
  fonts,
  monoTracking,
  palette,
  platformHue,
  radius,
  sharedStyles as s,
  sizes,
  spacing,
  tracking,
  type,
} from "../../src/theme";

type Filter = "all" | "scheduled" | "posted" | "failed";

const monthDay = (iso: string) =>
  new Date(iso)
    .toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
    .toUpperCase()
    .replace(",", " ·");

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const [posts, setPosts] = useState<PostRecord[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [canceling, setCanceling] = useState<string | null>(null);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setPosts(await fetchHistory());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load history");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      // "Check later" can arrive before the upload request has created its
      // History record. Briefly refresh on focus so the new item appears
      // without requiring a manual pull-to-refresh.
      const timers = [2_000, 5_000, 10_000, 20_000].map((delay) =>
        setTimeout(() => void load(), delay)
      );
      return () => timers.forEach(clearTimeout);
    }, [load])
  );

  // The publishing provider settles video results asynchronously. Refresh the
  // visible history while there is work in flight instead of making people
  // leave and reopen the screen to learn the outcome.
  const hasPending =
    posts?.some(
      (post) =>
        (!post.scheduledAt || new Date(post.scheduledAt).getTime() <= Date.now()) &&
        post.results.some((result) => result.pending)
    ) ?? false;
  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(() => void load(), 8_000);
    return () => clearInterval(timer);
  }, [hasPending, load]);

  // If the screen stays open, refresh just after the next scheduled item is
  // due so it naturally moves from Scheduled to Publishing/Posted.
  const nextScheduledAt = (posts ?? [])
    .map((post) => post.scheduledAt)
    .filter((value): value is string => Boolean(value && new Date(value).getTime() > Date.now()))
    .sort()[0];
  useEffect(() => {
    if (!nextScheduledAt) return;
    const delay = Math.min(
      Math.max(new Date(nextScheduledAt).getTime() - Date.now() + 1_000, 1_000),
      2_147_000_000
    );
    const timer = setTimeout(() => void load(), delay);
    return () => clearTimeout(timer);
  }, [nextScheduledAt, load]);

  const retry = async (post: PostRecord) => {
    setRetrying(post.id);
    setError(null);
    try {
      await retryPost(post.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setRetrying(null);
    }
  };

  const cancel = (post: PostRecord) => {
    Alert.alert(
      post.launchDrop ? "Cancel Launch Drop?" : "Cancel scheduled post?",
      post.launchDrop
        ? "The coordinated release will be removed from every channel before launch."
        : "It will be removed from every selected channel before it goes live.",
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Cancel post",
          style: "destructive",
          onPress: async () => {
            setCanceling(post.id);
            setError(null);
            try {
              await cancelScheduledPost(post.id);
              await load();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Couldn't cancel the post");
            } finally {
              setCanceling(null);
            }
          },
        },
      ]
    );
  };

  // Pending (still publishing) doesn't count as failed.
  const isFailed = (r: { success: boolean; pending?: boolean }) =>
    !r.success && !r.pending;

  const failedCount =
    posts?.filter((p) => p.results.some(isFailed)).length ?? 0;

  const visible = (posts ?? []).filter((p) => {
    const isScheduled = Boolean(
      p.scheduledAt && new Date(p.scheduledAt).getTime() > Date.now()
    );
    const hasFail = p.results.some(isFailed);
    const hasPosted = p.results.some((result) => result.success);
    if (filter === "scheduled") return isScheduled;
    if (filter === "failed") return hasFail;
    if (filter === "posted") return hasPosted && !isScheduled;
    return true;
  });

  if (!posts && !error) {
    return (
      <SafeAreaView
        style={[s.screen, { alignItems: "center", justifyContent: "center" }]}
      >
        <ActivityIndicator color={palette.signal} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.console }} edges={["top"]}>
      <View style={{ paddingHorizontal: spacing.xxl, paddingTop: 10, paddingBottom: spacing.md }}>
        <Text style={{ ...type.displayTitle, color: palette.text }}>History</Text>
        <View style={[s.row, { gap: spacing.sm, marginTop: spacing.rowPad, flexWrap: "wrap" }]}> 
          <FilterChip
            label="All"
            active={filter === "all"}
            onPress={() => setFilter("all")}
          />
          <FilterChip
            label="Scheduled"
            active={filter === "scheduled"}
            onPress={() => setFilter("scheduled")}
          />
          <FilterChip
            label="Posted"
            active={filter === "posted"}
            onPress={() => setFilter("posted")}
          />
          <FilterChip
            label={failedCount > 0 ? `Failed · ${failedCount}` : "Failed"}
            active={filter === "failed"}
            danger
            onPress={() => setFilter("failed")}
          />
        </View>
      </View>

      {error && (
        <Text style={[s.errorText, { paddingHorizontal: spacing.xxl, marginBottom: spacing.sm }]}>
          {error}
        </Text>
      )}

      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: spacing.screenX,
          gap: spacing.md,
          paddingTop: spacing.xs,
          paddingBottom: sizes.tabBar + insets.bottom + spacing.xl,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={palette.textSecondary}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        ListEmptyComponent={
          <Text
            style={{
              ...type.bodySm,
              color: palette.textSecondary,
              textAlign: "center",
              marginTop: 40,
            }}
          >
            {filter === "all"
              ? "Nothing published yet — hit the transmit button to beam your first post."
              : "Nothing here."}
          </Text>
        }
        renderItem={({ item }) => (
          <PostRow
            post={item}
            retrying={retrying === item.id}
            canceling={canceling === item.id}
            expanded={expandedPostId === item.id}
            onToggle={() =>
              setExpandedPostId((current) => (current === item.id ? null : item.id))
            }
            onRetry={() => retry(item)}
            onCancel={() => cancel(item)}
          />
        )}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------- pieces

function FilterChip({
  label,
  active,
  danger,
  onPress,
}: {
  label: string;
  active: boolean;
  danger?: boolean;
  onPress: () => void;
}) {
  const bg = active
    ? palette.signal
    : danger
      ? palette.dangerBg
      : palette.strip;
  const border = active
    ? palette.signal
    : danger
      ? palette.dangerBorder
      : palette.borderStrong;
  const color = active
    ? palette.console
    : danger
      ? palette.danger
      : palette.textSecondary;
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 15,
        paddingVertical: 7,
        borderRadius: radius.pill,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: border,
      }}
    >
      <Text
        style={{
          ...type.mono,
          fontFamily: active ? fonts.monoBold : fonts.mono,
          color,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function PostRow({
  post,
  retrying,
  canceling,
  expanded,
  onToggle,
  onRetry,
  onCancel,
}: {
  post: PostRecord;
  retrying: boolean;
  canceling: boolean;
  expanded: boolean;
  onToggle: () => void;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const failed = post.results.filter((r) => !r.success && !r.pending);
  const hasFail = failed.length > 0;
  const pendingCount = post.results.filter((r) => r.pending).length;
  const hasPending = pendingCount > 0;
  const isScheduled = Boolean(
    post.scheduledAt && new Date(post.scheduledAt).getTime() > Date.now()
  );
  const firstHue = platformHue[post.platforms[0] as Platform] ?? palette.signal;
  const failedLabels = failed.map((r) => PLATFORM_LABELS[r.platform]).join(", ");
  const okCount = post.results.filter((r) => r.success).length;

  return (
    <View
      style={{
        backgroundColor: palette.strip,
        borderWidth: 1,
        borderColor: hasFail ? palette.dangerBorder : palette.borderFaint,
        borderRadius: radius.card,
        overflow: "hidden",
      }}
    >
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? "Hide" : "Show"} details for ${post.title}`}
        style={{ flexDirection: "row", gap: spacing.rowPad, padding: spacing.rowPad }}
      >
        {/* striped thumb with hue spine */}
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: radius.input,
            overflow: "hidden",
            borderLeftWidth: 3,
            borderLeftColor: firstHue,
            flexShrink: 0,
          }}
        >
          <Stripes spacing={14} style={{ flex: 1 }} />
        </View>

        <View style={{ flex: 1, minWidth: 0, justifyContent: "space-between" }}>
          <View>
            <View style={[s.row, { justifyContent: "space-between", gap: spacing.sm }]}>
              <Text
                numberOfLines={2}
                style={{ ...type.itemTitleSm, color: palette.text, flex: 1 }}
              >
                {post.title}
              </Text>
              <Text style={{ ...type.monoMeta, color: palette.textMono, flexShrink: 0 }}>
                {expanded ? "HIDE ↑" : "DETAILS ↓"}
              </Text>
            </View>
            <Text style={{ ...type.monoMeta, color: palette.textLabel, marginTop: 4 }}>
              {isScheduled
                ? `${post.launchDrop ? "LAUNCH DROP" : "GOES LIVE"} ${monthDay(post.scheduledAt!)}`
                : monthDay(post.createdAt)}
            </Text>
          </View>
          <View style={[s.row, { gap: 8, marginTop: spacing.sm }]}>
            <View style={[s.row, { gap: 5, flexShrink: 0 }]}>
              {post.results.map((r) => (
                <StatusPip
                  key={r.platform}
                  platform={r.platform}
                  ok={r.success}
                  pending={r.pending}
                />
              ))}
            </View>
            <Text
              numberOfLines={1}
              style={{
                ...type.monoMeta,
                flexShrink: 1,
                textAlign: "right",
                color: hasFail
                  ? palette.danger
                  : hasPending
                    ? palette.warning
                    : palette.success,
              }}
            >
              {isScheduled
                ? hasFail
                  ? `${post.results.length - failed.length} scheduled · ${failed.length} failed`
                  : post.launchDrop
                    ? `Launch Drop · ${post.results.length} synchronized`
                    : `Scheduled · ${post.results.length} channel${post.results.length === 1 ? "" : "s"}`
                : hasFail
                ? okCount > 0
                  ? `${okCount} live · ${failed.length} failed`
                  : `${failed.length} failed`
                : hasPending
                  ? okCount > 0
                    ? `${okCount} live · ${pendingCount} confirming`
                    : `${pendingCount} awaiting confirmation`
                  : `All ${post.results.length} live`}
            </Text>
          </View>
        </View>
      </Pressable>

      {expanded && (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: palette.borderFaint,
            padding: spacing.rowPad,
            gap: spacing.sm,
          }}
        >
          <Text style={s.sectionLabel}>Channel results</Text>
          {post.results.map((result) => (
            <View
              key={result.platform}
              style={{
                backgroundColor: palette.console,
                borderWidth: 1,
                borderColor: result.success
                  ? palette.border
                  : result.pending
                    ? palette.borderStrong
                    : palette.dangerBorderSoft,
                borderRadius: radius.input,
                padding: spacing.md,
                gap: 7,
              }}
            >
              <View style={[s.row, { justifyContent: "space-between", gap: spacing.md }]}>
                <View style={[s.row, { gap: spacing.sm, flex: 1 }]}>
                  <PlatformGlyph
                    platform={result.platform}
                    size={17}
                    color={
                      result.success
                        ? platformHue[result.platform]
                        : result.pending
                          ? palette.warning
                          : palette.danger
                    }
                  />
                  <Text style={{ ...type.itemTitleSm, color: palette.text }}>
                    {PLATFORM_LABELS[result.platform]}
                  </Text>
                </View>
                <Text
                  style={{
                    ...type.monoMeta,
                    color: result.success
                      ? palette.success
                      : result.pending
                        ? palette.warning
                        : palette.danger,
                  }}
                >
                  {result.success ? "LIVE" : result.pending ? "CONFIRMING" : "FAILED"}
                </Text>
              </View>
              {result.pending && (
                <Text style={{ ...type.bodyXs, color: palette.textSecondary }}>
                  The platform may already be live; BeamLoop is waiting for its final result.
                </Text>
              )}
              {result.error && (
                <Text style={{ ...type.bodyXs, color: palette.danger }}>
                  {result.error}
                </Text>
              )}
              {result.url && (
                <Pressable
                  onPress={() => void Linking.openURL(result.url!)}
                  hitSlop={8}
                  style={{ alignSelf: "flex-start", paddingVertical: 3 }}
                >
                  <Text style={{ ...type.monoMeta, color: palette.signal }}>
                    OPEN LIVE POST ↗
                  </Text>
                </Pressable>
              )}
            </View>
          ))}

          {hasFail && !isScheduled && (
            retrying ? (
              <View style={[s.row, { justifyContent: "center", paddingVertical: 6 }]}>
                <SpinArc size={16} color={palette.danger} />
              </View>
            ) : (
              <Pressable
                onPress={onRetry}
                style={{
                  alignSelf: "flex-start",
                  paddingVertical: 7,
                  paddingHorizontal: 12,
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: palette.dangerBorder,
                }}
              >
                <Text style={{ ...type.monoMeta, color: palette.danger }}>
                  Retry {failed.length === 1 ? failedLabels : `${failed.length} platforms`} ›
                </Text>
              </Pressable>
            )
          )}
        </View>
      )}

      {isScheduled && (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: palette.borderFaint,
            paddingHorizontal: spacing.rowPad,
            paddingVertical: spacing.sm,
            alignItems: "flex-start",
          }}
        >
          <Pressable
            onPress={onCancel}
            disabled={canceling}
            style={{ paddingVertical: 6, paddingHorizontal: 10 }}
          >
            <Text style={{ ...type.monoMeta, color: palette.danger }}>
              {canceling
                ? "CANCELING…"
                : post.launchDrop
                  ? "CANCEL LAUNCH DROP"
                  : "CANCEL SCHEDULED POST"}
            </Text>
          </Pressable>
        </View>
      )}

    </View>
  );
}

function StatusPip({
  platform,
  ok,
  pending,
}: {
  platform: string;
  ok: boolean;
  pending?: boolean;
}) {
  const hue = platformHue[platform as Platform] ?? palette.textLabel;
  const outline = pending ? palette.warning : palette.danger;
  return (
    <View
      style={{
        width: sizes.pip,
        height: sizes.pip,
        borderRadius: radius.pip,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: ok ? hue : "transparent",
        borderWidth: ok ? 0 : 1.5,
        borderColor: outline,
      }}
    >
      <PlatformGlyph
        platform={platform as Platform}
        size={11}
        color={ok ? palette.console : outline}
      />
    </View>
  );
}
