import {
    decryptChatPreviewBatch,
    decryptMessageBatch,
} from "@/lib/chat-e2ee";
import {
    applyContactToSingleChat,
    normalizeChatItem,
    normalizeMessage,
    sortMessagesChronologically,
} from "@/lib/chat-utils";
import { decryptStoredContact } from "@/lib/contact-crypto";
import { getDbChats, upsertDbChats } from "@/lib/upsert-db-chats";
import {
    getAllDbMessages,
    getDbMessages,
    upsertDbMessages,
} from "@/lib/upsert-db-messages";
import { materializeMessageMedia } from "@/lib/message-media";
import type { ChatItemType } from "@/types/chats.type";
import type { Message } from "@/types/messages";
import { authClient } from "./auth-client";

export const MESSAGE_PAGE_SIZE = 20;

const API_BASE_URL = "https://halabakk-web.nawaf-alhasosah.workers.dev";

type RemoteChat = Omit<ChatItemType, "created_at" | "updated_at"> & {
    created_at: string | Date;
    updated_at: string | Date;
};

type RemoteMessage = Omit<Message, "created_at" | "updated_at"> & {
    created_at: string | Date;
    updated_at: string | Date;
};

type SyncParams = {
    currentUserId: string;
    cookies: string | null;
    onLoadingTitleChange?: (title: string) => void;
    onChatsLoaded?: (chats: ChatItemType[]) => void;
    onChatMessagesLoaded?: (
        chatId: string,
        messages: Message[],
        hasOlderMessages?: boolean
    ) => void;
};

type PushTokenParams = {
    token?: string;
    cookies: string | null;
};

function getAuthHeaders(cookies: string | null) {
    return {
        Cookie: cookies || "",
        "Content-Type": "application/json",
    };
}

function groupMessagesByChat(messages: Message[]) {
    const grouped = new Map<string, Message[]>();

    for (const message of messages) {
        const currentMessages = grouped.get(message.chat_room_id) ?? [];
        currentMessages.push(message);
        grouped.set(message.chat_room_id, currentMessages);
    }

    for (const [chatId, chatMessages] of grouped.entries()) {
        grouped.set(chatId, sortMessagesChronologically(chatMessages));
    }

    return grouped;
}

export async function hydrateStoredContactOverrides(chats: ChatItemType[]) {
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

async function normalizeAndDecryptMobileChats({
    remoteChats,
    currentUserId,
    cachedChats,
}: {
    remoteChats: RemoteChat[];
    currentUserId: string;
    cachedChats: ChatItemType[];
}) {
    const cachedById = new Map(cachedChats.map((chat) => [chat.chat_id, chat]));
    const normalizedChats = remoteChats.map(normalizeChatItem);
    const chatsWithStoredContacts =
        await hydrateStoredContactOverrides(normalizedChats);

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

    const decryptedChats =
        needsDecryption.length > 0
            ? await decryptChatPreviewBatch({ chats: needsDecryption, currentUserId })
            : [];

    return [...decryptedChats, ...alreadyCached];
}

async function fetchMobileChats({
    currentUserId,
    cookies,
    cachedChats,
}: {
    currentUserId: string;
    cookies: string | null;
    cachedChats: ChatItemType[];
}) {
    const response = await fetch(`${API_BASE_URL}/api/mobile/chats`, {
        headers: getAuthHeaders(cookies),
        credentials: "omit",
    });

    if (!response.ok) {
        throw new Error("Failed to fetch chats");
    }

    const payload = (await response.json()) as { chats: RemoteChat[] };

    return normalizeAndDecryptMobileChats({
        remoteChats: payload.chats,
        currentUserId,
        cachedChats,
    });
}

async function fetchMobileMessages({
    currentUserId,
    cookies,
}: {
    currentUserId: string;
    cookies: string | null;
}) {
    const response = await fetch(`${API_BASE_URL}/api/mobile/messages`, {
        headers: getAuthHeaders(cookies),
        credentials: "omit",
    });

    if (!response.ok) {
        throw new Error("Failed to fetch messages");
    }

    const payload = (await response.json()) as { messages: RemoteMessage[] };
    const normalizedMessages = payload.messages.map(normalizeMessage);

    return decryptMessageBatch({
        currentUserId,
        messages: normalizedMessages,
    });
}

async function materializeMessageMediaBatch(messages: Message[]) {
    const materializedMessages: Message[] = [];

    for (const message of messages) {
        try {
            materializedMessages.push(
                await materializeMessageMedia(message, { downloadFull: false })
            );
        } catch (error) {
            console.log("Failed to save message media locally:", error);
            materializedMessages.push(message);
        }
    }

    return materializedMessages;
}

export async function getDecryptedDbMessagePage({
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

export async function getDecryptedDbMessagesForChat({
    chatId,
    currentUserId,
}: {
    chatId: string;
    currentUserId: string;
}) {
    const cachedMessages = await getAllDbMessages(chatId);

    if (cachedMessages.length === 0) {
        return [];
    }

    return decryptMessageBatch({
        currentUserId,
        messages: cachedMessages,
    });
}

export async function hydrateLocalChatCache({
    currentUserId,
    onChatsLoaded,
    onChatMessagesLoaded,
}: Omit<SyncParams, "cookies" | "onLoadingTitleChange">) {
    const chats = await getDbChats();
    onChatsLoaded?.(chats);

    let messageCount = 0;
    for (const chat of chats) {
        const messages = await getDecryptedDbMessagePage({
            chatId: chat.chat_id,
            currentUserId,
        });

        messageCount += messages.length;
        onChatMessagesLoaded?.(
            chat.chat_id,
            messages,
            messages.length === MESSAGE_PAGE_SIZE
        );
    }

    return {
        chatCount: chats.length,
        messageCount,
    };
}

export async function syncMobileChatsAndMessages({
    currentUserId,
    cookies,
    onLoadingTitleChange,
    onChatsLoaded,
    onChatMessagesLoaded,
}: SyncParams) {
    onLoadingTitleChange?.("Loading your chats");

    const cachedChats = await getDbChats();
    const syncedChats = await fetchMobileChats({
        currentUserId,
        cookies,
        cachedChats,
    });

    await upsertDbChats(syncedChats);

    const storedChats = await getDbChats();
    onChatsLoaded?.(storedChats);

    onLoadingTitleChange?.("Loading your messages");
    const mobileMessages = await fetchMobileMessages({ currentUserId, cookies });
    const chatIds = new Set(storedChats.map((chat) => chat.chat_id));
    const messagesToStore = mobileMessages.filter((message) =>
        chatIds.has(message.chat_room_id)
    );
    onLoadingTitleChange?.("Saving media previews");
    const localMessagesToStore =
        await materializeMessageMediaBatch(messagesToStore);

    await upsertDbMessages(localMessagesToStore, currentUserId);

    const messagesByChatId = groupMessagesByChat(localMessagesToStore);
    for (const chat of storedChats) {
        const chatMessages = messagesByChatId.get(chat.chat_id) ?? [];
        const recentMessages = chatMessages.slice(-MESSAGE_PAGE_SIZE);

        onChatMessagesLoaded?.(
            chat.chat_id,
            recentMessages,
            chatMessages.length > recentMessages.length
        );
    }

    return {
        chatCount: storedChats.length,
        messageCount: messagesToStore.length,
    };
}

export const preloadUserChatsAndMessages = syncMobileChatsAndMessages;

export async function registerMobilePushToken({
    token,
}: PushTokenParams) {
    if (!token) {
        return;
    }

    const { error } = await authClient.updateUser({
        yhlaPushToken: token,
    });

    if (error) {
        throw new Error(error.message || "Failed to register push token");
    }
}

export async function deleteMobilePushToken(_params: PushTokenParams) {
    const { error } = await authClient.updateUser({
        yhlaPushToken: "",
    });

    if (error) {
        throw new Error(error.message || "Failed to delete push token");
    }
}
