# JWT Key Rotation — Overlapping Keys

## Problem

`JWT_SECRET` as a single value means rotating it invalidates every active session at once, so in practice it never gets rotated — the actual security problem.

## Solution

Support **overlapping keys** with `kid` (key id) header.

### Env

```
JWT_SECRET=change-me-in-production            # fallback / legacy single-secret (still required for backward compat)
JWT_SECRETS={"kid-old":"old-secret","kid-new":"new-secret"}  # or CSV: "kid-old:old-secret,kid-new:new-secret"
JWT_CURRENT_KID=kid-new                       # kid used for signing new tokens
JWT_EXPIRES_IN=15m
```

- `JWT_SECRETS` is optional. When absent, single-secret mode is used (`kid="primary"` → `JWT_SECRET`). Existing deployments keep working on upgrade.
- `JWT_SECRETS` supports JSON object, JSON array `[{"kid":"...","secret":"..."}]`, or CSV `kid:secret,kid2:secret2`.
- `JWT_CURRENT_KID` selects the signing key; must exist in `JWT_SECRETS`. If unset, the last key in the map is used (newest).

### Token Header

New tokens carry `kid` via `jsonwebtoken` `keyid` option:

```ts
jwt.sign(payload, secretForCurrentKid, { expiresIn, keyid: currentKid });
```

Decoded header: `{ alg: "HS256", kid: "kid-new", typ: "JWT" }`

### Verification

- If `kid` present: only that key is tried. **Unknown kid is rejected** (401).
- If no `kid` (legacy token from before rotation): tries `JWT_SECRET` then all known keys (backward compat). This allows old sessions to survive the upgrade.

### Rotation Procedure (Zero Session Loss)

1. Generate new secret + kid (e.g. `2026-08`): `openssl rand -base64 32`
2. Set `JWT_SECRETS="kid-old:old-secret,kid-new:new-secret"` and `JWT_CURRENT_KID=kid-new`. Deploy.
   - Old tokens (`kid-old`) still verify.
   - New tokens use `kid-new`.
3. Wait **2× `JWT_EXPIRES_IN`** (or documented 7-day window, whichever larger) — all old tokens have expired.
4. Remove `kid-old` from `JWT_SECRETS`: `JWT_SECRETS={"kid-new":"new-secret"}`. Deploy.
   - No sessions invalidated at any step.
5. Optionally rotate `JWT_SECRET` env itself to the new secret for single-secret fallback.

### Window

Retired keys are removed after **7 days** or **2× `JWT_EXPIRES_IN`**, whichever is longer, as documented in `backend/.env.example` and this file. The window is intentionally conservative: with `15m` TTL, 2× is 30m, but 7 days ensures long-lived refresh-adjacent flows (e.g., mobile) are not impacted. Shorten to `2× TTL` if you have only short-lived access tokens.

### Code

- `src/modules/auth/jwt.ts` — `getJwtKeySet()`, `signAccessToken()`, `verifyAccessToken()` (handles `kid`).
- `src/modules/auth/auth.service.ts` — uses `signJwt`/`verifyJwt`.
- `src/modules/auth/auth.utils.ts` — `signAccessToken` for edge util.
- `src/common/middleware/requireAuth.ts`, `src/realtime/auth.ts`, `src/modules/auth/auth.middleware.ts` — all delegate to `verifyAccessToken` (rotation-aware).

### Tests

- `src/modules/auth/jwt.test.ts`:
  - `sign with new / verify with old` — proves overlapping verification.
  - `unknown kid rejected` — 401 on unknown `kid`.
  - `rotation with live sessions` — old token still valid after adding new key.
  - `retired keys removed after window` — old token rejected after removal.
  - `single-secret config path still works` — backward compat (no `JWT_SECRETS`, legacy no-kid token).
  - `CSV format supported` — parsing variant.
