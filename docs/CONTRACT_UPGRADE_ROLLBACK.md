# Contract Upgrade Rollback Runbook

This runbook covers rolling back a bad WASM upgrade of the Tipz contract, and which
state changes can and cannot be reversed. Read it before running any upgrade on testnet
or mainnet. Source of truth: `contracts/tipz/src/admin.rs` (`propose_upgrade`,
`cancel_upgrade`, `upgrade`), `contracts/tipz/src/migrations.rs`, and the entrypoints in
`contracts/tipz/src/lib.rs`.

## Summary

- **Code can be rolled back. Stored state cannot.** Replacing the WASM is reversible.
  Storage migrations are not: there is no reverse migration, and `migrate` refuses any
  target version lower than the stored version.
- **The stored version number only goes up.** Every successful `upgrade` increments it by
  one, including a rollback. A rollback therefore moves the code back to an older WASM
  while the version counter moves forward.
- **Keep the previous WASM on the ledger.** A rollback needs the old WASM hash to still be
  installed. Do not let the old code entry expire (see [Before you upgrade](#before-you-upgrade)).

## Entrypoints involved

| Entrypoint | Role | Notes |
| --- | --- | --- |
| `propose_upgrade(admin, new_wasm_hash)` | Stores the hash to upgrade to | Admin only. Overwrites any earlier proposal. |
| `get_proposed_upgrade()` | Reads the pending hash | Returns `None` when nothing is pending. |
| `cancel_upgrade(admin)` | Clears the pending hash | Admin only. |
| `upgrade(admin, new_wasm_hash)` / `execute_upgrade` | Installs the WASM | Admin only. Fails with `NotFound` if nothing is proposed and `InvalidInput` if the hash differs from the proposal. Fails when multisig is enabled. |
| `get_version()` | Reads the stored version | Incremented by `upgrade`. |
| `pause(admin, flag)` / `unpause(admin, flag)` | Blocks or resumes operations | Use flag `0xFFFFFFFF` (`PauseFlag::All`) to stop all state-changing calls. |
| `migrate(admin, target_version, batch_size)` | Runs storage migrations | Admin only. Refuses downgrades. |

## Before you upgrade

1. **Record the current WASM hash** and the version (`get_version`). Store both with the
   release notes. The hash of the build you are replacing is your rollback target.
2. **Confirm the old WASM is still on the ledger.** Installed WASM is a ledger entry with a
   TTL. If the old code has expired, it cannot be reinstalled, and a rollback becomes a
   redeploy with new contract state. Extend the TTL of the old code entry before you
   upgrade if it is close to expiry.
3. **Check multisig.** `upgrade` fails while multisig is enabled. Confirm which path
   applies before you start.
4. **Decide whether to pause.** For a schema-changing release, pause with `All` before the
   upgrade and unpause only after smoke tests pass. Pausing does not undo anything, but it
   stops new writes while you verify.
5. **Check the migration plan.** List every migration step the release needs and mark which
   are reversible (see [Reversibility](#reversibility)).

## Procedure: upgrade

1. `propose_upgrade(admin, new_wasm_hash)`.
2. Confirm with `get_proposed_upgrade()` that the hash matches the build you intend to ship.
3. (Optional) `pause(admin, 0xFFFFFFFF)`.
4. `upgrade(admin, new_wasm_hash)`. This clears the proposal and increments the stored version.
5. If the release needs a storage migration, run `migrate(admin, target_version, batch_size)`
   repeatedly until it returns `is_completed: true`. Each call resumes from the saved
   migration state.
6. `unpause(admin, 0xFFFFFFFF)` after smoke tests pass.

## Procedure: roll back

Use this when the new WASM misbehaves and no state migration has been run, or when the
migration is safe to leave in place (see the reversibility table).

1. **Pause** with `0xFFFFFFFF` to stop writes while you work.
2. **Propose the previous WASM hash**: `propose_upgrade(admin, old_wasm_hash)`.
3. **Install it**: `upgrade(admin, old_wasm_hash)`. The stored version increments again.
   Expect `get_version()` to be higher than before the bad upgrade. This is intended.
4. **Do not run `migrate` backwards.** It will return `MigrationDowngradeRejected`. There is
   no downgrade path in the contract.
5. **Verify**: read a known creator profile, a tip, and the leaderboard through the old
   WASM. Confirm `get_version()` and `get_proposed_upgrade()` (should be `None`).
6. **Unpause** with `0xFFFFFFFF` once verified.
7. **Record the incident**: the failing hash, the rollback hash, the version before and
   after, and every migration step that ran.

If the old WASM has expired from the ledger, stop here. Do not attempt a rollback by
deploying a new contract id without a migration plan and a user-facing announcement, because
existing balances and profiles are keyed to the current contract address.

## Reversibility

Only the WASM swap is reversible. The storage side is one-way.

| Change | Reversible by rollback? | Why |
| --- | --- | --- |
| WASM code (logic, entrypoints) | Yes | `upgrade` replaces the code. Re-proposing and upgrading to the old hash restores it. |
| Stored version number | No (only moves forward) | `upgrade` always increments by one. |
| Storage migrations run with `migrate` | **No** | `migrate` refuses targets below the stored version. The migration framework has no reverse step. |
| Fields written by the new WASM | Partly | The old WASM keeps the data it can read. Data written in a field the old code does not know is ignored by it, not removed. Make sure the old code tolerates it before you roll back. |
| Pause flags and the circuit breaker status | Yes | Unpause, or call `reset_circuit_breaker` for a tripped breaker. |
| Pending upgrade proposal | Yes | `cancel_upgrade`. |

The current migration steps in `migrations.rs` are placeholders. Step 4 simulates batch
processing and does not transform stored data, and every other step completes immediately.
Treat that as a gap to fix before any real schema change. Until then, a migration run
changes only the stored version and the migration state, which is also one-way.

## Known gaps

- `upgrade` increments the stored version by one and does not compare it with the
  `CONTRACT_VERSION` constant in `lib.rs` (currently `4`). The two can drift. Compare them
  manually before each release.
- Migration steps are placeholders (see above). No migration in the repository has been
  verified against live data.
- Rollback is only as good as the old code's TTL. Renew it on a schedule, not just before
  an upgrade.

## Post-rollback checklist

- [ ] `get_proposed_upgrade()` returns `None`
- [ ] `get_version()` recorded and matches the incident notes
- [ ] Contract is unpaused and tips, withdrawals and registration succeed on testnet
- [ ] Incident notes filed with the hashes, versions and migration steps
- [ ] Follow-up issue opened for the root cause
