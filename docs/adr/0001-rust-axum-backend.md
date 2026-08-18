# 0001-rust-axum-backend

## Context

CalendarShare needs a backend that can:
- Serve an authenticated API for calendar owners.
- Serve an unauthenticated public API for share recipients.
- Enforce authorization and visibility rules server-side.
- Be simple enough for one developer or an AI coding agent to maintain.

## Decision

Use **Rust with Axum** as the web framework, with Tokio for async runtime, Serde for JSON,
SQLx for PostgreSQL access, and Reqwest for the Google Calendar API.

## Alternatives

- **Node.js / Express or NestJS**: faster to start, but weaker type safety for the
  security-critical authorization logic.
- **Go / Gin or Echo**: good fit, but the team is more comfortable with Rust and the
  async ecosystem around Axum is mature enough.
- **Python / FastAPI**: simplest for an AI agent, but harder to express the authorization
  invariants safely and the deployment story is heavier.

## Consequences

- Rust gives compile-time confidence in authorization and data-flow boundaries.
- The learning curve is higher than JavaScript stacks, but the safety payoff is worth it
  for a product handling sensitive calendar data.
- The provider abstraction (`CalendarProvider` trait) keeps Google-specific logic
  isolated so future providers can be added without touching share logic.