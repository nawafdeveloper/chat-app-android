import type { Contact } from "@/types/contacts.type";
import { create } from "zustand";

interface ContactDirectoryState {
    contacts: Contact[];
    isLoading: boolean;
    error: string | null;
    loadedForUserId: string | null;
    setContacts: (userId: string, contacts: Contact[]) => void;
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    reset: () => void;
}

export const useContactDirectoryStore = create<ContactDirectoryState>((set) => ({
    contacts: [],
    isLoading: false,
    error: null,
    loadedForUserId: null,
    setContacts: (userId, contacts) =>
        set({
            contacts,
            loadedForUserId: userId,
            error: null,
        }),
    setLoading: (isLoading) => set({ isLoading }),
    setError: (error) => set({ error }),
    reset: () =>
        set({
            contacts: [],
            isLoading: false,
            error: null,
            loadedForUserId: null,
        }),
}));
