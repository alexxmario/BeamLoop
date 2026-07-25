import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  Environment,
  SignedDataVerifier,
  type JWSTransactionDecodedPayload,
} from "@apple/app-store-server-library";
import { config } from "../config.js";

const roots = ["AppleRootCA-G2.cer", "AppleRootCA-G3.cer"].map((name) =>
  readFileSync(fileURLToPath(new URL(`../../certs/${name}`, import.meta.url)))
);

const verifiers = [
  new SignedDataVerifier(
    roots,
    true,
    Environment.PRODUCTION,
    config.APPLE_BUNDLE_ID,
    config.APPLE_APP_ID
  ),
  new SignedDataVerifier(
    roots,
    true,
    Environment.SANDBOX,
    config.APPLE_BUNDLE_ID
  ),
];

export async function verifyAppleTransaction(jws: string) {
  let lastError: unknown;
  for (const verifier of verifiers) {
    try {
      return await verifier.verifyAndDecodeTransaction(jws);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export async function verifyAppleNotification(jws: string) {
  let lastError: unknown;
  for (const verifier of verifiers) {
    try {
      return await verifier.verifyAndDecodeNotification(jws);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export async function verifyAppleRenewalInfo(jws: string) {
  let lastError: unknown;
  for (const verifier of verifiers) {
    try {
      return await verifier.verifyAndDecodeRenewalInfo(jws);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export function requireTransactionFields(transaction: JWSTransactionDecodedPayload) {
  const {
    originalTransactionId,
    transactionId,
    productId,
    expiresDate,
    environment,
  } = transaction;
  if (
    !originalTransactionId ||
    !transactionId ||
    !productId ||
    !expiresDate ||
    !environment
  ) {
    throw new Error("Apple transaction is missing required subscription fields");
  }
  return {
    originalTransactionId,
    transactionId,
    productId,
    expiresAt: new Date(expiresDate).toISOString(),
    environment: String(environment),
  };
}
