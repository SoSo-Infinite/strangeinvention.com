const NAMED = new Set([
  "strangeinvention.com",
  "www.strangeinvention.com",
  "localhost",
  "127.0.0.1",
]);

/** Allow only this site, local dev, and Vercel preview hosts. */
export function originFromHost(hostHeader: string | null, proto: string | null) {
  if (!hostHeader) return null;
  if (hostHeader.includes("@") || hostHeader.includes("/")) return null;
  const hostname = hostHeader.split(":")[0]?.toLowerCase() ?? "";
  const preview = hostname.endsWith(".vercel.app") && hostname !== ".vercel.app";
  if (!preview && !NAMED.has(hostname)) return null;
  const local = hostname === "localhost" || hostname === "127.0.0.1";
  const scheme = local ? "http" : proto === "http" ? "http" : "https";
  return `${scheme}://${hostHeader}`;
}
