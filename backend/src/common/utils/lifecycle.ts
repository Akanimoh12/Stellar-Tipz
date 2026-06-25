import { logger } from './logger.js';

export interface Closable {
  close(): Promise<void>;
  name: string;
}

const registry: Closable[] = [];

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
