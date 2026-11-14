import { randomBytes } from "node:crypto";
import { AGE_CARD, TEST_BANNER } from "./copy";
import { formatMoney } from "./money";
import { trackingUrl, type Carrier } from "./tracking";

export type OrderStatus =
  | "pending"
  | "paid"
  | "fulfilling"
  | "shipped"
  | "payment_failed"
  | "canceled";

export type ShippingAddress = {
  name: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type Order = {
  id: string;
  status: OrderStatus;
  itemId: string;
  itemName: string;
  tierId: string;
  tierName: string;
  material: string;
  setSize: number;
  qty: number;
  unitAmount: number;
  totalCents: number;
  currency: "usd";
  customerEmail: string | null;
  shipping: ShippingAddress | null;
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
  processedEventIds: string[];
  emailsSent: { customer: boolean; owner: boolean; tracking: boolean };
  carrier: string | null;
  trackingNumber: string | null;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
  shippedAt: string | null;
};

export type PublicOrder = {
  status: OrderStatus;
  itemName: string;
  tierName: string;
  material: string;
  setSize: number;
  qty: number;
  totalCents: number;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
};

export type Mail = { to: string; subject: string; text: string };
export type SendMail = (mail: Mail) => Promise<"sent" | "skipped" | "failed">;

export interface OrderStore {
  get(id: string): Promise<Order | null>;
  save(order: Order): Promise<void>;
  list(): Promise<Order[]>;
  claimEvent(eventId: string): Promise<"new" | "seen">;
}

export function createMemoryStore(): OrderStore {
  const orders = new Map<string, Order>();
  const events = new Set<string>();
  return {
    async get(id) {
      const order = orders.get(id);
      return order ? structuredClone(order) : null;
    },
    async save(order) {
      orders.set(order.id, structuredClone(order));
    },
    async list() {
      return [...orders.values()]
        .map((order) => structuredClone(order))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    },
    async claimEvent(eventId) {
      if (events.has(eventId)) return "seen";
      events.add(eventId);
      return "new";
    },
  };
}

export function newOrderId() {
  return randomBytes(32).toString("hex");
}

export function toPublicOrder(order: Order): PublicOrder {
  return {
    status: order.status,
    itemName: order.itemName,
    tierName: order.tierName,
    material: order.material,
    setSize: order.setSize,
    qty: order.qty,
    totalCents: order.totalCents,
    carrier: order.carrier,
    trackingNumber: order.trackingNumber,
    trackingUrl:
      order.carrier && order.trackingNumber
        ? trackingUrl(order.carrier, order.trackingNumber)
        : null,
  };
}

export { statusLabel } from "./status";

type AddressLike = {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
};

export type CheckoutSessionLike = {
  id?: string;
  payment_status?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  metadata?: { orderId?: string } | null;
  client_reference_id?: string | null;
  customer_details?: { email?: string | null } | null;
  customer_email?: string | null;
  collected_information?: {
    shipping_details?: { name?: string | null; address?: AddressLike | null } | null;
  } | null;
  shipping_details?: { name?: string | null; address?: AddressLike | null } | null;
  payment_intent?: string | { id?: string | null } | null;
};

function nowIso() {
  return new Date().toISOString();
}

function readShipping(session: CheckoutSessionLike): ShippingAddress | null {
  const details =
    session.collected_information?.shipping_details ?? session.shipping_details ?? null;
  const address = details?.address;
  if (!address?.line1) return null;
  return {
    name: details?.name?.trim() || "",
    line1: address.line1?.trim() || "",
    line2: address.line2?.trim() || "",
    city: address.city?.trim() || "",
    state: address.state?.trim() || "",
    postalCode: address.postal_code?.trim() || "",
    country: address.country?.trim() || "",
  };
}

function paymentIntentId(session: CheckoutSessionLike) {
  const value = session.payment_intent;
  if (typeof value === "string") return value;
  if (value && typeof value.id === "string") return value.id;
  return null;
}

export function customerMail(order: Order, origin: string): Mail | null {
  if (!order.customerEmail) return null;
  const link = `${origin}/play/order/${order.id}`;
  const text = [
    "The order is in.",
    "",
    `Item: ${order.itemName}`,
    `Choice: ${order.tierName}, ${order.material}, set of ${order.setSize}`,
    `Quantity: ${order.qty}`,
    `Total: ${formatMoney(order.totalCents)}`,
    "",
    AGE_CARD,
    "",
    "Follow the order here:",
    link,
    "",
    TEST_BANNER,
    "",
    "Strange Invention",
  ].join("\n");
  return {
    to: order.customerEmail,
    subject: "Strange Invention order confirmed",
    text,
  };
}

export function ownerMail(order: Order, alertTo: string): Mail {
  const ship = order.shipping;
  const address = ship
    ? [ship.name, ship.line1, ship.line2, `${ship.city} ${ship.state} ${ship.postalCode}`, ship.country]
        .filter((line) => line && line.trim())
        .join("\n")
    : "No shipping address was saved.";
  const text = [
    "A new order is paid.",
    "",
    `Item: ${order.itemName}`,
    `Choice: ${order.tierName}, ${order.material}, set of ${order.setSize}`,
    `Quantity: ${order.qty}`,
    `Total: ${formatMoney(order.totalCents)}`,
    `Email: ${order.customerEmail ?? "missing"}`,
    "",
    "Ship to:",
    address,
    "",
    `Order id: ${order.id}`,
    "Open the order desk to pack it and mark it shipped.",
  ].join("\n");
  return {
    to: alertTo,
    subject: "New warehouse order",
    text,
  };
}

export function trackingMail(order: Order): Mail | null {
  if (!order.customerEmail || !order.carrier || !order.trackingNumber) return null;
  const link =
    trackingUrl(order.carrier, order.trackingNumber) ?? "No public tracking link for this carrier.";
  const text = [
    "The order has shipped.",
    "",
    `Item: ${order.itemName}`,
    `Choice: ${order.tierName}`,
    `Carrier: ${order.carrier}`,
    `Tracking number: ${order.trackingNumber}`,
    `Track it: ${link}`,
    "",
    AGE_CARD,
    "",
    "Strange Invention",
  ].join("\n");
  return {
    to: order.customerEmail,
    subject: "A Strange Invention order is on the way",
    text,
  };
}

async function deliver(send: SendMail, mail: Mail | null) {
  if (!mail) return false;
  try {
    const result = await send(mail);
    return result === "sent";
  } catch {
    return false;
  }
}

export type ApplyResult = "paid" | "duplicate" | "ignored" | "mismatch" | "missing" | "failed";

export async function applyCheckoutEvent(input: {
  store: OrderStore;
  eventId: string;
  type: string;
  session: CheckoutSessionLike;
  send: SendMail;
  origin: string;
  alertTo?: string;
}): Promise<ApplyResult> {
  const claimed = await input.store.claimEvent(input.eventId);
  if (claimed === "seen") return "duplicate";

  const orderId = input.session.metadata?.orderId || input.session.client_reference_id || "";
  if (!orderId) return "missing";
  const order = await input.store.get(orderId);
  if (!order) return "missing";
  if (order.processedEventIds.includes(input.eventId)) return "duplicate";

  const stamp = () => {
    order.updatedAt = nowIso();
    order.processedEventIds.push(input.eventId);
  };

  if (input.type === "checkout.session.expired") {
    if (order.status === "pending") order.status = "canceled";
    stamp();
    await input.store.save(order);
    return "ignored";
  }

  if (input.type === "checkout.session.async_payment_failed") {
    if (order.status === "pending") order.status = "payment_failed";
    stamp();
    await input.store.save(order);
    return "failed";
  }

  if (
    input.type !== "checkout.session.completed" &&
    input.type !== "checkout.session.async_payment_succeeded"
  ) {
    return "ignored";
  }

  if (input.session.payment_status !== "paid") {
    stamp();
    await input.store.save(order);
    return "ignored";
  }

  if (order.status === "paid" || order.status === "fulfilling" || order.status === "shipped") {
    stamp();
    await input.store.save(order);
    return "duplicate";
  }

  if (input.session.amount_total !== order.totalCents || input.session.currency !== "usd") {
    order.status = "payment_failed";
    order.stripeSessionId = input.session.id ?? order.stripeSessionId;
    stamp();
    await input.store.save(order);
    return "mismatch";
  }

  order.status = "paid";
  order.paidAt = nowIso();
  order.customerEmail =
    input.session.customer_details?.email?.trim() ||
    input.session.customer_email?.trim() ||
    order.customerEmail;
  order.shipping = readShipping(input.session);
  order.stripeSessionId = input.session.id ?? order.stripeSessionId;
  order.stripePaymentIntentId = paymentIntentId(input.session);
  stamp();
  await input.store.save(order);

  if (!order.emailsSent.customer) {
    const sent = await deliver(input.send, customerMail(order, input.origin));
    order.emailsSent.customer = sent;
  }
  if (!order.emailsSent.owner && input.alertTo) {
    const sent = await deliver(input.send, ownerMail(order, input.alertTo));
    order.emailsSent.owner = sent;
  }
  order.updatedAt = nowIso();
  await input.store.save(order);
  return "paid";
}

export async function markFulfilling(store: OrderStore, id: string) {
  const order = await store.get(id);
  if (!order) return "missing" as const;
  if (order.status !== "paid" && order.status !== "fulfilling") return "bad" as const;
  order.status = "fulfilling";
  order.updatedAt = nowIso();
  await store.save(order);
  return "ok" as const;
}

export async function markShipped(input: {
  store: OrderStore;
  id: string;
  carrier: Carrier;
  trackingNumber: string;
  send: SendMail;
}) {
  const order = await input.store.get(input.id);
  if (!order) return "missing" as const;
  if (order.status === "shipped") return "duplicate" as const;
  if (order.status !== "paid" && order.status !== "fulfilling") return "bad" as const;
  order.status = "shipped";
  order.carrier = input.carrier;
  order.trackingNumber = input.trackingNumber;
  order.shippedAt = nowIso();
  order.updatedAt = order.shippedAt;
  await input.store.save(order);
  if (!order.emailsSent.tracking) {
    const sent = await deliver(input.send, trackingMail(order));
    order.emailsSent.tracking = sent;
    order.updatedAt = nowIso();
    await input.store.save(order);
  }
  return "shipped" as const;
}
