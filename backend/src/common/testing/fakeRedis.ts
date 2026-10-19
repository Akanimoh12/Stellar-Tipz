/**
 * Minimal in-memory stand-in for the ioredis client, for unit tests of code that
 * coordinates through Redis (cache fills, leader leases, invalidation indexes).
 *
 * Only the commands those modules use are implemented. Lua scripts cannot run
 * here, so a test registers a JS equivalent for each script it exercises via
 * `defineScript`; the real scripts are covered by the integration tests that run
 * against Redis. Expiry is driven by an injectable clock so tests can simulate a
 * lease lapsing without real waiting.
 */

type Value = string | Set<string> | Map<string, number>;

interface Entry {
  value: Value;
  expiresAt?: number;
}

export type ScriptHandler = (keys: string[], args: string[], redis: FakeRedis) => unknown;

export class FakeRedis {
  /** Clock used for key expiry; override in tests to move time forward. */
  now: () => number = () => Date.now();

  private readonly entries = new Map<string, Entry>();
  private readonly scripts = new Map<string, ScriptHandler>();
  /** When set, every command rejects with this error (simulates an outage). */
  failWith: Error | null = null;

  /** Registers the JS equivalent of a Lua script passed to `eval`. */
  defineScript(script: string, handler: ScriptHandler): void {
    this.scripts.set(script, handler);
  }

  on(): this {
    return this;
  }

  private check(): void {
    if (this.failWith) throw this.failWith;
  }

  private live(key: string): Entry | undefined {
    const entry = this.entries.get(key);
    if (entry?.expiresAt !== undefined && entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }

  /** Synchronous read used by script handlers. */
  peek(key: string): string | null {
    const entry = this.live(key);
    return typeof entry?.value === 'string' ? entry.value : null;
  }

  /** Synchronous write used by script handlers. */
  put(key: string, value: string, ttlMs?: number): void {
    this.entries.set(key, { value, expiresAt: ttlMs === undefined ? undefined : this.now() + ttlMs });
  }

  /** Synchronous expiry update used by script handlers. Returns 1 when the key exists. */
  setTtl(key: string, ttlMs: number): number {
    const entry = this.live(key);
    if (!entry) return 0;
    entry.expiresAt = this.now() + ttlMs;
    return 1;
  }

  /** Synchronous delete used by script handlers. */
  remove(...keys: string[]): number {
    let removed = 0;
    for (const key of keys) {
      if (this.live(key)) removed += 1;
      this.entries.delete(key);
    }
    return removed;
  }

  keys(): string[] {
    return [...this.entries.keys()].filter((key) => this.live(key) !== undefined);
  }

  async get(key: string): Promise<string | null> {
    this.check();
    return this.peek(key);
  }

  async set(key: string, value: string, ...options: Array<string | number>): Promise<'OK' | null> {
    this.check();
    let ttlMs: number | undefined;
    let nx = false;
    for (let i = 0; i < options.length; i++) {
      const option = String(options[i]).toUpperCase();
      if (option === 'EX') ttlMs = Number(options[++i]) * 1000;
      else if (option === 'PX') ttlMs = Number(options[++i]);
      else if (option === 'NX') nx = true;
    }
    if (nx && this.live(key)) return null;
    this.put(key, value, ttlMs);
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    this.check();
    return this.remove(...keys.flat());
  }

  async incr(key: string): Promise<number> {
    this.check();
    const next = Number(this.peek(key) ?? '0') + 1;
    const expiresAt = this.live(key)?.expiresAt;
    this.entries.set(key, { value: String(next), expiresAt });
    return next;
  }

  async pttl(key: string): Promise<number> {
    this.check();
    const entry = this.live(key);
    if (!entry) return -2;
    return entry.expiresAt === undefined ? -1 : entry.expiresAt - this.now();
  }

  async expire(key: string, seconds: number): Promise<number> {
    this.check();
    return this.setTtl(key, seconds * 1000);
  }

  private set_(key: string): Set<string> {
    const entry = this.live(key);
    if (entry?.value instanceof Set) return entry.value;
    const created = new Set<string>();
    this.entries.set(key, { value: created });
    return created;
  }

  private zset(key: string): Map<string, number> {
    const entry = this.live(key);
    if (entry?.value instanceof Map) return entry.value;
    const created = new Map<string, number>();
    this.entries.set(key, { value: created });
    return created;
  }

  /** Synchronous SADD used by script handlers. */
  addToSet(key: string, ...members: string[]): number {
    const set = this.set_(key);
    const before = set.size;
    for (const member of members) set.add(member);
    return set.size - before;
  }

  /** Synchronous ZADD used by script handlers; `gt` keeps the greater score. */
  addToSortedSet(key: string, score: number, member: string, gt = false): void {
    const zset = this.zset(key);
    const current = zset.get(member);
    if (!gt || current === undefined || score > current) zset.set(member, score);
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    this.check();
    return this.addToSet(key, ...members);
  }

  async smembers(key: string): Promise<string[]> {
    this.check();
    const entry = this.live(key);
    return entry?.value instanceof Set ? [...entry.value] : [];
  }

  async zadd(key: string, ...args: Array<string | number>): Promise<number> {
    this.check();
    const gt = String(args[0]).toUpperCase() === 'GT';
    const pairs = gt ? args.slice(1) : args;
    for (let i = 0; i < pairs.length; i += 2) {
      this.addToSortedSet(key, Number(pairs[i]), String(pairs[i + 1]), gt);
    }
    return pairs.length / 2;
  }

  async zrangebyscore(key: string, min: string | number, max: string | number): Promise<string[]> {
    this.check();
    const entry = this.live(key);
    if (!(entry?.value instanceof Map)) return [];
    const lo = min === '-inf' ? -Infinity : Number(min);
    const hi = max === '+inf' ? Infinity : Number(max);
    return [...entry.value.entries()]
      .filter(([, score]) => score >= lo && score <= hi)
      .sort((a, b) => a[1] - b[1])
      .map(([member]) => member);
  }

  async zremrangebyscore(key: string, min: string | number, max: string | number): Promise<number> {
    const members = await this.zrangebyscore(key, min, max);
    const entry = this.live(key);
    if (entry?.value instanceof Map) for (const member of members) entry.value.delete(member);
    return members.length;
  }

  async zrem(key: string, ...members: string[]): Promise<number> {
    this.check();
    const entry = this.live(key);
    if (!(entry?.value instanceof Map)) return 0;
    let removed = 0;
    for (const member of members) if (entry.value.delete(member)) removed += 1;
    return removed;
  }

  async eval(script: string, numKeys: number, ...rest: Array<string | number>): Promise<unknown> {
    this.check();
    const handler = this.scripts.get(script);
    if (!handler) throw new Error('FakeRedis: no handler registered for this script');
    const args = rest.map(String);
    return handler(args.slice(0, numKeys), args.slice(numKeys), this);
  }
}
