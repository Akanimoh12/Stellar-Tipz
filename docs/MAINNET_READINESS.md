# Mainnet readiness and rollback — #1367

Mainnet is **NO-GO** until each gate is evidenced and signed off in a release ticket.

| Requirement | Accountable owner | Objective acceptance evidence |
| --- | --- | --- |
| Independent contract audit (#034) | Security lead | Published audit at reviewed commit; critical/high findings fixed and retested |
| Deployment security (#084) | DevOps lead | Mainnet keys segregated, passphrase/contract ID verified, safe signer custody |
| Load tests (#148, #1355) | SRE | Signed test report, p95/p99 SLO, 2x expected load headroom |
| Incident response (#213) | Incident commander | Tabletop and emergency pause exercise completed |
| Observability (#1368, #1369, #1370) | On-call engineer | Alert receivers tested, DB/cost dashboards populated, isolated testnet synthetic passing |
| Database safety | DBA | Encrypted backup restored in isolated infrastructure; RPO/RTO measured |
| Financial reconciliation (#1358) | Finance owner | Ledger fees/tips/refunds reconciled within stroop-level rounding tolerance |
| Deployment approval | Release lead + independent approver | Approved release ticket with commit SHA, evidence links, rollback owner |

Use `.github/workflows/mainnet-release-gate.yml` only for a candidate whose SHA exactly matches the checked-out protected release branch. Administrators **must configure the `mainnet` GitHub environment with required independent reviewers, restrict deployment branches to protected `main`, and disable admin bypass**. Supply `MAINNET_ENV_INSPECTION_TOKEN` as a repository Actions secret with read-only administration permission to inspect the `mainnet` environment protection. The workflow verifies required reviewers exist and fails closed if permission or the token is missing. This workflow authorizes a candidate but deliberately does not make mainnet transactions. A future deployment workflow must depend on the same protected approval job; no direct push-to-mainnet path.

## Runbook: rollback and emergency response

1. Freeze deployment, announce maintenance, capture the on-chain ledger, indexer cursor, treasury balances and backup evidence.
2. Page operations/security and suspend incoming mutations, automatic payouts and keeper workers if transfers cannot be trusted.
3. If contract authorization is compromised, use the audited contract pause mechanism with its designated multisig. Real on-chain transfers **cannot be undone**.
4. Roll back API/web/indexer containers to last verified artifact; never blindly roll back a stateful contract upgrade. Restore DB only after reconciling chain-to-DB changes and idempotent reindex requirements.
5. Validate fee reconciliation, balances, event replay, SLOs, recovery point and customer impact before re-enabling traffic.
6. Archive the incident timeline, corrective actions and an independently approved go/no-go decision.

Owners and links must be completed in the release ticket; this document alone is not release authorization.
