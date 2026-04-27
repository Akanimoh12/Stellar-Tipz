import { vi } from "vitest";

type MockEntry =
  | { kind: "resolve"; value: unknown }
  | { kind: "reject"; value: unknown };

const queryResponses = new Map<string, MockEntry[]>();
const txResponses = new Map<string, MockEntry[]>();

const enqueue = (map: Map<string, MockEntry[]>, key: string, entry: MockEntry) => {
  const queue = map.get(key) ?? [];
  queue.push(entry);
  map.set(key, queue);
};

const dequeue = (map: Map<string, MockEntry[]>, key: string): MockEntry | undefined => {
  const queue = map.get(key);
  if (!queue || queue.length === 0) return undefined;
  const entry = queue.shift();
  if (queue.length === 0) {
    map.delete(key);
  }
  return entry;
};

const methodFromTx = (tx: unknown): string | undefined => {
  if (!tx || typeof tx !== "object") return undefined;

  const record = tx as {
    method?: string;
    operations?: Array<{ method?: string }>;
    toXDR?: () => string;
  };

  if (record.method) return record.method;
  if (Array.isArray(record.operations) && record.operations[0]?.method) {
    return record.operations[0].method;
  }

  if (typeof record.toXDR === "function") {
    try {
      const parsed = JSON.parse(record.toXDR());
      if (typeof parsed?.method === "string") {
        return parsed.method;
      }
      if (typeof parsed?.operations?.[0]?.method === "string") {
        return parsed.operations[0].method;
      }
    } catch {
      return undefined;
    }
  }

  return undefined;
};

class MockContract {
  contractId: string;

  constructor(contractId: string) {
    this.contractId = contractId;
  }

  call(method: string, ...args: unknown[]) {
    return { contractId: this.contractId, method, args };
  }
}

class MockTransactionBuilder {
  source: unknown;
  fee: string;
  networkPassphrase: string;
  operations: Array<{ contractId: string; method: string; args: unknown[] }> = [];
  timeout?: number;

  constructor(source: unknown, options: { fee: string; networkPassphrase: string }) {
    this.source = source;
    this.fee = options.fee;
    this.networkPassphrase = options.networkPassphrase;
  }

  addOperation(operation: { contractId: string; method: string; args: unknown[] }) {
    this.operations.push(operation);
    return this;
  }

  setTimeout(timeout: number) {
    this.timeout = timeout;
    return this;
  }

  build() {
    const operations = [...this.operations];
    const replacer = (_key: string, value: unknown) =>
      typeof value === "bigint" ? value.toString() : value;
    return {
      source: this.source,
      fee: this.fee,
      networkPassphrase: this.networkPassphrase,
      timeout: this.timeout,
      operations,
      method: operations[0]?.method,
      toXDR: () =>
        JSON.stringify({
          fee: this.fee,
          networkPassphrase: this.networkPassphrase,
          timeout: this.timeout,
          operations,
          method: operations[0]?.method,
        }, replacer),
    };
  }
}

const mockNativeToScVal = vi.fn((value: unknown) => value);

const mockServer = {
  simulateTransaction: vi.fn(async (tx: unknown) => {
    const method = methodFromTx(tx);
    if (!method) {
      throw new Error("No mock RPC method found");
    }

    const entry = dequeue(queryResponses, method);
    if (!entry) {
      throw new Error(`No mock response configured for ${method}`);
    }
    if (entry.kind === "reject") {
      throw entry.value;
    }
    return entry.value;
  }),
  sendTransaction: vi.fn(async (tx: unknown) => {
    const method = methodFromTx(tx);
    if (!method) {
      throw new Error("No mock RPC method found");
    }

    const entry = dequeue(txResponses, method);
    if (!entry) {
      throw new Error(`No mock transaction configured for ${method}`);
    }
    if (entry.kind === "reject") {
      throw entry.value;
    }

    return { status: "PENDING", hash: String(entry.value), errorResult: undefined };
  }),
  getAccount: vi.fn(async () => ({})),
  getTransaction: vi.fn(async () => ({
    status: "SUCCESS",
    resultXdr: { toXDR: () => "mock-tx-result" },
  })),
  prepareTransaction: vi.fn(async (tx: unknown) => tx),
};

export const sorobanMock = {
  Contract: MockContract,
  TransactionBuilder: MockTransactionBuilder,
  nativeToScVal: mockNativeToScVal,
  server: mockServer,
  xdr: {},
  reset() {
    queryResponses.clear();
    txResponses.clear();
    mockNativeToScVal.mockClear();
    mockServer.simulateTransaction.mockClear();
    mockServer.sendTransaction.mockClear();
    mockServer.getAccount.mockClear();
    mockServer.getTransaction.mockClear();
    mockServer.prepareTransaction.mockClear();
  },
  mockResponse(method: string, value: unknown) {
    enqueue(queryResponses, method, { kind: "resolve", value });
  },
  mockError(method: string, error: unknown) {
    enqueue(queryResponses, method, { kind: "reject", value: error });
  },
  mockTransaction(method: string, hash: string) {
    enqueue(txResponses, method, { kind: "resolve", value: hash });
  },
};

export const mockSorobanResponse = sorobanMock.mockResponse;
export const mockSorobanError = sorobanMock.mockError;
export const mockSorobanTransaction = sorobanMock.mockTransaction;
export const mockSorobanTransactionError = (method: string, error: unknown) => {
  enqueue(txResponses, method, { kind: "reject", value: error });
};
export const resetSorobanMocks = sorobanMock.reset;
export { mockServer };
