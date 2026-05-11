import { create } from "zustand";

type ImagePreviewBeforeSentStore = {
    isVisible: boolean;
    messageContext: string;
    imageUri: string | null;

    setIsVisible: (isVisible: boolean) => void;
    setImageUri: (imageUri: string | null) => void;
    show: (imageUri: string, messageContext?: string) => void;
    hide: () => void;
    setMessageContext: (messageContext: string) => void;
};

export const useImagePreviewBeforeSentStore = create<ImagePreviewBeforeSentStore>((set) => ({
    isVisible: false,
    messageContext: "",
    imageUri: null,

    setIsVisible: (isVisible) => set({ isVisible }),
    setImageUri: (imageUri) => set({ imageUri }),

    show: (imageUri, messageContext = "") =>
        set({ isVisible: true, imageUri, messageContext }),

    hide: () =>
        set({ isVisible: false, imageUri: null, messageContext: "" }),

    setMessageContext: (messageContext) =>
        set({ messageContext }),
}));