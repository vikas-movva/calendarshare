# 0003-snapshot-based-sharing

## Context

Public share recipients must not trigger Google Calendar API requests on every view,
both for performance and to avoid hitting provider API limits. At the same time, the
MVP must be simple enough to build and operate by one developer.

## Decision

Use a **snapshot model**. When a share is created:
1. Fetch the relevant events from the provider.
2. Normalize and filter them to the requested timeframe.
3. Apply visibility rules.
4. Persist the share and its events in a transaction.
5. Serve recipients from the database.

## Alternatives

- **Live proxy**: fetch from the provider on every public request. Simple to implement
  but slow, rate-limited, and a privacy risk (the backend would need provider credentials
  available to serve any public request).
- **Webhook synchronization**: Google Calendar webhooks plus a worker. Accurate but
  significantly more infrastructure; explicitly out of scope for MVP.

## Consequences

- Public share reads are fast and independent of provider availability.
- Shares are eventually stale until a manual refresh is added later.
- The `share_events` table is the source of truth for what a recipient sees; the backend
  never re-fetches from Google for a public request.