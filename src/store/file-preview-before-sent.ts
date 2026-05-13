import { create } from "zustand";

export type PendingFileAttachment = {
    uri: string;
    name: string;
    mimeType: string | null;
    size: number | null;
};

type FilePreviewBeforeSentStore = {
    isFileVisible: boolean;
    fileMessageContext: string;
    file: PendingFileAttachment | null;
    show: (file: PendingFileAttachment, fileMessageContext?: string) => void;
    hide: () => void;
    setFileMessageContext: (fileMessageContext: string) => void;
};

export const useFilePreviewBeforeSentStore = create<FilePreviewBeforeSentStore>((set) => ({
    isFileVisible: false,
    fileMessageContext: "",
    file: null,

    show: (file, fileMessageContext = "") =>
        set({ isFileVisible: true, file, fileMessageContext }),

    hide: () =>
        set({ isFileVisible: false, file: null, fileMessageContext: "" }),

    setFileMessageContext: (fileMessageContext) =>
        set({ fileMessageContext }),
}));
