export type Badge = "REAL" | "FICTIONAL" | "BUYABLE";

export type Tier = {
  id: "desk" | "shelf" | "showpiece";
  name: string;
  material: string;
  priceCents: number;
  setSize: number;
  fabricated: boolean;
};

type ItemBase = {
  id: string;
  name: string;
  badge: Badge;
  blurb: string;
  docLine: string;
  oogerLine: string;
};

/** House exhibits. Chachkis can be ordered. Lore pieces cannot. */
export type Exhibit = ItemBase & {
  type: "exhibit";
  sale: "chachki" | "lore";
  patent?: string;
  inventor?: string;
  year?: number;
  replicaNote?: string;
};

/**
 * Curated affiliate shelf. starterPick marks a search link Chad should replace.
 * ebayUrl stays on the server. It is never sent to the browser as a link.
 */
export type AffiliateItem = ItemBase & {
  type: "affiliate";
  source: "ebay";
  ebayUrl: string;
  starterPick: true;
  badge: "BUYABLE";
};

export type CatalogItem = Exhibit | AffiliateItem;

export type Catalog = {
  tiers: Tier[];
  items: CatalogItem[];
};

export type ClientAffiliate = Omit<AffiliateItem, "ebayUrl" | "starterPick">;

export type ClientItem = Exhibit | ClientAffiliate;

export type ClientCatalog = {
  tiers: Tier[];
  items: ClientItem[];
};

const BADGES = new Set<Badge>(["REAL", "FICTIONAL", "BUYABLE"]);
const TIER_IDS = new Set(["desk", "shelf", "showpiece"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function needString(row: Record<string, unknown>, key: string) {
  const value = row[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Catalog item is missing ${key}.`);
  }
  return value.trim();
}

export function parseCatalog(data: unknown): Catalog {
  if (!isRecord(data) || !Array.isArray(data.tiers) || !Array.isArray(data.items)) {
    throw new Error("Catalog must include tiers and items.");
  }

  const tiers: Tier[] = data.tiers.map((tier) => {
    if (!isRecord(tier)) throw new Error("Bad tier.");
    const id = needString(tier, "id");
    if (!TIER_IDS.has(id)) throw new Error(`Unknown tier ${id}.`);
    const priceCents = tier.priceCents;
    const setSize = tier.setSize;
    if (typeof priceCents !== "number" || priceCents <= 0) {
      throw new Error(`Tier ${id} needs a price.`);
    }
    if (typeof setSize !== "number" || setSize <= 0) {
      throw new Error(`Tier ${id} needs a set size.`);
    }
    return {
      id: id as Tier["id"],
      name: needString(tier, "name"),
      material: needString(tier, "material"),
      priceCents,
      setSize,
      fabricated: tier.fabricated === true,
    };
  });

  if (tiers.length !== 3) throw new Error("Expected three chachki tiers.");

  const items: CatalogItem[] = data.items.map((item) => {
    if (!isRecord(item)) throw new Error("Bad catalog item.");
    const badge = needString(item, "badge") as Badge;
    if (!BADGES.has(badge)) throw new Error(`Bad badge on ${String(item.id)}.`);
    const base = {
      id: needString(item, "id"),
      name: needString(item, "name"),
      badge,
      blurb: needString(item, "blurb"),
      docLine: needString(item, "docLine"),
      oogerLine: needString(item, "oogerLine"),
    };
    if (item.type === "affiliate") {
      if (item.source !== "ebay") throw new Error(`${base.id} must use eBay.`);
      if (badge !== "BUYABLE") throw new Error(`${base.id} badge must be BUYABLE.`);
      return {
        ...base,
        type: "affiliate",
        source: "ebay",
        ebayUrl: needString(item, "ebayUrl"),
        starterPick: true,
        badge: "BUYABLE",
      } satisfies AffiliateItem;
    }
    if (item.type !== "exhibit") throw new Error(`${base.id} has a bad type.`);
    const sale = item.sale === "lore" ? "lore" : item.sale === "chachki" ? "chachki" : null;
    if (!sale) throw new Error(`${base.id} needs a sale mode.`);
    const exhibit: Exhibit = { ...base, type: "exhibit", sale };
    if (typeof item.patent === "string") exhibit.patent = item.patent;
    if (typeof item.inventor === "string") exhibit.inventor = item.inventor;
    if (typeof item.year === "number") exhibit.year = item.year;
    if (typeof item.replicaNote === "string") exhibit.replicaNote = item.replicaNote;
    return exhibit;
  });

  const ids = new Set(items.map((item) => item.id));
  if (ids.size !== items.length) throw new Error("Catalog ids must be unique.");
  return { tiers, items };
}

/** Drop the raw shop URL before the catalog reaches the browser. */
export function toClientCatalog(catalog: Catalog): ClientCatalog {
  return {
    tiers: catalog.tiers,
    items: catalog.items.map((item) => {
      if (item.type !== "affiliate") return item;
      return {
        type: "affiliate",
        source: "ebay",
        id: item.id,
        name: item.name,
        badge: "BUYABLE",
        blurb: item.blurb,
        docLine: item.docLine,
        oogerLine: item.oogerLine,
      };
    }),
  };
}

export function findItem(catalog: Catalog, id: string) {
  return catalog.items.find((item) => item.id === id) ?? null;
}
