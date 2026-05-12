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
    previewBlobOverride?: Blob | null,
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

    const previewBlob = previewBlobOverride;
    const encryptedUploadFile = await writeTempUploadFile({
        bytes: encryptedData,
        name: file.name,
        type: file.type || "application/octet-stream",
    });
    const previewUploadFile = previewBlob
        ? await blobToTempUploadFile(
            previewBlob,
            `${file.name.replace(/\.[^/.]+$/, "") || file.name}-preview.jpg`
        )
        : null;

    logMediaDebug("client.upload.prepared", {
        debugTraceId: debugTraceId ?? null,
        encryptedSize: encryptedData.byteLength,
        previewSize: previewBlob?.size ?? null,
        previewType: previewBlob?.type ?? null,
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
        response = await fetch("https://halabakk-web.nawaf-alhasosah.workers.dev/api/message-media", {
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
        await previewUploadFile?.cleanup();
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
