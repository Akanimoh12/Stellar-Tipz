import { describe, it, expect } from 'vitest';
import {
  CORE_TABLES,
  checkRowCounts,
  checkSchemaVersion,
  runSpotChecks,
  formatRtoReport,
  combine,
} from './backup-verify.lib.js';

function fullCounts(n: number): Record<string, number> {
  return Object.fromEntries(CORE_TABLES.map((t) => [t, n]));
}

describe('checkRowCounts', () => {
  it('passes when every core table is present and non-empty', () => {
    const r = checkRowCounts({ restored: fullCounts(10), requireNonEmpty: true });
    expect(r.ok).toBe(true);
    expect(r.failures).toEqual([]);
  });

  it('fails on a missing table', () => {
    const restored = fullCounts(10);
    delete restored.Tip;
    const r = checkRowCounts({ restored });
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => f.includes('"Tip" is missing'))).toBe(true);
  });

  it('fails on an empty table when requireNonEmpty', () => {
    const restored = { ...fullCounts(10), EventLog: 0 };
    const r = checkRowCounts({ restored, requireNonEmpty: true });
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => f.includes('"EventLog" is empty'))).toBe(true);
  });

  it('fails when a table drops more than the tolerance vs baseline', () => {
    const r = checkRowCounts({
      restored: { ...fullCounts(100), Tip: 50 },
      baseline: fullCounts(100),
      maxShrinkFraction: 0.2,
    });
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => f.includes('"Tip" dropped'))).toBe(true);
  });

  it('allows a small drop within tolerance but warns', () => {
    const r = checkRowCounts({
      restored: { ...fullCounts(100), Tip: 95 },
      baseline: fullCounts(100),
      maxShrinkFraction: 0.2,
    });
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.includes('"Tip" shrank'))).toBe(true);
  });
});

describe('checkSchemaVersion', () => {
  const dirs = ['20260101000000_init', '20260828000000_add_audit_indexes_concurrency'];

  it('passes when the dump is at the newest local migration', () => {
    const r = checkSchemaVersion('20260828000000_add_audit_indexes_concurrency', dirs);
    expect(r.ok).toBe(true);
  });

  it('fails when the restored db has no _prisma_migrations rows', () => {
    const r = checkSchemaVersion(null, dirs);
    expect(r.ok).toBe(false);
  });

  it('warns (not fails) when the dump predates a migration', () => {
    const r = checkSchemaVersion('20260101000000_init', dirs);
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.includes('predates a migration'))).toBe(true);
  });

  it('fails when the dump is somehow ahead of the repo', () => {
    const r = checkSchemaVersion('20270101000000_from_the_future', dirs);
    expect(r.ok).toBe(false);
  });
});

describe('runSpotChecks', () => {
  const clean = {
    eventLogMaxLedger: 1_000,
    cursorLedger: 1_000,
    orphanTipSenders: 0,
    orphanRefunds: 0,
    largestEventLedgerGap: 3,
  };

  it('passes a clean dataset', () => {
    expect(runSpotChecks(clean).ok).toBe(true);
  });

  it('fails on an orphan refund', () => {
    expect(runSpotChecks({ ...clean, orphanRefunds: 2 }).ok).toBe(false);
  });

  it('fails when the cursor is far behind EventLog', () => {
    expect(runSpotChecks({ ...clean, cursorLedger: 1, eventLogMaxLedger: 5_000 }).ok).toBe(false);
  });

  it('fails on a large ledger gap', () => {
    expect(runSpotChecks({ ...clean, largestEventLedgerGap: 999, maxAllowedLedgerGap: 500 }).ok).toBe(false);
  });

  it('only warns on orphan tip senders (external senders are legitimate)', () => {
    const r = runSpotChecks({ ...clean, orphanTipSenders: 3 });
    expect(r.ok).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe('formatRtoReport', () => {
  it('emits the machine-readable rto lines and totals', () => {
    const out = formatRtoReport({
      dumpLabel: 'tipz-prod-x.dump',
      dumpSizeBytes: 5 * 1024 * 1024,
      fetchMs: 1_000,
      restoreMs: 30_000,
      validateMs: 2_000,
    });
    expect(out).toContain('rto_restore_ms=30000');
    expect(out).toContain('rto_total_ms=33000');
    expect(out).toContain('5.0 MiB');
  });
});

describe('combine', () => {
  it('is ok only when every part is ok and merges messages', () => {
    const a = { ok: true, failures: [], warnings: ['w1'] };
    const b = { ok: false, failures: ['f1'], warnings: [] };
    const c = combine(a, b);
    expect(c.ok).toBe(false);
    expect(c.failures).toEqual(['f1']);
    expect(c.warnings).toEqual(['w1']);
  });
});
