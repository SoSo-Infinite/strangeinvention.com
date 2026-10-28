import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { type PutBlob } from "./blob";
import { createRateLimiter, limiterKey } from "./rate-limit";
import { uaClass } from "./ua";
import { WAITLIST_COPY } from "./waitlist-copy";
import {
  FLOOD_LIMIT,
  handleClientEvent,
  handleTicket,
  handleWaitlist,
  issueTicket,
  MIN_FILL_MS,
  readBody,
  signupPath,
  type WaitlistDeps,
} from "./waitlist";
import { holdExpired, releaseHeldTicket, SUBMIT_WAIT_MS, TICKET_HOLD_MS } from "./ticket-hold";

const NOW = 1_700_000_000_000;
const EMAIL = "Ada@Example.com";
const STORED_EMAIL = "ada@example.com";
const IP = "203.0.113.9";
const KEY = "super-secret-key";
const UA = "Mozilla/5.0 (Macintosh) secret@example.com";

type Write = {
  pathname: string;
  body: string;
  access: "private" | "public";
  token: string | undefined;
  overwrite?: boolean;
};

function request(body: unknown, headers: Record<string, string> = {}, raw?: string): Request {
  const payload = raw ?? JSON.stringify(body);
  return new Request("https://strangeinvention.com/api/waitlist", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://strangeinvention.com",
      host: "strangeinvention.com",
      "user-agent": UA,
      "x-forwarded-for": IP,
      ...headers,
    },
    body: payload,
  });
}

function harness(overrides: WaitlistDeps = {}) {
  const writes: Write[] = [];
  const logs: { event: string }[] = [];
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const putBlob: PutBlob = async (pathname, body, access, token, options) => {
    writes.push({ pathname, body, access, token, overwrite: options?.allowOverwrite });
  };
  const deps: WaitlistDeps = {
    now: () => NOW,
    random: () => "abcd1234abcd1234",
    allow: () => ({ ok: true, justLimited: false }),
    allowFlood: () => ({ ok: true, justLimited: false }),
    allowEvent: () => ({ ok: true, justLimited: false }),
    log: (entry) => logs.push(entry),
    putBlob,
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response("ok", { status: 200 });
    },
    ...overrides,
    env: {
      BLOB_READ_WRITE_TOKEN: "test-token",
      WAITLIST_TICKET_SECRET: "ticket-secret",
      ...overrides.env,
    },
  };
  return { writes, logs, calls, deps };
}

function signupBody(extra: Record<string, unknown> = {}, secret = "ticket-secret") {
  const issuedAt = typeof extra.issuedAt === "number" ? extra.issuedAt : NOW - 5000;
  const rest = { ...extra };
  delete rest.issuedAt;
  return {
    email: EMAIL,
    company: "",
    ...(secret ? { ticket: issueTicket(issuedAt, secret) } : {}),
    ...rest,
  };
}

function signups(writes: Write[]) {
  return writes.filter((write) => write.pathname.startsWith("signups/"));
}

function events(writes: Write[]) {
  return writes.filter((write) => write.pathname.startsWith("events/"));
}

function assertNoPersonal(chunks: string[]) {
  const text = chunks.join("\n");
  assert.equal(text.toLowerCase().includes(STORED_EMAIL), false);
  assert.equal(text.includes(IP), false);
  assert.equal(text.includes(KEY), false);
  assert.equal(text.includes("secret@example.com"), false);
  assert.equal(text.includes(UA), false);
}

test("stores the signup privately and skips the alert when no webhook is set", async () => {
  const { writes, logs, calls, deps } = harness();
  const res = await handleWaitlist(request(signupBody()), deps);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(calls.length, 0);

  const saved = signups(writes);
  assert.equal(saved.length, 1);
  assert.equal(saved[0]?.pathname, signupPath(STORED_EMAIL, "ticket-secret"));
  assert.equal(
    saved[0]?.pathname,
    `signups/${createHmac("sha256", "ticket-secret").update(STORED_EMAIL).digest("hex")}.json`,
  );
  assert.notEqual(
    saved[0]?.pathname,
    `signups/${createHash("sha256").update(STORED_EMAIL).digest("hex")}.json`,
  );
  assert.equal(saved[0]?.pathname.includes("@"), false);
  assert.equal(saved[0]?.access, "private");
  assert.equal(saved[0]?.overwrite, false);
  assert.equal(saved[0]?.token, "test-token");
  assert.deepEqual(JSON.parse(saved[0]?.body ?? ""), {
    email: STORED_EMAIL,
    at: new Date(NOW).toISOString(),
    source: "strangeinvention.com",
  });

  const logged = events(writes).map((write) => JSON.parse(write.body) as { event: string });
  assert.deepEqual(
    logged.map((entry) => entry.event),
    ["waitlist_stored", "waitlist_alert_skipped"],
  );
  for (const entry of logged) {
    assert.equal(entry.event.startsWith("waitlist_"), true);
    assert.equal((entry as { ua?: string }).ua, "desktop");
  }
  assertNoPersonal([...events(writes).map((write) => write.body), JSON.stringify(logs)]);
  assert.equal(JSON.stringify(logs).includes("waitlist_stored"), true);
});

test("does not say the signup was saved when Blob is not configured", async () => {
  const { writes, calls, deps } = harness({ env: { BLOB_READ_WRITE_TOKEN: "" } });
  const res = await handleWaitlist(request(signupBody()), deps);
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, WAITLIST_COPY.store);
  assert.equal(writes.length, 0);
  assert.equal(calls.length, 0);
  assert.equal(JSON.stringify(body).toLowerCase().includes(STORED_EMAIL), false);
});

test("does not say the signup was saved when the write fails", async () => {
  const { writes, calls, deps } = harness({
    putBlob: async (pathname, body, access) => {
      writes.push({ pathname, body, access, token: "test-token" });
      throw new Error("unauthorized");
    },
  });
  const res = await handleWaitlist(request(signupBody()), deps);
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, WAITLIST_COPY.store);
  assert.equal(calls.length, 0);
  assert.equal(signups(writes).length, 1);
  assert.equal(events(writes).some((write) => write.pathname.includes("waitlist_stored")), false);
});

test("rejects a private-access failure without a public write", async () => {
  const { writes, deps } = harness({
    putBlob: async (pathname, body, access, token) => {
      writes.push({ pathname, body, access, token });
      throw new Error("access type 'private' is not allowed; store only supports public");
    },
  });
  const res = await handleWaitlist(request(signupBody()), deps);
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, WAITLIST_COPY.store);
  assert.equal(body.error.includes("hello@strangeinvention.com"), true);
  assert.equal(writes.some((write) => write.access === "public"), false);
  assert.equal(writes.every((write) => write.access === "private"), true);
  assert.equal(signups(writes).length, 1);
});

test("posts the alert after storage and still succeeds if the webhook fails", async () => {
  const { writes, logs, calls, deps } = harness({
    env: {
      ALERT_WEBHOOK_URL: "https://alerts.example/hook",
      ALERT_WEBHOOK_KEY: KEY,
    },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response("no", { status: 500 });
    },
  });
  const res = await handleWaitlist(request(signupBody()), deps);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.url, "https://alerts.example/hook");
  assert.equal(calls[1]?.url, "https://alerts.example/hook");
  const marker = writes.find((write) => write.pathname.startsWith("unalerted/"));
  assert.equal(Boolean(marker), true);
  assert.equal(marker?.body.includes("@"), false);
  assert.equal(marker?.overwrite, true);
  const init = calls[0]?.init ?? {};
  const headers = init.headers as Record<string, string>;
  assert.equal(headers.authorization, `Bearer ${KEY}`);
  const sent = JSON.parse(String(init.body));
  assert.equal(sent.source, "strangeinvention.com waitlist");
  assert.equal(sent.summary.includes(STORED_EMAIL), true);
  assert.equal(events(writes).some((write) => write.pathname.includes("waitlist_alert_failed")), true);
  assertNoPersonal([...events(writes).map((write) => write.body), JSON.stringify(logs)]);
});

test("ignores talk-alert env names and does not call a non-https webhook", async () => {
  const talk = harness({
    env: {
      TALK_ALERT_WEBHOOK_URL: "https://alerts.example/talk",
      TALK_ALERT_WEBHOOK_KEY: KEY,
    },
  });
  const ok = await handleWaitlist(request(signupBody()), talk.deps);
  assert.equal(ok.status, 200);
  assert.equal(talk.calls.length, 0);
  assert.equal(
    events(talk.writes).some((write) => write.pathname.includes("waitlist_alert_skipped")),
    true,
  );

  const insecure = harness({
    env: { ALERT_WEBHOOK_URL: "http://alerts.example/hook", ALERT_WEBHOOK_KEY: KEY },
  });
  const res = await handleWaitlist(request(signupBody()), insecure.deps);
  assert.equal(res.status, 200);
  assert.equal(insecure.calls.length, 0);
  assert.equal(
    events(insecure.writes).some((write) => write.pathname.includes("waitlist_alert_failed")),
    true,
  );
});

test("uses OIDC store id without a read-write token", async () => {
  const { writes, deps } = harness({
    env: { BLOB_READ_WRITE_TOKEN: "", BLOB_STORE_ID: "store_123" },
  });
  const res = await handleWaitlist(request(signupBody()), deps);
  assert.equal(res.status, 200);
  assert.equal(writes[0]?.token, undefined);
  assert.equal(writes[0]?.access, "private");
});

test("rejects a filled honeypot without storing the signup", async () => {
  const { writes, logs, deps } = harness();
  const res = await handleWaitlist(request(signupBody({ company: "Acme" })), deps);
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, WAITLIST_COPY.wait);
  assert.equal(signups(writes).length, 0);
  assert.equal(writes.length, 0);
  assert.equal(logs.some((entry) => entry.event === "waitlist_spam"), true);
  assertNoPersonal([JSON.stringify(logs)]);
});

test("rejects a ticket that is too new, missing, forged, or old", async () => {
  const instant = harness();
  const tooFast = await handleWaitlist(request(signupBody({ issuedAt: NOW })), instant.deps);
  assert.equal(tooFast.status, 400);
  assert.equal((await tooFast.json()).error, WAITLIST_COPY.wait);
  assert.equal(signups(instant.writes).length, 0);

  const missing = harness();
  const res = await handleWaitlist(request({ email: EMAIL, company: "", started: NOW - 100000 }), missing.deps);
  assert.equal(res.status, 400);
  assert.equal(signups(missing.writes).length, 0);

  const forged = harness();
  const resForged = await handleWaitlist(request(signupBody({ ticket: `${NOW - 5000}.forged` })), forged.deps);
  assert.equal(resForged.status, 400);
  assert.equal(signups(forged.writes).length, 0);

  const stale = harness();
  const resStale = await handleWaitlist(
    request(signupBody({ issuedAt: NOW - 25 * 60 * 60 * 1000 })),
    stale.deps,
  );
  assert.equal(resStale.status, 400);
  assert.equal(signups(stale.writes).length, 0);
});

test("accepts a server ticket after the minimum fill time", async () => {
  const ready = harness();
  const res = await handleWaitlist(request(signupBody({ issuedAt: NOW - MIN_FILL_MS })), ready.deps);
  assert.equal(res.status, 200);

  const early = harness();
  const res2 = await handleWaitlist(
    request(signupBody({ issuedAt: NOW - (MIN_FILL_MS - 1) })),
    early.deps,
  );
  assert.equal(res2.status, 400);

  const future = harness();
  const res3 = await handleWaitlist(request(signupBody({ issuedAt: NOW + 5000 })), future.deps);
  assert.equal(res3.status, 400);
});

test("rejects an invalid email and does not echo it", async () => {
  const { writes, logs, deps } = harness();
  const res = await handleWaitlist(request(signupBody({ email: "not-an-email" })), deps);
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, WAITLIST_COPY.invalid);
  assert.equal(JSON.stringify(body).includes("not-an-email"), false);
  assert.equal(signups(writes).length, 0);
  assert.equal(writes.length, 0);
  assert.equal(logs.some((entry) => entry.event === "waitlist_invalid"), true);
});

test("rate limit writes one event and then stops writing", async () => {
  let calls = 0;
  const allow = () => {
    calls += 1;
    return { ok: false, justLimited: calls === 1 };
  };
  const first = harness({ allow });
  const res = await handleWaitlist(request(signupBody()), first.deps);
  assert.equal(res.status, 429);
  assert.equal((await res.json()).error, WAITLIST_COPY.rate);
  assert.equal(first.writes.length, 0);
  assert.equal(first.logs.some((entry) => entry.event === "waitlist_rate_limited"), true);

  const second = harness({ allow });
  const res2 = await handleWaitlist(request(signupBody()), second.deps);
  assert.equal(res2.status, 429);
  assert.equal(second.writes.length, 0);
});

test("rejects a foreign origin before writing", async () => {
  const { writes, deps } = harness();
  const res = await handleWaitlist(
    request(signupBody(), { origin: "https://evil.example" }),
    deps,
  );
  assert.equal(res.status, 403);
  assert.equal(writes.length, 0);
});

test("trusts x-forwarded-host and rejects an oversized body", async () => {
  const { writes, deps } = harness();
  const res = await handleWaitlist(
    request(signupBody(), {
      host: "localhost:3000",
      "x-forwarded-host": "strangeinvention.com",
    }),
    deps,
  );
  assert.equal(res.status, 200);

  const huge = "x".repeat(9000);
  const res2 = await handleWaitlist(request(null, { "content-length": String(huge.length) }, huge), deps);
  assert.equal(res2.status, 413);
  assert.equal(signups(writes).length, 1);
});

test("client events log the open event and do not store it", async () => {
  const { writes, logs, deps } = harness();
  const res = await handleClientEvent(
    request({ event: "waitlist_form_opened", email: STORED_EMAIL }),
    deps,
  );
  assert.equal(res.status, 204);
  assert.equal(writes.length, 0);
  assert.equal(logs.some((entry) => entry.event === "waitlist_form_opened"), true);
  assert.equal(JSON.stringify(logs).includes(STORED_EMAIL), false);

  const forged = harness();
  const res2 = await handleClientEvent(request({ event: "waitlist_stored" }), forged.deps);
  assert.equal(res2.status, 400);
  assert.equal(forged.writes.length, 0);

  const mailed = harness();
  const res3 = await handleClientEvent(request({ event: STORED_EMAIL }), mailed.deps);
  assert.equal(res3.status, 400);
  assert.equal(mailed.writes.length, 0);
  assert.equal(JSON.stringify(mailed.logs).includes(STORED_EMAIL), false);
});

test("rate limiter allows a window and flags the first overflow", () => {
  const limit = createRateLimiter(2, 1000);
  assert.deepEqual(limit.allow("a", 0), { ok: true, justLimited: false });
  assert.deepEqual(limit.allow("a", 10), { ok: true, justLimited: false });
  assert.deepEqual(limit.allow("a", 20), { ok: false, justLimited: true });
  assert.deepEqual(limit.allow("a", 30), { ok: false, justLimited: false });
  assert.deepEqual(limit.allow("a", 1000), { ok: true, justLimited: false });
  assert.deepEqual(limit.allow("b", 20), { ok: true, justLimited: false });
});

test("user-agent class never returns the raw string", () => {
  assert.equal(uaClass(null), "unknown");
  assert.equal(uaClass("Mozilla/5.0 secret@example.com"), "desktop");
  assert.equal(uaClass("Mozilla/5.0 (iPhone; CPU iPhone OS)"), "mobile");
  assert.equal(uaClass("Mozilla/5.0 (compatible; Googlebot/2.1)"), "bot");
  assert.equal(uaClass("curl/8.0"), "unknown");
});

test("keeps one private object per email and caps alerts without dropping the signup", async () => {
  const seen = new Set<string>();
  const { writes, calls, deps } = harness({
    env: { ALERT_WEBHOOK_URL: "https://alerts.example/hook", ALERT_WEBHOOK_KEY: KEY },
    putBlob: async (pathname, body, access, token, options) => {
      writes.push({ pathname, body, access, token, overwrite: options?.allowOverwrite });
      if (!pathname.startsWith("signups/")) return;
      if (seen.has(pathname)) throw new Error("The blob already exists");
      seen.add(pathname);
    },
  });
  const first = await handleWaitlist(request(signupBody()), deps);
  const second = await handleWaitlist(request(signupBody()), deps);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal((await second.json()).ok, true);
  const saved = signups(writes);
  assert.equal(saved.length, 2);
  assert.equal(saved[0]?.pathname, saved[1]?.pathname);
  assert.equal(saved.every((write) => write.access === "private" && write.overwrite === false), true);
  assert.equal(calls.length, 1);
  assert.equal(events(writes).some((write) => write.pathname.includes("waitlist_duplicate")), true);

  const capped = harness({
    env: { ALERT_WEBHOOK_URL: "https://alerts.example/hook", ALERT_WEBHOOK_KEY: KEY },
    allowAlert: () => ({ ok: false, justLimited: true }),
  });
  const res = await handleWaitlist(request(signupBody()), capped.deps);
  assert.equal(res.status, 200);
  assert.equal(capped.calls.length, 0);
  assert.equal(signups(capped.writes).length, 1);
  assert.equal(
    events(capped.writes).some((write) => write.pathname.includes("waitlist_alert_capped")),
    true,
  );
  const marker = capped.writes.find((write) => write.pathname.startsWith("unalerted/"));
  assert.equal(marker?.access, "private");
  const marked = JSON.parse(marker?.body ?? "{}") as { reason?: string };
  assert.equal(marked.reason, "capped");
  assert.equal(marker?.body.includes("@"), false);
  assert.equal(marker?.body.includes(STORED_EMAIL), false);
});

test("issues a ticket for a browser GET without Origin and stops reading past the body cap", async () => {
  const req = new Request("https://strangeinvention.com/api/waitlist", {
    method: "GET",
    headers: { host: "strangeinvention.com" },
  });
  const res = handleTicket(req, { env: { WAITLIST_TICKET_SECRET: "ticket-secret" }, now: () => NOW });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ticket: issueTicket(NOW, "ticket-secret") });

  const open = handleTicket(req, {
    env: { BLOB_READ_WRITE_TOKEN: "blob-token", BLOB_STORE_ID: "store_123" },
    now: () => NOW,
  });
  assert.deepEqual(await open.json(), { ticket: null });

  const foreign = new Request("https://strangeinvention.com/api/waitlist", {
    method: "GET",
    headers: { origin: "https://evil.example", host: "strangeinvention.com" },
  });
  assert.equal(
    handleTicket(foreign, { env: { WAITLIST_TICKET_SECRET: "ticket-secret" } }).status,
    403,
  );

  const cross = new Request("https://strangeinvention.com/api/waitlist", {
    method: "GET",
    headers: { host: "strangeinvention.com", "sec-fetch-site": "cross-site" },
  });
  assert.equal(handleTicket(cross, { env: { WAITLIST_TICKET_SECRET: "ticket-secret" } }).status, 403);

  let pulled = 0;
  const stream = new ReadableStream({
    pull(controller) {
      pulled += 1;
      if (pulled > 4) {
        controller.close();
        return;
      }
      controller.enqueue(new Uint8Array(3000));
    },
  });
  const limited = await readBody(
    new Request("https://strangeinvention.com/api/waitlist", {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit),
    5000,
  );
  assert.equal(limited.ok, false);
  if (!limited.ok) assert.equal(limited.reason, "large");
  assert.equal(pulled < 4, true);
});

test("public source has no personal mailbox, old form host, or emoji", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else files.push(path);
    }
  };
  walk("src");
  files.push("README.md", "next.config.ts");
  const scanned = files.filter((file) => !file.endsWith(".test.ts"));
  const emoji = /\p{Extended_Pictographic}/gu;
  for (const file of scanned) {
    const text = readFileSync(file, "utf8");
    assert.equal(text.toLowerCase().includes("gmail"), false, file);
    assert.equal(text.toLowerCase().includes("formsubmit"), false, file);
    assert.equal(text.toLowerCase().includes("cjames"), false, file);
    assert.equal(/\bchad\b/i.test(text), false, file);
    const pictographs = [...text.matchAll(emoji)]
      .map((match) => match[0])
      .filter((ch) => ch !== "\u00A9");
    assert.deepEqual(pictographs, [], file);
  }
  assert.equal(WAITLIST_COPY.success.startsWith("You're on the list."), true);
  const form = readFileSync("src/components/WaitlistForm.tsx", "utf8");
  assert.match(form, /method="post"/);
});

test("a headless browser can get a ticket without Origin and then join", async () => {
  const browserGet = new Request("https://strangeinvention.com/api/waitlist", {
    method: "GET",
    headers: {
      host: "strangeinvention.com",
      accept: "*/*",
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "cors",
      "sec-fetch-dest": "empty",
    },
  });
  const minted = handleTicket(browserGet, {
    env: { WAITLIST_TICKET_SECRET: "ticket-secret", BLOB_READ_WRITE_TOKEN: "blob-token" },
    now: () => NOW - 5000,
  });
  assert.equal(minted.status, 200);
  const { ticket } = (await minted.json()) as { ticket: string };
  assert.equal(ticket, issueTicket(NOW - 5000, "ticket-secret"));

  let seenKey = "";
  const { writes, deps } = harness({
    allow(key) {
      seenKey = key;
      return { ok: true, justLimited: false };
    },
  });
  const posted = await handleWaitlist(
    request(
      { email: EMAIL, company: "", ticket },
      {
        origin: "https://strangeinvention.com",
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "cors",
      },
    ),
    deps,
  );
  assert.equal(posted.status, 200);
  assert.equal((await posted.json()).ok, true);
  assert.equal(signups(writes).length, 1);
  assert.equal(seenKey, limiterKey(request({})));
  assert.equal(seenKey.includes(IP), false);

  const plain = harness({
    env: { WAITLIST_TICKET_SECRET: "", BLOB_READ_WRITE_TOKEN: "blob-token", BLOB_STORE_ID: "store_abc" },
  });
  const skipped = await handleWaitlist(request({ email: EMAIL, company: "" }), plain.deps);
  assert.equal(skipped.status, 200);
  assert.equal(signups(plain.writes)[0]?.pathname, signupPath(STORED_EMAIL, ""));
});

test("a client clock five minutes behind keeps a ticket it just received", async () => {
  const skew = 5 * 60 * 1000;
  const clientNow = NOW - skew;
  const ticket = issueTicket(NOW - 5000, "ticket-secret");
  const held = { value: ticket, receivedAt: clientNow };
  assert.equal(holdExpired(held, clientNow), false);
  assert.equal(holdExpired(held, clientNow + 2_000), false);
  assert.equal(holdExpired(held, clientNow + TICKET_HOLD_MS), false);
  assert.equal(holdExpired(held, clientNow + TICKET_HOLD_MS + 1), true);
  // The ticket text contains a server time this clock thinks is in the future. That number is ignored.
  assert.equal(holdExpired({ value: `${NOW}.server-time`, receivedAt: clientNow }, clientNow + 1_000), false);
  assert.equal(SUBMIT_WAIT_MS > MIN_FILL_MS, true);

  const { writes, deps } = harness();
  const res = await handleWaitlist(request({ email: EMAIL, company: "", ticket: held.value }), deps);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
  assert.equal(signups(writes).length, 1);
});

test("please-wait responses do not fill the signup rate limit", async () => {
  const limit = createRateLimiter(8, 60 * 60 * 1000);
  let counted = 0;
  const { deps } = harness({
    allow(key, now) {
      counted += 1;
      return limit.allow(key, now);
    },
  });
  for (let i = 0; i < 8; i += 1) {
    const res = await handleWaitlist(request(signupBody({ issuedAt: NOW })), deps);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, WAITLIST_COPY.wait);
  }
  assert.equal(counted, 0);
  const ok = await handleWaitlist(request(signupBody()), deps);
  assert.equal(ok.status, 200);
  assert.equal(counted, 1);
});

test("fifty bad posts from one IP write no blob objects", async () => {
  const flood = createRateLimiter(FLOOD_LIMIT, 60 * 60 * 1000);
  const { writes, logs, deps } = harness({
    allowFlood: (key, now) => flood.allow(key, now),
  });
  let limited = 0;
  for (let i = 0; i < 50; i += 1) {
    const res = await handleWaitlist(request(null, {}, "not-json"), deps);
    if (res.status === 429) limited += 1;
    else assert.equal(res.status, 400);
  }
  assert.equal(limited, 50 - FLOOD_LIMIT);
  assert.equal(writes.length, 0);
  assert.equal(logs.some((entry) => entry.event === "waitlist_invalid"), true);
  assert.equal(logs.some((entry) => entry.event === "waitlist_rate_limited"), true);
  assert.equal(JSON.stringify(logs).includes(IP), false);

  const other = harness({
    allowFlood: (key, now) => flood.allow(key, now),
  });
  const again = await handleWaitlist(
    request(null, { "x-forwarded-for": "198.51.100.8" }, "not-json"),
    other.deps,
  );
  assert.equal(again.status, 400);
  assert.equal(other.writes.length, 0);
});

test("a please-wait for an old ticket is dropped", () => {
  assert.equal(releaseHeldTicket(false, true), true);
  assert.equal(releaseHeldTicket(true, true), false);
  assert.equal(releaseHeldTicket(false, false), false);
});

test("an unset ticket secret omits the email hash from the unalerted marker", async () => {
  const { writes, deps } = harness({
    env: {
      WAITLIST_TICKET_SECRET: "",
      BLOB_READ_WRITE_TOKEN: "blob-token",
      ALERT_WEBHOOK_URL: "https://alerts.example/hook",
      ALERT_WEBHOOK_KEY: KEY,
    },
    fetchImpl: async () => new Response("no", { status: 500 }),
  });
  const res = await handleWaitlist(request({ email: EMAIL, company: "" }), deps);
  assert.equal(res.status, 200);
  const marker = writes.find((write) => write.pathname.startsWith("unalerted/"));
  assert.equal(marker?.pathname, "unalerted/abcd1234abcd1234.json");
  const marked = JSON.parse(marker?.body ?? "{}") as { path?: string; reason?: string };
  assert.equal(marked.path, undefined);
  assert.equal(marked.reason, "failed");
  assert.equal(marker?.body.includes(STORED_EMAIL), false);
  assert.notEqual(marker?.pathname, signupPath(STORED_EMAIL).replace("signups/", "unalerted/"));
});

test("retries one failed alert and then marks the signup unalerted", async () => {
  let n = 0;
  const recovered = harness({
    env: { ALERT_WEBHOOK_URL: "https://alerts.example/hook", ALERT_WEBHOOK_KEY: KEY },
    fetchImpl: async (url, init) => {
      n += 1;
      recovered.calls.push({ url: String(url), init: init ?? {} });
      return new Response(n === 1 ? "no" : "ok", { status: n === 1 ? 500 : 200 });
    },
  });
  const res = await handleWaitlist(request(signupBody()), recovered.deps);
  assert.equal(res.status, 200);
  assert.equal(recovered.calls.length, 2);
  assert.equal(recovered.writes.some((write) => write.pathname.startsWith("unalerted/")), false);
  assert.equal(
    events(recovered.writes).some((write) => write.pathname.includes("waitlist_alert_sent")),
    true,
  );
});
