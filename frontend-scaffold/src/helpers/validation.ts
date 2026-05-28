import { hasHomoglyphs } from './sanitize';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// Stellar ed25519 public keys: G + 55 base32 chars (A-Z, 2-7)
const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

// Well-known burn/null addresses that should never receive tips
const BURN_ADDRESSES = new Set([
  'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
  'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
]);

/**
 * Returns true when `address` is a structurally valid Stellar public key.
 * Checks format (G + 55 base32 chars = 56 total) and rejects burn addresses.
 */
export const isValidStellarAddress = (address: string): boolean => {
  const trimmed = address.trim();
  if (!STELLAR_ADDRESS_RE.test(trimmed)) return false;
  if (BURN_ADDRESSES.has(trimmed)) return false;
  return true;
};

/**
 * Full validation of a Stellar address with descriptive error messages.
 */
export const validateStellarAddress = (address: string): ValidationResult => {
  const trimmed = address.trim();

  if (!trimmed) {
    return { valid: false, error: "Wallet address is required." };
  }

  if (trimmed.length !== 56) {
    return {
      valid: false,
      error: `Wallet address must be exactly 56 characters (got ${trimmed.length}).`,
    };
  }

  if (!trimmed.startsWith('G')) {
    return {
      valid: false,
      error: "Wallet address must start with 'G' (Stellar public key).",
    };
  }

  if (!STELLAR_ADDRESS_RE.test(trimmed)) {
    return {
      valid: false,
      error: "Wallet address contains invalid characters. Only uppercase A-Z and digits 2-7 are allowed after the 'G'.",
    };
  }

  if (BURN_ADDRESSES.has(trimmed)) {
    return { valid: false, error: "Cannot send to a known burn address." };
  }

  return { valid: true };
};

/**
 * Sanitizes a Stellar address before contract calls: trims whitespace and
 * uppercases the string. Returns null when the result is not a valid address.
 */
export const sanitizeStellarAddress = (address: string): string | null => {
  const sanitized = address.trim().toUpperCase();
  return isValidStellarAddress(sanitized) ? sanitized : null;
};

/**
 * Returns a ValidationResult describing whether `address` can receive a tip.
 * Rejects invalid addresses and prevents sending to the connected wallet.
 */
export const canTipAddress = (
  address: string,
  connectedWallet?: string | null,
): ValidationResult => {
  const addressResult = validateStellarAddress(address);
  if (!addressResult.valid) return addressResult;

  if (connectedWallet && address.trim().toUpperCase() === connectedWallet.trim().toUpperCase()) {
    return { valid: false, error: "You cannot tip your own wallet address." };
  }

  return { valid: true };
};

/** Maximum tip message length — must stay in sync with the contract's validate_message (280 bytes). */
export const MAX_MESSAGE_LENGTH = 280;

const USERNAME_RE = /^[a-z][a-z0-9_]{2,31}$/;

export const validateUsername = (username: string): ValidationResult => {
  const trimmed = username.trim();

  if (trimmed.length < 3 || trimmed.length > 32) {
    return { valid: false, error: "Username must be 3-32 characters long." };
  }

  if (hasHomoglyphs(trimmed)) {
    return { valid: false, error: "Username contains potentially confusable characters." };
  }

  if (!USERNAME_RE.test(trimmed)) {
    return {
      valid: false,
      error:
        "Username must start with a letter and contain only lowercase letters, numbers, or underscores.",
    };
  }

  if (trimmed.endsWith("_")) {
    return { valid: false, error: "Username cannot end with an underscore." };
  }

  if (trimmed.includes("__")) {
    return { valid: false, error: "Username cannot contain consecutive underscores." };
  }

  return { valid: true };
};

export const validateDisplayName = (name: string): ValidationResult => {
  const trimmed = name.trim();

  if (trimmed.length === 0 || trimmed.length > 64) {
    return { valid: false, error: "Display name must be 1-64 characters." };
  }

  return { valid: true };
};

export const validateBio = (bio: string): ValidationResult => {
  if (bio.length > 280) {
    return { valid: false, error: "Bio must be 280 characters or fewer." };
  }

  return { valid: true };
};

export const validateMessage = (message: string): ValidationResult => {
  if (message.length > MAX_MESSAGE_LENGTH) {
    return { valid: false, error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.` };
  }

  return { valid: true };
};

const X_HANDLE_RE = /^@?[a-zA-Z0-9_]{1,15}$/;

export const validateXHandle = (handle: string): ValidationResult => {
  const trimmed = handle.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: "X handle cannot be empty." };
  }

  if (trimmed.length > 16) {
    return { valid: false, error: "X handle must be 16 characters or fewer." };
  }

  if (!X_HANDLE_RE.test(trimmed)) {
    return {
      valid: false,
      error: "X handle contains invalid characters. Only alphanumeric and underscores allowed.",
    };
  }

  if (trimmed === "@") {
    return { valid: false, error: "X handle cannot be just '@'." };
  }

  return { valid: true };
};
