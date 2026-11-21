import { describe, expect, it, vi } from 'vitest';

vi.mock('./rpcClient.js', () => ({ rpcCall: vi.fn() }));

import { assertContractVersion } from './verifyContractVersion.js';

const contractId = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

describe('startup contract version gate', () => {
  it('accepts the configured interface version', async () => {
    const reader = vi.fn().mockResolvedValue(4);
    await expect(assertContractVersion(contractId, 'test-passphrase', 4, reader)).resolves.toBeUndefined();
    expect(reader).toHaveBeenCalledWith(contractId, 'test-passphrase');
  });

  it('rejects mismatched on-chain versions', async () => {
    await expect(assertContractVersion(contractId, 'test-passphrase', 4, async () => 3))
      .rejects.toThrow(/version mismatch/);
  });

  it('rejects missing contract IDs before querying the chain', async () => {
    const reader = vi.fn();
    await expect(assertContractVersion(undefined, 'passphrase', 4, reader))
      .rejects.toThrow(/CONTRACT_ID/);
    expect(reader).not.toHaveBeenCalled();
  });

  it('rejects unavailable chain data', async () => {
    await expect(assertContractVersion(contractId, 'test-passphrase', 4, async () => {
      throw new Error('RPC unavailable');
    })).rejects.toThrow('RPC unavailable');
  });
});
