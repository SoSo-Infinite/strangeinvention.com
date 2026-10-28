export type UaClass = "mobile" | "desktop" | "bot" | "unknown";

/** Coarse client class. The raw User-Agent string is never stored. */
export function uaClass(ua: string | null): UaClass {
  if (!ua) return "unknown";
  const s = ua.slice(0, 300).toLowerCase();
  if (/bot|crawler|spider|slurp|headless|preview/.test(s)) return "bot";
  if (/ipad|iphone|ipod|android|mobile|phone/.test(s)) return "mobile";
  if (/mozilla|chrome|safari|firefox|edg\//.test(s)) return "desktop";
  return "unknown";
}
