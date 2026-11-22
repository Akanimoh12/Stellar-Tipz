import { Keypair, StrKey } from '@stellar/stellar-sdk';

export const E2E_CONTRACT_ID = StrKey.encodeContract(Buffer.alloc(32, 1));
export const E2E_RPC_URL = 'https://e2e.local/__rpc';
export const E2E_PUBLIC_KEY = Keypair.fromRawEd25519Seed(
  Buffer.alloc(32, 7),
).publicKey();
