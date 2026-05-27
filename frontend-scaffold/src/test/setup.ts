import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";
import { sorobanMock } from "./mocks/soroban";

class MockIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds = [];

  disconnect(): void {}

  observe(): void {}

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  unobserve(): void {}
}

if (!("IntersectionObserver" in window)) {
  Object.defineProperty(window, "IntersectionObserver", {
    writable: true,
    configurable: true,
    value: MockIntersectionObserver,
  });
}

// Recharts (ResponsiveContainer) depends on ResizeObserver in the DOM environment.
if (!("ResizeObserver" in window)) {
  class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(window, "ResizeObserver", {
    writable: true,
    configurable: true,
    value: MockResizeObserver,
  });
}

if (
  !("localStorage" in window) ||
  typeof window.localStorage.getItem !== "function"
) {
  const storage = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storage.set(key, String(value));
      }),
      removeItem: vi.fn((key: string) => {
        storage.delete(key);
      }),
      clear: vi.fn(() => {
        storage.clear();
      }),
    },
  });
}

if (!("matchMedia" in window)) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

Object.defineProperty(window, "isSecureContext", {
  configurable: true,
  value: true,
});

const mockWalletKit = {
  openModal: vi.fn(),
  setWallet: vi.fn(),
  getAddress: vi.fn(),
  signTransaction: vi.fn(),
  closeModal: vi.fn(),
  disconnect: vi.fn(),
};

vi.mock("@creit.tech/stellar-wallets-kit", () => ({
  StellarWalletsKit: vi.fn(function MockStellarWalletsKit() {
    return mockWalletKit;
  }),
  WalletNetwork: {
    TESTNET: "TESTNET",
    PUBLIC: "PUBLIC",
  },
  FREIGHTER_ID: "freighter",
  FreighterModule: vi.fn(function MockFreighterModule() {}),
  AlbedoModule: vi.fn(function MockAlbedoModule() {}),
  xBullModule: vi.fn(function MockXBullModule() {}),
  __mockWalletKit: mockWalletKit,
}));

vi.mock("@stellar/stellar-sdk", async () => {
  const actual = await vi.importActual<typeof import("@stellar/stellar-sdk")>(
    "@stellar/stellar-sdk",
  );

  return {
    ...actual,
    Contract: sorobanMock.Contract,
    TimeoutInfinite: 0,
    nativeToScVal: sorobanMock.nativeToScVal,
    xdr: actual.xdr ?? sorobanMock.xdr,
    Networks: {
      TESTNET: "Test SDF Network ; September 2015",
      PUBLIC: "Public Global Stellar Network ; September 2015",
    },
    SorobanRpc: {
      Server: vi.fn(function MockSorobanServer() {
        return sorobanMock.server;
      }),
      Api: {
        isSimulationSuccess: vi.fn((response: { error?: unknown }) => !response.error),
        isSimulationError: vi.fn((response: { error?: unknown }) => Boolean(response.error)),
        GetTransactionStatus: {
          NOT_FOUND: "NOT_FOUND",
          SUCCESS: "SUCCESS",
        },
      },
    },
  };
});
