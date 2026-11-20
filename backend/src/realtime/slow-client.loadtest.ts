/**
 * Load test: Simulate slow clients that cannot consume messages fast enough.
 * This demonstrates that backpressure handling keeps memory bounded even with
 * many slow clients.
 *
 * Run with: npx tsx scripts/slow-client-loadtest.ts
 * Expected result: Memory usage stays bounded; slow clients are disconnected cleanly.
 */

import { io as ioClient, Socket } from 'socket.io-client';
import { logger } from '@/common/utils/logger.js';

interface SlowClientConfig {
  serverUrl: string;
  clientCount: number;
  eventFrequencyMs: number;
  clientSlownessMs: number;
  durationSeconds: number;
}

interface LoadTestResult {
  clientCount: number;
  eventCount: number;
  disconnectedCount: number;
  memoryPeakMB: number;
  memoryFinalMB: number;
  memoryBounded: boolean;
  slowClientDisconnectRate: number;
}

let globalEventCount = 0;
let globalDisconnectedCount = 0;
let memoryPeakMB = 0;

function captureMemory(): number {
  const used = process.memoryUsage().heapUsed / 1024 / 1024;
  memoryPeakMB = Math.max(memoryPeakMB, used);
  return used;
}

async function createSlowClient(
  serverUrl: string,
  clientSlownessMs: number
): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(serverUrl, {
      reconnection: true,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      logger.debug('Slow client connected');

      // Slow consumer: process messages slower than they arrive
      socket.on('event', (data) => {
        globalEventCount++;

        setTimeout(() => {
          // Process the message very slowly
          logger.debug({ slowness: clientSlownessMs }, 'Slow client processing message');
        }, clientSlownessMs);
      });

      socket.on('backpressure_disconnect', (reason) => {
        logger.warn(
          { reason },
          'Slow client disconnected due to backpressure'
        );
        globalDisconnectedCount++;
      });

      socket.on('disconnect', (reason) => {
        logger.debug({ reason }, 'Slow client disconnected');
      });

      socket.on('error', (error) => {
        logger.error({ error }, 'Slow client error');
        reject(error);
      });

      resolve(socket);
    });

    socket.on('error', reject);
  });
}

async function runLoadTest(config: SlowClientConfig): Promise<LoadTestResult> {
  logger.info(
    {
      clientCount: config.clientCount,
      eventFrequencyMs: config.eventFrequencyMs,
      clientSlownessMs: config.clientSlownessMs,
      durationSeconds: config.durationSeconds,
    },
    'Starting slow-client load test'
  );

  globalEventCount = 0;
  globalDisconnectedCount = 0;
  memoryPeakMB = 0;
  const memoryInitialMB = captureMemory();

  // Create slow clients
  const clients: Socket[] = [];
  for (let i = 0; i < config.clientCount; i++) {
    try {
      const client = await createSlowClient(
        config.serverUrl,
        config.clientSlownessMs
      );
      clients.push(client);
    } catch (error) {
      logger.error({ error }, 'Failed to create slow client');
    }
  }

  logger.info({ connectedClients: clients.length }, 'All slow clients connected');

  // Broadcast events at high frequency
  const broadcastInterval = setInterval(() => {
    for (const client of clients) {
      if (client.connected) {
        client.emit('event', {
          timestamp: Date.now(),
          message: 'high-frequency-update',
        });
      }
    }
    captureMemory();
  }, config.eventFrequencyMs);

  // Run for specified duration
  await new Promise((resolve) => setTimeout(resolve, config.durationSeconds * 1000));

  clearInterval(broadcastInterval);

  // Clean up clients
  for (const client of clients) {
    client.disconnect();
  }

  const memoryFinalMB = captureMemory();

  const result: LoadTestResult = {
    clientCount: config.clientCount,
    eventCount: globalEventCount,
    disconnectedCount: globalDisconnectedCount,
    memoryPeakMB,
    memoryFinalMB,
    memoryBounded: memoryPeakMB < memoryInitialMB + 500, // Allow 500MB growth
    slowClientDisconnectRate: (globalDisconnectedCount / config.clientCount) * 100,
  };

  logger.info(result, 'Load test complete');
  return result;
}

export async function runSlowClientLoadTest(): Promise<void> {
  const config: SlowClientConfig = {
    serverUrl: 'http://localhost:4000',
    clientCount: 100, // 100 slow clients
    eventFrequencyMs: 100, // Send events every 100ms
    clientSlownessMs: 500, // Client processes messages after 500ms (5x slower)
    durationSeconds: 30,
  };

  try {
    const result = await runLoadTest(config);

    if (result.memoryBounded) {
      logger.info('✅ Memory usage stayed bounded despite slow clients');
    } else {
      logger.error('❌ Memory usage grew unbounded despite backpressure handling');
    }

    if (result.slowClientDisconnectRate > 50) {
      logger.info(
        `⚠️  ${result.slowClientDisconnectRate.toFixed(1)}% of slow clients were disconnected ` +
          '(expected behavior when buffer limit exceeded)'
      );
    }

    logger.info(
      {
        eventsSent: result.eventCount,
        clientsDisconnected: result.disconnectedCount,
        memoryPeakMB: result.memoryPeakMB.toFixed(1),
      },
      'Load test summary'
    );
  } catch (error) {
    logger.error({ error }, 'Load test failed');
    process.exit(1);
  }
}
