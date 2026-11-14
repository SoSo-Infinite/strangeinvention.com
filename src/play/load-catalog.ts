import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseCatalog, type Catalog } from "./catalog";

export async function loadCatalog(): Promise<Catalog> {
  const file = path.join(process.cwd(), "public", "play", "catalog.json");
  const raw = await readFile(file, "utf8");
  return parseCatalog(JSON.parse(raw) as unknown);
}
