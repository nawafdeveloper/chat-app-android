import { buildDirectChatId } from "@/lib/chat-e2ee";
import { sortChatsByRecent, sortMessagesChronologically } from "@/lib/chat-utils";
import { applyMessageReadByUser } from "@/lib/message-read-receipts";
import type { ChatItemType } from "@/types/chats.type";
import type { Contact } from "@/types/contacts.type";
import type { Message, ReplyMessage } from "@/types/messages";
import { create } from "zustand";

type PresenceState = {
    activeUsers: string[];
    activeUsersCount: number;
};

type TypingState = {
    activeTypingUsers: string[];
};

interface ActiveChatState {
    chats: ChatItemType[];
    chatsLoading: boolean;
    chatsError: string | null;
    selectedChatId: string | null;
    recipientPhone: string | null;
    draftsByChatId: Record<string, string>;
    replyDraftByChatId: Record<string, ReplyMessage>;
    messagesByChatId: Record<string, Message[]>;
    messagesLoadingByChatId: Record<string, boolean>;
    olderMessagesLoadingByChatId: Record<string, boolean>;
    hasOlderMessagesByChatId: Record<string, boolean>;
    presenceByChatId: Record<string, PresenceState>;
    typingByChatId: Record<string, TypingState>;
    setChats: (chats: ChatItemType[]) => void;
    upsertChat: (chat: ChatItemType) => void;
    setChatsLoading: (loading: boolean) => void;
    setChatsError: (error: string | null) => void;
    setSelectedChatId: (chatId: string | null) => void;
    setRecipientPhone: (phone: string | null) => void;
    setDraft: (chatId: string, draft: string) => void;
    setReplyDraft: (chatId: string, replyMessage: ReplyMessage) => void;
    clearReplyDraft: (chatId: string) => void;
    setMessages: (chatId: string, messages: Message[]) => void;
    replaceMessages: (chatId: string, messages: Message[]) => void;
    appendMessage: (chatId: string, message: Message) => void;
    updateMessage: (
        chatId: string,
        messageId: string,
        updater: (message: Message) => Message
    ) => void;
    setMessagesLoading: (chatId: string, loading: boolean) => void;
    setOlderMessagesLoading: (chatId: string, loading: boolean) => void;
    setHasOlderMessages: (chatId: string, hasOlder: boolean) => void;
    setPresence: (chatId: string, presence: PresenceState) => void;
    setTypingUsers: (chatId: string, activeTypingUsers: string[]) => void;
    markChatRead: (chatId: string) => void;
    markMessagesReadByUser: (
        chatId: string,
        userId: string,
        readAt: Date
    ) => void;
    openDirectContactChat: (params: {
        contact: Contact;
        currentPhone: string;
        currentUserId: string;
    }) => string;
    reset: () => void;
}

export const useActiveChatStore = create<ActiveChatState>((set) => ({
    chats: [],
    chatsLoading: true,
    chatsError: null,
    selectedChatId: null,
    recipientPhone: null,
    draftsByChatId: {},
    replyDraftByChatId: {},
    messagesByChatId: {},
    messagesLoadingByChatId: {},
    olderMessagesLoadingByChatId: {},
    hasOlderMessagesByChatId: {},
    presenceByChatId: {},
    typingByChatId: {},
    setChats: (chats) =>
        set(() => ({
            chats: sortChatsByRecent(chats),
        })),
    upsertChat: (chat) =>
        set((state) => {
            const existingChat = state.chats.find(
                (item) => item.chat_id === chat.chat_id
            );
            const existingWithoutChat = state.chats.filter(
                (item) => item.chat_id !== chat.chat_id
            );
            const nextChat =
                chat.chat_type === "group" &&
                    (!chat.group_members || chat.group_members.length === 0) &&
                    existingChat?.group_members?.length
                    ? { ...chat, group_members: existingChat.group_members }
                    : chat;

            return {
                chats: sortChatsByRecent([...existingWithoutChat, nextChat]),
            };
        }),
    setChatsLoading: (loading) => set({ chatsLoading: loading }),
    setChatsError: (error) => set({ chatsError: error }),
    setSelectedChatId: (chatId) =>
        set((state) =>
            state.selectedChatId === chatId
                ? state
                : { selectedChatId: chatId }
        ),
    setRecipientPhone: (phone) =>
        set((state) =>
            state.recipientPhone === phone
                ? state
                : { recipientPhone: phone }
        ),
    setDraft: (chatId, draft) =>
        set((state) => ({
            draftsByChatId: {
                ...state.draftsByChatId,
                [chatId]: draft,
            },
        })),
    setReplyDraft: (chatId, replyMessage) =>
        set((state) => ({
            replyDraftByChatId: {
                ...state.replyDraftByChatId,
                [chatId]: replyMessage,
            },
        })),
    clearReplyDraft: (chatId) =>
        set((state) => {
            const replyDraftByChatId = { ...state.replyDraftByChatId };
            delete replyDraftByChatId[chatId];

            return { replyDraftByChatId };
        }),
    setMessages: (chatId, messages) =>
        set((state) => {
            const existingMessages = state.messagesByChatId[chatId] ?? [];
            const mergedById = new Map<string, Message>();

            for (const existingMessage of existingMessages) {
                mergedById.set(existingMessage.message_id, existingMessage);
            }

            for (const incomingMessage of messages) {
                const existingMessage = mergedById.get(incomingMessage.message_id);
                const fetchedMessage = {
                    ...incomingMessage,
                    client_received_via_realtime: false,
                };

                mergedById.set(
                    incomingMessage.message_id,
                    existingMessage
                        ? {
                            ...existingMessage,
                            ...fetchedMessage,
                            client_status: "sent",
                            client_error: null,
                        }
                        : fetchedMessage
                );
            }

            return {
                messagesByChatId: {
                    ...state.messagesByChatId,
                    [chatId]: sortMessagesChronologically([...mergedById.values()]),
                },
            };
        }),
    replaceMessages: (chatId, messages) =>
        set((state) => ({
            messagesByChatId: {
                ...state.messagesByChatId,
                [chatId]: sortMessagesChronologically(messages),
            },
        })),
    appendMessage: (chatId, message) =>
        set((state) => {
            const existingMessages = state.messagesByChatId[chatId] ?? [];
            const nextMessages = existingMessages.some(
                (item) => item.message_id === message.message_id
            )
                ? existingMessages.map((item) =>
                    item.message_id === message.message_id ? message : item
                )
                : [...existingMessages, message];

            return {
                messagesByChatId: {
                    ...state.messagesByChatId,
                    [chatId]: sortMessagesChronologically(nextMessages),
                },
            };
        }),
    updateMessage: (chatId, messageId, updater) =>
        set((state) => ({
            messagesByChatId: {
                ...state.messagesByChatId,
                [chatId]: (state.messagesByChatId[chatId] ?? []).map((message) =>
                    message.message_id === messageId ? updater(message) : message
                ),
            },
        })),
    setMessagesLoading: (chatId, loading) =>
        set((state) => ({
            messagesLoadingByChatId: {
                ...state.messagesLoadingByChatId,
                [chatId]: loading,
            },
        })),
    setOlderMessagesLoading: (chatId, loading) =>
        set((state) => ({
            olderMessagesLoadingByChatId: {
                ...state.olderMessagesLoadingByChatId,
                [chatId]: loading,
            },
        })),
    setHasOlderMessages: (chatId, hasOlder) =>
        set((state) => ({
            hasOlderMessagesByChatId: {
                ...state.hasOlderMessagesByChatId,
                [chatId]: hasOlder,
            },
        })),
    setPresence: (chatId, presence) =>
        set((state) => ({
            presenceByChatId: {
                ...state.presenceByChatId,
                [chatId]: presence,
            },
        })),
    setTypingUsers: (chatId, activeTypingUsers) =>
        set((state) => ({
            typingByChatId: {
                ...state.typingByChatId,
                [chatId]: {
                    activeTypingUsers: [...new Set(activeTypingUsers)].filter(Boolean),
                },
            },
        })),
    markChatRead: (chatId) =>
        set((state) => {
            let didChange = false;

            const chats = state.chats.map((chat) => {
                if (chat.chat_id !== chatId) {
                    return chat;
                }

                if (!chat.is_unreaded_chat && chat.unreaded_messages_length === 0) {
                    return chat;
                }

                didChange = true;

                return {
                    ...chat,
                    is_unreaded_chat: false,
                    unreaded_messages_length: 0,
                };
            });

            return didChange ? { chats } : state;
        }),
    markMessagesReadByUser: (chatId, userId, readAt) =>
        set((state) => {
            const messages = state.messagesByChatId[chatId] ?? [];
            let didChange = false;
            const nextMessages = messages.map((message) => {
                const nextMessage = applyMessageReadByUser(message, userId, readAt);

                if (nextMessage !== message) {
                    didChange = true;
                }

                return nextMessage;
            });

            let didChatChange = false;
            const nextChats = state.chats.map((chat) => {
                if (
                    chat.chat_id !== chatId ||
                    !chat.last_message_sender_is_me ||
                    !chat.last_message_id ||
                    chat.updated_at > readAt
                ) {
                    return chat;
                }

                const recipientUserIds =
                    chat.last_message_recipient_user_ids ?? [];
                if (
                    recipientUserIds.length > 0 &&
                    !recipientUserIds.includes(userId)
                ) {
                    return chat;
                }

                const readByUserIds = [
                    ...new Set([
                        ...(chat.last_message_read_by_user_ids ?? []),
                        userId,
                    ]),
                ];
                const isReadByRecipient =
                    recipientUserIds.length > 0 &&
                    recipientUserIds.every((recipientUserId) =>
                        readByUserIds.includes(recipientUserId)
                    );

                if (
                    chat.last_message_is_read_by_recipient === isReadByRecipient &&
                    (chat.last_message_read_by_user_ids ?? []).length ===
                    readByUserIds.length
                ) {
                    return chat;
                }

                didChatChange = true;

                return {
                    ...chat,
                    last_message_is_read_by_recipient: isReadByRecipient,
                    last_message_read_by_user_ids: readByUserIds,
                };
            });

            if (!didChange && !didChatChange) {
                return state;
            }

            return {
                ...(didChange
                    ? {
                        messagesByChatId: {
                            ...state.messagesByChatId,
                            [chatId]: nextMessages,
                        },
                    }
                    : {}),
                ...(didChatChange ? { chats: nextChats } : {}),
            };
        }),
    openDirectContactChat: ({ contact, currentPhone, currentUserId }) => {
        const chatId = buildDirectChatId(currentPhone, contact.contact_number);
        const contactAvatar = contact.contact_avatar ?? "";

        set((state) => {
            const existingChat = state.chats.find((chat) => chat.chat_id === chatId);

            const nextChat: ChatItemType = {
                chat_id: chatId,
                chat_type: "single",
                avatar: contactAvatar || existingChat?.avatar || "",
                display_name:
                    `${contact.contact_first_name ?? ""} ${contact.contact_second_name ?? ""}`
                        .trim() || contact.contact_number,
                recipient_user_id: contact.linked_user_id,
                recipient_public_key: contact.linked_user_public_key ?? null,
                contact_phone: contact.contact_number,
                recipient_last_seen: existingChat?.recipient_last_seen ?? null,
                recipient_who_can_see_last_seen:
                    existingChat?.recipient_who_can_see_last_seen ?? null,
                recipient_last_seen_visible:
                    existingChat?.recipient_last_seen_visible ?? null,
                recipient_who_can_see_status:
                    existingChat?.recipient_who_can_see_status ?? null,
                recipient_who_can_see_profile_picture:
                    existingChat?.recipient_who_can_see_profile_picture ?? null,
                recipient_profile_picture_visible:
                    existingChat?.recipient_profile_picture_visible ?? null,
                recipient_about_ciphertext:
                    existingChat?.recipient_about_ciphertext ?? null,
                recipient_about_encrypted_aes_key:
                    existingChat?.recipient_about_encrypted_aes_key ?? null,
                recipient_about_iv:
                    existingChat?.recipient_about_iv ?? null,
                recipient_who_can_see_about:
                    existingChat?.recipient_who_can_see_about ?? null,
                recipient_about_visible:
                    existingChat?.recipient_about_visible ?? null,
                stored_contact: existingChat?.stored_contact ?? null,
                is_provisional: !existingChat,
                last_message_id: existingChat?.last_message_id ?? null,
                encrypted_preview_ciphertext:
                    existingChat?.encrypted_preview_ciphertext ?? null,
                encrypted_preview_iv: existingChat?.encrypted_preview_iv ?? null,
                encrypted_preview_algorithm:
                    existingChat?.encrypted_preview_algorithm ?? null,
                chat_recipient_keys: existingChat?.chat_recipient_keys ?? null,
                last_message_context: existingChat?.last_message_context ?? "",
                last_message_media: existingChat?.last_message_media ?? null,
                last_message_sender_is_me:
                    existingChat?.last_message_sender_is_me ?? false,
                last_message_sender_nickname:
                    existingChat?.last_message_sender_nickname ?? currentUserId,
                last_message_is_read_by_recipient:
                    existingChat?.last_message_is_read_by_recipient ?? null,
                last_message_read_by_user_ids:
                    existingChat?.last_message_read_by_user_ids ?? null,
                last_message_recipient_user_ids:
                    existingChat?.last_message_recipient_user_ids ?? null,
                is_unreaded_chat: existingChat?.is_unreaded_chat ?? false,
                unreaded_messages_length:
                    existingChat?.unreaded_messages_length ?? 0,
                is_archived_chat: existingChat?.is_archived_chat ?? false,
                is_muted_chat_notifications:
                    existingChat?.is_muted_chat_notifications ?? false,
                is_pinned_chat: existingChat?.is_pinned_chat ?? false,
                is_favourite_chat: existingChat?.is_favourite_chat ?? false,
                is_blocked_chat: existingChat?.is_blocked_chat ?? false,
                created_at: existingChat?.created_at ?? new Date(),
                updated_at: existingChat?.updated_at ?? new Date(),
            };

            return {
                chats: sortChatsByRecent([
                    ...state.chats.filter((chat) => chat.chat_id !== chatId),
                    nextChat,
                ]),
                selectedChatId: chatId,
                recipientPhone: contact.contact_number,
            };
        });

        return chatId;
    },
    reset: () =>
        set({
            chats: [],
            chatsLoading: true,
            chatsError: null,
            selectedChatId: null,
            recipientPhone: null,
            draftsByChatId: {},
            replyDraftByChatId: {},
            messagesByChatId: {},
            messagesLoadingByChatId: {},
            olderMessagesLoadingByChatId: {},
            hasOlderMessagesByChatId: {},
            presenceByChatId: {},
            typingByChatId: {},
        }),
}));
