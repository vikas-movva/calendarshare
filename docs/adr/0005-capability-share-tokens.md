# 0005-capability-share-tokens

## Context

Share URLs must be unguessable so that recipients cannot discover other shares, and the
system must support revocation and expiration. The token is effectively a bearer
credential: anyone holding it can access the share.

## Decision

- Generate tokens with a cryptographically secure random source (32 bytes, base64url).
- Store only the **SHA-256 hash** of the token in the `shares.token_hash` column.
- Resolve public requests by hashing the supplied token and looking up the hash.
- Never expose the raw token except in the share URL shown once at creation.

## Alternatives

- **Sequential or UUID identifiers**: trivially enumerable; insecure.
- **Signed JWTs**: valid for the lifetime of the signature; revocation requires a
  denylist, which reintroduces server-side state and complexity.
- **Store raw tokens**: a database leak would expose all share URLs.

## Consequences

- Token hash lookup is a single indexed database query per public request.
- Revocation and expiration are checked after lookup, so they take effect immediately.
- The raw token is never logged or returned in API responses.