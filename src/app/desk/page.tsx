import type { Metadata } from "next";
import { cookies } from "next/headers";
import { deskCookieMatches, DESK_COOKIE } from "@/play/desk-auth";
import { formatMoney } from "@/play/money";
import { statusLabel } from "@/play/orders";
import { getOrderStore } from "@/play/store";
import { storageConfigured } from "@/play/stripe-guard";
import { CARRIERS } from "@/play/tracking";
import "./desk.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Order desk",
  robots: { index: false, follow: false },
};

const NOTES: Record<string, string> = {
  no: "That key did not open the desk.",
  busy: "The desk is busy. Try again in a few minutes.",
  closed: "The order desk is not connected yet.",
  locked: "The desk is locked.",
  bad: "That update did not stick. Check the carrier and tracking number.",
  packing: "The order is marked as being packed.",
  shipped: "The order is marked shipped. A tracking note was sent when an email was on file and mail is connected.",
  missing: "That order is not on the desk.",
  duplicate: "That order was already marked shipped.",
};

export default async function DeskPage({
  searchParams,
}: {
  searchParams: Promise<{ note?: string }>;
}) {
  const params = await searchParams;
  const note = params.note ? NOTES[params.note] : "";
  const adminKey = process.env.ADMIN_KEY?.trim();
  const jar = await cookies();
  const authed = deskCookieMatches(jar.get(DESK_COOKIE)?.value, adminKey);

  return (
    <main className="desk">
      <h1>Order desk</h1>
      <p>Private. Visitors do not get a link here.</p>
      {note ? <p>{note}</p> : null}
      {!adminKey || !storageConfigured(process.env) ? (
        <p>The order desk is not connected yet.</p>
      ) : !authed ? (
        <form method="post" action="/api/desk/login">
          <label>
            Desk key
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button type="submit">Open the desk</button>
        </form>
      ) : (
        <DeskList />
      )}
    </main>
  );
}

async function DeskList() {
  let orders;
  try {
    orders = await (await getOrderStore()).list();
  } catch {
    return <p>The order desk is not connected yet.</p>;
  }

  return (
    <>
      <form method="post" action="/api/desk/logout">
        <button className="ghost" type="submit">
          Lock the desk
        </button>
      </form>
      {orders.length === 0 ? <p>No orders yet.</p> : null}
      {orders.map((order) => {
        const payment = order.stripePaymentIntentId
          ? `https://dashboard.stripe.com/test/payments/${order.stripePaymentIntentId}`
          : "https://dashboard.stripe.com/test/payments";
        return (
          <article key={order.id}>
            <h2>
              {order.itemName} — {order.tierName}
            </h2>
            <p>
              {statusLabel(order.status)} · {formatMoney(order.totalCents)} · qty {order.qty} · set of{" "}
              {order.setSize}
            </p>
            <p>{order.customerEmail ?? "No email saved."}</p>
            <address>
              {order.shipping
                ? [
                    order.shipping.name,
                    order.shipping.line1,
                    order.shipping.line2,
                    `${order.shipping.city} ${order.shipping.state} ${order.shipping.postalCode}`,
                    order.shipping.country,
                  ]
                    .filter((line) => line && line.trim())
                    .join("\n")
                : "No shipping address saved."}
            </address>
            {order.carrier ? (
              <p>
                {order.carrier} {order.trackingNumber}
              </p>
            ) : null}
            <p>
              Refunds are done from the Stripe test dashboard. This desk does not send a refund.{" "}
              <a href={payment} target="_blank" rel="noopener noreferrer">
                Open this payment in the Stripe test dashboard
              </a>
            </p>
            {order.status === "paid" || order.status === "fulfilling" ? (
              <div className="row">
                <form method="post" action="/api/desk/orders">
                  <input type="hidden" name="id" value={order.id} />
                  <input type="hidden" name="action" value="fulfilling" />
                  <button type="submit">Mark fulfilling</button>
                </form>
                <form method="post" action="/api/desk/orders">
                  <input type="hidden" name="id" value={order.id} />
                  <input type="hidden" name="action" value="shipped" />
                  <label>
                    Carrier
                    <select name="carrier" defaultValue="USPS">
                      {CARRIERS.map((carrier) => (
                        <option key={carrier}>{carrier}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Tracking number
                    <input name="tracking" required minLength={4} maxLength={40} />
                  </label>
                  <button type="submit">Mark shipped</button>
                </form>
              </div>
            ) : null}
          </article>
        );
      })}
    </>
  );
}
