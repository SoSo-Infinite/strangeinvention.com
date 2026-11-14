import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { AGE_CARD, CHECKOUT_CLOSED } from "@/play/copy";
import { loadCatalog } from "@/play/load-catalog";
import { originFromHost } from "@/play/origin";
import { newOrderId, type Order } from "@/play/orders";
import { quoteChachki } from "@/play/pricing";
import { getOrderStore } from "@/play/store";
import { guardCheckoutEnv, storageConfigured } from "@/play/stripe-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function integrationIdentifier() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  const bytes = randomBytes(8);
  let suffix = "";
  for (let i = 0; i < 8; i += 1) suffix += alphabet[bytes[i]! % 26];
  return `warehouse${suffix}`;
}

export async function POST(request: NextRequest) {
  const guard = guardCheckoutEnv(process.env);
  if (!guard.ok || !storageConfigured(process.env)) {
    if (!guard.ok && guard.reason === "live") console.error("checkout refused: live key");
    return NextResponse.json({ error: CHECKOUT_CLOSED }, { status: 503 });
  }

  const origin = originFromHost(
    request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
    request.headers.get("x-forwarded-proto"),
  );
  if (!origin) return NextResponse.json({ error: CHECKOUT_CLOSED }, { status: 400 });

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const catalog = await loadCatalog();
  const line = quoteChachki(catalog, { itemId: record.itemId, tierId: record.tierId });
  if (!line) {
    return NextResponse.json(
      { error: "That piece is not sold from the warehouse." },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const order: Order = {
    id: newOrderId(),
    status: "pending",
    itemId: line.itemId,
    itemName: line.itemName,
    tierId: line.tierId,
    tierName: line.tierName,
    material: line.material,
    setSize: line.setSize,
    qty: line.qty,
    unitAmount: line.unitAmount,
    totalCents: line.totalCents,
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

  try {
    const store = await getOrderStore();
    await store.save(order);
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!.trim());
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: order.id,
      metadata: { orderId: order.id, itemId: line.itemId, tierId: line.tierId },
      integration_identifier: integrationIdentifier(),
      success_url: `${origin}/play/thanks?order=${order.id}`,
      cancel_url: `${origin}/play?checkout=cancel`,
      billing_address_collection: "auto",
      shipping_address_collection: { allowed_countries: ["US"] },
      phone_number_collection: { enabled: false },
      invoice_creation: { enabled: false },
      line_items: [
        {
          quantity: line.qty,
          price_data: {
            currency: "usd",
            unit_amount: line.unitAmount,
            product_data: {
              name: `${line.itemName} — ${line.tierName}`,
              description: `${AGE_CARD} ${line.tierName}, ${line.material}, set of ${line.setSize}. Example test price.`,
            },
          },
        },
      ],
    });
    order.stripeSessionId = session.id;
    order.updatedAt = new Date().toISOString();
    await store.save(order);
    if (!session.url) return NextResponse.json({ error: CHECKOUT_CLOSED }, { status: 502 });
    return NextResponse.json({ url: session.url });
  } catch {
    console.error("checkout failed");
    return NextResponse.json({ error: CHECKOUT_CLOSED }, { status: 503 });
  }
}
