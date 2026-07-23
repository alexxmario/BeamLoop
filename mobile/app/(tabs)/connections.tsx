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
import { API_BASE_URL } from "../../src/api/client";
import {
  PLATFORM_LABELS,
  isComingSoon,
  type Connection,
  type Platform,
} from "../../src/api/types";
import { useAuth } from "../../src/auth/AuthContext";
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

export default function ConnectionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signOut, deleteAccount } = useAuth();
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [managing, setManaging] = useState<Platform | null>(null);
  // Platform currently in the OAuth handoff (drives sheet + OPENING state)
  const [handoff, setHandoff] = useState<Platform | null>(null);
  const sessionOpen = useRef(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setConnections(await fetchConnections());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load connections");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
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
    setError(null);
    try {
      const { access_url } = await fetchConnectUrl([platform]);
      await WebBrowser.openAuthSessionAsync(access_url, REDIRECT_URL);
      // Don't depend on the result type: in Expo Go the custom-scheme redirect
      // never comes back as `success`, so always refetch when the browser
      // closes. If the platform is now connected, the effect above dismisses
      // the sheet; if not, the sheet stays so the user can retry or cancel.
      await load();
    } catch (e) {
      setHandoff(null);
      setError(e instanceof Error ? e.message : "Could not open sign-in");
    } finally {
      sessionOpen.current = false;
    }
  };

  const onConnect = (item: Connection) => {
    if (isComingSoon(item.platform)) return; // not connectable yet
    if (item.platform === "discord") router.push("/connect/discord");
    else if (item.platform === "telegram") router.push("/connect/telegram");
    else openOAuth(item.platform);
  };

  const manageConnection = (item: Connection) => {
    const editManual = () => {
      if (item.platform === "discord") router.push("/connect/discord");
      if (item.platform === "telegram") router.push("/connect/telegram");
    };
    const disconnect = () => {
      setManaging(item.platform);
      setError(null);
      disconnectPlatform(item.platform)
        .then(load)
        .catch((e) => setError(e instanceof Error ? e.message : "Couldn't disconnect account"))
        .finally(() => setManaging(null));
    };
    Alert.alert(
      `Manage ${PLATFORM_LABELS[item.platform]}`,
      item.connectVia === "manual"
        ? "Replace its credentials or disconnect it from BeamLoop."
        : "Disconnect this account from BeamLoop. You can connect it again whenever you like.",
      [
        { text: "Cancel", style: "cancel" },
        ...(item.connectVia === "manual" ? [{ text: "Replace credentials", onPress: editManual }] : []),
        { text: "Disconnect", style: "destructive" as const, onPress: disconnect },
      ]
    );
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      "Delete account",
      "This permanently deletes your BeamLoop account, disconnects every linked platform, and erases your post history. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteAccount();
            } catch (e) {
              Alert.alert(
                "Couldn't delete account",
                e instanceof Error ? e.message : "Please try again."
              );
            }
          },
        },
      ]
    );
  };

  const openLegal = (document: "privacy" | "terms") =>
    Linking.openURL(`${API_BASE_URL}/legal/${document}`).catch(() =>
      setError("Couldn't open that document. Please try again.")
    );

  // "Soon" platforms don't count toward the connected/total progress.
  const connectable = connections?.filter((c) => !isComingSoon(c.platform)) ?? [];
  const connectedCount = connectable.filter((c) => c.connected).length;
  const total = connectable.length;

  if (!connections && !error) {
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
            Connect accounts
          </Text>
          <Pressable onPress={signOut} hitSlop={8}>
            <Text
              style={{
                ...type.monoMeta,
                color: palette.textLabel,
                letterSpacing: tracking(monoTracking.wide, type.monoMeta.fontSize),
              }}
            >
              SIGN OUT
            </Text>
          </Pressable>
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

      {error && (
        <Text style={[s.errorText, { paddingHorizontal: spacing.xxl, marginBottom: spacing.sm }]}>
          {error}
        </Text>
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
            <Pressable
              onPress={confirmDeleteAccount}
              hitSlop={8}
              style={{ marginTop: spacing.xxl, paddingVertical: spacing.sm }}
            >
              <Text
                style={{
                  ...type.monoNav,
                  color: palette.danger,
                  letterSpacing: tracking(
                    monoTracking.wide,
                    type.monoNav.fontSize
                  ),
                }}
              >
                DELETE ACCOUNT
              </Text>
            </Pressable>
            <View style={[s.row, { gap: spacing.lg, marginTop: spacing.xl }]}>
              <Pressable onPress={() => openLegal("privacy")} hitSlop={8}>
                <Text style={{ ...type.monoMeta, color: palette.textMono }}>PRIVACY</Text>
              </Pressable>
              <Pressable onPress={() => openLegal("terms")} hitSlop={8}>
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
          borderColor: palette.borderFaint,
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
            : item.connected
              ? handle ?? "Connected"
              : item.connectVia === "manual"
                ? item.platform === "discord"
                  ? "Webhook URL"
                  : "Bot token + chat ID"
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
