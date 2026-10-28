# Strange Invention

Landing + waitlist site for [strangeinvention.com](https://strangeinvention.com).

Interactive warehouse of inventions — explore, learn the weird science, shop the drops when they land. Early access only.

See [CONCEPT.md](./CONCEPT.md) for the unified idea (warehouse + edu-tainment + e-comm + Doc/Ooger duo).

## Stack

- Next.js App Router (TypeScript)
- Waitlist via Route Handler → Vercel Blob (`signups/`) and an optional alert webhook
- Step log with event names only (`events/`)
- Palette: deep ink + electric mint (inventor lab)

## Environment

Names only. Do not commit values.

- `BLOB_READ_WRITE_TOKEN` or `BLOB_STORE_ID` (OIDC). The form does not claim a signup was saved unless one of these is set and the private write succeeds. One object per email, under `signups/`. The object contains the email address.
- `WAITLIST_TICKET_SECRET` (optional). Signs the fill-time ticket and the signup path. When it is unset, the fill-time check is skipped. Blob credentials are not used for this.
- `ALERT_WEBHOOK_URL` (optional HTTPS). Each new signup POSTs `{ source, summary }`. The summary includes the email. A failed call is retried once; if it still fails, a private `unalerted/` marker is stored. A repeat of the same email does not alert again.
- `ALERT_WEBHOOK_KEY` (optional). Sent as `Authorization: Bearer` when set.

If no webhook is set, a stored signup still succeeds. Alert calls are capped at 60 per hour on each instance; signups past that cap are still stored.

Public contact address: hello@strangeinvention.com.

## Local

```bash
npm install
npm run dev
```

## Deploy

Vercel project on team `team_sQQVrszUVEOHFzYJn8hKTlFZ`, domains `strangeinvention.com` / `www.strangeinvention.com`.
