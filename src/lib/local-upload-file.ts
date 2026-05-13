import type { MessageMediaUploadFile } from "@/lib/message-media-upload";
import { Buffer } from "buffer";
import {
    EncodingType,
    getInfoAsync,
    readAsStringAsync,
} from "expo-file-system/legacy";

function uint8ArrayToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const arrayBuffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(arrayBuffer).set(bytes);
    return arrayBuffer;
}

function getFileNameFromUri(uri: string, fallbackName: string) {
    return decodeURIComponent(
        uri.split("?")[0].split("/").filter(Boolean).pop() ?? fallbackName
    );
}

export async function createUploadFileFromLocalUri({
    uri,
    fallbackName,
    mimeType,
    size,
}: {
    uri: string;
    fallbackName: string;
    mimeType?: string | null;
    size?: number | null;
}): Promise<MessageMediaUploadFile> {
    const name = fallbackName || getFileNameFromUri(uri, `file-${Date.now()}`);
    const info = await getInfoAsync(uri);
    const resolvedSize =
        typeof size === "number"
            ? size
            : info.exists && typeof info.size === "number"
                ? info.size
                : 0;

    return {
        uri,
        name,
        type: mimeType ?? "application/octet-stream",
        size: resolvedSize,
        arrayBuffer: async () => {
            const base64 = await readAsStringAsync(uri, {
                encoding: EncodingType.Base64,
            });
            return uint8ArrayToArrayBuffer(Buffer.from(base64, "base64"));
        },
    };
}

export function formatFileSize(bytes?: number | null) {
    if (!bytes || bytes <= 0) {
        return "";
    }

    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }

    const formatted =
        value >= 10 || unitIndex === 0 ? Math.round(value).toString() : value.toFixed(1);

    return `${formatted} ${units[unitIndex]}`;
}
