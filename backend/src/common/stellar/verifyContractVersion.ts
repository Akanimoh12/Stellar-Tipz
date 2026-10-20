import {
  Account,
  Contract,
  SorobanRpc,
  TransactionBuilder,
  scValToNative,
} from '@stellar/stellar-sdk';
import { rpcCall } from './rpcClient.js';

/** Public, non-signing account used only as the source of a read-only simulation. */
const SIMULATION_ACCOUNT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

export async function readContractVersion(contractId: string, networkPassphrase: string): Promise<number> {
  const tx = new TransactionBuilder(new Account(SIMULATION_ACCOUNT, '0'), {
    fee: '100',
    networkPassphrase,
  })
    .addOperation(new Contract(contractId).call('get_version'))
    .setTimeout(30)
    .build();

  const response = await rpcCall((server) => server.simulateTransaction(tx), {
    operationName: 'verifyContractVersion',
  });
  if (SorobanRpc.Api.isSimulationError(response) || !('result' in response) || !response.result?.retval) {
    throw new Error('On-chain contract version query failed');
  }
  const actual = Number(scValToNative(response.result.retval));
  if (!Number.isSafeInteger(actual) || actual < 1) {
    throw new Error('On-chain contract version is invalid');
  }
  return actual;
}

/** Fail closed if configuration or the on-chain interface is wrong. */
export async function assertContractVersion(
  contractId: string | undefined,
  networkPassphrase: string,
  expectedVersion: number,
  versionReader: (contractId: string, networkPassphrase: string) => Promise<number> = readContractVersion,
): Promise<void> {
  if (!contractId || !/^C[A-Z2-7]{55}$/.test(contractId)) {
    throw new Error('A valid CONTRACT_ID is required before serving traffic');
  }
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    throw new Error('Invalid expected contract interface version');
  }
  const actual = await versionReader(contractId, networkPassphrase);
  if (actual !== expectedVersion) {
    throw new Error(`Contract interface version mismatch: expected ${expectedVersion}, observed ${actual}`);
  }
}
