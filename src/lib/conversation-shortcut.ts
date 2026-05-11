import { NativeModules, Platform } from "react-native";

const { ConversationShortcut } = NativeModules;
const MESSAGES_CHANNEL_ID = "messages";

type ConversationNotificationOptions = {
    shortcutId: string;
    title: string;
    body: string;
    senderDisplayName: string;
    senderId: string;
    senderAvatarUrl?: string;
    conversationId: string;
    conversationTitle?: string;
    isGroupConversation: boolean;
    timestamp: number;
};

export async function pushConversationShortcut({
    shortcutId,
    personName,
    personIconUrl,
    conversationId,
}: {
    shortcutId: string;
    personName: string;
    personIconUrl?: string;
    conversationId: string;
}) {
    if (Platform.OS !== "android") return;
    if (!ConversationShortcut) return;

    try {
        await ConversationShortcut.pushShortcut(
            shortcutId,
            personName,
            personIconUrl ?? null,
            conversationId
        );
    } catch (e) {
        console.warn("[shortcut] Failed to push conversation shortcut:", e);
    }
}

export async function displayAndroidConversationNotification(
    options: ConversationNotificationOptions
) {
    if (Platform.OS !== "android") return false;
    if (!ConversationShortcut?.displayConversationNotification) return false;

    try {
        return await ConversationShortcut.displayConversationNotification({
            ...options,
            channelId: MESSAGES_CHANNEL_ID,
        });
    } catch (e) {
        console.warn("[notification] Failed to display native conversation notification:", e);
        return false;
    }
}
