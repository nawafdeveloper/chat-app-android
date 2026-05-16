import { db } from "@/db/client";
import { currentUser } from "@/db/schema";
import { authClient } from "@/lib/auth-client";
import { decryptMessageBatch } from "@/lib/chat-e2ee";
import { buildChatFromMessage, normalizeMessage } from "@/lib/chat-utils";
import { materializeMessageMedia } from "@/lib/message-media";
import { getDbChat, upsertDbChats } from "@/lib/upsert-db-chats";
import { getDbMessage, upsertDbMessages } from "@/lib/upsert-db-messages";
import type { Message } from "@/types/messages";
import type { ClientRealtimeEvent, ServerRealtimeEvent } from "@/types/realtime-events";

const REALTIME_URL =
    "wss://web.yahla.org/api/realtime?platform=mobile";
const API_BASE_URL = "https://web.yahla.org";
const SOCKET_SYNC_TIMEOUT_MS = 12_000;
const HTTP_FALLBACK_TIMEOUT_MS = 8_000;

type ReactNativeWebSocketConstructor = typeof WebSocket & {
    new (
        url: string,
        protocols?: string | string[] | null,
        options?: { headers?: Record<string, string> }
    ): WebSocket;
};

type NotificationSyncTarget = {
    conversationId: string;
    messageId?: string;
};

const inFlightSyncs = new Map<string, Promise<boolean>>();

function optionalString(value: unknown) {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parseNotificationSyncTarget(
    data?: Record<string, unknown> | null
): NotificationSyncTarget | null {
    if (!data) return null;

    const conversationId =
        optionalString(data.conversationId) ??
        optionalString(data.chatId) ??
        optionalString(data.roomId);

    if (!conversationId) return null;

    return {
        conversationId,
        messageId: optionalString(data.messageId),
    };
}

async function getCurrentUserId() {
    const localUsers = await db
        .select({ id: currentUser.id })
        .from(currentUser)
        .limit(1);

    const localUserId = localUsers[0]?.id;
    if (localUserId) return localUserId;

    try {
        return (await authClient.getSession()).data?.user.id ?? null;
    } catch {
        return null;
    }
}

function getAuthCookie() {
    return authClient.getCookie() ?? "";
}

function sendSocketEvent(socket: WebSocket, event: ClientRealtimeEvent) {
    if (socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(event));
    return true;
}

function eventConversationId(event: ServerRealtimeEvent) {
    return "conversationId" in event ? event.conversationId : null;
}

function eventMessageId(event: ServerRealtimeEvent) {
    if (
        event.type === "NEW_MESSAGE" ||
        event.type === "CONVERSATION_UPDATED" ||
        event.type === "MESSAGE_SENT"
    ) {
        return (event.type === "CONVERSATION_UPDATED"
            ? event.lastMessage
            : event.message
        ).message_id;
    }

    return null;
}

function isTargetRealtimeEvent(
    event: ServerRealtimeEvent,
    target: NotificationSyncTarget
) {
    const conversationId = eventConversationId(event);
    if (conversationId !== target.conversationId) return false;

    if (!target.messageId) {
        return (
            event.type === "NEW_MESSAGE" ||
            event.type === "CONVERSATION_UPDATED" ||
            event.type === "MESSAGE_SENT"
        );
    }

    return eventMessageId(event) === target.messageId;
}

function toConversationType(
    conversationType: "direct" | "group" | undefined,
    existingChatType?: "single" | "group"
): "direct" | "group" {
    if (conversationType) return conversationType;
    return existingChatType === "group" ? "group" : "direct";
}

async function persistRealtimeMessage({
    conversationId,
    conversationType,
    rawMessage,
    currentUserId,
    unreadCount,
}: {
    conversationId: string;
    conversationType?: "direct" | "group";
    rawMessage: Parameters<typeof normalizeMessage>[0];
    currentUserId: string;
    unreadCount?: number;
}) {
    const normalizedMessage = {
        ...normalizeMessage(rawMessage),
        chat_room_id: conversationId,
    };
    const [decryptedMessage] = await decryptMessageBatch({
        currentUserId,
        messages: [normalizedMessage],
    });
    const incomingMessage: Message = {
        ...decryptedMessage,
        client_status: "sent",
        client_error: null,
        client_received_via_realtime:
            decryptedMessage.sender_user_id !== currentUserId,
    };

    const [existingChat, existingMessage] = await Promise.all([
        getDbChat(conversationId),
        getDbMessage(incomingMessage.message_id),
    ]);
    const nextUnreadCount =
        unreadCount ??
        (existingMessage || incomingMessage.sender_user_id === currentUserId
            ? existingChat?.unreaded_messages_length ?? 0
            : (existingChat?.unreaded_messages_length ?? 0) + 1);

    const nextChat = buildChatFromMessage({
        conversationId,
        conversationType: toConversationType(
            conversationType,
            existingChat?.chat_type
        ),
        message: incomingMessage,
        currentUserId,
        unreadCount: nextUnreadCount,
        fallbackExistingChat: existingChat,
    });

    await upsertDbChats([nextChat]);
    await upsertDbMessages([incomingMessage], currentUserId);

    if (incomingMessage.attached_media) {
        void materializeMessageMedia(incomingMessage, { downloadFull: false })
            .then((localMessage) => upsertDbMessages([localMessage], currentUserId))
            .catch((error) => {
                console.log("[push-sync] Failed to cache notification media:", error);
            });
    }

    return true;
}

async function persistRealtimeEvent(
    event: ServerRealtimeEvent,
    target: NotificationSyncTarget,
    currentUserId: string
) {
    switch (event.type) {
        case "NEW_MESSAGE":
        case "MESSAGE_SENT":
            return persistRealtimeMessage({
                conversationId: target.conversationId,
                conversationType: event.conversationType,
                rawMessage: event.message,
                currentUserId,
            });
        case "CONVERSATION_UPDATED":
            return persistRealtimeMessage({
                conversationId: target.conversationId,
                conversationType: event.conversationType,
                rawMessage: event.lastMessage,
                currentUserId,
                unreadCount: event.unreadCount,
            });
        default:
            return false;
    }
}

function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    message: string
) {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => {
            setTimeout(() => reject(new Error(message)), timeoutMs);
        }),
    ]);
}

async function syncFromRealtimeSocket({
    target,
    currentUserId,
    cookies,
}: {
    target: NotificationSyncTarget;
    currentUserId: string;
    cookies: string;
}) {
    return withTimeout(
        new Promise<boolean>((resolve, reject) => {
            const SocketConstructor = WebSocket as ReactNativeWebSocketConstructor;
            const socket = new SocketConstructor(REALTIME_URL, undefined, {
                headers: { Cookie: cookies },
            });
            let finished = false;

            const finish = (result: boolean, error?: unknown) => {
                if (finished) return;
                finished = true;
                if (
                    socket.readyState === WebSocket.OPEN ||
                    socket.readyState === WebSocket.CONNECTING
                ) {
                    socket.close();
                }

                if (error) {
                    reject(error);
                } else {
                    resolve(result);
                }
            };

            socket.addEventListener("open", () => {
                try {
                    sendSocketEvent(socket, {
                        type: "JOIN_CONVERSATION",
                        conversationId: target.conversationId,
                    });
                } catch (error) {
                    finish(false, error);
                }
            });

            socket.addEventListener("message", (messageEvent) => {
                void (async () => {
                    try {
                        const event = JSON.parse(
                            String(messageEvent.data)
                        ) as ServerRealtimeEvent;

                        if (!isTargetRealtimeEvent(event, target)) {
                            return;
                        }

                        const didPersist = await persistRealtimeEvent(
                            event,
                            target,
                            currentUserId
                        );
                        finish(didPersist);
                    } catch (error) {
                        finish(false, error);
                    }
                })();
            });

            socket.addEventListener("error", () => {
                finish(false, new Error("Notification websocket sync failed."));
            });

            socket.addEventListener("close", () => {
                finish(false);
            });
        }),
        SOCKET_SYNC_TIMEOUT_MS,
        "Notification websocket sync timed out."
    );
}

async function fetchRecentMessageFallback({
    target,
    currentUserId,
    cookies,
}: {
    target: NotificationSyncTarget;
    currentUserId: string;
    cookies: string;
}) {
    if (!target.messageId) {
        return false;
    }

    const response = await withTimeout(
        fetch(
            `${API_BASE_URL}/api/messages?chatRoomId=${encodeURIComponent(
                target.conversationId
            )}&limit=40`,
            {
                cache: "no-store",
                credentials: "omit",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: cookies,
                },
            }
        ),
        HTTP_FALLBACK_TIMEOUT_MS,
        "Notification message fallback timed out."
    );

    if (!response.ok) {
        return false;
    }

    const payload = (await response.json()) as {
        messages?: Parameters<typeof normalizeMessage>[0][];
    };
    const rawMessage = payload.messages?.find(
        (message) => message.message_id === target.messageId
    );

    if (!rawMessage) {
        return false;
    }

    return persistRealtimeMessage({
        conversationId: target.conversationId,
        rawMessage,
        currentUserId,
    });
}

async function syncNotificationMessageToLocalDbOnce(
    target: NotificationSyncTarget
) {
    const currentUserId = await getCurrentUserId();
    const cookies = getAuthCookie();

    if (!currentUserId || !cookies) {
        return false;
    }

    try {
        const didSyncFromSocket = await syncFromRealtimeSocket({
            target,
            currentUserId,
            cookies,
        });

        if (didSyncFromSocket) {
            return true;
        }
    } catch (error) {
        console.log("[push-sync] Realtime notification sync failed:", error);
    }

    try {
        return await fetchRecentMessageFallback({
            target,
            currentUserId,
            cookies,
        });
    } catch (error) {
        console.log("[push-sync] HTTP notification sync fallback failed:", error);
        return false;
    }
}

export async function syncNotificationMessageToLocalDb(
    data?: Record<string, unknown> | null
) {
    const target = parseNotificationSyncTarget(data);
    if (!target) return false;

    const syncKey = `${target.conversationId}:${target.messageId ?? "latest"}`;
    const existingSync = inFlightSyncs.get(syncKey);
    if (existingSync) return existingSync;

    const syncPromise = syncNotificationMessageToLocalDbOnce(target).finally(() => {
        inFlightSyncs.delete(syncKey);
    });
    inFlightSyncs.set(syncKey, syncPromise);

    return syncPromise;
}
