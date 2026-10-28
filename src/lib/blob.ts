import { randomBytes } from "node:crypto";

export type Env = Record<string, string | undefined>;

export type PutBlob = (
  pathname: string,
  body: string,
  access: "private",
  token: string | undefined,
  options?: { allowOverwrite?: boolean },
) => Promise<void>;

export function blobConfigured(env: Env): boolean {
  return Boolean(env.BLOB_READ_WRITE_TOKEN?.trim() || env.BLOB_STORE_ID?.trim());
}

export function blobToken(env: Env): string | undefined {
  const token = env.BLOB_READ_WRITE_TOKEN?.trim();
  return token || undefined;
}

export function safeId(random?: () => string): string {
  const offered = random?.() ?? "";
  if (/^[a-f0-9]{8,64}$/i.test(offered)) return offered.toLowerCase();
  return randomBytes(8).toString("hex");
}

async function defaultPut(
  pathname: string,
  body: string,
  _access: "private",
  token: string | undefined,
  options?: { allowOverwrite?: boolean },
): Promise<void> {
  const { put } = await import("@vercel/blob");
  await put(pathname, body, {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: options?.allowOverwrite === true,
    cacheControlMaxAge: 60,
    abortSignal: AbortSignal.timeout(8000),
    ...(token ? { token } : {}),
  });
}

export function blobAlreadyExists(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  const name = err instanceof Error ? err.name.toLowerCase() : "";
  return name.includes("alreadyexists") || /already exists/.test(message);
}

/** Private blobs only. An existing object is reported and left in place. */
export async function writeBlob(
  pathname: string,
  body: string,
  env: Env,
  putBlob: PutBlob = defaultPut,
  options?: { allowOverwrite?: boolean },
): Promise<"stored" | "exists"> {
  try {
    await putBlob(pathname, body, "private", blobToken(env), options);
    return "stored";
  } catch (err) {
    if (options?.allowOverwrite !== true && blobAlreadyExists(err)) return "exists";
    throw err;
  }
}
