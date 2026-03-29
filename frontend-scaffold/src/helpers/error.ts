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
};

export type ErrorCategory = 'network' | 'contract' | 'not-found' | 'unknown';

export const categorizeError = (error: unknown): ErrorCategory => {
  if (!error) return 'unknown';

  const errorString = String(error).toLowerCase();

  if (
    errorString.includes('network') ||
    errorString.includes('fetch') ||
    errorString.includes('failed to fetch') ||
    errorString.includes('connection')
  ) {
    return 'network';
  }

  if (
    errorString.includes('not found') ||
    errorString.includes('404') ||
    errorString.includes('could not find')
  ) {
    return 'not-found';
  }

  if (
    errorString.includes('contract') ||
    errorString.includes('soroban') ||
    errorString.includes('simulation') ||
    errorString.includes('transaction')
  ) {
    return 'contract';
  }

  return 'contract'; // Default to generic contract error as per requirements
};
