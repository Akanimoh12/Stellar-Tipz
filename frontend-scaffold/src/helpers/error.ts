export const ERRORS = {
  UNSUPPORTED_NETWORK:
    "Unsupported network selected, please use Futurenet in Freighter",
  FREIGHTER_NOT_AVAILABLE: "Please install Freighter to connect your wallet",
  UNABLE_TO_SUBMIT_TX: "Unable to submit transaction",
  UNABLE_TO_SIGN_TX: "Unable to sign transaction",
  WALLET_CONNECTION_REJECTED: "Wallet connection rejected",
  NETWORK: "Unable to connect. Please check your internet connection.",
  CONTRACT: "Something went wrong with the contract. Please try again.",
  NOT_FOUND: "The requested content could not be found.",
  WALLET: "Wallet action failed. Please check your wallet and try again.",
  WALLET_NOT_INSTALLED:
    "Freighter extension not found. Please install Freighter to connect your wallet.",
  WALLET_LOCKED:
    "Freighter is locked. Please unlock your wallet and try again.",
  WALLET_REJECTED:
    "Connection was rejected. Please approve the connection request in your wallet.",
  WALLET_NETWORK_MISMATCH:
    "Network mismatch detected. Please switch your wallet to the correct network.",
  WALLET_TIMEOUT:
    "Connection timed out. Please try again and approve the connection in your wallet.",
  RATE_LIMITED: "Too many requests. Please wait a moment and try again.",
};

/**
 * Mapping of contract error codes to human-readable messages.
 * Each message explains what happened and what to do next.
 * Source: contracts/tipz/src/errors.rs
 */
export const CONTRACT_ERROR_CODES: Record<number, string> = {
  1: "The contract has not been initialized yet. Please contact support.",
  2: "The contract is already initialized. No further initialization is needed.",
  3: "You are not authorized to perform this action. Please check your permissions.",
  4: "An admin change is already pending. Please wait for the current change to complete.",
  5: "The admin change timelock has not been met yet. Please wait for the required time period.",
  6: "There is no pending admin change to complete. Start an admin change first.",
  7: "The contract is currently paused. Please try again later.",
  8: "This profile is not registered. Please register your profile first.",
  9: "This profile is already registered. You cannot register again.",
  10: "This username is already taken. Please choose a different username.",
  11: "The username format is invalid. Please use a valid username format.",
  12: "The display name format is invalid. Please use a valid display name format.",
  13: "The amount provided is invalid. Please check and try again.",
  14: "Insufficient balance. Please add funds to your wallet and try again.",
  15: "Your balance must be zero to perform this action. Please withdraw your remaining balance first.",
  16: "A mathematical overflow occurred. Please try with a smaller amount.",
  17: "The requested resource was not found. Please check your input and try again.",
  18: "This profile is already deactivated. No further deactivation is needed.",
  19: "This profile has been deactivated. Please activate it to perform this action.",
  20: "This profile is active. Deactivate it first, then try again.",
  21: "Your message is too long. Please shorten it and try again.",
  22: "The image URL provided is invalid. Please use a valid image URL.",
  23: "The batch size is too large. Please reduce the number of items and try again.",
  24: "The fee provided is invalid. Please check the fee amount and try again.",
  25: "You cannot tip yourself. Please send tips to other users.",
  26: "Your profile is not verified. Please complete verification to perform this action.",
  27: "Your profile is already verified. No further verification is needed.",
  28: "You are not authorized to perform this action. Please check your permissions.",
  29: "You have exceeded the rate limit. Please wait a moment and try again.",
  30: "The X (Twitter) handle format is invalid. Please provide a valid handle.",
  31: "The tip amount is below the minimum required. Please increase the amount.",
  32: "This profile is not active. Please activate your profile to perform this action.",
  33: "Your tip message contains invalid characters. Please remove any special characters and try again.",
  34: "The tip amount is below this creator's minimum requirement. Please increase the amount.",
  35: "The domain format is invalid. Please provide a valid domain.",
  36: "The input provided is invalid. Please check your input and try again.",
  37: "This token is not accepted. Please use an accepted token.",
  // Note: Error codes 38-39 are duplicated in the contract for different error types
  // Using refund-specific messages as they are more critical for user experience
  38: "The refund request window has expired. You can no longer request a refund for this tip.",
  39: "A refund has already been requested for this tip. Please wait for it to be processed.",
  40: "A refund has already been processed for this tip. Check the transaction history for its status.",
  41: "No refund request exists for this tip. Please check and try again.",
  42: "Only the tipper can request a refund. Connect the wallet that sent the tip, then try again.",
  43: "Only the creator can approve or reject a refund. Connect the creator wallet, then try again.",
};

/**
 * Mapping of API error codes to human-readable messages.
 * Each message explains what happened and what to do next.
 * Source: backend error handling
 */
export const API_ERROR_CODES: Record<string, string> = {
  BAD_REQUEST: "Invalid request. Please check your input and try again.",
  UNAUTHORIZED: "You need to log in to perform this action. Please authenticate and try again.",
  FORBIDDEN: "You don't have permission to perform this action. Please contact support if you believe this is an error.",
  NOT_FOUND: "The requested resource was not found. Please check your input and try again.",
  CONFLICT: "This action conflicts with existing data. Please refresh and try again.",
  INTERNAL_ERROR: "Something went wrong on our end. Please try again later.",
  VALIDATION_ERROR: "The input data is invalid. Please check your input and try again.",
};

/**
 * Extracts the contract error code from a Soroban error message.
 * Example: "Error(Contract, #8)" -> 8
 * Returns null if no code is found.
 */
export function extractContractErrorCode(errorMessage: string): number | null {
  const match = errorMessage.match(/Error\(Contract,\s*#\s*(\d+)\)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Extracts the API error code from an error response.
 * Example: { error: { code: 'BAD_REQUEST' } } -> 'BAD_REQUEST'
 * Returns null if no code is found.
 */
export function extractApiErrorCode(error: unknown): string | null {
  if (error && typeof error === 'object' && 'error' in error) {
    const errorObj = error.error;
    if (errorObj && typeof errorObj === 'object' && 'code' in errorObj) {
      return String(errorObj.code);
    }
  }
  return null;
}

/**
 * Reports an unmapped error to Sentry for tracking and future mapping.
 * This helps keep the error mapping current as the contract evolves.
 */
export async function reportUnmappedError(
  error: unknown,
  errorType: 'contract' | 'api' | 'unknown',
): Promise<void> {
  try {
    // Import Sentry dynamically to avoid circular dependencies
    const SentryModule = await import('@sentry/react');
    const Sentry = 'default' in SentryModule
      ? SentryModule.default || SentryModule
      : SentryModule;
    
    if (!Sentry || !Sentry.captureException) {
      console.warn('Sentry not available for error reporting');
      return;
    }
    
    const errorMessage = getErrorMessage(error);
    const errorCode = errorType === 'contract'
      ? extractContractErrorCode(errorMessage)
      : errorType === 'api'
        ? extractApiErrorCode(error)
        : null;
    
    Sentry.captureException(new Error(`Unmapped ${errorType} error: ${errorMessage}`), {
      tags: {
        errorType,
        errorCode: String(errorCode || 'unknown'),
      },
      extra: {
        originalError: errorMessage,
        code: errorCode,
      },
    });
  } catch (err) {
    console.error('Failed to report unmapped error to Sentry:', err);
  }
}

export type ErrorCategory =
  | "network"
  | "contract"
  | "wallet"
  | "not-found"
  | "validation"
  | "timeout"
  | "rate-limited"
  | "unknown";

export interface ErrorInfo {
  category: ErrorCategory;
  message: string;
  retryable: boolean;
  technicalDetails?: string;
}

/** Backwards-compatible name used by the shared frontend types. */
export type CategorizedError = ErrorInfo;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'error' in error) {
    const nestedError = error.error;
    if (
      nestedError &&
      typeof nestedError === 'object' &&
      'message' in nestedError &&
      typeof nestedError.message === 'string'
    ) {
      return nestedError.message;
    }
  }
  return String(error);
}

function reportUnmapped(error: unknown, errorType: 'contract' | 'api' | 'unknown'): void {
  void reportUnmappedError(error, errorType).catch((err) => {
    console.error('Failed to report unmapped error:', err);
  });
}

export type WalletErrorType =
  | "not-installed"
  | "locked"
  | "rejected"
  | "network-mismatch"
  | "timeout"
  | "unknown";

export const classifyWalletError = (
  error: unknown,
): { type: WalletErrorType; message: string } => {
  if (!error) return { type: "unknown", message: ERRORS.WALLET };

  const errorString = String(error).toLowerCase();

  if (
    errorString.includes("not installed") ||
    errorString.includes("extension not found") ||
    errorString.includes("freighter not available") ||
    errorString.includes("please install")
  ) {
    return { type: "not-installed", message: ERRORS.WALLET_NOT_INSTALLED };
  }

  if (
    errorString.includes("locked") ||
    errorString.includes("unlock")
  ) {
    return { type: "locked", message: ERRORS.WALLET_LOCKED };
  }

  if (
    errorString.includes("rejected") ||
    errorString.includes("cancelled") ||
    errorString.includes("canceled") ||
    errorString.includes("user declined") ||
    errorString.includes("user denied") ||
    errorString.includes("connection declined")
  ) {
    return { type: "rejected", message: ERRORS.WALLET_REJECTED };
  }

  if (
    errorString.includes("network") &&
    (errorString.includes("mismatch") ||
      errorString.includes("switch") ||
      errorString.includes("unsupported network"))
  ) {
    return {
      type: "network-mismatch",
      message: ERRORS.WALLET_NETWORK_MISMATCH,
    };
  }

  if (
    errorString.includes("timeout") ||
    errorString.includes("timed out") ||
    errorString.includes("popup closed")
  ) {
    return { type: "timeout", message: ERRORS.WALLET_TIMEOUT };
  }

  return { type: "unknown", message: ERRORS.WALLET };
};

export const categorizeError = (error: unknown): ErrorInfo => {
  if (!error) return {
    category: "unknown",
    message: "An unexpected error occurred.",
    retryable: true,
  };

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
    
    // Report unknown codes and contract failures without a parsable code.
    if (code === null || !CONTRACT_ERROR_CODES[code]) {
      reportUnmapped(error, 'contract');
    }
    
    return {
      category: "contract",
      message: contractMessage,
      retryable: false,
      ...(code !== null && { technicalDetails: `Contract error code: #${code}` }),
    };
  }

  // API errors from backend
  const apiCode = extractApiErrorCode(error);
  if (apiCode && API_ERROR_CODES[apiCode]) {
    return {
      category: "unknown",
      message: API_ERROR_CODES[apiCode],
      retryable: apiCode === 'BAD_REQUEST' || apiCode === 'INTERNAL_ERROR',
      technicalDetails: `API error code: ${apiCode}`,
    };
  }
  
  // Report unknown API codes, while keeping the user-facing message generic.
  if (apiCode && !API_ERROR_CODES[apiCode]) {
    reportUnmapped(error, 'api');
    return {
      category: 'unknown',
      message: 'An unexpected error occurred.',
      retryable: true,
      technicalDetails: `Unmapped API error code: ${apiCode}`,
    };
  }

  // Capture unexpected errors too, so newly introduced failure shapes can be mapped.
  reportUnmapped(error, 'unknown');

  // Default — UNKNOWN, not contract
  return {
    category: "unknown",
    message: "An unexpected error occurred.",
    retryable: true,
  };
};
