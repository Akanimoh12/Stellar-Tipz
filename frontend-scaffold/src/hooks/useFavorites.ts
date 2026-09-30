import { useMemo, useCallback, useEffect } from "react";
import { useWalletStore } from "../store/walletStore";
import { useFavoritesStore } from "../store/favoritesStore";
import { useToastStore } from "../store/toastStore";
import {
  fetchFavorites,
  addFavoriteToServer,
  removeFavoriteFromServer,
} from "../services/api/favorites";
import { ApiError, AuthError } from "../services/api/client";
import { useAuthStatus } from "../services/auth/tokenManager";

/** HTTP/session failures roll back optimistic updates; network errors keep them (offline). */
function shouldRollback(err: unknown): boolean {
  return err instanceof ApiError || err instanceof AuthError;
}

export const useFavorites = () => {
  const publicKey = useWalletStore((state) => state.publicKey);
  const favoritesByWallet = useFavoritesStore(
    (state) => state.favoritesByWallet,
  );
  const migratedByWallet = useFavoritesStore((state) => state.migratedByWallet);
  const addFavorite = useFavoritesStore((state) => state.addFavorite);
  const removeFavorite = useFavoritesStore((state) => state.removeFavorite);
  const incrementTipCount = useFavoritesStore(
    (state) => state.incrementTipCount,
  );
  const setFavorites = useFavoritesStore((state) => state.setFavorites);
  const setSyncing = useFavoritesStore((state) => state.setSyncing);
  const addToast = useToastStore((state) => state.addToast);

  const authStatus = useAuthStatus();
  const isAuthenticated =
    authStatus === "authenticated" || authStatus === "refreshing";

  const favorites = useMemo(() => {
    if (!publicKey) return [];
    return favoritesByWallet[publicKey] || [];
  }, [favoritesByWallet, publicKey]);

  // One-time local → server migration + pull server list on first authenticated load.
  useEffect(() => {
    if (!publicKey || !isAuthenticated) return;
    const wallet = publicKey;
    let cancelled = false;

    void (async () => {
      setSyncing(true);
      try {
        const state = useFavoritesStore.getState();
        if (!state.migratedByWallet[wallet]) {
          const local = state.favoritesByWallet[wallet] || [];
          for (const f of local) {
            try {
              await addFavoriteToServer(f.username);
            } catch (err) {
              // Unknown creator (404): skip. Anything else (network/auth): abort mark.
              if (err instanceof ApiError && err.status === 404) continue;
              throw err;
            }
          }
          useFavoritesStore.getState().markMigrated(wallet);
        }
        const server = await fetchFavorites();
        if (!cancelled) {
          useFavoritesStore.getState().setFavorites(wallet, server);
        }
      } catch {
        // Offline / transient failure — keep whatever local list we have.
      } finally {
        if (!cancelled) useFavoritesStore.getState().setSyncing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- markMigrated/setFavorites/setSyncing are stable store actions
  }, [publicKey, isAuthenticated, migratedByWallet]);

  const isFavorite = useCallback(
    (address: string) => {
      return favorites.some((f) => f.address === address);
    },
    [favorites],
  );

  const syncToggle = useCallback(
    async (
      creator: { address: string; username: string },
      prev: typeof favorites,
      toServer: "add" | "remove",
    ) => {
      try {
        if (toServer === "add") {
          await addFavoriteToServer(creator.username);
        } else {
          await removeFavoriteFromServer(creator.username);
        }
      } catch (err) {
        if (shouldRollback(err) && publicKey) {
          setFavorites(publicKey, prev);
          addToast({
            message:
              toServer === "add"
                ? "Could not save favorite. Your change was undone."
                : "Could not remove favorite. Your change was undone.",
            type: "error",
          });
        }
        // Network/offline errors keep the optimistic local change.
      }
    },
    [publicKey, setFavorites, addToast],
  );

  const toggleFavorite = useCallback(
    (creator: { address: string; username: string }) => {
      if (!publicKey) return;
      const prev = favorites;
      const wasFavorite = isFavorite(creator.address);
      if (wasFavorite) {
        removeFavorite(publicKey, creator.address);
      } else {
        addFavorite(publicKey, creator);
      }
      if (!isAuthenticated) return;
      void syncToggle(creator, prev, wasFavorite ? "remove" : "add");
    },
    [
      publicKey,
      favorites,
      isFavorite,
      removeFavorite,
      addFavorite,
      isAuthenticated,
      syncToggle,
    ],
  );

  const recordTip = useCallback(
    (address: string) => {
      if (!publicKey) return;
      incrementTipCount(publicKey, address);
    },
    [publicKey, incrementTipCount],
  );

  const sortedFavorites = useCallback(
    (sortBy: "recent" | "most_tipped" | "alphabetical" = "recent") => {
      const result = [...favorites];
      switch (sortBy) {
        case "recent":
          return result.sort((a, b) => b.addedAt - a.addedAt);
        case "most_tipped":
          return result.sort((a, b) => b.tipCount - a.tipCount);
        case "alphabetical":
          return result.sort((a, b) => a.username.localeCompare(b.username));
        default:
          return result;
      }
    },
    [favorites],
  );

  const removeFavoriteForWallet = useCallback(
    (address: string) => {
      if (!publicKey) return;
      const existing = favorites.find((f) => f.address === address);
      const prev = favorites;
      removeFavorite(publicKey, address);
      if (!isAuthenticated || !existing) return;
      void syncToggle(existing, prev, "remove");
    },
    [publicKey, favorites, removeFavorite, isAuthenticated, syncToggle],
  );

  return {
    favorites,
    isFavorite,
    toggleFavorite,
    recordTip,
    sortedFavorites,
    removeFavorite: removeFavoriteForWallet,
    isAuthenticated,
  };
};
