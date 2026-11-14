import Stripe from "stripe";
import { applyCheckoutEvent, type OrderStore, type SendMail } from "./orders";
import { guardWebhookEnv } from "./stripe-guard";

export async function processWebhook(input: {
  raw: string;
  signature: string | null;
  env: Record<string, string | undefined>;
  store: OrderStore;
  send: SendMail;
  origin: string;
  alertTo?: string;
}): Promise<{ status: number; result?: string }> {
  const guard = guardWebhookEnv(input.env);
  if (!guard.ok) return { status: 503, result: guard.reason };

  const secret = input.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
  if (!input.signature) return { status: 400, result: "signature" };

  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(input.raw, input.signature, secret);
  } catch {
    return { status: 400, result: "signature" };
  }

  if (!event.type.startsWith("checkout.session.")) {
    return { status: 200, result: "ignored" };
  }

  const session = event.data.object as unknown as Parameters<
    typeof applyCheckoutEvent
  >[0]["session"];
  const result = await applyCheckoutEvent({
    store: input.store,
    eventId: event.id,
    type: event.type,
    session,
    send: input.send,
    origin: input.origin,
    alertTo: input.alertTo,
  });
  return { status: 200, result };
}
