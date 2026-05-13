import type { Contact } from "@/types/contacts.type";
import { create } from "zustand";

type ContactPreviewBeforeSentStore = {
    isContactVisible: boolean;
    selectedContactIds: string[];
    show: () => void;
    hide: () => void;
    toggleContact: (contact: Contact) => void;
    clearSelection: () => void;
};

export const useContactPreviewBeforeSentStore = create<ContactPreviewBeforeSentStore>((set) => ({
    isContactVisible: false,
    selectedContactIds: [],

    show: () => set({ isContactVisible: true, selectedContactIds: [] }),

    hide: () => set({ isContactVisible: false, selectedContactIds: [] }),

    toggleContact: (contact) =>
        set((state) => {
            const exists = state.selectedContactIds.includes(contact.contact_id);

            return {
                selectedContactIds: exists
                    ? state.selectedContactIds.filter((id) => id !== contact.contact_id)
                    : [...state.selectedContactIds, contact.contact_id],
            };
        }),

    clearSelection: () => set({ selectedContactIds: [] }),
}));
