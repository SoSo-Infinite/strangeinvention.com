import { NextRequest, NextResponse } from "next/server";
import { DESK_COOKIE, deskToken } from "@/play/desk-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const attempts = new Map<string, { count: number; reset: number }>();

function sameSite(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host.split(",")[0]?.trim();
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!sameSite(request)) return NextResponse.json({ error: "no" }, { status: 403 });
  const adminKey = process.env.ADMIN_KEY?.trim();
  if (!adminKey) {
    return NextResponse.redirect(new URL("/desk?note=closed", request.url), 303);
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const slot = attempts.get(ip);
  if (!slot || slot.reset < now) attempts.set(ip, { count: 0, reset: now + 10 * 60 * 1000 });
  const current = attempts.get(ip)!;
  if (current.count > 12) {
    return NextResponse.redirect(new URL("/desk?note=busy", request.url), 303);
  }

  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const expected = Buffer.from(adminKey);
  const given = Buffer.from(password);
  const { timingSafeEqual } = await import("node:crypto");
  const match = expected.length === given.length && timingSafeEqual(expected, given);
  if (!match) {
    current.count += 1;
    return NextResponse.redirect(new URL("/desk?note=no", request.url), 303);
  }

  const response = NextResponse.redirect(new URL("/desk", request.url), 303);
  response.cookies.set(DESK_COOKIE, deskToken(adminKey), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
