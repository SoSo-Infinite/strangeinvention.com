/**
 * STARTER PICKS: eBay URLs in public/play/catalog.json are search links for
 * Chad to replace with the exact listings he wants. They are not a final
 * product list. The link builder never emits an untracked eBay URL.
 */

const EBAY_PARAMS = {
  mkevt: "1",
  mkcid: "1",
  mkrid: "711-53200-19255-0",
  toolid: "10001",
} as const;

function isEbayHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return host === "ebay.com" || host.endsWith(".ebay.com");
}

function cleanCustomId(value: string) {
  const cleaned = value.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  return cleaned || "shelf";
}

/**
 * Turn a plain eBay item or search URL into an EPN tracked link.
 * Returns null when the campaign id is missing or the host is not eBay,
 * so callers never publish an untracked URL by accident.
 */
export function buildEbayAffiliateUrl(input: {
  itemUrl: string;
  campid: string | undefined | null;
  customid: string;
}): string | null {
  const campid = (input.campid ?? "").trim();
  if (!/^[0-9]{4,20}$/.test(campid)) return null;

  let url: URL;
  try {
    url = new URL(input.itemUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (!isEbayHost(url.hostname)) return null;

  url.searchParams.set("mkevt", EBAY_PARAMS.mkevt);
  url.searchParams.set("mkcid", EBAY_PARAMS.mkcid);
  url.searchParams.set("mkrid", EBAY_PARAMS.mkrid);
  url.searchParams.set("campid", campid);
  url.searchParams.set("toolid", EBAY_PARAMS.toolid);
  url.searchParams.set("customid", cleanCustomId(input.customid));
  url.hash = "";
  return url.toString();
}

export function affiliateLinksConfigured(campid: string | undefined | null) {
  return buildEbayAffiliateUrl({
    itemUrl: "https://www.ebay.com/sch/i.html?_nkw=test",
    campid,
    customid: "probe",
  }) !== null;
}
