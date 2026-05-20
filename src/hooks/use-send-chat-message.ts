import { authClient } from "@/lib/auth-client";
import {
    createOptimisticMessage,
    decryptMessageBatch,
    encryptTextForRecipients,
    serializeSharedContactMessage,
} from "@/lib/chat-e2ee";
import {
    areDirectChatIdsEquivalent,
    buildChatFromMessage,
    normalizeMessage,
} from "@/lib/chat-utils";
import {
    getContactDisplayName,
    resolveDirectChatContact,
} from "@/lib/contact-display";
import {
    MESSAGE_MEDIA_INPUT_MAX_BYTES,
    MESSAGE_MEDIA_TARGET_MAX_BYTES,
    prepareMessageMediaFile,
} from "@/lib/message-media-compression";
import {
    createMediaDebugTraceId,
    logMediaDebug,
} from "@/lib/message-media-debug";
import {
    createMessageMediaPreview,
    getMessageMediaDimensions,
} from "@/lib/message-media-preview";
import {
    persistDecryptedMessageMedia,
    uploadEncryptedMessageMedia,
    type MessageMediaUploadFile,
} from "@/lib/message-media-upload";
import { upsertDbChats } from "@/lib/upsert-db-chats";
import { upsertDbMessages } from "@/lib/upsert-db-messages";
import { useActiveChatStore } from "@/store/use-active-chat-store";
import { useContactDirectoryStore } from "@/store/use-contact-directory-store";
import { useRealtimeStore } from "@/store/use-realtime-store";
import type { ChatItemType } from "@/types/chats.type";
import type { Contact as DirectoryContact } from "@/types/contacts.type";
import type {
    EncryptedContentEnvelope,
    RecipientEncryptedAesKeyInput,
} from "@/types/crypto.type";
import type { Message } from "@/types/messages";
import type { ClientRealtimeEvent } from "@/types/realtime-events";
import { Buffer } from "buffer";
import {
    EncodingType,
    getInfoAsync,
    readAsStringAsync,
} from "expo-file-system/legacy";

const ACK_TIMEOUT_MS = 800;
const CHAT_PREVIEW_MAX_LENGTH = 240;
const API_BASE_URL = "https://web.yahla.org";
const CHAT_DEBUG = true;

function debugSendMessage(stage: string, payload: Record<string, unknown> = {}) {
    if (!CHAT_DEBUG) {
        return;
    }
}

function summarizeOutgoingMessage(message: Message) {
    return {
        id: message.message_id,
        chatId: message.chat_room_id,
        sender: message.sender_user_id,
        media: message.attached_media,
        hasText: Boolean(message.message_text_content?.trim()),
        textLength: message.message_text_content?.length ?? 0,
        hasMediaUrl: Boolean(message.media_url),
        hasMediaPreviewUrl: Boolean(message.media_preview_url),
        hasVideoThumbnail: Boolean(message.video_thumbnail),
        hasRecipientKeys: Boolean(message.message_recipient_keys?.length),
        recipientKeyCount: message.message_recipient_keys?.length ?? 0,
        status: message.client_status,
        error: message.client_error,
        createdAt: message.created_at?.toISOString?.() ?? String(message.created_at),
    };
}

function summarizeOutgoingChat(chat: ChatItemType) {
    return {
        id: chat.chat_id,
        type: chat.chat_type,
        recipientUserId: chat.recipient_user_id,
        recipientPublicKey: Boolean(chat.recipient_public_key),
        groupMembers: chat.group_members?.length ?? 0,
        contactPhone: chat.contact_phone,
        lastMessageId: chat.last_message_id,
    };
}

type RecipientKeySource = {
    userId: string;
    publicKey: string;
};

type HttpMessagePayload = {
    debugTraceId?: string;
    clientMessageId: string;
    senderUserId: string;
    senderNickname: string;
    senderAvatarUrl?: string | null;
    chatRoomId: string;
    conversationType: "group" | "direct";
    senderPhone: string;
    recipientPhone?: string;
    notificationPlaintext?: string | null;
    attachedMedia?: Message["attached_media"] | null;
    mediaUrl?: string | null;
    mediaPreviewUrl?: string | null;
    mediaSizeBytes?: number | null;
    mediaWidth?: number | null;
    mediaHeight?: number | null;
    mediaFileName?: string | null;
    videoThumbnail?: string | null;
    isForwardMessage?: boolean;
    encryptedContent?: EncryptedContentEnvelope | null;
    recipientEncryptionKeys?: RecipientEncryptedAesKeyInput[] | null;
    encryptedChatPreview?: EncryptedContentEnvelope | null;
    chatPreviewRecipientKeys?: RecipientEncryptedAesKeyInput[] | null;
    replyMessage?: Message["reply_message"];
    openGraphData?: Message["open_graph_data"];
};

type ConversationContext = {
    selectedChat: ChatItemType;
    conversationType: "group" | "direct";
    recipientUserId?: string;
    recipientPhoneForTransport?: string;
    participantIds?: string[];
    recipients: RecipientKeySource[];
};

type AttachmentUploadInput = File | MessageMediaUploadFile;

function isDomFile(file: AttachmentUploadInput): file is File {
    return (
        typeof File !== "undefined" &&
        file instanceof File &&
        typeof document !== "undefined" &&
        typeof URL.createObjectURL === "function"
    );
}

function getLocalAttachmentUri(file: MessageMediaUploadFile) {
    return file.uri ?? null;
}

function getJsonAuthHeaders(debugTraceId?: string) {
    const cookies = authClient.getCookie();

    return {
        "Content-Type": "application/json",
        Cookie: cookies ?? "",
        ...(debugTraceId ? { "x-media-debug-id": debugTraceId } : {}),
    };
}

function applyEncryptedTransportFields({
    message,
    encryptedContent,
    recipientEncryptionKeys,
}: {
    message: Message;
    encryptedContent?: EncryptedContentEnvelope | null;
    recipientEncryptionKeys?: RecipientEncryptedAesKeyInput[] | null;
}): Message {
    return {
        ...message,
        encrypted_content_ciphertext:
            encryptedContent?.ciphertext ?? message.encrypted_content_ciphertext ?? null,
        encrypted_content_iv:
            encryptedContent?.iv ?? message.encrypted_content_iv ?? null,
        encrypted_content_algorithm:
            encryptedContent?.algorithm ??
            message.encrypted_content_algorithm ??
            null,
        message_recipient_keys:
            recipientEncryptionKeys?.length
                ? recipientEncryptionKeys.map((key) => ({
                    recipient_user_id: key.recipientUserId,
                    encrypted_aes_key: key.encryptedAesKey,
                    algorithm: key.algorithm ?? "aes-256-gcm+rsa-oaep-sha256",
                }))
                : message.message_recipient_keys ?? null,
    };
}

function getRetryRecipientKeys(message: Message) {
    return message.message_recipient_keys?.map((key) => ({
        recipientUserId: key.recipient_user_id,
        encryptedAesKey: key.encrypted_aes_key,
        algorithm: key.algorithm ?? "aes-256-gcm+rsa-oaep-sha256",
    })) ?? null;
}

function getFileNameFromUri(uri: string, fallbackName: string) {
    return decodeURIComponent(
        uri.split("?")[0].split("/").filter(Boolean).pop() ?? fallbackName
    );
}

function getVoiceMimeType(fileName: string) {
    const extension = fileName.split(".").pop()?.toLowerCase();

    switch (extension) {
        case "m4a":
            return "audio/mp4";
        case "aac":
            return "audio/aac";
        case "mp3":
            return "audio/mpeg";
        case "wav":
            return "audio/wav";
        default:
            return "audio/mp4";
    }
}

function uint8ArrayToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const arrayBuffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(arrayBuffer).set(bytes);
    return arrayBuffer;
}

async function createUploadFileFromLocalUri({
    uri,
    fallbackName,
    mimeType,
}: {
    uri: string;
    fallbackName: string;
    mimeType?: string;
}): Promise<MessageMediaUploadFile> {
    const name = getFileNameFromUri(uri, fallbackName);
    const info = await getInfoAsync(uri);
    const size = info.exists && typeof info.size === "number" ? info.size : 0;

    return {
        uri,
        name,
        type: mimeType ?? "application/octet-stream",
        size,
        arrayBuffer: async () => {
            const base64 = await readAsStringAsync(uri, {
                encoding: EncodingType.Base64,
            });
            return uint8ArrayToArrayBuffer(Buffer.from(base64, "base64"));
        },
    };
}

function createChatPreviewText(text: string) {
    if (text.length <= CHAT_PREVIEW_MAX_LENGTH) {
        return text;
    }

    return `${text.slice(0, CHAT_PREVIEW_MAX_LENGTH).trimEnd()}...`;
}

function getNotificationPlaintextForMessage(message: Message) {
    const text = message.message_text_content?.trim();
    if (text) {
        return createChatPreviewText(text);
    }

    if (message.attached_media === "contact" && message.contact?.contact_name) {
        return `Contact: ${message.contact.contact_name}`;
    }

    return null;
}

function getMissingRecipientEncryptionIds(
    recipients: RecipientKeySource[],
    recipientEncryptionKeys?: RecipientEncryptedAesKeyInput[] | null
) {
    const encryptedRecipientIds = new Set(
        recipientEncryptionKeys?.map((key) => key.recipientUserId).filter(Boolean) ?? []
    );

    return recipients
        .map((recipient) => recipient.userId)
        .filter((userId) => !encryptedRecipientIds.has(userId));
}

export function useSendChatMessage() {
    const { data: session } = authClient.useSession();
    const chats = useActiveChatStore((state) => state.chats);
    const selectedChatId = useActiveChatStore((state) => state.selectedChatId);
    const recipientPhone = useActiveChatStore((state) => state.recipientPhone);
    const appendMessage = useActiveChatStore((state) => state.appendMessage);
    const updateMessage = useActiveChatStore((state) => state.updateMessage);
    const upsertChat = useActiveChatStore((state) => state.upsertChat);
    const setDraft = useActiveChatStore((state) => state.setDraft);
    const clearReplyDraft = useActiveChatStore((state) => state.clearReplyDraft);
    const sendRealtimeEvent = useRealtimeStore((state) => state.sendEvent);

    const resolveConversationContext = ({
        chatId,
        currentUserId,
        currentPublicKey,
        currentPhone,
        requirePeerEncryption = false,
    }: {
        chatId: string;
        currentUserId: string;
        currentPublicKey: string;
        currentPhone?: string | null;
        requirePeerEncryption?: boolean;
    }): ConversationContext | null => {
        debugSendMessage("resolve-conversation-start", {
            chatId,
            currentUserId,
            hasCurrentPublicKey: Boolean(currentPublicKey),
            requirePeerEncryption,
            hookChatsCount: chats.length,
            storeChatsCount: useActiveChatStore.getState().chats.length,
            selectedChatId,
            recipientPhone,
        });
        const latestChats = useActiveChatStore.getState().chats;
        const selectedChat =
            latestChats.find((chat) => chat.chat_id === chatId) ??
            latestChats.find((chat) => areDirectChatIdsEquivalent(chat.chat_id, chatId)) ??
            chats.find((chat) => chat.chat_id === chatId) ??
            chats.find((chat) => areDirectChatIdsEquivalent(chat.chat_id, chatId)) ??
            null;
        if (!selectedChat) {
            debugSendMessage("resolve-conversation-missing-chat", {
                chatId,
                latestChatIds: latestChats.map((chat) => chat.chat_id),
                hookChatIds: chats.map((chat) => chat.chat_id),
            });
            return null;
        }

        const conversationType: "group" | "direct" =
            selectedChat.chat_type === "group" ? "group" : "direct";
        debugSendMessage("resolve-conversation-found-chat", {
            chat: summarizeOutgoingChat(selectedChat),
            conversationType,
        });
        const recipientsByUserId = new Map<string, RecipientKeySource>();
        recipientsByUserId.set(currentUserId, {
            userId: currentUserId,
            publicKey: currentPublicKey,
        });
        const matchedContact = resolveDirectChatContact(
            selectedChat,
            useContactDirectoryStore.getState().contacts,
            currentPhone
        );
        const recipientUserId =
            selectedChat.recipient_user_id ??
            matchedContact?.linked_user_id ??
            undefined;
        const recipientPublicKey =
            selectedChat.recipient_public_key ??
            matchedContact?.linked_user_public_key ??
            undefined;

        if (selectedChat.chat_type === "group") {
            const groupMembers = selectedChat.group_members ?? [];
            const groupMemberIds = groupMembers
                .map((member) => member.user_id)
                .filter(Boolean);
            const missingEncryptionMember = groupMembers.some(
                (member) => !member.user_id || !member.public_key
            );

            if (
                groupMembers.length === 0 ||
                missingEncryptionMember ||
                groupMemberIds.length < 2
            ) {
                debugSendMessage("resolve-conversation-invalid-group-encryption", {
                    chatId,
                    groupMembers: groupMembers.length,
                    missingEncryptionMember,
                    groupMemberIds,
                });
                return null;
            }

            for (const member of groupMembers) {
                if (member.user_id && member.public_key) {
                    recipientsByUserId.set(member.user_id, {
                        userId: member.user_id,
                        publicKey: member.public_key,
                    });
                }
            }

            const context = {
                selectedChat,
                conversationType,
                participantIds: [...new Set(groupMemberIds)],
                recipients: [...recipientsByUserId.values()],
            };
            debugSendMessage("resolve-conversation-group-success", {
                chatId,
                recipientIds: context.recipients.map((recipient) => recipient.userId),
                participantIds: context.participantIds,
            });
            return context;
        }

        if (recipientUserId && recipientPublicKey) {
            recipientsByUserId.set(recipientUserId, {
                userId: recipientUserId,
                publicKey: recipientPublicKey,
            });
        }

        if (requirePeerEncryption) {
            if (!recipientUserId || !recipientPublicKey) {
                debugSendMessage("resolve-conversation-missing-peer-encryption", {
                    chatId,
                    recipientUserId,
                    hasRecipientPublicKey: Boolean(recipientPublicKey),
                });
                return null;
            }
        }

        const context = {
            selectedChat,
            conversationType,
            recipientUserId,
            recipientPhoneForTransport:
                recipientPhone ??
                selectedChat.contact_phone ??
                matchedContact?.contact_number ??
                undefined,
            recipients: [...recipientsByUserId.values()],
        };
        debugSendMessage("resolve-conversation-direct-success", {
            chatId,
            recipientUserId,
            recipientPhoneForTransport: context.recipientPhoneForTransport,
            recipientIds: context.recipients.map((recipient) => recipient.userId),
            recoveredPublicKeyFromContact:
                !selectedChat.recipient_public_key &&
                Boolean(matchedContact?.linked_user_public_key),
        });
        return context;
    };

    const resolveReplyMessageForSend = ({
        chatId,
        existingMessageId,
    }: {
        chatId: string;
        existingMessageId?: string;
    }) => {
        const state = useActiveChatStore.getState();

        if (existingMessageId) {
            return (
                state.messagesByChatId[chatId]?.find(
                    (message) => message.message_id === existingMessageId
                )?.reply_message ?? null
            );
        }

        return state.replyDraftByChatId[chatId] ?? null;
    };

    const resolveOpenGraphDataForSend = ({
        chatId,
        existingMessageId,
        openGraphData,
    }: {
        chatId: string;
        existingMessageId?: string;
        openGraphData?: Message["open_graph_data"];
    }) => {
        if (openGraphData !== undefined) {
            return openGraphData;
        }

        if (!existingMessageId) {
            return null;
        }

        return (
            useActiveChatStore
                .getState()
                .messagesByChatId[chatId]?.find(
                    (message) => message.message_id === existingMessageId
                )?.open_graph_data ?? null
        );
    };

    const dispatchPreparedMessage = async ({
        chatId,
        currentUserId,
        currentPhone,
        messageId,
        optimisticMessage,
        conversation,
        clearDraft = false,
        existingMessageId,
        debugTraceId,
        encryptedContent = null,
        recipientEncryptionKeys = null,
        encryptedChatPreview = null,
        chatPreviewRecipientKeys = null,
        isForwardMessage = false,
        transportMediaPreviewUrl,
        transportVideoThumbnail,
        messageAlreadyInStore = false,
    }: {
        chatId: string;
        currentUserId: string;
        currentPhone: string;
        messageId: string;
        optimisticMessage: Message;
        conversation: ConversationContext;
        clearDraft?: boolean;
        existingMessageId?: string;
        debugTraceId?: string;
        encryptedContent?: EncryptedContentEnvelope | null;
        recipientEncryptionKeys?: RecipientEncryptedAesKeyInput[] | null;
        encryptedChatPreview?: EncryptedContentEnvelope | null;
        chatPreviewRecipientKeys?: RecipientEncryptedAesKeyInput[] | null;
        isForwardMessage?: boolean;
        transportMediaPreviewUrl?: string | null;
        transportVideoThumbnail?: string | null;
        messageAlreadyInStore?: boolean;
    }) => {
        const senderNickname = session?.user.name ?? currentPhone;
        const senderAvatarUrl = session?.user.image ?? null;
        const notificationPlaintext =
            getNotificationPlaintextForMessage(optimisticMessage);
        const mediaPreviewUrlForTransport =
            transportMediaPreviewUrl !== undefined
                ? transportMediaPreviewUrl
                : optimisticMessage.media_preview_url ?? null;
        const videoThumbnailForTransport =
            transportVideoThumbnail !== undefined
                ? transportVideoThumbnail
                : optimisticMessage.video_thumbnail;
        const requiresEncryptedContent =
            Boolean(optimisticMessage.message_text_content?.trim()) ||
            optimisticMessage.attached_media === "contact";

        debugSendMessage("dispatch-start", {
            chatId,
            messageId,
            existingMessageId,
            clearDraft,
            conversationType: conversation.conversationType,
            recipientIds: conversation.recipients.map((recipient) => recipient.userId),
            optimisticMessage: summarizeOutgoingMessage(optimisticMessage),
            requiresEncryptedContent,
            hasEncryptedContent: Boolean(encryptedContent),
            recipientEncryptionKeysCount: recipientEncryptionKeys?.length ?? 0,
            hasEncryptedChatPreview: Boolean(encryptedChatPreview),
            chatPreviewRecipientKeysCount: chatPreviewRecipientKeys?.length ?? 0,
        });

        if (requiresEncryptedContent && !encryptedContent) {
            debugSendMessage("dispatch-error-content-not-encrypted", {
                chatId,
                messageId,
            });
            throw new Error("Message content was not encrypted.");
        }

        if (requiresEncryptedContent) {
            const missingRecipientIds = getMissingRecipientEncryptionIds(
                conversation.recipients,
                recipientEncryptionKeys
            );

            if (missingRecipientIds.length > 0) {
                debugSendMessage("dispatch-error-missing-recipient-keys", {
                    chatId,
                    messageId,
                    missingRecipientIds,
                    recipientIds: conversation.recipients.map((recipient) => recipient.userId),
                });
                throw new Error("Missing recipient encryption key.");
            }
        }

        const optimisticMessageForStore = applyEncryptedTransportFields({
            message: {
                ...optimisticMessage,
                client_status: "sending",
                client_error: null,
            },
            encryptedContent,
            recipientEncryptionKeys,
        });

        if (!existingMessageId && !messageAlreadyInStore) {
            debugSendMessage("dispatch-append-optimistic", {
                chatId,
                message: summarizeOutgoingMessage(optimisticMessageForStore),
            });
            appendMessage(chatId, optimisticMessageForStore);
        } else {
            debugSendMessage("dispatch-update-existing-optimistic", {
                chatId,
                existingMessageId: existingMessageId ?? messageId,
                message: summarizeOutgoingMessage(optimisticMessageForStore),
            });
            updateMessage(chatId, existingMessageId ?? messageId, (message) => ({
                ...message,
                ...applyEncryptedTransportFields({
                    message: optimisticMessageForStore,
                    encryptedContent,
                    recipientEncryptionKeys,
                }),
                client_status: "sending",
                client_error: null,
            }));
        }

        const nextChat = buildChatFromMessage({
            conversationId: chatId,
            conversationType: conversation.conversationType,
            message: optimisticMessageForStore,
            currentUserId,
            unreadCount: 0,
            fallbackExistingChat: conversation.selectedChat,
        });
        upsertChat(nextChat);

        await Promise.all([
            upsertDbMessages([optimisticMessageForStore], currentUserId),
            upsertDbChats([nextChat]),
        ]).catch((error) => {
            debugSendMessage("dispatch-persist-pending-error", {
                chatId,
                messageId,
                error,
            });
            console.log("Failed to persist pending outgoing message:", error);
        });
        debugSendMessage("dispatch-persist-pending-finish", {
            chatId,
            messageId,
            nextChat: summarizeOutgoingChat(nextChat),
        });

        if (clearDraft) {
            debugSendMessage("dispatch-clear-draft", { chatId, messageId });
            setDraft(chatId, "");
        }

        if (!existingMessageId && optimisticMessage.reply_message) {
            debugSendMessage("dispatch-clear-reply-draft", { chatId, messageId });
            clearReplyDraft(chatId);
        }

        try {
            if (optimisticMessage.attached_media) {
                logMediaDebug("client.message.dispatch.start", {
                    debugTraceId: debugTraceId ?? null,
                    messageId,
                    chatId,
                    attachedMedia: optimisticMessage.attached_media,
                    mediaUrl: optimisticMessage.media_url,
                    previewUrl: mediaPreviewUrlForTransport,
                    mediaSizeBytes: optimisticMessage.media_size_bytes ?? null,
                    mediaWidth: optimisticMessage.media_width ?? null,
                    mediaHeight: optimisticMessage.media_height ?? null,
                    mediaFileName: optimisticMessage.media_file_name ?? null,
                    recipientUserId: conversation.recipientUserId ?? null,
                });
            }

            const payload: Extract<ClientRealtimeEvent, { type: "SEND_MESSAGE" }> =
                {
                    type: "SEND_MESSAGE",
                    debugTraceId,
                    clientMessageId: messageId,
                    conversationId: chatId,
                    conversationType: conversation.conversationType,
                    senderUserId: currentUserId,
                    senderNickname,
                    senderAvatarUrl,
                    senderPhone: currentPhone,
                    recipientUserId: conversation.recipientUserId,
                    recipientPhone: conversation.recipientPhoneForTransport,
                    participantIds: conversation.participantIds,
                    notificationPlaintext,
                    attachedMedia: optimisticMessage.attached_media,
                    mediaUrl: optimisticMessage.media_url,
                    mediaPreviewUrl: mediaPreviewUrlForTransport,
                    mediaSizeBytes: optimisticMessage.media_size_bytes ?? null,
                    mediaWidth: optimisticMessage.media_width ?? null,
                    mediaHeight: optimisticMessage.media_height ?? null,
                    mediaFileName: optimisticMessage.media_file_name ?? null,
                    videoThumbnail: videoThumbnailForTransport,
                    isForwardMessage,
                    encryptedContent,
                    recipientEncryptionKeys,
                    encryptedChatPreview,
                    chatPreviewRecipientKeys,
                    replyMessage: optimisticMessage.reply_message,
                    openGraphData: optimisticMessage.open_graph_data,
                };
            const httpPayload: HttpMessagePayload = {
                debugTraceId,
                clientMessageId: messageId,
                senderUserId: currentUserId,
                senderNickname,
                senderAvatarUrl,
                chatRoomId: chatId,
                conversationType: conversation.conversationType,
                senderPhone: currentPhone,
                recipientPhone: conversation.recipientPhoneForTransport,
                notificationPlaintext,
                attachedMedia: optimisticMessage.attached_media,
                mediaUrl: optimisticMessage.media_url,
                mediaPreviewUrl: mediaPreviewUrlForTransport,
                mediaSizeBytes: optimisticMessage.media_size_bytes ?? null,
                mediaWidth: optimisticMessage.media_width ?? null,
                mediaHeight: optimisticMessage.media_height ?? null,
                mediaFileName: optimisticMessage.media_file_name ?? null,
                videoThumbnail: videoThumbnailForTransport,
                isForwardMessage,
                encryptedContent,
                recipientEncryptionKeys,
                encryptedChatPreview,
                chatPreviewRecipientKeys,
                replyMessage: optimisticMessage.reply_message,
                openGraphData: optimisticMessage.open_graph_data,
            };

            const realtimeSent = sendRealtimeEvent(payload);
            debugSendMessage("dispatch-transport-result", {
                chatId,
                messageId,
                realtimeSent,
                socketStatus: useRealtimeStore.getState().status,
                hasSocket: Boolean(useRealtimeStore.getState().socket),
            });
            if (optimisticMessage.attached_media) {
                logMediaDebug("client.message.dispatch.transport", {
                    debugTraceId: debugTraceId ?? null,
                    messageId,
                    transport: realtimeSent ? "realtime" : "http",
                });
            }

            if (!realtimeSent) {
                debugSendMessage("dispatch-http-fallback-start", {
                    chatId,
                    messageId,
                });
                const response = await fetch(`${API_BASE_URL}/api/messages`, {
                    method: "POST",
                    headers: getJsonAuthHeaders(debugTraceId),
                    body: JSON.stringify(httpPayload),
                    credentials: "omit",
                });

                if (!response.ok) {
                    debugSendMessage("dispatch-http-fallback-error-status", {
                        chatId,
                        messageId,
                        status: response.status,
                    });
                    if (optimisticMessage.attached_media) {
                        logMediaDebug("client.message.dispatch.http-failed", {
                            debugTraceId: debugTraceId ?? null,
                            messageId,
                            status: response.status,
                        });
                    }
                    throw new Error("Failed to send message");
                }

                const result = (await response.json()) as {
                    message: Parameters<typeof normalizeMessage>[0];
                };
                const nextMessage = normalizeMessage(result.message);
                debugSendMessage("dispatch-http-fallback-response", {
                    chatId,
                    messageId,
                    nextMessage: summarizeOutgoingMessage(nextMessage),
                });
                const [decryptedNextMessage] = await decryptMessageBatch({
                    currentUserId,
                    messages: [nextMessage],
                });

                const finalizedMessage = finalizeReconciledMessage(
                    decryptedNextMessage,
                    optimisticMessageForStore
                );
                updateMessage(chatId, messageId, () => finalizedMessage);
                await upsertDbMessages([finalizedMessage], currentUserId);
                debugSendMessage("dispatch-http-fallback-success", {
                    chatId,
                    messageId,
                    finalizedMessage: summarizeOutgoingMessage(finalizedMessage),
                });
                if (optimisticMessage.attached_media) {
                    logMediaDebug("client.message.dispatch.http-success", {
                        debugTraceId: debugTraceId ?? null,
                        messageId,
                        persistedMessageId: nextMessage.message_id,
                    });
                }
                return;
            }

            void reconcilePendingMessage({
                chatId,
                currentUserId,
                fallbackMessage: optimisticMessage,
                httpPayload,
                messageId,
                updateMessage,
            });
            debugSendMessage("dispatch-reconcile-started", {
                chatId,
                messageId,
            });
        } catch (error) {
            debugSendMessage("dispatch-error", {
                chatId,
                messageId,
                error,
            });
            if (optimisticMessage.attached_media) {
                logMediaDebug("client.message.dispatch.error", {
                    debugTraceId: debugTraceId ?? null,
                    messageId,
                    error:
                        error instanceof Error
                            ? error.message
                            : "Failed to send message",
                });
            }
            const failedMessage: Message = {
                ...optimisticMessageForStore,
                client_status: "failed",
                client_error:
                    error instanceof Error ? error.message : "Failed to send message",
            };
            updateMessage(chatId, messageId, (message) => ({
                ...message,
                client_status: failedMessage.client_status,
                client_error: failedMessage.client_error,
            }));
            await upsertDbMessages([failedMessage], currentUserId).catch((persistError) => {
                debugSendMessage("dispatch-persist-failed-message-error", {
                    chatId,
                    messageId,
                    persistError,
                });
                console.log("Failed to persist failed outgoing message:", persistError);
            });
            throw error;
        }
    };

    const sendMessage = async ({
        text,
        chatId = selectedChatId,
        clearDraft = true,
        existingMessageId,
        openGraphData,
        isForwardMessage = false,
    }: {
        text: string;
        chatId?: string | null;
        clearDraft?: boolean;
        existingMessageId?: string;
        openGraphData?: Message["open_graph_data"];
        isForwardMessage?: boolean;
    }) => {
        const trimmed = text.trim();
        const currentUserId = session?.user.id;
        const currentPhone = (session?.user as { phoneNumber?: string | null } | undefined)
            ?.phoneNumber;
        const currentPublicKey = (session?.user as { yhlaPublicKey?: string | null } | undefined)
            ?.yhlaPublicKey;

        debugSendMessage("send-text-start", {
            chatId,
            selectedChatId,
            existingMessageId,
            clearDraft,
            isForwardMessage,
            rawLength: text.length,
            trimmedLength: trimmed.length,
            hasCurrentUserId: Boolean(currentUserId),
            hasCurrentPhone: Boolean(currentPhone),
            hasCurrentPublicKey: Boolean(currentPublicKey),
            hasOpenGraphData: Boolean(openGraphData),
        });

        if (!trimmed || !chatId || !currentUserId || !currentPhone || !currentPublicKey) {
            debugSendMessage("send-text-abort-missing-context", {
                chatId,
                trimmedLength: trimmed.length,
                hasCurrentUserId: Boolean(currentUserId),
                hasCurrentPhone: Boolean(currentPhone),
                hasCurrentPublicKey: Boolean(currentPublicKey),
            });
            return false;
        }

        const conversation = resolveConversationContext({
            chatId,
            currentUserId,
            currentPublicKey,
            currentPhone,
            requirePeerEncryption: true,
        });
        if (!conversation) {
            debugSendMessage("send-text-abort-no-conversation", { chatId });
            return false;
        }

        const messageId = existingMessageId ?? crypto.randomUUID();
        const replyMessage = isForwardMessage
            ? null
            : resolveReplyMessageForSend({
                  chatId,
                  existingMessageId,
              });
        const resolvedOpenGraphData = resolveOpenGraphDataForSend({
            chatId,
            existingMessageId,
            openGraphData,
        });
        const optimisticMessage = createOptimisticMessage({
            messageId,
            chatId,
            senderUserId: currentUserId,
            plaintext: trimmed,
            replyMessage,
            openGraphData: resolvedOpenGraphData,
            isForwarded: isForwardMessage,
        });

        if (!existingMessageId) {
            appendMessage(chatId, optimisticMessage);

            const nextChat = buildChatFromMessage({
                conversationId: chatId,
                conversationType: conversation.conversationType,
                message: optimisticMessage,
                currentUserId,
                unreadCount: 0,
                fallbackExistingChat: conversation.selectedChat,
            });
            upsertChat(nextChat);

            if (clearDraft) {
                setDraft(chatId, "");
            }

            if (replyMessage) {
                clearReplyDraft(chatId);
            }

            void Promise.all([
                upsertDbMessages([optimisticMessage], currentUserId),
                upsertDbChats([nextChat]),
            ]).catch((error) => {
                console.log("Failed to persist pending outgoing text message:", error);
            });
        }

        try {
            debugSendMessage("send-text-encrypt-start", {
                chatId,
                messageId,
                recipientIds: conversation.recipients.map((recipient) => recipient.userId),
                trimmedLength: trimmed.length,
            });
            const encryptedMessage = await encryptTextForRecipients(
                trimmed,
                conversation.recipients
            );
            debugSendMessage("send-text-encrypt-finish", {
                chatId,
                messageId,
                recipientKeyCount: encryptedMessage.recipientEncryptionKeys.length,
            });
            const previewText = createChatPreviewText(trimmed);
            const encryptedPreview =
                previewText === trimmed
                    ? encryptedMessage
                    : await encryptTextForRecipients(
                          previewText,
                          conversation.recipients
                      );
            debugSendMessage("send-text-preview-encrypt-finish", {
                chatId,
                messageId,
                previewLength: previewText.length,
                reusedMessageEncryption: previewText === trimmed,
                previewRecipientKeyCount: encryptedPreview.recipientEncryptionKeys.length,
            });

            await dispatchPreparedMessage({
                chatId,
                currentUserId,
                currentPhone,
                messageId,
                optimisticMessage,
                conversation,
                clearDraft,
                existingMessageId,
                encryptedContent: encryptedMessage.encryptedContent,
                recipientEncryptionKeys: encryptedMessage.recipientEncryptionKeys,
                encryptedChatPreview: encryptedPreview.encryptedContent,
                chatPreviewRecipientKeys: encryptedPreview.recipientEncryptionKeys,
                isForwardMessage,
                messageAlreadyInStore: !existingMessageId,
            });

            debugSendMessage("send-text-success", { chatId, messageId });
            return true;
        } catch (error) {
            debugSendMessage("send-text-failed", { chatId, messageId, error });
            if (!existingMessageId) {
                const failedMessage: Message = {
                    ...optimisticMessage,
                    client_status: "failed",
                    client_error:
                        error instanceof Error ? error.message : "Failed to send message",
                };

                updateMessage(chatId, messageId, (message) => ({
                    ...message,
                    client_status: failedMessage.client_status,
                    client_error: failedMessage.client_error,
                }));
                void upsertDbMessages([failedMessage], currentUserId).catch(
                    (persistError) => {
                        console.log(
                            "Failed to persist failed outgoing text message:",
                            persistError
                        );
                    }
                );
            }
            return false;
        }
    };

    const sendAttachment = async ({
        file,
        previewFile = null,
        attachedMedia,
        chatId = selectedChatId,
        text = null,
        mediaWidth = null,
        mediaHeight = null,
        isForwardMessage = false,
    }: {
        file: AttachmentUploadInput;
        previewFile?: MessageMediaUploadFile | null;
        attachedMedia: Extract<
            Message["attached_media"],
            "photo" | "video" | "voice" | "file"
        >;
        chatId?: string | null;
        text?: string | null;
        mediaWidth?: number | null;
        mediaHeight?: number | null;
        isForwardMessage?: boolean;
    }) => {
        const currentUserId = session?.user.id;
        const currentPhone = (session?.user as { phoneNumber?: string | null } | undefined)
            ?.phoneNumber;
        const currentPublicKey = (session?.user as { yhlaPublicKey?: string | null } | undefined)
            ?.yhlaPublicKey;

        debugSendMessage("send-attachment-start", {
            chatId,
            selectedChatId,
            attachedMedia,
            fileName: "name" in file ? file.name : null,
            fileType: "type" in file ? file.type : null,
            fileSize: "size" in file ? file.size : null,
            previewFileName: previewFile?.name ?? null,
            previewFileType: previewFile?.type ?? null,
            previewFileSize: previewFile?.size ?? null,
            hasText: Boolean(text?.trim()),
            hasCurrentUserId: Boolean(currentUserId),
            hasCurrentPhone: Boolean(currentPhone),
            hasCurrentPublicKey: Boolean(currentPublicKey),
        });

        if (!chatId || !currentUserId || !currentPhone || !currentPublicKey) {
            debugSendMessage("send-attachment-abort-missing-context", {
                chatId,
                hasCurrentUserId: Boolean(currentUserId),
                hasCurrentPhone: Boolean(currentPhone),
                hasCurrentPublicKey: Boolean(currentPublicKey),
            });
            return false;
        }

        const conversation = resolveConversationContext({
            chatId,
            currentUserId,
            currentPublicKey,
            currentPhone,
            requirePeerEncryption: true,
        });
        if (!conversation) {
            return false;
        }

        let preparedMedia: {
            file: MessageMediaUploadFile;
            originalFile: MessageMediaUploadFile;
            didCompress: boolean;
        };
        try {
            if (isDomFile(file)) {
                preparedMedia = await prepareMessageMediaFile(file, attachedMedia);
            } else {
                if (file.size > MESSAGE_MEDIA_INPUT_MAX_BYTES) {
                    throw new Error("Attachments must be 50 MB or smaller.");
                }

                if (file.size > MESSAGE_MEDIA_TARGET_MAX_BYTES) {
                    throw new Error(
                        "This attachment is over 5 MB. Images are compressed by the media picker; choose a smaller file."
                    );
                }

                preparedMedia = {
                    file,
                    originalFile: file,
                    didCompress: false,
                };
            }
        } catch (error) {
            debugSendMessage("send-attachment-prepare-error", {
                chatId,
                attachedMedia,
                error,
            });
            logMediaDebug("client.attachment.rejected", {
                attachedMedia,
                fileName: file.name,
                fileType: file.type || null,
                fileSize: file.size,
                targetMaxBytes: MESSAGE_MEDIA_TARGET_MAX_BYTES,
                inputMaxBytes: MESSAGE_MEDIA_INPUT_MAX_BYTES,
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to prepare attachment",
            });
            return false;
        }

        const uploadFile = preparedMedia.file;
        const messageId = crypto.randomUUID();
        const debugTraceId = createMediaDebugTraceId(attachedMedia);
        const localMediaUrl = isDomFile(uploadFile)
            ? URL.createObjectURL(uploadFile)
            : getLocalAttachmentUri(uploadFile);
        const mediaDimensions = isDomFile(uploadFile)
            ? await getMessageMediaDimensions(uploadFile)
            : mediaWidth && mediaHeight
                ? { width: mediaWidth, height: mediaHeight }
                : null;
        const localPreviewBlob = isDomFile(uploadFile)
            ? await createMessageMediaPreview(uploadFile)
            : null;
        const localPreviewFile = !isDomFile(uploadFile) ? previewFile : null;
        const localPreviewUrl =
            localPreviewFile?.uri ??
            (localPreviewBlob && typeof URL.createObjectURL === "function"
                ? URL.createObjectURL(localPreviewBlob)
                : localMediaUrl);
        const trimmedText = text?.trim() ?? "";
        const encryptedMessage =
            trimmedText.length > 0
                ? await encryptTextForRecipients(trimmedText, conversation.recipients)
                : null;
        const encryptedPreview =
            encryptedMessage && trimmedText.length > 0
                ? createChatPreviewText(trimmedText) === trimmedText
                    ? encryptedMessage
                    : await encryptTextForRecipients(
                          createChatPreviewText(trimmedText),
                          conversation.recipients
                      )
                : null;
        const replyMessage = isForwardMessage
            ? null
            : resolveReplyMessageForSend({ chatId });
        logMediaDebug("client.attachment.prepare", {
            debugTraceId,
            messageId,
            attachedMedia,
            chatId,
            fileName: uploadFile.name,
            fileType: uploadFile.type || null,
            fileSize: uploadFile.size,
            originalFileName: preparedMedia.originalFile.name,
            originalFileSize: preparedMedia.originalFile.size,
            didCompress: preparedMedia.didCompress,
            targetMaxBytes: MESSAGE_MEDIA_TARGET_MAX_BYTES,
            inputMaxBytes: MESSAGE_MEDIA_INPUT_MAX_BYTES,
            previewSize: localPreviewBlob?.size ?? localPreviewFile?.size ?? null,
            previewType: localPreviewBlob?.type ?? localPreviewFile?.type ?? null,
            previewSource: localPreviewBlob
                ? "blob"
                : localPreviewFile
                    ? "local-file"
                    : null,
            recipientIds: conversation.recipients.map((recipient) => recipient.userId),
        });
        const optimisticMessage = createOptimisticMessage({
            messageId,
            chatId,
            senderUserId: currentUserId,
            attachedMedia,
            mediaUrl: localMediaUrl,
            mediaPreviewUrl: localPreviewUrl,
            mediaSizeBytes: uploadFile.size,
            mediaWidth: mediaDimensions?.width ?? null,
            mediaHeight: mediaDimensions?.height ?? null,
            mediaFileName: uploadFile.name,
            videoThumbnail: attachedMedia === "video" ? localPreviewUrl : null,
            plaintext: trimmedText.length > 0 ? trimmedText : null,
            replyMessage,
            clientLocalMediaName: uploadFile.name,
            clientLocalMediaSize: uploadFile.size,
            clientLocalMediaMimeType: uploadFile.type || null,
            isForwarded: isForwardMessage,
        });
        let attachmentMessageForRetry = optimisticMessage;

        appendMessage(chatId, optimisticMessage);
        debugSendMessage("send-attachment-append-optimistic", {
            chatId,
            debugTraceId,
            message: summarizeOutgoingMessage(optimisticMessage),
        });
        const nextChat = buildChatFromMessage({
            conversationId: chatId,
            conversationType: conversation.conversationType,
            message: optimisticMessage,
            currentUserId,
            unreadCount: 0,
            fallbackExistingChat: conversation.selectedChat,
        });
        upsertChat(nextChat);
        await Promise.all([
            upsertDbMessages([optimisticMessage], currentUserId),
            upsertDbChats([nextChat]),
        ]).catch((error) => {
            console.log("Failed to persist pending outgoing attachment:", error);
        });
        if (replyMessage) {
            clearReplyDraft(chatId);
        }

        try {
            debugSendMessage("send-attachment-upload-start", {
                chatId,
                messageId,
                debugTraceId,
                attachedMedia,
                recipientIds: conversation.recipients.map((recipient) => recipient.userId),
            });
            const upload = await uploadEncryptedMessageMedia(
                uploadFile,
                conversation.recipients.map((recipient) => ({
                    recipientUserId: recipient.userId,
                    publicKey: recipient.publicKey,
                })),
                localPreviewBlob ?? localPreviewFile,
                debugTraceId
            );
            debugSendMessage("send-attachment-upload-success", {
                chatId,
                messageId,
                debugTraceId,
                mediaUrl: upload.mediaUrl,
                previewUrl: upload.previewUrl,
                recipientKeyCount: upload.recipientEncryptionKeys.length,
            });
            const localFallbackPreviewUrl =
                upload.previewUrl ?? (attachedMedia === "video" ? null : localPreviewUrl);
            const localFallbackVideoThumbnail =
                attachedMedia === "video"
                    ? upload.previewUrl ?? localPreviewUrl
                    : optimisticMessage.video_thumbnail;

            updateMessage(chatId, messageId, (message) => ({
                ...message,
                media_url: upload.mediaUrl,
                media_preview_url: localFallbackPreviewUrl,
                media_size_bytes: upload.sizeBytes,
                media_width: mediaDimensions?.width ?? null,
                media_height: mediaDimensions?.height ?? null,
                media_file_name: uploadFile.name,
                video_thumbnail: localFallbackVideoThumbnail,
                client_status: "sending",
                client_error: null,
            }));
            attachmentMessageForRetry = {
                ...optimisticMessage,
                media_url: upload.mediaUrl,
                media_preview_url: localFallbackPreviewUrl,
                media_size_bytes: upload.sizeBytes,
                media_width: mediaDimensions?.width ?? null,
                media_height: mediaDimensions?.height ?? null,
                media_file_name: uploadFile.name,
                video_thumbnail: localFallbackVideoThumbnail,
                message_recipient_keys: upload.recipientEncryptionKeys.map((key) => ({
                    recipient_user_id: key.recipientUserId,
                    encrypted_aes_key: key.encryptedAesKey,
                    algorithm: key.algorithm ?? "aes-256-gcm+rsa-oaep-sha256",
                })),
                client_status: "sending",
                client_error: null,
            };
            await upsertDbMessages([
                attachmentMessageForRetry,
            ], currentUserId);

            await persistDecryptedMessageMedia(upload.objectKey, uploadFile);
            logMediaDebug("client.attachment.upload-complete", {
                debugTraceId,
                messageId,
                objectKey: upload.objectKey,
                mediaUrl: upload.mediaUrl,
                previewUrl: upload.previewUrl,
                recipientKeyCount: upload.recipientEncryptionKeys.length,
            });

            await dispatchPreparedMessage({
                chatId,
                currentUserId,
                currentPhone,
                messageId,
                optimisticMessage: {
                    ...optimisticMessage,
                    media_url: upload.mediaUrl,
                    media_preview_url: localFallbackPreviewUrl,
                    media_size_bytes: upload.sizeBytes,
                    media_width: mediaDimensions?.width ?? null,
                    media_height: mediaDimensions?.height ?? null,
                    media_file_name: uploadFile.name,
                    video_thumbnail: localFallbackVideoThumbnail,
                },
                conversation,
                existingMessageId: messageId,
                debugTraceId,
                encryptedContent: encryptedMessage?.encryptedContent ?? null,
                recipientEncryptionKeys:
                    encryptedMessage?.recipientEncryptionKeys ??
                    upload.recipientEncryptionKeys,
                encryptedChatPreview: encryptedPreview?.encryptedContent ?? null,
                chatPreviewRecipientKeys:
                    encryptedPreview?.recipientEncryptionKeys ?? null,
                isForwardMessage,
                transportMediaPreviewUrl: upload.previewUrl,
                transportVideoThumbnail:
                    attachedMedia === "video"
                        ? upload.previewUrl
                        : optimisticMessage.video_thumbnail,
            });
            debugSendMessage("send-attachment-dispatch-success", {
                chatId,
                messageId,
                debugTraceId,
            });
        } catch (error) {
            debugSendMessage("send-attachment-failed", {
                chatId,
                messageId,
                debugTraceId,
                error,
            });
            logMediaDebug("client.attachment.failed", {
                debugTraceId,
                messageId,
                error:
                    error instanceof Error ? error.message : "Failed to send attachment",
            });
            updateMessage(chatId, messageId, (message) => ({
                ...message,
                client_status: "failed",
                client_error:
                    error instanceof Error ? error.message : "Failed to send attachment",
            }));
            await upsertDbMessages([
                {
                    ...attachmentMessageForRetry,
                    client_status: "failed",
                    client_error:
                        error instanceof Error ? error.message : "Failed to send attachment",
                },
            ], currentUserId).catch((persistError) => {
                console.log("Failed to persist failed outgoing attachment:", persistError);
            });
            return false;
        }

        return true;
    };

    const sendVoiceMessage = async ({
        uri,
        durationMillis,
        chatId = selectedChatId,
        isForwardMessage = false,
    }: {
        uri: string;
        durationMillis?: number;
        chatId?: string | null;
        isForwardMessage?: boolean;
    }) => {
        const currentUserId = session?.user.id;
        const currentPhone = (session?.user as { phoneNumber?: string | null } | undefined)
            ?.phoneNumber;
        const currentPublicKey = (session?.user as { yhlaPublicKey?: string | null } | undefined)
            ?.yhlaPublicKey;

        debugSendMessage("send-voice-start", {
            chatId,
            selectedChatId,
            uri,
            durationMillis: durationMillis ?? null,
            hasCurrentUserId: Boolean(currentUserId),
            hasCurrentPhone: Boolean(currentPhone),
            hasCurrentPublicKey: Boolean(currentPublicKey),
        });

        if (!chatId || !currentUserId || !currentPhone || !currentPublicKey) {
            debugSendMessage("send-voice-abort-missing-context", {
                chatId,
                hasCurrentUserId: Boolean(currentUserId),
                hasCurrentPhone: Boolean(currentPhone),
                hasCurrentPublicKey: Boolean(currentPublicKey),
            });
            return false;
        }

        const conversation = resolveConversationContext({
            chatId,
            currentUserId,
            currentPublicKey,
            currentPhone,
            requirePeerEncryption: true,
        });
        if (!conversation) {
            debugSendMessage("send-voice-abort-no-conversation", {
                chatId,
            });
            return false;
        }

        const fallbackName = `voice-${Date.now()}.m4a`;
        const fileName = getFileNameFromUri(uri, fallbackName);
        const voiceFile = await createUploadFileFromLocalUri({
            uri,
            fallbackName,
            mimeType: getVoiceMimeType(fileName),
        });
        const messageId = crypto.randomUUID();
        const debugTraceId = createMediaDebugTraceId("voice");
        const replyMessage = isForwardMessage
            ? null
            : resolveReplyMessageForSend({ chatId });
        const optimisticMessage = createOptimisticMessage({
            messageId,
            chatId,
            senderUserId: currentUserId,
            attachedMedia: "voice",
            mediaUrl: uri,
            mediaSizeBytes: voiceFile.size,
            mediaFileName: voiceFile.name,
            replyMessage,
            clientLocalMediaName: voiceFile.name,
            clientLocalMediaSize: voiceFile.size,
            clientLocalMediaMimeType: voiceFile.type,
            isForwarded: isForwardMessage,
        });

        appendMessage(chatId, optimisticMessage);
        debugSendMessage("send-voice-append-optimistic", {
            chatId,
            message: summarizeOutgoingMessage(optimisticMessage),
        });
        const nextChat = buildChatFromMessage({
            conversationId: chatId,
            conversationType: conversation.conversationType,
            message: optimisticMessage,
            currentUserId,
            unreadCount: 0,
            fallbackExistingChat: conversation.selectedChat,
        });
        upsertChat(nextChat);
        await Promise.all([
            upsertDbMessages([optimisticMessage], currentUserId),
            upsertDbChats([nextChat]),
        ]).catch((error) => {
            console.log("Failed to persist pending outgoing voice message:", error);
        });
        if (replyMessage) {
            clearReplyDraft(chatId);
        }

        try {
            logMediaDebug("client.voice.prepare", {
                debugTraceId,
                messageId,
                chatId,
                fileName: voiceFile.name,
                fileType: voiceFile.type,
                fileSize: voiceFile.size,
                durationMillis: durationMillis ?? null,
                recipientIds: conversation.recipients.map((recipient) => recipient.userId),
            });

            const upload = await uploadEncryptedMessageMedia(
                voiceFile,
                conversation.recipients.map((recipient) => ({
                    recipientUserId: recipient.userId,
                    publicKey: recipient.publicKey,
                })),
                null,
                debugTraceId
            );
            const uploadedMessage: Message = {
                ...optimisticMessage,
                media_url: upload.mediaUrl,
                media_preview_url: upload.previewUrl,
                media_size_bytes: upload.sizeBytes,
                media_file_name: voiceFile.name,
                message_recipient_keys: upload.recipientEncryptionKeys.map((key) => ({
                    recipient_user_id: key.recipientUserId,
                    encrypted_aes_key: key.encryptedAesKey,
                    algorithm: key.algorithm ?? "aes-256-gcm+rsa-oaep-sha256",
                })),
                client_status: "sending",
                client_error: null,
            };

            updateMessage(chatId, messageId, () => uploadedMessage);
            await upsertDbMessages([uploadedMessage], currentUserId);
            await persistDecryptedMessageMedia(upload.objectKey, voiceFile);

            await dispatchPreparedMessage({
                chatId,
                currentUserId,
                currentPhone,
                messageId,
                optimisticMessage: uploadedMessage,
                conversation,
                existingMessageId: messageId,
                debugTraceId,
                recipientEncryptionKeys: upload.recipientEncryptionKeys,
                isForwardMessage,
            });
            debugSendMessage("send-voice-dispatch-success", {
                chatId,
                messageId,
                debugTraceId,
            });

            return true;
        } catch (error) {
            console.error("[voice-send] failed", {
                debugTraceId,
                messageId,
                uri,
                fileName: voiceFile.name,
                fileType: voiceFile.type,
                fileSize: voiceFile.size,
                error,
                message:
                    error instanceof Error ? error.message : "Failed to send voice message",
                stack: error instanceof Error ? error.stack : null,
            });
            logMediaDebug("client.voice.failed", {
                debugTraceId,
                messageId,
                error:
                    error instanceof Error ? error.message : "Failed to send voice message",
            });
            const failedMessage: Message = {
                ...optimisticMessage,
                client_status: "failed",
                client_error:
                    error instanceof Error ? error.message : "Failed to send voice message",
            };
            updateMessage(chatId, messageId, (message) => ({
                ...message,
                client_status: failedMessage.client_status,
                client_error: failedMessage.client_error,
            }));
            await upsertDbMessages([failedMessage], currentUserId).catch((persistError) => {
                console.log("Failed to persist failed outgoing voice message:", persistError);
            });
            return false;
        }
    };

    const sendContact = async ({
        contact,
        chatId = selectedChatId,
        isForwardMessage = false,
        existingMessageId,
    }: {
        contact: DirectoryContact;
        chatId?: string | null;
        isForwardMessage?: boolean;
        existingMessageId?: string;
    }) => {
        const currentUserId = session?.user.id;
        const currentPhone = (session?.user as { phoneNumber?: string | null } | undefined)
            ?.phoneNumber;
        const currentPublicKey = (session?.user as { yhlaPublicKey?: string | null } | undefined)
            ?.yhlaPublicKey;

        if (!chatId || !currentUserId || !currentPhone || !currentPublicKey) {
            return false;
        }

        const conversation = resolveConversationContext({
            chatId,
            currentUserId,
            currentPublicKey,
            currentPhone,
            requirePeerEncryption: true,
        });
        if (!conversation) {
            return false;
        }

        const sharedContact: NonNullable<Message["contact"]> = {
            contact_id: contact.contact_id,
            contact_name: getContactDisplayName(contact),
            contact_image: contact.contact_avatar ?? "",
            contact_phone: contact.contact_number,
            linked_user_id: contact.linked_user_id ?? null,
        };
        const encryptedMessage = await encryptTextForRecipients(
            serializeSharedContactMessage(sharedContact),
            conversation.recipients
        );
        const encryptedPreview = await encryptTextForRecipients(
            "Contact",
            conversation.recipients
        );
        const messageId = existingMessageId ?? crypto.randomUUID();
        const optimisticMessage = createOptimisticMessage({
            messageId,
            chatId,
            senderUserId: currentUserId,
            attachedMedia: "contact",
            contact: sharedContact,
            replyMessage: isForwardMessage
                ? null
                : resolveReplyMessageForSend({ chatId }),
            isForwarded: isForwardMessage,
        });

        await dispatchPreparedMessage({
            chatId,
            currentUserId,
            currentPhone,
            messageId,
            optimisticMessage,
            conversation,
            existingMessageId,
            encryptedContent: encryptedMessage.encryptedContent,
            recipientEncryptionKeys: encryptedMessage.recipientEncryptionKeys,
            encryptedChatPreview: encryptedPreview.encryptedContent,
            chatPreviewRecipientKeys: encryptedPreview.recipientEncryptionKeys,
            isForwardMessage,
        });

        return true;
    };

    const retryMessage = async (message: Message) => {
        if (message.client_status !== "failed") {
            return false;
        }

        const chatId = message.chat_room_id;
        const currentUserId = session?.user.id;
        const currentPhone = (session?.user as { phoneNumber?: string | null } | undefined)
            ?.phoneNumber;
        const currentPublicKey = (session?.user as { yhlaPublicKey?: string | null } | undefined)
            ?.yhlaPublicKey;

        if (!chatId || !currentUserId || !currentPhone || !currentPublicKey) {
            return false;
        }

        const text = message.message_text_content?.trim() ?? "";
        if (!message.attached_media) {
            if (!text) {
                return false;
            }

            return sendMessage({
                text,
                chatId,
                clearDraft: false,
                existingMessageId: message.message_id,
                openGraphData: message.open_graph_data,
                isForwardMessage: message.is_forward_message,
            });
        }

        const conversation = resolveConversationContext({
            chatId,
            currentUserId,
            currentPublicKey,
            currentPhone,
            requirePeerEncryption: message.attached_media !== "location",
        });
        if (!conversation) {
            debugSendMessage("retry-abort-no-conversation", {
                chatId,
                attachedMedia: message.attached_media,
            });
            return false;
        }

        if (message.attached_media === "contact") {
            if (!message.contact) {
                return false;
            }

            const encryptedMessage = await encryptTextForRecipients(
                serializeSharedContactMessage(message.contact),
                conversation.recipients
            );
            const encryptedPreview = await encryptTextForRecipients(
                "Contact",
                conversation.recipients
            );

            await dispatchPreparedMessage({
                chatId,
                currentUserId,
                currentPhone,
                messageId: message.message_id,
                optimisticMessage: {
                    ...message,
                    client_status: "sending",
                    client_error: null,
                },
                conversation,
                existingMessageId: message.message_id,
                encryptedContent: encryptedMessage.encryptedContent,
                recipientEncryptionKeys: encryptedMessage.recipientEncryptionKeys,
                encryptedChatPreview: encryptedPreview.encryptedContent,
                chatPreviewRecipientKeys: encryptedPreview.recipientEncryptionKeys,
                isForwardMessage: message.is_forward_message,
            });

            return true;
        }

        if (
            message.attached_media === "photo" ||
            message.attached_media === "video" ||
            message.attached_media === "voice" ||
            message.attached_media === "file"
        ) {
            const retryRecipientKeys = getRetryRecipientKeys(message);
            if (!message.media_url || !retryRecipientKeys?.length) {
                const failedMessage: Message = {
                    ...message,
                    client_status: "failed",
                    client_error: "This attachment needs to be selected again.",
                };
                updateMessage(chatId, message.message_id, (current) => ({
                    ...current,
                    client_error: failedMessage.client_error,
                }));
                await upsertDbMessages([failedMessage], currentUserId).catch((error) => {
                    console.log("Failed to persist retry failure:", error);
                });
                return false;
            }

            const encryptedMessage =
                text.length > 0
                    ? await encryptTextForRecipients(text, conversation.recipients)
                    : null;
            const previewText = createChatPreviewText(text);
            const encryptedPreview =
                encryptedMessage && text.length > 0
                    ? previewText === text
                        ? encryptedMessage
                        : await encryptTextForRecipients(previewText, conversation.recipients)
                    : null;

            await dispatchPreparedMessage({
                chatId,
                currentUserId,
                currentPhone,
                messageId: message.message_id,
                optimisticMessage: {
                    ...message,
                    client_status: "sending",
                    client_error: null,
                },
                conversation,
                existingMessageId: message.message_id,
                encryptedContent: encryptedMessage?.encryptedContent ?? null,
                recipientEncryptionKeys:
                    encryptedMessage?.recipientEncryptionKeys ?? retryRecipientKeys,
                encryptedChatPreview: encryptedPreview?.encryptedContent ?? null,
                chatPreviewRecipientKeys:
                    encryptedPreview?.recipientEncryptionKeys ?? null,
                isForwardMessage: message.is_forward_message,
            });

            return true;
        }

        return false;
    };

    return { sendMessage, sendAttachment, sendVoiceMessage, sendContact, retryMessage };
}

async function reconcilePendingMessage({
    chatId,
    currentUserId,
    fallbackMessage,
    httpPayload,
    messageId,
    updateMessage,
}: {
    chatId: string;
    currentUserId: string;
    fallbackMessage: Message;
    httpPayload: HttpMessagePayload;
    messageId: string;
    updateMessage: (
        chatId: string,
        messageId: string,
        updater: (message: Message) => Message
    ) => void;
}) {
    await new Promise((resolve) => window.setTimeout(resolve, ACK_TIMEOUT_MS));

    const pendingMessage = (
        useActiveChatStore.getState().messagesByChatId[chatId] ?? []
    ).find((message) => message.message_id === messageId);

    if (!pendingMessage || pendingMessage.client_status !== "sending") {
        return;
    }

    try {
        const postResponse = await fetch(`${API_BASE_URL}/api/messages`, {
            method: "POST",
            headers: getJsonAuthHeaders(httpPayload.debugTraceId),
            body: JSON.stringify(httpPayload),
            credentials: "omit",
        });

        if (postResponse.ok) {
            const postResult = (await postResponse.json()) as {
                message: Parameters<typeof normalizeMessage>[0];
            };
            const persistedMessage = normalizeMessage(postResult.message);
            const [decryptedPersistedMessage] = await decryptMessageBatch({
                currentUserId,
                messages: [persistedMessage],
            });

            const finalizedMessage = finalizeReconciledMessage(
                decryptedPersistedMessage,
                fallbackMessage
            );
            updateMessage(chatId, messageId, () => finalizedMessage);
            await upsertDbMessages([finalizedMessage], currentUserId);
            if (fallbackMessage.attached_media) {
                logMediaDebug("client.reconcile.http-success", {
                    debugTraceId: httpPayload.debugTraceId ?? null,
                    messageId,
                    persistedMessageId: persistedMessage.message_id,
                });
            }
            return;
        }

        if (fallbackMessage.attached_media) {
            logMediaDebug("client.reconcile.http-fallback", {
                debugTraceId: httpPayload.debugTraceId ?? null,
                messageId,
                status: postResponse.status,
            });
        }

        const response = await fetch(
            `${API_BASE_URL}/api/messages?chatRoomId=${encodeURIComponent(chatId)}&limit=40`,
            {
                cache: "no-store",
                headers: getJsonAuthHeaders(),
                credentials: "omit",
            }
        );

        if (!response.ok) {
            throw new Error("Failed to reconcile message state");
        }

        const payload = (await response.json()) as {
            messages: Parameters<typeof normalizeMessage>[0][];
        };

        const matchedMessage = payload.messages.find(
            (message) => message.message_id === messageId
        );

        if (!matchedMessage) {
            throw new Error("Message confirmation timed out");
        }

        const normalizedMessage = normalizeMessage(matchedMessage);
        const [decryptedMessage] = await decryptMessageBatch({
            currentUserId,
            messages: [normalizedMessage],
        });

        const finalizedMessage = finalizeReconciledMessage(
            decryptedMessage,
            fallbackMessage
        );
        updateMessage(chatId, messageId, () => finalizedMessage);
        await upsertDbMessages([finalizedMessage], currentUserId);
        if (fallbackMessage.attached_media) {
            logMediaDebug("client.reconcile.fetch-success", {
                debugTraceId: httpPayload.debugTraceId ?? null,
                messageId,
                foundMessageId: normalizedMessage.message_id,
            });
        }
    } catch (error) {
        if (fallbackMessage.attached_media) {
            logMediaDebug("client.reconcile.failed", {
                debugTraceId: httpPayload.debugTraceId ?? null,
                messageId,
                error:
                    error instanceof Error
                        ? error.message
                        : "Message confirmation timed out",
            });
        }
        const failedMessage: Message = {
            ...fallbackMessage,
            client_status: "failed",
            client_error:
                error instanceof Error
                    ? error.message
                    : "Message confirmation timed out",
        };
        updateMessage(chatId, messageId, (message) => ({
            ...message,
            client_status: failedMessage.client_status,
            client_error: failedMessage.client_error,
        }));
        await upsertDbMessages([failedMessage], currentUserId).catch((persistError) => {
            console.log("Failed to persist failed outgoing message:", persistError);
        });
    }
}

function finalizeReconciledMessage(
    persistedMessage: Message,
    fallbackMessage: Message
): Message {
    return {
        ...persistedMessage,
        client_local_media_name:
            persistedMessage.client_local_media_name ??
            fallbackMessage.client_local_media_name ??
            null,
        client_local_media_size:
            persistedMessage.client_local_media_size ??
            fallbackMessage.client_local_media_size ??
            null,
        client_local_media_mime_type:
            persistedMessage.client_local_media_mime_type ??
            fallbackMessage.client_local_media_mime_type ??
            null,
        attached_media: persistedMessage.attached_media ?? fallbackMessage.attached_media,
        media_url: persistedMessage.media_url ?? fallbackMessage.media_url,
        media_preview_url:
            persistedMessage.media_preview_url ?? fallbackMessage.media_preview_url,
        media_size_bytes:
            persistedMessage.media_size_bytes ?? fallbackMessage.media_size_bytes,
        media_width: persistedMessage.media_width ?? fallbackMessage.media_width,
        media_height: persistedMessage.media_height ?? fallbackMessage.media_height,
        media_file_name:
            persistedMessage.media_file_name ?? fallbackMessage.media_file_name,
        video_thumbnail:
            persistedMessage.video_thumbnail ?? fallbackMessage.video_thumbnail,
        reply_message:
            persistedMessage.reply_message ?? fallbackMessage.reply_message,
        open_graph_data:
            persistedMessage.open_graph_data ?? fallbackMessage.open_graph_data,
        message_text_content:
            persistedMessage.message_text_content ?? fallbackMessage.message_text_content,
        contact: persistedMessage.contact ?? fallbackMessage.contact,
        is_read_by_recipient:
            persistedMessage.is_read_by_recipient ??
            fallbackMessage.is_read_by_recipient ??
            false,
        is_delivered_to_recipient:
            persistedMessage.is_delivered_to_recipient ??
            fallbackMessage.is_delivered_to_recipient,
        read_by_user_ids:
            persistedMessage.read_by_user_ids ??
            fallbackMessage.read_by_user_ids ??
            [],
        client_status: "sent",
        client_error: null,
    };
}
