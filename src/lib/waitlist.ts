import { WAITLIST_COPY } from "./waitlist-copy";
import {
  blobConfigured,
  safeId,
  writeBlob,
  type Env,
  type PutBlob,
} from "./blob";
import { CLIENT_EVENTS, recordEvent, type EventCtx, type EventName, type LogFn } from "./events";
import { clientIp, createRateLimiter, type LimitDecision } from "./rate-limit";

const MAX_BODY = 8 * 1024;
export const MIN_FILL_MS = 1500;
const SKEW_MS = 120_000;
const SIGNUP_LIMIT = 8;
const SIGNUP_WINDOW_MS = 60 * 60 * 1000;
const EVENT_LIMIT = 30;
const ALERT_TIMEOUT_MS = 8000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const signupLimiter = createRateLimiter(SIGNUP_LIMIT, SIGNUP_WINDOW_MS);
const eventLimiter = createRateLimiter(EVENT_LIMIT, SIGNUP_WINDOW_MS);

export type WaitlistDeps = {
  env?: Env;
  fetchImpl?: typeof fetch;
  now?: () => number;
  random?: () => string;
  putBlob?: PutBlob;
  allow?: (key: string, now: number) => LimitDecision;
  allowEvent?: (key: string, now: number) => LimitDecision;
  log?: LogFn;
  /** Run side work after the signup object is durable. The route passes Next's after(). */
  defer?: (task: Promise<void>) => void;
};

type AlertResult = "sent" | "skipped" | "failed";

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

function startedAt(value: unknown): number | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : NaN;
  // Reject 0 and other non-times so a missing client clock cannot skip the fill check.
  if (!Number.isFinite(n) || n < 1_600_000_000_000 || n > 1e14) return null;
  return n;
}

function first(...values: Array<string | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

/** URL plus optional bearer key. Accepts the shared alert names and the talk-alert names. */
export function alertConfig(env: Env): { state: "skipped" } | { state: "invalid" } | { state: "ready"; url: string; key: string } {
  const urlRaw = first(env.ALERT_WEBHOOK_URL, env.TALK_ALERT_WEBHOOK_URL);
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
    key: first(env.ALERT_WEBHOOK_KEY, env.TALK_ALERT_WEBHOOK_KEY),
  };
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

function tooFast(started: number | null, now: number): boolean {
  if (started === null) return true;
  const elapsed = now - started;
  if (elapsed < -SKEW_MS) return true;
  return elapsed >= 0 && elapsed < MIN_FILL_MS;
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
  const fetchImpl = deps.fetchImpl ?? fetch;
  const ctx = ctxFrom(deps, env, log, nowFn);
  const now = nowFn();

  if (!sameOrigin(req)) {
    log({ event: "waitlist_origin_rejected" });
    return json(403, { ok: false, error: WAITLIST_COPY.origin });
  }

  const contentType = (req.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    log({ event: "waitlist_invalid" });
    return json(415, { ok: false, error: WAITLIST_COPY.badRequest });
  }

  const declared = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY) {
    log({ event: "waitlist_invalid" });
    return json(413, { ok: false, error: WAITLIST_COPY.large });
  }

  let raw = "";
  try {
    raw = await req.text();
  } catch {
    log({ event: "waitlist_invalid" });
    return json(400, { ok: false, error: WAITLIST_COPY.badRequest });
  }
  if (raw.length > MAX_BODY) {
    log({ event: "waitlist_invalid" });
    return json(413, { ok: false, error: WAITLIST_COPY.large });
  }

  const decision = allow(clientIp(req), now);
  if (!decision.ok) {
    log({ event: "waitlist_rate_limited" });
    if (decision.justLimited) await finish(recordEvent("waitlist_rate_limited", req, ctx), deps, log);
    return json(429, { ok: false, error: WAITLIST_COPY.rate });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("shape");
    }
    body = parsed as Record<string, unknown>;
  } catch {
    await finish(recordEvent("waitlist_invalid", req, ctx), deps, log);
    return json(400, { ok: false, error: WAITLIST_COPY.badRequest });
  }

  if (honeypotFilled(body.company)) {
    await finish(recordEvent("waitlist_spam", req, ctx), deps, log);
    return json(400, { ok: false, error: WAITLIST_COPY.wait });
  }

  if (tooFast(startedAt(body.started), now)) {
    await finish(recordEvent("waitlist_too_fast", req, ctx), deps, log);
    return json(400, { ok: false, error: WAITLIST_COPY.wait });
  }

  const email = normalizeEmail(body.email);
  if (!email) {
    await finish(recordEvent("waitlist_invalid", req, ctx), deps, log);
    return json(400, { ok: false, error: WAITLIST_COPY.invalid });
  }

  if (!blobConfigured(env)) {
    log({ event: "waitlist_store_unconfigured" });
    return json(503, { ok: false, error: WAITLIST_COPY.store });
  }

  const pathname = `signups/${now}-${safeId(deps.random)}.json`;
  const record = JSON.stringify({
    email,
    at: new Date(now).toISOString(),
    source: "strangeinvention.com",
  });

  try {
    await writeBlob(pathname, record, env, deps.putBlob);
  } catch {
    await finish(recordEvent("waitlist_store_failed", req, ctx), deps, log);
    return json(503, { ok: false, error: WAITLIST_COPY.store });
  }

  const task = (async () => {
    const [, result] = await Promise.all([
      recordEvent("waitlist_stored", req, ctx),
      sendAlert(email, env, fetchImpl),
    ]);
    const name: EventName =
      result === "sent"
        ? "waitlist_alert_sent"
        : result === "skipped"
          ? "waitlist_alert_skipped"
          : "waitlist_alert_failed";
    await recordEvent(name, req, ctx);
  })();
  await finish(task, deps, log);
  return json(200, { ok: true });
}

export async function handleClientEvent(req: Request, deps: WaitlistDeps = {}): Promise<Response> {
  const env = deps.env ?? process.env;
  const nowFn = deps.now ?? Date.now;
  const log = deps.log ?? ((entry) => console.log(JSON.stringify(entry)));
  const allow = deps.allowEvent ?? ((key, now) => eventLimiter.allow(key, now));
  const ctx = ctxFrom(deps, env, log, nowFn);

  if (!sameOrigin(req)) {
    log({ event: "waitlist_origin_rejected" });
    return json(403, { ok: false });
  }

  const declared = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > 1024) {
    return json(413, { ok: false });
  }

  let raw = "";
  try {
    raw = await req.text();
  } catch {
    return json(400, { ok: false });
  }
  if (raw.length > 1024) return json(413, { ok: false });

  const decision = allow(clientIp(req), nowFn());
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

  await recordEvent(name as EventName, req, ctx);
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
