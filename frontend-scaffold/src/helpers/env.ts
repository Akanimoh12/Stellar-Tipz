type NetworkType = "TESTNET" | "FUTURENET" | "MAINNET";

interface EnvConfig {
  sorobanRpcUrl: string;
  horizonUrl: string;
  networkPassphrase: string;
  contractId: string;
  network: NetworkType;
}

/**
 * Safely reads environment variables from Vite
 */
function getEnv(): EnvConfig {
  const {
    VITE_SOROBAN_RPC_URL,
    VITE_HORIZON_URL,
    VITE_NETWORK_PASSPHRASE,
    VITE_CONTRACT_ID,
    VITE_NETWORK,
  } = (import.meta as any).env

  return {
    sorobanRpcUrl:
      VITE_SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org",

    horizonUrl:
      VITE_HORIZON_URL || "https://horizon-testnet.stellar.org",

    networkPassphrase:
      VITE_NETWORK_PASSPHRASE || "Test SDF Network ; September 2015",

    contractId: VITE_CONTRACT_ID || "",

    network: (VITE_NETWORK as NetworkType) || "TESTNET",
  };
}

export const env = getEnv();