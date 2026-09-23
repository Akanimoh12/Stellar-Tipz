import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectMigrationSql } from './migration-safety.mjs';

test('detects destructive migration operations', () => {
  const findings = inspectMigrationSql(
    'ALTER TABLE "User" DROP COLUMN "legacy"; ALTER COLUMN "name" SET NOT NULL; ALTER COLUMN "age" TYPE bigint;',
    'migration.sql',
  );

  assert.deepEqual(findings.map((finding) => finding.kind), [
    'drop operation',
    'new NOT NULL constraint',
    'column type change',
  ]);
});

test('does not flag additive compatible SQL', () => {
  assert.deepEqual(
    inspectMigrationSql('ALTER TABLE "User" ADD COLUMN "bio" TEXT;', 'migration.sql'),
    [],
  );
});