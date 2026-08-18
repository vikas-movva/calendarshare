# CalendarShare

CalendarShare lets a user connect a calendar, select a specific timeframe, choose exactly
what information recipients can see, and generate a secure share link that exposes only
that calendar slice.

> A recipient should be able to see exactly what the owner intended to share, and nothing more.

## Architecture

```text
              Browser (React + TypeScript)
                        HTTPS
                        |
             Rust / Axum backend
              +-------------------+
              | Auth              |
              | Calendar provider |
              | Shares            |
              | Authorization     |
              +----+----------+----+
                   |          |
            PostgreSQL    Redis (optional)
                   |
             Google Calendar API
```

- **Backend is authoritative.** The frontend is never trusted for authorization.
- **Snapshot-first MVP.** Shares are persisted as a snapshot at creation time; public
  requests read from the database, never from the provider.
- **Capability URLs.** Share tokens are cryptographically random; only the SHA-256 hash is
  stored.
- **Provider abstraction.** A `CalendarProvider` trait isolates provider-specific logic.

## Tech stack

| Layer        | Choice                                   |
|--------------|------------------------------------------|
| Frontend     | React, TypeScript, Vite, Tailwind, TanStack Query |
| Backend      | Rust, Axum, Tokio, Serde, SQLx, Reqwest  |
| Database     | PostgreSQL                               |
| Auth         | Google OAuth 2.0 / OpenID Connect        |
| Hosting      | Vercel (frontend), Railway/Render/Fly (backend), Neon/Supabase (Postgres) |

## Local setup

### Prerequisites

- [Rust](https://rust-lang.org/) (>= 1.75)
- [Node.js](https://nodejs.org/) (>= 20)
- [PostgreSQL](https://www.postgresql.org/) (16+) or Docker Compose
- A Google Cloud project with the Calendar API enabled

### 1. Database

Using Docker Compose:

```bash
docker compose up -d postgres
```

Or install PostgreSQL locally and create the database:

```bash
CREATE USER calendarshare WITH PASSWORD 'calendarshare' CREATEDB;
CREATE DATABASE calendarshare OWNER calendarshare;
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# edit .env with your Google OAuth credentials
cargo run
```

The server listens on `http://localhost:3001` (override with `PORT`).

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

The dev server runs on `http://localhost:3002` and proxies `/api` and `/auth` to the backend.

## Environment variables

See `backend/.env.example`:

| Variable                  | Purpose                                  |
|---------------------------|------------------------------------------|
| `DATABASE_URL`            | PostgreSQL connection string             |
| `GOOGLE_CLIENT_ID`        | Google OAuth client ID                   |
| `GOOGLE_CLIENT_SECRET`    | Google OAuth client secret               |
| `GOOGLE_REDIRECT_URI`     | OAuth redirect URI                       |
| `SESSION_SECRET`          | 32-byte base64 session signing key       |
| `TOKEN_ENCRYPTION_KEY`    | 32-byte base64 AES-256-GCM key           |
| `PUBLIC_BASE_URL`         | Public base URL for share links          |
| `REDIS_URL`               | Optional Redis for rate limiting         |
| `RUST_LOG`                | Tracing level filter                     |
| `PORT`                    | Server port (default 3000)               |

## Google OAuth setup

1. Create a Google Cloud project and enable the **Google Calendar API**.
2. Configure the **OAuth consent screen** (external).
3. Create **OAuth 2.0 credentials** (client ID + secret).
4. Set the authorized redirect URI to `http://localhost:3000/auth/google/callback`.
5. Request these scopes:
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `openid`, `email`, `profile`

Never commit secrets. Use environment variables or a secrets manager.

## Testing

### Backend

```bash
cd backend
cargo test          # unit + integration tests
cargo clippy        # lint
cargo fmt --check   # formatting
```

### Frontend

```bash
cd frontend
npm test            # vitest
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
```

## CI

See `.github/workflows/ci.yml`. Every PR runs:

- `cargo fmt --check`, `cargo clippy`, `cargo test`
- frontend `typecheck`, `lint`, `test`
- database migration validation

## Deployment

CalendarShare is deployed as a single origin: the Rust backend serves the compiled
frontend from the same domain, so cookies and CORS just work. The whole thing runs
for **$0/month** on **Render** (free 0.5 vCPU / 256 MB web service, free 256 MB
managed Postgres, free SSL, free custom domain).

The deployment spec is in [`render.yaml`](./render.yaml). On `git push` to the
connected branch, Render rebuilds and redeploys automatically.

## Production launch guide ($0 on Render)

This is the step-by-step checklist to take CalendarShare live.

### 0. Pick a domain

Use one domain for everything. The backend serves the frontend, so there is only
one origin and no CORS issues. The app is currently deployed on Render's
default domain:

| Component | URL |
|-----------|-----|
| Frontend + backend | `https://calendershare.onrender.com` |
| Public share | `https://calendershare.onrender.com/s/<token>` |

If you later add a custom domain, update the env vars below to match it.

### 1. Google Cloud — OAuth + Calendar API

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (or reuse one).
3. **APIs & Services → Library →** enable **Google Calendar API**.
4. **APIs & Services → OAuth consent screen →** choose **External**.
   - App name: `CalendarShare`
   - User support email: your email
   - Developer contact information: your email
   - App domains: your production domain
   - Authorized redirect URIs: `https://calendershare.onrender.com/auth/google/callback`
     (add `http://localhost:3000/auth/google/callback` for local dev)
5. **APIs & Services → Credentials →** create **OAuth 2.0 Client IDs** (Web application).
   - Authorized redirect URI: `https://calendershare.onrender.com/auth/google/callback`
     (For local dev also add `http://localhost:3000/auth/google/callback`.)
6. Copy the **Client ID** and **Client Secret** — these go into the Render env.

Required scopes (already requested in code):
- `https://www.googleapis.com/auth/calendar.readonly`
- `openid`, `email`, `profile`

### 2. Generate secrets

```bash
python3 -c "import base64,os; print('SESSION_SECRET=' + base64.b64encode(os.urandom(32)).decode())"
python3 -c "import base64,os; print('TOKEN_ENCRYPTION_KEY=' + base64.b64encode(os.urandom(32)).decode())"
```

Both must be **32 bytes base64-encoded**. Never commit them.

### 3. Sign up for Render and connect the repo

1. Sign up at [render.com](https://render.com) (free tier, no card required for the
   web service + Postgres).
2. **Blueprints →** connect your GitHub repo. Render reads `render.yaml` and
   provisions a Web Service and a Managed Postgres automatically.
3. On first deploy it builds the container, runs migrations at startup, and
   prints the live URL.

### 4. Configure environment variables in the Render dashboard

Set these on the Web Service (the secrets marked `sync: false` in `render.yaml`
are left blank for you to fill in):

| Variable | Value |
|----------|-------|
| `GOOGLE_CLIENT_ID` | from step 1 |
| `GOOGLE_CLIENT_SECRET` | from step 1 |
| `GOOGLE_REDIRECT_URI` | `https://calendershare.onrender.com/auth/google/callback` |
| `SESSION_SECRET` | from step 2 |
| `TOKEN_ENCRYPTION_KEY` | from step 2 |
| `PUBLIC_BASE_URL` | `https://calendershare.onrender.com` |

`DATABASE_URL` is injected automatically from the Managed Postgres.

### 5. Smoke test the full flow

1. Open `https://calendershare.onrender.com` in a browser.
2. Click **Sign in** → Google OAuth → grant calendar access.
3. You land on the dashboard.
4. Click **Create share**, pick a calendar, date range, visibility, expiration.
5. Click **Create share** → copy the link.
6. Open the link in an **incognito** window (no session).
7. Confirm you see only the events in the selected range, with the chosen visibility.
8. Return to the dashboard and **revoke** the share.
9. Re-open the link — it should now be unavailable.

### 7. Security checklist before going live

- [ ] HTTPS everywhere (Render forces TLS automatically).
- [ ] `PUBLIC_BASE_URL` and OAuth redirect URI match the production domain exactly.
- [ ] `SESSION_SECRET` and `TOKEN_ENCRYPTION_KEY` are not in source control.
- [ ] `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are not in source control.
- [ ] CORS allows only the production frontend origin (single origin here, so it is fine).
- [ ] Database uses TLS (Render managed Postgres does).
- [ ] Run the security tests: `cd backend && cargo test --test share_flow`.

### 8. Optional hardening

- Redis for rate limiting and caching (`REDIS_URL`) — add a Redis service in Render.
- Structured logs ship to your log aggregator (`RUST_LOG=info`).
- A scheduled cleanup job for expired share snapshots.
- A `DELETE /api/me` endpoint (account deletion) that cascades through users,
  connections, calendars, shares, and share events.
- CI runs on every PR (`.github/workflows/ci.yml`).

## MVP limitations

- Google Calendar only (Microsoft and Apple are planned).
- Snapshot sharing — shares are not automatically refreshed.
- No recipient accounts, passwords, or email/SMS delivery.
- No calendar editing or two-way sync.
- No team/workspace features.

## Security considerations

- OAuth credentials are encrypted at rest with AES-256-GCM and never sent to browsers.
- Share tokens are 32 bytes of CSPRNG output; only the SHA-256 hash is stored.
- Public share responses are filtered server-side by visibility mode.
- Expiration and revocation are enforced on every public request.
- Session cookies are HTTP-only and signed with an HMAC key.

## License

MIT