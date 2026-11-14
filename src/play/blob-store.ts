import { get, list, put } from "@vercel/blob";
import type { Order, OrderStore } from "./orders";

async function readJson(pathname: string): Promise<Order | null> {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const text = await new Response(result.stream).text();
  return JSON.parse(text) as Order;
}

export function createBlobStore(): OrderStore {
  return {
    async get(id) {
      if (!/^[a-f0-9]{64}$/.test(id)) return null;
      return readJson(`orders/${id}.json`);
    },
    async save(order) {
      await put(`orders/${order.id}.json`, JSON.stringify(order), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
      });
    },
    async list() {
      const orders: Order[] = [];
      let cursor: string | undefined;
      do {
        const page = await list({ prefix: "orders/", cursor, limit: 100 });
        for (const blob of page.blobs) {
          if (!blob.pathname.endsWith(".json")) continue;
          const order = await readJson(blob.pathname);
          if (order) orders.push(order);
        }
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      orders.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      return orders;
    },
    async claimEvent(eventId) {
      if (!/^[A-Za-z0-9_-]{1,120}$/.test(eventId)) return "seen";
      try {
        await put(`events/${eventId}.json`, "{}", {
          access: "private",
          addRandomSuffix: false,
          allowOverwrite: false,
          contentType: "application/json",
        });
        return "new";
      } catch {
        return "seen";
      }
    },
  };
}
