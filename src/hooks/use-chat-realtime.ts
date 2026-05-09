import { useCryptoKeys } from "@/context/crypto";
import { authClient } from "@/lib/auth-client";
import {
    decryptMessageBatch,
} from "@/lib/chat-e2ee";
import {
    getDecryptedDbMessagePage,
    hydrateLocalChatCache,
    MESSAGE_PAGE_SIZE,
} from "@/lib/chat-sync";
import {
    applyContactToSingleChat,
    buildChatFromMessage,
    buildChatFromReaction,
    normalizeMessage,
    resolveDirectChatPartner,
} from "@/lib/chat-utils";
import { resolveDirectChatContact } from "@/lib/contact-display";
import {
    isMessageMediaSafeForJsDecrypt,
    materializeMessageMedia,
} from "@/lib/message-media";
import { flushPendingRealtimeEvents } from "@/lib/realtime-outbox";
import { markDbChatRead, upsertDbChats } from "@/lib/upsert-db-chats";
import { getDbMessage, upsertDbMessages } from "@/lib/upsert-db-messages";
import { useActiveChatStore } from "@/store/use-active-chat-store";
import { useAuthStore } from "@/store/auth-store";
import { useContactDirectoryStore } from "@/store/use-contact-directory-store";
import { useRealtimeStore } from "@/store/use-realtime-store";
import type { ChatItemType } from "@/types/chats.type";
import type { Message } from "@/types/messages";
import type { ServerRealtimeEvent } from "@/types/realtime-events";
import * as Network from "expo-network";
import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";

const REALTIME_URL =
    "wss://halabakk-web.nawaf-alhasosah.workers.dev/api/realtime?platform=mobile";
const INITIAL_RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_DELAY_MS = 30000;
const NON_RETRYABLE_CLOSE_CODES = new Set([1000, 1008, 4001, 4003, 4401, 4403]);

type ReactNativeWebSocketConstructor = typeof WebSocket & {
    new (
        url: string,
        protocols?: string | string[] | null,
        options?: { headers?: Record<string, string> }
    ): WebSocket;
};

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
        if (!currentUserId || !targetChatId || !isReady) {
            return;
        }

        const state = useActiveChatStore.getState();
        if (
            state.olderMessagesLoadingByChatId[targetChatId] ||
            state.hasOlderMessagesByChatId[targetChatId] === false
        ) {
            return;
        }

        const currentMessages = state.messagesByChatId[targetChatId] ?? [];
        const oldestMessage = currentMessages[0];
        if (!oldestMessage) {
            return;
        }

        setOlderMessagesLoading(targetChatId, true);
        setChatsError(null);

        try {
            const beforeDate = oldestMessage.created_at;
            const cachedMessages = await getDecryptedDbMessagePage({
                chatId: targetChatId,
                currentUserId,
                beforeDate,
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
            setChatsError(
                error instanceof Error
                    ? error.message
                    : "Failed to load older messages"
            );
        } finally {
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
            return;
        }

        let isCancelled = false;

        const loadMessages = async () => {
            try {
                setChatsError(null);

                let cachedMessages =
                    useActiveChatStore.getState().messagesByChatId[activeChatId] ?? [];

                if (cachedMessages.length === 0) {
                    cachedMessages = await getDecryptedDbMessagePage({
                        chatId: activeChatId,
                        currentUserId,
                    });
                }

                if (!isCancelled && cachedMessages.length > 0) {
                    replaceMessages(activeChatId, cachedMessages);
                    setHasOlderMessages(
                        activeChatId,
                        cachedMessages.length === MESSAGE_PAGE_SIZE
                    );
                }

            } catch (error) {
                if (!isCancelled) {
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
        markChatRead,
        markMessagesReadByUser,
        setRecipientPhone,
    } = useActiveChatStore.getState();
    const { setSocket, setStatus, sendEvent } = useRealtimeStore.getState();

    const currentUserId = session?.user.id ?? null;
    const currentPhone = (session?.user as { phoneNumber?: string | null } | undefined)
        ?.phoneNumber ?? null;

    const currentUserIdRef = useRef(currentUserId);

    useEffect(() => {
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
    }, []);

    const applyKnownContactOverride = useCallback((chat: ChatItemType) => {
        const directContact = resolveDirectChatContact(
            chat,
            useContactDirectoryStore.getState().contacts,
            currentPhone
        );
        return directContact ? applyContactToSingleChat(chat, directContact) : chat;
    }, [currentPhone]);

    useEffect(() => {
        if (!isMountedRef.current || contacts.length === 0) return;
        const current = useActiveChatStore.getState().chats;
        if (current.length === 0) return;
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

        upsertChat(final);
        void upsertDbChats([final]).catch((error) => {
            console.log("Failed to persist realtime chat:", error);
        });
        return final;
    }, [applyKnownContactOverride, upsertChat]);

    useEffect(() => {
        selectedChatIdRef.current = selectedChatId;
    }, [selectedChatId]);

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
            return;
        }

        void materializeMessageMedia(message, {
            downloadFull: shouldDownloadRealtimeMedia(message),
        })
            .then((localMessage) => {
                useActiveChatStore.getState().updateMessage(
                    localMessage.chat_room_id,
                    localMessage.message_id,
                    () => localMessage
                );
                return upsertDbMessages([localMessage], currentUserId);
            })
            .catch((error) => {
                console.log("Failed to save realtime media locally:", error);
            });
    }, [shouldDownloadRealtimeMedia]);

    useEffect(() => {
        if (!connectionUserId || !isReady) return;

        let isCancelled = false;

        const hydrateCache = async () => {
            try {
                setChatsError(null);

                await hydrateLocalChatCache({
                    currentUserId: connectionUserId,
                    onChatsLoaded: (cachedChats) => {
                        if (!isCancelled) {
                            setChats(cachedChats.map(applyKnownContactOverride));
                        }
                    },
                    onChatMessagesLoaded: (chatId, messages, hasOlderMessages) => {
                        if (!isCancelled) {
                            useActiveChatStore.getState().replaceMessages(chatId, messages);
                            useActiveChatStore
                                .getState()
                                .setHasOlderMessages(chatId, Boolean(hasOlderMessages));
                        }
                    },
                });
            } catch (error) {
                if (!isCancelled) {
                    setChatsError(error instanceof Error ? error.message : "Failed to load local chats");
                }
            } finally {
                if (!isCancelled) setChatsLoading(false);
            }
        };

        void hydrateCache();

        return () => {
            isCancelled = true;
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
            setRecipientPhone(null);
            return;
        }

        const selectedChat = useActiveChatStore.getState().chats.find(
            (chat) => chat.chat_id === selectedChatId
        );

        if (selectedChat?.chat_type === 'single') {
            setRecipientPhone(
                selectedChat.contact_phone ??
                resolveDirectChatPartner(selectedChat.chat_id, currentPhone)
            );
            markChatRead(selectedChat.chat_id);
            void markDbChatRead(selectedChat.chat_id).catch((error) => {
                console.log('Failed to mark chat read locally:', error);
            });
        } else {
            setRecipientPhone(null);
            markChatRead(selectedChatId);
            void markDbChatRead(selectedChatId).catch((error) => {
                console.log('Failed to mark chat read locally:', error);
            });
        }
    }, [currentPhone, markChatRead, selectedChatId, setRecipientPhone]);

    const handleServerEvent = useCallback(async (event: ServerRealtimeEvent) => {
        const activeCurrentUserId = currentUserIdRef.current;
        if (!activeCurrentUserId) {
            return;
        }

        const currentUserId = activeCurrentUserId;

        switch (event.type) {
                case "MESSAGE_SENT": {
                    const normalizedMessage = normalizeMessage(event.message);
                    const [nextMessage] = await decryptMessageBatch({
                        currentUserId,
                        messages: [normalizedMessage],
                    });

                    const messageId =
                        event.clientMessageId ?? nextMessage.message_id;
                    const confirmedMessage: Message = {
                        ...nextMessage,
                        client_status: "sent",
                        client_error: null,
                        client_received_via_realtime: false,
                    };

                    const existingChat = useActiveChatStore
                        .getState()
                        .chats.find((chat) => chat.chat_id === event.conversationId);

                    const nextChat = applyKnownContactOverride(
                        buildChatFromMessage({
                            conversationId: event.conversationId,
                            conversationType: event.conversationType,
                            message: confirmedMessage,
                            currentUserId,
                            unreadCount: 0,
                            fallbackExistingChat: existingChat,
                        })
                    );

                    await persistAndUpsertChat(nextChat);

                    const existingMessageId = (
                        useActiveChatStore
                            .getState()
                            .messagesByChatId[event.conversationId] ?? []
                    ).find(
                        (message) =>
                            message.message_id === messageId ||
                            message.message_id === nextMessage.message_id
                    )?.message_id;

                    if (existingMessageId) {
                        useActiveChatStore.getState().updateMessage(
                            event.conversationId,
                            existingMessageId,
                            () => confirmedMessage
                        );
                    } else {
                        appendMessage(event.conversationId, confirmedMessage);
                    }
                    void upsertDbMessages([confirmedMessage], currentUserId).catch((error) => {
                        console.log("Failed to persist confirmed message:", error);
                    });
                    scheduleRealtimeMediaMaterialization(
                        confirmedMessage,
                        currentUserId
                    );
                    break;
                }

                case "NEW_MESSAGE": {
                    const normalizedMessage = normalizeMessage(event.message);
                    const [nextMessage] = await decryptMessageBatch({
                        currentUserId,
                        messages: [normalizedMessage],
                    });
                    const incomingMessage: Message = {
                        ...nextMessage,
                        client_status: "sent",
                        client_error: null,
                        client_received_via_realtime:
                            nextMessage.sender_user_id !== currentUserId,
                    };

                    const existingChat = useActiveChatStore
                        .getState()
                        .chats.find((chat) => chat.chat_id === event.conversationId);
                    const isSelected =
                        useActiveChatStore.getState().selectedChatId ===
                        event.conversationId;
                    const unreadCount =
                        incomingMessage.sender_user_id === currentUserId || isSelected
                            ? 0
                            : (existingChat?.unreaded_messages_length ?? 0) + 1;

                    const nextChat = applyKnownContactOverride(
                        buildChatFromMessage({
                            conversationId: event.conversationId,
                            conversationType: event.conversationType,
                            message: incomingMessage,
                            currentUserId,
                            unreadCount,
                            fallbackExistingChat: existingChat,
                        })
                    );
                    await persistAndUpsertChat(nextChat);
                    appendMessage(event.conversationId, incomingMessage);
                    void upsertDbMessages([incomingMessage], currentUserId).catch((error) => {
                        console.log("Failed to persist incoming message:", error);
                    });
                    scheduleRealtimeMediaMaterialization(
                        incomingMessage,
                        currentUserId
                    );

                    if (isSelected) {
                        markChatRead(event.conversationId);
                        void markDbChatRead(event.conversationId).catch((error) => {
                            console.log('Failed to mark chat read locally:', error);
                        });
                        if (incomingMessage.sender_user_id !== currentUserId) {
                            sendEvent({
                                type: "MARK_READ",
                                conversationId: event.conversationId,
                                messageId: incomingMessage.message_id,
                            });
                        }
                    }
                    break;
                }

                case "CONVERSATION_UPDATED": {
                    const normalizedMessage = normalizeMessage(event.lastMessage);
                    const [nextMessage] = await decryptMessageBatch({
                        currentUserId,
                        messages: [normalizedMessage],
                    });
                    const conversationMessage: Message = {
                        ...nextMessage,
                        client_status: "sent",
                        client_error: null,
                        client_received_via_realtime:
                            nextMessage.sender_user_id !== currentUserId,
                    };
                    const existingChat = useActiveChatStore
                        .getState()
                        .chats.find((chat) => chat.chat_id === event.conversationId);
                    const isSelected =
                        useActiveChatStore.getState().selectedChatId ===
                        event.conversationId;

                    const nextChat = applyKnownContactOverride(
                        buildChatFromMessage({
                            conversationId: event.conversationId,
                            conversationType: event.conversationType,
                            message: conversationMessage,
                            currentUserId,
                            unreadCount: isSelected ? 0 : event.unreadCount,
                            fallbackExistingChat: existingChat,
                        })
                    );
                    await persistAndUpsertChat(nextChat);
                    if (isSelected) {
                        appendMessage(event.conversationId, conversationMessage);
                        markChatRead(event.conversationId);
                        void markDbChatRead(event.conversationId).catch((error) => {
                            console.log('Failed to mark chat read locally:', error);
                        });
                    }

                    if (
                        isSelected &&
                        conversationMessage.sender_user_id !== currentUserId
                    ) {
                        sendEvent({
                            type: "MARK_READ",
                            conversationId: event.conversationId,
                            messageId: conversationMessage.message_id,
                        });
                    }
                    void upsertDbMessages([conversationMessage], currentUserId).catch((error) => {
                        console.log("Failed to persist conversation message:", error);
                    });
                    scheduleRealtimeMediaMaterialization(
                        conversationMessage,
                        currentUserId
                    );
                    break;
                }

                case "MESSAGE_REACTION_UPDATED": {
                    const updatedAt = new Date(event.updatedAt);
                    const safeUpdatedAt = Number.isNaN(updatedAt.getTime())
                        ? new Date()
                        : updatedAt;
                    const messageToPersist = (
                        useActiveChatStore
                            .getState()
                            .messagesByChatId[event.conversationId] ?? []
                    ).find((message) => message.message_id === event.messageId)
                        ?? await getDbMessage(event.messageId);

                    useActiveChatStore.getState().updateMessage(
                        event.conversationId,
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
                            console.log("Failed to persist message reaction:", error);
                        });
                    }

                    const existingChat = useActiveChatStore
                        .getState()
                        .chats.find((chat) => chat.chat_id === event.conversationId);
                    const isSelected =
                        useActiveChatStore.getState().selectedChatId ===
                        event.conversationId;

                    const nextChat = applyKnownContactOverride(
                        buildChatFromReaction({
                            conversationId: event.conversationId,
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
                        markChatRead(event.conversationId);
                        void markDbChatRead(event.conversationId).catch((error) => {
                            console.log('Failed to mark chat read locally:', error);
                        });
                    }
                    break;
                }

                case "CONVERSATION_PRESENCE": {
                    setPresence(event.conversationId, {
                        activeUsers: event.activeUsers,
                        activeUsersCount: event.activeUsersCount,
                    });
                    break;
                }

                case "CONVERSATION_TYPING": {
                    setTypingUsers(
                        event.conversationId,
                        event.activeTypingUsers.filter(
                            (userId) => userId !== currentUserId
                        )
                    );
                    break;
                }

                case "MARK_READ": {
                    const readAt = new Date(event.readAt);
                    if (!Number.isNaN(readAt.getTime())) {
                        markMessagesReadByUser(
                            event.conversationId,
                            event.userId,
                            readAt
                        );
                    }
                    break;
                }

                case "ERROR": {
                    setChatsError(event.message);
                    break;
                }

                default:
                    break;
            }
        },
        [
            appendMessage,
            applyKnownContactOverride,
            markChatRead,
            markMessagesReadByUser,
            persistAndUpsertChat,
            scheduleRealtimeMediaMaterialization,
            sendEvent,
            setChatsError,
            setPresence,
            setTypingUsers,
        ]
    );

    const handleServerEventRef = useRef(handleServerEvent);

    useEffect(() => {
        handleServerEventRef.current = handleServerEvent;
    }, [handleServerEvent]);

    useEffect(() => {
        if (!connectionUserId || !isReady) {
            return;
        }

        let isDisposed = false;
        let socket: WebSocket | null = null;
        let networkSubscription: { remove: () => void } | null = null;
        let appStateSubscription: { remove: () => void } | null = null;
        let isNetworkReachable = true;

        const clearReconnectTimeout = () => {
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }
        };

        const hasUsableNetwork = async () => {
            try {
                const networkState = await Network.getNetworkStateAsync();
                return Boolean(
                    networkState.isConnected !== false &&
                    networkState.isInternetReachable !== false
                );
            } catch {
                return true;
            }
        };

        const scheduleReconnect = (connect: () => void) => {
            if (isDisposed || !isNetworkReachable) {
                return;
            }

            clearReconnectTimeout();

            const reconnectDelay = reconnectDelayRef.current;
            reconnectDelayRef.current = Math.min(
                reconnectDelay * 2,
                MAX_RECONNECT_DELAY_MS
            );
            setStatus("connecting");
            reconnectTimeoutRef.current = setTimeout(connect, reconnectDelay);
        };

        const connect = () => {
            if (
                socket &&
                (socket.readyState === WebSocket.CONNECTING ||
                    socket.readyState === WebSocket.OPEN)
            ) {
                return;
            }

            void (async () => {
                setStatus("connecting");

                isNetworkReachable = await hasUsableNetwork();
                if (!isNetworkReachable || isDisposed) {
                    setStatus("error");
                    return;
                }

                if (!currentUserIdRef.current) {
                    setStatus("error");
                    return;
                }

                const cookies = authClient.getCookie();

                if (!cookies) {
                    setStatus("error");
                    return;
                }

                if (
                    socket &&
                    (socket.readyState === WebSocket.CONNECTING ||
                        socket.readyState === WebSocket.OPEN)
                ) {
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

                nextSocket.addEventListener("open", () => {
                    reconnectDelayRef.current = INITIAL_RECONNECT_DELAY_MS;
                    setStatus("connected");

                    void flushPendingRealtimeEvents(nextSocket).catch((error) => {
                        console.log("Failed to flush realtime outbox:", error);
                    });

                    if (selectedChatIdRef.current) {
                        nextSocket.send(JSON.stringify({
                            type: "JOIN_CONVERSATION",
                            conversationId: selectedChatIdRef.current,
                        }));
                    }
                });

                nextSocket.addEventListener("message", (messageEvent) => {
                    try {
                        const payload = JSON.parse(messageEvent.data as string);
                        void handleServerEventRef.current(payload);
                    } catch (error) {
                        console.error('[WebSocket] Parse error:', error);
                    }
                });

                nextSocket.addEventListener("error", () => {
                    setStatus("error");
                });

                nextSocket.addEventListener("close", (event) => {
                    if (socket === nextSocket) {
                        socket = null;
                        setSocket(null);
                    }

                    if (isDisposed) {
                        return;
                    }

                    if (NON_RETRYABLE_CLOSE_CODES.has(event.code)) {
                        setStatus("error");
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

            isNetworkReachable = nextIsReachable;

            if (!nextIsReachable) {
                clearReconnectTimeout();
                setStatus("error");

                if (
                    socket?.readyState === WebSocket.OPEN ||
                    socket?.readyState === WebSocket.CONNECTING
                ) {
                    socket.close();
                }
                return;
            }

            reconnectDelayRef.current = INITIAL_RECONNECT_DELAY_MS;
            if (
                !socket ||
                socket.readyState === WebSocket.CLOSED ||
                socket.readyState === WebSocket.CLOSING
            ) {
                connect();
            }
        });

        appStateSubscription = AppState.addEventListener("change", (nextAppState) => {
            if (nextAppState !== "active" || isDisposed) {
                return;
            }

            reconnectDelayRef.current = INITIAL_RECONNECT_DELAY_MS;
            void hasUsableNetwork().then((nextIsReachable) => {
                isNetworkReachable = nextIsReachable;
                if (!nextIsReachable || isDisposed) {
                    setStatus("error");
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
            isDisposed = true;
            clearReconnectTimeout();
            networkSubscription?.remove();
            appStateSubscription?.remove();

            if (socket?.readyState === WebSocket.OPEN && selectedChatIdRef.current) {
                socket.send(
                    JSON.stringify({
                        type: "LEAVE_CONVERSATION",
                        conversationId: selectedChatIdRef.current,
                    })
                );
            }

            socket?.close();
            setSocket(null);
            setStatus("idle");
        };
    }, [connectionUserId, isReady, setSocket, setStatus]);

    useEffect(() => {
        const previousSelectedChatId = joinedChatIdRef.current;

        if (previousSelectedChatId && previousSelectedChatId !== selectedChatId) {
            sendEvent({
                type: "LEAVE_CONVERSATION",
                conversationId: previousSelectedChatId,
            });
        }

        if (selectedChatId && previousSelectedChatId !== selectedChatId) {
            sendEvent({
                type: "JOIN_CONVERSATION",
                conversationId: selectedChatId,
            });
        }

        selectedChatIdRef.current = selectedChatId;
        joinedChatIdRef.current = selectedChatId;
    }, [selectedChatId, sendEvent]);
}
