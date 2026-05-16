import { markDbChatRead } from "@/lib/upsert-db-chats";
import { clearChatNotificationFromSystem } from "@/lib/display-notifee-notification";
import { useActiveChatStore } from "@/store/use-active-chat-store";
import { useRealtimeStore } from "@/store/use-realtime-store";

export function markChatReadOptimistically({
    conversationId,
    messageId,
}: {
    conversationId: string;
    messageId?: string | null;
}) {
    useActiveChatStore.getState().markChatRead(conversationId);

    void clearChatNotificationFromSystem(conversationId);

    void markDbChatRead(conversationId).catch((error) => {
        console.log("Failed to mark chat read locally:", error);
    });

    useRealtimeStore.getState().sendEvent({
        type: "MARK_READ",
        conversationId,
        ...(messageId ? { messageId } : {}),
    });
}
