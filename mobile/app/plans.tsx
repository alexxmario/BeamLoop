import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  deepLinkToSubscriptions,
  finishTransaction as finishStoreTransaction,
  getAvailablePurchases,
  type ProductSubscription,
  type Purchase,
  useIAP,
} from "expo-iap";
import {
  fetchBillingStatus,
  validateAppleTransaction,
} from "../src/api/beamloop";
import type { BillingStatus, PlanId } from "../src/api/types";
import { API_BASE_URL } from "../src/api/client";
import { useAuth } from "../src/auth/AuthContext";
import { fonts, palette, radius, spacing, type } from "../src/theme";

const PRODUCTS = {
  creator: {
    monthly: "com.beamloop.app.creator.monthly",
    yearly: "com.beamloop.app.creator.yearly",
  },
  pro: {
    monthly: "com.beamloop.app.pro.monthly",
    yearly: "com.beamloop.app.pro.yearly",
  },
} as const;
const ALL_PRODUCT_IDS = Object.values(PRODUCTS).flatMap(Object.values);

const FEATURES: Record<Exclude<PlanId, "free">, string[]> = {
  creator: [
    "3 connected channels",
    "100 posts each month",
    "50 scheduled posts",
    "Per-platform captions and placements",
    "One year of post history",
  ],
  pro: [
    "Every channel BeamLoop supports",
    "500 posts each month",
    "Up to 1,000 scheduled posts",
    "Launch Drops across channels",
    "Unlimited post history",
  ],
};

export default function PlansScreen({ tabMode = false }: { tabMode?: boolean }) {
  const router = useRouter();
  const { user } = useAuth();
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [period, setPeriod] = useState<"monthly" | "yearly">("yearly");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const acceptPurchase = useCallback(async (purchase: Purchase) => {
    if (!purchase.purchaseToken) {
      throw new Error("Apple did not return a signed transaction.");
    }
    const next = await validateAppleTransaction(purchase.purchaseToken);
    // Finish only after our server has verified and recorded the entitlement.
    await finishStoreTransaction({ purchase, isConsumable: false });
    setBilling(next);
    setBusy(null);
    setMessage("Your BeamLoop plan is active.");
  }, []);

  // Claims every active App Store subscription on this Apple ID that our
  // server hasn't recorded yet. Returns how many were claimed.
  const claimActivePurchases = useCallback(async () => {
    const purchases = await getAvailablePurchases({
      onlyIncludeActiveItemsIOS: true,
      alsoPublishToEventListenerIOS: false,
    });
    const beamLoopPurchases = purchases.filter((item) =>
      ALL_PRODUCT_IDS.includes(item.productId as (typeof ALL_PRODUCT_IDS)[number])
    );
    for (const item of beamLoopPurchases) await acceptPurchase(item);
    return beamLoopPurchases.length;
  }, [acceptPurchase]);

  const {
    connected,
    subscriptions,
    fetchProducts,
    requestPurchase,
  } = useIAP({
    onPurchaseSuccess: (purchase) => {
      void acceptPurchase(purchase).catch((error) => {
        setBusy(null);
        Alert.alert(
          "Purchase needs verification",
          error instanceof Error ? error.message : "Please restore your purchase."
        );
      });
    },
    onPurchaseError: (error) => {
      setBusy(null);
      // Cancellation is a normal outcome and should not look like a failure.
      if (error.code !== "user-cancelled") {
        Alert.alert("Purchase not completed", error.message);
      }
    },
  });

  useEffect(() => {
    fetchBillingStatus().then(setBilling).catch(() => setMessage("Couldn't load your plan."));
  }, []);

  useEffect(() => {
    if (connected && Platform.OS === "ios") {
      fetchProducts({ skus: ALL_PRODUCT_IDS, type: "subs" }).catch(() =>
        setMessage("The App Store plans are temporarily unavailable.")
      );
    }
  }, [connected, fetchProducts]);

  // A subscription bought outside the app — App Store product page, Ask to Buy
  // approval — carries no appAccountToken, so our webhook can't map it to an
  // account and the buyer arrives here still on Free. Claim it for them rather
  // than relying on them to find "Restore Purchases". Silent on both outcomes:
  // the overwhelmingly common case is a real free user with nothing to claim.
  const autoClaimAttempted = useRef(false);
  useEffect(() => {
    if (autoClaimAttempted.current || busy) return;
    if (Platform.OS !== "ios" || !connected) return;
    if (!billing || billing.entitlement.plan !== "free") return;
    autoClaimAttempted.current = true;
    void claimActivePurchases().catch(() => {
      // Restore Purchases stays as the explicit, user-driven fallback.
    });
  }, [billing, busy, connected, claimActivePurchases]);

  const byId = useMemo(
    () => new Map(subscriptions.map((product) => [product.id, product])),
    [subscriptions]
  );

  const purchase = async (plan: "creator" | "pro") => {
    if (!user || Platform.OS !== "ios") return;
    const sku = PRODUCTS[plan][period];
    setBusy(sku);
    setMessage(null);
    try {
      await requestPurchase({
        request: {
          apple: {
            sku,
            appAccountToken: user.id,
            andDangerouslyFinishTransactionAutomatically: false,
          },
        },
        type: "subs",
      });
    } catch (error) {
      setBusy(null);
      Alert.alert(
        "Purchase not completed",
        error instanceof Error ? error.message : "Please try again."
      );
    }
  };

  const restore = async () => {
    setBusy("restore");
    setMessage(null);
    try {
      if ((await claimActivePurchases()) === 0) {
        setMessage("No active BeamLoop subscription was found for this Apple ID.");
      }
    } catch (error) {
      Alert.alert(
        "Couldn't restore purchases",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setBusy(null);
    }
  };

  const price = (product?: ProductSubscription) =>
    product?.displayPrice ?? "Unavailable";
  const current = billing?.entitlement.plan ?? "free";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.console }}>
      {!tabMode && (
        <View style={{ paddingHorizontal: spacing.xl, paddingVertical: spacing.lg }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close plans"
            onPress={() => router.back()}
            hitSlop={12}
          >
            <Text style={{ ...type.monoNav, color: palette.textSecondary }}>CLOSE</Text>
          </Pressable>
        </View>
      )}
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingBottom: tabMode ? 140 : 48,
          gap: spacing.lg,
        }}
      >
        <View>
          <Text style={{ ...type.displayLg, color: palette.text }}>Choose your beam.</Text>
          <Text style={{ ...type.body, color: palette.textSecondary, marginTop: spacing.sm }}>
            Publish more, schedule further ahead, and keep every channel in sync.
          </Text>
        </View>

        <View
          accessibilityRole="tablist"
          style={{
            flexDirection: "row",
            padding: 4,
            borderRadius: radius.input,
            backgroundColor: palette.sheet,
          }}
        >
          {(["monthly", "yearly"] as const).map((value) => (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityState={{ selected: period === value }}
              onPress={() => setPeriod(value)}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: radius.input,
                backgroundColor: period === value ? palette.signal : "transparent",
              }}
            >
              <Text
                style={{
                  ...type.buttonSm,
                  textAlign: "center",
                  color: period === value ? palette.console : palette.textSecondary,
                }}
              >
                {value === "monthly" ? "Monthly" : "Yearly · best value"}
              </Text>
            </Pressable>
          ))}
        </View>

        {(["creator", "pro"] as const).map((plan) => {
          const sku = PRODUCTS[plan][period];
          const product = byId.get(sku);
          const isCurrent = current === plan;
          return (
            <View
              key={plan}
              style={{
                padding: spacing.xl,
                gap: spacing.md,
                borderRadius: radius.card,
                backgroundColor: palette.strip,
                borderWidth: plan === "pro" ? 1 : 0,
                borderColor: palette.link,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ ...type.displayMd, color: palette.text }}>
                  {plan === "creator" ? "Creator" : "Pro"}
                </Text>
                {isCurrent && (
                  <Text style={{ ...type.mono, color: palette.success }}>CURRENT</Text>
                )}
              </View>
              <Text style={{ ...type.displayTitle, color: palette.text }}>
                {price(product)}
                <Text style={{ ...type.bodySm, color: palette.textSecondary }}>
                  {period === "monthly" ? " / month" : " / year"}
                </Text>
              </Text>
              {FEATURES[plan].map((feature) => (
                <Text key={feature} style={{ ...type.bodySm, color: palette.textSecondary }}>
                  ✓ {feature}
                </Text>
              ))}
              <Pressable
                accessibilityRole="button"
                disabled={!connected || !product || Boolean(busy) || isCurrent}
                onPress={() => void purchase(plan)}
                style={{
                  marginTop: spacing.sm,
                  minHeight: 50,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: radius.input,
                  backgroundColor: isCurrent ? palette.barTrack : palette.signal,
                  opacity: !connected || !product ? 0.55 : 1,
                }}
              >
                {busy === sku ? (
                  <ActivityIndicator color={palette.console} />
                ) : (
                  <Text
                    style={{
                      fontFamily: fonts.bold,
                      fontSize: 16,
                      color: isCurrent ? palette.textSecondary : palette.console,
                    }}
                  >
                    {isCurrent ? "Current plan" : `Choose ${plan}`}
                  </Text>
                )}
              </Pressable>
            </View>
          );
        })}

        <Text style={{ ...type.bodyXs, color: palette.textMono, textAlign: "center" }}>
          Payment is charged to your Apple ID. Subscriptions renew automatically unless
          canceled at least 24 hours before the current period ends. You can manage or
          cancel your subscription in your App Store account settings.
        </Text>
        {message && (
          <Text accessibilityLiveRegion="polite" style={{ ...type.bodySm, color: palette.textSecondary, textAlign: "center" }}>
            {message}
          </Text>
        )}
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.lg }}>
          <Pressable disabled={Boolean(busy)} onPress={() => void restore()}>
            <Text style={{ ...type.buttonSm, color: palette.link }}>
              {busy === "restore" ? "Restoring…" : "Restore Purchases"}
            </Text>
          </Pressable>
          <Pressable onPress={() => void deepLinkToSubscriptions()}>
            <Text style={{ ...type.buttonSm, color: palette.link }}>Manage Subscription</Text>
          </Pressable>
          <Pressable onPress={() => void Linking.openURL(`${API_BASE_URL}/legal/terms`)}>
            <Text style={{ ...type.buttonSm, color: palette.link }}>Terms</Text>
          </Pressable>
          <Pressable onPress={() => void Linking.openURL(`${API_BASE_URL}/legal/privacy`)}>
            <Text style={{ ...type.buttonSm, color: palette.link }}>Privacy</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
