"use client";

import { authClient } from "@/lib/auth-client";
import { buildChatFromReaction } from "@/lib/chat-utils";
import { upsertDbChats } from "@/lib/upsert-db-chats";
import { upsertDbMessages } from "@/lib/upsert-db-messages";
import { useActiveChatStore } from "@/store/use-active-chat-store";
import { useRealtimeStore } from "@/store/use-realtime-store";
import type { Message } from "@/types/messages";
import { useCallback } from "react";

type MessageFlagResponse = {
    messageId: string;
    userIdsPinIt: string[] | null;
    userIdsStarIt: string[] | null;
    updatedAt: string;
};

const API_BASE_URL = "https://web.yahla.org";

function withUserFlag(
    userIds: string[] | null | undefined,
    userId: string,
    enabled: boolean
) {
    const nextUserIds = new Set((userIds ?? []).filter(Boolean));

    if (enabled) {
        nextUserIds.add(userId);
    } else {
        nextUserIds.delete(userId);
    }

    return nextUserIds.size > 0 ? [...nextUserIds] : null;
}

export function useMessageActions() {
    const { data: session } = authClient.useSession();
    const updateMessage = useActiveChatStore((state) => state.updateMessage);
    const upsertChat = useActiveChatStore((state) => state.upsertChat);

    const updateMessageFlag = useCallback(
        async ({
            message,
            action,
            enabled,
        }: {
            message: Message;
            action: "star" | "pin";
            enabled: boolean;
        }) => {
            const currentUserId = session?.user.id;

            if (!currentUserId) {
                return false;
            }

            const previousPinIds = message.user_ids_pin_it ?? null;
            const previousStarIds = message.user_ids_star_it ?? null;
            const optimisticPinIds =
                action === "pin"
                    ? withUserFlag(previousPinIds, currentUserId, enabled)
                    : previousPinIds;
            const optimisticStarIds =
                action === "star"
                    ? withUserFlag(previousStarIds, currentUserId, enabled)
                    : previousStarIds;

            updateMessage(message.chat_room_id, message.message_id, (current) => ({
                ...current,
                user_ids_pin_it: optimisticPinIds,
                user_ids_star_it: optimisticStarIds,
                updated_at: new Date(),
            }));

            try {
                const response = await fetch(`${API_BASE_URL}/api/messages`, {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: authClient.getCookie() ?? "",
                    },
                    credentials: "omit",
                    body: JSON.stringify({
                        action,
                        chatRoomId: message.chat_room_id,
                        messageId: message.message_id,
                        ...(action === "star"
                            ? { starred: enabled }
                            : { pinned: enabled }),
                    }),
                });

                if (!response.ok) {
                    throw new Error(`Failed to ${action} message`);
                }

                const payload = (await response.json()) as MessageFlagResponse;
                const updatedAt = new Date(payload.updatedAt);

                updateMessage(message.chat_room_id, message.message_id, (current) => ({
                    ...current,
                    user_ids_pin_it: payload.userIdsPinIt,
                    user_ids_star_it: payload.userIdsStarIt,
                    updated_at: Number.isNaN(updatedAt.getTime())
                        ? current.updated_at
                        : updatedAt,
                }));
                if (action === "pin") {
                    useActiveChatStore.getState().notifyPinUpdate(
                        message.chat_room_id,
                        message.message_id
                    );
                }

                return true;
            } catch {
                updateMessage(message.chat_room_id, message.message_id, (current) => ({
                    ...current,
                    user_ids_pin_it: previousPinIds,
                    user_ids_star_it: previousStarIds,
                }));

                return false;
            }
        },
        [session?.user.id, updateMessage]
    );

    return {
        starMessage: (message: Message, starred: boolean) =>
            updateMessageFlag({ message, action: "star", enabled: starred }),
        pinMessage: (message: Message, pinned: boolean) =>
            updateMessageFlag({ message, action: "pin", enabled: pinned }),
        reactToMessage: async (message: Message, reactionEmoji: string) => {
            const currentUserId = session?.user.id;

            if (!currentUserId) {
                return false;
            }

            const previousReaction = message.message_raction;
            const previousUpdatedAt = message.updated_at;
            const previousChat =
                useActiveChatStore
                    .getState()
                    .chats.find((chat) => chat.chat_id === message.chat_room_id) ??
                null;
            const updatedAt = new Date();
            const reaction = {
                id: crypto.randomUUID(),
                user_id: currentUserId,
                reaction_emoji: reactionEmoji,
            };
            const optimisticMessage = {
                ...message,
                message_raction: reaction,
                updated_at: updatedAt,
            };
            const conversationType =
                previousChat?.chat_type === "group" ? "group" : "direct";
            const optimisticChat = buildChatFromReaction({
                conversationId: message.chat_room_id,
                conversationType,
                messageId: message.message_id,
                reaction,
                updatedAt,
                currentUserId,
                unreadCount: 0,
                fallbackExistingChat: previousChat,
            });

            updateMessage(message.chat_room_id, message.message_id, (current) => ({
                ...current,
                message_raction: reaction,
                updated_at: updatedAt,
            }));
            upsertChat(optimisticChat);
            void upsertDbMessages([optimisticMessage], currentUserId);
            void upsertDbChats([optimisticChat]);

            try {
                const response = await fetch(`${API_BASE_URL}/api/messages`, {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: authClient.getCookie() ?? "",
                    },
                    credentials: "omit",
                    body: JSON.stringify({
                        chatRoomId: message.chat_room_id,
                        messageId: message.message_id,
                        reactionEmoji,
                    }),
                });

                if (!response.ok) {
                    throw new Error("Failed to react to message");
                }

                useRealtimeStore.getState().sendEvent({
                    type: "REACT_MESSAGE",
                    conversationId: message.chat_room_id,
                    conversationType,
                    messageId: message.message_id,
                    reactionEmoji,
                });

                return true;
            } catch {
                const revertedMessage = {
                    ...message,
                    message_raction: previousReaction,
                    updated_at: previousUpdatedAt,
                };

                updateMessage(message.chat_room_id, message.message_id, (current) => ({
                    ...current,
                    message_raction: previousReaction,
                    updated_at: previousUpdatedAt,
                }));

                if (previousChat) {
                    upsertChat(previousChat);
                    void upsertDbChats([previousChat]);
                }
                void upsertDbMessages([revertedMessage], currentUserId);

                return false;
            }
        },
    };
}
