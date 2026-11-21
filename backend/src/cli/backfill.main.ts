#!/usr/bin/env node

import { logger } from '../common/utils/logger.js';
import { prisma } from '../db/prisma.js';
import { detectAndBackfillMissingDays } from '../modules/analytics/analyticsDaily.worker.js';

interface BackfillOptions {
  startDate: string;
  endDate: string;
  json?: boolean;
}

async function parseArgs(): Promise<BackfillOptions> {
  const args = process.argv.slice(2);
  
  const options: BackfillOptions = {
    startDate: '',
    endDate: '',
    json: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--start' && i + 1 < args.length) {
      options.startDate = args[++i];
    } else if (arg === '--end' && i + 1 < args.length) {
      options.endDate = args[++i];
    } else if (arg === '--json') {
      options.json = true;
    }
  }

  if (!options.startDate || !options.endDate) {
    throw new Error('Missing required arguments: --start and --end dates required');
  }

  return options;
}

async function main() {
  try {
    const options = await parseArgs();

    logger.info({
      startDate: options.startDate,
      endDate: options.endDate,
    }, 'Starting analytics backfill');

    const result = await detectAndBackfillMissingDays(
      options.startDate,
      options.endDate,
      prisma,
    );

    if (options.json) {
      console.log(JSON.stringify({
        success: true,
        backfilledDays: result.backfilledDays,
        summaries: result.summaries,
      }));
    } else {
      logger.info({
        backfilledDays: result.backfilledDays,
        count: result.backfilledDays.length,
      }, 'Backfill completed successfully');

      result.summaries.forEach((summary) => {
        logger.info({
          date: summary.date,
          totalTips: summary.totalTips,
          uniqueSenders: summary.uniqueSenders,
          uniqueRecipients: summary.uniqueRecipients,
          totalVolume: summary.totalVolume,
        }, 'Daily summary');
      });
    }

    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Backfill failed');
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
