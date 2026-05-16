import { db } from "@/db/client";
import { encryptedMedia } from "@/db/schema";
import { authClient } from "@/lib/auth-client";
import { retrieveSessionKeys } from "@/lib/crypto-storage";
import { decryptFileWithAes } from "@/lib/decrypt-file";
import type { Message } from "@/types/messages";
import { Buffer } from "@craftzdog/react-native-buffer";
import { eq, or } from "drizzle-orm";
import {
    cacheDirectory,
    deleteAsync,
    documentDirectory,
    EncodingType,
    getInfoAsync,
    readDirectoryAsync,
    writeAsStringAsync,
} from "expo-file-system/legacy";

const API_BASE = "https://web.yahla.org";

const MEDIA_API_PATHS = [
    "/api/media",
    "/api/encrypted-media",
    "/api/message-media",
    "/api/message-media-preview",
    "/api/chat-media",
    "/api/attachments",
];

const mediaFileCache = new Map<string, string>();
const aesKeyCache = new Map<string, { key: string; iv: string }>();
const MAX_JS_DECRYPT_MEDIA_BYTES = 12 * 1024 * 1024;
const LOCAL_MEDIA_FILE_PREFIXES = [
    "message_media_",
    "profile_",
    "encrypted_profile.",
];

type ManagedMediaSource = {
    objectKey: string;
    apiPath: string | null;
    url: string | null;
};

type MediaKeyPayload = {
    encryptedAesKey: string;
    iv: string;
    mimeType?: string | null;
};

function getSafeCacheName(objectKey: string) {
    return objectKey.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function getExtensionFromMimeType(mimeType?: string | null) {
    if (!mimeType) return null;

    const normalized = mimeType.split(";")[0].trim().toLowerCase();
    const known: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
        "video/mp4": "mp4",
        "application/pdf": "pdf",
    };

    return known[normalized] ?? normalized.split("/")[1]?.replace(/[^a-z0-9]/g, "");
}

function getExtensionFromSource(source?: string | null) {
    if (!source) return null;

    try {
        const parsed = new URL(source, API_BASE);
        const lastPathPart = parsed.pathname.split("/").filter(Boolean).pop();
        const extension = lastPathPart?.split(".").pop()?.toLowerCase();

        if (extension && extension !== lastPathPart) {
            return extension.replace(/[^a-z0-9]/g, "");
        }
    } catch {
        const extension = source.split("?")[0].split(".").pop()?.toLowerCase();
        if (extension && extension !== source) {
            return extension.replace(/[^a-z0-9]/g, "");
        }
    }

    return null;
}

function getFallbackExtensionForMessage(message: Message, isPreview: boolean) {
    if (isPreview) {
        return "jpg";
    }

    switch (message.attached_media) {
        case "photo":
            return "jpg";
        case "video":
            return "mp4";
        case "voice":
            return "m4a";
        case "file":
            return (
                getExtensionFromMimeType(message.client_local_media_mime_type) ??
                getExtensionFromMimeType(message.media_mime_type) ??
                getExtensionFromSource(message.media_file_name) ??
                "bin"
            );
        default:
            return "bin";
    }
}

function getMessageFullMediaSource(message: Message) {
    return (
        message.media_url ??
        message.media_object_key ??
        message.encrypted_media?.object_key ??
        null
    );
}

function getMessagePreviewMediaSource(message: Message) {
    return (
        message.video_thumbnail ??
        message.media_preview_url ??
        message.media_preview_object_key ??
        message.encrypted_media?.preview_object_key ??
        null
    );
}

const MEDIA_DIRECTORY = documentDirectory ?? cacheDirectory;

export function isLocalMediaUri(source?: string | null) {
    return Boolean(
        source &&
        (
            source.startsWith("file:") ||
            source.startsWith("content:") ||
            source.startsWith("asset:") ||
            source.startsWith("data:")
        )
    );
}

export function isMessageMediaSafeForJsDecrypt(message: Message) {
    const size =
        message.media_size_bytes ??
        message.client_local_media_size ??
        message.encrypted_media?.original_size_bytes ??
        0;

    return size <= 0 || size <= MAX_JS_DECRYPT_MEDIA_BYTES;
}

function getCachePath({
    objectKey,
    mimeType,
    source,
    fallbackExtension,
}: {
    objectKey: string;
    mimeType?: string | null;
    source?: string | null;
    fallbackExtension: string;
}) {
    const extension =
        getExtensionFromMimeType(mimeType) ??
        getExtensionFromSource(source) ??
        fallbackExtension;

    return `${MEDIA_DIRECTORY ?? ""}message_media_${getSafeCacheName(objectKey)}.${extension}`;
}

function encodeObjectKeyForPath(objectKey: string) {
    return objectKey
        .split("/")
        .filter(Boolean)
        .map(encodeURIComponent)
        .join("/");
}

export function parseManagedMessageMediaUrl(
    source?: string | null
): ManagedMediaSource | null {
    if (!source) {
        return null;
    }

    if (isLocalMediaUri(source)) {
        return null;
    }

    if (!source.includes("://") && !source.startsWith("/")) {
        return {
            objectKey: source,
            apiPath: null,
            url: null,
        };
    }

    try {
        const parsed = new URL(source, API_BASE);

        for (const apiPath of MEDIA_API_PATHS) {
            if (!parsed.pathname.startsWith(`${apiPath}/`)) {
                continue;
            }

            const objectKey = decodeURIComponent(
                parsed.pathname.replace(`${apiPath}/`, "")
            );

            return objectKey
                ? {
                    objectKey,
                    apiPath,
                    url: parsed.toString(),
                }
                : null;
        }

        if (!parsed.protocol.startsWith("http")) {
            return {
                objectKey: source,
                apiPath: null,
                url: null,
            };
        }
    } catch {
        return {
            objectKey: source,
            apiPath: null,
            url: null,
        };
    }

    return null;
}

function getMessageMediaMetadata(message: Message) {
    const encrypted = message.encrypted_media;
    const objectKey =
        encrypted?.object_key ??
        message.media_object_key ??
        parseManagedMessageMediaUrl(message.media_url)?.objectKey ??
        null;
    const previewObjectKey =
        encrypted?.preview_object_key ??
        message.media_preview_object_key ??
        parseManagedMessageMediaUrl(message.video_thumbnail)?.objectKey ??
        parseManagedMessageMediaUrl(message.media_preview_url)?.objectKey ??
        null;
    const encryptedAesKey =
        encrypted?.encrypted_aes_key ??
        message.media_encrypted_aes_key ??
        null;
    const iv = encrypted?.iv ?? message.media_iv ?? null;

    if (!objectKey || !encryptedAesKey || !iv) {
        return null;
    }

    return {
        id: encrypted?.id ?? `media:${objectKey}`,
        messageId: message.message_id,
        objectKey,
        previewObjectKey,
        encryptedAesKey,
        iv,
        mimeType:
            encrypted?.mime_type ??
            message.media_mime_type ??
            message.client_local_media_mime_type ??
            "application/octet-stream",
        previewMimeType:
            encrypted?.preview_mime_type ??
            message.media_preview_mime_type ??
            "image/jpeg",
        originalSizeBytes:
            encrypted?.original_size_bytes ??
            message.media_size_bytes ??
            message.client_local_media_size ??
            0,
        localPath: encrypted?.local_path ?? null,
        previewLocalPath: encrypted?.preview_local_path ?? null,
    };
}

export async function upsertEncryptedMediaMetadataForMessage(message: Message) {
    const metadata = getMessageMediaMetadata(message);
    if (!metadata) {
        return;
    }

    try {
        const existing = await db
            .select({
                id: encryptedMedia.id,
                local_path: encryptedMedia.local_path,
                preview_local_path: encryptedMedia.preview_local_path,
            })
            .from(encryptedMedia)
            .where(eq(encryptedMedia.object_key, metadata.objectKey))
            .limit(1);

        const values = {
            id: metadata.id,
            message_id: metadata.messageId,
            object_key: metadata.objectKey,
            preview_object_key: metadata.previewObjectKey,
            encrypted_aes_key: metadata.encryptedAesKey,
            iv: metadata.iv,
            mime_type: metadata.mimeType,
            preview_mime_type: metadata.previewMimeType,
            original_size_bytes: metadata.originalSizeBytes,
            local_path: metadata.localPath ?? existing[0]?.local_path ?? null,
            preview_local_path:
                metadata.previewLocalPath ?? existing[0]?.preview_local_path ?? null,
            download_status:
                metadata.localPath ||
                    metadata.previewLocalPath ||
                    existing[0]?.local_path ||
                    existing[0]?.preview_local_path
                    ? "downloaded"
                    : "not_downloaded",
            created_at: new Date().toISOString(),
        };

        if (existing.length > 0) {
            await db
                .update(encryptedMedia)
                .set(values)
                .where(eq(encryptedMedia.id, existing[0].id));
            return;
        }

        await db.insert(encryptedMedia).values(values);
    } catch {
        // Media cache metadata is optional; message persistence should not fail on it.
    }
}

async function findStoredMedia(objectKey: string) {
    try {
        const rows = await db
            .select()
            .from(encryptedMedia)
            .where(
                or(
                    eq(encryptedMedia.object_key, objectKey),
                    eq(encryptedMedia.preview_object_key, objectKey)
                )
            )
            .limit(1);

        return rows[0] ?? null;
    } catch {
        return null;
    }
}

async function rememberLocalPath({
    objectKey,
    localPath,
    isPreview,
}: {
    objectKey: string;
    localPath: string;
    isPreview: boolean;
}) {
    try {
        const condition = isPreview
            ? eq(encryptedMedia.preview_object_key, objectKey)
            : eq(encryptedMedia.object_key, objectKey);

        const values = isPreview
            ? { preview_local_path: localPath, download_status: "downloaded" }
            : { local_path: localPath, download_status: "downloaded" };

        await db.update(encryptedMedia).set(values).where(condition);
    } catch {
        // The disk cache is still valid even if the metadata row cannot be updated.
    }
}

async function decryptAesKeyWithPrivateKey(
    encryptedAesKeyBase64: string,
    privateKey: CryptoKey
) {
    const encryptedBytes = Buffer.from(encryptedAesKeyBase64, "base64");
    const decrypted = await crypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        privateKey,
        encryptedBytes
    );

    return Buffer.from(new Uint8Array(decrypted)).toString("base64");
}

function normalizeKeyPayload(payload: any): MediaKeyPayload | null {
    const source = payload?.media ?? payload?.key ?? payload;
    const encryptedAesKey =
        source?.aesKey ??
        source?.encryptedAesKey ??
        source?.encrypted_aes_key ??
        source?.encryptedAESKey ??
        null;
    const iv = source?.iv ?? source?.mediaIv ?? source?.media_iv ?? null;

    if (!encryptedAesKey || !iv) {
        return null;
    }

    return {
        encryptedAesKey,
        iv,
        mimeType:
            source?.mimeType ??
            source?.mime_type ??
            source?.contentType ??
            source?.content_type ??
            null,
    };
}

async function fetchRemoteKey(
    managedSource: ManagedMediaSource
): Promise<MediaKeyPayload | null> {
    const cookies = authClient.getCookie();
    const objectKeyPath = encodeObjectKeyForPath(managedSource.objectKey);
    const apiPaths = [
        ...(managedSource.apiPath ? [managedSource.apiPath] : []),
        ...MEDIA_API_PATHS,
    ].filter((apiPath, index, paths) => paths.indexOf(apiPath) === index);

    for (const apiPath of apiPaths) {
        try {
            const response = await fetch(`${API_BASE}${apiPath}/key/${objectKeyPath}`, {
                headers: {
                    Cookie: cookies ?? "",
                },
                credentials: "omit",
            });

            if (!response.ok) {
                continue;
            }

            const payload = normalizeKeyPayload(await response.json());
            if (payload) {
                return payload;
            }
        } catch {
            continue;
        }
    }

    return null;
}

async function fetchEncryptedBytes(managedSource: ManagedMediaSource) {
    const cookies = authClient.getCookie();
    const objectKeyPath = encodeObjectKeyForPath(managedSource.objectKey);
    const candidateUrls = managedSource.url
        ? [managedSource.url]
        : MEDIA_API_PATHS.map((apiPath) => `${API_BASE}${apiPath}/${objectKeyPath}`);

    for (const url of candidateUrls) {
        try {
            const response = await fetch(url, {
                headers: {
                    Cookie: cookies ?? "",
                },
                credentials: "omit",
            });

            if (!response.ok) {
                continue;
            }

            return response.arrayBuffer();
        } catch {
            continue;
        }
    }

    return null;
}

async function getDecryptionPayload(
    managedSource: ManagedMediaSource,
    isPreview: boolean
) {
    const storedMedia = await findStoredMedia(managedSource.objectKey);
    const storedLocalPath = isPreview
        ? storedMedia?.preview_local_path
        : storedMedia?.local_path;

    if (storedLocalPath) {
        const info = await getInfoAsync(storedLocalPath);
        if (info.exists) {
            mediaFileCache.set(managedSource.objectKey, storedLocalPath);
            return { localPath: storedLocalPath };
        }
    }

    const cachedAesKey = aesKeyCache.get(managedSource.objectKey);
    if (cachedAesKey) {
        return {
            key: cachedAesKey.key,
            iv: cachedAesKey.iv,
            mimeType: isPreview
                ? storedMedia?.preview_mime_type
                : storedMedia?.mime_type,
        };
    }

    const sessionKeys = await retrieveSessionKeys();
    if (!sessionKeys?.privateKey) {
        return null;
    }

    const storedKeyPayload = storedMedia
        ? {
            encryptedAesKey: storedMedia.encrypted_aes_key,
            iv: storedMedia.iv,
            mimeType: isPreview
                ? storedMedia.preview_mime_type
                : storedMedia.mime_type,
        }
        : null;
    const encryptedKeyPayload =
        !isPreview && storedMedia?.object_key === managedSource.objectKey
            ? storedKeyPayload
            : (await fetchRemoteKey(managedSource)) ?? storedKeyPayload;

    if (!encryptedKeyPayload) {
        return null;
    }

    const key = await decryptAesKeyWithPrivateKey(
        encryptedKeyPayload.encryptedAesKey,
        sessionKeys.privateKey
    );
    aesKeyCache.set(managedSource.objectKey, {
        key,
        iv: encryptedKeyPayload.iv,
    });

    return {
        key,
        iv: encryptedKeyPayload.iv,
        mimeType:
            encryptedKeyPayload.mimeType ??
            (isPreview
                ? storedMedia?.preview_mime_type
                : storedMedia?.mime_type),
    };
}

export async function fetchAndDecryptMessageMedia({
    source,
    isPreview = false,
    fallbackExtension = "jpg",
}: {
    source?: string | null;
    isPreview?: boolean;
    fallbackExtension?: string;
}) {
    if (!source) {
        return null;
    }

    const absoluteSource = source.startsWith('/')
        ? `${API_BASE}${source}`
        : source;

    if (isPreview && absoluteSource.includes('/api/message-media-preview/')) {
        const memoryCached = mediaFileCache.get(absoluteSource);
        if (memoryCached) return memoryCached;

        const cachePath = getCachePath({
            objectKey: absoluteSource,
            fallbackExtension,
        });
        const diskInfo = await getInfoAsync(cachePath);
        if (diskInfo.exists) {
            mediaFileCache.set(absoluteSource, cachePath);
            return cachePath;
        }

        try {
            const cookies = authClient.getCookie();
            const response = await fetch(absoluteSource, {
                headers: { Cookie: cookies ?? '' },
                credentials: 'omit',
            });
            if (!response.ok) return absoluteSource;

            const bytes = await response.arrayBuffer();
            await writeAsStringAsync(
                cachePath,
                Buffer.from(bytes).toString('base64'),
                { encoding: EncodingType.Base64 }
            );
            mediaFileCache.set(absoluteSource, cachePath);
            return cachePath;
        } catch {
            return absoluteSource;
        }
    }

    const managedSource = parseManagedMessageMediaUrl(absoluteSource);
    if (!managedSource) {
        return absoluteSource;
    }

    const memoryCached = mediaFileCache.get(managedSource.objectKey);
    if (memoryCached) {
        return memoryCached;
    }

    const cachePath = getCachePath({
        objectKey: managedSource.objectKey,
        source,
        fallbackExtension,
    });
    const diskInfo = await getInfoAsync(cachePath);
    if (diskInfo.exists) {
        mediaFileCache.set(managedSource.objectKey, cachePath);
        await rememberLocalPath({
            objectKey: managedSource.objectKey,
            localPath: cachePath,
            isPreview,
        });
        return cachePath;
    }

    const decryptionPayload = await getDecryptionPayload(
        managedSource,
        isPreview
    );

    if (!decryptionPayload) {
        return absoluteSource;
    }

    if ("localPath" in decryptionPayload) {
        return decryptionPayload.localPath;
    }

    const encryptedBytes = await fetchEncryptedBytes(managedSource);
    if (!encryptedBytes) {
        return absoluteSource;
    }

    const decryptedBytes = await decryptFileWithAes(
        encryptedBytes,
        decryptionPayload.key,
        decryptionPayload.iv
    );
    const finalCachePath = getCachePath({
        objectKey: managedSource.objectKey,
        mimeType: decryptionPayload.mimeType,
        source,
        fallbackExtension,
    });

    await writeAsStringAsync(
        finalCachePath,
        Buffer.from(decryptedBytes).toString("base64"),
        { encoding: EncodingType.Base64 }
    );

    mediaFileCache.set(managedSource.objectKey, finalCachePath);
    await rememberLocalPath({
        objectKey: managedSource.objectKey,
        localPath: finalCachePath,
        isPreview,
    });

    return finalCachePath;
}

export type MaterializeMessageMediaOptions = {
    downloadFull?: boolean;
    ignoreSizeLimit?: boolean;
};

export async function materializeMessageMedia(
    message: Message,
    options: MaterializeMessageMediaOptions = {}
): Promise<Message> {
    if (!message.attached_media) {
        return message;
    }

    const supportsFullDownload = ["photo", "video", "voice", "file"].includes(
        message.attached_media
    );
    const supportsPreview = ["photo", "video"].includes(message.attached_media);

    if (!supportsFullDownload && !supportsPreview) {
        return message;
    }

    await upsertEncryptedMediaMetadataForMessage(message);

    let nextMessage = message;
    const previewSource = getMessagePreviewMediaSource(message);

    if (supportsPreview && previewSource && !isLocalMediaUri(previewSource)) {
        const localPreviewUri = await fetchAndDecryptMessageMedia({
            source: previewSource,
            isPreview: true,
            fallbackExtension: "jpg",
        });

        if (localPreviewUri && isLocalMediaUri(localPreviewUri)) {
            nextMessage = {
                ...nextMessage,
                media_preview_url:
                    message.attached_media === "photo"
                        ? localPreviewUri
                        : nextMessage.media_preview_url,
                video_thumbnail:
                    message.attached_media === "video"
                        ? localPreviewUri
                        : nextMessage.video_thumbnail,
                encrypted_media: nextMessage.encrypted_media
                    ? {
                        ...nextMessage.encrypted_media,
                        preview_local_path: localPreviewUri,
                    }
                    : nextMessage.encrypted_media,
            };
        }
    }

    const fullSource = getMessageFullMediaSource(message);
    const shouldDownloadFull =
        options.downloadFull === true ||
        message.attached_media === "voice" ||
        message.attached_media === "file";

    if (!supportsFullDownload || !shouldDownloadFull || !fullSource) {
        return nextMessage;
    }

    if (!options.ignoreSizeLimit && !isMessageMediaSafeForJsDecrypt(message)) {
        return nextMessage;
    }

    if (isLocalMediaUri(fullSource)) {
        return nextMessage;
    }

    const localFullUri = await fetchAndDecryptMessageMedia({
        source: fullSource,
        isPreview: false,
        fallbackExtension: getFallbackExtensionForMessage(message, false),
    });

    if (!localFullUri || !isLocalMediaUri(localFullUri)) {
        return nextMessage;
    }

    return {
        ...nextMessage,
        media_url: localFullUri,
        encrypted_media: nextMessage.encrypted_media
            ? {
                ...nextMessage.encrypted_media,
                local_path: localFullUri,
            }
            : nextMessage.encrypted_media,
    };
}

export async function deleteCachedLocalMediaFiles() {
    const directories = Array.from(
        new Set([MEDIA_DIRECTORY, cacheDirectory].filter(Boolean) as string[])
    );

    await Promise.all(
        directories.map(async (directory) => {
            try {
                const fileNames = await readDirectoryAsync(directory);
                await Promise.all(
                    fileNames
                        .filter((fileName) =>
                            LOCAL_MEDIA_FILE_PREFIXES.some((prefix) =>
                                fileName.startsWith(prefix)
                            )
                        )
                        .map((fileName) =>
                            deleteAsync(`${directory}${fileName}`, {
                                idempotent: true,
                            }).catch((error) => {
                                console.log(
                                    "Failed to delete cached media file:",
                                    error
                                );
                            })
                        )
                );
            } catch (error) {
                console.log("Failed to read cached media directory:", error);
            }
        })
    );

    mediaFileCache.clear();
    aesKeyCache.clear();
}
