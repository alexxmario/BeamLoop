import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path, Rect } from "react-native-svg";
import {
  disconnectPlatform,
  fetchConnections,
  fetchConnectUrl,
} from "../../src/api/beamloop";
import { fetchBillingStatus } from "../../src/api/beamloop";
import { API_BASE_URL } from "../../src/api/client";
import {
  PLATFORM_LABELS,
  isComingSoon,
  type BillingStatus,
  type Connection,
  type Platform,
} from "../../src/api/types";
import { useNotice } from "../../src/components/Notice";
import { PlatformTile } from "../../src/components/PlatformTile";
import { SpinArc } from "../../src/components/SpinArc";
import { useReducedMotion } from "../../src/hooks/useReducedMotion";
import {
  monoTracking,
  motion,
  palette,
  platformHue,
  radius,
  sharedStyles as s,
  sizes,
  spacing,
  spectrum,
  tracking,
  type,
} from "../../src/theme";

// Must match the backend's CONNECT_REDIRECT_URL and the "beamloop" scheme
// in app.json.
const REDIRECT_URL = "beamloop://connections/callback";
const CONNECTION_REFRESH_DELAYS_MS = [0, 500, 1_000, 2_000, 3_500, 5_000];

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export default function ConnectionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // The failure itself is reported in a notice; this only stops the initial
  // spinner from running forever when the very first load fails.
  const [loadFailed, setLoadFailed] = useState(false);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const notice = useNotice();
  const [managing, setManaging] = useState<Platform | null>(null);
  // Platform currently in the OAuth handoff (drives sheet + OPENING state)
  const [handoff, setHandoff] = useState<Platform | null>(null);
  const sessionOpen = useRef(false);

  const load = useCallback(async () => {
    try {
      const next = await fetchConnections();
      setConnections(next);
      setLoadFailed(false);
      return next;
    } catch (e) {
      setLoadFailed(true);
      notice(e instanceof Error ? e.message : "Failed to load connections");
      return null;
    }
  }, [notice]);

  const refreshUntilConnected = useCallback(
    async (platform: Platform) => {
      for (const delay of CONNECTION_REFRESH_DELAYS_MS) {
        if (delay) await wait(delay);
        const next = await load();
        if (next?.some((connection) => connection.platform === platform && connection.connected)) {
          return true;
        }
      }
      return false;
    },
    [load]
  );

  useFocusEffect(
    useCallback(() => {
      load();
      // What the plan actually gives, on the first screen of the app. A failure
      // here is silent — the strip simply doesn't render.
      fetchBillingStatus()
        .then(setBilling)
        .catch(() => {});
    }, [load])
  );

  // Once a refetch confirms the in-progress platform is connected, close the
  // handoff sheet. This is what actually ends the flow in Expo Go, where the
  // beamloop:// redirect never resolves as `success`.
  useEffect(() => {
    if (
      handoff &&
      connections?.some((c) => c.platform === handoff && c.connected)
    ) {
      setHandoff(null);
    }
  }, [connections, handoff]);

  const openOAuth = async (platform: Platform) => {
    if (sessionOpen.current) return;
    sessionOpen.current = true;
    setHandoff(platform);
    try {
      const { access_url } = await fetchConnectUrl([platform]);
      const result = await WebBrowser.openAuthSessionAsync(access_url, REDIRECT_URL);

      // The provider redirects on both success and failure. Surface its failure
      // instead of making a completed-looking OAuth flow silently remain
      // "Not connected".
      if (result.type === "success") {
        const params = Linking.parse(result.url).queryParams ?? {};
        const successParam = Array.isArray(params.isSuccess)
          ? params.isSuccess[0]
          : params.isSuccess;
        const providerError = Array.isArray(params.error) ? params.error[0] : params.error;
        if (String(successParam).toLowerCase() === "false") {
          throw new Error(
            typeof providerError === "string" && providerError.trim()
              ? providerError
              : `${PLATFORM_LABELS[platform]} did not authorize the connection.`
          );
        }
      }

      // Account creation can become visible shortly after the browser redirect.
      // Expo Go may also report the custom-scheme return as "dismiss", so poll
      // the source of truth instead of trusting only the browser result.
      const connected = await refreshUntilConnected(platform);
      if (!connected) {
        setHandoff(null);
        notice(
          `${PLATFORM_LABELS[platform]} did not finish connecting. Try again, and make sure the provider's final confirmation succeeds.`
        );
      }
    } catch (e) {
      setHandoff(null);
      notice(e instanceof Error ? e.message : "Could not open sign-in");
    } finally {
      sessionOpen.current = false;
    }
  };

  const reconnectUnavailable = async (item: Connection) => {
    setManaging(item.platform);
    try {
      // Remove the unusable provider record first so a fresh OAuth grant
      // cannot be mistaken for the account that just failed.
      await disconnectPlatform(item.platform);
      await load();
    } catch (e) {
      notice(e instanceof Error ? e.message : "Couldn't reset this connection");
      setManaging(null);
      return;
    }
    setManaging(null);
    await openOAuth(item.platform);
  };

  const onConnect = (item: Connection) => {
    if (isComingSoon(item.platform)) return; // not connectable yet
    if (item.needsReconnect) {
      void reconnectUnavailable(item);
      return;
    }
    openOAuth(item.platform);
  };

  const manageConnection = (item: Connection) => {
    const disconnect = () => {
      setManaging(item.platform);
      disconnectPlatform(item.platform)
        .then(load)
        .catch((e) => notice(e instanceof Error ? e.message : "Couldn't disconnect account"))
        .finally(() => setManaging(null));
    };
    Alert.alert(
      `Manage ${PLATFORM_LABELS[item.platform]}`,
      "Disconnect this account from BeamLoop. You can connect it again whenever you like.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Disconnect", style: "destructive" as const, onPress: disconnect },
      ]
    );
  };

  const openPublicPage = (path: "/support" | "/legal/privacy" | "/legal/terms") =>
    Linking.openURL(`${API_BASE_URL}${path}`).catch(() =>
      notice("Couldn't open that page. Please try again.")
    );

  // "Soon" platforms don't count toward the connected/total progress.
  const connectable = connections?.filter((c) => !isComingSoon(c.platform)) ?? [];
  const connectedCount = connectable.filter((c) => c.connected).length;
  const total = connectable.length;

  if (!connections && !loadFailed) {
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
      {/* header */}
      <View style={{ paddingHorizontal: spacing.xxl, paddingTop: 14, paddingBottom: 18 }}>
        <View style={[s.row, { justifyContent: "space-between" }]}>
          <Text style={{ ...type.displayTitle, color: palette.text }}>
            Accounts
          </Text>
          <View style={[s.row, { gap: spacing.lg }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Account"
              onPress={() => router.push("/account")}
              hitSlop={8}
            >
              <Text
                style={{
                  ...type.monoMeta,
                  color: palette.textLabel,
                  letterSpacing: tracking(monoTracking.wide, type.monoMeta.fontSize),
                }}
              >
                ACCOUNT
              </Text>
            </Pressable>
          </View>
        </View>
        <View style={[s.row, { gap: spacing.md, marginTop: spacing.lg }]}>
          <View
            style={{
              flex: 1,
              height: 6,
              borderRadius: radius.bar,
              backgroundColor: palette.barTrack,
              overflow: "hidden",
            }}
          >
            <LinearGradient
              colors={[spectrum.tiktok, spectrum.instagram]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                width: `${total ? Math.max((connectedCount / total) * 100, 2) : 0}%`,
                height: "100%",
              }}
            />
          </View>
          <Text
            style={{
              ...type.mono,
              color: palette.textSecondary,
              letterSpacing: tracking(monoTracking.wide, type.mono.fontSize),
            }}
          >
            {connectedCount} / {total} CONNECTED
          </Text>
        </View>
      </View>

      {billing && (
        <PlanStrip
          billing={billing}
          onPress={() => router.push("/plans")}
        />
      )}

      <FlatList
        data={connections ?? []}
        keyExtractor={(item) => item.platform}
        contentContainerStyle={{
          paddingHorizontal: spacing.screenX,
          gap: 10,
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
        renderItem={({ item }) => (
          <ConnectionRow
            item={item}
            opening={handoff === item.platform}
            managing={managing === item.platform}
            onConnect={() => onConnect(item)}
            onManage={() => manageConnection(item)}
          />
        )}
        ListFooterComponent={
          <View style={{ alignItems: "center", marginTop: spacing.md }}>
            <Text
              style={{
                ...type.monoMeta,
                color: palette.textLabel,
                letterSpacing: tracking(
                  monoTracking.status,
                  type.monoMeta.fontSize
                ),
                textAlign: "center",
              }}
            >
              CONNECT MORE ANY TIME — SESSIONS STAY LIVE
            </Text>
            <View style={[s.row, { gap: spacing.lg, marginTop: spacing.xl }]}>
              <Pressable onPress={() => openPublicPage("/support")} hitSlop={8}>
                <Text style={{ ...type.monoMeta, color: palette.textMono }}>SUPPORT</Text>
              </Pressable>
              <Pressable onPress={() => openPublicPage("/legal/privacy")} hitSlop={8}>
                <Text style={{ ...type.monoMeta, color: palette.textMono }}>PRIVACY</Text>
              </Pressable>
              <Pressable onPress={() => openPublicPage("/legal/terms")} hitSlop={8}>
                <Text style={{ ...type.monoMeta, color: palette.textMono }}>TERMS</Text>
              </Pressable>
            </View>
          </View>
        }
      />

      <OAuthSheet
        platform={handoff}
        onReopen={() => handoff && openOAuth(handoff)}
        onCancel={() => {
          setHandoff(null);
          load();
        }}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------- pieces

/**
 * What this account gets, on the first screen rather than buried in Plans.
 *
 * A free user should never have to go looking for what "free" means, or
 * discover their monthly limit by hitting it. Naming the plan, the posts left,
 * and the channel allowance turns the paywall from a surprise into a choice.
 */
function PlanStrip({
  billing,
  onPress,
}: {
  billing: BillingStatus;
  onPress: () => void;
}) {
  const { plan, limits } = billing.entitlement;
  const used = billing.usage.postsThisMonth;
  const left = Math.max(limits.postsPerMonth - used, 0);
  const name = plan === "free" ? "Free" : plan === "creator" ? "Creator" : "Pro";
  // Running low is worth flagging before the post that gets refused.
  const low = left <= Math.max(Math.round(limits.postsPerMonth * 0.2), 1);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name} plan, ${left} posts left this month. See plans.`}
      onPress={onPress}
      style={{
        marginHorizontal: spacing.screenX,
        marginBottom: spacing.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.cell,
        backgroundColor: palette.strip,
        borderWidth: 1,
        borderColor: low ? palette.dangerBorderSoft : palette.borderFaint,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: spacing.md,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            ...type.monoMeta,
            color: palette.textLabel,
            letterSpacing: tracking(monoTracking.label, type.monoMeta.fontSize),
          }}
        >
          {name.toUpperCase()} PLAN
        </Text>
        <Text
          numberOfLines={1}
          style={{ ...type.itemTitleSm, color: palette.text, marginTop: 3 }}
        >
          {left} of {limits.postsPerMonth} posts left · {limits.channels} channels
        </Text>
      </View>
      <Text style={{ ...type.monoMeta, color: palette.textSecondary }}>
        {plan === "pro" ? "MANAGE" : "UPGRADE"}
      </Text>
    </Pressable>
  );
}

function ConnectionRow({
  item,
  opening,
  managing,
  onConnect,
  onManage,
}: {
  item: Connection;
  opening: boolean;
  managing: boolean;
  onConnect: () => void;
  onManage: () => void;
}) {
  const handle =
    item.details?.username != null && item.details.username !== ""
      ? `@${String(item.details.username).replace(/^@/, "")}`
      : item.details?.display_name ?? null;
  const soon = isComingSoon(item.platform);

  return (
    <View
      style={[
        s.row,
        {
          gap: spacing.rowPad,
          backgroundColor: palette.strip,
          borderWidth: 1,
          borderColor: item.needsReconnect ? palette.dangerBorder : palette.borderFaint,
          borderRadius: radius.card,
          paddingVertical: spacing.rowPad,
          paddingHorizontal: spacing.lg,
          minHeight: 70,
          opacity: soon ? 0.55 : 1,
        },
      ]}
    >
      <PlatformTile platform={item.platform} size={sizes.tile} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ ...type.itemTitle, color: palette.text }}>
          {PLATFORM_LABELS[item.platform]}
        </Text>
        <Text
          numberOfLines={1}
          style={{ ...type.mono, color: palette.textMono }}
        >
          {soon
            ? "Coming soon"
            : item.needsReconnect
              ? item.statusMessage ?? "Account unavailable"
            : item.connected
              ? handle ?? "Connected"
              : "Not connected"}
        </Text>
      </View>

      {soon ? (
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: radius.tile,
            borderWidth: 1,
            borderColor: palette.borderStrong,
          }}
        >
          <Text
            style={{
              ...type.monoMeta,
              color: palette.textLabel,
              letterSpacing: tracking(monoTracking.status, type.monoMeta.fontSize),
            }}
          >
            SOON
          </Text>
        </View>
      ) : item.needsReconnect ? (
        <Pressable
          onPress={onConnect}
          disabled={managing || opening}
          style={{
            minHeight: sizes.btnSm,
            paddingHorizontal: 12,
            borderRadius: radius.tile,
            borderWidth: 1.5,
            borderColor: palette.warning,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ ...type.monoMeta, color: palette.warning }}>
            {managing ? "RESETTING…" : opening ? "OPENING…" : "RECONNECT"}
          </Text>
        </Pressable>
      ) : item.connected ? (
        <Pressable onPress={onManage} disabled={managing} style={[s.row, { gap: 7, paddingVertical: 6 }]}>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: palette.success,
            }}
          />
          <Text
            style={{
              ...type.mono,
              color: palette.success,
              letterSpacing: tracking(monoTracking.status, type.mono.fontSize),
            }}
          >
            {managing ? "…" : "MANAGE"}
          </Text>
        </Pressable>
      ) : opening ? (
        <View style={[s.row, { gap: 8 }]}>
          <SpinArc size={18} color={palette.warning} />
          <Text style={{ ...type.monoMeta, color: palette.warning }}>
            OPENING…
          </Text>
        </View>
      ) : (
        <Pressable
          onPress={onConnect}
          style={{
            height: sizes.btnSm,
            paddingHorizontal: 18,
            borderRadius: radius.tile,
            borderWidth: 1.5,
            borderColor: palette.borderButton,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ ...type.buttonSm, color: palette.text }}>Connect</Text>
        </Pressable>
      )}
    </View>
  );
}

// 02b — the OAuth handoff bottom sheet with the pulsing hue glow.
function OAuthSheet({
  platform,
  onReopen,
  onCancel,
}: {
  platform: Platform | null;
  onReopen: () => void;
  onCancel: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const pulse = useRef(new Animated.Value(0.16)).current;

  useEffect(() => {
    if (!platform || reducedMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: motion.pulse / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.16,
          duration: motion.pulse / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [platform, reducedMotion, pulse]);

  if (!platform) return null;
  const hue = platformHue[platform];

  return (
    <Modal transparent animationType="slide" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: palette.scrim, justifyContent: "flex-end" }}>
        <View
          style={{
            backgroundColor: palette.sheet,
            borderTopLeftRadius: radius.sheet,
            borderTopRightRadius: radius.sheet,
            borderTopWidth: 1,
            borderTopColor: palette.borderStrong,
            paddingTop: 14,
            paddingHorizontal: spacing.xxl,
            paddingBottom: 40,
            alignItems: "center",
          }}
        >
          {/* grabber */}
          <View
            style={{
              width: 40,
              height: 5,
              borderRadius: radius.bar,
              backgroundColor: palette.dotTrack,
              marginBottom: spacing.xxl,
            }}
          />
          {/* pulsing glow tile */}
          <View
            style={{
              width: 96,
              height: 96,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 22,
            }}
          >
            <Animated.View
              style={{
                position: "absolute",
                width: 96,
                height: 96,
                borderRadius: 24,
                backgroundColor: hue,
                opacity: pulse,
              }}
            />
            <PlatformTile platform={platform} size={sizes.tileSheet} />
          </View>
          <Text
            style={{
              ...type.mono,
              color: hue,
              letterSpacing: tracking(monoTracking.label, type.mono.fontSize),
              marginBottom: spacing.sm,
            }}
          >
            SECURE SIGN-IN
          </Text>
          <Text style={{ ...type.displayMd, color: palette.text }}>
            Finish in {PLATFORM_LABELS[platform]}
          </Text>
          <Text
            style={{
              ...type.bodySm,
              color: palette.textSecondary,
              textAlign: "center",
              marginTop: spacing.md,
              maxWidth: 280,
            }}
          >
            We opened {PLATFORM_LABELS[platform]}'s official sign-in. Approve
            access there and you'll come right back — nothing leaves this app.
          </Text>
          {/* encrypted badge */}
          <View
            style={[
              s.row,
              {
                gap: spacing.sm,
                marginVertical: 22,
                paddingVertical: 10,
                paddingHorizontal: spacing.lg,
                backgroundColor: palette.strip,
                borderRadius: radius.input,
              },
            ]}
          >
            <Svg width={16} height={18} viewBox="0 0 16 18" fill="none">
              <Rect
                x={1}
                y={7}
                width={14}
                height={10}
                rx={2.5}
                stroke={palette.success}
                strokeWidth={1.6}
              />
              <Path
                d="M4 7V5a4 4 0 0 1 8 0v2"
                stroke={palette.success}
                strokeWidth={1.6}
              />
            </Svg>
            <Text
              style={{
                ...type.monoMeta,
                color: palette.textSecondary,
                letterSpacing: tracking(0.04, type.monoMeta.fontSize),
              }}
            >
              ENCRYPTED · NO PASSWORD STORED
            </Text>
          </View>
          <Pressable
            style={[s.buttonPrimary, { alignSelf: "stretch" }]}
            onPress={onReopen}
          >
            <Text style={s.buttonPrimaryText}>
              Reopen {PLATFORM_LABELS[platform]} sign-in
            </Text>
          </Pressable>
          <Pressable onPress={onCancel} hitSlop={8}>
            <Text
              style={{
                ...type.monoNav,
                color: palette.textMono,
                marginTop: 18,
              }}
            >
              Cancel
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
