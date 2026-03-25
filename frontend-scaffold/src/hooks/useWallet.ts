import { useMemo } from 'react';
import {
  StellarWalletsKit,
  WalletNetwork,
  FREIGHTER_ID,
  FreighterModule,
  AlbedoModule,
  xBullModule,
} from '@creit.tech/stellar-wallets-kit';
import { useWalletStore } from '../store/walletStore';

const kit = new StellarWalletsKit({
  network: WalletNetwork.TESTNET,
  selectedWalletId: FREIGHTER_ID,
  modules: [new FreighterModule(), new AlbedoModule(), new xBullModule()],
});

export const useWallet = () => {
  const { publicKey, connected, network, connect, disconnect } = useWalletStore();

  const actions = useMemo(() => ({
    connect: () => {
      kit.openModal({
        onWalletSelected: async (option) => {
          kit.setWallet(option.id);
          const { address } = await kit.getAddress();
          connect(address);
        },
      });
    },

    disconnect: () => {
      disconnect();
    },

    signTransaction: async (xdr: string): Promise<string> => {
      const { signedTxXdr } = await kit.signTransaction(xdr, {
        address: publicKey ?? undefined,
      });
      return signedTxXdr;
    },
  }), [publicKey, connect, disconnect]);

  return { publicKey, connected, network, ...actions };
};
