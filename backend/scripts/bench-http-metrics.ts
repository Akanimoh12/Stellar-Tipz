/**
 * Measures the per-request overhead of the RED metrics middleware (issue #1347).
 *
 * Each server variant runs in its own child process so JIT state cannot leak
 * between variants, and the HTTP client runs here in the parent, so the
 * server's event loop is never shared with the load generator. Variants:
 *
 *   baseline          Express app, no middleware
 *   noop              a middleware that only calls next()
 *   metrics           httpMetricsMiddleware
 *
 * Reported per variant: server CPU time per request (the real cost of the
 * middleware, measured in the server process), median client-observed p50/p99
 * across rounds, and a synthetic loop (no network) for the middleware alone.
 * Client latency under concurrency is queueing-amplified, so CPU per request
 * is the number to compare. Results are documented in docs/METRICS.md.
 *
 *   NODE_ENV=test npx tsx scripts/bench-http-metrics.ts [requestsPerRound] [rounds]
 *   BENCH_CONCURRENCY=1 ...   client connections (default 8)
 *   ... --breakdown           one variant per middleware component
 */
import { EventEmitter } from 'node:events';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { fork } from 'node:child_process';
import express, { type NextFunction, type Request, type Response } from 'express';

process.env.NODE_ENV ??= 'test';
process.env.LOG_LEVEL ??= 'silent';
process.env.METRICS_PORT ??= '0';
process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/db';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.JWT_SECRET ??= 'bench-secret-key-for-metrics';
process.env.SOROBAN_RPC_URL ??= 'https://soroban-testnet.stellar.org';
process.env.HORIZON_URL ??= 'https://horizon-testnet.stellar.org';
process.env.NETWORK_PASSPHRASE ??= 'Test SDF Network ; September 2015';

type Variant =
  | 'baseline'
  | 'noop'
  | 'metrics'
  | 'clock-only'
  | 'listeners-only'
  | 'route-label-only'
  | 'counter-only'
  | 'histogram-only'
  | 'gauge-only'
  | 'legacy-only';
const SUMMARY_VARIANTS: Variant[] = ['baseline', 'noop', 'metrics'];
const BREAKDOWN_VARIANTS: Variant[] = [
  'baseline',
  'clock-only',
  'listeners-only',
  'route-label-only',
  'counter-only',
  'histogram-only',
  'gauge-only',
  'legacy-only',
  'metrics',
];
const VARIANTS: Variant[] = process.argv.includes('--breakdown') ? BREAKDOWN_VARIANTS : SUMMARY_VARIANTS;
const CONCURRENCY = Number(process.env.BENCH_CONCURRENCY ?? 8);

/** Middleware exercising one component of httpMetricsMiddleware, for `--breakdown`. */
async function componentMiddleware(variant: Variant) {
  const m = await import('../src/common/observability/httpMetrics.js');
  const legacy = await import('../src/common/observability/metrics.js');
  const onFinish = (res: Response, fn: () => void) => {
    let done = false;
    const once = () => {
      if (done) return;
      done = true;
      fn();
    };
    res.once('finish', once);
    res.once('close', once);
  };
  switch (variant) {
    case 'noop':
      return (_req: Request, _res: Response, next: NextFunction) => next();
    case 'metrics':
      return m.httpMetricsMiddleware;
    case 'clock-only':
      return (_req: Request, res: Response, next: NextFunction) => {
        const start = process.hrtime.bigint();
        onFinish(res, () => void Number(process.hrtime.bigint() - start));
        next();
      };
    case 'listeners-only':
      return (_req: Request, res: Response, next: NextFunction) => {
        onFinish(res, () => undefined);
        next();
      };
    case 'route-label-only':
      return (req: Request, res: Response, next: NextFunction) => {
        onFinish(res, () => void m.resolveRouteLabel(req));
        next();
      };
    case 'counter-only':
      return (_req: Request, res: Response, next: NextFunction) => {
        onFinish(res, () =>
          m.httpRequestsTotal.inc({ method: 'GET', route: '/api/v1/profiles/:username', status_code: '200', status_class: '2xx' }),
        );
        next();
      };
    case 'histogram-only':
      return (_req: Request, res: Response, next: NextFunction) => {
        onFinish(res, () =>
          m.httpRequestDurationSeconds.observe({ method: 'GET', route: '/api/v1/profiles/:username', status_class: '2xx' }, 0.001),
        );
        next();
      };
    case 'gauge-only':
      return (_req: Request, res: Response, next: NextFunction) => {
        m.httpRequestsInFlight.inc({ method: 'GET' });
        onFinish(res, () => m.httpRequestsInFlight.dec({ method: 'GET' }));
        next();
      };
    case 'legacy-only':
      return (_req: Request, res: Response, next: NextFunction) => {
        onFinish(res, () => legacy.recordRequest(1));
        next();
      };
    default:
      return null;
  }
}

async function serverMain(variant: Variant): Promise<void> {
  const app = express();
  let handled = 0;
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    handled += 1;
    next();
  });
  const middleware = await componentMiddleware(variant);
  if (middleware) app.use(middleware);
  const router = express.Router();
  router.get('/profiles/:username', (req: Request, res: Response) => res.json({ username: req.params.username }));
  app.use('/api/v1', router);
  const server = app.listen(0, '127.0.0.1', () => {
    process.send?.({ port: (server.address() as { port: number }).port });
  });
  process.on('message', (msg) => {
    if (msg === 'mark') {
      // Reset the CPU baseline after warm-up so JIT compilation is excluded.
      handled = 0;
      process.cpuUsage();
      process.send?.({ marked: process.cpuUsage() });
    }
    if (msg === 'stop') {
      const usage = process.cpuUsage();
      process.send?.({ cpu: usage, handled });
      server.close(() => process.exit(0));
    }
  });
}

interface ServerHandle {
  port: number;
  mark: () => Promise<{ user: number; system: number }>;
  stop: () => Promise<{ cpu: { user: number; system: number }; handled: number }>;
}

function spawnServer(variant: Variant): Promise<ServerHandle> {
  return new Promise((resolve, reject) => {
    const child = fork(fileURLToPath(import.meta.url), ['--server', variant], {
      execArgv: process.execArgv,
      stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
    });
    const ask = <T>(command: string, key: string) =>
      new Promise<T>((done) => {
        const onMessage = (msg: unknown) => {
          if (msg && typeof msg === 'object' && key in msg) {
            child.off('message', onMessage);
            done(msg as T);
          }
        };
        child.on('message', onMessage);
        child.send(command);
      });
    child.once('message', (msg) => {
      const { port } = msg as { port: number };
      resolve({
        port,
        mark: () => ask<{ marked: { user: number; system: number } }>('mark', 'marked').then((m) => m.marked),
        stop: () => ask<{ cpu: { user: number; system: number }; handled: number }>('stop', 'cpu'),
      });
    });
    child.once('error', reject);
  });
}

function get(agent: http.Agent, port: number, i: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const start = process.hrtime.bigint();
    http
      .get({ host: '127.0.0.1', port, path: `/api/v1/profiles/user${i % 500}`, agent }, (res) => {
        res.resume();
        res.on('end', () => resolve(Number(process.hrtime.bigint() - start) / 1e3));
      })
      .on('error', reject);
  });
}

async function drive(port: number, requests: number): Promise<{ p50: number; p99: number }> {
  const agent = new http.Agent({ keepAlive: true, maxSockets: CONCURRENCY });
  const samples: number[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < requests) {
        const i = next++;
        samples.push(await get(agent, port, i));
      }
    }),
  );
  agent.destroy();
  samples.sort((a, b) => a - b);
  return { p50: samples[Math.floor(samples.length * 0.5)], p99: samples[Math.floor(samples.length * 0.99)] };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function syntheticMiddlewareCost(iterations: number): Promise<number> {
  const { httpMetricsMiddleware } = await import('../src/common/observability/httpMetrics.js');
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i += 1) {
    const res = new EventEmitter() as EventEmitter & { headersSent: boolean; statusCode: number };
    res.headersSent = true;
    res.statusCode = 200;
    const req = { method: 'GET', baseUrl: '/api/v1', route: { path: '/profiles/:username' } } as unknown as Request;
    httpMetricsMiddleware(req, res as unknown as Response, () => undefined);
    res.emit('finish');
  }
  return Number(process.hrtime.bigint() - start) / 1e3 / iterations;
}

async function clientMain(): Promise<void> {
  const requests = Number(process.argv[2] ?? 5_000);
  const rounds = Number(process.argv[3] ?? 5);
  const servers = new Map<Variant, ServerHandle>();
  for (const variant of VARIANTS) servers.set(variant, await spawnServer(variant));
  for (const variant of VARIANTS) await drive(servers.get(variant)!.port, requests); // warm-up
  const cpuStart = new Map<Variant, { user: number; system: number }>();
  for (const variant of VARIANTS) cpuStart.set(variant, await servers.get(variant)!.mark());

  const p50s = new Map<Variant, number[]>();
  const p99s = new Map<Variant, number[]>();
  for (let round = 0; round < rounds; round += 1) {
    // Rotate the order every round so drift affects each variant equally.
    const order = [...VARIANTS.slice(round % VARIANTS.length), ...VARIANTS.slice(0, round % VARIANTS.length)];
    for (const variant of order) {
      const r = await drive(servers.get(variant)!.port, requests);
      p50s.set(variant, [...(p50s.get(variant) ?? []), r.p50]);
      p99s.set(variant, [...(p99s.get(variant) ?? []), r.p99]);
    }
  }
  const cpuPerRequest = new Map<Variant, number>();
  for (const [variant, handle] of servers) {
    const { cpu, handled } = await handle.stop();
    const start = cpuStart.get(variant)!;
    cpuPerRequest.set(variant, (cpu.user - start.user + cpu.system - start.system) / Math.max(handled, 1));
  }
  const synthetic = await syntheticMiddlewareCost(200_000);

  console.log(`requests per round per variant: ${requests}, rounds: ${rounds}, concurrency: ${CONCURRENCY}`);
  console.log('values are medians across rounds of client-observed latency over loopback HTTP');
  const base = median(p50s.get('baseline')!);
  const baseCpu = cpuPerRequest.get('baseline')!;
  for (const variant of VARIANTS) {
    const p50 = median(p50s.get(variant)!);
    const cpu = cpuPerRequest.get(variant)!;
    const suffix =
      variant === 'baseline'
        ? ''
        : `  (delta vs baseline: cpu ${cpu - baseCpu >= 0 ? '+' : ''}${(cpu - baseCpu).toFixed(1)}µs, p50 ${p50 - base >= 0 ? '+' : ''}${(p50 - base).toFixed(1)}µs)`;
    console.log(
      `${variant.padEnd(16)} server cpu ${cpu.toFixed(1)}µs/req  client p50 ${p50.toFixed(1)}µs  p99 ${median(p99s.get(variant)!).toFixed(1)}µs${suffix}`,
    );
  }
  console.log(`middleware alone (synthetic loop, no network): ${synthetic.toFixed(2)}µs per request`);
  // The metrics module pulls in the shared Redis client, which would otherwise keep the loop alive.
  process.exit(0);
}

const serverFlag = process.argv.indexOf('--server');
if (serverFlag !== -1) {
  serverMain(process.argv[serverFlag + 1] as Variant).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  clientMain().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
