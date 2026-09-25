/** A safe, normalized failure returned by the subscription charge classifier. */
export interface SubscriptionChargeFailure {
  code: string
  reason: string
  retryable: boolean
  contractCode: number | null
}

const CONTRACT_FAILURES: Record<number, Omit<SubscriptionChargeFailure, 'contractCode'>> = {
  3: {
    code: 'AUTHORIZATION_REVOKED',
    reason: 'The subscription authorization is no longer valid.',
    retryable: false,
  },
  7: {
    code: 'CONTRACT_PAUSED',
    reason: 'Subscription charges are temporarily paused.',
    retryable: true,
  },
  13: {
    code: 'INVALID_AMOUNT',
    reason: 'The subscription charge amount is invalid.',
    retryable: false,
  },
  14: {
    code: 'INSUFFICIENT_BALANCE',
    reason: 'There is not enough balance for this subscription charge.',
    retryable: true,
  },
  17: {
    code: 'SUBSCRIPTION_NOT_FOUND',
    reason: 'The subscription authorization no longer exists.',
    retryable: false,
  },
  18: {
    code: 'PROFILE_DEACTIVATED',
    reason: 'The creator profile is deactivated.',
    retryable: false,
  },
  24: {
    code: 'INVALID_SUBSCRIPTION_PARTIES',
    reason: 'The subscription parties are invalid.',
    retryable: false,
  },
  27: {
    code: 'RATE_LIMITED',
    reason: 'The subscription charge was temporarily rate limited.',
    retryable: true,
  },
  28: {
    code: 'BELOW_MINIMUM',
    reason: 'The subscription amount is below the allowed minimum.',
    retryable: false,
  },
  29: {
    code: 'BELOW_CREATOR_MINIMUM',
    reason: 'The subscription amount is below the creator minimum.',
    retryable: false,
  },
  31: {
    code: 'INVALID_SUBSCRIPTION',
    reason: 'The subscription configuration is invalid.',
    retryable: false,
  },
  32: {
    code: 'TOKEN_NOT_ACCEPTED',
    reason: 'The subscription token is not accepted.',
    retryable: false,
  },
};

const CONTRACT_CODE_PATTERN = /Error\(Contract,\s*#?(\d+)\)/i;
const NETWORK_CODE_PATTERN = /^(?:E(?:CONN|HOST|NET|PIPE|AI_)|ETIMEDOUT|UND_ERR_)/i;
const NETWORK_MESSAGE_PATTERN = /\b(?:network|rpc|transport|timeout|timed out|connection|socket)\b/i;

function extractNumericCode(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return null;
}

/** Extracts a Soroban contract code without exposing the surrounding RPC error. */
export function extractContractErrorCode(error: unknown): number | null {
  const visited = new Set<object>();

  function visit(value: unknown, depth: number): number | null {
    if (depth > 3) return null;
    if (typeof value === 'string') {
      const match = value.match(CONTRACT_CODE_PATTERN);
      return match ? Number(match[1]) : null;
    }
    if (typeof value !== 'object' || value === null || visited.has(value)) return null;
    visited.add(value);

    const record = value as Record<string, unknown>;
    const explicitlyContract =
      record.type === 'contract' ||
      record.kind === 'contract' ||
      record.errorType === 'contract' ||
      record.category === 'contract';
    if (explicitlyContract) {
      const code = extractNumericCode(record.code ?? record.errorCode);
      if (code !== null) return code;
    }

    for (const key of ['message', 'details', 'error', 'cause', 'response']) {
      const code = visit(record[key], depth + 1);
      if (code !== null) return code;
    }
    return null;
  }

  return visit(error, 0);
}

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>;
    return [record.code, record.message].filter((value) => typeof value === 'string').join(' ');
  }
  return '';
}

/** Classifies charge errors into bounded retryable or immediate terminal failures. */
export function classifySubscriptionChargeFailure(error: unknown): SubscriptionChargeFailure {
  const contractCode = extractContractErrorCode(error);
  if (contractCode !== null) {
    const known = CONTRACT_FAILURES[contractCode];
    if (known) return { ...known, contractCode };
    return {
      code: 'UNKNOWN_CONTRACT_ERROR',
      reason: 'The subscription charge could not be completed.',
      retryable: true,
      contractCode,
    };
  }

  const text = errorText(error);
  if (NETWORK_CODE_PATTERN.test(text) || NETWORK_MESSAGE_PATTERN.test(text)) {
    return {
      code: 'NETWORK_ERROR',
      reason: 'A temporary network error prevented the subscription charge.',
      retryable: true,
      contractCode: null,
    };
  }

  return {
    code: 'TEMPORARY_CHARGE_ERROR',
    reason: 'The subscription charge could not be completed and will be retried.',
    retryable: true,
    contractCode: null,
  };
}
