import { NextRequest, NextResponse } from "next/server";
import { deskCookieMatches, DESK_COOKIE } from "@/play/desk-auth";
import { createSmtpSender } from "@/play/mail";
import { markFulfilling, markShipped } from "@/play/orders";
import { getOrderStore } from "@/play/store";
import { asCarrier, cleanTrackingNumber } from "@/play/tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function back(request: NextRequest, note: string) {
  return NextResponse.redirect(new URL(`/desk?note=${note}`, request.url), 303);
}

export async function POST(request: NextRequest) {
  const adminKey = process.env.ADMIN_KEY?.trim();
  const cookie = request.cookies.get(DESK_COOKIE)?.value;
  if (!adminKey || !deskCookieMatches(cookie, adminKey)) {
    return back(request, "locked");
  }

  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return back(request, "no");
  try {
    if (new URL(origin).host !== host.split(",")[0]?.trim()) return back(request, "no");
  } catch {
    return back(request, "no");
  }

  const form = await request.formData();
  const id = String(form.get("id") ?? "");
  const action = String(form.get("action") ?? "");
  if (!/^[a-f0-9]{64}$/.test(id)) return back(request, "bad");

  try {
    const store = await getOrderStore();
    if (action === "fulfilling") {
      const result = await markFulfilling(store, id);
      return back(request, result === "ok" ? "packing" : "bad");
    }
    if (action === "shipped") {
      const carrier = asCarrier(String(form.get("carrier") ?? ""));
      const trackingNumber = cleanTrackingNumber(String(form.get("tracking") ?? ""));
      if (!carrier || !trackingNumber) return back(request, "bad");
      const result = await markShipped({
        store,
        id,
        carrier,
        trackingNumber,
        send: createSmtpSender(process.env),
      });
      return back(request, result === "shipped" ? "shipped" : result);
    }
    return back(request, "bad");
  } catch {
    console.error("desk update failed");
    return back(request, "closed");
  }
}
