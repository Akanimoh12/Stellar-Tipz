import { logger } from './logger.js';

export interface Closable {
  close(): Promise<void>;
  name: string;
}

const registry: Closable[] = [];

export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 30_000;

/** Register a resource for graceful shutdown. */
export function registerClosable(closable: Closable): void {
  registry.push(closable);
}

/**
 * Close all registered resources in reverse registration order.
 * Errors from individual resources are logged but do not prevent others from closing.
 */
export async function closeAll(): Promise<void> {
  const toClose = [...registry].reverse();
  for (const resource of toClose) {
    try {
      logger.info(`Closing ${resource.name}...`);
      await resource.close();
      logger.info(`${resource.name} closed`);
    } catch (err) {
      logger.error({ err }, `Error closing ${resource.name}`);
    }
  }
}

/**
 * Drains registered resources, invoking the fallback if shutdown exceeds the
 * deadline. The fallback defaults to a non-zero process exit so a stuck
 * resource cannot leave a terminating process alive indefinitely.
 */
export async function closeAllWithTimeout(
  timeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS,
  onTimeout: () => void = () => process.exit(1),
): Promise<boolean> {
  return withShutdownTimeout(closeAll, timeoutMs, onTimeout);
}

export async function withShutdownTimeout(
  operation: () => Promise<void>,
  timeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS,
  onTimeout: () => void = () => process.exit(1),
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => {
      onTimeout();
      resolve(false);
    }, timeoutMs);
  });

  const drained = operation().then(() => true);
  const completed = await Promise.race([drained, timeout]);
  if (timer) clearTimeout(timer);
  return completed;
}
