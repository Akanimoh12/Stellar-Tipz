# Security Policy

## Overview

The Stellar Tipz team takes security seriously. We appreciate responsible disclosure and will work with reporters to address verified vulnerabilities promptly.

---

## Supported Versions

| Version  | Supported |
| -------- | --------- |
| `main`   | ✅ Yes     |
| Older branches | ❌ No |

We only actively patch the `main` branch. Please report vulnerabilities against the latest commit on `main`.

---

## Reporting a Vulnerability

**Do NOT open a public GitHub issue for security vulnerabilities.** Public disclosure before a fix is available puts users at risk.

### Option 1 — GitHub Private Security Advisory (Preferred)

1. Navigate to the **Security** tab of this repository.
2. Click **"Report a vulnerability"**.
3. Fill in the advisory form with as much detail as possible (see the template below).
4. Submit the advisory. It will be visible only to you and the maintainers.

### Option 2 — Email

Send a report to **security@stellar-tipz.dev** (monitored by the core maintainers). Encrypt your email using our PGP key if the report contains sensitive details:

```
Key ID:   0xEXAMPLE
Fingerprint: XXXX XXXX XXXX XXXX XXXX  XXXX XXXX XXXX XXXX XXXX
```

> If a PGP key is not yet published, email in plaintext and we will establish an encrypted channel for follow-up.

### Vulnerability Report Template

Please include the following in your report:

```
**Summary:**        One-sentence description of the vulnerability.
**Severity:**       Critical / High / Medium / Low (your assessment)
**Affected component:** Contract / Frontend / CI / Other
**Affected version/commit:** <commit SHA or branch>

**Steps to reproduce:**
1. …
2. …

**Expected behaviour:**   What should happen.
**Actual behaviour:**     What actually happens.

**Proof of concept:**     Code snippet, transaction hash, or screenshot (optional but helpful).

**Suggested fix:**        If you have one (optional).

**Disclosure timeline:**  When do you plan to disclose publicly?
```

---

## Scope

### In scope

| Component | Description |
| --------- | ----------- |
| Smart contract (`contracts/`) | Logic errors, access-control bypasses, arithmetic overflows, reentrancy, fund loss |
| Frontend (`frontend-scaffold/`) | XSS, CSRF, wallet key exposure, insecure direct object references |
| CI/CD (`.github/workflows/`) | Supply-chain attacks, secret leakage, workflow injection |
| Dependencies | Transitive vulnerabilities with a clear exploit path in this project |

### Out of scope

- Vulnerabilities in the Stellar network protocol itself (report to [SDF](https://www.stellar.org/foundation/security)).
- Theoretical or "informational" findings with no practical exploit path.
- Issues already listed in open GitHub issues or known limitations in the README.
- Social-engineering attacks against team members.
- Denial-of-service via resource exhaustion that requires > 10,000 USD of XLM.

---

## Response Time Commitments

| Milestone | Target SLA |
| --------- | ---------- |
| **Acknowledgement** of receipt | 2 business days |
| **Initial triage** (severity assessment) | 5 business days |
| **Status update** (accepted / declined / needs more info) | 10 business days |
| **Fix deployed** for Critical / High | 14 calendar days after acceptance |
| **Fix deployed** for Medium | 30 calendar days after acceptance |
| **Fix deployed** for Low | Next scheduled release |
| **Public disclosure** (coordinated) | After fix is deployed; coordinated with reporter |

If we are unable to meet a deadline, we will communicate the delay and provide a revised timeline.

---

## Severity Definitions

We follow [CVSS v3.1](https://www.first.org/cvss/calculator/3.1) as a baseline and adjust based on the on-chain financial impact.

| Severity | CVSS Range | Examples |
| -------- | ---------- | -------- |
| **Critical** | 9.0–10.0 | Fund theft, contract takeover, unauthorized admin transfer |
| **High** | 7.0–8.9 | Balance manipulation, fee bypass, leaderboard spoofing |
| **Medium** | 4.0–6.9 | Information leakage, denial of service for a single user |
| **Low** | 0.1–3.9 | Minor UI issues, non-sensitive data exposure |

---

## Safe Harbour

Stellar Tipz will not take legal action against researchers who:

- Report vulnerabilities through the responsible disclosure process described above.
- Do not exfiltrate, modify, or destroy data beyond what is minimally required to demonstrate the vulnerability.
- Do not disrupt production services or other users.
- Do not demand payment as a condition of disclosure.

We ask that you give us a reasonable window to address the issue before any public disclosure.

---

## Hall of Fame

We publicly recognise researchers who help keep Stellar Tipz secure. With your permission, we will add your name or handle here after the fix is deployed.

| Researcher | Severity | Year | Summary |
| ---------- | -------- | ---- | ------- |
| *(Be the first!)* | — | — | — |

---

## Security Best Practices for Users

- **Never share your wallet seed phrase or private key** with anyone, including the Tipz team.
- Always verify the URL is `stellar-tipz.vercel.app` (or the official domain) before connecting your wallet.
- Use a hardware wallet or a dedicated browser profile for on-chain interactions.
- Review each transaction your wallet prompts you to sign before approving.

---

## Logging Security and PII Protection

The Stellar Tipz backend implements comprehensive personally identifiable information (PII) redaction in structured logs to prevent sensitive data exposure while maintaining operational observability.

### Logging Security Policy

All structured logs generated by the application automatically redact sensitive information according to the following policies:

#### Authentication Data Redaction

The following authentication-related data is **automatically redacted** from all log entries:

- **Authorization headers**: `Authorization`, `Bearer` tokens
- **API keys**: `x-api-key`, `x-auth-token`, `x-access-token` headers
- **Cookies**: All cookie values in `Cookie` and `Set-Cookie` headers
- **Tokens in request/response bodies**: `token`, `accessToken`, `refreshToken`, `apiKey`
- **Private keys and secrets**: `privateKey`, `secret`, `password` fields

**Redaction format**: Sensitive values are replaced with `[REDACTED]`

#### Stellar Address Truncation

Stellar addresses in logs are truncated to prevent full address exposure while maintaining correlation capability:

- **Format**: `GXXX...XXXX` (first 4 and last 4 characters)
- **Applied to**: `publicKey`, `recipientAddress`, `senderAddress`, and similar fields
- **Rationale**: Enables debugging correlation without exposing complete addresses

#### Email Address Protection

Email addresses are truncated to show only domain information:

- **Format**: `***@domain.com`
- **Rationale**: Preserves domain-level debugging info without exposing user identities

#### Message Content Limitations

User-generated message content is limited in logs:

- **Truncation**: Messages > 50 characters are truncated with length indication
- **Format**: `"First 50 chars... (total: 150 chars)"`
- **Rationale**: Prevents logging of potentially sensitive communications

#### Request Body Filtering

Request bodies are **not logged wholesale**. Only an explicit safe subset is included:

**Safe fields logged**:
- `username` (for correlation)
- `email` (truncated as per policy above)
- `amount` (transaction amounts)
- `message` (truncated as per policy above)
- Stellar addresses (truncated as per policy above)
- `_bodyKeys` (field names only, for debugging structure)

**Never logged**:
- Complete request bodies
- Any field containing tokens, keys, or secrets
- Sensitive form data

#### Response Body Protection

Response bodies are **not logged by default** to prevent accidental exposure of sensitive data returned by the API.

### Implementation Details

The PII redaction is implemented using:

1. **Pino redaction configuration** with explicit path-based redaction
2. **Custom serializers** that filter and truncate sensitive data
3. **Utility functions** in `src/common/utils/logRedaction.ts` for consistent data processing
4. **Automated testing** that verifies tokens never appear in log output

### Testing and Validation

The logging security implementation includes comprehensive automated tests (`tests/logging-security.test.ts`) that:

- Capture actual pino log stream output
- Assert that various token formats never appear in logs
- Verify proper redaction of headers, cookies, and request bodies
- Confirm Stellar address and email truncation policies
- Test multiple authentication token patterns (JWT, API keys, etc.)

### Monitoring and Compliance

**For operators**: 
- Log redaction is automatic and requires no manual intervention
- Monitor for `[REDACTED]` markers in logs to verify policy enforcement
- Any appearance of actual token values in logs indicates a policy violation

**For developers**:
- All new logging code must use the configured structured logger
- Manual `console.log` statements bypass redaction and are prohibited in production
- Custom logging fields should use the utilities in `logRedaction.ts`

### Emergency Procedures

If sensitive data is discovered in logs:

1. **Immediate**: Rotate any exposed credentials (API keys, tokens)
2. **Short-term**: Purge affected log entries from storage systems
3. **Investigation**: Review how the data bypassed redaction policies
4. **Remediation**: Update redaction rules and add test coverage for the failure case

### Policy Updates

This logging security policy is enforced through:
- Automated tests that must pass before deployment
- Code review requirements for logging-related changes
- Regular security audits of log output in staging environments

Any changes to logging behavior must maintain or strengthen these protections.

---

## Client Storage Security Audit & Hardening

Stellar Tipz implements a comprehensive client-side storage security model across `localStorage`, `sessionStorage`, `secureStorage` (AES-GCM encryption), and in-memory state management (Zustand).

### 1. Client Storage Inventory & Justification

| Key / Namespace | Storage Medium | Classification | Purpose & Justification | Versioning & Schema | Retention Policy |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `tipz_auth_tokens` | `localStorage` | High Sensitivity (Auth) | Holds `{ accessToken, refreshToken }` for REST API requests. Preserves active session across page reloads and multiple open tabs without repetitive wallet re-signing. | `v1` (`{ version, accessToken, refreshToken }`) | Revoked on logout, cleared on disconnect, expires via JWT TTL or 30m idle timeout. |
| `tipz-wallet` / `tipz_tipz-wallet` | `secureStorage` (`localStorage` encrypted) | High Sensitivity (Wallet & Session) | Stores connected wallet public keys, active wallet address, network mode, and session expiration timestamp. Encrypted via AES-GCM (Web Crypto API) with PBKDF2 key derivation. | `v1` (Zustand `version: 1` + `SECURE_STORAGE_VERSION: 1`) | Cleared on disconnect/logout or session expiry. |
| `tipz_settings` | `localStorage` / `secureStorage` | Low (UX Preference) | UI display preferences (theme, language, notification preferences, display options). | `v1` (Default-merged fallback) | Persists indefinitely unless manually reset. |
| `tipz_favorites` | `localStorage` | Low (Curated Public Data) | Cached list of favorited creator addresses, display names, and tip counts to reduce repetitive network fetches. | `v1` (Zustand `version: 1`) | Cleared on logout. |
| `tipz_goals` | `localStorage` | Low (Public Campaign Data) | Cached creator goals and progress metrics. | `v1` (Zustand `version: 1`) | Cleared on logout. |
| `tipz_notifications` | `localStorage` | Medium (Activity History) | Recent user activity notifications (tips received, milestones). Non-sensitive event metadata. | `v1` (Zustand `version: 1`) | Cleared on logout. |
| `tipz_draft_*` / `tipz_register_form` | `localStorage` | Medium (Form Recovery) | Form autosave drafts to prevent data loss on accidental navigation or reload. All sensitive credentials, keys, amounts, and destination addresses are stripped before writing. | `v2` (`useFormAutosave` with 24h TTL) | Auto-discarded after 24h TTL; cleared on logout. |
| `tipz_unseen_tips` / `tipz_last_notified_tip_id` | `localStorage` | Low (UI Badge) | Counter and cursor for unread tips to prevent duplicate system popups. | Unversioned scalar | Cleared on logout. |
| `tipz_theme` / `tipz_language` | `localStorage` | Low (Device Preference) | Theme (`light`/`dark`) and locale code. | Scalar strings | Device-level preference; preserved across logout. |
| `tipz_tx_pending` | `localStorage` | Low (In-flight TX) | Tracking hash and status for in-flight transactions. | Object payload | Cleared upon transaction confirmation or logout. |
| `tipz_tx_guard_v1` | `sessionStorage` | Medium (Idempotency) | Active transaction guard to prevent double-spending or duplicate submission within the current tab. | `v1` | Cleared on transaction completion or tab close. |
| `tipz_recent_searches` | `sessionStorage` | Low (Query History) | Recent creator search queries within the current browsing session. | Array of strings | Cleared on tab close or logout. |
| `tipz_scroll:*` | `sessionStorage` | Low (Scroll Position) | Virtualized list scroll offsets for smooth back-navigation. | Number | Cleared on tab close or logout. |

---

### 2. Token Storage Architecture & Documented Tradeoff Decision

#### Architectural Context
The Stellar Tipz API is a cross-platform REST service utilizing Bearer JWT authentication (`Authorization: Bearer <accessToken>`). 

#### Options Evaluated
1. **HttpOnly SameSite Cookies**:
   - *Strengths*: Completely inaccessible to origin JavaScript; immune to direct token theft via XSS.
   - *Why Not Currently Viable*: The backend is a decoupled stateless API serving multi-platform clients. Cookie-based authentication across domains introduces cross-site credential complexities and requires CSRF infrastructure not suited for decentralized wallet interactions.
2. **In-Memory Only**:
   - *Strengths*: No disk or origin storage footprint.
   - *Why Not Viable*: Every page refresh (F5) or multi-tab navigation completely terminates the user's session, forcing constant re-challenge signing via wallet extensions.
3. **SessionStorage**:
   - *Strengths*: Scoped to a single browser tab; wiped on tab close.
   - *Limitation*: Tabs cannot share session state. Opening a creator profile, tipping link, or transaction receipt in a new tab treats the user as logged out.
4. **LocalStorage with Defense-in-Depth (Selected Decision)**:
   - *Decision*: Tokens are persisted in `localStorage` under `tipz_auth_tokens`, backed by comprehensive mitigations:
     - **Short-Lived Access Tokens**: 15-minute access token lifespan.
     - **Proactive Token Refresh**: Automatic rotation scheduled 60 seconds before expiration via single-flight refresh mutex.
     - **Single-Flight Refresh Token Rotation**: Server revokes used refresh tokens upon issuance of new pairs.
     - **Idle Session Timeout**: Inactivity for 30 minutes triggers automated logout and token revocation.
     - **Multi-Tab Cross-Session Invalidation**: BroadcastChannel propagates logout and session termination to all open tabs simultaneously.
     - **Namespacing & Payload Versioning**: Strict `version: 1` schema validation discards unexpected or corrupted token formats.
     - **Strict Clear-on-Logout**: All tokens and associated caches are purged immediately upon user logout or wallet disconnection.

---

### 3. Non-Essential PII Protection Policy

- **Zero Sensitive PII in Client Storage**: No seed phrases, private keys, passwords, email addresses, phone numbers, or government IDs are ever persisted in client storage.
- **In-Memory Profile Boundary**: The `profileStore` (which holds user profile metadata) is strictly maintained **in-memory** and never persisted to `localStorage` or `sessionStorage`.
- **Form Draft Sanitization**: The `useFormAutosave` hook runs all form state through `stripSensitiveFields()`, stripping password, secret, token, apikey, privatekey, mnemonic, seed, credential, otp, amount, and destination fields before any draft touches storage.
- **Creator Favorites**: The `favoritesStore` only stores public on-chain addresses, public usernames, and public avatar URLs needed for the UI, omitting private user metadata.

---

### 4. Namespacing & Versioning Standards

To prevent schema collision, prototype pollution, and stale shape corruption:
1. **Global Prefix**: All application keys must use the `tipz_` namespace (or `tipz-` in store persistence).
2. **Schema Versioning**:
   - Encrypted payloads in `secureStorage` include an explicit `version: 1` field.
   - Stored auth tokens in `tokenManager` require `version: 1`.
   - All persisted Zustand stores (`walletStore`, `favoritesStore`, `goalStore`, `notificationStore`) declare a `version` and implement `migrate()` functions to discard stale or mismatched structures.
3. **Automatic Stale Discarding**: Any unversioned or mismatched data encountered upon reading storage is automatically pruned (`removeItem`) to ensure corrupted structures do not break application rendering.

---

### 5. Storage Clear-on-Logout Guarantees

When a user logs out or disconnects their wallet:
1. `clearClientStorageOnLogout()` is invoked.
2. `secureStorage.clear()` removes all encrypted storage entries.
3. All authentication tokens (`tipz_auth_tokens`), connected wallets (`tipz-wallet`), notifications (`tipz_notifications`), favorites, goals, and autosaved drafts (`tipz_draft_*`) are removed from `localStorage`.
4. `sessionStorage` (containing recent queries and transaction guards) is completely cleared.
5. In-memory Zustand stores (`walletStore`, `profileStore`, `notificationStore`, `subscriptionStore`) are reset to initial empty states.
6. A cross-tab logout signal is broadcast to guarantee all open tabs immediately execute the same purge.
7. Automated unit tests (`services/__tests__/secureStorage.test.ts`) verify that all client-side storage keys are purged on logout.

---

## Resources

- [GitHub Security Advisories for this repo](../../security/advisories)
- [Stellar Development Foundation Security Policy](https://www.stellar.org/foundation/security)
- [CVSS v3.1 Calculator](https://www.first.org/cvss/calculator/3.1)
- [Soroban Security Documentation](https://soroban.stellar.org/docs/learn/security)
