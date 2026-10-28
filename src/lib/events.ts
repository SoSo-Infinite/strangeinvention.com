import { blobConfigured, safeId, writeBlob, type Env, type PutBlob } from "./blob";
import { uaClass } from "./ua";

/** Event names only. Payloads must not grow fields that could hold a name, email, or IP. */
export const EVENT_NAMES = [
  "waitlist_form_opened",
  "waitlist_invalid",
  "waitlist_spam",
  "waitlist_too_fast",
  "waitlist_rate_limited",
  "waitlist_stored",
  "waitlist_store_failed",
  "waitlist_alert_sent",
  "waitlist_alert_skipped",
  "waitlist_alert_failed",
  "waitlist_alert_capped",
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

export const CLIENT_EVENTS: readonly EventName[] = ["waitlist_form_opened"];

export type LogFn = (entry: { event: string }) => void;

export type EventCtx = {
  env: Env;
  now: () => number;
  random?: () => string;
  putBlob?: PutBlob;
  log: LogFn;
};

const EVENT_NAME_RE = /^[a-z_]+$/;

export async function recordEvent(name: EventName, req: Request, ctx: EventCtx): Promise<void> {
  if (!EVENT_NAME_RE.test(name)) {
    ctx.log({ event: "waitlist_event_blocked" });
    return;
  }
  if (!blobConfigured(ctx.env)) {
    ctx.log({ event: name });
    return;
  }

  const now = ctx.now();
  const day = new Date(now).toISOString().slice(0, 10);
  const pathname = `events/${day}/${now}-${safeId(ctx.random)}-${name}.json`;
  const payload = JSON.stringify({
    event: name,
    ua: uaClass(req.headers.get("user-agent")),
    at: new Date(now).toISOString(),
  });
  if (payload.includes("@")) {
    ctx.log({ event: "waitlist_event_blocked" });
    return;
  }

  try {
    await writeBlob(pathname, payload, ctx.env, ctx.putBlob);
    ctx.log({ event: name });
  } catch {
    ctx.log({ event: "waitlist_event_write_failed" });
  }
}
