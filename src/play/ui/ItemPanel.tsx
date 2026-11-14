"use client";

import { useEffect, useState } from "react";
import type { ClientItem, Tier } from "@/play/catalog";
import {
  AFFILIATE_DISCLOSURE,
  AGE_CARD,
  AGE_CHECKOUT,
  CHECKOUT_CLOSED,
  COMING_SOON,
  EBAY_BUTTON,
  LORE_ONLY,
  SEE_PRICE,
  SMALL_PARTS,
} from "@/play/copy";
import { formatMoney } from "@/play/money";

function isTrackedEbay(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const ebay = host === "ebay.com" || host.endsWith(".ebay.com");
    return (
      url.protocol === "https:" &&
      ebay &&
      url.searchParams.get("mkevt") === "1" &&
      Boolean(url.searchParams.get("campid"))
    );
  } catch {
    return false;
  }
}

export function ItemPanel({
  item,
  tiers,
  roomId,
  checkoutReady,
  affiliateReady,
  onClose,
}: {
  item: ClientItem;
  tiers: Tier[];
  roomId: string;
  checkoutReady: boolean;
  affiliateReady: boolean;
  onClose: () => void;
}) {
  const [solidify, setSolidify] = useState(false);
  const [tierId, setTierId] = useState<Tier["id"]>("desk");
  const [busy, setBusy] = useState(false);
  const [soon, setSoon] = useState(!affiliateReady);
  const [message, setMessage] = useState("");
  const tier = tiers.find((entry) => entry.id === tierId) ?? tiers[0];

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function openEbay() {
    setBusy(true);
    try {
      const res = await fetch("/api/affiliate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId: item.id, roomId }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string | null };
      if (!data.url || !isTrackedEbay(data.url)) {
        setSoon(true);
        return;
      }
      const link = document.createElement("a");
      link.href = data.url;
      link.target = "_blank";
      link.rel = "sponsored noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      setSoon(true);
    } finally {
      setBusy(false);
    }
  }

  async function sendHome() {
    if (!tier) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId: item.id, tierId: tier.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setMessage(data.error || CHECKOUT_CLOSED);
        return;
      }
      const publishable = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
      if (publishable?.startsWith("pk_test_")) {
        try {
          const { loadStripe } = await import("@stripe/stripe-js");
          await loadStripe(publishable);
        } catch {
          /* the hosted page still opens */
        }
      }
      window.location.assign(data.url);
    } catch {
      setMessage(CHECKOUT_CLOSED);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shade" role="presentation" onClick={onClose}>
      <article
        className="card-pop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="card-top">
          <span className={`badge badge-${item.badge.toLowerCase()}`}>{item.badge}</span>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <h2 id="card-title">{item.name}</h2>
        {item.type === "exhibit" && item.patent ? (
          <p className="meta">
            {item.patent}
            {item.inventor ? ` · ${item.inventor}` : ""}
            {item.year ? ` · ${item.year}` : ""}
          </p>
        ) : null}
        <p>{item.blurb}</p>
        {item.type === "exhibit" && item.replicaNote ? <p>{item.replicaNote}</p> : null}
        <p className="quote">Doc: {item.docLine}</p>
        <p className="quote">Ooger: {item.oogerLine}</p>

        {item.type === "affiliate" ? (
          <div className="buy-block">
            <p className="price">{SEE_PRICE}</p>
            <p>{AFFILIATE_DISCLOSURE}</p>
            {soon ? (
              <button type="button" disabled>
                {COMING_SOON}
              </button>
            ) : (
              <button type="button" onClick={openEbay} disabled={busy}>
                {EBAY_BUTTON}
              </button>
            )}
          </div>
        ) : null}

        {item.type === "exhibit" && item.sale === "lore" ? (
          <p className="lore">{LORE_ONLY}</p>
        ) : null}

        {item.type === "exhibit" && item.sale === "chachki" && !solidify ? (
          <div className="buy-block">
            <p>{AGE_CARD}</p>
            <button type="button" onClick={() => setSolidify(true)}>
              Inquire About Stability
            </button>
          </div>
        ) : null}

        {item.type === "exhibit" && item.sale === "chachki" && solidify ? (
          <div className="buy-block">
            <h3>Solidify Context</h3>
            <fieldset>
              <legend>Example test prices</legend>
              {tiers.map((choice) => (
                <label key={choice.id} className="tier">
                  <input
                    type="radio"
                    name="tier"
                    checked={tierId === choice.id}
                    onChange={() => setTierId(choice.id)}
                  />
                  <span>
                    {choice.name}, {choice.material}, {formatMoney(choice.priceCents)}. Set of{" "}
                    {choice.setSize}.
                  </span>
                </label>
              ))}
            </fieldset>
            {tier?.fabricated ? <p>{SMALL_PARTS}</p> : null}
            <p>{AGE_CHECKOUT}</p>
            {checkoutReady ? (
              <button type="button" onClick={sendHome} disabled={busy}>
                {busy ? "Opening the order…" : "Send to My House Now"}
              </button>
            ) : (
              <p>{CHECKOUT_CLOSED}</p>
            )}
            {message ? <p>{message}</p> : null}
          </div>
        ) : null}
      </article>
    </div>
  );
}
