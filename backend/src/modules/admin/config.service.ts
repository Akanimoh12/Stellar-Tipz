/**
 * Admin contract-config mutation service.
 *
 * Implements the prepare/submit pattern: the server builds unsigned Soroban
 * transactions; the admin signs them client-side; the server broadcasts the
 * signed XDR. The server never holds the admin key.
 *
 * Contract function mapping:
 *   fee_bps            → propose_fee_change(caller, fee_bps)
 *   min_tip_amount     → set_min_tip_amount(caller, amount)
 *   min_withdrawal     → set_min_withdrawal_amount(caller, amount)
 *   pause / unpause    → pause_contract(caller) / unpause_contract(caller)
 *
 * Every submission writes an audit log row with before/after values regardless
 * of network outcome (success or failure both get logged).
 *
 * Timelock coordination (#016):
 *   Fee increases are timelocked on-chain. After broadcasting a propose_fee_change
 *   the pending change (newFeeBps, effectiveLedger, isDecrease) is surfaced via
 *   getPendingFeeChange() so operators can monitor when it becomes applicable.
 */

import {
  Contract,
  TransactionBuilder,
  SorobanRpc,
  nativeToScVal,
  Networks,
  TransactionBuilder as TB,
} from '@stellar/stellar-sdk';
import { config } from '../../config/index.js';
import { logger } from '../../common/utils/logger.js';
import { rpcCall } from '../../common/stellar/rpcClient.js';
import { BadRequestError, NotFoundError } from '../../common/errors/AppError.js';
import { logAuditAction } from './admin.service.js';
import type {
  PreparedConfigTx,
  SubmittedConfigTx,
  PendingFeeChange,
} from './config.types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getNetworkPassphrase(): string {
  return (
    (Networks as Record<string, string>)[config.stellar.network] ??
    config.stellar.networkPassphrase
  );
}

function getContractId(): string {
  const id = config.stellar.contractId;
  if (!id) throw new BadRequestError('CONTRACT_ID is not configured');
  return id;
}

function getRpcServer(): SorobanRpc.Server {
  return new SorobanRpc.Server(config.stellar.rpcUrl, {
    allowHttp: config.stellar.rpcUrl.startsWith('http://'),
  });
}

/**
 * Build, simulate, and return the unsigned XDR for a contract call.
 * The admin's Stellar address is used as the transaction source so that
 * Soroban auth can be embedded for the caller argument.
 */
async function buildUnsignedConfigTx(
  adminAddress: string,
  contractFn: string,
  args: ReturnType<typeof nativeToScVal>[],
): Promise<string> {
  const contractId = getContractId();
  const networkPassphrase = getNetworkPassphrase();

  const sourceAccount = await rpcCall((server) => server.getAccount(adminAddress), {
    operationName: 'getAccount',
  }).catch(() => {
    throw new BadRequestError('Admin Stellar account not found on network');
  });

  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(sourceAccount, {
    fee: '100',
    networkPassphrase,
  })
    .addOperation(contract.call(contractFn, ...args))
    .setTimeout(30)
    .build();

  const sim = await rpcCall((server) => server.simulateTransaction(tx), {
    operationName: 'simulateTransaction',
  }).catch((err: Error) => {
    logger.error({ err, contractFn }, 'Config tx simulation failed');
    throw new BadRequestError('Transaction simulation failed');
  });

  if (SorobanRpc.Api.isSimulationError(sim)) {
    throw new BadRequestError(`Simulation error: ${(sim as SorobanRpc.Api.SimulateTransactionErrorResponse).error}`);
  }

  const prepared = SorobanRpc.assembleTransaction(tx, sim as SorobanRpc.Api.SimulateTransactionSuccessResponse);
  return prepared.build().toEnvelope().toXDR('base64');
}

/**
 * Broadcast a signed config transaction. Returns the tx hash and status.
 * Logs the attempt as an audit entry (success and failure).
 */
async function broadcastSignedTx(
  actorId: string,
  action: string,
  target: string,
  signedTxXdr: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Promise<SubmittedConfigTx> {
  const networkPassphrase = getNetworkPassphrase();

  // Parse the XDR first so we get a clear error before hitting the network.
  let tx;
  try {
    tx = TB.fromXDR(signedTxXdr, networkPassphrase);
  } catch {
    // Audit before throwing so every attempt is recorded.
    await logAuditAction(actorId, action, target, {
      ...before,
      ...after,
      result: 'invalid_xdr',
    }).catch((auditErr: unknown) => logger.error({ auditErr }, 'Audit log write failed'));
    throw new BadRequestError('Invalid signed transaction XDR');
  }

  let txHash = '';
  let status: SubmittedConfigTx['status'] = 'ERROR';

  try {
    const send = await rpcCall((server) => server.sendTransaction(tx), {
      operationName: 'sendTransaction',
    });
    txHash = send.hash;
    status = send.status === 'ERROR' ? 'ERROR' : 'PENDING';
    if (send.status === 'ERROR') {
      logger.warn({ contractFn: action, hash: send.hash }, 'Config tx rejected by network');
    }
  } catch (err) {
    logger.error({ err, action }, 'Config tx submission failed');
    await logAuditAction(actorId, action, target, {
      ...before,
      ...after,
      result: 'submission_error',
    }).catch((auditErr: unknown) => logger.error({ auditErr }, 'Audit log write failed'));
    throw new BadRequestError('Failed to submit config transaction to the network');
  }

  // Audit always written — success or network rejection.
  await logAuditAction(actorId, action, target, {
    ...before,
    ...after,
    txHash,
    result: status === 'ERROR' ? 'network_rejected' : 'submitted',
  }).catch((auditErr: unknown) => logger.error({ auditErr }, 'Audit log write failed'));

  if (status === 'ERROR') {
    throw new BadRequestError('Config transaction was rejected by the network');
  }

  return { txHash, status: 'PENDING' };
}

// ── Fee ───────────────────────────────────────────────────────────────────────

/**
 * Prepare an unsigned `propose_fee_change` transaction.
 *
 * Fee increases are timelocked on-chain (default ~24 × 12 ledgers ≈ 1 hour on
 * testnet / ~24 hours on mainnet). Decreases are immediate but still go through
 * the proposal flow so clients can confirm the change.
 */
export async function prepareSetFee(
  adminAddress: string,
  feeBps: number,
): Promise<PreparedConfigTx & { feeBps: number; isIncrease: boolean }> {
  const contractId = getContractId();
  const networkPassphrase = getNetworkPassphrase();

  const unsignedTxXdr = await buildUnsignedConfigTx(adminAddress, 'propose_fee_change', [
    nativeToScVal(adminAddress, { type: 'address' }),
    nativeToScVal(feeBps, { type: 'u32' }),
  ]);

  return {
    unsignedTxXdr,
    feeBps,
    isIncrease: feeBps > 0, // caller context; actual direction resolved against current on-chain fee
    description: `Propose fee change to ${feeBps} bps (${feeBps / 100}%). Fee increases are timelocked on-chain.`,
    contractId,
    networkPassphrase,
  };
}

export async function submitSetFee(
  actorId: string,
  adminAddress: string,
  feeBps: number,
  signedTxXdr: string,
): Promise<SubmittedConfigTx> {
  return broadcastSignedTx(
    actorId,
    'admin.config.set_fee',
    `fee_bps`,
    signedTxXdr,
    { field: 'fee_bps' },
    { newFeeBps: feeBps },
  );
}

// ── Pending fee change (timelock surface — #016) ───────────────────────────────

/**
 * Query the contract for a pending fee change proposal.
 * Returns null if no fee change is currently pending.
 *
 * The data shape matches what `propose_fee_change_inner` stores on-chain:
 *   (fee_bps: u32, effective_ledger: u32, proposed_ledger: u32, is_decrease: bool)
 */
export async function getPendingFeeChange(opts: { signal?: AbortSignal } = {}): Promise<PendingFeeChange | null> {
  const contractId = getContractId();

  try {
    // Query the contract's `get_pending_fee_change` view function.
    const contract = new Contract(contractId);
    const tx = new TransactionBuilder(
      // Use a placeholder account; we only need to simulate.
      await rpcCall((server) => server.getAccount(contract.address()), {
        signal: opts.signal,
        operationName: 'getAccount',
      }).catch(async () => {
        // If contract address isn't a valid Stellar account, simulate with a different source.
        throw new BadRequestError('Cannot query pending fee change: RPC unavailable');
      }),
      { fee: '100', networkPassphrase: getNetworkPassphrase() },
    )
      .addOperation(contract.call('get_pending_fee_change'))
      .setTimeout(30)
      .build();

    const sim = await rpcCall((server) => server.simulateTransaction(tx), {
      signal: opts.signal,
      operationName: 'simulateTransaction',
    });
    if (SorobanRpc.Api.isSimulationError(sim)) {
      // No pending fee change returns a specific error from the contract.
      return null;
    }

    const result = (sim as SorobanRpc.Api.SimulateTransactionSuccessResponse).result;
    if (!result) return null;

    // The contract returns (fee_bps, effective_ledger, proposed_ledger, is_decrease)
    // as a tuple. Parse from the XDR result value.
    const retval = result.retval;
    // retval is a ScVal; the contract encodes the tuple as a map or vec.
    // We do a best-effort parse: if it fails, return null so callers
    // degrade gracefully without a crash.
    const json = retval.toXDR('base64');
    logger.debug({ json }, 'Raw pending fee change XDR');

    // The contract encodes the pending fee change as a Vec<(u32,u32,u32,bool)>.
    // Parse by extracting the raw ScVal fields.
    const vec = retval.value() as { values: () => { value: () => unknown }[] } | null;
    if (!vec) return null;

    const items = (vec.values as () => { value: () => unknown }[])();
    if (!Array.isArray(items) || items.length < 4) return null;

    return {
      newFeeBps: Number(items[0].value()),
      effectiveLedger: Number(items[1].value()),
      proposedLedger: Number(items[2].value()),
      isDecrease: Boolean(items[3].value()),
      currentFeeBps: 0, // caller can supplement from get_config if needed
    };
  } catch (err) {
    logger.warn({ err }, 'getPendingFeeChange: could not query contract');
    return null;
  }
}

// ── Min tip amount ────────────────────────────────────────────────────────────

export async function prepareSetMinTipAmount(
  adminAddress: string,
  amount: string,
): Promise<PreparedConfigTx & { amount: string }> {
  const contractId = getContractId();
  const networkPassphrase = getNetworkPassphrase();

  const unsignedTxXdr = await buildUnsignedConfigTx(adminAddress, 'set_min_tip_amount', [
    nativeToScVal(adminAddress, { type: 'address' }),
    nativeToScVal(BigInt(amount), { type: 'i128' }),
  ]);

  return {
    unsignedTxXdr,
    amount,
    description: `Set minimum tip amount to ${amount} stroops.`,
    contractId,
    networkPassphrase,
  };
}

export async function submitSetMinTipAmount(
  actorId: string,
  amount: string,
  signedTxXdr: string,
): Promise<SubmittedConfigTx> {
  return broadcastSignedTx(
    actorId,
    'admin.config.set_min_tip_amount',
    'min_tip_amount',
    signedTxXdr,
    { field: 'min_tip_amount' },
    { newAmount: amount },
  );
}

// ── Min withdrawal amount ─────────────────────────────────────────────────────

export async function prepareSetMinWithdrawalAmount(
  adminAddress: string,
  amount: string,
): Promise<PreparedConfigTx & { amount: string }> {
  const contractId = getContractId();
  const networkPassphrase = getNetworkPassphrase();

  const unsignedTxXdr = await buildUnsignedConfigTx(adminAddress, 'set_min_withdrawal_amount', [
    nativeToScVal(adminAddress, { type: 'address' }),
    nativeToScVal(BigInt(amount), { type: 'i128' }),
  ]);

  return {
    unsignedTxXdr,
    amount,
    description: `Set minimum withdrawal amount to ${amount} stroops.`,
    contractId,
    networkPassphrase,
  };
}

export async function submitSetMinWithdrawalAmount(
  actorId: string,
  amount: string,
  signedTxXdr: string,
): Promise<SubmittedConfigTx> {
  return broadcastSignedTx(
    actorId,
    'admin.config.set_min_withdrawal_amount',
    'min_withdrawal_amount',
    signedTxXdr,
    { field: 'min_withdrawal_amount' },
    { newAmount: amount },
  );
}

// ── Pause / Unpause ───────────────────────────────────────────────────────────

export async function prepareSetPaused(
  adminAddress: string,
  paused: boolean,
): Promise<PreparedConfigTx & { paused: boolean }> {
  const contractId = getContractId();
  const networkPassphrase = getNetworkPassphrase();

  // Contract exposes separate pause_contract / unpause_contract entrypoints.
  const contractFn = paused ? 'pause_contract' : 'unpause_contract';

  const unsignedTxXdr = await buildUnsignedConfigTx(adminAddress, contractFn, [
    nativeToScVal(adminAddress, { type: 'address' }),
  ]);

  return {
    unsignedTxXdr,
    paused,
    description: paused
      ? 'Pause the contract (emergency stop). All user-facing operations will be blocked.'
      : 'Unpause the contract. Normal operation resumes.',
    contractId,
    networkPassphrase,
  };
}

export async function submitSetPaused(
  actorId: string,
  paused: boolean,
  signedTxXdr: string,
): Promise<SubmittedConfigTx> {
  const action = paused ? 'admin.config.pause' : 'admin.config.unpause';
  return broadcastSignedTx(actorId, action, 'paused', signedTxXdr, { field: 'paused' }, {
    newValue: paused,
  });
}
