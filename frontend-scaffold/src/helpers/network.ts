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

/** Resolves the RPC/Horizon/passphrase tuple used by contract-facing hooks. */
export const getNetworkDetails = (walletNetwork: string): NetworkDetails => {
  if (env.network === "LOCAL") {
    return {
      network: "LOCAL",
      networkUrl: env.horizonUrl,
      networkPassphrase: env.networkPassphrase,
    };
  }

  if (walletNetwork === "TESTNET") {
    return {
      network: "TESTNET",
      networkUrl: env.horizonUrl,
      networkPassphrase: "Test SDF Network ; September 2015",
    };
  }

  return {
    network: "PUBLIC",
    networkUrl: "https://horizon.stellar.org",
    networkPassphrase: "Public Global Stellar Network ; September 2015",
  };
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
