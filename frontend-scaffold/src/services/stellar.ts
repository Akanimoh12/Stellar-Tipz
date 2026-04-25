import { env } from '../helpers/env';

/**
 * Truncates a Stellar address for display.
 * @param address The full Stellar address (G...)
 * @returns A truncated string (G...ABCD)
 */
export const truncateAddress = (address: string): string => {
  if (!address) return '';
  if (address.length <= 10) return address;
  return `${address.substring(0, 5)}...${address.substring(address.length - 5)}`;
};

/**
 * Fetches the native XLM balance for a Stellar account from Horizon.
 * @param publicKey The Stellar public key (G...)
 * @returns The native balance as a string
 * @throws Error if the request fails
 */
export const getBalance = async (publicKey: string): Promise<string> => {
  const response = await fetch(`${env.horizonUrl}/accounts/${publicKey}`);
  
  if (!response.ok) {
    throw new Error(`Error fetching balance: ${response.statusText}`);
  }

  const data = await response.json();
  const nativeBalance = Array.isArray(data.balances)
    ? data.balances.find(
        (entry: { asset_type?: string; balance?: string }) =>
          entry.asset_type === 'native'
      )
    : undefined;

  return nativeBalance?.balance || '0';
};

/**
 * Fetches account details from Horizon.
 * @param publicKey The Stellar public key (G...)
 * @returns The account data from Horizon
 * @throws Error if the request fails
 */
export const getAccount = async (publicKey: string) => {
  const response = await fetch(`${env.horizonUrl}/accounts/${publicKey}`);
  
  if (!response.ok) {
    throw new Error(`Error fetching account: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Fetches transactions for a Stellar account from Horizon.
 * @param publicKey The Stellar public key (G...)
 * @param limit Maximum number of transactions to return
 * @returns The transactions data from Horizon
 * @throws Error if the request fails
 */
export const getTransactions = async (publicKey: string, limit: number = 10) => {
  const response = await fetch(
    `${env.horizonUrl}/accounts/${publicKey}/transactions?limit=${limit}&order=desc`
  );
  
  if (!response.ok) {
    throw new Error(`Error fetching transactions: ${response.statusText}`);
  }

  return response.json();
};
