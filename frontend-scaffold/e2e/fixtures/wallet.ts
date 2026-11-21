import { webcrypto } from 'node:crypto';

import { test as base, expect, type Page } from '@playwright/test';
import {
  Address,
  Keypair,
  SorobanDataBuilder,
  StrKey,
  TransactionBuilder,
  nativeToScVal,
  xdr,
} from '@stellar/stellar-sdk';

import { injectFreighterConnected } from '../mocks/freighter';
import { E2E_PUBLIC_KEY } from './constants';

const ENTROPY = 'e2e-wallet-fixture-entropy';
const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
const COUNTERPARTY_PUBLIC_KEY = Keypair.fromRawEd25519Seed(
  Buffer.alloc(32, 8),
).publicKey();

interface TipRecord {
  id: number;
  tipper: string;
  creator: string;
  amount: string;
  message: string;
  timestamp: number;
}

const RECEIVED_TIPS: TipRecord[] = Array.from({ length: 60 }, (_, index) => ({
  id: index + 1,
  tipper: COUNTERPARTY_PUBLIC_KEY,
  creator: E2E_PUBLIC_KEY,
  amount: String(1_000_000 * (index + 1)),
  message: `Received tip ${index + 1}`,
  timestamp: 1_700_000_000 - index * 86_400,
}));

const SENT_TIPS: TipRecord[] = Array.from({ length: 20 }, (_, index) => ({
  id: 100 + index + 1,
  tipper: E2E_PUBLIC_KEY,
  creator: COUNTERPARTY_PUBLIC_KEY,
  amount: String(2_000_000 * (index + 1)),
  message: `Sent tip ${index + 1}`,
  timestamp: 1_699_500_000 - index * 86_400,
}));

type WalletFixtures = {
  connectedWallet: Page;
};

function mapToScVal(entries: Array<[string, xdr.ScVal]>): xdr.ScVal {
  return xdr.ScVal.scvMap(
    entries.map(
      ([key, value]) =>
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvString(key),
          val: value,
        }),
    ),
  );
}

function tipToScVal(tip: TipRecord): xdr.ScVal {
  return mapToScVal([
    ['id', nativeToScVal(tip.id, { type: 'u32' })],
    ['tipper', new Address(tip.tipper).toScVal()],
    ['creator', new Address(tip.creator).toScVal()],
    ['amount', xdr.ScVal.scvString(tip.amount)],
    ['message', xdr.ScVal.scvString(tip.message)],
    ['timestamp', nativeToScVal(tip.timestamp, { type: 'u32' })],
  ]);
}

function accountIdToScVal(publicKey: string): xdr.AccountId {
  return xdr.AccountId.publicKeyTypeEd25519(
    StrKey.decodeEd25519PublicKey(publicKey),
  );
}

function ledgerEntriesResult(): unknown {
  const accountId = accountIdToScVal(E2E_PUBLIC_KEY);
  const accountEntry = new xdr.AccountEntry({
    accountId,
    balance: xdr.Int64.fromString('100000000'),
    seqNum: xdr.SequenceNumber.fromString('1'),
    numSubEntries: 0,
    inflationDest: null,
    flags: 0,
    homeDomain: '',
    thresholds: Buffer.from([0, 0, 0, 0]),
    signers: [],
    ext: new xdr.AccountEntryExt(0),
  });

  return {
    latestLedger: 1,
    entries: [
      {
        lastModifiedLedgerSeq: 1,
        key: xdr.LedgerKey.account(
          new xdr.LedgerKeyAccount({ accountId }),
        ).toXDR('base64'),
        xdr: xdr.LedgerEntryData.account(accountEntry).toXDR('base64'),
      },
    ],
  };
}

function invokedFunctionName(transactionXdr: string): string {
  const transaction = TransactionBuilder.fromXDR(
    transactionXdr,
    NETWORK_PASSPHRASE,
  );
  const operation = transaction.operations[0] as unknown as {
    func?: { invokeContract?: () => { functionName: () => Buffer } };
  };
  const invocation = operation.func?.invokeContract?.();
  return invocation ? invocation.functionName().toString() : '';
}

function simulationResult(transactionXdr: string): unknown {
  const functionName = invokedFunctionName(transactionXdr);
  let retval: xdr.ScVal;

  switch (functionName) {
    case 'get_recent_tips':
      retval = xdr.ScVal.scvVec(RECEIVED_TIPS.map(tipToScVal));
      break;
    case 'get_tips_by_tipper':
      retval = xdr.ScVal.scvVec(SENT_TIPS.map(tipToScVal));
      break;
    case 'get_creator_tip_count':
      retval = nativeToScVal(RECEIVED_TIPS.length, { type: 'u32' });
      break;
    case 'get_tipper_tip_count':
      retval = nativeToScVal(SENT_TIPS.length, { type: 'u32' });
      break;
    default:
      retval = xdr.ScVal.scvVoid();
  }

  return {
    id: 'e2e-wallet-fixture',
    latestLedger: 1,
    events: [],
    transactionData: new SorobanDataBuilder().build().toXDR('base64'),
    minResourceFee: '0',
    cost: { cpuInsns: '0', memBytes: '0' },
    results: [{ auth: [], xdr: retval.toXDR('base64') }],
  };
}

interface RpcRequest {
  id?: unknown;
  method?: string;
  params?: { transaction?: string };
}

async function mockSorobanRpc(page: Page): Promise<void> {
  await page.route('**/__rpc', async (route) => {
    const body = route.request().postDataJSON() as RpcRequest;
    let result: unknown;

    if (body.method === 'getLedgerEntries') {
      result = ledgerEntriesResult();
    } else if (body.method === 'simulateTransaction' && body.params?.transaction) {
      result = simulationResult(body.params.transaction);
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: body.id,
        result,
      }),
    });
  });
}

async function encryptWalletState(fingerprint: string): Promise<string> {
  const keyMaterial = await webcrypto.subtle.importKey(
    'raw',
    Buffer.from(fingerprint + ENTROPY),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  const key = await webcrypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: Buffer.from('stellar-tipz-salt'),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const persistedState = JSON.stringify({
    state: {
      wallets: [{ publicKey: E2E_PUBLIC_KEY, walletType: 'freighter' }],
      activeWalletKey: E2E_PUBLIC_KEY,
      walletType: 'freighter',
      network: 'TESTNET',
      publicKey: E2E_PUBLIC_KEY,
      connected: true,
      sessionExpiresAt: Date.now() + 30 * 60 * 1000,
    },
    version: 1,
  });
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const encrypted = await webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    Buffer.from(JSON.stringify(persistedState)),
  );

  return JSON.stringify({
    version: 1,
    iv: Buffer.from(iv).toString('base64'),
    data: Buffer.from(encrypted).toString('base64'),
    expiry: null,
  });
}

export const test = base.extend<WalletFixtures>({
  connectedWallet: async ({ page }, use) => {
    await injectFreighterConnected(page, { publicKey: E2E_PUBLIC_KEY });
    await mockSorobanRpc(page);

    const fingerprint = await page.evaluate(() =>
      [
        navigator.userAgent,
        navigator.language,
        String(screen.colorDepth),
        String(screen.width),
      ].join('|'),
    );
    const walletPayload = await encryptWalletState(fingerprint);

    await page.addInitScript(
      ({ payload, entropy }) => {
        localStorage.setItem('_st_entropy', entropy);
        localStorage.setItem('tipz_tipz-wallet', payload);
        localStorage.setItem('tipz_onboarding', 'completed');
      },
      { payload: walletPayload, entropy: ENTROPY },
    );

    await page.goto('/transactions');
    await expect(
      page.getByText(
        new RegExp(`${E2E_PUBLIC_KEY.slice(0, 4)}.*${E2E_PUBLIC_KEY.slice(-4)}`),
      ),
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole('link', { name: 'Transactions' }).click();
    await expect(page).toHaveURL(/\/transactions$/);

    await use(page);
  },
});

export { expect } from '@playwright/test';
