import { MessageMediaRecipientPublicKeyInput, MessageMediaUploadResult } from "@/types/messages";
import { Buffer } from "buffer";
import {
    cacheDirectory,
    deleteAsync,
    EncodingType,
    writeAsStringAsync,
} from "expo-file-system/legacy";
import { authClient } from "./auth-client";
import { importPublicKey } from "./crypto-keys";
import { base64ToBuffer, bufferToBase64 } from "./crypto-pin";
import { encryptFileWithAes } from "./encrypt-file";
import { parseManagedMessageMediaUrl } from "./message-media";
import { buildMediaDebugHeaders, logMediaDebug } from "./message-media-debug";

export type MessageMediaUploadFile = {
    name: string;
    type: string;
    size: number;
    uri?: string;
    arrayBuffer: () => Promise<ArrayBuffer>;
};

type MessageMediaPreviewUploadInput = Blob | MessageMediaUploadFile | null;
type MessageMediaPreviewUploadFile = MessageMediaUploadFile & { uri: string };
type UploadFormFile = {
    uri: string;
    name: string;
    type: string;
    cleanup?: () => Promise<void>;
};

async function encryptAesKeyWithPublicKey(
    aesKeyBase64: string,
    publicKey: CryptoKey
): Promise<string> {
    const aesKeyBytes = base64ToBuffer(aesKeyBase64);
    const encrypted = await crypto.subtle.encrypt(
        { name: "RSA-OAEP" },
        publicKey,
        aesKeyBytes.buffer.slice(
            aesKeyBytes.byteOffset,
            aesKeyBytes.byteOffset + aesKeyBytes.byteLength
        ) as ArrayBuffer
    );

    return bufferToBase64(encrypted);
}

function getSafeFileName(fileName: string) {
    return fileName.replace(/[^a-zA-Z0-9._-]+/g, "_") || "message-media";
}

async function writeTempUploadFile({
    bytes,
    name,
    type,
}: {
    bytes: Uint8Array;
    name: string;
    type: string;
}) {
    const uri = `${cacheDirectory ?? ""}${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}-${getSafeFileName(name)}`;

    await writeAsStringAsync(uri, Buffer.from(bytes).toString("base64"), {
        encoding: EncodingType.Base64,
    });

    return {
        uri,
        name,
        type,
        cleanup: () => deleteAsync(uri, { idempotent: true }),
    };
}

async function blobToTempUploadFile(blob: Blob, name: string) {
    const bytes = new Uint8Array(await blob.arrayBuffer());

    return writeTempUploadFile({
        bytes,
        name,
        type: blob.type || "application/octet-stream",
    });
}

function isLocalUploadPreview(
    preview: MessageMediaPreviewUploadInput
): preview is MessageMediaPreviewUploadFile {
    return Boolean(
        preview &&
        "uri" in preview &&
        typeof preview.uri === "string" &&
        preview.uri.length > 0
    );
}

function isBlobPreview(preview: MessageMediaPreviewUploadInput): preview is Blob {
    return typeof Blob !== "undefined" && preview instanceof Blob;
}

function appendUploadPart(
    formData: FormData,
    fieldName: string,
    file: { uri: string; name: string; type: string }
) {
    formData.append(fieldName, {
        uri: file.uri,
        name: file.name,
        type: file.type,
    } as any);
}

export async function persistDecryptedMessageMedia(
    objectKeyOrUrl: string,
    blob: { type?: string | null; size?: number | null }
) {
    const parsed =
        parseManagedMessageMediaUrl(objectKeyOrUrl) ??
        ({ objectKey: objectKeyOrUrl } as const);

    // await cacheMessageMedia(parsed.objectKey, blob);
    logMediaDebug("client.decrypt.persisted-cache", {
        objectKey: parsed.objectKey,
        mimeType: blob.type || null,
        size: blob.size,
    });
}

export async function uploadEncryptedMessageMedia(
    file: MessageMediaUploadFile,
    recipientPublicKeys: MessageMediaRecipientPublicKeyInput[],
    previewBlobOverride?: MessageMediaPreviewUploadInput,
    debugTraceId?: string
): Promise<MessageMediaUploadResult> {
    if (recipientPublicKeys.length === 0) {
        throw new Error("At least one recipient public key is required.");
    }

    logMediaDebug("client.upload.start", {
        debugTraceId: debugTraceId ?? null,
        fileName: file.name,
        fileType: file.type || null,
        fileSize: file.size,
        recipientCount: recipientPublicKeys.length,
        hasPreviewOverride: previewBlobOverride !== undefined,
    });

    const normalizedRecipientKeys = await Promise.all(
        recipientPublicKeys.map(async (recipient) => ({
            recipientUserId: recipient.recipientUserId,
            publicKey:
                typeof recipient.publicKey === "string"
                    ? await importPublicKey(recipient.publicKey)
                    : recipient.publicKey,
        }))
    );

    const { encryptedData, aesKey, iv } = await encryptFileWithAes(file);
    const recipientKeys = await Promise.all(
        normalizedRecipientKeys.map(async (recipient) => ({
            recipientUserId: recipient.recipientUserId,
            encryptedAesKey: await encryptAesKeyWithPublicKey(
                aesKey,
                recipient.publicKey
            ),
        }))
    );

    const previewInput = previewBlobOverride ?? null;
    const encryptedUploadFile = await writeTempUploadFile({
        bytes: encryptedData,
        name: file.name,
        type: file.type || "application/octet-stream",
    });
    let previewUploadFile: UploadFormFile | null = null;
    if (isLocalUploadPreview(previewInput)) {
        previewUploadFile = previewInput;
    } else if (isBlobPreview(previewInput)) {
        previewUploadFile = await blobToTempUploadFile(
            previewInput,
            `${file.name.replace(/\.[^/.]+$/, "") || file.name}-preview.jpg`
        );
    }

    logMediaDebug("client.upload.prepared", {
        debugTraceId: debugTraceId ?? null,
        encryptedSize: encryptedData.byteLength,
        previewSize: previewInput?.size ?? null,
        previewType: previewInput?.type ?? null,
        previewSource: previewUploadFile
            ? isLocalUploadPreview(previewInput)
                ? "local-file"
                : "blob"
            : null,
        recipientKeyCount: recipientKeys.length,
    });
    const formData = new FormData();
    appendUploadPart(formData, "file", encryptedUploadFile);
    formData.append("iv", iv);
    formData.append("recipientKeys", JSON.stringify(recipientKeys));
    formData.append("originalSizeBytes", String(file.size));

    if (previewUploadFile) {
        appendUploadPart(formData, "previewFile", previewUploadFile);
    }

    let response: Response;
    try {
        const cookies = authClient.getCookie();
        response = await fetch("https://web.yahla.org/api/message-media", {
            method: "POST",
            headers: {
                ...(buildMediaDebugHeaders(debugTraceId) ?? {}),
                Cookie: cookies ?? "",
            },
            body: formData,
            credentials: "omit",
        });
    } finally {
        await encryptedUploadFile.cleanup();
        if (previewUploadFile && "cleanup" in previewUploadFile) {
            await previewUploadFile.cleanup?.();
        }
    }

    if (!response.ok) {
        const responseText = await response.text();
        let error: { error?: string } = {};
        try {
            error = JSON.parse(responseText) as { error?: string };
        } catch {
            error = { error: responseText };
        }
        console.error("[media-upload] upload failed", {
            debugTraceId: debugTraceId ?? null,
            status: response.status,
            responseText,
        });
        logMediaDebug("client.upload.failed", {
            debugTraceId: debugTraceId ?? null,
            status: response.status,
            error: error.error ?? "Failed to upload message media",
        });
        throw new Error(error.error || "Failed to upload message media");
    }

    const result = (await response.json()) as Omit<
        MessageMediaUploadResult,
        "recipientEncryptionKeys"
    >;
    logMediaDebug("client.upload.success", {
        debugTraceId: debugTraceId ?? null,
        objectKey: result.objectKey,
        mediaUrl: result.mediaUrl,
        previewUrl: result.previewUrl,
        sizeBytes: result.sizeBytes,
    });

    return {
        ...result,
        recipientEncryptionKeys: recipientKeys.map((key) => ({
            recipientUserId: key.recipientUserId,
            encryptedAesKey: key.encryptedAesKey,
            algorithm: "aes-256-gcm+rsa-oaep-sha256",
        })),
    };
}
