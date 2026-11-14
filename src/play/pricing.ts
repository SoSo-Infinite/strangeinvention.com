import type { Catalog, Tier } from "./catalog";

export type ChachkiLine = {
  itemId: string;
  itemName: string;
  tierId: Tier["id"];
  tierName: string;
  material: string;
  setSize: number;
  fabricated: boolean;
  qty: number;
  unitAmount: number;
  totalCents: number;
  currency: "usd";
};

/**
 * Server price for a house chachki. Client price and quantity are ignored.
 * Affiliate items and lore pieces return null so they never enter checkout.
 */
export function quoteChachki(
  catalog: Catalog,
  input: { itemId?: unknown; tierId?: unknown },
): ChachkiLine | null {
  if (typeof input.itemId !== "string" || typeof input.tierId !== "string") return null;
  const item = catalog.items.find((entry) => entry.id === input.itemId);
  if (!item || item.type !== "exhibit" || item.sale !== "chachki") return null;
  const tier = catalog.tiers.find((entry) => entry.id === input.tierId);
  if (!tier) return null;
  return {
    itemId: item.id,
    itemName: item.name,
    tierId: tier.id,
    tierName: tier.name,
    material: tier.material,
    setSize: tier.setSize,
    fabricated: tier.fabricated,
    qty: 1,
    unitAmount: tier.priceCents,
    totalCents: tier.priceCents,
    currency: "usd",
  };
}
