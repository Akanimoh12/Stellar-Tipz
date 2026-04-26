/**
 * Test doubles for the Stellar Wallets Kit (issue #476).
 *
 * The real `StellarWalletsKit` is constructed at module-load time inside
 * `useWallet.ts`, so tests `vi.mock("@creit.tech/stellar-wallets-kit", ...)`
 * with the factory below.  The mock exposes a single shared instance whose
 * mocks can be reset between tests via `resetWalletKit()`.
 *
 * Usage:
 *
 * ```ts
 * import { vi, beforeEach } from "vitest";
 * import {
 *   mockWalletsKitFactory,
 *   walletKitInstance,
 *   resetWalletKit,
 * } from "@/test/mocks/wallet";
 *
 * vi.mock("@creit.tech/stellar-wallets-kit", () => mockWalletsKitFactory());
 *
 * beforeEach(() => resetWalletKit());
 * ```
 */
import { vi, type Mock } from "vitest";

const FREIGHTER = "freighter";
const ALBEDO = "albedo";
const XBULL = "xbull";

/** A representative testnet public key (Stellar G-prefix, 56 chars). */
export const TEST_PUBLIC_KEY =
  "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWX";

/** Shared mock instance produced by the StellarWalletsKit constructor. */
export interface MockWalletsKitInstance {
  openModal: Mock;
  setWallet: Mock;
  getAddress: Mock;
  signTransaction: Mock;
  /** Records the last wallet id passed to `setWallet`. */
  selectedWalletId: string | null;
  /**
   * Triggers the `onWalletSelected` callback that the production hook passes
   * to `kit.openModal`.  Tests call this to simulate the user picking a
   * wallet from the modal.
   */
  pickWallet: (id?: string) => Promise<void>;
}

// A single, mutable instance.  The hook constructs the kit once at module
// load, so we never replace this object — we only reset its internals.
const sharedInstance = bootstrapInstance();

/** Returns the shared kit instance used by the production hook. */
export function walletKitInstance(): MockWalletsKitInstance {
  return sharedInstance;
}

/**
 * Resets the shared instance back to the default success behaviour.  Call
 * this from `beforeEach` so state does not leak between tests.
 */
export function resetWalletKit() {
  configureInstance(sharedInstance);
}

function bootstrapInstance(): MockWalletsKitInstance {
  const inst = {
    selectedWalletId: null,
    openModal: vi.fn(),
    setWallet: vi.fn(),
    getAddress: vi.fn(),
    signTransaction: vi.fn(),
    pickWallet: async () => {
      /* re-installed by configureInstance */
    },
  } as MockWalletsKitInstance;
  configureInstance(inst);
  return inst;
}

function configureInstance(inst: MockWalletsKitInstance) {
  let onSelected: ((opt: { id: string }) => void | Promise<void>) | null = null;

  inst.selectedWalletId = null;
  inst.openModal.mockReset();
  inst.setWallet.mockReset();
  inst.getAddress.mockReset();
  inst.signTransaction.mockReset();

  inst.openModal.mockImplementation(({ onWalletSelected }) => {
    onSelected = onWalletSelected;
  });
  inst.setWallet.mockImplementation((id: string) => {
    inst.selectedWalletId = id;
  });
  inst.getAddress.mockResolvedValue({ address: TEST_PUBLIC_KEY });
  inst.signTransaction.mockImplementation(async (xdr: string) => ({
    signedTxXdr: `signed:${xdr}`,
  }));

  inst.pickWallet = async (id = FREIGHTER) => {
    if (!onSelected) {
      throw new Error(
        "pickWallet() called before the production hook invoked openModal",
      );
    }
    await onSelected({ id });
  };
}

/**
 * Returns a `vi.mock` factory that replaces the entire
 * `@creit.tech/stellar-wallets-kit` module.  The constructor returns the
 * shared mock instance so the hook and the test code see the same object.
 */
export function mockWalletsKitFactory() {
  class StellarWalletsKit {
    constructor(_opts: unknown) {
      // Returning an object from a constructor makes `new` evaluate to that
      // object, so the production hook ends up holding a direct reference to
      // `sharedInstance` and sees `resetWalletKit()` mutations live.
      return sharedInstance as unknown as StellarWalletsKit;
    }
  }

  return {
    StellarWalletsKit,
    WalletNetwork: { TESTNET: "TESTNET", PUBLIC: "PUBLIC" },
    FREIGHTER_ID: FREIGHTER,
    ALBEDO_ID: ALBEDO,
    XBULL_ID: XBULL,
    FreighterModule: class {},
    AlbedoModule: class {},
    xBullModule: class {},
  };
}

/**
 * Convenience: configures the shared mock to reject on the *next* call to
 * `getAddress`, simulating a user dismissing the wallet popup.
 */
export function mockWalletRejectsAddress(
  message = "User rejected wallet connection",
) {
  walletKitInstance().getAddress.mockRejectedValueOnce(new Error(message));
}
