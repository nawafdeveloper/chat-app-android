import { create } from 'zustand';

type AuthStore = {
    hasSession: boolean;
    setHasSession: (val: boolean) => void;
};

export const useAuthStore = create<AuthStore>((set) => ({
    hasSession: false,
    setHasSession: (val) => set({ hasSession: val }),
}));