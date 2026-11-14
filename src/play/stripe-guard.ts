export type StripeGuard =
  | { ok: true }
  | { ok: false; reason: "missing" | "live" | "invalid" };

function liveSecret(value: string | undefined) {
  if (!value) return false;
  return /(?:^|_)(?:sk|rk)_live_/.test(value) || value.includes("sk_live_") || value.includes("rk_live_");
}

function livePublishable(value: string | undefined) {
  if (!value) return false;
  return value.includes("pk_live_");
}

/** Checkout needs a test secret, a test publishable key, and a webhook secret. */
type Env = Record<string, string | undefined>;

export function guardCheckoutEnv(env: Env): StripeGuard {
  const secret = env.STRIPE_SECRET_KEY?.trim() ?? "";
  const publishable = env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? "";
  const webhook = env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";

  if (liveSecret(secret) || livePublishable(publishable)) {
    return { ok: false, reason: "live" };
  }
  if (!secret || !publishable || !webhook) {
    return { ok: false, reason: "missing" };
  }
  const secretOk = secret.startsWith("sk_test_") || secret.startsWith("rk_test_");
  const publishableOk = publishable.startsWith("pk_test_");
  const webhookOk = webhook.startsWith("whsec_");
  if (!secretOk || !publishableOk || !webhookOk) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true };
}

/** Webhook handling refuses live keys and a missing signing secret. */
export function guardWebhookEnv(env: Env): StripeGuard {
  const secret = env.STRIPE_SECRET_KEY?.trim() ?? "";
  const publishable = env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? "";
  const webhook = env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";

  if (liveSecret(secret) || livePublishable(publishable)) {
    return { ok: false, reason: "live" };
  }
  if (!webhook || !secret) return { ok: false, reason: "missing" };
  const secretOk = secret.startsWith("sk_test_") || secret.startsWith("rk_test_");
  if (!secretOk || !webhook.startsWith("whsec_")) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true };
}

export function storageConfigured(env: Env) {
  return Boolean(env.BLOB_READ_WRITE_TOKEN?.trim() || env.BLOB_STORE_ID?.trim());
}
