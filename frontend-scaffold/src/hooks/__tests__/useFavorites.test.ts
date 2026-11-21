import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useFavorites } from "../useFavorites";
import { useWalletStore } from "../../store/walletStore";
import { useFavoritesStore } from "../../store/favoritesStore";
import { useToastStore } from "../../store/toastStore";
import {
  fetchFavorites,
  addFavoriteToServer,
  removeFavoriteFromServer,
} from "../../services/api/favorites";
import { ApiError } from "../../services/api/client";
import {
  setTokens,
  resetTokenManagerForTests,
} from "../../services/auth/tokenManager";

vi.mock("../../services/api/favorites", () => ({
  fetchFavorites: vi.fn(),
  addFavoriteToServer: vi.fn(),
  removeFavoriteFromServer: vi.fn(),
}));

function jwt(expSecFromNow: number): string {
  const header = btoa(JSON.stringify({ alg: "none" }));
  const payload = btoa(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expSecFromNow }),
  );
  return `${header}.${payload}.sig`;
}

const mockWallet = "GD1234567890ABCDEF";
const mockCreator = { address: "GABC123", username: "alice" };

function resetStores() {
  useWalletStore.setState({
    publicKey: mockWallet,
    connected: true,
  });
  useFavoritesStore.setState({
    favoritesByWallet: {},
    migratedByWallet: {},
    syncing: false,
  });
  useToastStore.setState({ visibleToasts: [], queuedToasts: [] });
  resetTokenManagerForTests();
  vi.mocked(fetchFavorites).mockReset();
  vi.mocked(addFavoriteToServer).mockReset().mockResolvedValue(undefined);
  vi.mocked(removeFavoriteFromServer).mockReset().mockResolvedValue(undefined);
}

function authenticate() {
  setTokens({ accessToken: jwt(900), refreshToken: "r1" });
}

describe("useFavorites", () => {
  beforeEach(() => {
    resetStores();
  });

  it("should add a creator to favorites", () => {
    const { result } = renderHook(() => useFavorites());

    act(() => {
      result.current.toggleFavorite(mockCreator);
    });

    expect(result.current.favorites).toHaveLength(1);
    expect(result.current.favorites[0].address).toBe(mockCreator.address);
    expect(result.current.isFavorite(mockCreator.address)).toBe(true);
  });

  it("should remove a creator from favorites", () => {
    const { result } = renderHook(() => useFavorites());

    act(() => {
      result.current.toggleFavorite(mockCreator);
    });
    expect(result.current.favorites).toHaveLength(1);

    act(() => {
      result.current.toggleFavorite(mockCreator);
    });
    expect(result.current.favorites).toHaveLength(0);
    expect(result.current.isFavorite(mockCreator.address)).toBe(false);
  });

  it("should sort favorites", () => {
    const { result } = renderHook(() => useFavorites());

    act(() => {
      result.current.toggleFavorite({ address: "ADDR1", username: "Charlie" });
      result.current.toggleFavorite({ address: "ADDR2", username: "Alice" });
      result.current.toggleFavorite({ address: "ADDR3", username: "Bob" });
    });

    const alpha = result.current.sortedFavorites("alphabetical");
    expect(alpha[0].username).toBe("Alice");
    expect(alpha[1].username).toBe("Bob");
    expect(alpha[2].username).toBe("Charlie");

    act(() => {
      result.current.recordTip("ADDR3");
      result.current.recordTip("ADDR3");
      result.current.recordTip("ADDR1");
    });

    const mostTipped = result.current.sortedFavorites("most_tipped");
    expect(mostTipped[0].username).toBe("Bob");
    expect(mostTipped[1].username).toBe("Charlie");
    expect(mostTipped[2].username).toBe("Alice");
  });

  it("should be wallet-specific", () => {
    const { result } = renderHook(() => useFavorites());

    act(() => {
      result.current.toggleFavorite(mockCreator);
    });
    expect(result.current.favorites).toHaveLength(1);

    act(() => {
      useWalletStore.setState({ publicKey: "GOTH888", connected: true });
    });

    expect(result.current.favorites).toHaveLength(0);

    act(() => {
      result.current.toggleFavorite({ address: "GXYZ", username: "bob" });
    });
    expect(result.current.favorites).toHaveLength(1);
    expect(result.current.favorites[0].username).toBe("bob");

    act(() => {
      useWalletStore.setState({ publicKey: mockWallet, connected: true });
    });
    expect(result.current.favorites).toHaveLength(1);
    expect(result.current.favorites[0].username).toBe("alice");
  });

  it("is not authenticated by default", () => {
    const { result } = renderHook(() => useFavorites());
    expect(result.current.isAuthenticated).toBe(false);
    expect(addFavoriteToServer).not.toHaveBeenCalled();
  });

  it("migrates local favorites on first authenticated load", async () => {
    useFavoritesStore.setState({
      favoritesByWallet: {
        [mockWallet]: [
          { address: "GABC123", username: "alice", addedAt: 1, tipCount: 0 },
        ],
      },
      migratedByWallet: { [mockWallet]: false },
    });
    vi.mocked(fetchFavorites).mockResolvedValue([
      { address: "GABC123", username: "alice", addedAt: 1, tipCount: 0 },
    ]);

    authenticate();
    renderHook(() => useFavorites());

    await waitFor(() => {
      expect(addFavoriteToServer).toHaveBeenCalledWith("alice");
      expect(fetchFavorites).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(useFavoritesStore.getState().migratedByWallet[mockWallet]).toBe(
        true,
      );
      expect(useFavoritesStore.getState().syncing).toBe(false);
    });
    expect(
      useFavoritesStore.getState().favoritesByWallet[mockWallet],
    ).toHaveLength(1);
  });

  it("does not duplicate entries when migration runs twice", async () => {
    useFavoritesStore.setState({
      favoritesByWallet: {
        [mockWallet]: [
          { address: "GABC123", username: "alice", addedAt: 1, tipCount: 0 },
        ],
      },
      migratedByWallet: { [mockWallet]: false },
    });
    const serverList = [
      { address: "GABC123", username: "alice", addedAt: 1, tipCount: 0 },
    ];
    vi.mocked(fetchFavorites).mockResolvedValue(serverList);

    authenticate();
    const { unmount } = renderHook(() => useFavorites());
    await waitFor(() => {
      expect(useFavoritesStore.getState().migratedByWallet[mockWallet]).toBe(
        true,
      );
    });
    unmount();

    // Force a second migration pass (flag cleared) — POST is idempotent, GET returns same list.
    useFavoritesStore.setState({ migratedByWallet: { [mockWallet]: false } });
    vi.mocked(fetchFavorites).mockClear();
    vi.mocked(addFavoriteToServer).mockClear();

    renderHook(() => useFavorites());
    await waitFor(() => {
      expect(addFavoriteToServer).toHaveBeenCalledWith("alice");
      expect(fetchFavorites).toHaveBeenCalled();
    });
    await waitFor(() => {
      const list = useFavoritesStore.getState().favoritesByWallet[mockWallet];
      expect(list).toHaveLength(1);
      expect(list[0].username).toBe("alice");
    });
  });

  it("syncs the list from the server after migration", async () => {
    vi.mocked(fetchFavorites).mockResolvedValue([
      { address: "GSRV1", username: "server-alice", addedAt: 10, tipCount: 3 },
      { address: "GSRV2", username: "server-bob", addedAt: 20, tipCount: 1 },
    ]);

    authenticate();
    const { result } = renderHook(() => useFavorites());

    await waitFor(() => {
      expect(result.current.favorites).toHaveLength(2);
    });
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isFavorite("GSRV1")).toBe(true);
  });

  it("keeps the optimistic change when the toggle fails offline (network error)", async () => {
    authenticate();
    vi.mocked(fetchFavorites).mockResolvedValue([]);
    vi.mocked(addFavoriteToServer).mockRejectedValue(
      new TypeError("Failed to fetch"),
    );

    const { result } = renderHook(() => useFavorites());
    await waitFor(() => {
      expect(fetchFavorites).toHaveBeenCalled();
    });

    act(() => {
      result.current.toggleFavorite(mockCreator);
    });

    await waitFor(() => {
      expect(addFavoriteToServer).toHaveBeenCalledWith("alice");
    });
    // Optimistic add is kept despite network failure.
    expect(result.current.favorites).toHaveLength(1);
    expect(result.current.isFavorite(mockCreator.address)).toBe(true);
    expect(useToastStore.getState().visibleToasts).toHaveLength(0);
  });

  it("rolls back and toasts when the server rejects the toggle (HTTP error)", async () => {
    authenticate();
    vi.mocked(fetchFavorites).mockResolvedValue([]);
    vi.mocked(addFavoriteToServer).mockRejectedValue(new ApiError(500));

    const { result } = renderHook(() => useFavorites());
    await waitFor(() => {
      expect(fetchFavorites).toHaveBeenCalled();
    });

    act(() => {
      result.current.toggleFavorite(mockCreator);
    });

    await waitFor(() => {
      expect(addFavoriteToServer).toHaveBeenCalledWith("alice");
      expect(result.current.favorites).toHaveLength(0);
      expect(useToastStore.getState().visibleToasts.length).toBeGreaterThan(0);
    });
    expect(result.current.isFavorite(mockCreator.address)).toBe(false);
  });

  it("does not call the API when unauthenticated", () => {
    const { result } = renderHook(() => useFavorites());

    act(() => {
      result.current.toggleFavorite(mockCreator);
    });

    expect(result.current.favorites).toHaveLength(1);
    expect(addFavoriteToServer).not.toHaveBeenCalled();
    expect(fetchFavorites).not.toHaveBeenCalled();
  });
});
