import { Contract, SorobanRpc, Address, nativeToScVal, scValToNative, Account, TransactionBuilder, TimeoutInfinite } from '@stellar/stellar-sdk';
import { config } from '../../config/index.js';
import { logger } from '../../common/utils/logger.js';

export interface OnChainContext {
  contractId: string;
  networkPassphrase: string;
  rpcUrl: string;
}

export interface OnChainProfile {
  stellarAddress: string;
  username: string;
  displayName: string;
  bio: string;
  imageUrl: string;
  xHandle: string;
  totalTipsReceived: string;
  totalTipsCount: number;
  balance: string;
  creditScore: number;
  registeredAt: number;
  updatedAt: number;
}

function getDefaultContext(): OnChainContext {
  return {
    contractId: config.stellar.contractId || '',
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
 * Fetches the on-chain balance for a given creator address.
 * Calls the get_creator_stats contract method and extracts the balance field.
 * 
 * Issue #1613
 */
export async function fetchOnChainBalance(
  address: string,
  ctx?: OnChainContext,
): Promise<string> {
  const context = ctx ?? getDefaultContext();
  const server = getServer(context.rpcUrl);

  logger.info({ address, contractId: context.contractId }, 'Fetching on-chain balance');

  const addressScVal = new Address(address).toScVal();

  try {
    const stats = await simulateContractCall<any>(
      context.contractId,
      'get_creator_stats',
      [addressScVal],
      server,
      context.networkPassphrase,
    );

    const balance = stats.balance?.toString() || '0';
    logger.info({ address, balance }, 'Fetched on-chain balance');
    return balance;
  } catch (error) {
    logger.warn({ address, error }, 'Failed to fetch on-chain balance');
    throw error;
  }
}

/**
 * Fetches the on-chain total tips received for a given creator address.
 * Calls the get_creator_stats contract method and extracts total_tips_received.
 * 
 * Issue #1614
 */
export async function fetchOnChainTipTotal(
  address: string,
  ctx?: OnChainContext,
): Promise<string> {
  const context = ctx ?? getDefaultContext();
  const server = getServer(context.rpcUrl);

  logger.info({ address, contractId: context.contractId }, 'Fetching on-chain tip total');

  const addressScVal = new Address(address).toScVal();

  try {
    const stats = await simulateContractCall<any>(
      context.contractId,
      'get_creator_stats',
      [addressScVal],
      server,
      context.networkPassphrase,
    );

    const total = stats.total_tips_received?.toString() || '0';
    logger.info({ address, total }, 'Fetched on-chain tip total');
    return total;
  } catch (error) {
    logger.warn({ address, error }, 'Failed to fetch on-chain tip total');
    throw error;
  }
}

/**
 * Fetches the complete on-chain profile for a given creator address.
 * Calls the get_profile contract method and returns typed profile data.
 * 
 * Issue #1615
 */
export async function fetchOnChainProfile(
  address: string,
  ctx?: OnChainContext,
): Promise<OnChainProfile> {
  const context = ctx ?? getDefaultContext();
  const server = getServer(context.rpcUrl);

  logger.info({ address, contractId: context.contractId }, 'Fetching on-chain profile');

  const addressScVal = new Address(address).toScVal();

  try {
    const rawProfile = await simulateContractCall<any>(
      context.contractId,
      'get_profile',
      [addressScVal],
      server,
      context.networkPassphrase,
    );

    const profile: OnChainProfile = {
      stellarAddress: rawProfile.profile?.stellar_address || address,
      username: rawProfile.profile?.username || '',
      displayName: rawProfile.profile?.display_name || '',
      bio: rawProfile.profile?.bio || '',
      imageUrl: rawProfile.profile?.image_url || '',
      xHandle: rawProfile.profile?.x_handle || '',
      totalTipsReceived: rawProfile.profile?.total_tips_received?.toString() || '0',
      totalTipsCount: rawProfile.profile?.total_tips_count || 0,
      balance: rawProfile.profile?.balance?.toString() || '0',
      creditScore: rawProfile.profile?.credit_score || 0,
      registeredAt: rawProfile.profile?.registered_at || 0,
      updatedAt: rawProfile.profile?.updated_at || 0,
    };

    logger.info({ address, username: profile.username }, 'Fetched on-chain profile');
    return profile;
  } catch (error) {
    logger.warn({ address, error }, 'Failed to fetch on-chain profile');
    throw error;
  }
}
