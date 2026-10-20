# ADR 001 — Stellar Wallet Challenge-Response Authentication Flow

**Status:** Accepted  
**Date:** 2026-06-26  
**Issues:** #832, #838, #842, #849

---

## Context

Stellar Tipz is a tip-streaming platform whose users are identified by their Stellar public key (a `G…` address). Users own their private keys in a browser wallet (e.g. Freighter). There are no passwords to manage and no OAuth provider relationship to maintain.

We need a stateless, JWT-based session layer that:

- Proves the caller controls a Stellar key pair (public key + matching private key).
- Issues short-lived access tokens and rotatable refresh tokens.
- Prevents replay of signed messages.
- Creates a `User` row automatically on first successful login.

---

## Decision

We adopt a **challenge-response (nonce-sign-verify)** flow over HTTPS:

1. **Request challenge** — the client sends its public key; the server stores a random nonce linked to that key with a short TTL (5 minutes by default) and returns a human-readable `messageToSign`.
2. **Sign** — the client signs the raw nonce bytes with its Stellar private key using Ed25519 (`Keypair.sign`).
3. **Verify** — the server looks up the challenge, verifies the Ed25519 signature against the stored nonce, **atomically consumes** the challenge (single-use enforcement), upserts the `User` row, and issues a JWT access token + opaque refresh token.
4. **Access protected routes** — the client sends `Authorization: Bearer <accessToken>`; the `requireAuth` middleware validates the JWT and attaches `req.user`.
5. **Refresh** — before the access token expires the client exchanges its refresh token for a new token pair (rotation with revocation).

### Why nonce-sign-verify rather than SEP-10 or SIWE?

| Option | Notes |
|--------|-------|
| SEP-10 (Stellar Web Auth) | Designed for Stellar network anchors and horizon. Heavyweight for a pure backend. |
| SIWE (Sign-In With Ethereum) | Ethereum-specific message format; not idiomatic for Stellar. |
| Custom nonce-sign-verify | Simple, auditable, no external spec dependencies; proven pattern in Solana/Stellar ecosystems. |

### Token design

| Token | Type | Lifetime | Storage |
|-------|------|----------|---------|
| Access token | Signed JWT (`RS256`-compatible, `HS256` for simplicity) | 15 min | Memory / `Authorization` header |
| Refresh token | Opaque random bytes (96 hex chars), SHA-256 hashed in DB | 7 days | `HttpOnly` cookie or secure storage |

### Nonce single-use enforcement (#842)

After signature verification the server calls:

```ts
const deleted = await prisma.authChallenge.deleteMany({ where: { id: challenge.id } });
if (deleted.count === 0) {
  throw new UnauthorizedError('Challenge has already been used');
}
```

`deleteMany` maps to a single `DELETE … WHERE id = ?` SQL statement, which is atomic at the database level. Only one concurrent request will receive `count = 1`; all others receive `count = 0` and are rejected. This eliminates the TOCTOU window that a read-then-delete approach would leave open.

### User creation on first login (#849)

```ts
const user = await prisma.user.upsert({
  where: { stellarAddress: address },
  create: { stellarAddress: address },
  update: {},
});
```

`upsert` is a single `INSERT … ON CONFLICT DO NOTHING / UPDATE` statement, making first-login account creation atomic and safe under concurrent requests for the same key.

---

## Sequence Diagram

```
Client                       Backend (Express)               PostgreSQL
  |                                |                               |
  |-- POST /auth/challenge ------->|                               |
  |   { address: "G..." }          |-- INSERT AuthChallenge ------>|
  |                                |<-- { id, nonce, expiresAt } --|
  |<-- 201 { messageToSign } ------|                               |
  |                                |                               |
  | [client signs nonce bytes      |                               |
  |  with Stellar private key]     |                               |
  |                                |                               |
  |-- POST /auth/verify ---------->|                               |
  |   { address, nonce, sig }      |-- SELECT AuthChallenge ------>|
  |                                |<-- { id, address, expiresAt} -|
  |                                |                               |
  |                                | [validate address + expiry]   |
  |                                | [verify Ed25519 signature]    |
  |                                |                               |
  |                                |-- DELETE AuthChallenge ------->|  ← atomic consume
  |                                |<-- count=1 -------------------|
  |                                |                               |
  |                                |-- UPSERT User ---------------->|  ← first-login create
  |                                |<-- User row ------------------|
  |                                |                               |
  |                                | [sign JWT, hash refresh token]|
  |                                |-- INSERT RefreshToken -------->|
  |<-- 200 { accessToken,          |                               |
  |          refreshToken, user } -|                               |
  |                                |                               |
  |-- GET /protected               |                               |
  |   Authorization: Bearer <jwt>  |                               |
  |                                | [requireAuth middleware]       |
  |                                | [jwt.verify → req.user]       |
  |<-- 200 { … } -----------------|                               |
  |                                |                               |
  |-- POST /auth/refresh --------->|                               |
  |   { refreshToken }             |-- SELECT RefreshToken -------->|
  |                                |<-- { id, revokedAt, user } ---|
  |                                | [validate not revoked/expired] |
  |                                |-- UPDATE revokedAt ----------->|
  |                                |-- INSERT new RefreshToken ---->|
  |<-- 200 { accessToken,          |                               |
  |          refreshToken, user } -|                               |
```

---

## Consequences

### Positive

- No password storage; no OAuth provider lock-in.
- Nonces expire after 5 minutes and are single-use, limiting the replay window to zero after consumption.
- Refresh token rotation (revoke-on-use) limits the blast radius of a stolen refresh token.
- `requireAuth` is a plain Express middleware — easy to compose on any router.

### Negative / Trade-offs

- Clients must implement Ed25519 signing (Freighter wallet handles this natively for Stellar).
- Access tokens are not revocable before expiry; the 15-minute window is the accepted trade-off for statelessness.
- `HS256` JWT secret must be rotated carefully (requires all access tokens to be re-issued).

### Out of scope

- Multi-device refresh token management (future work).
- WebAuthn / passkey support (future work).
- Role-based access control beyond the `req.user` attachment (future work).
