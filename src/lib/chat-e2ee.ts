import { importPublicKey } from "@/lib/crypto-keys";
import { bufferToBase64 } from "@/lib/crypto-pin";
import type { ChatItemType } from "@/types/chats.type";
import type {
    EncryptedContentEnvelope,
    RecipientEncryptedAesKeyInput,
} from "@/types/crypto.type";
import type { Message } from "@/types/messages";
import { retrieveSessionKeys } from "./crypto-storage";

type RecipientKeySource = {
    userId: string;
    publicKey: string;
};

type SharedContactMessagePayload = {
    kind: "contact";
    contact: NonNullable<Message["contact"]>;
};

const textEncoder = new TextEncoder();
const MAX_DECRYPT_CACHE_ITEMS = 500;
const MAX_CACHEABLE_CIPHERTEXT_LENGTH = 16_384;
const publicKeyImportCache = new Map<string, Promise<CryptoKey>>();
const decryptedTextCache = new Map<string, string>();

function getImportedPublicKey(publicKeyBase64: string) {
    const cachedKey = publicKeyImportCache.get(publicKeyBase64);
    if (cachedKey) {
        return cachedKey;
    }

    const keyPromise = importPublicKey(publicKeyBase64);
    publicKeyImportCache.set(publicKeyBase64, keyPromise);
    return keyPromise;
}

function getDecryptCacheKey({
    ciphertext,
    encryptedAesKey,
    iv,
}: {
    ciphertext: string;
    encryptedAesKey: string;
    iv: string;
}) {
    return `${encryptedAesKey}:${iv}:${ciphertext}`;
}

function rememberDecryptedText(cacheKey: string, plaintext: string) {
    if (decryptedTextCache.size >= MAX_DECRYPT_CACHE_ITEMS) {
        const oldestKey = decryptedTextCache.keys().next().value;
        if (oldestKey) {
            decryptedTextCache.delete(oldestKey);
        }
    }

    decryptedTextCache.set(cacheKey, plaintext);
}

export async function getSessionCryptoKeys(): Promise<{ privateKey: CryptoKey } | null> {
    const sessionKeys = await retrieveSessionKeys();
    if (!sessionKeys?.privateKey) return null;
    return { privateKey: sessionKeys.privateKey };
}

async function encryptAesKeyForRecipient(
    rawAesKey: ArrayBuffer,
    publicKeyBase64: string
) {
    const publicKey = await getImportedPublicKey(publicKeyBase64);
    const encrypted = await crypto.subtle.encrypt(
        { name: "RSA-OAEP" },
        publicKey,
        rawAesKey
    );

    return bufferToBase64(encrypted);
}

export async function encryptTextForRecipients(
    plaintext: string,
    recipients: RecipientKeySource[]
): Promise<{
    encryptedContent: EncryptedContentEnvelope;
    recipientEncryptionKeys: RecipientEncryptedAesKeyInput[];
}> {
    const aesKey = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
    const rawAesKey = await crypto.subtle.exportKey("raw", aesKey);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        aesKey,
        textEncoder.encode(plaintext)
    );

    const uniqueRecipients = [...new Map(
        recipients
            .filter((recipient) => recipient.userId && recipient.publicKey)
            .map((recipient) => [recipient.userId, recipient])
    ).values()];

    const recipientEncryptionKeys = await Promise.all(
        uniqueRecipients.map(async (recipient) => ({
            recipientUserId: recipient.userId,
            encryptedAesKey: await encryptAesKeyForRecipient(
                rawAesKey,
                recipient.publicKey
            ),
            algorithm: "aes-256-gcm+rsa-oaep-sha256" as const,
        }))
    );

    return {
        encryptedContent: {
            ciphertext: bufferToBase64(ciphertext),
            iv: bufferToBase64(iv),
            algorithm: "aes-256-gcm+rsa-oaep-sha256",
        },
        recipientEncryptionKeys,
    };
}

export async function decryptMessageBatch({
    currentUserId,
    messages,
}: {
    currentUserId: string;
    messages: Message[];
}): Promise<Message[]> {
    const { decryptText } = await import(
        "@/lib/text-encryption"
    );
    const sessionKeys = await retrieveSessionKeys();
    if (!sessionKeys?.privateKey) {
        return messages;
    }

    return Promise.all(
        messages.map(async (message) => {
            if (
                !message.encrypted_content_ciphertext ||
                !message.encrypted_content_iv ||
                !message.message_recipient_keys?.length
            ) {
                return message;
            }

            const recipientKey = message.message_recipient_keys.find(
                (key) => key.recipient_user_id === currentUserId
            );

            if (!recipientKey) {
                return message;
            }

            try {
                const decryptedText = await decryptTextPayload(
                    {
                        ciphertext: message.encrypted_content_ciphertext,
                        encryptedAesKey: recipientKey.encrypted_aes_key,
                        iv: message.encrypted_content_iv,
                    },
                    sessionKeys.privateKey,
                    decryptText
                );
                const sharedContact =
                    message.attached_media === "contact"
                        ? parseSharedContactMessage(decryptedText)
                        : null;

                return {
                    ...message,
                    message_text_content: sharedContact ? null : decryptedText,
                    contact: sharedContact ?? message.contact,
                    client_status:
                        message.client_status === "failed"
                            ? "failed"
                            : ("sent" as const),
                } satisfies Message;
            } catch {
                return message;
            }
        })
    );
}

export async function decryptChatPreviewBatch({
    chats,
    currentUserId,
}: {
    chats: ChatItemType[];
    currentUserId: string;
}) {
    const { decryptText } = await import(
        "@/lib/text-encryption"
    );
    const sessionKeys = await retrieveSessionKeys();
    if (!sessionKeys?.privateKey) {
        return chats;
    }

    return Promise.all(
        chats.map(async (chat) => {
            if (
                !chat.encrypted_preview_ciphertext ||
                !chat.encrypted_preview_iv ||
                !chat.chat_recipient_keys?.length
            ) {
                return chat;
            }

            const recipientKey = chat.chat_recipient_keys.find(
                (key) => key.recipient_user_id === currentUserId
            );

            if (!recipientKey) {
                return chat;
            }

            try {
                const decryptedPreview = await decryptTextPayload(
                    {
                        ciphertext: chat.encrypted_preview_ciphertext,
                        encryptedAesKey: recipientKey.encrypted_aes_key,
                        iv: chat.encrypted_preview_iv,
                    },
                    sessionKeys.privateKey,
                    decryptText
                );

                return {
                    ...chat,
                    last_message_context: decryptedPreview,
                };
            } catch {
                return chat;
            }
        })
    );
}

async function decryptTextPayload(
    payload: {
        ciphertext: string;
        encryptedAesKey: string;
        iv: string;
    },
    privateKey: CryptoKey,
    decryptText: (
        payload: {
            ciphertext: string;
            encryptedAesKey: string;
            iv: string;
        },
        privateKey: CryptoKey
    ) => Promise<string>
) {
    const cacheKey =
        payload.ciphertext.length <= MAX_CACHEABLE_CIPHERTEXT_LENGTH
            ? getDecryptCacheKey(payload)
            : null;

    if (cacheKey) {
        const cachedPlaintext = decryptedTextCache.get(cacheKey);
        if (cachedPlaintext !== undefined) {
            return cachedPlaintext;
        }
    }

    const plaintext = await decryptText(payload, privateKey);
    if (cacheKey) {
        rememberDecryptedText(cacheKey, plaintext);
    }

    return plaintext;
}

export function buildDirectChatId(
    leftParticipant: string,
    rightParticipant: string
) {
    return [leftParticipant, rightParticipant].filter(Boolean).sort().join("::");
}

export function createOptimisticMessage({
    messageId,
    chatId,
    senderUserId,
    plaintext = null,
    attachedMedia = null,
    mediaUrl = null,
    mediaPreviewUrl = null,
    mediaSizeBytes = null,
    mediaWidth = null,
    mediaHeight = null,
    mediaFileName = null,
    videoThumbnail = null,
    replyMessage = null,
    openGraphData = null,
    contact = null,
    clientLocalMediaName = null,
    clientLocalMediaSize = null,
    clientLocalMediaMimeType = null,
    isForwarded = false,
}: {
    messageId: string;
    chatId: string;
    senderUserId: string;
    plaintext?: string | null;
    attachedMedia?: Message["attached_media"];
    mediaUrl?: string | null;
    mediaPreviewUrl?: string | null;
    mediaSizeBytes?: number | null;
    mediaWidth?: number | null;
    mediaHeight?: number | null;
    mediaFileName?: string | null;
    videoThumbnail?: string | null;
    replyMessage?: Message["reply_message"];
    openGraphData?: Message["open_graph_data"];
    contact?: Message["contact"] | null;
    clientLocalMediaName?: string | null;
    clientLocalMediaSize?: number | null;
    clientLocalMediaMimeType?: string | null;
    isForwarded: boolean;
}): Message {
    const now = new Date();

    return {
        message_id: messageId,
        sender_user_id: senderUserId,
        chat_room_id: chatId,
        client_local_media_name: clientLocalMediaName,
        client_local_media_size: clientLocalMediaSize,
        client_local_media_mime_type: clientLocalMediaMimeType,
        attached_media: attachedMedia,
        event: null,
        poll: null,
        reply_message: replyMessage,
        location: null,
        media_url: mediaUrl,
        media_preview_url: mediaPreviewUrl,
        media_size_bytes: mediaSizeBytes,
        media_width: mediaWidth,
        media_height: mediaHeight,
        media_file_name: mediaFileName,
        video_thumbnail: videoThumbnail,
        message_raction: null,
        is_forward_message: isForwarded,
        message_text_content: plaintext,
        open_graph_data: openGraphData,
        user_ids_pin_it: null,
        user_ids_star_it: null,
        deleted: false,
        user_id_delete_it: null,
        edited: false,
        user_id_edit_it: null,
        created_at: now,
        updated_at: now,
        contact,
        client_status: "sending",
        client_error: null,
        is_read_by_recipient: false,
        read_by_user_ids: [],
        encrypted_content_ciphertext: null,
        encrypted_content_iv: null,
        encrypted_content_algorithm: null,
        message_recipient_keys: null,
    };
}

export function serializeSharedContactMessage(
    contact: NonNullable<Message["contact"]>
) {
    return JSON.stringify({
        kind: "contact",
        contact,
    } satisfies SharedContactMessagePayload);
}

function parseSharedContactMessage(
    payload: string
): NonNullable<Message["contact"]> | null {
    try {
        const parsed = JSON.parse(payload) as Partial<SharedContactMessagePayload>;

        if (
            parsed.kind !== "contact" ||
            !parsed.contact?.contact_id ||
            !parsed.contact.contact_name
        ) {
            return null;
        }

        return {
            contact_id: parsed.contact.contact_id,
            contact_name: parsed.contact.contact_name,
            contact_image: parsed.contact.contact_image ?? "",
            contact_phone: parsed.contact.contact_phone ?? null,
            linked_user_id: parsed.contact.linked_user_id ?? null,
        };
    } catch {
        return null;
    }
}
