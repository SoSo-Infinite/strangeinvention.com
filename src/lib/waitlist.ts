import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { WAITLIST_COPY } from "./waitlist-copy";
import {
  blobConfigured,
  safeId,
  writeBlob,
  type Env,
  type PutBlob,
} from "./blob";
import { CLIENT_EVENTS, recordEvent, type EventCtx, type EventName, type LogFn } from "./events";
import { createRateLimiter, limiterKey, type LimitDecision } from "./rate-limit";

const MAX_BODY = 8 * 1024;
const EVENT_BODY = 1024;
export const MIN_FILL_MS = 1500;
const TICKET_FUTURE_MS = 60_000;
const TICKET_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SIGNUP_LIMIT = 8;
const SIGNUP_WINDOW_MS = 60 * 60 * 1000;
/** Stops a burst of rejected posts before they are parsed. Separate from the signup limit. */
export const FLOOD_LIMIT = 30;
const FLOOD_WINDOW_MS = 60 * 60 * 1000;
const EVENT_LIMIT = 30;
export const ALERT_CAP = 60;
const ALERT_WINDOW_MS = 60 * 60 * 1000;
const ALERT_TIMEOUT_MS = 8000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const signupLimiter = createRateLimiter(SIGNUP_LIMIT, SIGNUP_WINDOW_MS);
const floodLimiter = createRateLimiter(FLOOD_LIMIT, FLOOD_WINDOW_MS);
const eventLimiter = createRateLimiter(EVENT_LIMIT, SIGNUP_WINDOW_MS);
const alertLimiter = createRateLimiter(ALERT_CAP, ALERT_WINDOW_MS);

export type WaitlistDeps = {
  env?: Env;
  fetchImpl?: typeof fetch;
  now?: () => number;
  random?: () => string;
  putBlob?: PutBlob;
  allow?: (key: string, now: number) => LimitDecision;
  /** Generous cap before the body is parsed. Over the cap: 429 and a log line, no Blob write. */
  allowFlood?: (key: string, now: number) => LimitDecision;
  allowEvent?: (key: string, now: number) => LimitDecision;
  allowAlert?: (key: string, now: number) => LimitDecision;
  log?: LogFn;
  /** Run side work after the signup object is durable. The route passes Next's after(). */
  defer?: (task: Promise<void>) => void;
};

type AlertResult = "sent" | "skipped" | "failed" | "capped";

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  let host: string;
  try {
    host = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  const own = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "")
    .split(",")[0]
    ?.trim()
    .toLowerCase();
  return Boolean(own) && host === own;
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .toLowerCase();
  if (!email || email.length > 254 || !EMAIL_RE.test(email) || /[<>\s]/.test(email)) return null;
  return email;
}

function honeypotFilled(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim() !== "";
  return true;
}

function trimmed(value: string | undefined): string {
  return value?.trim() || "";
}

/** Fill-time and path secret. Blob credentials are never used to sign. */
export function ticketSecret(env: Env): string {
  return trimmed(env.WAITLIST_TICKET_SECRET);
}

export function issueTicket(issuedAt: number, secret: string): string {
  const body = String(issuedAt);
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/** Server time from a ticket this process signed. A client-supplied clock is ignored. */
export function ticketIssuedAt(ticket: unknown, secret: string): number | null {
  if (!secret || typeof ticket !== "string" || ticket.length > 200) return null;
  const dot = ticket.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = ticket.slice(0, dot);
  const got = Buffer.from(ticket.slice(dot + 1));
  const want = Buffer.from(createHmac("sha256", secret).update(body).digest("base64url"));
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  const issued = Number(body);
  if (!Number.isInteger(issued)) return null;
  return issued;
}

/** HMAC when the ticket secret is set, so the path is not a raw hash of the address. */
export function signupPath(email: string, secret = ""): string {
  const digest = secret
    ? createHmac("sha256", secret).update(email).digest("hex")
    : createHash("sha256").update(email).digest("hex");
  return `signups/${digest}.json`;
}

/** Read at most `max` bytes. A longer body is cancelled instead of buffered. */
export async function readBody(
  req: Request,
  max: number,
): Promise<{ ok: true; text: string } | { ok: false; reason: "large" | "read" }> {
  const declared = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > max) return { ok: false, reason: "large" };

  const stream = req.body;
  if (!stream) {
    try {
      const text = await req.text();
      if (text.length > max) return { ok: false, reason: "large" };
      return { ok: true, text };
    } catch {
      return { ok: false, reason: "read" };
    }
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > max) {
        await reader.cancel().catch(() => {});
        return { ok: false, reason: "large" };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch {
    return { ok: false, reason: "read" };
  }
  if (text.length > max) return { ok: false, reason: "large" };
  return { ok: true, text };
}

/** URL plus optional bearer key. Only ALERT_WEBHOOK_URL and ALERT_WEBHOOK_KEY are read. */
export function alertConfig(env: Env): { state: "skipped" } | { state: "invalid" } | { state: "ready"; url: string; key: string } {
  const urlRaw = trimmed(env.ALERT_WEBHOOK_URL);
  if (!urlRaw) return { state: "skipped" };
  let url: URL;
  try {
    url = new URL(urlRaw);
  } catch {
    return { state: "invalid" };
  }
  if (url.protocol !== "https:" || url.username || url.password) return { state: "invalid" };
  return {
    state: "ready",
    url: url.toString(),
    key: trimmed(env.ALERT_WEBHOOK_KEY),
  };
}

async function deliverAlert(
  email: string,
  env: Env,
  fetchImpl: typeof fetch,
  allowAlert: (key: string, now: number) => LimitDecision,
  now: number,
): Promise<AlertResult> {
  const config = alertConfig(env);
  if (config.state === "skipped") return "skipped";
  if (config.state === "invalid") return "failed";
  if (!allowAlert("alerts", now).ok) return "capped";
  const first = await sendAlert(email, env, fetchImpl);
  if (first !== "failed") return first;
  return sendAlert(email, env, fetchImpl);
}

export async function sendAlert(email: string, env: Env, fetchImpl: typeof fetch): Promise<AlertResult> {
  const config = alertConfig(env);
  if (config.state === "skipped") return "skipped";
  if (config.state === "invalid") return "failed";
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (config.key) headers.authorization = `Bearer ${config.key}`;
  try {
    const res = await fetchImpl(config.url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        source: "strangeinvention.com waitlist",
        summary: `Strange Invention waitlist signup.\nEmail: ${email}`,
      }),
      redirect: "error",
      signal: AbortSignal.timeout(ALERT_TIMEOUT_MS),
    });
    return res.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

function ctxFrom(deps: WaitlistDeps, env: Env, log: LogFn, now: () => number): EventCtx {
  return {
    env,
    now,
    random: deps.random,
    putBlob: deps.putBlob,
    log,
  };
}

async function finish(task: Promise<void>, deps: WaitlistDeps, log: LogFn): Promise<void> {
  const guarded = task.catch(() => {
    log({ event: "waitlist_background_failed" });
  });
  if (!deps.defer) {
    await guarded;
    return;
  }
  try {
    deps.defer(guarded);
  } catch {
    await guarded;
  }
}

function tooFast(issued: number | null, now: number): boolean {
  if (issued === null) return true;
  const elapsed = now - issued;
  if (elapsed < -TICKET_FUTURE_MS || elapsed > TICKET_MAX_AGE_MS) return true;
  return elapsed < MIN_FILL_MS;
}

/**
 * Browsers omit Origin on same-origin GETs. A missing Origin is allowed.
 * Sec-Fetch-Site: same-origin is allowed. A cross-site fetch or a mismatched Origin is not.
 */
export function ticketGetAllowed(req: Request): boolean {
  const site = (req.headers.get("sec-fetch-site") || "").toLowerCase();
  if (site === "cross-site" || site === "cross-origin") return false;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  return sameOrigin(req);
}

export function handleTicket(req: Request, deps: WaitlistDeps = {}): Response {
  const env = deps.env ?? process.env;
  const now = (deps.now ?? Date.now)();
  if (!ticketGetAllowed(req)) return json(403, { ok: false, error: WAITLIST_COPY.origin });
  const secret = ticketSecret(env);
  if (!secret) return json(200, { ticket: null });
  return json(200, { ticket: issueTicket(now, secret) });
}

/**
 * Save one waitlist signup. Success means the Blob write finished.
 * A missing or failed alert does not undo that, and a failed write never says they are on the list.
 */
export async function handleWaitlist(req: Request, deps: WaitlistDeps = {}): Promise<Response> {
  const env = deps.env ?? process.env;
  const nowFn = deps.now ?? Date.now;
  const log = deps.log ?? ((entry) => console.log(JSON.stringify(entry)));
  const allow = deps.allow ?? ((key, now) => signupLimiter.allow(key, now));
  const allowFlood = deps.allowFlood ?? ((key, at) => floodLimiter.allow(key, at));
  const fetchImpl = deps.fetchImpl ?? fetch;
  const ctx = ctxFrom(deps, env, log, nowFn);
  const now = nowFn();

  if (!sameOrigin(req)) {
    log({ event: "waitlist_origin_rejected" });
    return json(403, { ok: false, error: WAITLIST_COPY.origin });
  }

  if (!allowFlood(limiterKey(req), now).ok) {
    log({ event: "waitlist_rate_limited" });
    return json(429, { ok: false, error: WAITLIST_COPY.rate });
  }

  const contentType = (req.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    log({ event: "waitlist_invalid" });
    return json(415, { ok: false, error: WAITLIST_COPY.badRequest });
  }

  const read = await readBody(req, MAX_BODY);
  if (!read.ok) {
    log({ event: "waitlist_invalid" });
    return json(read.reason === "large" ? 413 : 400, {
      ok: false,
      error: read.reason === "large" ? WAITLIST_COPY.large : WAITLIST_COPY.badRequest,
    });
  }
  const raw = read.text;

  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("shape");
    }
    body = parsed as Record<string, unknown>;
  } catch {
    log({ event: "waitlist_invalid" });
    return json(400, { ok: false, error: WAITLIST_COPY.badRequest });
  }

  if (honeypotFilled(body.company)) {
    log({ event: "waitlist_spam" });
    return json(400, { ok: false, error: WAITLIST_COPY.wait });
  }

  const secret = ticketSecret(env);
  // No ticket secret: do not block visitors, and do not sign with a blob credential.
  // "Please wait" does not consume the signup limit. The flood limit above still applies.
  if (secret && tooFast(ticketIssuedAt(body.ticket, secret), now)) {
    log({ event: "waitlist_too_fast" });
    return json(400, { ok: false, error: WAITLIST_COPY.wait });
  }

  const decision = allow(limiterKey(req), now);
  if (!decision.ok) {
    log({ event: "waitlist_rate_limited" });
    return json(429, { ok: false, error: WAITLIST_COPY.rate });
  }

  const email = normalizeEmail(body.email);
  if (!email) {
    log({ event: "waitlist_invalid" });
    return json(400, { ok: false, error: WAITLIST_COPY.invalid });
  }

  if (!blobConfigured(env)) {
    log({ event: "waitlist_store_unconfigured" });
    return json(503, { ok: false, error: WAITLIST_COPY.store });
  }

  const pathname = signupPath(email, secret);
  const record = JSON.stringify({
    email,
    at: new Date(now).toISOString(),
    source: "strangeinvention.com",
  });

  let outcome: "stored" | "exists";
  try {
    outcome = await writeBlob(pathname, record, env, deps.putBlob, { allowOverwrite: false });
  } catch {
    await finish(recordEvent("waitlist_store_failed", req, ctx), deps, log);
    return json(503, { ok: false, error: WAITLIST_COPY.store });
  }

  if (outcome === "exists") {
    await finish(recordEvent("waitlist_duplicate", req, ctx), deps, log);
    return json(200, { ok: true });
  }

  const allowAlert = deps.allowAlert ?? ((key, at) => alertLimiter.allow(key, at));
  const task = (async () => {
    await recordEvent("waitlist_stored", req, ctx);
    const result = await deliverAlert(email, env, fetchImpl, allowAlert, now);
    if (result === "failed" || result === "capped") {
      try {
        const marker = secret
          ? pathname.replace(/^signups\//, "unalerted/")
          : `unalerted/${safeId(deps.random)}.json`;
        await writeBlob(
          marker,
          JSON.stringify({
            at: new Date(now).toISOString(),
            reason: result,
            ...(secret ? { path: pathname } : {}),
          }),
          env,
          deps.putBlob,
          { allowOverwrite: true },
        );
      } catch {
        log({ event: "waitlist_unalerted_marker_failed" });
      }
    }
    const name: EventName =
      result === "sent"
        ? "waitlist_alert_sent"
        : result === "skipped"
          ? "waitlist_alert_skipped"
          : result === "capped"
            ? "waitlist_alert_capped"
            : "waitlist_alert_failed";
    await recordEvent(name, req, ctx);
  })();
  await finish(task, deps, log);
  return json(200, { ok: true });
}

export async function handleClientEvent(req: Request, deps: WaitlistDeps = {}): Promise<Response> {
  const nowFn = deps.now ?? Date.now;
  const log = deps.log ?? ((entry) => console.log(JSON.stringify(entry)));
  const allow = deps.allowEvent ?? ((key, now) => eventLimiter.allow(key, now));

  if (!sameOrigin(req)) {
    log({ event: "waitlist_origin_rejected" });
    return json(403, { ok: false });
  }

  const read = await readBody(req, EVENT_BODY);
  if (!read.ok) return json(read.reason === "large" ? 413 : 400, { ok: false });
  const raw = read.text;

  const decision = allow(limiterKey(req), nowFn());
  if (!decision.ok) {
    log({ event: "waitlist_rate_limited" });
    return json(429, { ok: false });
  }

  let name: unknown;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("shape");
    name = (parsed as { event?: unknown }).event;
  } catch {
    return json(400, { ok: false });
  }

  if (typeof name !== "string" || !CLIENT_EVENTS.includes(name as EventName)) {
    log({ event: "waitlist_event_blocked" });
    return json(400, { ok: false });
  }

  // Page-open counts stay in the function log. They are not written to Blob.
  log({ event: name });
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
