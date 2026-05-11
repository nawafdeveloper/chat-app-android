import { create } from "zustand";

type VideoPreviewBeforeSentStore = {
    isVideoVisible: boolean;
    videoMessageContext: string;
    videoUrl: string | null;

    setIsVideoVisible: (isVideoVisible: boolean) => void;
    setVideoUrl: (videoUrl: string | null) => void;
    show: (videoUrl: string, videoMessageContext?: string) => void;
    hide: () => void;
    setVideoMessageContext: (videoMessageContext: string) => void;
};

export const useVideoPreviewBeforeSentStore = create<VideoPreviewBeforeSentStore>((set) => ({
    isVideoVisible: false,
    videoMessageContext: "",
    videoUrl: null,

    setIsVideoVisible: (isVideoVisible) => set({ isVideoVisible }),
    setVideoUrl: (videoUrl) => set({ videoUrl }),

    show: (videoUrl, videoMessageContext = "") =>
        set({ isVideoVisible: true, videoUrl, videoMessageContext }),

    hide: () =>
        set({ isVideoVisible: false, videoUrl: null, videoMessageContext: "" }),

    setVideoMessageContext: (videoMessageContext) =>
        set({ videoMessageContext }),
}));