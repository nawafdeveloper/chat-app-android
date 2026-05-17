import { create } from "zustand";

type NotificationNavigationState = {
    pendingChatId: string | null;
    setPendingChatId: (chatId: string) => void;
    clearPendingChatId: (chatId?: string) => void;
};

export const useNotificationNavigationStore = create<NotificationNavigationState>((set) => ({
    pendingChatId: null,

    setPendingChatId: (chatId) => set({ pendingChatId: chatId }),

    clearPendingChatId: (chatId) =>
        set((state) => {
            if (chatId && state.pendingChatId !== chatId) {
                return state;
            }

            return { pendingChatId: null };
        }),
}));
