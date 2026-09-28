import { create } from "zustand";
import { persist } from "zustand/middleware";
import { FavoriteCreator } from "../types";

interface FavoritesState {
  favoritesByWallet: { [publicKey: string]: FavoriteCreator[] };
  /** Wallets whose local list has been migrated to the server at least once. */
  migratedByWallet: { [publicKey: string]: boolean };
  /** True while a server sync/migration fetch is in flight. */
  syncing: boolean;
  addFavorite: (
    walletAddress: string,
    creator: Omit<FavoriteCreator, "addedAt" | "tipCount">,
  ) => void;
  removeFavorite: (walletAddress: string, creatorAddress: string) => void;
  incrementTipCount: (walletAddress: string, creatorAddress: string) => void;
  /** Replace the list for a wallet (server sync / rollback). */
  setFavorites: (walletAddress: string, favorites: FavoriteCreator[]) => void;
  /** Persist that a wallet's local favorites were migrated (or already empty). */
  markMigrated: (walletAddress: string) => void;
  setSyncing: (syncing: boolean) => void;
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set) => ({
      favoritesByWallet: {},
      migratedByWallet: {},
      syncing: false,

      addFavorite: (walletAddress, creator) =>
        set((state) => {
          const walletFavorites = state.favoritesByWallet[walletAddress] || [];
          if (walletFavorites.some((f) => f.address === creator.address)) {
            return state;
          }
          return {
            favoritesByWallet: {
              ...state.favoritesByWallet,
              [walletAddress]: [
                ...walletFavorites,
                { ...creator, addedAt: Date.now(), tipCount: 0 },
              ],
            },
          };
        }),

      removeFavorite: (walletAddress, creatorAddress) =>
        set((state) => ({
          favoritesByWallet: {
            ...state.favoritesByWallet,
            [walletAddress]: (
              state.favoritesByWallet[walletAddress] || []
            ).filter((f) => f.address !== creatorAddress),
          },
        })),

      incrementTipCount: (walletAddress, creatorAddress) =>
        set((state) => ({
          favoritesByWallet: {
            ...state.favoritesByWallet,
            [walletAddress]: (state.favoritesByWallet[walletAddress] || []).map(
              (f) =>
                f.address === creatorAddress
                  ? { ...f, tipCount: f.tipCount + 1 }
                  : f,
            ),
          },
        })),

      setFavorites: (walletAddress, favorites) =>
        set((state) => ({
          favoritesByWallet: {
            ...state.favoritesByWallet,
            [walletAddress]: favorites,
          },
        })),

      markMigrated: (walletAddress) =>
        set((state) => ({
          migratedByWallet: {
            ...state.migratedByWallet,
            [walletAddress]: true,
          },
        })),

      setSyncing: (syncing) => set({ syncing }),
    }),
    {
      name: "tipz_favorites",
    },
  ),
);
