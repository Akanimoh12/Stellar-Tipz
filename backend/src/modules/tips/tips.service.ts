import { Contract, TransactionBuilder, SorobanRpc, nativeToScVal, Networks } from '@stellar/stellar-sdk';
import { config } from '../../config/index.js';
import { BadRequestError } from '../../common/errors/AppError.js';
import { logger } from '../../common/utils/logger.js';

export interface PreparedTip {
  unsignedTxXdr: string;
  from: string;
  to: string;
  amount: string;
  contractId: string;
  networkPassphrase: string;
}

export async function prepareTip(
  from: string,
  to: string,
  amount: string,
  message?: string,
): Promise<PreparedTip> {
  const contractId = config.stellar.contractId;
  if (!contractId) {
    throw new BadRequestError('Contract ID is not configured');
  }

  const server = new SorobanRpc.Server(config.stellar.rpcUrl, {
    allowHttp: config.stellar.rpcUrl.startsWith('http://'),
  });

  const sourceAccount = await server.getAccount(from).catch(() => {
    throw new BadRequestError('Source account not found on network');
  });

  const networkPassphrase = Networks[config.stellar.network as keyof typeof Networks] ?? config.stellar.networkPassphrase;

  const scParams = [
    nativeToScVal(from, { type: 'address' }),
    nativeToScVal(to, { type: 'address' }),
    nativeToScVal(amount, { type: 'i128' }),
  ];
  if (message) {
    scParams.push(nativeToScVal(message, { type: 'string' }));
  }

  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(sourceAccount, {
    fee: '100',
    networkPassphrase,
  })
    .addOperation(contract.call('tip', ...scParams))
    .setTimeout(30)
    .build();

  const simulateResponse = await server.simulateTransaction(tx).catch((err: Error) => {
    logger.error({ err }, 'Transaction simulation failed');
    throw new BadRequestError('Transaction simulation failed');
  });

  if (SorobanRpc.Api.isSimulationError(simulateResponse)) {
    throw new BadRequestError(`Simulation error: ${simulateResponse.error}`);
  }

  const prepared = SorobanRpc.assembleTransaction(tx, simulateResponse);
  const unsignedTxXdr = prepared.build().toEnvelope().toXDR('base64');

  return {
    unsignedTxXdr,
    from,
    to,
    amount,
    contractId,
    networkPassphrase,
  };
}
