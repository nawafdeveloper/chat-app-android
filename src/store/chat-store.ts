import { create } from 'zustand';

interface ChatStore {
    selectedChatId: string | null;
    selectChat: (id: string) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
    selectedChatId: null,
    selectChat: (id) => set({ selectedChatId: id })
}));