import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import { cancelScheduledPost, fetchHistory, retryPost } from "../../src/api/beamloop";
import {
  PLATFORM_LABELS,
  type Platform,
  type PostRecord,
} from "../../src/api/types";
import { SpinArc } from "../../src/components/SpinArc";
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
      load();
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
    if (filter === "scheduled") return isScheduled;
    if (filter === "failed") return hasFail;
    if (filter === "posted") return !hasFail && !isScheduled;
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
  onRetry,
  onCancel,
}: {
  post: PostRecord;
  retrying: boolean;
  canceling: boolean;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const failed = post.results.filter((r) => !r.success && !r.pending);
  const hasFail = failed.length > 0;
  const hasPending = post.results.some((r) => r.pending);
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
      <View style={{ flexDirection: "row", gap: spacing.rowPad, padding: spacing.rowPad }}>
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
            <Text
              numberOfLines={2}
              style={{ ...type.itemTitleSm, color: palette.text }}
            >
              {post.title}
            </Text>
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
                ? `${failed.length} of ${post.results.length} failed`
                : hasPending
                  ? "Publishing…"
                  : `All ${post.results.length} live`}
            </Text>
          </View>
        </View>
      </View>

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

      {/* failure detail + single retry action */}
      {hasFail && (
        <View
          style={{
            backgroundColor: palette.dangerBgSoft,
            borderTopWidth: 1,
            borderTopColor: palette.dangerBorderSoft,
            padding: spacing.rowPad,
            gap: spacing.sm,
          }}
        >
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Svg width={16} height={16} viewBox="0 0 24 24" style={{ marginTop: 2, flexShrink: 0 }}>
              <Circle cx={12} cy={12} r={9} stroke={palette.danger} strokeWidth={2} fill="none" />
              <Path d="M12 7v6M12 16.5v.5" stroke={palette.danger} strokeWidth={2} />
            </Svg>
            <View style={{ flex: 1 }}>
              <Text style={{ ...type.bodyXs, fontFamily: fonts.semibold, color: palette.danger }}>
                {failedLabels} didn't go out
              </Text>
              <Text style={{ ...type.mono, fontSize: 12, color: palette.textSecondary, marginTop: 2 }}>
                {failed[0]?.error ?? "The platform rejected the post."}
                {okCount > 0 ? ` The other ${okCount} went out fine.` : ""}
              </Text>
            </View>
          </View>
          {isScheduled ? null : retrying ? (
            <View style={[s.row, { justifyContent: "center", paddingVertical: 6 }]}>
              <SpinArc size={16} color={palette.danger} />
            </View>
          ) : (
            <Pressable
              onPress={onRetry}
              style={{
                alignSelf: "flex-start",
                paddingVertical: 6,
                paddingHorizontal: 12,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: palette.dangerBorder,
              }}
              hitSlop={8}
            >
              <Text
                style={{
                  ...type.monoMeta,
                  color: palette.danger,
                  letterSpacing: tracking(monoTracking.status, type.monoMeta.fontSize),
                }}
              >
                Retry {failed.length === 1 ? failedLabels : `${failed.length} platforms`} ›
              </Text>
            </Pressable>
          )}
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
      <Svg width={ok ? 11 : 10} height={ok ? 11 : 10} viewBox="0 0 24 24">
        {ok ? (
          <Path
            d="M5 13l4 4L19 7"
            stroke={palette.console}
            strokeWidth={3.5}
            fill="none"
          />
        ) : pending ? (
          <Circle cx={12} cy={12} r={3} fill={palette.warning} />
        ) : (
          <Path
            d="M6 6l12 12M18 6L6 18"
            stroke={palette.danger}
            strokeWidth={3.5}
            fill="none"
          />
        )}
      </Svg>
    </View>
  );
}
