import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { deepLinkToSubscriptions } from "expo-iap";
import { fetchBillingStatus, fetchConnections } from "../src/api/beamloop";
import { API_BASE_URL } from "../src/api/client";
import {
  isComingSoon,
  type BillingStatus,
  type Connection,
  type PlanId,
} from "../src/api/types";
import { useAuth } from "../src/auth/AuthContext";
import { useNotice } from "../src/components/Notice";
import {
  monoTracking,
  palette,
  radius,
  sharedStyles as s,
  spacing,
  spectrum,
  tracking,
  type,
} from "../src/theme";

const PLAN_LABELS: Record<PlanId, string> = {
  free: "Free",
  creator: "Creator",
  pro: "Pro",
};

// Limits render as "used / cap". A null cap means the plan doesn't meter that
// dimension at all, which reads better as a word than as a number.
const UNMETERED = "Unlimited";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function AccountScreen() {
  const router = useRouter();
  const { user, signOut, deleteAccount } = useAuth();
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const notice = useNotice();

  // Refetch on focus so returning from the paywall shows the new plan rather
  // than a stale one.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([fetchBillingStatus(), fetchConnections()])
        .then(([status, list]) => {
          if (!active) return;
          setBilling(status);
          setConnections(list);
        })
        .catch((e) => {
          if (!active) return;
          notice(e instanceof Error ? e.message : "Couldn't load your account");
        });
      return () => {
        active = false;
      };
    }, [notice])
  );

  const openPublicPage = (path: "/support" | "/legal/privacy" | "/legal/terms") =>
    Linking.openURL(`${API_BASE_URL}${path}`).catch(() =>
      notice("Couldn't open that page. Please try again.")
    );

  const confirmSignOut = () => {
    Alert.alert("Sign out", "You'll need to sign in again to publish.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void signOut() },
    ]);
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      "Delete account",
      "This permanently deletes your BeamLoop account, connected platforms, and post history. Deleting BeamLoop does not cancel an Apple subscription; cancel it in the App Store first if you no longer want it to renew.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Manage subscription",
          onPress: () =>
            void Linking.openURL("https://apps.apple.com/account/subscriptions"),
        },
        {
          text: "Delete anyway",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteAccount();
            } catch (e) {
              notice(e instanceof Error ? e.message : "Please try again.", {
                title: "Couldn't delete account",
              });
            }
          },
        },
      ]
    );
  };

  // "Soon" platforms aren't connectable, so they can't count toward the cap.
  const channelsUsed =
    connections?.filter((c) => c.connected && !isComingSoon(c.platform)).length ??
    0;
  const plan = billing?.entitlement.plan ?? "free";
  const limits = billing?.entitlement.limits;
  const usage = billing?.usage;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.console }}>
      <View style={{ paddingHorizontal: spacing.xxl, paddingTop: 14 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close account"
          onPress={() => router.back()}
          hitSlop={12}
        >
          <Text style={{ ...type.monoNav, color: palette.textSecondary }}>CLOSE</Text>
        </Pressable>
        <Text
          style={{ ...type.displayTitle, color: palette.text, marginTop: spacing.lg }}
        >
          Account
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.screenX,
          paddingTop: spacing.xl,
          paddingBottom: spacing.xxl * 2,
          gap: spacing.lg,
        }}
      >
        {/* ------------------------------------------------ signed in as */}
        <View style={s.card}>
          <Text style={s.sectionLabel}>Signed in as</Text>
          <Text
            style={{ ...type.itemTitle, color: palette.text, marginTop: spacing.sm }}
          >
            {user?.email ?? "—"}
          </Text>
        </View>

        {/* ---------------------------------------------------------- plan */}
        <View style={s.card}>
          <View style={[s.row, { justifyContent: "space-between" }]}>
            <Text style={s.sectionLabel}>Plan</Text>
            {billing?.entitlement.willRenew === false && (
              <Text style={{ ...type.monoMeta, color: palette.warning }}>
                WON'T RENEW
              </Text>
            )}
          </View>

          {!billing ? (
            <ActivityIndicator
              color={palette.textSecondary}
              style={{ marginTop: spacing.md }}
            />
          ) : (
            <>
              <Text
                style={{
                  ...type.displayMd,
                  color: palette.text,
                  marginTop: spacing.sm,
                }}
              >
                {PLAN_LABELS[plan]}
              </Text>
              <Text style={{ ...type.bodyXs, color: palette.textSecondary }}>
                {billing.entitlement.expiresAt
                  ? `${
                      billing.entitlement.willRenew ? "Renews" : "Ends"
                    } ${formatDate(billing.entitlement.expiresAt)}`
                  : "No subscription — you're on the free plan."}
              </Text>

              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/plans")}
                style={[s.buttonPrimary, { marginTop: spacing.lg }]}
              >
                <Text style={s.buttonPrimaryText}>
                  {plan === "free" ? "See plans" : "Change plan"}
                </Text>
              </Pressable>

              {plan !== "free" && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void deepLinkToSubscriptions()}
                  style={{ marginTop: spacing.md, alignItems: "center" }}
                  hitSlop={8}
                >
                  <Text style={{ ...type.buttonSm, color: palette.link }}>
                    Manage subscription in the App Store
                  </Text>
                </Pressable>
              )}
            </>
          )}
        </View>

        {/* --------------------------------------------------------- usage */}
        <View style={s.card}>
          <Text style={s.sectionLabel}>This month</Text>
          {!limits || !usage ? (
            <ActivityIndicator
              color={palette.textSecondary}
              style={{ marginTop: spacing.md }}
            />
          ) : (
            <View style={{ marginTop: spacing.md, gap: spacing.lg }}>
              <Meter
                label="Channels"
                used={channelsUsed}
                cap={limits.channels}
                hue={[spectrum.tiktok, spectrum.instagram]}
              />
              <Meter
                label="Posts"
                used={usage.postsThisMonth}
                cap={limits.postsPerMonth}
                hue={[spectrum.instagram, spectrum.youtube]}
              />
              <Meter
                label="Scheduled"
                used={usage.scheduledPosts}
                cap={limits.scheduledPosts}
                hue={[spectrum.facebook, spectrum.threads]}
              />
              <Text style={{ ...type.monoMeta, color: palette.textLabel }}>
                POSTS RESET {formatDate(usage.resetsAt).toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        {/* ---------------------------------------------------------- data */}
        <View style={s.card}>
          <Text style={s.sectionLabel}>Your data</Text>
          <Text
            style={{
              ...type.bodyXs,
              color: palette.textSecondary,
              marginTop: spacing.sm,
            }}
          >
            BeamLoop stores your email, your connected channels, and the posts you
            publish through it.
            {limits?.historyDays
              ? ` Post history is kept for ${limits.historyDays} days on your plan.`
              : plan === "free"
                ? ""
                : " Your plan keeps post history indefinitely."}
          </Text>
          <View style={[s.row, { gap: spacing.lg, marginTop: spacing.lg }]}>
            <Pressable onPress={() => openPublicPage("/legal/privacy")} hitSlop={8}>
              <Text style={{ ...type.buttonSm, color: palette.link }}>Privacy</Text>
            </Pressable>
            <Pressable onPress={() => openPublicPage("/legal/terms")} hitSlop={8}>
              <Text style={{ ...type.buttonSm, color: palette.link }}>Terms</Text>
            </Pressable>
            <Pressable onPress={() => openPublicPage("/support")} hitSlop={8}>
              <Text style={{ ...type.buttonSm, color: palette.link }}>Support</Text>
            </Pressable>
          </View>
        </View>

        {/* -------------------------------------------------------- danger */}
        <View style={{ alignItems: "center", marginTop: spacing.sm, gap: spacing.xl }}>
          <Pressable onPress={confirmSignOut} hitSlop={8} style={{ paddingVertical: spacing.sm }}>
            <Text
              style={{
                ...type.monoNav,
                color: palette.textSecondary,
                letterSpacing: tracking(monoTracking.wide, type.monoNav.fontSize),
              }}
            >
              SIGN OUT
            </Text>
          </Pressable>
          <Pressable
            onPress={confirmDeleteAccount}
            hitSlop={8}
            style={{ paddingVertical: spacing.sm }}
          >
            <Text
              style={{
                ...type.monoNav,
                color: palette.danger,
                letterSpacing: tracking(monoTracking.wide, type.monoNav.fontSize),
              }}
            >
              DELETE ACCOUNT
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------- pieces

function Meter({
  label,
  used,
  cap,
  hue,
}: {
  label: string;
  used: number;
  cap: number | null;
  hue: readonly [string, string];
}) {
  // An unmetered dimension has no meaningful bar to fill — show the count only.
  const unmetered = cap === null;
  const ratio = unmetered ? 0 : Math.min(used / Math.max(cap, 1), 1);
  const atCap = !unmetered && used >= cap;

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={[s.row, { justifyContent: "space-between" }]}>
        <Text style={{ ...type.itemTitleSm, color: palette.text }}>{label}</Text>
        <Text
          style={{
            ...type.mono,
            color: atCap ? palette.warning : palette.textMono,
            letterSpacing: tracking(monoTracking.wide, type.mono.fontSize),
          }}
        >
          {unmetered ? `${used} · ${UNMETERED.toUpperCase()}` : `${used} / ${cap}`}
        </Text>
      </View>
      {!unmetered && (
        <View
          style={{
            height: 6,
            borderRadius: radius.bar,
            backgroundColor: palette.barTrack,
            overflow: "hidden",
          }}
        >
          <LinearGradient
            colors={atCap ? [palette.warning, palette.warning] : [...hue]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ width: `${Math.max(ratio * 100, ratio > 0 ? 2 : 0)}%`, height: "100%" }}
          />
        </View>
      )}
    </View>
  );
}
