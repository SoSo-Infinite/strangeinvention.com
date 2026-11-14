import { createHmac, timingSafeEqual } from "node:crypto";

export const DESK_COOKIE = "si_desk";

export function deskToken(adminKey: string) {
  return createHmac("sha256", adminKey).update("si-desk-v1").digest("hex");
}

export function deskCookieMatches(cookie: string | undefined, adminKey: string | undefined) {
  if (!cookie || !adminKey) return false;
  const expected = deskToken(adminKey);
  const left = Buffer.from(cookie);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
