type NetworkType = "TESTNET" | "FUTURENET" | "MAINNET";

interface EnvConfig {
  sorobanRpcUrl: string;
  horizonUrl: string;
  networkPassphrase: string;
  contractId: string;
  network: NetworkType;
  useMockData: boolean;
}

/**
 * Safely reads environment variables from Vite
 */
export function getEnv(envVars?: Record<string, string | undefined>): EnvConfig {
  const source =
    envVars ??
    (import.meta as unknown as { env: Record<string, string | undefined> }).env ??
    {};

  const {
    VITE_SOROBAN_RPC_URL,
    VITE_HORIZON_URL,
    VITE_NETWORK_PASSPHRASE,
    VITE_CONTRACT_ID,
    VITE_NETWORK,
    VITE_USE_MOCK_DATA,
  } = source;

  return {
    sorobanRpcUrl: VITE_SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org",

    horizonUrl: VITE_HORIZON_URL || "https://horizon-testnet.stellar.org",

    networkPassphrase: VITE_NETWORK_PASSPHRASE || "Test SDF Network ; September 2015",

    contractId: VITE_CONTRACT_ID || "",

    network: (VITE_NETWORK as NetworkType) || "TESTNET",
    useMockData: VITE_USE_MOCK_DATA === "true",
  };
}

export const env = getEnv();
