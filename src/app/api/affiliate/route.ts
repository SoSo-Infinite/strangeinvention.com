import { NextRequest, NextResponse } from "next/server";
import { buildEbayAffiliateUrl } from "@/play/affiliate";
import { findItem } from "@/play/catalog";
import { loadCatalog } from "@/play/load-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const itemId = typeof record.itemId === "string" ? record.itemId : "";
  const roomId = typeof record.roomId === "string" ? record.roomId : "shelf";
  const catalog = await loadCatalog();
  const item = findItem(catalog, itemId);
  if (!item || item.type !== "affiliate") {
    return NextResponse.json({ url: null }, { status: 404 });
  }
  const url = buildEbayAffiliateUrl({
    itemUrl: item.ebayUrl,
    campid: process.env.EBAY_EPN_CAMPID,
    customid: `${roomId}-${item.id}`,
  });
  if (!url) return NextResponse.json({ url: null });
  return NextResponse.json({ url });
}
