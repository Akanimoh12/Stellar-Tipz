export const ERRORS = {
  UNSUPPORTED_NETWORK:
    "Unsupported network selected, please use Futurenet in Freighter",
  FREIGHTER_NOT_AVAILABLE: "Please install Freighter to connect your wallet",
  UNABLE_TO_SUBMIT_TX: "Unable to submit transaction",
  UNABLE_TO_SIGN_TX: "Unable to sign transaction",
  WALLET_CONNECTION_REJECTED: "Wallet connection rejected",
  NETWORK: "Unable to connect. Please check your internet connection.",
  CONTRACT: "Something went wrong. Please try again.",
  NOT_FOUND: "The requested content could not be found.",
  WALLET: "Wallet action failed. Please check your wallet and try again.",
  RATE_LIMITED: "Too many requests. Please wait a moment before trying again.",
};

export type ErrorCategory =
  | "network"
  | "contract"
  | "wallet"
  | "not-found"
  | "validation"
  | "timeout"
  | "rate-limited"
  | "unknown";

export interface CategorizedError {
  category: ErrorCategory;
  message: string;
  retryable: boolean;
}

/** Maps Soroban contract error codes to human-readable messages. */
const CONTRACT_ERROR_CODES: Record<number, string> = {
  1: "Contract not initialized.",
  2: "Profile already registered.",
  3: "Username is already taken.",
  4: "Profile not found.",
  5: "Invalid username format.",
  6: "Invalid display name.",
  7: "Invalid image URL.",
  8: "Insufficient balance.",
  9: "Invalid tip amount.",
  10: "Cannot tip yourself.",
  11: "Message is too long (max 280 characters).",
  12: "Contract is paused.",
  13: "Unauthorized — admin only.",
  14: "Tip amount is below the minimum.",
  15: "Balance is not zero.",
};

/** Extract Soroban error code from message like "Error(Contract, #8)" */
function extractContractErrorCode(msg: string): number | null {
  const match = msg.match(/Error\(Contract,\s*#(\d+)\)/i);
  return match ? parseInt(match[1], 10) : null;
}

export const categorizeError = (error: unknown): CategorizedError => {
  if (!error) {
    return { category: "unknown", message: "An unexpected error occurred.", retryable: true };
  }

  const errorString = String(error).toLowerCase();
  const rawMessage = error instanceof Error ? error.message : String(error);

  // Timeout
  if (
    errorString.includes("timeout") ||
    errorString.includes("timed out") ||
    errorString.includes("polling timeout")
  ) {
    return {
      category: "timeout",
      message: "The request timed out. Please try again.",
      retryable: true,
    };
  }

  // Network
  if (
    errorString.includes("failed to fetch") ||
    errorString.includes("networkerror") ||
    errorString.includes("network error") ||
    errorString.includes("net::err") ||
    errorString.includes("connection refused") ||
    errorString.includes("connection reset") ||
    (error instanceof TypeError && errorString.includes("fetch"))
  ) {
    return {
      category: "network",
      message: "Network error. Please check your connection.",
      retryable: true,
    };
  }

  // Not found
  if (
    errorString.includes("not found") ||
    errorString.includes("notfound") ||
    errorString.includes("404") ||
    errorString.includes("could not find")
  ) {
    return {
      category: "not-found",
      message: ERRORS.NOT_FOUND,
      retryable: false,
    };
  }

  // Wallet rejection / cancellation
  if (
    errorString.includes("user declined") ||
    errorString.includes("user rejected") ||
    errorString.includes("transaction rejected by user") ||
    errorString.includes("declined") ||
    errorString.includes("cancelled") ||
    errorString.includes("canceled") ||
    errorString.includes("denied") ||
    errorString.includes("closed modal") ||
    errorString.includes("freighter") ||
    errorString.includes("xbull") ||
    errorString.includes("albedo") ||
    errorString.includes("extension not found") ||
    errorString.includes("wallet")
  ) {
    return {
      category: "wallet",
      message: "Transaction was rejected by your wallet.",
      retryable: false,
    };
  }

  // Validation
  if (
    errorString.includes("invalid amount") ||
    errorString.includes("invalid username") ||
    errorString.includes("invalid address") ||
    errorString.includes("validation") ||
    errorString.includes("too long") ||
    errorString.includes("too short") ||
    errorString.includes("required field")
  ) {
    return {
      category: "validation",
      message: "Please check your input and try again.",
      retryable: false,
    };
  }

  // Rate limited
  if (
    errorString.includes("rate limit") ||
    errorString.includes("rate_limit") ||
    errorString.includes("too many requests") ||
    errorString.includes("429") ||
    errorString.includes("rate-limited")
  ) {
    return {
      category: "rate-limited",
      message: ERRORS.RATE_LIMITED,
      retryable: true,
    };
  }

  // Contract — check for Soroban error code first
  if (
    errorString.includes("error(contract") ||
    errorString.includes("soroban") ||
    errorString.includes("simulation") ||
    errorString.includes("contract")
  ) {
    const code = extractContractErrorCode(rawMessage);
    const contractMessage =
      code !== null && CONTRACT_ERROR_CODES[code]
        ? CONTRACT_ERROR_CODES[code]
        : ERRORS.CONTRACT;
    return {
      category: "contract",
      message: contractMessage,
      retryable: false,
    };
  }

  // Default — UNKNOWN, not contract
  return {
    category: "unknown",
    message: "An unexpected error occurred.",
    retryable: true,
  };
};
