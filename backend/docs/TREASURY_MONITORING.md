# Treasury balance monitoring

The jobs process reconciles the configured public fee-collector account every
five minutes. `expected` is the configured verified opening balance plus every
indexed `fee_collected` event; `actual` is the native XLM balance returned by
Horizon. Every result is retained in `TreasuryBalanceSnapshot` for trend and
forensic analysis.

An actual decrease from the immediately preceding observation is an
**unexpected outflow** and must be treated as a SEV1 until explained.

1. Preserve the latest snapshot and Horizon response; do not overwrite history.
2. Check recent `fee_collected` and `fee_collector` events and the contract admin audit log.
3. If the movement is not an approved treasury operation, follow the pause and
   key-compromise procedure in `docs/INCIDENT_RESPONSE.md` immediately.
4. Do not publish the collector address, transaction hashes, or balance details
   in a public incident update until the incident commander approves it.

Prometheus signals: `tipz_treasury_actual_balance_stroops`,
`tipz_treasury_expected_balance_stroops`,
`tipz_treasury_discrepancy_stroops`, and
`tipz_treasury_unexpected_outflows_total`.
