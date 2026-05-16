import { useCryptoKeys } from "@/context/crypto";
import { authClient } from "@/lib/auth-client";
import {
    decryptChatPreviewBatch,
    decryptMessageBatch,
} from "@/lib/chat-e2ee";
import {
    getDecryptedDbMessagePage,
    hydrateLocalChatCache,
    MESSAGE_PAGE_SIZE,
} from "@/lib/chat-sync";
import {
    applyContactToSingleChat,
    areDirectChatIdsEquivalent,
    buildChatFromMessage,
    buildChatFromReaction,
    normalizeChatItem,
    normalizeMessage,
    resolveDirectChatPartner,
} from "@/lib/chat-utils";
import { resolveDirectChatContact } from "@/lib/contact-display";
import {
    isMessageMediaSafeForJsDecrypt,
    materializeMessageMedia,
} from "@/lib/message-media";
import { markChatReadOptimistically } from "@/lib/optimistic-read-receipts";
import {
    completePendingRealtimeEvent,
    flushPendingRealtimeEvents,
} from "@/lib/realtime-outbox";
import { upsertDbChats } from "@/lib/upsert-db-chats";
import { getDbMessage, upsertDbMessages } from "@/lib/upsert-db-messages";
import { useAuthStore } from "@/store/auth-store";
import { useActiveChatStore } from "@/store/use-active-chat-store";
import { useContactDirectoryStore } from "@/store/use-contact-directory-store";
import { useRealtimeStore } from "@/store/use-realtime-store";
import type { ChatItemType } from "@/types/chats.type";
import type { Message } from "@/types/messages";
import type { ClientRealtimeEvent, ServerRealtimeEvent } from "@/types/realtime-events";
import * as Network from "expo-network";
import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";

const REALTIME_URL =
    "wss://halabakk-web.nawaf-alhasosah.workers.dev/api/realtime?platform=mobile";
const INITIAL_RECONNECT_DELAY_MS = 500;
const MAX_RECONNECT_DELAY_MS = 5000;
const CHAT_DEBUG = true;

function debugRealtime(stage: string, payload: Record<string, unknown> = {}) {
    if (!CHAT_DEBUG) {
        return;
    }

}

function summarizeRealtimeMessage(message: Message) {
    return {
        id: message.message_id,
        chatId: message.chat_room_id,
        sender: message.sender_user_id,
        media: message.attached_media,
        hasText: Boolean(message.message_text_content?.trim()),
        textLength: message.message_text_content?.length ?? 0,
        encrypted: hasEncryptedTextPayload(message),
        renderable: hasRenderableMessageContent(message),
        unreadableEncrypted: isUnreadableEncryptedMessage(message),
        status: message.client_status,
        readByRecipient: message.is_read_by_recipient,
        createdAt: message.created_at?.toISOString?.() ?? String(message.created_at),
    };
}

function summarizeRealtimeChat(chat: ChatItemType) {
    return {
        id: chat.chat_id,
        type: chat.chat_type,
        recipientUserId: chat.recipient_user_id,
        recipientPublicKey: Boolean(chat.recipient_public_key),
        lastMessageId: chat.last_message_id,
        lastMessageMedia: chat.last_message_media,
        lastMessageTextLength: chat.last_message_context?.length ?? 0,
        unread: chat.unreaded_messages_length,
        isUnread: chat.is_unreaded_chat,
        updatedAt: chat.updated_at instanceof Date
            ? chat.updated_at.toISOString()
            : String(chat.updated_at),
    };
}

type ReactNativeWebSocketConstructor = typeof WebSocket & {
    new (
        url: string,
        protocols?: string | string[] | null,
        options?: { headers?: Record<string, string> }
    ): WebSocket;
};

function hasEncryptedTextPayload(message: Message) {
    return Boolean(
        message.encrypted_content_ciphertext &&
        message.encrypted_content_iv &&
        message.message_recipient_keys?.length
    );
}

function hasRenderableMessageContent(message: Message) {
    if (message.message_text_content?.trim()) {
        return true;
    }

    if (message.attached_media === "contact") {
        return Boolean(message.contact);
    }

    return Boolean(
        message.attached_media ||
        message.event ||
        message.poll ||
        message.location
    );
}

function isUnreadableEncryptedMessage(message: Message) {
    return hasEncryptedTextPayload(message) && !hasRenderableMessageContent(message);
}

function mergeRealtimeMessageWithLocalContent(
    realtimeMessage: Message,
    localMessage?: Message | null
): Message {
    if (!localMessage) {
        return realtimeMessage;
    }

    const realtimeText = realtimeMessage.message_text_content?.trim()
        ? realtimeMessage.message_text_content
        : null;
    const localText = localMessage.message_text_content?.trim()
        ? localMessage.message_text_content
        : null;

    return {
        ...realtimeMessage,
        message_text_content: realtimeText ?? localText,
        contact: realtimeMessage.contact ?? localMessage.contact ?? null,
        reply_message:
            realtimeMessage.reply_message ?? localMessage.reply_message ?? null,
        open_graph_data:
            realtimeMessage.open_graph_data ?? localMessage.open_graph_data ?? null,
        client_local_media_name:
            realtimeMessage.client_local_media_name ??
            localMessage.client_local_media_name ??
            null,
        client_local_media_size:
            realtimeMessage.client_local_media_size ??
            localMessage.client_local_media_size ??
            null,
        client_local_media_mime_type:
            realtimeMessage.client_local_media_mime_type ??
            localMessage.client_local_media_mime_type ??
            null,
    };
}

function sendSocketEvent(socket: WebSocket | null, event: ClientRealtimeEvent) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        debugRealtime("send-socket-event-skip", {
            type: event.type,
            conversationId: "conversationId" in event ? event.conversationId : null,
            readyState: socket?.readyState ?? null,
        });
        return false;
    }

    try {
        debugRealtime("send-socket-event", {
            type: event.type,
            conversationId: "conversationId" in event ? event.conversationId : null,
        });
        socket.send(JSON.stringify(event));
        return true;
    } catch (error) {
        debugRealtime("send-socket-event-error", {
            type: event.type,
            conversationId: "conversationId" in event ? event.conversationId : null,
            error,
        });
        return false;
    }
}

export function useChatMessages(chatIdOverride?: string | null) {
    const { isReady } = useCryptoKeys();
    const { data: session } = authClient.useSession();
    const selectedChatId = useActiveChatStore((state) => state.selectedChatId);
    const activeChatId = chatIdOverride ?? selectedChatId;

    const {
        setChatsError,
        setMessages,
        replaceMessages,
        setOlderMessagesLoading,
        setHasOlderMessages,
    } = useActiveChatStore.getState();

    const currentUserId = session?.user.id ?? null;

    const loadOlderMessages = useCallback(async (chatId?: string | null) => {
        const targetChatId = chatId ?? activeChatId;
        debugRealtime("load-older-messages-request", {
            targetChatId,
            activeChatId,
            currentUserId,
            isReady,
        });
        if (!currentUserId || !targetChatId || !isReady) {
            debugRealtime("load-older-messages-skip-missing-context", {
                targetChatId,
                currentUserId,
                isReady,
            });
            return;
        }

        const state = useActiveChatStore.getState();
        if (
            state.olderMessagesLoadingByChatId[targetChatId] ||
            state.hasOlderMessagesByChatId[targetChatId] === false
        ) {
            debugRealtime("load-older-messages-skip-state", {
                targetChatId,
                alreadyLoading: state.olderMessagesLoadingByChatId[targetChatId],
                hasOlderMessages: state.hasOlderMessagesByChatId[targetChatId],
            });
            return;
        }

        const currentMessages = state.messagesByChatId[targetChatId] ?? [];
        const oldestMessage = currentMessages[0];
        if (!oldestMessage) {
            debugRealtime("load-older-messages-skip-no-oldest", {
                targetChatId,
                currentMessagesCount: currentMessages.length,
            });
            return;
        }

        setOlderMessagesLoading(targetChatId, true);
        setChatsError(null);
        debugRealtime("load-older-messages-start", {
            targetChatId,
            beforeMessage: summarizeRealtimeMessage(oldestMessage),
        });

        try {
            const beforeDate = oldestMessage.created_at;
            const cachedMessages = await getDecryptedDbMessagePage({
                chatId: targetChatId,
                currentUserId,
                beforeDate,
            });
            debugRealtime("load-older-messages-db-result", {
                targetChatId,
                cachedCount: cachedMessages.length,
                firstMessage: cachedMessages[0] ? summarizeRealtimeMessage(cachedMessages[0]) : null,
                lastMessage: cachedMessages.at(-1) ? summarizeRealtimeMessage(cachedMessages.at(-1) as Message) : null,
            });

            if (cachedMessages.length > 0) {
                setMessages(targetChatId, cachedMessages);
                setHasOlderMessages(
                    targetChatId,
                    cachedMessages.length === MESSAGE_PAGE_SIZE
                );
                return;
            }

            setHasOlderMessages(targetChatId, false);
        } catch (error) {
            debugRealtime("load-older-messages-error", { targetChatId, error });
            setChatsError(
                error instanceof Error
                    ? error.message
                    : "Failed to load older messages"
            );
        } finally {
            debugRealtime("load-older-messages-finish", { targetChatId });
            setOlderMessagesLoading(targetChatId, false);
        }
    }, [
        currentUserId,
        isReady,
        activeChatId,
        setChatsError,
        setHasOlderMessages,
        setMessages,
        setOlderMessagesLoading,
    ]);

    useEffect(() => {
        if (!currentUserId || !activeChatId || !isReady) {
            debugRealtime("load-active-messages-skip", {
                currentUserId,
                activeChatId,
                isReady,
            });
            return;
        }

        let isCancelled = false;

        const loadMessages = async () => {
            try {
                debugRealtime("load-active-messages-start", {
                    activeChatId,
                    currentUserId,
                });
                setChatsError(null);

                let cachedMessages =
                    useActiveChatStore.getState().messagesByChatId[activeChatId] ?? [];
                debugRealtime("load-active-messages-store-cache", {
                    activeChatId,
                    cachedCount: cachedMessages.length,
                });

                if (cachedMessages.length === 0) {
                    cachedMessages = await getDecryptedDbMessagePage({
                        chatId: activeChatId,
                        currentUserId,
                    });
                    debugRealtime("load-active-messages-db-cache", {
                        activeChatId,
                        cachedCount: cachedMessages.length,
                        firstMessage: cachedMessages[0] ? summarizeRealtimeMessage(cachedMessages[0]) : null,
                        lastMessage: cachedMessages.at(-1) ? summarizeRealtimeMessage(cachedMessages.at(-1) as Message) : null,
                    });
                }

                if (!isCancelled && cachedMessages.length > 0) {
                    debugRealtime("load-active-messages-replace", {
                        activeChatId,
                        cachedCount: cachedMessages.length,
                    });
                    replaceMessages(activeChatId, cachedMessages);
                    setHasOlderMessages(
                        activeChatId,
                        cachedMessages.length === MESSAGE_PAGE_SIZE
                    );
                }

            } catch (error) {
                if (!isCancelled) {
                    debugRealtime("load-active-messages-error", {
                        activeChatId,
                        error,
                    });
                    setChatsError(
                        error instanceof Error
                            ? error.message
                            : "Failed to load messages"
                    );
                }
            }
        };

        void loadMessages();

        return () => {
            isCancelled = true;
            debugRealtime("load-active-messages-cleanup", { activeChatId });
        };
    }, [
        currentUserId,
        isReady,
        activeChatId,
        setChatsError,
        setHasOlderMessages,
        setMessages,
        replaceMessages,
    ]);

    return { loadOlderMessages };
}

export function useChatRealtime() {
    const { isReady } = useCryptoKeys();
    const { data: session } = authClient.useSession();
    const hasSession = useAuthStore((state) => state.hasSession);
    const selectedChatId = useActiveChatStore((state) => state.selectedChatId);
    const contacts = useContactDirectoryStore((state) => state.contacts);
    const isMountedRef = useRef(false);

    const {
        setChats,
        upsertChat,
        setChatsLoading,
        setChatsError,
        appendMessage,
        setPresence,
        setTypingUsers,
        markMessagesReadByUser,
        setRecipientPhone,
    } = useActiveChatStore.getState();
    const { setSocket, setStatus } = useRealtimeStore.getState();

    const currentUserId = session?.user.id ?? null;
    const currentPhone = (session?.user as { phoneNumber?: string | null } | undefined)
        ?.phoneNumber ?? null;

    const currentUserIdRef = useRef(currentUserId);

    useEffect(() => {
        debugRealtime("current-user-ref-update", {
            currentUserId,
            hasSession,
        });
        if (currentUserId) {
            currentUserIdRef.current = currentUserId;
            return;
        }

        if (!hasSession) {
            currentUserIdRef.current = null;
        }
    }, [currentUserId, hasSession]);

    const connectionUserId =
        currentUserId ?? (hasSession ? currentUserIdRef.current : null);

    const selectedChatIdRef = useRef<string | null>(selectedChatId);
    const joinedChatIdRef = useRef<string | null>(null);
    const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY_MS);
    const notificationSettingsRef = useRef({
        disableMessagesNotifications: false,
        disableGroupsNotifications: false,
    });

    useEffect(() => {
        isMountedRef.current = true;
        debugRealtime("realtime-hook-mounted", {
            currentUserId,
            connectionUserId,
            selectedChatId,
            isReady,
            hasSession,
        });

        return () => {
            debugRealtime("realtime-hook-unmounted", {
                currentUserId: currentUserIdRef.current,
                selectedChatId: selectedChatIdRef.current,
                joinedChatId: joinedChatIdRef.current,
            });
            isMountedRef.current = false;
        };
    }, []);

    const applyKnownContactOverride = useCallback((chat: ChatItemType) => {
        const directContact = resolveDirectChatContact(
            chat,
            useContactDirectoryStore.getState().contacts,
            currentPhone
        );
        return directContact ? applyContactToSingleChat(chat, directContact) : chat;
    }, [currentPhone]);

    const resolveStoreChatId = useCallback((conversationId: string) => {
        const chats = useActiveChatStore.getState().chats;
        const resolvedId = (
            chats.find((chat) => chat.chat_id === conversationId)?.chat_id ??
            chats.find((chat) =>
                areDirectChatIdsEquivalent(chat.chat_id, conversationId)
            )?.chat_id ??
            conversationId
        );

        debugRealtime("resolve-store-chat-id", {
            conversationId,
            resolvedId,
            chatsCount: chats.length,
            changed: resolvedId !== conversationId,
        });

        return resolvedId;
    }, []);

    useEffect(() => {
        if (!isMountedRef.current || contacts.length === 0) {
            debugRealtime("contacts-override-skip", {
                isMounted: isMountedRef.current,
                contactsCount: contacts.length,
            });
            return;
        }
        const current = useActiveChatStore.getState().chats;
        if (current.length === 0) {
            debugRealtime("contacts-override-skip-no-chats", {
                contactsCount: contacts.length,
            });
            return;
        }
        debugRealtime("contacts-override-apply", {
            contactsCount: contacts.length,
            chatsCount: current.length,
        });
        setChats(current.map(applyKnownContactOverride));
    }, [contacts, applyKnownContactOverride, setChats]);

    const persistAndUpsertChat = useCallback(async (chat: ChatItemType) => {
        const state = useActiveChatStore.getState();
        const existingChat = state.chats.find(
            (item) => item.chat_id === chat.chat_id
        );
        const shouldKeepLocallyRead =
            state.selectedChatId === chat.chat_id ||
            (
                existingChat?.last_message_id === chat.last_message_id &&
                !existingChat?.is_unreaded_chat &&
                (existingChat?.unreaded_messages_length ?? 0) === 0
            );
        const final = applyKnownContactOverride(
            shouldKeepLocallyRead
                ? {
                    ...chat,
                    is_unreaded_chat: false,
                    unreaded_messages_length: 0,
                }
                : chat
        );

        debugRealtime("persist-upsert-chat", {
            incoming: summarizeRealtimeChat(chat),
            final: summarizeRealtimeChat(final),
            existing: existingChat ? summarizeRealtimeChat(existingChat) : null,
            selectedChatId: state.selectedChatId,
            shouldKeepLocallyRead,
        });
        upsertChat(final);
        void upsertDbChats([final]).catch((error) => {
            debugRealtime("persist-upsert-chat-db-error", {
                chatId: final.chat_id,
                error,
            });
            console.log("Failed to persist realtime chat:", error);
        });
        return final;
    }, [applyKnownContactOverride, upsertChat]);

    useEffect(() => {
        debugRealtime("selected-chat-ref-update", { selectedChatId });
        selectedChatIdRef.current = selectedChatId;
    }, [selectedChatId]);

    const syncSelectedConversationJoin = useCallback((socket: WebSocket | null) => {
        const desiredChatId = selectedChatIdRef.current;
        const joinedChatId = joinedChatIdRef.current;
        debugRealtime("sync-selected-conversation-join-start", {
            desiredChatId,
            joinedChatId,
            socketReadyState: socket?.readyState ?? null,
        });

        if (joinedChatId && joinedChatId !== desiredChatId) {
            const didLeave = sendSocketEvent(socket, {
                type: "LEAVE_CONVERSATION",
                conversationId: joinedChatId,
            });

            if (didLeave) {
                debugRealtime("sync-selected-conversation-left", {
                    leftChatId: joinedChatId,
                    desiredChatId,
                });
                joinedChatIdRef.current = null;
            } else {
                debugRealtime("sync-selected-conversation-leave-failed", {
                    leftChatId: joinedChatId,
                    desiredChatId,
                });
                return false;
            }
        }

        if (!desiredChatId) {
            debugRealtime("sync-selected-conversation-no-desired-chat");
            return true;
        }

        if (joinedChatIdRef.current === desiredChatId) {
            debugRealtime("sync-selected-conversation-already-joined", {
                desiredChatId,
            });
            return true;
        }

        const didJoin = sendSocketEvent(socket, {
            type: "JOIN_CONVERSATION",
            conversationId: desiredChatId,
        });

        if (didJoin) {
            joinedChatIdRef.current = desiredChatId;
            debugRealtime("sync-selected-conversation-joined", { desiredChatId });
        } else {
            debugRealtime("sync-selected-conversation-join-failed", {
                desiredChatId,
                socketReadyState: socket?.readyState ?? null,
            });
        }

        return didJoin;
    }, []);

    const disableMessagesNotifications = Boolean(
        (session?.user as any)?.disableMessagesNotifications
    );
    const disableGroupsNotifications = Boolean(
        (session?.user as any)?.disableGroupsNotifications
    );
    const imageMediaAutoDownload = Boolean(
        (session?.user as any)?.imageMediaAutoDownload
    );
    const videoMediaAutoDownload = Boolean(
        (session?.user as any)?.videoMediaAutoDownload
    );

    useEffect(() => {
        notificationSettingsRef.current = {
            disableMessagesNotifications,
            disableGroupsNotifications,
        };
    }, [disableMessagesNotifications, disableGroupsNotifications]);

    const shouldDownloadRealtimeMedia = useCallback((message: Message) => {
        if (!isMessageMediaSafeForJsDecrypt(message)) {
            return false;
        }

        switch (message.attached_media) {
            case "photo":
                return imageMediaAutoDownload;
            case "video":
                return videoMediaAutoDownload || imageMediaAutoDownload;
            case "voice":
            case "file":
                return true;
            default:
                return false;
        }
    }, [imageMediaAutoDownload, videoMediaAutoDownload]);

    const scheduleRealtimeMediaMaterialization = useCallback((
        message: Message,
        currentUserId: string
    ) => {
        if (!message.attached_media) {
            debugRealtime("media-materialization-skip-no-media", {
                message: summarizeRealtimeMessage(message),
            });
            return;
        }

        debugRealtime("media-materialization-schedule", {
            message: summarizeRealtimeMessage(message),
            downloadFull: shouldDownloadRealtimeMedia(message),
        });
        void materializeMessageMedia(message, {
            downloadFull: shouldDownloadRealtimeMedia(message),
        })
            .then((localMessage) => {
                debugRealtime("media-materialization-success", {
                    message: summarizeRealtimeMessage(localMessage),
                });
                useActiveChatStore.getState().updateMessage(
                    localMessage.chat_room_id,
                    localMessage.message_id,
                    () => localMessage
                );
                return upsertDbMessages([localMessage], currentUserId);
            })
            .catch((error) => {
                debugRealtime("media-materialization-error", {
                    message: summarizeRealtimeMessage(message),
                    error,
                });
                console.log("Failed to save realtime media locally:", error);
            });
    }, [shouldDownloadRealtimeMedia]);

    useEffect(() => {
        if (!connectionUserId || !isReady) {
            debugRealtime("hydrate-cache-skip", { connectionUserId, isReady });
            return;
        }

        let isCancelled = false;

        const hydrateCache = async () => {
            try {
                debugRealtime("hydrate-cache-start", { connectionUserId });
                setChatsError(null);

                await hydrateLocalChatCache({
                    currentUserId: connectionUserId,
                    onChatsLoaded: (cachedChats) => {
                        if (!isCancelled) {
                            debugRealtime("hydrate-cache-chats-loaded", {
                                count: cachedChats.length,
                                chats: cachedChats.slice(0, 8).map(summarizeRealtimeChat),
                            });
                            setChats(cachedChats.map(applyKnownContactOverride));
                        }
                    },
                    onChatMessagesLoaded: (chatId, messages, hasOlderMessages) => {
                        if (!isCancelled) {
                            debugRealtime("hydrate-cache-messages-loaded", {
                                chatId,
                                count: messages.length,
                                hasOlderMessages,
                                firstMessage: messages[0] ? summarizeRealtimeMessage(messages[0]) : null,
                                lastMessage: messages.at(-1) ? summarizeRealtimeMessage(messages.at(-1) as Message) : null,
                            });
                            useActiveChatStore.getState().replaceMessages(chatId, messages);
                            useActiveChatStore
                                .getState()
                                .setHasOlderMessages(chatId, Boolean(hasOlderMessages));
                        }
                    },
                });
            } catch (error) {
                if (!isCancelled) {
                    debugRealtime("hydrate-cache-error", { connectionUserId, error });
                    setChatsError(error instanceof Error ? error.message : "Failed to load local chats");
                }
            } finally {
                if (!isCancelled) {
                    debugRealtime("hydrate-cache-finish", { connectionUserId });
                    setChatsLoading(false);
                }
            }
        };

        void hydrateCache();

        return () => {
            isCancelled = true;
            debugRealtime("hydrate-cache-cleanup", { connectionUserId });
        };
    }, [
        applyKnownContactOverride,
        connectionUserId,
        currentPhone,
        isReady,
        setChats,
        setChatsError,
        setChatsLoading,
    ]);

    useEffect(() => {
        if (!selectedChatId) {
            debugRealtime("recipient-phone-clear-no-selected-chat");
            setRecipientPhone(null);
            return;
        }

        const selectedChat = useActiveChatStore.getState().chats.find(
            (chat) => chat.chat_id === selectedChatId
        );

        if (selectedChat?.chat_type === 'single') {
            debugRealtime("recipient-phone-set-single-chat", {
                selectedChatId,
                contactPhone: selectedChat.contact_phone,
                resolvedPartner: resolveDirectChatPartner(selectedChat.chat_id, currentPhone),
            });
            setRecipientPhone(
                selectedChat.contact_phone ??
                resolveDirectChatPartner(selectedChat.chat_id, currentPhone)
            );
        } else {
            debugRealtime("recipient-phone-clear-non-single-chat", {
                selectedChatId,
                chatType: selectedChat?.chat_type,
            });
            setRecipientPhone(null);
        }
    }, [currentPhone, selectedChatId, setRecipientPhone]);

    const handleServerEvent = useCallback(async (event: ServerRealtimeEvent) => {
        const activeCurrentUserId = currentUserIdRef.current;
        if (!activeCurrentUserId) {
            debugRealtime("server-event-skip-no-current-user", {
                eventType: event.type,
            });
            return;
        }

        const currentUserId = activeCurrentUserId;
        debugRealtime("server-event-start", {
            eventType: event.type,
            currentUserId,
            selectedChatId: useActiveChatStore.getState().selectedChatId,
            joinedChatId: joinedChatIdRef.current,
            rawConversationId: "conversationId" in event ? event.conversationId : null,
        });

        switch (event.type) {
                case "GROUP_CREATED": {
                    debugRealtime("event-group-created-start", {
                        chat: summarizeRealtimeChat(normalizeChatItem(event.chat)),
                    });
                    const normalizedChat = normalizeChatItem(event.chat);
                    const [decryptedChat] = await decryptChatPreviewBatch({
                        chats: [normalizedChat],
                        currentUserId,
                    });

                    await persistAndUpsertChat({
                        ...decryptedChat,
                        last_message_context:
                            decryptedChat.last_message_context || "Group created",
                    });
                    debugRealtime("event-group-created-finish", {
                        chat: summarizeRealtimeChat(decryptedChat),
                    });
                    break;
                }

                case "MESSAGE_SENT": {
                    const conversationId = resolveStoreChatId(event.conversationId);
                    debugRealtime("event-message-sent-start", {
                        rawConversationId: event.conversationId,
                        conversationId,
                        clientMessageId: event.clientMessageId,
                    });
                    const normalizedMessage = {
                        ...normalizeMessage(event.message),
                        chat_room_id: conversationId,
                    };
                    debugRealtime("event-message-sent-normalized", {
                        message: summarizeRealtimeMessage(normalizedMessage),
                    });
                    const [nextMessage] = await decryptMessageBatch({
                        currentUserId,
                        messages: [normalizedMessage],
                    });
                    debugRealtime("event-message-sent-decrypted", {
                        message: summarizeRealtimeMessage(nextMessage),
                    });

                    const messageId =
                        event.clientMessageId ?? nextMessage.message_id;
                    const existingMessage = (
                        useActiveChatStore
                            .getState()
                            .messagesByChatId[conversationId] ?? []
                    ).find(
                        (message) =>
                            message.message_id === messageId ||
                            message.message_id === nextMessage.message_id
                    );
                    const mergedMessage = mergeRealtimeMessageWithLocalContent(
                        nextMessage,
                        existingMessage
                    );
                    debugRealtime("event-message-sent-merged", {
                        messageId,
                        existingMessage: existingMessage ? summarizeRealtimeMessage(existingMessage) : null,
                        mergedMessage: summarizeRealtimeMessage(mergedMessage),
                    });

                    if (isUnreadableEncryptedMessage(mergedMessage)) {
                        debugRealtime("event-message-sent-skip-unreadable", {
                            message: summarizeRealtimeMessage(mergedMessage),
                        });
                        break;
                    }

                    const confirmedMessage: Message = {
                        ...mergedMessage,
                        client_status: "sent",
                        client_error: null,
                        client_received_via_realtime: false,
                    };

                    const existingChat = useActiveChatStore
                        .getState()
                        .chats.find((chat) => chat.chat_id === conversationId);

                    const nextChat = applyKnownContactOverride(
                        buildChatFromMessage({
                            conversationId,
                            conversationType: event.conversationType,
                            message: confirmedMessage,
                            currentUserId,
                            unreadCount: 0,
                            fallbackExistingChat: existingChat,
                        })
                    );

                    await persistAndUpsertChat(nextChat);

                    const existingMessageId = existingMessage?.message_id;

                    if (existingMessageId) {
                        debugRealtime("event-message-sent-update-existing", {
                            conversationId,
                            existingMessageId,
                            confirmedMessage: summarizeRealtimeMessage(confirmedMessage),
                        });
                        useActiveChatStore.getState().updateMessage(
                            conversationId,
                            existingMessageId,
                            () => confirmedMessage
                        );
                    } else {
                        debugRealtime("event-message-sent-append-new", {
                            conversationId,
                            confirmedMessage: summarizeRealtimeMessage(confirmedMessage),
                        });
                        appendMessage(conversationId, confirmedMessage);
                    }
                    void upsertDbMessages([confirmedMessage], currentUserId).catch((error) => {
                        debugRealtime("event-message-sent-db-error", {
                            message: summarizeRealtimeMessage(confirmedMessage),
                            error,
                        });
                        console.log("Failed to persist confirmed message:", error);
                    });
                    scheduleRealtimeMediaMaterialization(
                        confirmedMessage,
                        currentUserId
                    );
                    break;
                }

                case "NEW_MESSAGE": {
                    const conversationId = resolveStoreChatId(event.conversationId);
                    debugRealtime("event-new-message-start", {
                        rawConversationId: event.conversationId,
                        conversationId,
                        selectedChatId: useActiveChatStore.getState().selectedChatId,
                    });
                    const normalizedMessage = {
                        ...normalizeMessage(event.message),
                        chat_room_id: conversationId,
                    };
                    debugRealtime("event-new-message-normalized", {
                        message: summarizeRealtimeMessage(normalizedMessage),
                    });
                    const [nextMessage] = await decryptMessageBatch({
                        currentUserId,
                        messages: [normalizedMessage],
                    });
                    debugRealtime("event-new-message-decrypted", {
                        message: summarizeRealtimeMessage(nextMessage),
                    });
                    const existingMessage = (
                        useActiveChatStore
                            .getState()
                            .messagesByChatId[conversationId] ?? []
                    ).find((message) => message.message_id === nextMessage.message_id);
                    const mergedMessage = mergeRealtimeMessageWithLocalContent(
                        nextMessage,
                        existingMessage
                    );
                    debugRealtime("event-new-message-merged", {
                        existingMessage: existingMessage ? summarizeRealtimeMessage(existingMessage) : null,
                        mergedMessage: summarizeRealtimeMessage(mergedMessage),
                    });

                    if (isUnreadableEncryptedMessage(mergedMessage)) {
                        debugRealtime("event-new-message-skip-unreadable", {
                            message: summarizeRealtimeMessage(mergedMessage),
                        });
                        break;
                    }

                    const incomingMessage: Message = {
                        ...mergedMessage,
                        client_status: "sent",
                        client_error: null,
                        client_received_via_realtime:
                            mergedMessage.sender_user_id !== currentUserId,
                    };

                    const existingChat = useActiveChatStore
                        .getState()
                        .chats.find((chat) => chat.chat_id === conversationId);
                    const isSelected =
                        useActiveChatStore.getState().selectedChatId ===
                        conversationId;
                    const unreadCount =
                        incomingMessage.sender_user_id === currentUserId || isSelected
                            ? 0
                            : (existingChat?.unreaded_messages_length ?? 0) + 1;
                    debugRealtime("event-new-message-chat-state", {
                        conversationId,
                        isSelected,
                        unreadCount,
                        existingChat: existingChat ? summarizeRealtimeChat(existingChat) : null,
                        incomingMessage: summarizeRealtimeMessage(incomingMessage),
                    });

                    const nextChat = applyKnownContactOverride(
                        buildChatFromMessage({
                            conversationId,
                            conversationType: event.conversationType,
                            message: incomingMessage,
                            currentUserId,
                            unreadCount,
                            fallbackExistingChat: existingChat,
                        })
                    );
                    await persistAndUpsertChat(nextChat);
                    debugRealtime("event-new-message-append", {
                        conversationId,
                        incomingMessage: summarizeRealtimeMessage(incomingMessage),
                    });
                    appendMessage(conversationId, incomingMessage);
                    void upsertDbMessages([incomingMessage], currentUserId).catch((error) => {
                        debugRealtime("event-new-message-db-error", {
                            message: summarizeRealtimeMessage(incomingMessage),
                            error,
                        });
                        console.log("Failed to persist incoming message:", error);
                    });
                    scheduleRealtimeMediaMaterialization(
                        incomingMessage,
                        currentUserId
                    );

                    break;
                }

                case "CONVERSATION_UPDATED": {
                    const conversationId = resolveStoreChatId(event.conversationId);
                    debugRealtime("event-conversation-updated-start", {
                        rawConversationId: event.conversationId,
                        conversationId,
                        unreadCount: event.unreadCount,
                    });
                    const normalizedMessage = {
                        ...normalizeMessage(event.lastMessage),
                        chat_room_id: conversationId,
                    };
                    debugRealtime("event-conversation-updated-normalized", {
                        message: summarizeRealtimeMessage(normalizedMessage),
                    });
                    const [nextMessage] = await decryptMessageBatch({
                        currentUserId,
                        messages: [normalizedMessage],
                    });
                    debugRealtime("event-conversation-updated-decrypted", {
                        message: summarizeRealtimeMessage(nextMessage),
                    });
                    const existingMessage = (
                        useActiveChatStore
                            .getState()
                            .messagesByChatId[conversationId] ?? []
                    ).find((message) => message.message_id === nextMessage.message_id);
                    const mergedMessage = mergeRealtimeMessageWithLocalContent(
                        nextMessage,
                        existingMessage
                    );
                    debugRealtime("event-conversation-updated-merged", {
                        existingMessage: existingMessage ? summarizeRealtimeMessage(existingMessage) : null,
                        mergedMessage: summarizeRealtimeMessage(mergedMessage),
                    });

                    if (isUnreadableEncryptedMessage(mergedMessage)) {
                        debugRealtime("event-conversation-updated-skip-unreadable", {
                            message: summarizeRealtimeMessage(mergedMessage),
                        });
                        break;
                    }

                    const conversationMessage: Message = {
                        ...mergedMessage,
                        client_status: "sent",
                        client_error: null,
                        client_received_via_realtime:
                            mergedMessage.sender_user_id !== currentUserId,
                    };
                    const existingChat = useActiveChatStore
                        .getState()
                        .chats.find((chat) => chat.chat_id === conversationId);
                    const isSelected =
                        useActiveChatStore.getState().selectedChatId ===
                        conversationId;
                    debugRealtime("event-conversation-updated-chat-state", {
                        conversationId,
                        isSelected,
                        existingChat: existingChat ? summarizeRealtimeChat(existingChat) : null,
                        conversationMessage: summarizeRealtimeMessage(conversationMessage),
                    });

                    const nextChat = applyKnownContactOverride(
                        buildChatFromMessage({
                            conversationId,
                            conversationType: event.conversationType,
                            message: conversationMessage,
                            currentUserId,
                            unreadCount: isSelected ? 0 : event.unreadCount,
                            fallbackExistingChat: existingChat,
                        })
                    );
                    await persistAndUpsertChat(nextChat);
                    if (isSelected) {
                        debugRealtime("event-conversation-updated-append-selected", {
                            conversationId,
                            conversationMessage: summarizeRealtimeMessage(conversationMessage),
                        });
                        appendMessage(conversationId, conversationMessage);
                    }
                    void upsertDbMessages([conversationMessage], currentUserId).catch((error) => {
                        debugRealtime("event-conversation-updated-db-error", {
                            message: summarizeRealtimeMessage(conversationMessage),
                            error,
                        });
                        console.log("Failed to persist conversation message:", error);
                    });
                    scheduleRealtimeMediaMaterialization(
                        conversationMessage,
                        currentUserId
                    );
                    break;
                }

                case "MESSAGE_REACTION_UPDATED": {
                    const conversationId = resolveStoreChatId(event.conversationId);
                    debugRealtime("event-reaction-updated-start", {
                        rawConversationId: event.conversationId,
                        conversationId,
                        messageId: event.messageId,
                        reaction: event.reaction,
                        unreadCount: event.unreadCount,
                    });
                    const updatedAt = new Date(event.updatedAt);
                    const safeUpdatedAt = Number.isNaN(updatedAt.getTime())
                        ? new Date()
                        : updatedAt;
                    const messageToPersist = (
                        useActiveChatStore
                            .getState()
                            .messagesByChatId[conversationId] ?? []
                    ).find((message) => message.message_id === event.messageId)
                        ?? await getDbMessage(event.messageId);

                    useActiveChatStore.getState().updateMessage(
                        conversationId,
                        event.messageId,
                        (message) => ({
                            ...message,
                            message_raction: event.reaction,
                            updated_at: safeUpdatedAt,
                        })
                    );

                    if (messageToPersist) {
                        void upsertDbMessages(
                            [
                                {
                                    ...messageToPersist,
                                    message_raction: event.reaction,
                                    updated_at: safeUpdatedAt,
                                },
                            ],
                            currentUserId
                        ).catch((error) => {
                            debugRealtime("event-reaction-updated-db-error", {
                                conversationId,
                                messageId: event.messageId,
                                error,
                            });
                            console.log("Failed to persist message reaction:", error);
                        });
                    }

                    const existingChat = useActiveChatStore
                        .getState()
                        .chats.find((chat) => chat.chat_id === conversationId);
                    const isSelected =
                        useActiveChatStore.getState().selectedChatId ===
                        conversationId;

                    const nextChat = applyKnownContactOverride(
                        buildChatFromReaction({
                            conversationId,
                            conversationType: event.conversationType,
                            messageId: event.messageId,
                            reaction: event.reaction,
                            updatedAt: safeUpdatedAt,
                            currentUserId,
                            unreadCount: isSelected ? 0 : event.unreadCount,
                            fallbackExistingChat: existingChat,
                        })
                    );

                    await persistAndUpsertChat(nextChat);
                    if (isSelected) {
                        debugRealtime("event-reaction-updated-mark-read-selected", {
                            conversationId,
                            messageId: event.messageId,
                        });
                        markChatReadOptimistically({
                            conversationId,
                            messageId: event.messageId,
                        });
                    }
                    break;
                }

                case "CONVERSATION_PRESENCE": {
                    const conversationId = resolveStoreChatId(event.conversationId);
                    debugRealtime("event-presence", {
                        rawConversationId: event.conversationId,
                        conversationId,
                        activeUsersCount: event.activeUsersCount,
                        activeUsers: event.activeUsers,
                    });
                    setPresence(conversationId, {
                        activeUsers: event.activeUsers,
                        activeUsersCount: event.activeUsersCount,
                    });
                    break;
                }

                case "CONVERSATION_TYPING": {
                    const conversationId = resolveStoreChatId(event.conversationId);
                    debugRealtime("event-typing", {
                        rawConversationId: event.conversationId,
                        conversationId,
                        activeTypingUsers: event.activeTypingUsers,
                    });
                    setTypingUsers(
                        conversationId,
                        event.activeTypingUsers.filter(
                            (userId) => userId !== currentUserId
                        )
                    );
                    break;
                }

                case "MARK_READ": {
                    const conversationId = resolveStoreChatId(event.conversationId);
                    debugRealtime("event-mark-read", {
                        rawConversationId: event.conversationId,
                        conversationId,
                        messageId: event.messageId,
                        userId: event.userId,
                        readAt: event.readAt,
                    });
                    const readAt = new Date(event.readAt);
                    if (!Number.isNaN(readAt.getTime())) {
                        markMessagesReadByUser(
                            conversationId,
                            event.userId,
                            readAt
                        );
                    }

                    if (event.userId === currentUserId) {
                        void completePendingRealtimeEvent({
                            type: "MARK_READ",
                            conversationId,
                            messageId: event.messageId ?? undefined,
                        }).catch((error) => {
                            debugRealtime("event-mark-read-complete-pending-error", {
                                conversationId,
                                messageId: event.messageId,
                                error,
                            });
                        });
                    }
                    break;
                }

                case "ERROR": {
                    debugRealtime("event-error", { message: event.message });
                    setChatsError(event.message);
                    break;
                }

                default:
                    debugRealtime("server-event-unhandled", { eventType: event.type });
                    break;
            }
            debugRealtime("server-event-finish", {
                eventType: event.type,
                rawConversationId: "conversationId" in event ? event.conversationId : null,
            });
        },
        [
            appendMessage,
            applyKnownContactOverride,
            markMessagesReadByUser,
            persistAndUpsertChat,
            resolveStoreChatId,
            scheduleRealtimeMediaMaterialization,
            setChatsError,
            setPresence,
            setTypingUsers,
        ]
    );

    const handleServerEventRef = useRef(handleServerEvent);

    useEffect(() => {
        handleServerEventRef.current = handleServerEvent;
        debugRealtime("server-event-handler-ref-updated");
    }, [handleServerEvent]);

    useEffect(() => {
        if (!connectionUserId || !isReady) {
            debugRealtime("socket-effect-skip", { connectionUserId, isReady });
            return;
        }

        debugRealtime("socket-effect-start", {
            connectionUserId,
            selectedChatId: selectedChatIdRef.current,
            isReady,
        });
        let isDisposed = false;
        let socket: WebSocket | null = null;
        let networkSubscription: { remove: () => void } | null = null;
        let appStateSubscription: { remove: () => void } | null = null;
        let isNetworkReachable = true;

        const clearReconnectTimeout = () => {
            if (reconnectTimeoutRef.current) {
                debugRealtime("socket-clear-reconnect-timeout");
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }
        };

        const hasUsableNetwork = async () => {
            try {
                const networkState = await Network.getNetworkStateAsync();
                debugRealtime("socket-network-state-check", {
                    isConnected: networkState.isConnected,
                    isInternetReachable: networkState.isInternetReachable,
                    type: networkState.type,
                });
                return Boolean(
                    networkState.isConnected !== false &&
                    networkState.isInternetReachable !== false
                );
            } catch (error) {
                debugRealtime("socket-network-state-check-error", { error });
                return true;
            }
        };

        const scheduleReconnect = (connect: () => void) => {
            if (isDisposed) {
                debugRealtime("socket-reconnect-skip-disposed");
                return;
            }

            clearReconnectTimeout();

            const reconnectDelay = reconnectDelayRef.current;
            reconnectDelayRef.current = Math.min(
                reconnectDelay * 2,
                MAX_RECONNECT_DELAY_MS
            );
            setStatus("connecting");
            debugRealtime("socket-reconnect-scheduled", {
                reconnectDelay,
                nextDelay: reconnectDelayRef.current,
                selectedChatId: selectedChatIdRef.current,
                joinedChatId: joinedChatIdRef.current,
            });
            reconnectTimeoutRef.current = setTimeout(connect, reconnectDelay);
        };

        const connect = () => {
            debugRealtime("socket-connect-request", {
                currentReadyState: socket?.readyState ?? null,
                selectedChatId: selectedChatIdRef.current,
                joinedChatId: joinedChatIdRef.current,
            });
            if (
                socket &&
                (socket.readyState === WebSocket.CONNECTING ||
                    socket.readyState === WebSocket.OPEN)
            ) {
                debugRealtime("socket-connect-skip-existing-socket", {
                    readyState: socket.readyState,
                });
                return;
            }

            void (async () => {
                setStatus("connecting");
                debugRealtime("socket-connect-start", {
                    connectionUserId,
                    selectedChatId: selectedChatIdRef.current,
                });

                isNetworkReachable = await hasUsableNetwork();
                if (!isNetworkReachable || isDisposed) {
                    debugRealtime("socket-connect-delay-network-or-disposed", {
                        isNetworkReachable,
                        isDisposed,
                    });
                    scheduleReconnect(connect);
                    return;
                }

                if (!currentUserIdRef.current) {
                    debugRealtime("socket-connect-delay-no-current-user");
                    scheduleReconnect(connect);
                    return;
                }

                const cookies = authClient.getCookie();

                if (!cookies) {
                    debugRealtime("socket-connect-delay-no-cookies");
                    scheduleReconnect(connect);
                    return;
                }

                if (
                    socket &&
                    (socket.readyState === WebSocket.CONNECTING ||
                        socket.readyState === WebSocket.OPEN)
                ) {
                    debugRealtime("socket-connect-skip-race-existing-socket", {
                        readyState: socket.readyState,
                    });
                    return;
                }

                const SocketConstructor =
                    WebSocket as ReactNativeWebSocketConstructor;
                const nextSocket = new SocketConstructor(REALTIME_URL, undefined, {
                    headers: {
                        Cookie: cookies,
                    },
                });

                socket = nextSocket;
                setSocket(nextSocket);
                debugRealtime("socket-created", {
                    readyState: nextSocket.readyState,
                    selectedChatId: selectedChatIdRef.current,
                });

                nextSocket.addEventListener("open", () => {
                    debugRealtime("socket-open", {
                        selectedChatId: selectedChatIdRef.current,
                        joinedChatId: joinedChatIdRef.current,
                    });
                    reconnectDelayRef.current = INITIAL_RECONNECT_DELAY_MS;
                    setStatus("connected");

                    void flushPendingRealtimeEvents(nextSocket).catch((error) => {
                        debugRealtime("socket-flush-outbox-error", { error });
                        console.log("Failed to flush realtime outbox:", error);
                    });

                    const didJoinSelectedConversation =
                        syncSelectedConversationJoin(nextSocket);
                    debugRealtime("socket-open-join-result", {
                        didJoinSelectedConversation,
                        selectedChatId: selectedChatIdRef.current,
                        joinedChatId: joinedChatIdRef.current,
                    });
                    if (
                        !didJoinSelectedConversation &&
                        nextSocket.readyState === WebSocket.OPEN
                    ) {
                        setStatus("connecting");
                        nextSocket.close();
                    }
                });

                nextSocket.addEventListener("message", (messageEvent) => {
                    try {
                        debugRealtime("socket-message-raw", {
                            rawLength: String(messageEvent.data).length,
                            rawPreview: String(messageEvent.data).slice(0, 300),
                        });
                        const payload = JSON.parse(messageEvent.data as string);
                        debugRealtime("socket-message-parsed", {
                            eventType: payload?.type,
                            conversationId: payload?.conversationId,
                            messageId: payload?.message?.message_id ?? payload?.messageId ?? null,
                        });
                        void handleServerEventRef.current(payload);
                    } catch (error) {
                        debugRealtime("socket-message-parse-error", { error });
                        console.error('[WebSocket] Parse error:', error);
                    }
                });

                nextSocket.addEventListener("error", () => {
                    debugRealtime("socket-error", {
                        readyState: nextSocket.readyState,
                    });
                    setStatus("connecting");
                    if (
                        nextSocket.readyState === WebSocket.OPEN ||
                        nextSocket.readyState === WebSocket.CONNECTING
                    ) {
                        nextSocket.close();
                        return;
                    }

                    if (socket === nextSocket) {
                        socket = null;
                        setSocket(null);
                    }
                    scheduleReconnect(connect);
                });

                nextSocket.addEventListener("close", () => {
                    debugRealtime("socket-close", {
                        readyState: nextSocket.readyState,
                        selectedChatId: selectedChatIdRef.current,
                        joinedChatId: joinedChatIdRef.current,
                        isDisposed,
                    });
                    if (socket === nextSocket) {
                        socket = null;
                        setSocket(null);
                    }
                    joinedChatIdRef.current = null;

                    if (isDisposed) {
                        return;
                    }

                    scheduleReconnect(connect);
                });
            })();
        };

        networkSubscription = Network.addNetworkStateListener((networkState) => {
            const nextIsReachable = Boolean(
                networkState.isConnected !== false &&
                networkState.isInternetReachable !== false
            );
            debugRealtime("socket-network-listener", {
                isConnected: networkState.isConnected,
                isInternetReachable: networkState.isInternetReachable,
                nextIsReachable,
                previousIsReachable: isNetworkReachable,
            });

            isNetworkReachable = nextIsReachable;

            if (!nextIsReachable) {
                clearReconnectTimeout();
                setStatus("connecting");

                if (
                    socket?.readyState === WebSocket.OPEN ||
                    socket?.readyState === WebSocket.CONNECTING
                ) {
                    socket.close();
                }
                scheduleReconnect(connect);
                return;
            }

            reconnectDelayRef.current = INITIAL_RECONNECT_DELAY_MS;
            if (socket?.readyState === WebSocket.OPEN) {
                const didSync = syncSelectedConversationJoin(socket);
                debugRealtime("socket-network-restored-sync", {
                    didSync,
                    selectedChatId: selectedChatIdRef.current,
                    joinedChatId: joinedChatIdRef.current,
                });
                if (!didSync) {
                    setStatus("connecting");
                    socket.close();
                }
                return;
            }

            if (
                !socket ||
                socket.readyState === WebSocket.CLOSED ||
                socket.readyState === WebSocket.CLOSING
            ) {
                connect();
            }
        });

        appStateSubscription = AppState.addEventListener("change", (nextAppState) => {
            debugRealtime("socket-app-state-change", {
                nextAppState,
                isDisposed,
                socketReadyState: socket?.readyState ?? null,
            });
            if (nextAppState !== "active" || isDisposed) {
                return;
            }

            reconnectDelayRef.current = INITIAL_RECONNECT_DELAY_MS;
            void hasUsableNetwork().then((nextIsReachable) => {
                isNetworkReachable = nextIsReachable;
                if (!nextIsReachable || isDisposed) {
                    if (!isDisposed) {
                        setStatus("connecting");
                        scheduleReconnect(connect);
                    }
                    return;
                }

                if (socket?.readyState === WebSocket.OPEN) {
                    const didSync = syncSelectedConversationJoin(socket);
                    debugRealtime("socket-app-active-sync", {
                        didSync,
                        selectedChatId: selectedChatIdRef.current,
                        joinedChatId: joinedChatIdRef.current,
                    });
                    if (!didSync) {
                        setStatus("connecting");
                        socket.close();
                    }
                    return;
                }

                if (
                    !socket ||
                    socket.readyState === WebSocket.CLOSED ||
                    socket.readyState === WebSocket.CLOSING
                ) {
                    connect();
                }
            });
        });

        connect();

        return () => {
            debugRealtime("socket-effect-cleanup", {
                selectedChatId: selectedChatIdRef.current,
                joinedChatId: joinedChatIdRef.current,
                socketReadyState: socket?.readyState ?? null,
            });
            isDisposed = true;
            clearReconnectTimeout();
            networkSubscription?.remove();
            appStateSubscription?.remove();

            if (socket?.readyState === WebSocket.OPEN && joinedChatIdRef.current) {
                debugRealtime("socket-cleanup-leave-joined-chat", {
                    joinedChatId: joinedChatIdRef.current,
                });
                sendSocketEvent(socket, {
                    type: "LEAVE_CONVERSATION",
                    conversationId: joinedChatIdRef.current,
                });
            }
            joinedChatIdRef.current = null;

            socket?.close();
            setSocket(null);
            setStatus("idle");
        };
    }, [
        connectionUserId,
        isReady,
        setSocket,
        setStatus,
        syncSelectedConversationJoin,
    ]);

    useEffect(() => {
        debugRealtime("selected-chat-sync-effect", {
            selectedChatId,
            previousRef: selectedChatIdRef.current,
        });
        selectedChatIdRef.current = selectedChatId;

        const socket = useRealtimeStore.getState().socket;
        const didSync = syncSelectedConversationJoin(socket);
        debugRealtime("selected-chat-sync-effect-result", {
            selectedChatId,
            didSync,
            socketReadyState: socket?.readyState ?? null,
            joinedChatId: joinedChatIdRef.current,
        });
        if (!didSync && socket?.readyState === WebSocket.OPEN) {
            setStatus("connecting");
            socket.close();
        }
    }, [selectedChatId, setStatus, syncSelectedConversationJoin]);
}
