# CalendarShare

CalendarShare lets a user connect a calendar, select a specific timeframe, choose exactly
what information recipients can see, and generate a secure share link that exposes only
that calendar slice.

> A recipient should be able to see exactly what the owner intended to share, and nothing more.

## What it does

- **Connect a calendar** via Google OAuth 2.0.
- **Pick a date range** — only events inside that window are shared.
- **Control visibility** — recipients can see busy/free times, title + time, or full details
  (location and description).
- **Set an expiration** — links can live for an hour, a day, a week, or forever, and can be
  revoked at any time.
- **Share without accounts** — recipients open the link with no login and no Google access.

## How it works

CalendarShare is a single-origin application: a Rust/Axum backend serves the compiled
React frontend from the same domain, so cookies and CORS are straightforward.

- **The backend is authoritative.** The frontend is never trusted for authorization.
- **Snapshot-first.** Shares are persisted as a snapshot at creation time; public requests
  read from the database, never from the provider.
- **Capability URLs.** Share tokens are cryptographically random; only the SHA-256 hash is
  stored, so a database leak reveals nothing usable.
- **Provider abstraction.** A `CalendarProvider` trait isolates provider-specific logic,
  keeping the share core independent of Google's API.

## Tech stack

| Layer        | Choice                                   |
|--------------|------------------------------------------|
| Frontend     | React, TypeScript, Vite, Tailwind, TanStack Query |
| Backend      | Rust, Axum, Tokio, Serde, SQLx, Reqwest  |
| Database     | PostgreSQL                               |
| Auth         | Google OAuth 2.0 / OpenID Connect        |

## Security considerations

- OAuth credentials are encrypted at rest with AES-256-GCM and never sent to browsers.
- Share tokens are 32 bytes of CSPRNG output; only the SHA-256 hash is stored.
- Public share responses are filtered server-side by visibility mode.
- Expiration and revocation are enforced on every public request.
- Session cookies are HTTP-only and signed with an HMAC key.

## MVP limitations

- Google Calendar only (Microsoft and Apple are planned).
- Snapshot sharing — shares are not automatically refreshed.
- No recipient accounts, passwords, or email/SMS delivery.
- No calendar editing or two-way sync.
- No team/workspace features.