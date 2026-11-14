import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import Stripe from "stripe";
import { parseCatalog } from "../src/play/catalog";
import {
  applyCheckoutEvent,
  createMemoryStore,
  customerMail,
  markShipped,
  newOrderId,
  ownerMail,
  type Order,
} from "../src/play/orders";
import { quoteChachki } from "../src/play/pricing";
import { guardCheckoutEnv } from "../src/play/stripe-guard";
import { processWebhook } from "../src/play/webhook";

const catalog = parseCatalog(JSON.parse(readFileSync("public/play/catalog.json", "utf8")));

function pendingOrder(total = 2700): Order {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: newOrderId(),
    status: "pending",
    itemId: "saluting-device",
    itemName: "Saluting Device",
    tierId: "desk",
    tierName: "Desk chachki",
    material: "matte print",
    setSize: 2,
    qty: 1,
    unitAmount: total,
    totalCents: total,
    currency: "usd",
    customerEmail: null,
    shipping: null,
    stripeSessionId: null,
    stripePaymentIntentId: null,
    processedEventIds: [],
    emailsSent: { customer: false, owner: false, tracking: false },
    carrier: null,
    trackingNumber: null,
    createdAt: now,
    updatedAt: now,
    paidAt: null,
    shippedAt: null,
  };
}

test("client price and quantity cannot change the server price", () => {
  const line = quoteChachki(catalog, {
    itemId: "saluting-device",
    tierId: "desk",
    price: 1,
    qty: 50,
    unitAmount: 1,
  } as { itemId: string; tierId: string });
  assert.ok(line);
  assert.equal(line.unitAmount, 2700);
  assert.equal(line.qty, 1);
  assert.equal(line.totalCents, 2700);
  assert.equal(quoteChachki(catalog, { itemId: "plow-gun", tierId: "desk" }), null);
  assert.equal(quoteChachki(catalog, { itemId: "plasma-globe", tierId: "showpiece" }), null);
});

test("live keys and missing keys fail closed", () => {
  assert.equal(
    guardCheckoutEnv({
      STRIPE_SECRET_KEY: "sk_live_abc",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_abc",
      STRIPE_WEBHOOK_SECRET: "whsec_abc",
    }).ok,
    false,
  );
  const livePublishable = guardCheckoutEnv({
    STRIPE_SECRET_KEY: "sk_test_abc",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_abc",
    STRIPE_WEBHOOK_SECRET: "whsec_abc",
  });
  assert.equal(livePublishable.ok, false);
  if (!livePublishable.ok) assert.equal(livePublishable.reason, "live");
  const missing = guardCheckoutEnv({});
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.reason, "missing");
  const missingWebhook = guardCheckoutEnv({
    STRIPE_SECRET_KEY: "sk_test_abc",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_abc",
  });
  assert.equal(missingWebhook.ok, false);
  if (!missingWebhook.ok) assert.equal(missingWebhook.reason, "missing");
});

test("webhook rejects a bad signature and ignores a live key", async () => {
  const store = createMemoryStore();
  const order = pendingOrder();
  await store.save(order);
  const secret = "whsec_test_secret_value";
  const payload = JSON.stringify({ id: "evt_x", object: "event", type: "checkout.session.completed", data: { object: {} } });
  const bad = await processWebhook({
    raw: payload,
    signature: "t=1,v1=deadbeef",
    env: {
      STRIPE_SECRET_KEY: "sk_test_abc",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_abc",
      STRIPE_WEBHOOK_SECRET: secret,
    },
    store,
    send: async () => "sent",
    origin: "https://strangeinvention.com",
  });
  assert.equal(bad.status, 400);
  assert.equal((await store.get(order.id))?.status, "pending");

  const live = await processWebhook({
    raw: payload,
    signature: "t=1,v1=deadbeef",
    env: {
      STRIPE_SECRET_KEY: "sk_live_nope",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_abc",
      STRIPE_WEBHOOK_SECRET: secret,
    },
    store,
    send: async () => "sent",
    origin: "https://strangeinvention.com",
  });
  assert.equal(live.status, 503);
  assert.equal((await store.get(order.id))?.status, "pending");

  const missing = await processWebhook({
    raw: payload,
    signature: null,
    env: { STRIPE_SECRET_KEY: "sk_test_abc" },
    store,
    send: async () => "sent",
    origin: "https://strangeinvention.com",
  });
  assert.equal(missing.status, 503);
});

test("a paid event is idempotent and a tampered total is refused", async () => {
  const store = createMemoryStore();
  const order = pendingOrder();
  await store.save(order);
  const sent: string[] = [];
  const session = {
    id: "cs_test_1",
    payment_status: "paid",
    amount_total: 2700,
    currency: "usd",
    metadata: { orderId: order.id },
    client_reference_id: order.id,
    customer_details: { email: "buyer@example.com" },
    collected_information: {
      shipping_details: {
        name: "Ada Test",
        address: {
          line1: "1 Loop Lane",
          line2: "",
          city: "Columbus",
          state: "OH",
          postal_code: "43004",
          country: "US",
        },
      },
    },
    payment_intent: "pi_test_1",
  };
  const send = async (mail: { to: string; subject: string; text: string }) => {
    sent.push(mail.text);
    return "sent" as const;
  };
  const first = await applyCheckoutEvent({
    store,
    eventId: "evt_paid_1",
    type: "checkout.session.completed",
    session,
    send,
    origin: "https://strangeinvention.com",
    alertTo: "owner@example.com",
  });
  const second = await applyCheckoutEvent({
    store,
    eventId: "evt_paid_1",
    type: "checkout.session.completed",
    session,
    send,
    origin: "https://strangeinvention.com",
    alertTo: "owner@example.com",
  });
  assert.equal(first, "paid");
  assert.equal(second, "duplicate");
  assert.equal(sent.length, 2);
  const saved = await store.get(order.id);
  assert.equal(saved?.status, "paid");
  assert.equal(saved?.customerEmail, "buyer@example.com");
  assert.equal(saved?.shipping?.line1, "1 Loop Lane");
  assert.equal(saved?.stripePaymentIntentId, "pi_test_1");
  const buyer = sent.find((text) => text.includes("Follow the order here"));
  const owner = sent.find((text) => text.includes("Ship to:"));
  assert.ok(buyer);
  assert.ok(owner);
  assert.equal(buyer.includes("1 Loop Lane"), false);
  assert.equal(buyer.toLowerCase().includes("stripe"), false);
  assert.equal(owner.includes("1 Loop Lane"), true);

  const cheap = pendingOrder();
  await store.save(cheap);
  const mismatch = await applyCheckoutEvent({
    store,
    eventId: "evt_cheap",
    type: "checkout.session.completed",
    session: { ...session, metadata: { orderId: cheap.id }, amount_total: 100 },
    send,
    origin: "https://strangeinvention.com",
  });
  assert.equal(mismatch, "mismatch");
  assert.equal((await store.get(cheap.id))?.status, "payment_failed");
});

test("signed webhook marks one order paid once", async () => {
  const store = createMemoryStore();
  const order = pendingOrder();
  await store.save(order);
  const secret = "whsec_test_secret_value";
  const event = {
    id: "evt_signed_1",
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_signed",
        object: "checkout.session",
        payment_status: "paid",
        amount_total: 2700,
        currency: "usd",
        metadata: { orderId: order.id },
        client_reference_id: order.id,
        customer_details: { email: "buyer@example.com" },
        collected_information: {
          shipping_details: {
            name: "Ada Test",
            address: {
              line1: "9 Shelf Street",
              city: "Columbus",
              state: "OH",
              postal_code: "43004",
              country: "US",
            },
          },
        },
        payment_intent: "pi_signed",
      },
    },
  };
  const payload = JSON.stringify(event);
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  let emails = 0;
  const env = {
    STRIPE_SECRET_KEY: "sk_test_abc",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_abc",
    STRIPE_WEBHOOK_SECRET: secret,
  };
  const first = await processWebhook({
    raw: payload,
    signature,
    env,
    store,
    send: async () => {
      emails += 1;
      return "sent";
    },
    origin: "https://strangeinvention.com",
    alertTo: "owner@example.com",
  });
  const second = await processWebhook({
    raw: payload,
    signature,
    env,
    store,
    send: async () => {
      emails += 1;
      return "sent";
    },
    origin: "https://strangeinvention.com",
    alertTo: "owner@example.com",
  });
  assert.equal(first.status, 200);
  assert.equal(first.result, "paid");
  assert.equal(second.result, "duplicate");
  assert.equal(emails, 2);
  assert.equal((await store.get(order.id))?.status, "paid");
});

test("shipping mark sends one tracking note and customer copy hides the address", async () => {
  const store = createMemoryStore();
  const order = pendingOrder();
  order.status = "paid";
  order.customerEmail = "buyer@example.com";
  order.shipping = {
    name: "Ada Test",
    line1: "1 Loop Lane",
    line2: "",
    city: "Columbus",
    state: "OH",
    postalCode: "43004",
    country: "US",
  };
  await store.save(order);
  const texts: string[] = [];
  const result = await markShipped({
    store,
    id: order.id,
    carrier: "UPS",
    trackingNumber: "1Z999AA10123456784",
    send: async (mail) => {
      texts.push(mail.text);
      return "sent";
    },
  });
  const again = await markShipped({
    store,
    id: order.id,
    carrier: "UPS",
    trackingNumber: "1Z999AA10123456784",
    send: async (mail) => {
      texts.push(mail.text);
      return "sent";
    },
  });
  assert.equal(result, "shipped");
  assert.equal(again, "duplicate");
  assert.equal(texts.length, 1);
  assert.equal(texts[0]?.includes("1 Loop Lane"), false);
  assert.match(texts[0] ?? "", /1Z999AA10123456784/);
  const preview = customerMail((await store.get(order.id))!, "https://strangeinvention.com");
  assert.equal(preview?.text.includes("1 Loop Lane"), false);
  assert.match(ownerMail((await store.get(order.id))!, "owner@example.com").text, /1 Loop Lane/);
});
