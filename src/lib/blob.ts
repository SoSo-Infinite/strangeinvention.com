import { randomBytes } from "node:crypto";

export type Env = Record<string, string | undefined>;
export type BlobAccess = "private" | "public";

export type PutBlob = (
  pathname: string,
  body: string,
  access: BlobAccess,
  token: string | undefined,
) => Promise<void>;

const TOKEN_OR_TRANSPORT =
  /valid token|token expired|unauthorized|oidc is enabled|aborted|not available|too many requests|fetch failed/;

/** True when this store cannot accept private blobs. Token and network errors are not this case. */
export function privateAccessRejected(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (TOKEN_OR_TRANSPORT.test(msg)) return false;
  if (
    msg.includes("private") &&
    /not allowed|not supported|only (allows|supports)|public|invalid access|access level|store access|rejected|denied/.test(
      msg,
    )
  ) {
    return true;
  }
  return /only (allows|supports) ["']?public|must be ["']?public|access type ["']?private["']? is not/.test(
    msg,
  );
}

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
  access: BlobAccess,
  token: string | undefined,
): Promise<void> {
  const { put } = await import("@vercel/blob");
  await put(pathname, body, {
    access,
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: false,
    cacheControlMaxAge: 60,
    abortSignal: AbortSignal.timeout(8000),
    ...(token ? { token } : {}),
  });
}

/** Private first. The same unguessable path is retried as public only when the store is public-only. */
export async function writeBlob(
  pathname: string,
  body: string,
  env: Env,
  putBlob: PutBlob = defaultPut,
): Promise<BlobAccess> {
  const token = blobToken(env);
  try {
    await putBlob(pathname, body, "private", token);
    return "private";
  } catch (err) {
    if (!privateAccessRejected(err)) throw err;
  }
  await putBlob(pathname, body, "public", token);
  return "public";
}
