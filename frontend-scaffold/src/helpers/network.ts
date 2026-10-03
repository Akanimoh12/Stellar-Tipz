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

/**
 * Returns the Stellar Expert explorer URL for a transaction based on the current network
 * @param hash - Transaction hash
 * @param network - Network type (LOCAL, TESTNET, FUTURENET, MAINNET). Defaults to env.network
 * @returns Full URL to the explorer
 */
export const getExplorerTxUrl = (
  hash: string,
  network: string = env.network,
): string => {
  const baseUrl = "https://stellar.expert/explorer";
  
  switch (network.toUpperCase()) {
    case "LOCAL":
      return `${env.horizonUrl.replace(/\/+$/, "")}/transactions/${hash}`;
    case "TESTNET":
      return `${baseUrl}/testnet/tx/${hash}`;
    case "FUTURENET":
      return `${baseUrl}/futurenet/tx/${hash}`;
    case "MAINNET":
    case "PUBLIC":
      return `${baseUrl}/public/tx/${hash}`;
    default:
      return `${baseUrl}/testnet/tx/${hash}`;
  }
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
