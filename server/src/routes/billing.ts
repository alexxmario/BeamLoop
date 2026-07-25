import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  requireTransactionFields,
  verifyAppleNotification,
  verifyAppleTransaction,
} from "../lib/appleIap.js";
import {
  isKnownProduct,
  subscriptionStore,
  usageForUser,
} from "../lib/plans.js";
import { userStore } from "../lib/store.js";

const transactionSchema = z.object({ signedTransaction: z.string().min(100) });
const notificationSchema = z.object({ signedPayload: z.string().min(100) });

function transactionStatus(transaction: {
  revocationDate?: number;
  isUpgraded?: boolean;
  expiresDate?: number;
}) {
  if (transaction.revocationDate) return "revoked";
  if (transaction.isUpgraded) return "upgraded";
  if (!transaction.expiresDate || transaction.expiresDate <= Date.now()) return "expired";
  return "active";
}

function notificationStatus(
  appleStatus: number | undefined,
  fallback: string
) {
  if (appleStatus === 1) return "active";
  if (appleStatus === 2) return "expired";
  if (appleStatus === 3) return "billing_retry";
  if (appleStatus === 4) return "grace_period";
  if (appleStatus === 5) return "revoked";
  return fallback;
}

export default async function billingRoutes(app: FastifyInstance) {
  app.get(
    "/billing/status",
    { preHandler: (req, reply) => app.requireAuth(req, reply) },
    async (req) => ({
      entitlement: subscriptionStore.entitlementForUser(req.user.id),
      usage: usageForUser(req.user.id),
    })
  );

  app.post(
    "/billing/apple/transaction",
    { preHandler: (req, reply) => app.requireAuth(req, reply) },
    async (req, reply) => {
      const body = transactionSchema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "Invalid transaction" });
      let transaction;
      try {
        transaction = await verifyAppleTransaction(body.data.signedTransaction);
      } catch (error) {
        req.log.warn({ error }, "Rejected unverified Apple transaction");
        return reply.code(400).send({ error: "Apple could not verify this purchase" });
      }
      const fields = requireTransactionFields(transaction);
      if (!isKnownProduct(fields.productId)) {
        return reply.code(400).send({ error: "Unknown BeamLoop subscription product" });
      }

      const existing = subscriptionStore.findByOriginalTransactionId(
        fields.originalTransactionId
      );
      // New purchases are bound with StoreKit's UUID appAccountToken. Renewals
      // retain that token. An existing original transaction may only be
      // restored by the BeamLoop account that first claimed it.
      if (
        (existing && existing.userId !== req.user.id) ||
        (!existing &&
          transaction.appAccountToken !== req.user.id &&
          Boolean(
            transaction.appAccountToken &&
              userStore.findById(transaction.appAccountToken)
          ))
      ) {
        return reply.code(409).send({
          error: "This Apple subscription belongs to another BeamLoop account",
        });
      }

      subscriptionStore.upsert({
        ...fields,
        userId: req.user.id,
        status: transactionStatus(transaction),
        autoRenewStatus: null,
      });
      return {
        entitlement: subscriptionStore.entitlementForUser(req.user.id),
        usage: usageForUser(req.user.id),
      };
    }
  );

  // Public App Store Server Notifications V2 endpoint. Apple retries non-2xx
  // deliveries; verify the JWS before reading any field and make processing
  // idempotent by notificationUUID.
  app.post("/webhooks/apple", async (req, reply) => {
    const body = notificationSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send();
    let notification;
    try {
      notification = await verifyAppleNotification(body.data.signedPayload);
    } catch (error) {
      req.log.warn({ error }, "Rejected unverified App Store notification");
      return reply.code(400).send();
    }
    if (
      notification.notificationUUID &&
      subscriptionStore.hasNotification(notification.notificationUUID)
    ) {
      return reply.code(200).send();
    }
    const signedTransaction = notification.data?.signedTransactionInfo;
    if (!signedTransaction) return reply.code(200).send();
    const transaction = await verifyAppleTransaction(signedTransaction);
    const renewal = notification.data?.signedRenewalInfo
      ? await (async () => {
          // The notification itself has already established the certificate
          // chain and environment; verify the nested renewal JWS independently.
          const { verifyAppleRenewalInfo } = await import("../lib/appleIap.js");
          return verifyAppleRenewalInfo(notification.data!.signedRenewalInfo!);
        })()
      : undefined;
    const fields = requireTransactionFields(transaction);
    if (!isKnownProduct(fields.productId)) return reply.code(200).send();

    const existing = subscriptionStore.findByOriginalTransactionId(
      fields.originalTransactionId
    );
    const userId = existing?.userId ?? transaction.appAccountToken;
    if (!userId || !userStore.findById(userId)) {
      req.log.warn(
        { originalTransactionId: fields.originalTransactionId },
        "Apple notification had no BeamLoop account mapping"
      );
      return reply.code(200).send();
    }
    subscriptionStore.upsert({
      ...fields,
      ...(renewal?.gracePeriodExpiresDate &&
      notification.data?.status === 4
        ? {
            expiresAt: new Date(
              renewal.gracePeriodExpiresDate
            ).toISOString(),
          }
        : {}),
      userId,
      status: notificationStatus(
        typeof notification.data?.status === "number"
          ? notification.data.status
          : undefined,
        transactionStatus(transaction)
      ),
      autoRenewStatus:
        typeof renewal?.autoRenewStatus === "number"
          ? renewal.autoRenewStatus
          : existing?.autoRenewStatus ?? null,
    });
    if (notification.notificationUUID) {
      subscriptionStore.markNotification(notification.notificationUUID);
    }
    return reply.code(200).send();
  });
}
