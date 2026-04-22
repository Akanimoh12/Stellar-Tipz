import BigNumber from "bignumber.js";

const snakeToCamel = (key: string): string =>
  key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

const camelToSnakeKey = (key: string): string =>
  key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/**
 * Recursively converts all object keys from snake_case to camelCase.
 * Handles nested objects and arrays of objects.
 * Required because Soroban contracts serialize struct fields in snake_case
 * while the frontend TypeScript types use camelCase.
 */
export const mapContractResponse = <T = unknown>(data: unknown): T => {
  if (Array.isArray(data)) {
    return data.map((item) => mapContractResponse(item)) as unknown as T;
  }
  if (data !== null && typeof data === "object") {
    return Object.fromEntries(
      Object.entries(data as Record<string, unknown>).map(([k, v]) => [
        snakeToCamel(k),
        mapContractResponse(v),
      ]),
    ) as T;
  }
  return data as T;
};

/**
 * Recursively converts all object keys from camelCase to snake_case.
 * Used when constructing arguments to send to the Soroban contract.
 */
export const camelToSnake = <T = unknown>(data: unknown): T => {
  if (Array.isArray(data)) {
    return data.map((item) => camelToSnake(item)) as unknown as T;
  }
  if (data !== null && typeof data === "object") {
    return Object.fromEntries(
      Object.entries(data as Record<string, unknown>).map(([k, v]) => [
        camelToSnakeKey(k),
        camelToSnake(v),
      ]),
    ) as T;
  }
  return data as T;
};

// used for display purposes
export const truncateString = (str: string) =>
  str ? `${str.slice(0, 5)}…${str.slice(-5)}` : "";

// Convert a Unix timestamp in seconds (Soroban contract format) to a Date object.
// All Tip.timestamp values in this app are in seconds.
export function formatTimestamp(seconds: number): Date {
  return new Date(seconds * 1000);
}

// conversion used to display the base fee and other XLM amounts
export const stroopToXlm = (
  stroops: BigNumber | string | number,
  decimals?: number,
): string => {
  let xlmValue: BigNumber;
  
  if (stroops instanceof BigNumber) {
    xlmValue = stroops.dividedBy(1e7);
  } else {
    xlmValue = new BigNumber(Number(stroops) / 1e7);
  }
  
  // Default to 2 decimal places for amounts, 7 for precise values
  const defaultDecimals = decimals !== undefined ? decimals : 2;
  
  return xlmValue.toFormat(defaultDecimals);
};

// conversion that returns BigNumber for backward compatibility
export const stroopToXlmBigNumber = (
  stroops: BigNumber | string | number,
): BigNumber => {
  if (stroops instanceof BigNumber) {
    return stroops.dividedBy(1e7);
  }
  return new BigNumber(Number(stroops) / 1e7);
};

export const xlmToStroop = (lumens: BigNumber | string): BigNumber => {
  if (lumens instanceof BigNumber) {
    return lumens.times(1e7);
  }
  // round to nearest stroop
  return new BigNumber(Math.round(Number(lumens) * 1e7));
};

// With a tokens set number of decimals, display the formatted value for an amount.
// Example - User A has 1000000001 of a token set to 7 decimals, display should be 100.0000001
export const formatTokenAmount = (amount: BigNumber, decimals: number) => {
  let formatted = amount.toString();

  if (decimals > 0) {
    formatted = amount.shiftedBy(-decimals).toFixed(decimals).toString();

    // Trim trailing zeros
    while (formatted[formatted.length - 1] === "0") {
      formatted = formatted.substring(0, formatted.length - 1);
    }

    if (formatted.endsWith(".")) {
      formatted = formatted.substring(0, formatted.length - 1);
    }
  }

  return formatted;
};
