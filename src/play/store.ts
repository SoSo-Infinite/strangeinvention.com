import { storageConfigured } from "./stripe-guard";
import type { OrderStore } from "./orders";

export async function getOrderStore(): Promise<OrderStore> {
  if (!storageConfigured(process.env)) {
    throw new Error("store-unconfigured");
  }
  const { createBlobStore } = await import("./blob-store");
  return createBlobStore();
}
