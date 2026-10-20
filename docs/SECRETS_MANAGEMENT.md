# Secrets management and incident response

This runbook applies to production, staging, preview, and testnet deployments. **Never commit a real secret**, including in files named `.env.staging`, deployment examples, workflow logs, or GitHub Actions artifacts.

## Storage and access

- Store production credentials in the production provider's managed secret store (for example, Vercel encrypted Environment Variables, GitHub Actions environment secrets, or a dedicated vault). GitHub repository variables are **not** secret storage.
- Configure `production`, `staging`, and `preview` as separate environments. Use distinct credentials and narrow their scopes; do not expose production credentials to pull requests from forks.
- Allow access only to deploy operators. Require approval for production deploys, enable the provider's secret-access/audit logs, and retain access records according to the organisation's retention policy.
- Prefer short-lived OIDC credentials where supported. Never echo secret values in CI commands or export them to artifacts. Masking in CI logs is not sufficient protection.
- Use `.env.example` for variable **names and non-sensitive placeholders only**; runtime secret material is injected by the deployment platform.

## Rotation and revocation

| Secret | Safe rotation procedure |
| --- | --- |
| JWT signing keys | Deploy support for old/new key IDs first; issue new tokens with the new signing key; accept old signatures only for the documented overlap period; revoke old key after token expiry. Rotating without overlap logs users out. |
| Database credentials | Create a new least-privileged DB user; store the new connection string; redeploy and verify healthy connections; revoke the old role and confirm active sessions drain. |
| Third-party API keys and Vercel tokens | Create a second scoped key, update environment secrets, redeploy, verify dependent APIs, then revoke the previous key. |
| Stellar deployer keys | Treat private keys as privileged custody material. Rotate operational access to a newly approved account; transfer applicable admin roles on-chain with tested authorization; verify rights before retiring the old key. Do **not** assume that changing a CI secret transfers contract ownership. |
| Webhook signing secrets | Accept the previous and current secrets for a bounded overlap, update webhook senders and receivers, then disable the old secret and check signature-failure metrics. |

Record each rotation in the private incident/change log: operator, timestamp, affected systems, secret ID (never the value), verification result, and revocation time.

## Detection

`.github/workflows/secrets-scan.yml` runs on pull requests, pushes to the active/default branches and manually. It checks full reachable Git history, not merely the latest working tree. Treat findings as potential exposure even if the affected lines have since been deleted.

For a confirmed exposure:

1. Disable or revoke the exposed credential **immediately** and create a replacement in the secret manager.
2. Determine the accessible window and affected systems from the provider's audit logs; review unauthorized requests and transactions.
3. Rotate related dependent credentials (sessions, JWT keys, webhook keys, database users) as indicated by the impact assessment.
4. Remove the secret from the tip of the repository and, with maintainer coordination, rewrite contaminated history **only after revocation**. Assume forks and cached copies exist; history rewriting does not make leaked credentials safe.
5. Run the full-history scan again and document remediation privately without reproducing the secret in issues or PRs.

## Operational prerequisite

This repository change installs scanning and documents a process. It **does not** provision a secrets manager, enable cloud audit logging, rotate credentials, or grant cloud permissions. The maintainers must configure those provider-side controls before checking off production readiness.
