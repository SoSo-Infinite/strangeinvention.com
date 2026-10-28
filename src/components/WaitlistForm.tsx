"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { CONTACT_EMAIL, WAITLIST_COPY } from "@/lib/waitlist-copy";
import { holdExpired, SUBMIT_WAIT_MS, type HeldTicket } from "@/lib/ticket-hold";

type Status = "idle" | "loading" | "ok" | "err";

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function fetchTicket(signal?: AbortSignal): Promise<string | null> {
  const res = await fetch("/api/waitlist", { method: "GET", cache: "no-store", signal });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as { ticket?: unknown };
  return typeof data.ticket === "string" ? data.ticket : null;
}

export default function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const held = useRef<HeldTicket | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    fetchTicket(ctrl.signal)
      .then((value) => {
        if (value) held.current = { value, receivedAt: Date.now() };
      })
      .catch(() => {});
    fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "waitlist_form_opened" }),
      signal: ctrl.signal,
    }).catch(() => {});
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const company = String(data.get("company") ?? "");
    const submitted = String(data.get("email") ?? "").trim();

    if (!submitted || !submitted.includes("@")) {
      setStatus("err");
      setMessage(WAITLIST_COPY.invalid);
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      const signal = AbortSignal.timeout(20_000);
      let fetchedAtSubmit = false;
      if (holdExpired(held.current, Date.now())) {
        const value = await fetchTicket(signal);
        held.current = value ? { value, receivedAt: Date.now() } : null;
        fetchedAtSubmit = Boolean(value);
      }
      if (fetchedAtSubmit) await sleep(SUBMIT_WAIT_MS, signal);
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: submitted,
          company,
          ticket: held.current?.value ?? null,
        }),
        signal,
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        ok?: boolean;
      };

      if (!res.ok || payload.ok !== true) {
        setStatus("err");
        setMessage(payload.error || WAITLIST_COPY.generic);
        return;
      }

      setStatus("ok");
      setMessage(WAITLIST_COPY.success);
      setEmail("");
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      setStatus("err");
      setMessage(
        name === "TimeoutError" || name === "AbortError"
          ? WAITLIST_COPY.timeout
          : WAITLIST_COPY.network,
      );
    }
  }

  return (
    <form
      className="waitlist-form"
      method="post"
      onSubmit={onSubmit}
      noValidate
      aria-busy={status === "loading"}
    >
      <div className="hp" aria-hidden="true">
        <label htmlFor="company">Company</label>
        <input
          id="company"
          name="company"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>
      <label htmlFor="email">Email</label>
      <input
        id="email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        maxLength={254}
        required
        placeholder="you@example.com"
        value={email}
        aria-invalid={status === "err" ? true : undefined}
        aria-describedby={message ? "waitlist-status" : undefined}
        onChange={(e) => {
          setEmail(e.target.value);
          if (status !== "loading") {
            setStatus("idle");
            setMessage("");
          }
        }}
        disabled={status === "loading"}
      />
      <button className="btn btn-primary" type="submit" disabled={status === "loading"}>
        {status === "loading" ? "Joining..." : "Join the waitlist"}
      </button>
      <p className="form-note">
        No spam. One note when early access is ready. Questions:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
      {message ? (
        <p
          id="waitlist-status"
          role="status"
          aria-live="polite"
          className={status === "ok" ? "form-status ok" : "form-status err"}
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
