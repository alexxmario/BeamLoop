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
  getPendingTransactionsIOS,
  type ProductSubscription,
  type Purchase,
  useIAP,
} from "expo-iap";
import {
  fetchBillingStatus,
  validateAppleTransaction,
} from "../src/api/beamloop";
import type { BillingStatus, PlanId } from "../src/api/types";
import { API_BASE_URL, ApiError } from "../src/api/client";
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
    "Per-platform captions",
    "Custom Instagram covers",
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
    // A drained transaction can be one that has since lapsed, so report what
    // the server actually recorded rather than assuming a live plan.
    setMessage(
      next.entitlement.plan === "free"
        ? "That App Store purchase is no longer active."
        : "Your BeamLoop plan is active."
    );
  }, []);

  // The dead end worth naming: this Apple ID already owns a BeamLoop
  // subscription that belongs to a different BeamLoop account. We can't claim
  // it (it isn't this account's) and the App Store won't sell it twice, so the
  // buy button would fail with StoreKit's opaque "Unable to Complete Request".
  // Only the buyer can resolve it, and only if we tell them which way out.
  const conflictMessage = (error: unknown) =>
    error instanceof ApiError && error.status === 409
      ? "This Apple ID's subscription is already linked to a different BeamLoop account. Sign in with that account, or subscribe here using a different Apple ID."
      : "We couldn't finish syncing a recent purchase. Tap Restore Purchases to try again.";

  // A transaction the server will never accept — one already bound to another
  // BeamLoop account, or a product we no longer sell — must still be finished.
  // StoreKit replays unfinished transactions forever and refuses to sell the
  // product again while one is outstanding, so leaving it queued bricks the
  // paywall. Transient failures (offline, 5xx, expired session) keep theirs so
  // the entitlement can still be recorded on a later attempt.
  const isPermanentRejection = (error: unknown) =>
    error instanceof ApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 401 &&
    error.status !== 408 &&
    error.status !== 429;

  // Clears StoreKit's unfinished queue: records what our server will take and
  // discards what it has permanently refused. Runs before anything else so a
  // stuck transaction from an earlier failed attempt can't block a new
  // purchase. Returns how many were handed to the server successfully.
  const drainPendingTransactions = useCallback(async () => {
    if (Platform.OS !== "ios") return 0;
    const pending = await getPendingTransactionsIOS();
    let accepted = 0;
    for (const item of pending) {
      if (
        !ALL_PRODUCT_IDS.includes(
          item.productId as (typeof ALL_PRODUCT_IDS)[number]
        )
      ) {
        continue;
      }
      try {
        await acceptPurchase(item);
        accepted += 1;
      } catch (error) {
        if (!isPermanentRejection(error)) throw error;
        await finishStoreTransaction({ purchase: item, isConsumable: false });
      }
    }
    return accepted;
  }, [acceptPurchase]);

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

  // The App Store returns an empty list — no error — for products it won't
  // sell yet, which would otherwise leave the buttons silently dead. Track
  // that the fetch finished so an empty result can say so.
  const [productsFetched, setProductsFetched] = useState(false);
  useEffect(() => {
    if (!connected || Platform.OS !== "ios") return;
    fetchProducts({ skus: ALL_PRODUCT_IDS, type: "subs" })
      .catch(() => setMessage("The App Store plans are temporarily unavailable."))
      .finally(() => setProductsFetched(true));
  }, [connected, fetchProducts]);

  // Recovery, once per visit. Draining runs whatever the plan — a stuck
  // transaction blocks new purchases even for someone already subscribed.
  // Claiming only matters for someone the server still thinks is free: a
  // subscription bought outside the app (App Store product page, Ask to Buy
  // approval) carries no appAccountToken, so the webhook can't map it to an
  // account and the buyer arrives here on Free.
  const recoveryAttempted = useRef(false);
  useEffect(() => {
    if (recoveryAttempted.current || busy) return;
    if (Platform.OS !== "ios" || !connected || !billing) return;
    recoveryAttempted.current = true;
    void (async () => {
      await drainPendingTransactions();
      if (billing.entitlement.plan === "free") await claimActivePurchases();
    })().catch((error) => {
      // Nothing to recover throws nothing, so reaching here means a real
      // purchase is stranded. Say so instead of leaving the buyer to guess.
      setMessage(conflictMessage(error));
    });
  }, [billing, busy, connected, claimActivePurchases, drainPendingTransactions]);

  const byId = useMemo(
    () => new Map(subscriptions.map((product) => [product.id, product])),
    [subscriptions]
  );

  // Entitlement carries the exact SKU, so "current" means this plan at this
  // billing period. Matching on the plan alone would mark the yearly card as
  // current for a monthly subscriber and block the switch.
  const currentPlan = billing?.entitlement.plan ?? "free";
  const currentProductId = billing?.entitlement.productId ?? null;

  // What a year on the monthly plan would cost, formatted in the store's own
  // currency. Derived from StoreKit's numeric price rather than hardcoded, so
  // it stays correct on every storefront. Apple's real localized price is
  // always the headline; this only sits beside it as the comparison.
  const yearOfMonthly = (plan: "creator" | "pro") => {
    const monthly = byId.get(PRODUCTS[plan].monthly);
    const yearly = byId.get(PRODUCTS[plan].yearly);
    if (!monthly?.price || !yearly?.price || !monthly.currency) return null;
    const twelve = monthly.price * 12;
    if (twelve <= yearly.price) return null;
    const format = (value: number) =>
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: monthly.currency,
      }).format(value);
    // Whole months saved, floored — never overstate the discount.
    const monthsFree = Math.floor((twelve - yearly.price) / monthly.price);
    return { was: format(twelve), monthsFree };
  };

  // "4 months free" outsells "save 33%" and says the same thing. Only claim it
  // on the toggle when both tiers agree, since one label covers both cards.
  const creatorSaving = yearOfMonthly("creator");
  const proSaving = yearOfMonthly("pro");
  const yearlyLabel =
    creatorSaving && proSaving && creatorSaving.monthsFree === proSaving.monthsFree
      ? `Yearly · ${creatorSaving.monthsFree} months free`
      : "Yearly · best value";

  // Apple applies a change inside a subscription group differently depending on
  // direction, and the difference is money: an upgrade starts now and credits
  // the unused remainder, a downgrade waits for the period to end. Someone
  // already paying deserves to know which before the sheet opens.
  const RANK = { free: 0, creator: 1, pro: 2 } as const;
  const changeSummary = (plan: "creator" | "pro") => {
    if (currentPlan === "free" || !currentProductId) return null;
    const label = plan === "creator" ? "Creator" : "Pro";
    if (RANK[plan] > RANK[currentPlan]) {
      return {
        title: `Upgrade to ${label}?`,
        body: `${label} replaces your current plan straight away, and the App Store credits the unused part of the period you've already paid for. You'll see the exact charge before confirming.`,
      };
    }
    if (RANK[plan] < RANK[currentPlan]) {
      return {
        title: `Change to ${label}?`,
        body: `You'll keep your current plan's features until this billing period ends, then move to ${label}. Nothing is charged today.`,
      };
    }
    return {
      title: `Switch to ${period} billing?`,
      body: `You'll stay on ${label}. The new billing period takes effect when your current one ends, and the App Store will show the exact charge before you confirm.`,
    };
  };

  const confirmChange = (summary: { title: string; body: string }) =>
    new Promise<boolean>((resolve) => {
      Alert.alert(summary.title, summary.body, [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "Continue", onPress: () => resolve(true) },
      ]);
    });

  const purchase = async (plan: "creator" | "pro") => {
    if (!user || Platform.OS !== "ios") return;
    const sku = PRODUCTS[plan][period];
    const summary = changeSummary(plan);
    if (summary && !(await confirmChange(summary))) return;
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
      const recovered =
        (await drainPendingTransactions()) + (await claimActivePurchases());
      if (recovered === 0) {
        setMessage("No active BeamLoop subscription was found for this Apple ID.");
      }
    } catch (error) {
      Alert.alert("Couldn't restore purchases", conflictMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const price = (product?: ProductSubscription) =>
    product?.displayPrice ?? "Unavailable";

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
                {value === "monthly" ? "Monthly" : yearlyLabel}
              </Text>
            </Pressable>
          ))}
        </View>

        {productsFetched && subscriptions.length === 0 && (
          <Text
            accessibilityLiveRegion="polite"
            style={{ ...type.bodySm, color: palette.textSecondary, textAlign: "center" }}
          >
            The App Store isn't returning BeamLoop's plans right now. Check your
            connection and pull up this screen again in a moment.
          </Text>
        )}

        {(["creator", "pro"] as const).map((plan) => {
          const sku = PRODUCTS[plan][period];
          const product = byId.get(sku);
          const isCurrent = currentProductId === sku;
          // Same plan, other billing period: StoreKit crossgrades within the
          // subscription group, so this stays a live button.
          const isPeriodSwitch = !isCurrent && currentPlan === plan;
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
              {period === "yearly" &&
                (() => {
                  const saving = yearOfMonthly(plan);
                  if (!saving) return null;
                  return (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: spacing.sm,
                        marginTop: -spacing.xs,
                      }}
                    >
                      <Text
                        style={{
                          ...type.bodySm,
                          color: palette.textLabel,
                          textDecorationLine: "line-through",
                        }}
                      >
                        {saving.was}
                      </Text>
                      <Text style={{ ...type.mono, color: palette.success }}>
                        {saving.monthsFree} MONTHS FREE
                      </Text>
                    </View>
                  );
                })()}
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
                    {isCurrent
                      ? "Current plan"
                      : isPeriodSwitch
                        ? `Switch to ${period}`
                        : `Choose ${plan}`}
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
