/**
 * Stellar Tipz — realistic, deterministic database seed.
 *
 * Goals (issue #1381):
 *  - Configurable volume, from a tiny dev set to a performance-testing scale.
 *  - Realistic distributions: varied credit-score signals, skewed tip volumes,
 *    streaks, and a full spread of subscription / goal / withdrawal states.
 *  - Edge cases: zero-tip creators, maximum-length fields, and expired items
 *    (goals, subscriptions, refresh tokens, auth challenges).
 *  - Deterministic: the same `SEED` value always produces the same database,
 *    so "it fails with the seeded data" is reproducible by another developer.
 *
 * Determinism notes
 * -----------------
 *  - All randomness comes from a single seeded PRNG (mulberry32). No `Math.random`,
 *    no `faker`, no `cuid()` — every primary key and value is derived from `SEED`.
 *  - Time is anchored to a fixed `ANCHOR` instant (not `Date.now()`), so even
 *    timestamps are identical on every run for a given seed.
 *
 * Usage
 * -----
 *   npm run db:seed                       # default: scale=small, SEED=stellar-tipz
 *   SEED_SCALE=medium npm run db:seed     # more volume
 *   SEED_SCALE=large npm run db:seed      # performance testing
 *   SEED=my-repro-case npm run db:seed    # a different, still-deterministic world
 *   SEED_USERS=500 npm run db:seed        # override the user count directly
 *   SEED_CLEAN=false npm run db:seed      # append instead of wiping first
 *   SEED_DRY_RUN=true npm run db:seed     # generate + verify integrity, no DB needed
 *
 * See backend/README.md ("Seeding the database") for the full reference.
 */

import { PrismaClient, Prisma } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic PRNG
// ─────────────────────────────────────────────────────────────────────────────

/** Hashes a string to a 32-bit seed (xmur3). */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** mulberry32 — a small, fast, deterministic PRNG in [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Rng {
  private next: () => number;
  constructor(seedString: string) {
    this.next = mulberry32(xmur3(seedString)());
  }
  /** Float in [0, 1). */
  float(): number {
    return this.next();
  }
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  /** True with probability `p`. */
  bool(p = 0.5): boolean {
    return this.next() < p;
  }
  /** Picks one element of `arr`. */
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  /** Picks one weighted element. `weights` need not sum to 1. */
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let r = this.next() * total;
    for (const [value, w] of entries) {
      r -= w;
      if (r <= 0) return value;
    }
    return entries[entries.length - 1][0];
  }
  /**
   * Skewed sample in [0, max): raises a uniform to `pow` so most values are
   * small and a few are large (a Pareto-ish "80/20" distribution).
   */
  skewed(max: number, pow = 2.2): number {
    return Math.floor(Math.pow(this.next(), pow) * max);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

interface Scale {
  users: number;
  /** Fraction of users that are creators (receive tips). */
  creatorRatio: number;
  /** Average tips received per active creator (actual is skewed around this). */
  avgTipsPerCreator: number;
  subscriptions: number;
  analyticsDays: number;
  notificationsPerUser: number;
  leaderboardTopN: number;
}

const SCALES: Record<string, Scale> = {
  // Tiny set for everyday local UI work.
  small: {
    users: 25,
    creatorRatio: 0.5,
    avgTipsPerCreator: 10,
    subscriptions: 20,
    analyticsDays: 30,
    notificationsPerUser: 3,
    leaderboardTopN: 10,
  },
  // Enough variety to exercise lists, pagination, and leaderboards.
  medium: {
    users: 200,
    creatorRatio: 0.45,
    avgTipsPerCreator: 20,
    subscriptions: 150,
    analyticsDays: 90,
    notificationsPerUser: 5,
    leaderboardTopN: 25,
  },
  // Performance testing — tens of thousands of tips (#101, #118).
  large: {
    users: 2_000,
    creatorRatio: 0.4,
    avgTipsPerCreator: 25,
    subscriptions: 1_500,
    analyticsDays: 180,
    notificationsPerUser: 6,
    leaderboardTopN: 50,
  },
  // Stress scale — hundreds of thousands of tips.
  xl: {
    users: 10_000,
    creatorRatio: 0.4,
    avgTipsPerCreator: 30,
    subscriptions: 8_000,
    analyticsDays: 365,
    notificationsPerUser: 8,
    leaderboardTopN: 100,
  },
};

const SEED = process.env.SEED ?? 'stellar-tipz';
const SCALE_NAME = (process.env.SEED_SCALE ?? 'small').toLowerCase();
const CLEAN = (process.env.SEED_CLEAN ?? 'true').toLowerCase() !== 'false';
/**
 * When true, no database is touched: generation runs against an in-memory
 * recorder and referential integrity is asserted. Handy for CI and for quickly
 * checking that a `SEED` value produces a valid dataset without Postgres.
 */
const DRY_RUN = (process.env.SEED_DRY_RUN ?? 'false').toLowerCase() === 'true';

const baseScale = SCALES[SCALE_NAME];
if (!baseScale) {
  const valid = Object.keys(SCALES).join(', ');
  throw new Error(`Unknown SEED_SCALE="${SCALE_NAME}". Valid values: ${valid}.`);
}

// Allow a direct override of the user count (other volumes scale from it).
const userOverride = process.env.SEED_USERS ? Number(process.env.SEED_USERS) : undefined;
if (userOverride !== undefined && (!Number.isFinite(userOverride) || userOverride < 4)) {
  throw new Error('SEED_USERS must be an integer >= 4.');
}
const scale: Scale = userOverride
  ? { ...baseScale, users: userOverride, subscriptions: Math.round(userOverride * 0.75) }
  : baseScale;

/**
 * A fixed instant that all relative timestamps hang off of. Using a constant
 * (rather than `new Date()`) keeps absolute dates identical across runs.
 */
const ANCHOR = new Date('2026-01-01T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

/** `n` days before ANCHOR (positive n = past). */
function daysBefore(n: number): Date {
  return new Date(ANCHOR.getTime() - n * DAY);
}
/** `n` days after ANCHOR (positive n = future). */
function daysAfter(n: number): Date {
  return new Date(ANCHOR.getTime() + n * DAY);
}

const CHUNK = 5_000;

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic value generators
// ─────────────────────────────────────────────────────────────────────────────

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const FIRST_NAMES = [
  'ava', 'noah', 'mia', 'liam', 'zoe', 'kai', 'luna', 'ezra', 'nova', 'finn',
  'iris', 'leo', 'maya', 'theo', 'ruby', 'omar', 'sofia', 'jude', 'cleo', 'milo',
  'yara', 'arjun', 'nia', 'hugo', 'priya', 'dax', 'anya', 'rex', 'elif', 'kofi',
];
const LAST_NAMES = [
  'stone', 'rivers', 'frost', 'vale', 'ocean', 'quill', 'march', 'hart', 'wren', 'ash',
  'blaze', 'crane', 'dune', 'elm', 'fox', 'gale', 'holt', 'ives', 'jax', 'knox',
];
const NICHES = [
  'pixel art', 'lo-fi beats', 'indie games', 'street photography', 'open source',
  'watercolor', 'synthwave', 'cooking', 'astronomy', 'poetry', 'woodworking',
  'climate tech', '3d modeling', 'chess streams', 'trail running',
];
const TIP_MESSAGES = [
  'Love your work! 🎉',
  'Keep it up 🙌',
  'This made my day',
  'Worth every stroop',
  'For the late-night streams ☕',
  'Thank you for the tutorial!',
  '',
  'gm ☀️',
  'Take my lumens 🚀',
  'Underrated creator fr',
];
const TOKENS = ['XLM', 'XLM', 'XLM', 'USDC', 'AQUA'] as const;
const NOTIF_TYPES = ['tip_received', 'tip_sent', 'goal_completed', 'subscription_charged', 'streak_milestone', 'withdrawal_completed'] as const;

/** A realistic-looking (not checksum-valid) Stellar public key: G + 55 base32 chars. */
function stellarAddress(rng: Rng): string {
  let s = 'G';
  for (let i = 0; i < 55; i++) s += BASE32[rng.int(0, BASE32.length - 1)];
  return s;
}

/** 46-char IPFS-style CID (bafy… style, deterministic). */
function cid(rng: Rng): string {
  let s = 'bafybei';
  const alpha = 'abcdefghijklmnopqrstuvwxyz234567';
  for (let i = 0; i < 39; i++) s += alpha[rng.int(0, alpha.length - 1)];
  return s;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/** Converts a human XLM amount to stroops (1 XLM = 10,000,000 stroops). */
function xlmToStroops(xlm: number): bigint {
  return BigInt(Math.round(xlm * 10_000_000));
}

// ─────────────────────────────────────────────────────────────────────────────
// Types for the in-memory plan (built fully before any DB write)
// ─────────────────────────────────────────────────────────────────────────────

interface PlannedUser {
  id: string;
  stellarAddress: string;
  username: string | null;
  displayName: string | null;
  bio: string | null;
  imageUrl: string | null;
  avatarCid: string | null;
  xHandle: string | null;
  role: string;
  scopes: string[];
  createdAt: Date;
  updatedAt: Date;
  // planning-only fields:
  isCreator: boolean;
  xFollowers: number | null;
  xEngagement: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cleaning
// ─────────────────────────────────────────────────────────────────────────────

async function clean(prisma: PrismaClient): Promise<void> {
  // Delete in FK-safe order (children before parents).
  await prisma.webhookDelivery.deleteMany();
  await prisma.refund.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.tip.deleteMany();
  await prisma.goal.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.leaderboardSnapshot.deleteMany();
  await prisma.streak.deleteMany();
  await prisma.withdrawal.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.authChallenge.deleteMany();
  await prisma.xAccount.deleteMany();
  await prisma.analyticsDaily.deleteMany();
  await prisma.deadLetterEvent.deleteMany();
  await prisma.indexerCursor.deleteMany();
  await prisma.user.deleteMany();
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory recorder (SEED_DRY_RUN) — stands in for PrismaClient, no DB needed
// ─────────────────────────────────────────────────────────────────────────────

type Store = Record<string, Record<string, unknown>[]>;

/**
 * Returns a Prisma-shaped client. In dry-run it records every createMany into an
 * in-memory `store` instead of writing to Postgres; otherwise it is a real client.
 */
function makeClient(): { client: PrismaClient; store: Store | null } {
  if (!DRY_RUN) return { client: new PrismaClient(), store: null };

  const store: Store = {};
  const modelHandler = (model: string) => ({
    createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
      (store[model] ??= []).push(...data);
      return { count: data.length };
    },
    deleteMany: async () => {
      const n = store[model]?.length ?? 0;
      store[model] = [];
      return { count: n };
    },
  });

  const client = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === '$disconnect') return async () => undefined;
        return modelHandler(prop);
      },
    },
  ) as unknown as PrismaClient;

  return { client, store };
}

/** Asserts that `cond` holds, throwing a labelled error otherwise. */
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Integrity check failed: ${msg}`);
}

/** Verifies PK uniqueness, FK integrity, and edge-case presence on the dry-run store. */
function verifyIntegrity(store: Store): void {
  const ids = (model: string, key = 'id') =>
    new Set((store[model] ?? []).map((r) => r[key] as string));
  const rows = (model: string) => store[model] ?? [];
  const uniqueCount = (model: string, key = 'id') => ids(model, key).size;

  // PK / unique-column uniqueness.
  for (const [model, key] of [
    ['user', 'id'], ['user', 'stellarAddress'], ['user', 'username'],
    ['tip', 'id'], ['tip', 'txHash'], ['subscription', 'id'], ['goal', 'id'],
    ['refund', 'id'], ['refund', 'tipId'], ['streak', 'id'], ['streak', 'userId'],
    ['xAccount', 'handle'], ['analyticsDaily', 'date'], ['leaderboardSnapshot', 'id'],
    ['withdrawal', 'id'], ['notification', 'id'], ['webhookDelivery', 'id'],
  ] as const) {
    const withKey = rows(model).filter((r) => r[key] != null);
    assert(
      uniqueCount(model, key) === withKey.length,
      `${model}.${key} not unique (${withKey.length - uniqueCount(model, key)} dup(s))`,
    );
  }

  // Foreign-key integrity.
  const userIds = ids('user');
  const tipIds = ids('tip');
  const subIds = ids('subscription');
  const fkChecks: [string, string, Set<string>, boolean][] = [
    ['tip', 'senderId', userIds, true],
    ['tip', 'recipientId', userIds, true],
    ['subscription', 'tipperId', userIds, false],
    ['subscription', 'creatorId', userIds, false],
    ['goal', 'userId', userIds, false],
    ['streak', 'userId', userIds, false],
    ['withdrawal', 'userId', userIds, false],
    ['apiKey', 'createdById', userIds, false],
    ['refreshToken', 'userId', userIds, false],
    ['notification', 'userId', userIds, false],
    ['leaderboardSnapshot', 'userId', userIds, false],
    ['refund', 'tipId', tipIds, false],
    ['webhookDelivery', 'subscriptionId', subIds, false],
  ];
  for (const [model, key, pool, nullable] of fkChecks) {
    for (const r of rows(model)) {
      const v = r[key] as string | null | undefined;
      if (v == null) {
        assert(nullable, `${model}.${key} is null but not nullable`);
        continue;
      }
      assert(pool.has(v), `${model}.${key}="${v}" references a missing row`);
    }
  }

  // Edge-case presence.
  const tipRecipients = new Set(rows('tip').map((r) => r.recipientId));
  assert(userIds.has('usr_zero_tip'), 'zero-tip creator missing');
  assert(!tipRecipients.has('usr_zero_tip'), 'zero-tip creator unexpectedly received tips');
  const maxUser = rows('user').find((r) => r.id === 'usr_maxlen');
  assert(!!maxUser && (maxUser.bio as string).length > 1000, 'max-length user bio missing');
  assert(rows('goal').some((g) => g.status === 'EXPIRED'), 'no EXPIRED goal');
  assert(rows('subscription').some((s) => s.status === 'EXPIRED'), 'no EXPIRED subscription');
  assert(
    rows('refreshToken').some((t) => (t.expiresAt as Date) < ANCHOR),
    'no expired refresh token',
  );
  assert(
    rows('authChallenge').some((c) => (c.expiresAt as Date) < ANCHOR),
    'no expired auth challenge',
  );
  assert(
    rows('tip').some((t) => t.fromAddress === t.toAddress),
    'no self-tip for anti-gaming coverage',
  );

  console.log('\nDry-run integrity checks passed ✓');
  console.log(
    `  tables=${Object.keys(store).length}  ` +
      `rows=${Object.values(store).reduce((s, r) => s + r.length, 0)}`,
  );
}

/** Inserts `rows` with createMany in chunks and returns the total inserted. */
async function createManyChunked<T>(
  label: string,
  rows: T[],
  insert: (batch: T[]) => Promise<{ count: number }>,
): Promise<number> {
  let total = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    const { count } = await insert(batch);
    total += count;
  }
  if (rows.length > 0) console.log(`  • ${label}: ${total}`);
  return total;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Safety: never silently wipe a production database.
  if (CLEAN && process.env.NODE_ENV === 'production' && process.env.SEED_ALLOW_PRODUCTION !== 'true') {
    throw new Error(
      'Refusing to seed (and wipe) with NODE_ENV=production. Set SEED_ALLOW_PRODUCTION=true to override.',
    );
  }

  const rng = new Rng(SEED);
  const { client: prisma, store } = makeClient();

  console.log('Seeding Stellar Tipz' + (DRY_RUN ? ' (dry run — no database writes)' : ''));
  console.log(`  seed="${SEED}"  scale="${SCALE_NAME}"  users=${scale.users}  clean=${CLEAN}`);

  try {
    if (CLEAN) {
      console.log('Cleaning existing data…');
      await clean(prisma);
    }

    // ── 1. Users ────────────────────────────────────────────────────────────
    const users: PlannedUser[] = [];
    const usedUsernames = new Set<string>();

    for (let i = 0; i < scale.users; i++) {
      const first = rng.pick(FIRST_NAMES);
      const last = rng.pick(LAST_NAMES);
      let username = `${first}_${last}`;
      while (usedUsernames.has(username)) username = `${first}_${last}${rng.int(1, 9999)}`;
      usedUsernames.add(username);

      const isCreator = rng.float() < scale.creatorRatio;
      const hasX = rng.bool(isCreator ? 0.8 : 0.4);
      // Follower counts follow a heavy skew: most small, a few huge.
      const xFollowers = hasX ? rng.skewed(250_000, 2.6) + rng.int(0, 500) : null;
      const xEngagement = hasX ? Math.round(rng.float() * 0.08 * 1000) / 1000 : null;

      const createdAt = daysBefore(rng.int(1, scale.analyticsDays + 120));

      users.push({
        id: `usr_${pad(i, 7)}`,
        stellarAddress: stellarAddress(rng),
        username,
        displayName: `${first[0].toUpperCase()}${first.slice(1)} ${last[0].toUpperCase()}${last.slice(1)}`,
        bio: rng.bool(0.75) ? `Creator sharing ${rng.pick(NICHES)}. Tips keep the lights on. ⚡` : null,
        imageUrl: rng.bool(0.6) ? `https://i.pravatar.cc/240?u=${username}` : null,
        avatarCid: rng.bool(0.4) ? cid(rng) : null,
        xHandle: hasX ? `${username}` : null,
        role: 'user',
        scopes: [],
        createdAt,
        updatedAt: createdAt,
        isCreator,
        xFollowers,
        xEngagement,
      });
    }

    // ── Edge-case users (deterministic, always present) ─────────────────────
    const admin: PlannedUser = {
      id: 'usr_admin',
      stellarAddress: stellarAddress(rng),
      username: 'tipz_admin',
      displayName: 'Tipz Admin',
      bio: 'Platform operator account.',
      imageUrl: null,
      avatarCid: null,
      xHandle: null,
      role: 'admin',
      scopes: ['admin', 'read', 'write'],
      createdAt: daysBefore(scale.analyticsDays + 200),
      updatedAt: daysBefore(scale.analyticsDays + 200),
      isCreator: false,
      xFollowers: null,
      xEngagement: null,
    };

    // Zero-tip creator: a creator who never receives (or sends) a tip.
    const zeroTipCreator: PlannedUser = {
      id: 'usr_zero_tip',
      stellarAddress: stellarAddress(rng),
      username: 'brand_new_creator',
      displayName: 'Brand New Creator',
      bio: 'Just joined — no tips yet!',
      imageUrl: null,
      avatarCid: null,
      xHandle: 'brand_new_creator',
      role: 'user',
      scopes: [],
      createdAt: daysBefore(1),
      updatedAt: daysBefore(1),
      isCreator: true, // a creator, but intentionally excluded from tip assignment
      xFollowers: 3,
      xEngagement: 0.0,
    };

    // Maximum-length fields: long username, display name, bio.
    const maxLenUser: PlannedUser = {
      id: 'usr_maxlen',
      stellarAddress: stellarAddress(rng),
      username: 'max'.padEnd(64, 'x'), // 64-char username
      displayName: 'Maximilian '.repeat(10).slice(0, 255).trim(), // long display name
      bio: ('This is an intentionally very long biography used to verify that the UI '
        + 'and database handle maximum-length text fields gracefully without truncation bugs. ')
        .repeat(8)
        .slice(0, 2000),
      imageUrl: `https://example.com/${'a'.repeat(200)}.png`,
      avatarCid: cid(rng),
      xHandle: 'maximilian_the_longest_handle_possible',
      role: 'user',
      scopes: [],
      createdAt: daysBefore(60),
      updatedAt: daysBefore(2),
      isCreator: true,
      xFollowers: 50_000,
      xEngagement: 0.042,
    };

    // High-reputation "whale" creator to anchor the top of the leaderboard.
    const whale: PlannedUser = {
      id: 'usr_whale',
      stellarAddress: stellarAddress(rng),
      username: 'stellar_superstar',
      displayName: 'Stellar Superstar',
      bio: 'Top creator on Stellar Tipz. ⭐',
      imageUrl: 'https://i.pravatar.cc/240?u=stellar_superstar',
      avatarCid: cid(rng),
      xHandle: 'stellar_superstar',
      role: 'user',
      scopes: [],
      createdAt: daysBefore(scale.analyticsDays + 100),
      updatedAt: daysBefore(1),
      isCreator: true,
      xFollowers: 980_000,
      xEngagement: 0.071,
    };

    const edgeUsers = [admin, zeroTipCreator, maxLenUser, whale];
    users.push(...edgeUsers);

    await createManyChunked('users', users.map(toUserRow), (b) =>
      prisma.user.createMany({ data: b, skipDuplicates: true }),
    );

    // ── 2. XAccounts (drive the "social" part of the credit score) ──────────
    const xAccounts = users
      .filter((u) => u.xHandle && u.xFollowers !== null)
      .map((u) => ({
        id: `xac_${u.id.slice(4)}`,
        handle: u.xHandle!,
        followers: u.xFollowers!,
        engagement: u.xEngagement,
        fetchedAt: daysBefore(rng.int(0, 7)),
      }));
    await createManyChunked('x_accounts', xAccounts, (b) =>
      prisma.xAccount.createMany({ data: b, skipDuplicates: true }),
    );

    // ── 3. Tips (skewed across creators; a few whales get most volume) ──────
    const creators = users.filter((u) => u.isCreator && u.id !== zeroTipCreator.id);
    const senders = users.filter((u) => u.id !== admin.id);

    // Assign each creator a "popularity" weight (whale is heaviest).
    const creatorWeights = creators.map((c) => {
      if (c.id === whale.id) return 40;
      if (c.id === maxLenUser.id) return 8;
      return 1 + rng.skewed(12, 1.8); // most creators light, a few heavy
    });

    const tips: Prisma.TipCreateManyInput[] = [];
    let tipSeq = 0;
    let ledger = 50_000_000;

    const pushTip = (
      from: PlannedUser,
      to: PlannedUser,
      opts: Partial<Prisma.TipCreateManyInput> = {},
    ) => {
      const anon = opts.isAnonymous ?? rng.bool(0.15);
      const amountXlm = rng.weighted<number>([
        [rng.float() * 2 + 0.1, 50], // micro tips
        [rng.float() * 20 + 2, 35], // regular
        [rng.float() * 200 + 20, 12], // generous
        [rng.float() * 2000 + 200, 3], // whale tips
      ]);
      const status = rng.weighted<'CONFIRMED' | 'PENDING' | 'FAILED'>([
        ['CONFIRMED', 90],
        ['PENDING', 6],
        ['FAILED', 4],
      ]);
      const createdAt = daysBefore(rng.int(0, scale.analyticsDays));
      tips.push({
        id: `tip_${pad(tipSeq++, 8)}`,
        txHash: `tx_${pad(tipSeq, 8)}_${stellarAddress(rng).slice(1, 9).toLowerCase()}`,
        ledger: ledger++,
        fromAddress: from.stellarAddress,
        toAddress: to.stellarAddress,
        amountStroops: xlmToStroops(amountXlm),
        networkFee: BigInt(rng.int(100, 100_000)),
        tokenCode: rng.pick(TOKENS),
        isAnonymous: anon,
        status,
        message: rng.bool(0.5) ? rng.pick(TIP_MESSAGES) : null,
        createdAt,
        senderId: anon ? null : from.id,
        recipientId: to.id,
        ...opts,
      });
    };

    for (let ci = 0; ci < creators.length; ci++) {
      const creator = creators[ci];
      const weight = creatorWeights[ci];
      const base = scale.avgTipsPerCreator;
      const half = Math.floor(base / 2);
      const count = Math.max(0, Math.round((weight / 10) * base) + rng.int(-half, half));
      for (let t = 0; t < count; t++) {
        let sender = rng.pick(senders);
        // Avoid self-tips in the normal path (we add a few explicitly below).
        let guard = 0;
        while (sender.id === creator.id && guard++ < 5) sender = rng.pick(senders);
        pushTip(sender, creator);
      }
    }

    // Edge case: maximum-length tip message + large amount.
    pushTip(whale, maxLenUser, {
      message: ('A truly enormous thank-you note that stretches the message column to its limits. ')
        .repeat(6)
        .slice(0, 500),
      amountStroops: xlmToStroops(5000),
      isAnonymous: false,
      status: 'CONFIRMED',
    });

    // Edge case: anti-gaming — a cluster of self-tips and circular wash tips.
    const washA = creators[rng.int(0, creators.length - 1)];
    const washB = creators[rng.int(0, creators.length - 1)];
    for (let k = 0; k < 6; k++) {
      pushTip(washA, washA, { isAnonymous: false, status: 'CONFIRMED' }); // self-tips
      pushTip(washA, washB, { isAnonymous: false, status: 'CONFIRMED' }); // circular
      pushTip(washB, washA, { isAnonymous: false, status: 'CONFIRMED' });
    }

    const tipCount = await createManyChunked('tips', tips, (b) =>
      prisma.tip.createMany({ data: b, skipDuplicates: true }),
    );

    // ── 4. Refunds for a slice of FAILED/CONFIRMED tips ─────────────────────
    const refundable = tips.filter(() => rng.bool(0.03));
    const refunds: Prisma.RefundCreateManyInput[] = refundable.map((t, i) => ({
      id: `rfd_${pad(i, 7)}`,
      tipId: t.id as string,
      amount: t.amountStroops as bigint,
      reason: rng.pick(['duplicate charge', 'wrong recipient', 'user requested', 'failed delivery']),
      status: rng.weighted([
        ['completed', 6],
        ['pending', 3],
        ['rejected', 1],
      ]),
      txHash: rng.bool(0.6) ? `tx_rfd_${pad(i, 7)}` : null,
      createdAt: daysBefore(rng.int(0, scale.analyticsDays)),
    }));
    await createManyChunked('refunds', refunds, (b) =>
      prisma.refund.createMany({ data: b, skipDuplicates: true }),
    );

    // ── 5. Streaks (one per user; varied current/longest, some expired) ─────
    const streaks: Prisma.StreakCreateManyInput[] = users
      .filter((u) => u.id !== admin.id)
      .map((u, i) => {
        // Zero-tip creator has an empty streak.
        if (u.id === zeroTipCreator.id) {
          return {
            id: `stk_${pad(i, 7)}`,
            userId: u.id,
            currentStreak: 0,
            longestStreak: 0,
            lastTipDate: null,
            createdAt: u.createdAt,
            updatedAt: u.createdAt,
          };
        }
        const longest = rng.skewed(365, 1.9) + rng.int(0, 3);
        // Current streak is active only if the last tip was recent.
        const daysSinceLast = rng.weighted<number>([
          [0, 30], // tipped today → active
          [1, 25],
          [rng.int(2, 6), 25],
          [rng.int(8, 60), 20], // lapsed → current streak reset
        ]);
        const current = daysSinceLast <= 1 ? Math.min(longest, rng.int(1, longest || 1)) : 0;
        return {
          id: `stk_${pad(i, 7)}`,
          userId: u.id,
          currentStreak: current,
          longestStreak: Math.max(longest, current),
          lastTipDate: daysBefore(daysSinceLast),
          createdAt: u.createdAt,
          updatedAt: daysBefore(daysSinceLast),
        };
      });
    await createManyChunked('streaks', streaks, (b) =>
      prisma.streak.createMany({ data: b, skipDuplicates: true }),
    );

    // ── 6. Goals (every state incl. EXPIRED and COMPLETED) ──────────────────
    const goals: Prisma.GoalCreateManyInput[] = [];
    let goalSeq = 0;
    for (const creator of creators) {
      const n = rng.int(0, 3);
      for (let g = 0; g < n; g++) {
        const target = xlmToStroops(rng.weighted([[100, 4], [500, 3], [2500, 2], [10_000, 1]]));
        const status = rng.weighted<'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED'>([
          ['ACTIVE', 50],
          ['COMPLETED', 25],
          ['CANCELLED', 10],
          ['EXPIRED', 15],
        ]);
        const raised =
          status === 'COMPLETED'
            ? target + xlmToStroops(rng.int(0, 50))
            : BigInt(Math.floor(Number(target) * rng.float()));
        const deadline =
          status === 'EXPIRED'
            ? daysBefore(rng.int(1, 60)) // deadline already passed
            : status === 'ACTIVE'
              ? daysAfter(rng.int(5, 90))
              : rng.bool(0.5)
                ? daysAfter(rng.int(1, 60))
                : null;
        goals.push({
          id: `goal_${pad(goalSeq++, 6)}`,
          userId: creator.id,
          title: `${rng.pick(['New mic', 'Studio upgrade', 'Travel fund', 'Charity stream', 'Server costs', 'Art supplies'])} for ${rng.pick(NICHES)}`,
          targetStroops: target,
          raisedStroops: raised,
          deadline,
          status,
          createdAt: daysBefore(rng.int(10, scale.analyticsDays)),
          updatedAt: daysBefore(rng.int(0, 10)),
        });
      }
    }
    // Guaranteed coverage: one goal in every lifecycle state, regardless of
    // scale or seed, so edge cases are always represented.
    for (const status of ['ACTIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED'] as const) {
      goals.push({
        id: `goal_${pad(goalSeq++, 6)}`,
        userId: whale.id,
        title: `Guaranteed ${status.toLowerCase()} goal`,
        targetStroops: xlmToStroops(1000),
        raisedStroops: status === 'COMPLETED' ? xlmToStroops(1000) : xlmToStroops(rng.int(0, 999)),
        deadline:
          status === 'EXPIRED' ? daysBefore(rng.int(1, 30)) : status === 'ACTIVE' ? daysAfter(30) : null,
        status,
        createdAt: daysBefore(rng.int(31, 120)),
        updatedAt: daysBefore(rng.int(0, 10)),
      });
    }

    // Edge case: max-length goal title.
    goals.push({
      id: `goal_${pad(goalSeq++, 6)}`,
      userId: whale.id,
      title: 'A very long and descriptive funding goal title '.repeat(6).slice(0, 255).trim(),
      targetStroops: xlmToStroops(1_000_000),
      raisedStroops: xlmToStroops(123_456),
      deadline: daysAfter(30),
      status: 'ACTIVE',
      createdAt: daysBefore(30),
      updatedAt: daysBefore(1),
    });
    await createManyChunked('goals', goals, (b) =>
      prisma.goal.createMany({ data: b, skipDuplicates: true }),
    );

    // ── 7. Subscriptions (full spread of states, incl. expired) ─────────────
    const tippers = users.filter((u) => u.id !== admin.id && u.id !== zeroTipCreator.id);
    const subs: Prisma.SubscriptionCreateManyInput[] = [];
    const subIds: string[] = [];
    for (let s = 0; s < scale.subscriptions; s++) {
      const tipper = rng.pick(tippers);
      let creator = rng.pick(creators);
      let guard = 0;
      while (creator.id === tipper.id && guard++ < 5) creator = rng.pick(creators);
      const status = rng.weighted<'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'EXPIRED'>([
        ['ACTIVE', 55],
        ['PAUSED', 15],
        ['CANCELLED', 15],
        ['EXPIRED', 15],
      ]);
      const interval = rng.pick(['DAILY', 'WEEKLY', 'MONTHLY'] as const);
      const nextChargeAt =
        status === 'ACTIVE'
          ? daysAfter(rng.int(1, 30))
          : status === 'EXPIRED'
            ? daysBefore(rng.int(1, 45)) // charge date in the past, never renewed
            : daysBefore(rng.int(0, 20));
      const id = `sub_${pad(s, 7)}`;
      subIds.push(id);
      subs.push({
        id,
        tipperId: tipper.id,
        creatorId: creator.id,
        amountStroops: xlmToStroops(rng.weighted([[1, 5], [5, 4], [25, 2], [100, 1]])),
        interval,
        nextChargeAt,
        status,
        createdAt: daysBefore(rng.int(5, scale.analyticsDays)),
        updatedAt: daysBefore(rng.int(0, 5)),
      });
    }
    // Guaranteed coverage: one subscription in every lifecycle state.
    for (const status of ['ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED'] as const) {
      const id = `sub_guar_${status.toLowerCase()}`;
      subIds.push(id);
      subs.push({
        id,
        tipperId: whale.id,
        creatorId: maxLenUser.id,
        amountStroops: xlmToStroops(5),
        interval: 'MONTHLY',
        nextChargeAt: status === 'ACTIVE' ? daysAfter(15) : daysBefore(rng.int(1, 30)),
        status,
        createdAt: daysBefore(rng.int(31, 120)),
        updatedAt: daysBefore(rng.int(0, 10)),
      });
    }

    await createManyChunked('subscriptions', subs, (b) =>
      prisma.subscription.createMany({ data: b, skipDuplicates: true }),
    );

    // ── 8. WebhookDeliveries for a subset of subscriptions ──────────────────
    const deliveries: Prisma.WebhookDeliveryCreateManyInput[] = [];
    let delSeq = 0;
    for (const id of subIds) {
      if (!rng.bool(0.4)) continue;
      const n = rng.int(1, 4);
      for (let d = 0; d < n; d++) {
        const status = rng.weighted<'PENDING' | 'SUCCESS' | 'FAILED'>([
          ['SUCCESS', 7],
          ['FAILED', 2],
          ['PENDING', 1],
        ]);
        deliveries.push({
          id: `whd_${pad(delSeq++, 7)}`,
          subscriptionId: id,
          status,
          responseCode: status === 'SUCCESS' ? 200 : status === 'FAILED' ? rng.pick([500, 502, 408]) : null,
          attempts: status === 'FAILED' ? rng.int(1, 5) : 1,
          nextAttemptAt: status === 'FAILED' ? daysAfter(rng.int(0, 2)) : null,
          createdAt: daysBefore(rng.int(0, 30)),
          updatedAt: daysBefore(rng.int(0, 30)),
        });
      }
    }
    await createManyChunked('webhook_deliveries', deliveries, (b) =>
      prisma.webhookDelivery.createMany({ data: b, skipDuplicates: true }),
    );

    // ── 9. Notifications ────────────────────────────────────────────────────
    const notifications: Prisma.NotificationCreateManyInput[] = [];
    let notifSeq = 0;
    for (const u of users) {
      if (u.id === admin.id) continue;
      const n = rng.int(0, scale.notificationsPerUser);
      for (let k = 0; k < n; k++) {
        const createdAt = daysBefore(rng.int(0, 45));
        const read = rng.bool(0.6);
        notifications.push({
          id: `ntf_${pad(notifSeq++, 8)}`,
          userId: u.id,
          type: rng.pick(NOTIF_TYPES),
          payload: { amountStroops: Number(xlmToStroops(rng.int(1, 500))), from: stellarAddress(rng).slice(0, 8) },
          readAt: read ? new Date(createdAt.getTime() + rng.int(1, 72) * 60 * 60 * 1000) : null,
          createdAt,
        });
      }
    }
    await createManyChunked('notifications', notifications, (b) =>
      prisma.notification.createMany({ data: b, skipDuplicates: true }),
    );

    // ── 10. Leaderboard snapshots (top creators per period) ─────────────────
    // Rank creators by their total received volume from the planned tips.
    const received = new Map<string, bigint>();
    for (const t of tips) {
      if (!t.recipientId || t.status !== 'CONFIRMED') continue;
      received.set(t.recipientId, (received.get(t.recipientId) ?? 0n) + (t.amountStroops as bigint));
    }
    const ranked = [...received.entries()].sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0));
    const snapshots: Prisma.LeaderboardSnapshotCreateManyInput[] = [];
    let snapSeq = 0;
    for (const period of ['WEEKLY', 'MONTHLY', 'ALL_TIME'] as const) {
      ranked.slice(0, scale.leaderboardTopN).forEach(([userId, total], idx) => {
        // Weekly/monthly use a deterministic fraction of all-time totals.
        const factor = period === 'WEEKLY' ? 0.15 : period === 'MONTHLY' ? 0.5 : 1;
        snapshots.push({
          id: `lbs_${pad(snapSeq++, 6)}`,
          period,
          rank: idx + 1,
          userId,
          totalTips: BigInt(Math.floor(Number(total) * factor)),
          createdAt: daysBefore(period === 'WEEKLY' ? 1 : period === 'MONTHLY' ? 3 : 0),
        });
      });
    }
    await createManyChunked('leaderboard_snapshots', snapshots, (b) =>
      prisma.leaderboardSnapshot.createMany({ data: b, skipDuplicates: true }),
    );

    // ── 11. Withdrawals (varied states) ─────────────────────────────────────
    const withdrawals: Prisma.WithdrawalCreateManyInput[] = [];
    let wSeq = 0;
    for (const creator of creators) {
      const n = rng.int(0, 3);
      for (let w = 0; w < n; w++) {
        const status = rng.weighted<'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'>([
          ['COMPLETED', 6],
          ['PENDING', 2],
          ['PROCESSING', 1],
          ['FAILED', 1],
        ]);
        withdrawals.push({
          id: `wdr_${pad(wSeq++, 7)}`,
          userId: creator.id,
          amountStroops: xlmToStroops(rng.weighted([[10, 4], [100, 3], [1000, 2], [5000, 1]])),
          destination: stellarAddress(rng),
          status,
          txHash: status === 'COMPLETED' ? `tx_wdr_${pad(wSeq, 7)}` : null,
          createdAt: daysBefore(rng.int(0, scale.analyticsDays)),
          updatedAt: daysBefore(rng.int(0, 5)),
        });
      }
    }
    await createManyChunked('withdrawals', withdrawals, (b) =>
      prisma.withdrawal.createMany({ data: b, skipDuplicates: true }),
    );

    // ── 12. API keys (admin + a few integrators) ────────────────────────────
    const apiKeys: Prisma.ApiKeyCreateManyInput[] = [
      {
        id: 'key_admin',
        hashedKey: `hk_${stellarAddress(rng).slice(1)}`,
        scopes: ['admin', 'read', 'write'],
        createdById: admin.id,
        createdAt: admin.createdAt,
        updatedAt: admin.createdAt,
      },
    ];
    for (let k = 0; k < Math.min(5, creators.length); k++) {
      apiKeys.push({
        id: `key_${pad(k, 5)}`,
        hashedKey: `hk_${stellarAddress(rng).slice(1)}`,
        scopes: ['read'],
        createdById: creators[k].id,
        createdAt: daysBefore(rng.int(1, 60)),
        updatedAt: daysBefore(rng.int(0, 1)),
      });
    }
    await createManyChunked('api_keys', apiKeys, (b) =>
      prisma.apiKey.createMany({ data: b, skipDuplicates: true }),
    );

    // ── 13. Refresh tokens (active + expired + revoked) ─────────────────────
    const refreshTokens: Prisma.RefreshTokenCreateManyInput[] = [];
    let rtSeq = 0;
    for (const u of users.slice(0, Math.min(users.length, 50))) {
      const kind = rng.weighted<'active' | 'expired' | 'revoked'>([
        ['active', 5],
        ['expired', 3],
        ['revoked', 2],
      ]);
      refreshTokens.push({
        id: `rt_${pad(rtSeq++, 6)}`,
        userId: u.id,
        hashedToken: `ht_${stellarAddress(rng).slice(1)}`,
        expiresAt: kind === 'expired' ? daysBefore(rng.int(1, 30)) : daysAfter(rng.int(1, 7)),
        revokedAt: kind === 'revoked' ? daysBefore(rng.int(0, 10)) : null,
        createdAt: daysBefore(rng.int(1, 30)),
      });
    }
    // Guaranteed coverage: an active, an expired, and a revoked refresh token.
    refreshTokens.push(
      {
        id: 'rt_guar_active',
        userId: whale.id,
        hashedToken: `ht_${stellarAddress(rng).slice(1)}`,
        expiresAt: daysAfter(7),
        revokedAt: null,
        createdAt: daysBefore(1),
      },
      {
        id: 'rt_guar_expired',
        userId: whale.id,
        hashedToken: `ht_${stellarAddress(rng).slice(1)}`,
        expiresAt: daysBefore(2),
        revokedAt: null,
        createdAt: daysBefore(9),
      },
      {
        id: 'rt_guar_revoked',
        userId: whale.id,
        hashedToken: `ht_${stellarAddress(rng).slice(1)}`,
        expiresAt: daysAfter(7),
        revokedAt: daysBefore(1),
        createdAt: daysBefore(3),
      },
    );
    await createManyChunked('refresh_tokens', refreshTokens, (b) =>
      prisma.refreshToken.createMany({ data: b, skipDuplicates: true }),
    );

    // ── 14. Auth challenges (pending, used, and expired) ────────────────────
    const challenges: Prisma.AuthChallengeCreateManyInput[] = [];
    let acSeq = 0;
    for (const u of users.slice(0, Math.min(users.length, 40))) {
      const kind = rng.weighted<'pending' | 'used' | 'expired'>([
        ['pending', 3],
        ['used', 4],
        ['expired', 3],
      ]);
      // Expired challenges are created at least a day ago so expiry is firmly
      // in the past; pending/used ones are "now" with a future expiry.
      const createdAt = kind === 'expired' ? daysBefore(rng.int(1, 5)) : daysBefore(0);
      const ttlMs = 5 * 60 * 1000; // matches AUTH_CHALLENGE_TTL_SECONDS default (300s)
      const expiresAt =
        kind === 'expired'
          ? new Date(createdAt.getTime() + ttlMs) // < ANCHOR, since createdAt is ≥1 day back
          : new Date(ANCHOR.getTime() + rng.int(60, 300) * 1000); // future, still within TTL
      challenges.push({
        id: `ac_${pad(acSeq++, 6)}`,
        stellarAddress: u.stellarAddress,
        challenge: `nonce_${stellarAddress(rng).slice(1, 20)}`,
        network: 'TESTNET',
        expiresAt,
        usedAt: kind === 'used' ? new Date(createdAt.getTime() + rng.int(10, 240) * 1000) : null,
        createdAt,
      });
    }
    // Guaranteed coverage: a pending, a used, and an expired challenge.
    challenges.push(
      {
        id: 'ac_guar_pending',
        stellarAddress: whale.stellarAddress,
        challenge: `nonce_guar_${stellarAddress(rng).slice(1, 16)}`,
        network: 'TESTNET',
        expiresAt: new Date(ANCHOR.getTime() + 200 * 1000),
        usedAt: null,
        createdAt: daysBefore(0),
      },
      {
        id: 'ac_guar_used',
        stellarAddress: whale.stellarAddress,
        challenge: `nonce_guar_${stellarAddress(rng).slice(1, 16)}`,
        network: 'TESTNET',
        expiresAt: new Date(ANCHOR.getTime() + 200 * 1000),
        usedAt: daysBefore(0),
        createdAt: daysBefore(0),
      },
      {
        id: 'ac_guar_expired',
        stellarAddress: whale.stellarAddress,
        challenge: `nonce_guar_${stellarAddress(rng).slice(1, 16)}`,
        network: 'TESTNET',
        expiresAt: daysBefore(2),
        usedAt: null,
        createdAt: daysBefore(2),
      },
    );
    await createManyChunked('auth_challenges', challenges, (b) =>
      prisma.authChallenge.createMany({ data: b, skipDuplicates: true }),
    );

    // ── 15. Analytics daily rollups ─────────────────────────────────────────
    const analytics: Prisma.AnalyticsDailyCreateManyInput[] = [];
    for (let d = scale.analyticsDays; d >= 1; d--) {
      const date = new Date(daysBefore(d).toISOString().slice(0, 10)); // midnight UTC
      const totalTips = rng.int(5, 20) + Math.round(scale.users * rng.float() * 0.3);
      analytics.push({
        id: `an_${pad(scale.analyticsDays - d, 5)}`,
        date,
        totalTips,
        totalStroops: xlmToStroops(totalTips * (rng.int(5, 50))),
        uniqueTippers: Math.round(totalTips * (0.4 + rng.float() * 0.3)),
        uniqueCreators: Math.round(totalTips * (0.2 + rng.float() * 0.2)),
        activeUsers: Math.round(scale.users * (0.1 + rng.float() * 0.4)),
      });
    }
    await createManyChunked('analytics_daily', analytics, (b) =>
      prisma.analyticsDaily.createMany({ data: b, skipDuplicates: true }),
    );

    // ── 16. Indexer cursor + a few dead-letter events ───────────────────────
    await prisma.indexerCursor.createMany({
      data: [
        { topic: 'tip', lastLedger: ledger },
        { topic: 'subscription', lastLedger: ledger - rng.int(1, 100) },
      ],
      skipDuplicates: true,
    });
    const deadLetters: Prisma.DeadLetterEventCreateManyInput[] = [];
    for (let i = 0; i < Math.min(10, Math.ceil(scale.users / 10)); i++) {
      deadLetters.push({
        id: `dle_${pad(i, 5)}`,
        topic: rng.pick(['tip', 'subscription']),
        ledger: 50_000_000 + rng.int(0, 1000),
        eventId: `evt_${pad(i, 6)}`,
        payload: { raw: '0x' + stellarAddress(rng).slice(1, 20) },
        error: rng.pick(['decode failed', 'unknown token', 'recipient not found', 'amount overflow']),
        stack: null,
        attempts: rng.int(1, 5),
        status: rng.pick(['pending', 'replayed', 'failed']),
        replayedAt: rng.bool(0.3) ? daysBefore(rng.int(0, 10)) : null,
        createdAt: daysBefore(rng.int(0, 30)),
        updatedAt: daysBefore(rng.int(0, 5)),
      });
    }
    await createManyChunked('dead_letter_events', deadLetters, (b) =>
      prisma.deadLetterEvent.createMany({ data: b, skipDuplicates: true }),
    );

    // ── Summary ─────────────────────────────────────────────────────────────
    console.log('\nSeed complete ✓');
    console.log(`  users=${users.length}  tips=${tipCount}  subscriptions=${subs.length}`);
    console.log(`  creators=${creators.length}  zero-tip-creator=${zeroTipCreator.username}`);
    console.log('  Edge cases: usr_zero_tip, usr_maxlen, expired goals/subscriptions/tokens/challenges.');
    console.log(`  Reproduce this exact dataset with: SEED="${SEED}" SEED_SCALE="${SCALE_NAME}" npm run db:seed`);

    if (DRY_RUN && store) verifyIntegrity(store);
  } finally {
    await prisma.$disconnect();
  }
}

/** Projects a PlannedUser onto the Prisma User create shape (drops planning fields). */
function toUserRow(u: PlannedUser): Prisma.UserCreateManyInput {
  return {
    id: u.id,
    stellarAddress: u.stellarAddress,
    username: u.username,
    displayName: u.displayName,
    bio: u.bio,
    imageUrl: u.imageUrl,
    avatarCid: u.avatarCid,
    xHandle: u.xHandle,
    role: u.role,
    scopes: u.scopes,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
