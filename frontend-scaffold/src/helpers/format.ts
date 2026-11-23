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

const formatLocaleNumber = (
  value: BigNumber,
  fractionDigits: number,
  locale?: string,
): string => {
  const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const parts = formatter.formatToParts(-1234567890123.4);
  const integerGroups = parts.filter((part) => part.type === "integer");
  const groupSize = integerGroups.length
    ? [...integerGroups[integerGroups.length - 1].value].length
    : 3;
  const secondaryGroupSize =
    integerGroups.length > 1
      ? [...integerGroups[integerGroups.length - 2].value].length
      : groupSize;
  const localizedDigits = Array.from({ length: 10 }, (_, digit) =>
    new Intl.NumberFormat(locale, { useGrouping: false }).format(digit),
  );
  const formatted = value.toFormat(fractionDigits, BigNumber.ROUND_HALF_UP, {
    decimalSeparator:
      parts.find((part) => part.type === "decimal")?.value ?? ".",
    groupSeparator: parts.find((part) => part.type === "group")?.value ?? ",",
    groupSize,
    secondaryGroupSize,
  });

  return formatted.replace(/[0-9]/g, (digit) => localizedDigits[Number(digit)]);
};

// conversion used to display the base fee and other XLM amounts
export const stroopToXlm = (
  stroops: BigNumber | string | number,
  decimals?: number,
  locale?: string,
): string => {
  const xlmValue = new BigNumber(stroops.toString()).dividedBy(1e7);

  // Default to 2 decimal places for amounts, 7 for precise values
  const defaultDecimals = decimals !== undefined ? decimals : 2;

  return formatLocaleNumber(xlmValue, defaultDecimals, locale);
};

// conversion that returns BigNumber for backward compatibility
export const stroopToXlmBigNumber = (
  stroops: BigNumber | string | number,
): BigNumber => {
  return new BigNumber(stroops.toString()).dividedBy(1e7);
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

export const formatXlmDisplay = (value: BigNumber, locale?: string): string => {
  const decimalPlaces = value.decimalPlaces() ?? 0;
  const fractionDigits = Math.min(7, Math.max(2, decimalPlaces));

  return formatLocaleNumber(value, fractionDigits, locale);
};

export const formatCurrency = (
  value: number,
  currency = "USD",
  locale?: string,
): string =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(value);
