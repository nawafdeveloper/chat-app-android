import type { Message } from "@/types/messages";

export function getMessageRecipientUserIds(message: Message): string[] {
    return [
        ...new Set(
            (message.message_recipient_keys ?? [])
                .map((key) => key.recipient_user_id)
                .filter((userId) => userId && userId !== message.sender_user_id)
        ),
    ];
}

export function withMessageReadReceipt(
    message: Message,
    readByUserIds: string[]
): Message {
    const recipientUserIds = getMessageRecipientUserIds(message);
    const readByRecipients = [
        ...new Set(readByUserIds.filter((userId) => userId !== message.sender_user_id)),
    ];
    const readByUserIdSet = new Set(readByRecipients);

    return {
        ...message,
        read_by_user_ids: readByRecipients,
        is_read_by_recipient:
            recipientUserIds.length > 0 &&
            recipientUserIds.every((userId) => readByUserIdSet.has(userId)),
    };
}

export function applyMessageReadByUser(
    message: Message,
    userId: string,
    readAt: Date
): Message {
    if (message.sender_user_id === userId || message.created_at > readAt) {
        return message;
    }

    const recipientUserIds = getMessageRecipientUserIds(message);
    if (recipientUserIds.length > 0 && !recipientUserIds.includes(userId)) {
        return message;
    }

    const readByUserIds = message.read_by_user_ids ?? [];
    if (readByUserIds.includes(userId) && message.is_read_by_recipient) {
        return message;
    }

    return withMessageReadReceipt(message, [...readByUserIds, userId]);
}
