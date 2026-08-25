import {
  Contract,
  Keypair,
  Networks,
  SorobanRpc,
  TransactionBuilder,
  nativeToScVal,
} from '@stellar/stellar-sdk';
import { config } from '../../config/index.js';
import { logger } from '../../common/utils/logger.js';
import { BadRequestError } from '../../common/errors/AppError.js';

export interface ScheduledWithdrawalResult {
  txHash: string;
  netAmountStroops: string;
}

/**
 * Submits a scheduled (auto) withdrawal by invoking the contract's
 * `execute_scheduled_withdrawal` entrypoint. The transaction is signed by the
 * platform **payout keeper** account — NOT the creator's key. The keeper has no
 * custody of creator funds; it can only trigger withdrawals the creator has
 * explicitly authorised on-chain (see #059 ADR). If the keeper secret or
 * contract id is unconfigured this throws so the payout is retried later.
 *
 * This module is isolated so it can be mocked in tests without touching the
 * Stellar network.
 */
export async function submitScheduledWithdrawal(
  creatorAddress: string,
  grossAmountStroops: bigint,
): Promise<ScheduledWithdrawalResult> {
  const secret = config.payouts.keeperSecretKey;
  const contractId = config.stellar.contractId;

  if (!secret) {
    throw new BadRequestError('PAYOUT_KEEPER_SECRET_KEY is not configured');
  }
  if (!contractId) {
    throw new BadRequestError('Contract ID is not configured');
  }

  const keeper = Keypair.fromSecret(secret);
  const server = new SorobanRpc.Server(config.stellar.rpcUrl, {
    allowHttp: config.stellar.rpcUrl.startsWith('http://'),
  });
  const source = await server.getAccount(keeper.publicKey());
  const networkPassphrase =
    Networks[config.stellar.network as keyof typeof Networks] ?? config.stellar.networkPassphrase;

  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(source, {
    fee: '100',
    networkPassphrase,
  })
    .addOperation(
      contract.call(
        'execute_scheduled_withdrawal',
        nativeToScVal(keeper.publicKey(), { type: 'address' }),
        nativeToScVal(creatorAddress, { type: 'address' }),
        nativeToScVal(grossAmountStroops.toString(), { type: 'i128' }),
      ),
    )
    .setTimeout(30)
    .build();

  tx.sign(keeper);

  const send = await server.sendTransaction(tx);
  if (send.status === 'ERROR') {
    logger.error({ creatorAddress, hash: send.hash }, 'Scheduled withdrawal rejected by network');
    throw new BadRequestError('Scheduled withdrawal transaction rejected by the network');
  }

  const fee = (grossAmountStroops * BigInt(config.withdrawals.feeBps)) / 10000n;
  return {
    txHash: send.hash,
    netAmountStroops: (grossAmountStroops - fee).toString(),
  };
}
