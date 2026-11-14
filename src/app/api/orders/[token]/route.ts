import { NextResponse } from "next/server";
import { toPublicOrder } from "@/play/orders";
import { getOrderStore } from "@/play/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN = /^[a-f0-9]{64}$/;

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (!TOKEN.test(token)) return NextResponse.json({ error: "missing" }, { status: 404 });
  try {
    const store = await getOrderStore();
    const order = await store.get(token);
    if (!order) return NextResponse.json({ error: "missing" }, { status: 404 });
    return NextResponse.json(toPublicOrder(order));
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
