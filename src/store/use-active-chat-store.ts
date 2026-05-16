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

type LocalReadState = {
    messageId: string | null;
    readAt: number;
};

function hasRenderableMessageContent(message: Message) {
    return Boolean(
        message.message_text_content?.trim() ||
        message.attached_media ||
        message.contact ||
        message.event ||
        message.poll ||
        message.location
    );
}

function isTransientMessage(message: Message) {
    return (
        message.client_status === "pending" ||
        message.client_status === "sending" ||
        message.client_status === "failed" ||
        message.client_received_via_realtime === true
    );
}

function mergeMessageForStableUi(
    existingMessage: Message | undefined,
    incomingMessage: Message
): Message {
    if (!existingMessage) {
        return incomingMessage;
    }

    const incomingHasRenderableContent = hasRenderableMessageContent(incomingMessage);

    return {
        ...existingMessage,
        ...incomingMessage,
        message_text_content:
            incomingMessage.message_text_content?.trim()
                ? incomingMessage.message_text_content
                : existingMessage.message_text_content,
        contact: incomingMessage.contact ?? existingMessage.contact,
        reply_message:
            incomingMessage.reply_message ?? existingMessage.reply_message,
        open_graph_data:
            incomingMessage.open_graph_data ?? existingMessage.open_graph_data,
        media_url: incomingMessage.media_url ?? existingMessage.media_url,
        media_preview_url:
            incomingMessage.media_preview_url ?? existingMessage.media_preview_url,
        media_preview_object_key:
            incomingMessage.media_preview_object_key ??
            existingMessage.media_preview_object_key,
        encrypted_media:
            incomingMessage.encrypted_media ?? existingMessage.encrypted_media,
        video_thumbnail:
            incomingMessage.video_thumbnail ?? existingMessage.video_thumbnail,
        client_local_media_name:
            incomingMessage.client_local_media_name ??
            existingMessage.client_local_media_name,
        client_local_media_size:
            incomingMessage.client_local_media_size ??
            existingMessage.client_local_media_size,
        client_local_media_mime_type:
            incomingMessage.client_local_media_mime_type ??
            existingMessage.client_local_media_mime_type,
        client_status:
            incomingMessage.client_status ??
            (incomingHasRenderableContent ? existingMessage.client_status : "pending"),
        client_error: incomingMessage.client_error ?? existingMessage.client_error,
    };
}

function shouldKeepChatLocallyRead(
    chat: ChatItemType,
    localRead: LocalReadState | undefined
) {
    if (!localRead) {
        return false;
    }

    if (localRead.messageId && chat.last_message_id === localRead.messageId) {
        return true;
    }

    return chat.updated_at.getTime() <= localRead.readAt;
}

function applyLocalReadStateToChat(
    chat: ChatItemType,
    localRead: LocalReadState | undefined
) {
    if (!shouldKeepChatLocallyRead(chat, localRead)) {
        return chat;
    }

    if (!chat.is_unreaded_chat && chat.unreaded_messages_length === 0) {
        return chat;
    }

    return {
        ...chat,
        is_unreaded_chat: false,
        unreaded_messages_length: 0,
    };
}

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
    localReadByChatId: Record<string, LocalReadState>;
    lastPinUpdate: { chatId: string; messageId: string } | null;
    notifyPinUpdate: (chatId: string, messageId: string) => void;
    setChats: (chats: ChatItemType[]) => void;
    upsertChat: (chat: ChatItemType) => void;
    removeChat: (chatId: string) => void;
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
    markChatRead: (chatId: string, messageId?: string | null) => void;
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
    localReadByChatId: {},
    lastPinUpdate: null as { chatId: string; messageId: string } | null,
    notifyPinUpdate: (chatId: string, messageId: string) =>
        set({ lastPinUpdate: { chatId, messageId } }),
    setChats: (chats) =>
        set((state) => {
            const existingChatsById = new Map(
                state.chats.map((chat) => [chat.chat_id, chat])
            );
            const nextLocalReadByChatId = { ...state.localReadByChatId };
            const nextChats = chats.map((chat) => {
                const localRead = state.localReadByChatId[chat.chat_id];
                if (
                    chat.chat_type !== "group" ||
                    (chat.group_members && chat.group_members.length > 0)
                ) {
                    if (localRead && !shouldKeepChatLocallyRead(chat, localRead)) {
                        delete nextLocalReadByChatId[chat.chat_id];
                    }

                    return applyLocalReadStateToChat(chat, localRead);
                }

                const existingChat = existingChatsById.get(chat.chat_id);

                const nextChat = existingChat?.group_members?.length
                    ? { ...chat, group_members: existingChat.group_members }
                    : chat;

                if (localRead && !shouldKeepChatLocallyRead(nextChat, localRead)) {
                    delete nextLocalReadByChatId[chat.chat_id];
                }

                return applyLocalReadStateToChat(nextChat, localRead);
            });

            return {
                chats: sortChatsByRecent(nextChats),
                localReadByChatId: nextLocalReadByChatId,
            };
        }),
    upsertChat: (chat) =>
        set((state) => {
            const existingChat = state.chats.find(
                (item) => item.chat_id === chat.chat_id
            );
            const existingWithoutChat = state.chats.filter(
                (item) => item.chat_id !== chat.chat_id
            );
            const mergedChat =
                chat.chat_type === "group" &&
                (!chat.group_members || chat.group_members.length === 0) &&
                existingChat?.group_members?.length
                    ? { ...chat, group_members: existingChat.group_members }
                    : existingChat && chat.chat_type === "single"
                      ? {
                          ...chat,
                          avatar: chat.avatar || existingChat.avatar,
                          display_name: chat.display_name ?? existingChat.display_name,
                          recipient_user_id:
                              chat.recipient_user_id ?? existingChat.recipient_user_id,
                          recipient_public_key:
                              chat.recipient_public_key ??
                              existingChat.recipient_public_key ??
                              null,
                          contact_phone: chat.contact_phone ?? existingChat.contact_phone,
                          recipient_last_seen:
                              chat.recipient_last_seen ?? existingChat.recipient_last_seen,
                          recipient_who_can_see_last_seen:
                              chat.recipient_who_can_see_last_seen ??
                              existingChat.recipient_who_can_see_last_seen,
                          recipient_last_seen_visible:
                              chat.recipient_last_seen_visible ??
                              existingChat.recipient_last_seen_visible,
                          recipient_who_can_see_status:
                              chat.recipient_who_can_see_status ??
                              existingChat.recipient_who_can_see_status,
                          recipient_who_can_see_profile_picture:
                              chat.recipient_who_can_see_profile_picture ??
                              existingChat.recipient_who_can_see_profile_picture,
                          recipient_profile_picture_visible:
                              chat.recipient_profile_picture_visible ??
                              existingChat.recipient_profile_picture_visible,
                          recipient_about_ciphertext:
                              chat.recipient_about_ciphertext ??
                              existingChat.recipient_about_ciphertext,
                          recipient_about_encrypted_aes_key:
                              chat.recipient_about_encrypted_aes_key ??
                              existingChat.recipient_about_encrypted_aes_key,
                          recipient_about_iv:
                              chat.recipient_about_iv ?? existingChat.recipient_about_iv,
                          recipient_who_can_see_about:
                              chat.recipient_who_can_see_about ??
                              existingChat.recipient_who_can_see_about,
                          recipient_about_visible:
                              chat.recipient_about_visible ??
                              existingChat.recipient_about_visible,
                          stored_contact: chat.stored_contact ?? existingChat.stored_contact,
                      }
                      : chat;
            const localRead = state.localReadByChatId[chat.chat_id];
            const nextChat = applyLocalReadStateToChat(mergedChat, localRead);
            const nextLocalReadByChatId =
                localRead && !shouldKeepChatLocallyRead(mergedChat, localRead)
                    ? Object.fromEntries(
                          Object.entries(state.localReadByChatId).filter(
                              ([chatId]) => chatId !== chat.chat_id
                          )
                      )
                    : state.localReadByChatId;

            return {
                chats: sortChatsByRecent([...existingWithoutChat, nextChat]),
                localReadByChatId: nextLocalReadByChatId,
            };
        }),
    removeChat: (chatId) =>
        set((state) => {
            const messagesByChatId = { ...state.messagesByChatId };
            const draftsByChatId = { ...state.draftsByChatId };
            const replyDraftByChatId = { ...state.replyDraftByChatId };
            delete messagesByChatId[chatId];
            delete draftsByChatId[chatId];
            delete replyDraftByChatId[chatId];

            return {
                chats: state.chats.filter((chat) => chat.chat_id !== chatId),
                selectedChatId:
                    state.selectedChatId === chatId
                        ? null
                        : state.selectedChatId,
                messagesByChatId,
                draftsByChatId,
                replyDraftByChatId,
                localReadByChatId: Object.fromEntries(
                    Object.entries(state.localReadByChatId).filter(
                        ([localReadChatId]) => localReadChatId !== chatId
                    )
                ),
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
                            ...mergeMessageForStableUi(existingMessage, fetchedMessage),
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
        set((state) => {
            const existingMessages = state.messagesByChatId[chatId] ?? [];
            const mergedById = new Map<string, Message>();
            const incomingMessageIds = new Set(messages.map((message) => message.message_id));
            const newestIncomingTime = messages.reduce(
                (newestTime, message) =>
                    Math.max(newestTime, message.created_at.getTime()),
                0
            );

            for (const incomingMessage of messages) {
                const existingMessage = existingMessages.find(
                    (message) => message.message_id === incomingMessage.message_id
                );
                mergedById.set(
                    incomingMessage.message_id,
                    mergeMessageForStableUi(existingMessage, incomingMessage)
                );
            }

            for (const existingMessage of existingMessages) {
                if (incomingMessageIds.has(existingMessage.message_id)) {
                    continue;
                }

                if (
                    messages.length === 0 ||
                    isTransientMessage(existingMessage) ||
                    existingMessage.created_at.getTime() > newestIncomingTime
                ) {
                    mergedById.set(existingMessage.message_id, existingMessage);
                }
            }

            return {
                messagesByChatId: {
                    ...state.messagesByChatId,
                    [chatId]: sortMessagesChronologically([...mergedById.values()]),
                },
            };
        }),
    appendMessage: (chatId, message) =>
        set((state) => {
            const existingMessages = state.messagesByChatId[chatId] ?? [];
            const nextMessages = existingMessages.some(
                (item) => item.message_id === message.message_id
            )
                ? existingMessages.map((item) =>
                    item.message_id === message.message_id
                        ? mergeMessageForStableUi(item, message)
                        : item
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
    markChatRead: (chatId, messageId) =>
        set((state) => {
            let didChange = false;
            const existingChat = state.chats.find((chat) => chat.chat_id === chatId);
            const readMessageId = messageId ?? existingChat?.last_message_id ?? null;

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

            return {
                ...(didChange ? { chats } : {}),
                localReadByChatId: {
                    ...state.localReadByChatId,
                    [chatId]: {
                        messageId: readMessageId,
                        readAt: Date.now(),
                    },
                },
            };
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
            localReadByChatId: {},
        }),
}));
