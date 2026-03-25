/** State of the connected Stellar wallet. */
export interface WalletState {
  publicKey: string | null;
  connected: boolean;
  network: "TESTNET" | "PUBLIC";
}
