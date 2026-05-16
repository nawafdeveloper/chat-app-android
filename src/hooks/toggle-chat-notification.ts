"use client";

import { authClient } from "@/lib/auth-client";
import { useActiveChatStore } from "@/store/use-active-chat-store";
import { useCallback, useState } from "react";

export function useToggleChatNotifications() {
    const upsertChat = useActiveChatStore((state) => state.upsertChat);
    const [isToggling, setIsToggling] = useState(false);

    const setChatNotificationsMuted = useCallback(
        async (chatId: string, isMuted: boolean) => {
            const chat =
                useActiveChatStore
                    .getState()
                    .chats.find((item) => item.chat_id === chatId) ?? null;

            if (!chat) {
                return false;
            }

            const previousChat = chat;
            upsertChat({
                ...chat,
                is_muted_chat_notifications: isMuted,
            });
            setIsToggling(true);

            try {
                const response = await fetch("https://halabakk-web.nawaf-alhasosah.workers.dev/api/chats", {
                    method: "PATCH",
                    headers: {
                        Cookie: authClient.getCookie() ?? "",
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        chatId,
                        isMuted,
                    }),
                });

                if (!response.ok) {
                    throw new Error("Failed to update notification setting.");
                }

                return true;
            } catch {
                upsertChat(previousChat);
                return false;
            } finally {
                setIsToggling(false);
            }
        },
        [upsertChat]
    );

    return {
        isToggling,
        setChatNotificationsMuted,
    };
}
