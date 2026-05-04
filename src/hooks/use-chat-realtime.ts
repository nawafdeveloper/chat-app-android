import { useCryptoKeys } from "@/context/crypto";
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
import { upsertDbChats } from "@/lib/upsert-db-chats";
import { useActiveChatStore } from "@/store/use-active-chat-store";
import { useContactDirectoryStore } from "@/store/use-contact-directory-store";
import { useRealtimeStore } from "@/store/use-realtime-store";
import type { ChatItemType } from "@/types/chats.type";
import { Message } from "@/types/messages";
import type { ServerRealtimeEvent } from "@/types/realtime-events";
import { useEffect, useRef } from "react";

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

export function useChatRealtime() {
    const { isReady } = useCryptoKeys();
    const { data: session } = authClient.useSession();
    const cookies = authClient.getCookie();
    const selectedChatId = useActiveChatStore((state) => state.selectedChatId);
    const chats = useActiveChatStore((state) => state.chats);
    const setChats = useActiveChatStore((state) => state.setChats);
    const upsertChat = useActiveChatStore((state) => state.upsertChat);
    const setChatsLoading = useActiveChatStore((state) => state.setChatsLoading);
    const setChatsError = useActiveChatStore((state) => state.setChatsError);
    const setMessages = useActiveChatStore((state) => state.setMessages);
    const appendMessage = useActiveChatStore((state) => state.appendMessage);
    const setMessagesLoading = useActiveChatStore(
        (state) => state.setMessagesLoading
    );
    const setHasOlderMessages = useActiveChatStore(
        (state) => state.setHasOlderMessages
    );
    const setPresence = useActiveChatStore((state) => state.setPresence);
    const setTypingUsers = useActiveChatStore((state) => state.setTypingUsers);
    const markChatRead = useActiveChatStore((state) => state.markChatRead);
    const markMessagesReadByUser = useActiveChatStore(
        (state) => state.markMessagesReadByUser
    );
    const setRecipientPhone = useActiveChatStore((state) => state.setRecipientPhone);
    const setSocket = useRealtimeStore((state) => state.setSocket);
    const setStatus = useRealtimeStore((state) => state.setStatus);
    const sendEvent = useRealtimeStore((state) => state.sendEvent);

    const currentUserId = session?.user.id ?? null;
    const currentPhone = (session?.user as { phoneNumber?: string | null } | undefined)
        ?.phoneNumber ?? null;

    const selectedChatIdRef = useRef<string | null>(selectedChatId);
    const joinedChatIdRef = useRef<string | null>(null);
    const reconnectTimeoutRef = useRef<number | null>(null);
    const notificationSettingsRef = useRef({
        disableMessagesNotifications: false,
        disableGroupsNotifications: false,
    });

    const applyKnownContactOverride = (chat: ChatItemType) => {
        const directContact = resolveDirectChatContact(
            chat,
            useContactDirectoryStore.getState().contacts,
            currentPhone
        );

        return directContact ? applyContactToSingleChat(chat, directContact) : chat;
    };

    useEffect(() => {
        selectedChatIdRef.current = selectedChatId;
    }, [selectedChatId]);

    useEffect(() => {
        const user = session?.user as
            | {
                disableMessagesNotifications?: boolean | null;
                disableGroupsNotifications?: boolean | null;
            }
            | undefined;

        notificationSettingsRef.current = {
            disableMessagesNotifications: Boolean(
                user?.disableMessagesNotifications
            ),
            disableGroupsNotifications: Boolean(user?.disableGroupsNotifications),
        };
    }, [session]);

    useEffect(() => {
        if (!currentUserId || !isReady) {
            return;
        }

        let isCancelled = false;

        const fetchChats = async () => {
            try {
                setChatsLoading(true);
                setChatsError(null);

                const response = await fetch("https://halabakk-web.nawaf-alhasosah.workers.dev/api/chats", {
                    headers: {
                        "Cookie": cookies || "",
                        "Content-Type": "application/json"
                    },
                    credentials: "omit"
                });

                if (!response.ok) {
                    throw new Error("Failed to fetch chats");
                }

                const payload = (await response.json()) as {
                    chats: ChatItemType[];
                };

                if (isCancelled) {
                    return;
                }

                const normalizedChats = payload.chats.map(normalizeChatItem);
                const chatsWithStoredContacts = await hydrateStoredContactOverrides(
                    normalizedChats
                );
                const decryptedChats = await decryptChatPreviewBatch({
                    chats: chatsWithStoredContacts,
                    currentUserId,
                });

                if (!isCancelled) {
                    const finalChats = decryptedChats.map((chat) => applyKnownContactOverride(chat));
                    await upsertDbChats(finalChats);
                    setChats(finalChats);
                }
            } catch (error) {
                if (!isCancelled) {
                    setChatsError(
                        error instanceof Error
                            ? error.message
                            : "Failed to load chats"
                    );
                }
            } finally {
                if (!isCancelled) {
                    setChatsLoading(false);
                }
            }
        };

        void fetchChats();
        const handleContactsChanged = () => {
            void fetchChats();
        };

        return () => {
            isCancelled = true;
        };
    }, [currentPhone, currentUserId, isReady, setChats, setChatsError, setChatsLoading]);

    useEffect(() => {
        if (!selectedChatId) {
            setRecipientPhone(null);
            return;
        }

        const selectedChat = chats.find((chat) => chat.chat_id === selectedChatId);

        if (selectedChat?.chat_type === "single") {
            setRecipientPhone(
                selectedChat.contact_phone ??
                resolveDirectChatPartner(selectedChat.chat_id, currentPhone)
            );
            markChatRead(selectedChat.chat_id);
        } else {
            setRecipientPhone(null);
            markChatRead(selectedChatId);
        }
    }, [chats, currentPhone, markChatRead, selectedChatId, setRecipientPhone]);

    useEffect(() => {
        if (!currentUserId || !selectedChatId || !isReady) {
            return;
        }

        let isCancelled = false;

        const fetchMessages = async () => {
            try {
                setMessagesLoading(selectedChatId, true);
                const response = await fetch(
                    `https://halabakk-web.nawaf-alhasosah.workers.dev/api/messages?chatRoomId=${encodeURIComponent(selectedChatId)}&limit=20`,
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
                    messages: (Omit<Message, "created_at" | "updated_at"> & {
                        created_at: string;
                        updated_at: string;
                    })[];
                    hasMore?: boolean;
                };

                if (isCancelled) {
                    return;
                }

                const normalizedMessages = payload.messages.map(normalizeMessage);
                const decryptedMessages = await decryptMessageBatch({
                    currentUserId,
                    messages: normalizedMessages,
                });

                if (!isCancelled) {
                    setMessages(selectedChatId, decryptedMessages);
                    setHasOlderMessages(
                        selectedChatId,
                        payload.hasMore ?? normalizedMessages.length === 20
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
            } finally {
                if (!isCancelled) {
                    setMessagesLoading(selectedChatId, false);
                }
            }
        };

        void fetchMessages();

        return () => {
            isCancelled = true;
        };
    }, [
        currentUserId,
        isReady,
        selectedChatId,
        setChatsError,
        setHasOlderMessages,
        setMessages,
        setMessagesLoading,
    ]);

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

                    useActiveChatStore.getState().updateMessage(
                        event.conversationId,
                        messageId,
                        () => ({
                            ...nextMessage,
                            client_status: "sent",
                            client_error: null,
                            client_received_via_realtime: false,
                        })
                    );

                    const existingChat = useActiveChatStore
                        .getState()
                        .chats.find((chat) => chat.chat_id === event.conversationId);

                    const nextChat = applyKnownContactOverride(
                        buildChatFromMessage({
                            conversationId: event.conversationId,
                            conversationType: event.conversationType,
                            message: nextMessage,
                            currentUserId,
                            unreadCount: 0,
                            fallbackExistingChat: existingChat,
                        })
                    );

                    await upsertDbChats([nextChat]);
                    upsertChat(nextChat);
                    break;
                }

                case "NEW_MESSAGE": {
                    const normalizedMessage = normalizeMessage(event.message);
                    const [nextMessage] = await decryptMessageBatch({
                        currentUserId,
                        messages: [normalizedMessage],
                    });

                    appendMessage(event.conversationId, {
                        ...nextMessage,
                        client_status: "sent",
                        client_error: null,
                        client_received_via_realtime:
                            nextMessage.sender_user_id !== currentUserId,
                    });

                    const existingChat = useActiveChatStore
                        .getState()
                        .chats.find((chat) => chat.chat_id === event.conversationId);
                    const isSelected =
                        useActiveChatStore.getState().selectedChatId ===
                        event.conversationId;
                    const unreadCount =
                        nextMessage.sender_user_id === currentUserId || isSelected
                            ? 0
                            : (existingChat?.unreaded_messages_length ?? 0) + 1;

                    const nextChat = applyKnownContactOverride(
                        buildChatFromMessage({
                            conversationId: event.conversationId,
                            conversationType: event.conversationType,
                            message: nextMessage,
                            currentUserId,
                            unreadCount,
                            fallbackExistingChat: existingChat,
                        })
                    );
                    await upsertDbChats([nextChat]);
                    upsertChat(nextChat);
                    const notificationSettings = notificationSettingsRef.current;
                    const shouldNotify =
                        nextMessage.sender_user_id !== currentUserId &&
                        !nextChat.is_muted_chat_notifications &&
                        !notificationSettings.disableMessagesNotifications &&
                        !(
                            event.conversationType === "group" &&
                            notificationSettings.disableGroupsNotifications
                        );

                    if (shouldNotify) {

                    }
                    if (isSelected) {
                        markChatRead(event.conversationId);
                        if (nextMessage.sender_user_id !== currentUserId) {
                            sendEvent({
                                type: "MARK_READ",
                                conversationId: event.conversationId,
                                messageId: nextMessage.message_id,
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
                            message: nextMessage,
                            currentUserId,
                            unreadCount: isSelected ? 0 : event.unreadCount,
                            fallbackExistingChat: existingChat,
                        })
                    );
                    await upsertDbChats([nextChat]);
                    upsertChat(nextChat);
                    const notificationSettings = notificationSettingsRef.current;
                    const shouldNotify =
                        nextMessage.sender_user_id !== currentUserId &&
                        !nextChat.is_muted_chat_notifications &&
                        !notificationSettings.disableMessagesNotifications &&
                        !(
                            event.conversationType === "group" &&
                            notificationSettings.disableGroupsNotifications
                        );

                    if (shouldNotify) {

                    }
                    if (
                        isSelected &&
                        nextMessage.sender_user_id !== currentUserId
                    ) {
                        sendEvent({
                            type: "MARK_READ",
                            conversationId: event.conversationId,
                            messageId: nextMessage.message_id,
                        });
                    }
                    break;
                }

                case "MESSAGE_REACTION_UPDATED": {
                    const updatedAt = new Date(event.updatedAt);
                    const safeUpdatedAt = Number.isNaN(updatedAt.getTime())
                        ? new Date()
                        : updatedAt;

                    useActiveChatStore.getState().updateMessage(
                        event.conversationId,
                        event.messageId,
                        (message) => ({
                            ...message,
                            message_raction: event.reaction,
                            updated_at: safeUpdatedAt,
                        })
                    );

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

                    await upsertDbChats([nextChat]);
                    upsertChat(nextChat);
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

            const userId = session?.user?.id;
            const phoneNumber = session?.user?.phoneNumber;

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
        appendMessage,
        currentPhone,
        currentUserId,
        isReady,
        markChatRead,
        markMessagesReadByUser,
        sendEvent,
        setChatsError,
        setPresence,
        setSocket,
        setStatus,
        setTypingUsers,
        upsertChat,
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
    }, [selectedChatId, sendEvent]);
}
