import { prisma } from "../../db/prisma.js";
import { logger } from "../../common/utils/logger.js";
import { fetchOnChainBalance, fetchOnChainTipTotal, fetchOnChainProfile } from "./onchain.service.js";

export interface ReconciliationResult {
  address: string;
  username?: string;
  onChain: {
    balance: string;
    totalTipsReceived: string;
    profile: any;
  };
  database: {
    balance?: string;
    totalTipsReceived?: string;
    profile?: any;
  };
  discrepancies: string[];
  timestamp: string;
}

export async function reconcileCreator(address: string): Promise<ReconciliationResult> {
  logger.info({ address }, 'Starting reconciliation for creator');

  const [onChainBalance, onChainTipTotal, onChainProfile, dbUser] = await Promise.allSettled([
    fetchOnChainBalance(address),
    fetchOnChainTipTotal(address),
    fetchOnChainProfile(address),
    prisma.user.findUnique({
      where: { stellarAddress: address },
      include: {
        tipsReceived: {
          select: {
            amount: true,
          },
        },
      },
    }),
  ]);

  const result: ReconciliationResult = {
    address,
    onChain: {
      balance: onChainBalance.status === 'fulfilled' ? onChainBalance.value : '0',
      totalTipsReceived: onChainTipTotal.status === 'fulfilled' ? onChainTipTotal.value : '0',
      profile: onChainProfile.status === 'fulfilled' ? onChainProfile.value : null,
    },
    database: {},
    discrepancies: [],
    timestamp: new Date().toISOString(),
  };

  if (onChainProfile.status === 'fulfilled') {
    result.username = onChainProfile.value.username;
  }

  if (dbUser.status === 'fulfilled' && dbUser.value) {
    const user = dbUser.value;
    const dbTotalReceived = user.tipsReceived.reduce(
      (sum, tip) => sum + BigInt(tip.amount),
      BigInt(0)
    );

    result.database = {
      balance: user.balance || '0',
      totalTipsReceived: dbTotalReceived.toString(),
      profile: {
        username: user.username,
        displayName: user.displayName,
        bio: user.bio,
        imageUrl: user.imageUrl,
        xHandle: user.xHandle,
      },
    };

    if (result.onChain.balance !== result.database.balance) {
      result.discrepancies.push(
        `Balance mismatch: on-chain=${result.onChain.balance}, db=${result.database.balance}`
      );
    }

    if (result.onChain.totalTipsReceived !== result.database.totalTipsReceived) {
      result.discrepancies.push(
        `Total tips mismatch: on-chain=${result.onChain.totalTipsReceived}, db=${result.database.totalTipsReceived}`
      );
    }

    if (onChainProfile.status === 'fulfilled') {
      const onChain = onChainProfile.value;
      if (onChain.username !== user.username) {
        result.discrepancies.push(
          `Username mismatch: on-chain=${onChain.username}, db=${user.username}`
        );
      }
    }
  } else {
    result.discrepancies.push('Creator not found in database');
  }

  logger.info(
    { address, discrepancyCount: result.discrepancies.length },
    'Reconciliation completed'
  );

  return result;
}

export async function reconcileMultipleCreators(
  addresses: string[]
): Promise<ReconciliationResult[]> {
  logger.info({ count: addresses.length }, 'Starting batch reconciliation');

  const results = await Promise.all(
    addresses.map((address) =>
      reconcileCreator(address).catch((error) => {
        logger.error({ address, error }, 'Reconciliation failed for creator');
        return {
          address,
          onChain: { balance: '0', totalTipsReceived: '0', profile: null },
          database: {},
          discrepancies: [`Reconciliation error: ${error.message}`],
          timestamp: new Date().toISOString(),
        } as ReconciliationResult;
      })
    )
  );

  const totalDiscrepancies = results.reduce(
    (sum, r) => sum + r.discrepancies.length,
    0
  );

  logger.info(
    { count: addresses.length, totalDiscrepancies },
    'Batch reconciliation completed'
  );

  return results;
}
