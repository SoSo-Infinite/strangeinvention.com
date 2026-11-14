"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/play/money";
import type { PublicOrder } from "@/play/orders";
import { statusLabel } from "@/play/status";

export function OrderView({
  initial,
  token,
  thanks,
}: {
  initial: PublicOrder;
  token: string;
  thanks?: boolean;
}) {
  const [order, setOrder] = useState(initial);

  useEffect(() => {
    if (order.status !== "pending") return;
    const timer = window.setInterval(async () => {
      const res = await fetch(`/api/orders/${token}`);
      if (!res.ok) return;
      const next = (await res.json()) as PublicOrder;
      setOrder(next);
      if (next.status !== "pending") window.clearInterval(timer);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [order.status, token]);

  return (
    <article className="order-card">
      <h1>{thanks ? "The order page" : "Order status"}</h1>
      <p>
        {order.itemName} — {order.tierName}, {order.material}, set of {order.setSize}
      </p>
      <p>Quantity {order.qty}</p>
      <p>Total {formatMoney(order.totalCents)}</p>
      <p>{statusLabel(order.status)}</p>
      {order.status === "pending" ? <p>The payment is being confirmed.</p> : null}
      {order.status === "shipped" && order.trackingNumber ? (
        <p>
          {order.carrier} {order.trackingNumber}
          {order.trackingUrl ? (
            <>
              {" "}
              <a href={order.trackingUrl}>Track it</a>
            </>
          ) : null}
        </p>
      ) : null}
    </article>
  );
}
