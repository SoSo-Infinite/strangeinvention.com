"use client";

import { FormEvent, useState } from "react";

type Status = "idle" | "loading" | "ok" | "err";

export default function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        ok?: boolean;
      };

      if (!res.ok) {
        setStatus("err");
        setMessage(data.error || "Something went wrong. Please try again.");
        return;
      }

      setStatus("ok");
      setMessage("You're on the list. We'll email you when the warehouse opens for early access.");
      setEmail("");
    } catch {
      setStatus("err");
      setMessage("Network error. Check your connection and try again.");
    }
  }

  return (
    <form className="waitlist-form" onSubmit={onSubmit} noValidate>
      <label htmlFor="email">Email</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={status === "loading"}
      />
      <button
        className="btn btn-primary"
        type="submit"
        disabled={status === "loading"}
      >
        {status === "loading" ? "Joining…" : "Join the waitlist"}
      </button>
      <p className="form-note">
        No spam. One note when early access is ready. Questions:{" "}
        <a href="mailto:cjames112@gmail.com">cjames112@gmail.com</a>
      </p>
      {status === "ok" && <p className="form-status ok">{message}</p>}
      {status === "err" && <p className="form-status err">{message}</p>}
    </form>
  );
}
