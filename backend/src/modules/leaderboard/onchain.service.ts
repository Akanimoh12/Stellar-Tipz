import { Contract, SorobanRpc, Address, nativeToScVal, scValToNative, Account, TransactionBuilder, TimeoutInfinite } from '@stellar/stellar-sdk';
import { config } from '../../config/index.js';
import { logger } from '../../common/utils/logger.js';

export interface OnChainLeaderboardEntry {
  address: string;
  username: string;
  amount: string;
  creditScore: number;
}

export interface OnChainLeaderboardContext {
  contractId: string;
  networkPassphrase: string;
  rpcUrl: string;
}

function getDefaultContext(): OnChainLeaderboardContext {
  return {
    contractId: config.stellar.contractId,
    networkPassphrase: config.stellar.networkPassphrase,
    rpcUrl: config.stellar.rpcUrl,
  };
}

function getServer(rpcUrl: string): SorobanRpc.Server {
  return new SorobanRpc.Server(rpcUrl, {
    allowHttp: rpcUrl.startsWith('http://'),
  });
}

async function simulateContractCall<T>(
  contractId: string,
  method: string,
  args: any[],
  server: SorobanRpc.Server,
  networkPassphrase: string,
): Promise<T> {
  const contract = new Contract(contractId);
  const dummyAccount = new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '0');
  
  const txBuilder = new TransactionBuilder(dummyAccount, {
    fee: '100',
    networkPassphrase,
  });

  const tx = txBuilder
    .addOperation(contract.call(method, ...args))
    .setTimeout(TimeoutInfinite)
    .build();

  const response = await server.simulateTransaction(tx);

  if (SorobanRpc.Api.isSimulationSuccess(response) && response.result !== undefined) {
    return scValToNative(response.result.retval) as T;
  }

  throw new Error(`Failed to simulate ${method}: ${JSON.stringify(response)}`);
}

/**
 * Fetches leaderboard entries from the on-chain Tipz contract.
 * Calls the get_leaderboard contract method and transforms the response.
 * 
 * Issue #1617
 */
export async function fetchOnChainLeaderboard(
  limit: number = 50,
  ctx?: OnChainLeaderboardContext,
): Promise<OnChainLeaderboardEntry[]> {
  const context = ctx ?? getDefaultContext();
  const server = getServer(context.rpcUrl);

  logger.info({ limit, contractId: context.contractId }, 'Fetching on-chain leaderboard');

  const period = nativeToScVal(0, { type: 'u32' });
  const limitScVal = nativeToScVal(limit, { type: 'u32' });

  const rawEntries = await simulateContractCall<any[]>(
    context.contractId,
    'get_leaderboard',
    [period, limitScVal],
    server,
    context.networkPassphrase,
  );

  const entries: OnChainLeaderboardEntry[] = rawEntries.map((entry: any) => ({
    address: entry.address,
    username: entry.username || '',
    amount: entry.amount?.toString() || '0',
    creditScore: entry.credit_score || 0,
  }));

  logger.info({ count: entries.length }, 'Fetched on-chain leaderboard entries');
  return entries;
}

/**
 * Fetches the rank of a specific address on the on-chain leaderboard.
 * Returns null if the address is not ranked or if the query fails.
 * 
 * Issue #1616
 */
export async function fetchOnChainLeaderboardPosition(
  address: string,
  ctx?: OnChainLeaderboardContext,
): Promise<number | null> {
  const context = ctx ?? getDefaultContext();
  const server = getServer(context.rpcUrl);

  logger.info({ address, contractId: context.contractId }, 'Fetching on-chain leaderboard position');

  const period = nativeToScVal(0, { type: 'u32' });
  const addressScVal = new Address(address).toScVal();

  try {
    const rank = await simulateContractCall<number | null>(
      context.contractId,
      'get_leaderboard_rank',
      [period, addressScVal],
      server,
      context.networkPassphrase,
    );

    logger.info({ address, rank }, 'Fetched on-chain leaderboard position');
    return rank;
  } catch (error) {
    logger.warn({ address, error }, 'Failed to fetch leaderboard position');
    return null;
  }
}
