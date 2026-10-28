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

- `BLOB_READ_WRITE_TOKEN` or `BLOB_STORE_ID` (OIDC). The form does not claim a signup was saved unless one of these is set and the write succeeds. Use a private Blob store. The objects contain email addresses.
- `ALERT_WEBHOOK_URL` (optional HTTPS). Each saved signup POSTs `{ source, summary }`. The summary includes the email.
- `ALERT_WEBHOOK_KEY` (optional). Sent as `Authorization: Bearer` when set.

`TALK_ALERT_WEBHOOK_URL` and `TALK_ALERT_WEBHOOK_KEY` are fallbacks for that same webhook. If no webhook is set, a stored signup still succeeds.

Public contact address: hello@strangeinvention.com.

## Local

```bash
npm install
npm run dev
```

## Deploy

Vercel project on team `team_sQQVrszUVEOHFzYJn8hKTlFZ`, domains `strangeinvention.com` / `www.strangeinvention.com`.
