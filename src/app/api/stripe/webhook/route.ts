import { NextRequest, NextResponse } from "next/server";
import { createSmtpSender } from "@/play/mail";
import { originFromHost } from "@/play/origin";
import { getOrderStore } from "@/play/store";
import { processWebhook } from "@/play/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const origin =
    originFromHost(
      request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
      request.headers.get("x-forwarded-proto"),
    ) ?? "https://strangeinvention.com";

  let store;
  try {
    store = await getOrderStore();
  } catch {
    console.error("webhook store unavailable");
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const result = await processWebhook({
    raw,
    signature: request.headers.get("stripe-signature"),
    env: process.env,
    store,
    send: createSmtpSender(process.env),
    origin,
    alertTo: process.env.ORDER_ALERT_TO?.trim() || undefined,
  });

  if (result.status === 400) return NextResponse.json({ error: "bad signature" }, { status: 400 });
  if (result.status === 503) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  return NextResponse.json({ received: true });
}
