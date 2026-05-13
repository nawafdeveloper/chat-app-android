import type { MessageMediaUploadFile } from "@/lib/message-media-upload";
import type { Contact } from "@/types/contacts.type";
import { create } from "zustand";

type NewGroupState = {
    selectedContacts: Contact[];
    groupName: string;
    groupAvatarUri: string | null;
    groupAvatarFile: MessageMediaUploadFile | null;
    error: string | null;

    toggleContact: (contact: Contact) => void;
    removeContact: (contactId: string) => void;
    isSelected: (contactId: string) => boolean;
    clearSelectedContacts: () => void;
    setGroupName: (name: string) => void;
    setGroupAvatar: (
        uri: string | null,
        file?: MessageMediaUploadFile | null
    ) => void;
    setError: (error: string | null) => void;
    resetStore: () => void;
};

const initialState = {
    selectedContacts: [],
    groupName: "",
    groupAvatarUri: null,
    groupAvatarFile: null,
    error: null,
};

export const useNewGroupStore = create<NewGroupState>((set, get) => ({
    ...initialState,

    toggleContact: (contact) => {
        const selectedContacts = get().selectedContacts;
        const exists = selectedContacts.some(
            (item) => item.contact_id === contact.contact_id
        );

        set({
            selectedContacts: exists
                ? selectedContacts.filter(
                    (item) => item.contact_id !== contact.contact_id
                )
                : [...selectedContacts, contact],
            error: null,
        });
    },

    removeContact: (contactId) =>
        set((state) => ({
            selectedContacts: state.selectedContacts.filter(
                (contact) => contact.contact_id !== contactId
            ),
            error: null,
        })),

    isSelected: (contactId) =>
        get().selectedContacts.some(
            (contact) => contact.contact_id === contactId
        ),

    clearSelectedContacts: () =>
        set({
            selectedContacts: [],
            error: null,
        }),

    setGroupName: (groupName) =>
        set({
            groupName: groupName.slice(0, 80),
            error: null,
        }),

    setGroupAvatar: (groupAvatarUri, groupAvatarFile = null) =>
        set({
            groupAvatarUri,
            groupAvatarFile,
            error: null,
        }),

    setError: (error) => set({ error }),

    resetStore: () => set(initialState),
}));
