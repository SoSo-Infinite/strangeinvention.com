import { NextResponse } from "next/server";

const FORMSUBMIT = "https://formsubmit.co/ajax/cjames112@gmail.com";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email =
    typeof body === "object" &&
    body !== null &&
    "email" in body &&
    typeof (body as { email: unknown }).email === "string"
      ? (body as { email: string }).email.trim()
      : "";

  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 },
    );
  }

  try {
    const upstream = await fetch(FORMSUBMIT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        email,
        _subject: "Strange Invention waitlist signup",
        _template: "table",
        message: `New Strange Invention waitlist signup: ${email}`,
      }),
    });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      console.error("FormSubmit error", upstream.status, text.slice(0, 300));
      return NextResponse.json(
        { error: "Could not save your email right now. Please try again." },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Waitlist forward failed", err);
    return NextResponse.json(
      { error: "Could not reach the waitlist service. Please try again." },
      { status: 502 },
    );
  }
}
