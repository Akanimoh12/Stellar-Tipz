/**
 * Shared, per-module coverage policy.
 *
 * Thresholds here are deliberately NOT uniform. The floor for each module is
 * derived from the coverage actually measured on the default branch, minus a
 * small tolerance, so the ratchet starts from a truthful baseline instead of an
 * aspirational number that would fail on the first run.
 *
 * Tiering rationale:
 *   critical  - money movement, auth, and authorization boundaries. A defect
 *               here is a loss of funds or an account takeover, so these get
 *               the tightest floor and the strictest critical-path reporting.
 *   financial - moves or reconciles value but is not directly reachable by an
 *               attacker (subscriptions, credit, tips accounting).
 *   standard  - ordinary application logic with no direct security or money
 *               consequence.
 *   excluded  - entrypoints, wiring, and generated code that have no meaningful
 *               unit-test surface (server bootstrap, prisma client, types).
 *
 * To raise a floor, add tests first. The ratchet will then lock in the higher
 * number automatically; never edit a floor downward to make a build pass.
 */

/** Tolerance subtracted from the measured baseline when seeding a floor. */
const SEED_TOLERANCE = 2;

export const TIERS = {
  critical: { id: 'critical', description: 'Money movement, auth, authorization' },
  financial: { id: 'financial', description: 'Value accounting and recurring billing' },
  standard: { id: 'standard', description: 'Ordinary application logic' },
  excluded: { id: 'excluded', description: 'Entrypoints, wiring, generated code' },
};

/**
 * Backend module policy.
 * `floor` is the enforced minimum line coverage. `baseline` is the measured
 * value the floor was derived from and is what the ratchet compares against.
 */
export const backendPolicy = {
  component: 'backend',
  dir: 'backend',
  // Baselines are measured in CI, where the Postgres and Redis service
  // containers let the database-backed integration tests run. Measuring the
  // backend without that infrastructure (279 of 705 tests fail) yields a much
  // lower, non-comparable number, so CI is the source of truth for the ratchet.
  measuredAt: '181aaa2 (CI, with Postgres/Redis)',
  // Percentage points of slack allowed when comparing against the recorded
  // baseline. With the database-backed tests running the suite is large and has
  // flaky tests (worker timeouts, shared state), so coverage moves between runs.
  // Floors sit a further ~1.5pt below the ratchet threshold as a hard backstop.
  tolerance: 2.5,
  globalFloor: 58,
  modules: [
    {
      name: 'withdrawals',
      tier: 'critical',
      floor: 79,
      baseline: 83.44,
      rationale: 'Payout execution. A defect can send funds to the wrong destination.',
    },
    {
      name: 'refunds',
      tier: 'critical',
      floor: 54,
      baseline: 57.95,
      rationale: 'Returns funds to the payer. Untested branches risk double refunds.',
    },
    {
      name: 'auth',
      tier: 'critical',
      floor: 10,
      baseline: 14.7,
      rationale: 'Challenge/verify and token issuance. An untested branch is a bypass.',
      // Still the weakest critical module; keep the floor deliberately low and
      // track raising it as follow-up work rather than pretending it is covered.
      knownGap: true,
    },
    {
      name: 'admin',
      tier: 'critical',
      floor: 8,
      baseline: 12.9,
      rationale: 'Privileged operations. Authorization gaps are the highest-severity risk.',
      knownGap: true,
    },
    {
      name: 'subscriptions',
      tier: 'financial',
      floor: 88,
      baseline: 92.57,
      rationale: 'Recurring billing state machine; incorrect transitions charge users.',
    },
    {
      name: 'credit',
      tier: 'financial',
      floor: 49,
      baseline: 53.46,
      rationale: 'Credit scoring and redemption affects payouts.',
    },
    {
      name: 'tips',
      tier: 'financial',
      floor: 80,
      baseline: 83.94,
      rationale: 'Core tip settlement path.',
    },
    {
      name: 'ipfs',
      tier: 'financial',
      floor: 62,
      baseline: 66.67,
      rationale: 'Content-addressed receipt storage; integrity matters for disputes.',
    },
    { name: 'webhooks', tier: 'standard', floor: 65, baseline: 69.55, rationale: 'Outbound event delivery.' },
    { name: 'notifications', tier: 'standard', floor: 54, baseline: 58.68, rationale: 'User-facing delivery.' },
    { name: 'analytics', tier: 'standard', floor: 46, baseline: 50.59, rationale: 'Reporting; not on a money path.' },
    { name: 'goals', tier: 'standard', floor: 47, baseline: 51.16, rationale: 'Creator goal tracking.' },
    { name: 'profiles', tier: 'standard', floor: 13, baseline: 17.29, rationale: 'Public metadata CRUD.' },
    { name: 'x', tier: 'standard', floor: 53, baseline: 57.03, rationale: 'Social graph edges.' },
    { name: 'og', tier: 'standard', floor: 58, baseline: 62.5, rationale: 'Static social image rendering.' },
    { name: 'streaks', tier: 'standard', floor: 75, baseline: 79.37, rationale: 'Gamification counters.' },
    { name: 'leaderboard', tier: 'standard', floor: 77, baseline: 81.09, rationale: 'Ranking display.' },
    { name: 'stats', tier: 'standard', floor: 86, baseline: 90.16, rationale: 'Aggregate counters.' },
    { name: 'discovery', tier: 'standard', floor: 74, baseline: 78.77, rationale: 'Content discovery queries.' },
    { name: 'search', tier: 'standard', floor: 86, baseline: 90.6, rationale: 'Search indexing and querying.' },
    { name: 'realtime', tier: 'standard', floor: 83, baseline: 87.83, rationale: 'Socket.IO gateway and event fan-out.' },
    { name: 'jobs', tier: 'standard', floor: 70, baseline: 74.92, rationale: 'Background job orchestration.' },
    { name: 'indexer', tier: 'standard', floor: 82, baseline: 86.79, rationale: 'Chain event ingestion.' },
    { name: 'common', tier: 'standard', floor: 76, baseline: 80.63, rationale: 'Shared utilities and middleware helpers.' },
    { name: 'db', tier: 'standard', floor: 82, baseline: 86.67, rationale: 'Prisma client lifecycle.' },
    { name: 'config', tier: 'standard', floor: 93, baseline: 97.4, rationale: 'Env parsing; already near-complete.' },
  ],
  excluded: [
    { pattern: 'src/server.ts', reason: 'Process entrypoint; exercised by integration tests, not unit tests.' },
    { pattern: 'prisma/seed.ts', reason: 'One-off seeding script, not shipped code.' },
    { pattern: 'src/types/**', reason: 'Type-only declarations emit no runtime code.' },
    { pattern: 'src/docs/**', reason: 'Static OpenAPI document.' },
  ],
};

/**
 * Frontend policy, grouped by top-level source directory.
 */
export const frontendPolicy = {
  component: 'frontend',
  dir: 'frontend-scaffold',
  measuredAt: '9f1369f',
  // The frontend suite is the flakier of the two (browser-mode Storybook tests
  // and worker timeouts), so it gets a slightly wider tolerance band.
  tolerance: 1.5,
  globalFloor: 55,
  modules: [
    {
      name: 'services',
      tier: 'critical',
      floor: 74,
      baseline: 76.89,
      rationale: 'Wallet, Stellar RPC, and transaction-signing clients. Signing bugs lose funds.',
    },
    {
      name: 'store',
      tier: 'critical',
      floor: 72,
      baseline: 74.48,
      rationale: 'Holds public key and session state consumed by every write path.',
    },
    {
      name: 'helpers',
      tier: 'financial',
      floor: 52,
      baseline: 54.86,
      rationale: 'Stroop/XLM conversion and encryption helpers. Rounding errors misprice tips.',
    },
    {
      name: 'hooks',
      tier: 'financial',
      floor: 39,
      baseline: 41.8,
      rationale: 'Transaction, tip, and balance orchestration hooks.',
    },
    { name: 'features', tier: 'standard', floor: 58, baseline: 60.64, rationale: 'Page and panel composition.' },
    { name: 'components', tier: 'standard', floor: 62, baseline: 64.28, rationale: 'Reusable presentational and shared UI.' },
    { name: 'i18n', tier: 'standard', floor: 89, baseline: 91.04, rationale: 'Translation catalogues.' },
    { name: 'types', tier: 'excluded', floor: 0, baseline: 16.67, rationale: 'Type-only declarations.' },
  ],
  excluded: [
    { pattern: 'src/test/**', reason: 'Test harness itself.' },
    { pattern: '**/*.stories.tsx', reason: 'Storybook stories are not application code.' },
    { pattern: 'src/main.tsx', reason: 'Browser entrypoint.' },
  ],
};

/**
 * Globs whose uncovered lines are called out explicitly in the PR summary.
 * Kept in sync with the `critical` tier above.
 */
export const criticalPaths = {
  backend: [
    'src/modules/withdrawals/**',
    'src/modules/refunds/**',
    'src/modules/auth/**',
    'src/modules/admin/**',
    'src/modules/subscriptions/**',
    'src/modules/credit/**',
  ],
  frontend: ['src/services/**', 'src/store/**', 'src/helpers/format.ts', 'src/helpers/encryption.ts'],
};

export const policies = { backend: backendPolicy, frontend: frontendPolicy };

/**
 * Declaration-only files. V8 instruments the emitted JavaScript, so files whose
 * contents are erased at compile time (interfaces, type aliases) can register as
 * 0% covered and produce misleading line numbers. They are excluded from the
 * critical-path *report* only; module percentages are left untouched so the
 * measured baseline stays valid.
 */
export const declarationFilePatterns = [/\.d\.ts$/, /\.types\.ts$/, /\/types\.ts$/];

