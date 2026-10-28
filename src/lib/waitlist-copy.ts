/** Visitor-facing waitlist copy. No personal data and no emoji. Safe to import from the client. */
export const CONTACT_EMAIL = "hello@strangeinvention.com";

export const WAITLIST_COPY = {
  success:
    "You're on the list. We'll email you when the warehouse opens for early access.",
  invalid: "Please enter a valid email address.",
  wait: "Please wait a moment and try again.",
  rate: `Too many tries from this connection. Please wait an hour and try again, or email ${CONTACT_EMAIL}.`,
  store: `We couldn't save your email. Please try again in a minute, or email ${CONTACT_EMAIL}.`,
  origin: "Please submit the form on strangeinvention.com.",
  badRequest: "Please use the form on the page.",
  large: `That request is too large. Email ${CONTACT_EMAIL} instead.`,
  network: `Network error. Check your connection and try again, or email ${CONTACT_EMAIL}.`,
  timeout: `That took too long. Please try again, or email ${CONTACT_EMAIL}.`,
  generic: "Something went wrong. Please try again.",
} as const;
