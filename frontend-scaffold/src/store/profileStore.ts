import { create } from 'zustand';

import { Profile } from '@/types/contract';

interface ProfileState {
  profile: Profile | null;
  loading: boolean;
  error: string | null;
}

interface ProfileActions {
  setProfile: (profile: Profile) => void;
  clearProfile: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

type ProfileStore = ProfileState & ProfileActions;

export const useProfileStore = create<ProfileStore>((set) => ({
  profile: null,
  loading: false,
  error: null,

  setProfile: (profile) => set({ profile, loading: false, error: null }),

  clearProfile: () => set({ profile: null, loading: false, error: null }),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error }),
}));
