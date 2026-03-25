import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit";
import { env } from "./env";

export interface NetworkDetails {
  network: string;
  networkUrl: string;
  networkPassphrase: string;
}

export const TESTNET_DETAILS = {
  network: env.network,
  networkUrl: env.horizonUrl,
  networkPassphrase: env.networkPassphrase,
};

export const signTx = async (
  xdr: string,
  publicKey: string,
  kit: StellarWalletsKit,
) => {
  const { signedTxXdr } = await kit.signTransaction(xdr, {
    address: publicKey,
  });
  return signedTxXdr;
};
