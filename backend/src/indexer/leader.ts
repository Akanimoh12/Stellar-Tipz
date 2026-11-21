import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { performance } from 'node:perf_hooks';
import { logger } from '../common/utils/logger.js';
import { RELEASE_LOCK_SCRIPT, withRedisTimeout } from '../common/utils/cache.js';
import { createCounter, createGauge } from '../common/observability/prometheus.js';

/**
 * Redis lease-based leader election for the indexer (issue #1263).
 *
 * Every indexer instance runs an elector; only the one holding the lease
 * (`SET key <instance> NX PX lease`) indexes. The leader renews the lease every
 * `renewIntervalMs`; if it crashes, the lease expires and a standby acquires it
 * on its next attempt, resuming from the persisted cursor.
 *
 * Split-brain protection, in layers:
 *
 * 1. A local deadline (`lease - safety margin`, measured from *before* each
 *    acquire/renew round trip) on both the monotonic and the wall clock, so a
 *    leader that was paused (GC, VM freeze) past its lease stops on resume even
 *    if one of the clocks did not advance during the pause.
 * 2. `assertLeadership()` before every commit: an atomic compare-and-extend in
 *    Redis that fails if another instance now holds the lease.
 * 3. A fencing epoch, incremented on every acquisition and written with each
 *    cursor commit; the database rejects commits carrying an older epoch
 *    (`claimCursorFence`), closing the gap between the check and the commit.
 */

/** Extends the lease only if this instance still owns it. */
export const RENEW_LEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0`;

/** The subset of the ioredis client the elector needs. */
export interface LeaseClient {
  set(key: string, value: string, ...args: Array<string | number>): Promise<unknown>;
  incr(key: string): Promise<number>;
  eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>;
  status?: string;
}

/** Checks the poll loop runs before committing work (implemented by `LeaderElector`). */
export interface LeadershipGuard {
  /** Confirms and extends the lease in Redis; returns the fencing epoch. Throws `LeadershipLostError`. */
  assertLeadership(): Promise<number>;
  /** No-I/O check of the local lease deadline, for hot loops. Throws `LeadershipLostError`. */
  assertLocalLease(): number;
}

export class LeadershipLostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LeadershipLostError';
  }
}

export interface LeaderElectorOptions {
  redis: LeaseClient;
  key: string;
  leaseMs: number;
  renewIntervalMs: number;
  instanceId?: string;
  /** Highest epoch already persisted; a new leader's epoch is always above it (survives a Redis flush). */
  epochFloor?: () => Promise<number>;
  /** Injectable clocks for tests. */
  clock?: { monotonic: () => number; wall: () => number };
}

type StepDownReason = 'expired' | 'superseded';

const isLeaderGauge = createGauge({
  name: 'indexer_is_leader',
  help: 'Whether this indexer instance holds the leader lease (1) or is on standby (0)',
});
const leadershipTransitionsTotal = createCounter({
  name: 'indexer_leadership_transitions_total',
  help: 'Indexer leadership changes on this instance, by transition (acquired, lost, released)',
  labelNames: ['transition'] as const,
});
const leaseErrorsTotal = createCounter({
  name: 'indexer_lease_errors_total',
  help: 'Redis errors or timeouts while acquiring or renewing the indexer leader lease',
});

export class LeaderElector implements LeadershipGuard {
  readonly instanceId: string;
  private readonly epochKey: string;
  private readonly safetyMarginMs: number;
  private readonly opTimeoutMs: number;
  private readonly clock: { monotonic: () => number; wall: () => number };
  private epoch: number | null = null;
  private monotonicDeadline = 0;
  private wallDeadline = 0;
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;

  constructor(private readonly options: LeaderElectorOptions) {
    this.instanceId = options.instanceId ?? `${hostname()}:${process.pid}:${randomUUID()}`;
    this.epochKey = `${options.key}:epoch`;
    this.safetyMarginMs = Math.floor(options.leaseMs / 5);
    this.opTimeoutMs = Math.max(250, Math.floor(options.renewIntervalMs / 2));
    this.clock = options.clock ?? { monotonic: () => performance.now(), wall: () => Date.now() };
  }

  /** True while this instance holds an unexpired lease. */
  isLeader(): boolean {
    return (
      this.epoch !== null &&
      this.clock.monotonic() < this.monotonicDeadline &&
      this.clock.wall() < this.wallDeadline
    );
  }

  /** Fencing epoch of the current leadership, or null on standby. */
  get currentEpoch(): number | null {
    return this.epoch;
  }

  assertLocalLease(): number {
    if (!this.isLeader()) {
      if (this.epoch !== null) this.stepDown('expired');
      throw new LeadershipLostError('Indexer leader lease expired');
    }
    return this.epoch as number;
  }

  async assertLeadership(): Promise<number> {
    const epoch = this.assertLocalLease();
    const renewed = await this.renew();
    if (renewed === false) this.stepDown('superseded');
    if (renewed !== true || this.epoch !== epoch) {
      throw new LeadershipLostError('Indexer leader lease could not be confirmed');
    }
    // The round trip itself may have outlived the lease (e.g. a pause mid-request).
    return this.assertLocalLease();
  }

  /** One election step: renew the lease when leading, otherwise try to acquire it. */
  async tick(): Promise<void> {
    if (this.epoch !== null && !this.isLeader()) this.stepDown('expired');
    if (this.epoch !== null) {
      if ((await this.renew()) === false) this.stepDown('superseded');
      return;
    }
    await this.tryAcquire();
  }

  /** Starts the renew/acquire loop. */
  start(): void {
    const loop = async (): Promise<void> => {
      if (this.stopped) return;
      this.running = this.tick().catch((err) => {
        logger.error({ err }, 'Indexer leader election tick failed');
      });
      await this.running;
      if (!this.stopped) this.timer = setTimeout(() => void loop(), this.options.renewIntervalMs);
    };
    void loop();
  }

  /** Stops the loop and releases the lease so a standby can take over immediately. */
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.running;
    if (this.epoch === null) return;

    const epoch = this.epoch;
    this.epoch = null;
    isLeaderGauge.set(0);
    try {
      await withRedisTimeout(
        this.options.redis.eval(RELEASE_LOCK_SCRIPT, 1, this.options.key, this.instanceId),
        this.opTimeoutMs,
      );
      leadershipTransitionsTotal.inc({ transition: 'released' });
      logger.info({ instanceId: this.instanceId, epoch }, 'Indexer released leadership');
    } catch (err) {
      logger.warn({ err, instanceId: this.instanceId }, 'Indexer lease release failed; it will expire');
    }
  }

  private clientReady(): boolean {
    const { status } = this.options.redis;
    return status === undefined || status === 'ready';
  }

  private extendFrom(started: { monotonic: number; wall: number }): void {
    const budget = this.options.leaseMs - this.safetyMarginMs;
    this.monotonicDeadline = started.monotonic + budget;
    this.wallDeadline = started.wall + budget;
  }

  private startedAt(): { monotonic: number; wall: number } {
    return { monotonic: this.clock.monotonic(), wall: this.clock.wall() };
  }

  /** true = extended, false = another instance owns the lease, null = unknown (Redis error). */
  private async renew(): Promise<boolean | null> {
    if (!this.clientReady()) return null;
    const started = this.startedAt();
    try {
      const result = await withRedisTimeout(
        this.options.redis.eval(
          RENEW_LEASE_SCRIPT,
          1,
          this.options.key,
          this.instanceId,
          this.options.leaseMs,
        ),
        this.opTimeoutMs,
      );
      if (Number(result) !== 1) return false;
      this.extendFrom(started);
      return true;
    } catch (err) {
      leaseErrorsTotal.inc();
      logger.warn({ err, instanceId: this.instanceId }, 'Indexer leader lease renewal failed');
      return null;
    }
  }

  private async tryAcquire(): Promise<void> {
    if (!this.clientReady()) return;
    const started = this.startedAt();
    const { redis, key, leaseMs } = this.options;
    let acquired = false;
    try {
      acquired =
        (await withRedisTimeout(redis.set(key, this.instanceId, 'PX', leaseMs, 'NX'), this.opTimeoutMs)) ===
        'OK';
      if (!acquired) return;

      let epoch = await withRedisTimeout(redis.incr(this.epochKey), this.opTimeoutMs);
      const floor = this.options.epochFloor ? await this.options.epochFloor() : 0;
      if (floor >= epoch) {
        // Redis lost the counter (flush/failover): continue above the persisted epoch.
        epoch = floor + 1;
        await withRedisTimeout(redis.set(this.epochKey, String(epoch)), this.opTimeoutMs);
      }

      this.epoch = epoch;
      this.extendFrom(started);
      isLeaderGauge.set(1);
      leadershipTransitionsTotal.inc({ transition: 'acquired' });
      logger.info({ instanceId: this.instanceId, epoch }, 'Indexer acquired leadership');
    } catch (err) {
      leaseErrorsTotal.inc();
      logger.warn({ err, instanceId: this.instanceId }, 'Indexer leader lease acquisition failed');
      if (acquired) {
        // Holding the key without a usable epoch would block every standby until it expires.
        await withRedisTimeout(redis.eval(RELEASE_LOCK_SCRIPT, 1, key, this.instanceId), this.opTimeoutMs).catch(
          () => undefined,
        );
      }
    }
  }

  private stepDown(reason: StepDownReason): void {
    if (this.epoch === null) return;
    const epoch = this.epoch;
    this.epoch = null;
    isLeaderGauge.set(0);
    leadershipTransitionsTotal.inc({ transition: 'lost' });
    logger.warn({ instanceId: this.instanceId, epoch, reason }, 'Indexer lost leadership');
  }
}
