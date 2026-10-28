/** How long the browser keeps a ticket, measured on its own clock from receipt. */
export const TICKET_HOLD_MS = 23 * 60 * 60 * 1000;

/** Just over the server minimum fill time. Used only after a ticket is fetched during submit. */
export const SUBMIT_WAIT_MS = 1600;

export type HeldTicket = { value: string; receivedAt: number };

/**
 * Expire from the client's receive time. The ticket string is opaque:
 * comparing it to Date.now() punishes a clock that is behind the server.
 */
export function holdExpired(held: HeldTicket | null, now: number): boolean {
  if (!held?.value) return true;
  const age = now - held.receivedAt;
  if (age < 0) return false;
  return age > TICKET_HOLD_MS;
}

/** A "please wait" for a ticket we did not just fetch should be dropped so the next submit asks again. */
export function releaseHeldTicket(fetchedAtSubmit: boolean, pleaseWait: boolean): boolean {
  return pleaseWait && !fetchedAtSubmit;
}
