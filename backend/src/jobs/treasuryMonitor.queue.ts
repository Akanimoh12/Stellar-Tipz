import { getQueue } from './queueFactory.js';
export const TREASURY_MONITOR_QUEUE = 'treasury-monitor';
export function getTreasuryMonitorQueue() { return getQueue(TREASURY_MONITOR_QUEUE); }
