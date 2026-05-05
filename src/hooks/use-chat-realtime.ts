import { useCryptoKeys } from "@/context/crypto";
import { showMessageNotification } from "@/helper/push-notification";
import { authClient } from "@/lib/auth-client";
import {
    decryptChatPreviewBatch,
    decryptMessageBatch,
} from "@/lib/chat-e2ee";
import {
    applyContactToSingleChat,
    buildChatFromMessage,
    buildChatFromReaction,
    normalizeChatItem,
    normalizeMessage,
    resolveDirectChatPartner,
} from "@/lib/chat-utils";
import { decryptStoredContact } from "@/lib/contact-crypto";
import { resolveDirectChatContact } from "@/lib/contact-display";
import { getDbChat, getDbChats, upsertDbChats } from "@/lib/upsert-db-chats";
import { getDbMessage, getDbMessages, upsertDbMessages } from "@/lib/upsert-db-messages";
import { useActiveChatStore } from "@/store/use-active-chat-store";
import { useContactDirectoryStore } from "@/store/use-contact-directory-store";
import { useRealtimeStore } from "@/store/use-realtime-store";
import type { ChatItemType } from "@/types/chats.type";
import type { Message } from "@/types/messages";
import type { ServerRealtimeEvent } from "@/types/realtime-events";
import { useCallback, useEffect, useRef } from "react";

const MESSAGE_PAGE_SIZE = 20;

type RemoteMessage = Omit<Message, "created_at" | "updated_at"> & {
    created_at: string | Date;
    updated_at: string | Date;
};

type MessagePage = {
    messages: Message[];
    hasMore: boolean;
};

async function hydrateStoredContactOverrides(chats: ChatItemType[]) {
    const chatsWithStoredContacts = await Promise.all(
        chats.map(async (chat) => {
            if (chat.chat_type !== "single" || !chat.stored_contact) {
                return chat;
            }

            try {
                const decryptedContact = await decryptStoredContact(
                    chat.stored_contact
                );

                return applyContactToSingleChat(chat, decryptedContact);
            } catch {
                return chat;
            }
        })
    );

    return chatsWithStoredContacts;
}

async function getDecryptedDbMessagePage({
    chatId,
    currentUserId,
    beforeDate,
}: {
    chatId: string;
    currentUserId: string;
    beforeDate?: Date;
}) {
    const cachedMessages = await getDbMessages(
        chatId,
        MESSAGE_PAGE_SIZE,
        beforeDate
    );

    if (cachedMessages.length === 0) {
        return [];
    }

    return decryptMessageBatch({
        currentUserId,
        messages: cachedMessages,
    });
}

async function fetchDecryptedMessagePage({
    chatId,
    currentUserId,
    cookies,
    beforeDate,
}: {
    chatId: string;
    currentUserId: string;
    cookies: string | null;
    beforeDate?: Date;
}): Promise<MessagePage> {
    const beforeQuery = beforeDate
        ? `&before=${encodeURIComponent(beforeDate.toISOString())}`
        : "";

    const response = await fetch(
        `https://halabakk-web.nawaf-alhasosah.workers.dev/api/messages?chatRoomId=${encodeURIComponent(chatId)}&limit=${MESSAGE_PAGE_SIZE}${beforeQuery}`,
        {
            headers: {
                "Cookie": cookies || "",
                "Content-Type": "application/json"
            },
            credentials: "omit"
        }
    );

    if (!response.ok) {
        throw new Error("Failed to fetch messages");
    }

    const payload = (await response.json()) as {
        messages: RemoteMessage[];
        hasMore?: boolean;
    };

    const normalizedMessages = payload.messages
        .map(normalizeMessage)
        .filter((message) =>
            beforeDate ? message.created_at.getTime() < beforeDate.getTime() : true
        );
    const decryptedMessages = await decryptMessageBatch({
        currentUserId,
        messages: normalizedMessages,
    });

    return {
        messages: decryptedMessages,
        hasMore:
            normalizedMessages.length > 0
                ? payload.hasMore ?? normalizedMessages.length === MESSAGE_PAGE_SIZE
                : false,
    };
}

export function useChatMessages() {
    const { isReady } = useCryptoKeys();
    const { data: session } = authClient.useSession();
    const cookies = authClient.getCookie();
    const selectedChatId = useActiveChatStore((state) => state.selectedChatId);

    const {
        setChatsError,
        setMessages,
        setMessagesLoading,
        setOlderMessagesLoading,
        setHasOlderMessages,
    } = useActiveChatStore.getState();

    const currentUserId = session?.user.id ?? null;

    const loadOlderMessages = useCallback(async (chatId?: string | null) => {
        const targetChatId = chatId ?? selectedChatId;
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
            }

            const remotePage = await fetchDecryptedMessagePage({
                chatId: targetChatId,
                currentUserId,
                cookies,
                beforeDate,
            });

            await upsertDbMessages(remotePage.messages, currentUserId);
            setMessages(targetChatId, remotePage.messages);
            setHasOlderMessages(targetChatId, remotePage.hasMore);
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
        cookies,
        currentUserId,
        isReady,
        selectedChatId,
        setChatsError,
        setHasOlderMessages,
        setMessages,
        setOlderMessagesLoading,
    ]);

    useEffect(() => {
        if (!currentUserId || !selectedChatId || !isReady) {
            return;
        }

        let isCancelled = false;

        const loadMessages = async () => {
            try {
                setMessagesLoading(selectedChatId, true);
                setChatsError(null);

                const cachedMessages = await getDecryptedDbMessagePage({
                    chatId: selectedChatId,
                    currentUserId,
                });

                if (!isCancelled && cachedMessages.length > 0) {
                    setMessages(selectedChatId, cachedMessages);
                    setHasOlderMessages(
                        selectedChatId,
                        cachedMessages.length === MESSAGE_PAGE_SIZE
                    );
                }

                const remotePage = await fetchDecryptedMessagePage({
                    chatId: selectedChatId,
                    currentUserId,
                    cookies,
                });

                if (isCancelled) {
                    return;
                }

                await upsertDbMessages(remotePage.messages, currentUserId);

                if (!isCancelled) {
                    setMessages(selectedChatId, remotePage.messages);
                    setHasOlderMessages(selectedChatId, remotePage.hasMore);
                }
            } catch (error) {
                if (!isCancelled) {
                    setChatsError(
                        error instanceof Error
                            ? error.message
                            : "Failed to load messages"
                    );
                }
            } finally {
                if (!isCancelled) {
                    setMessagesLoading(selectedChatId, false);
                }
            }
        };

        void loadMessages();

        return () => {
            isCancelled = true;
        };
    }, [
        cookies,
        currentUserId,
        isReady,
        selectedChatId,
        setChatsError,
        setHasOlderMessages,
        setMessages,
        setMessagesLoading,
    ]);

    return { loadOlderMessages };
}

export function useChatRealtime() {
    const { isReady } = useCryptoKeys();
    const { data: session } = authClient.useSession();
    const cookies = authClient.getCookie();
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
    const currentPhoneRef = useRef(currentPhone);

    useEffect(() => { currentUserIdRef.current = currentUserId; }, [currentUserId]);
    useEffect(() => { currentPhoneRef.current = currentPhone; }, [currentPhone]);

    const selectedChatIdRef = useRef<string | null>(selectedChatId);
    const joinedChatIdRef = useRef<string | null>(null);
    const reconnectTimeoutRef = useRef<number | null>(null);
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

    const persistAndUpsertChat = async (chat: ChatItemType) => {
        await upsertDbChats([chat]);
        const fromDb = await getDbChat(chat.chat_id);
        const final = applyKnownContactOverride(fromDb ?? chat);
        upsertChat(final);
        return final;
    };

    useEffect(() => {
        selectedChatIdRef.current = selectedChatId;
    }, [selectedChatId]);

    const disableMessagesNotifications = Boolean(
        (session?.user as any)?.disableMessagesNotifications
    );
    const disableGroupsNotifications = Boolean(
        (session?.user as any)?.disableGroupsNotifications
    );

    useEffect(() => {
        notificationSettingsRef.current = {
            disableMessagesNotifications,
            disableGroupsNotifications,
        };
    }, [disableMessagesNotifications, disableGroupsNotifications]);

    useEffect(() => {
        if (!currentUserId || !isReady) return;

        let isCancelled = false;

        const fetchChats = async () => {
            try {
                setChatsLoading(true);
                setChatsError(null);

                const cachedChats = await getDbChats();
                const cachedById = new Map(cachedChats.map((c) => [c.chat_id, c]));
                if (!isCancelled && cachedChats.length > 0) {
                    setChats(cachedChats.map(applyKnownContactOverride));
                }

                const response = await fetch(
                    "https://halabakk-web.nawaf-alhasosah.workers.dev/api/chats",
                    {
                        headers: { Cookie: cookies || "", "Content-Type": "application/json" },
                        credentials: "omit",
                    }
                );
                if (!response.ok) throw new Error("Failed to fetch chats");

                const payload = (await response.json()) as { chats: ChatItemType[] };
                if (isCancelled) return;

                const normalizedChats = payload.chats.map(normalizeChatItem);
                const chatsWithStoredContacts = await hydrateStoredContactOverrides(normalizedChats);

                const needsDecryption: ChatItemType[] = [];
                const alreadyCached: ChatItemType[] = [];

                for (const chat of chatsWithStoredContacts) {
                    const cached = cachedById.get(chat.chat_id);
                    const previewUnchanged =
                        cached &&
                        cached.last_message_id === chat.last_message_id &&
                        cached.last_message_context !== "";

                    if (previewUnchanged) {
                        alreadyCached.push({
                            ...chat,
                            last_message_context: cached.last_message_context,
                            last_message_media: cached.last_message_media,
                        });
                    } else {
                        needsDecryption.push(chat);
                    }
                }

                const decryptedChats = needsDecryption.length > 0
                    ? await decryptChatPreviewBatch({ chats: needsDecryption, currentUserId })
                    : [];

                if (isCancelled) return;

                const toUpsert = [
                    ...decryptedChats,
                    ...alreadyCached,
                ];
                await upsertDbChats(toUpsert);

                const freshChats = await getDbChats();
                if (!isCancelled) {
                    setChats(freshChats.map(applyKnownContactOverride));
                }
            } catch (error) {
                if (!isCancelled) {
                    setChatsError(error instanceof Error ? error.message : "Failed to load chats");
                }
            } finally {
                if (!isCancelled) setChatsLoading(false);
            }
        };

        void fetchChats();

        return () => {
            isCancelled = true;
        };
    }, [currentPhone, currentUserId, isReady, setChats, setChatsError, setChatsLoading]);

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
        } else {
            setRecipientPhone(null);
            markChatRead(selectedChatId);
        }
    }, [currentPhone, markChatRead, selectedChatId, setRecipientPhone]);

    useEffect(() => {
        if (!currentUserId || !isReady) {
            return;
        }

        let isDisposed = false;
        let socket: WebSocket | null = null;

        const handleServerEvent = async (event: ServerRealtimeEvent) => {
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

                    await upsertDbMessages([confirmedMessage], currentUserId);

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

                    await upsertDbMessages([incomingMessage], currentUserId);

                    appendMessage(event.conversationId, incomingMessage);

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
                    const notificationSettings = notificationSettingsRef.current;
                    const shouldNotify =
                        incomingMessage.sender_user_id !== currentUserId &&
                        !nextChat.is_muted_chat_notifications &&
                        !notificationSettings.disableMessagesNotifications &&
                        !(
                            event.conversationType === "group" &&
                            notificationSettings.disableGroupsNotifications
                        );

                    if (shouldNotify) {
                        const isCurrentlyViewing =
                            useActiveChatStore.getState().selectedChatId === event.conversationId;

                        if (!isCurrentlyViewing) {
                            await showMessageNotification(
                                nextChat.display_name ?? 'New Message',
                                nextChat.last_message_context ?? '',
                                event.conversationId,
                                incomingMessage.sender_user_id,
                            );
                        }
                    }
                    if (isSelected) {
                        markChatRead(event.conversationId);
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
                    await upsertDbMessages([conversationMessage], currentUserId);
                    if (isSelected) {
                        appendMessage(event.conversationId, conversationMessage);
                    }
                    await persistAndUpsertChat(nextChat);
                    const notificationSettings = notificationSettingsRef.current;
                    const shouldNotify =
                        conversationMessage.sender_user_id !== currentUserId &&
                        !nextChat.is_muted_chat_notifications &&
                        !notificationSettings.disableMessagesNotifications &&
                        !(
                            event.conversationType === "group" &&
                            notificationSettings.disableGroupsNotifications
                        );

                    if (shouldNotify) {
                        const isCurrentlyViewing =
                            useActiveChatStore.getState().selectedChatId === event.conversationId;

                        if (!isCurrentlyViewing) {
                            await showMessageNotification(
                                nextChat.display_name ?? 'New Message',
                                nextChat.last_message_context ?? '',
                                event.conversationId,
                                conversationMessage.sender_user_id,
                            );
                        }
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
                        await upsertDbMessages(
                            [
                                {
                                    ...messageToPersist,
                                    message_raction: event.reaction,
                                    updated_at: safeUpdatedAt,
                                },
                            ],
                            currentUserId
                        );
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
        };

        const connect = () => {
            setStatus("connecting");

            const userId = currentUserIdRef.current;
            const phoneNumber = currentPhoneRef.current;

            if (!userId) {
                setStatus("error");
                return;
            }

            let wsUrl = `wss://halabakk-web.nawaf-alhasosah.workers.dev/api/realtime?userId=${encodeURIComponent(userId)}`;
            if (phoneNumber) {
                wsUrl += `&phone=${encodeURIComponent(phoneNumber)}`;
            }

            console.log('[WebSocket] Connecting to:', wsUrl);
            socket = new WebSocket(wsUrl);
            setSocket(socket);

            socket.addEventListener("open", () => {
                setStatus("connected");

                if (selectedChatIdRef.current) {
                    socket?.send(JSON.stringify({
                        type: "JOIN_CONVERSATION",
                        conversationId: selectedChatIdRef.current,
                    }));
                }
            });

            socket.addEventListener("message", (messageEvent) => {
                try {
                    const payload = JSON.parse(messageEvent.data as string);
                    void handleServerEvent(payload);
                } catch (error) {
                    console.error('[WebSocket] Parse error:', error);
                }
            });

            socket.addEventListener("error", (error) => {
                setStatus("error");
            });

            socket.addEventListener("close", (event) => {
                setSocket(null);

                if (!isDisposed && event.code !== 1000) {
                    reconnectTimeoutRef.current = window.setTimeout(connect, 3000);
                }
            });
        };

        connect();

        return () => {
            isDisposed = true;
            if (reconnectTimeoutRef.current) {
                window.clearTimeout(reconnectTimeoutRef.current);
            }

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
    }, [
        currentUserId,
        isReady,
    ]);

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

        if (selectedChatId) {
            sendEvent({
                type: "MARK_READ",
                conversationId: selectedChatId,
            });
        }

        selectedChatIdRef.current = selectedChatId;
        joinedChatIdRef.current = selectedChatId;
    }, [selectedChatId]);
}
