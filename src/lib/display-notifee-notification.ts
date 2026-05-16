import {
    cancelAndroidConversationNotification,
    displayAndroidConversationNotification,
} from "@/lib/conversation-shortcut";
import {
    fetchAndDecryptProfileImage,
    parseManagedProfileImageUrl,
} from "@/lib/profile-image";
import { getDbChat } from "@/lib/upsert-db-chats";
import { useActiveChatStore } from "@/store/use-active-chat-store";
import notifee, {
    AndroidCategory,
    AndroidStyle,
    type NotificationAndroid,
} from "@notifee/react-native";
import type { FirebaseMessagingTypes } from "@react-native-firebase/messaging";

const MESSAGES_CHANNEL_ID = "messages";

function optionalString(value: unknown) {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

function firstOptionalString(...values: unknown[]) {
    for (const value of values) {
        const stringValue = optionalString(value);
        if (stringValue) return stringValue;
    }

    return undefined;
}

function optionalBoolean(value: unknown) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return value === "true";
    return undefined;
}

function buildShortcutId(conversationId?: string) {
    if (!conversationId) return undefined;
    return `conversation_${conversationId}`;
}

function getNotificationConversationId(data: Record<string, unknown>) {
    return (
        optionalString(data.conversationId) ??
        optionalString(data.chatId) ??
        optionalString(data.chat_room_id) ??
        optionalString(data.chatRoomId) ??
        optionalString(data.roomId)
    );
}

function getNotificationMessageId(data: Record<string, unknown>) {
    return optionalString(data.messageId) ?? optionalString(data.message_id);
}

async function decryptProfileImageIfNeeded(imageUrl?: string) {
    if (!imageUrl) return undefined;

    const managedImage = parseManagedProfileImageUrl(imageUrl);
    if (!managedImage) return imageUrl;

    try {
        return await fetchAndDecryptProfileImage(managedImage.objectKey);
    } catch (error) {
        console.warn("[notification] Failed to decrypt profile image:", error);
        return undefined;
    }
}

async function resolveChatAvatarUrl(conversationId?: string) {
    if (!conversationId) return undefined;

    const storeChat = useActiveChatStore
        .getState()
        .chats.find((chat) => chat.chat_id === conversationId);

    if (storeChat?.avatar) return storeChat.avatar;

    try {
        const dbChat = await getDbChat(conversationId);
        return dbChat?.avatar || undefined;
    } catch (error) {
        console.warn("[notification] Failed to load chat avatar:", error);
        return undefined;
    }
}

async function resolveNotificationAvatarUrl(
    data: Record<string, unknown>,
    conversationId?: string
) {
    const payloadAvatarUrl = firstOptionalString(
        data.senderAvatarUrl,
        data.sender_avatar_url,
        data.senderAvatar,
        data.sender_avatar,
        data.avatarUrl,
        data.avatar,
        data.profileImageUrl,
        data.profile_image_url
    );

    const rawAvatarUrl = payloadAvatarUrl ?? await resolveChatAvatarUrl(conversationId);
    return decryptProfileImageIfNeeded(rawAvatarUrl);
}

function buildNotificationData({
    conversationId,
    messageId,
}: {
    conversationId?: string;
    messageId?: string;
}) {
    return {
        ...(conversationId
            ? {
                conversationId,
                chatId: conversationId,
            }
            : {}),
        ...(messageId ? { messageId } : {}),
    };
}

export async function displayNotifeeNotification(data: Record<string, unknown>) {
    const title = optionalString(data.title) ?? "New message";
    const body = optionalString(data.body) ?? "";
    const senderDisplayName = optionalString(data.senderDisplayName) ?? title;
    const senderId =
        optionalString(data.senderId) ??
        optionalString(data.senderUserId) ??
        senderDisplayName;
    const conversationId = getNotificationConversationId(data);
    const conversationTitle = optionalString(data.conversationTitle);
    const messageId = getNotificationMessageId(data);
    const isGroupConversation =
        optionalBoolean(data.isGroupConversation) ??
        optionalString(data.chatType) === "group";
    const timestamp = Date.now();
    const shortcutId = buildShortcutId(conversationId);

    // ✅ Resolve + decrypt avatar ONCE here
    const resolvedAvatarUrl = await resolveNotificationAvatarUrl(data, conversationId);

    if (shortcutId && conversationId) {
        const displayed = await displayAndroidConversationNotification({
            shortcutId,
            title,
            body,
            senderDisplayName,
            senderId,
            conversationId,
            isGroupConversation,
            timestamp,
            ...(resolvedAvatarUrl ? { senderAvatarUrl: resolvedAvatarUrl } : {}),
            ...(conversationTitle ? { conversationTitle } : {}),
        });

        if (displayed) return;
    }

    // Notifee fallback path
    const senderPerson = {
        name: senderDisplayName,
        id: senderId,
        uri: `chatappandroid://user/${encodeURIComponent(senderId)}`,
        bot: false,
        important: true,
        ...(resolvedAvatarUrl ? { icon: resolvedAvatarUrl } : {}),
    };

    const androidConfig = {
        channelId: MESSAGES_CHANNEL_ID,
        category: AndroidCategory.MESSAGE,
        color: "#ffffff",
        smallIcon: "notification-icon",
        pressAction: { id: "default" },
        timestamp,
        showTimestamp: true,
        ...(resolvedAvatarUrl
            ? { largeIcon: resolvedAvatarUrl, circularLargeIcon: true }
            : {}),
        style: {
            type: AndroidStyle.MESSAGING,
            person: { name: "You", id: "current-user", bot: false },
            messages: [{ text: body || title, timestamp, person: senderPerson }],
            group: isGroupConversation,
            ...(conversationTitle ? { title: conversationTitle } : {}),
        },
    } as NotificationAndroid;

    await notifee.displayNotification({
        id: shortcutId ?? messageId,
        title,
        body,
        android: androidConfig,
        data: buildNotificationData({ conversationId, messageId }),
    });
}

export async function displayRemoteMessageNotification(
    remoteMessage: FirebaseMessagingTypes.RemoteMessage
) {
    if (remoteMessage.notification) {
        console.warn(
            "[push] FCM message included a top-level notification payload. Send data-only FCM for Notifee-controlled background notifications."
        );
    }

    await displayNotifeeNotification(remoteMessage.data ?? {});
}

export async function clearChatNotificationFromSystem(conversationId: string) {
    const shortcutId = buildShortcutId(conversationId);

    await Promise.allSettled([
        cancelAndroidConversationNotification(conversationId),
        ...(shortcutId ? [notifee.cancelNotification(shortcutId)] : []),
    ]);

    try {
        const displayedNotifications = await notifee.getDisplayedNotifications();
        const matchingNotificationIds = displayedNotifications
            .filter(({ notification }) => {
                const data = notification.data ?? {};
                return getNotificationConversationId(data) === conversationId;
            })
            .map(({ notification }) => notification.id)
            .filter((id): id is string => typeof id === "string" && id.length > 0);

        await Promise.allSettled(
            matchingNotificationIds.map((notificationId) =>
                notifee.cancelNotification(notificationId)
            )
        );
    } catch (error) {
        console.warn("[notification] Failed to clear displayed chat notifications:", error);
    }
}
