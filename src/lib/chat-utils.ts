import type { ChatItemType } from "@/types/chats.type";
import type { AvatarSource } from "./avatar-source";
import type { Contact } from "@/types/contacts.type";
import { Message, MessageReaction } from "@/types/messages";
import { resolveAvatarSource } from "./avatar-source";
import {
    buildPhoneLookupVariants,
    phoneValuesMatch,
    toContactDisplayName,
} from "./contact-utils";

type RawChatItem = Omit<ChatItemType, "avatar" | "created_at" | "updated_at" | "group_members"> & {
    avatar?: AvatarSource;
    group_members?: (Omit<NonNullable<ChatItemType["group_members"]>[number], "avatar"> & {
        avatar?: AvatarSource;
    })[] | null;
    created_at: string | Date;
    updated_at: string | Date;
};

type RawMessage = Omit<Message, "created_at" | "updated_at"> & {
    created_at: string | Date;
    updated_at: string | Date;
};

export function normalizeChatItem(chat: RawChatItem): ChatItemType {
    const rawGroupMembers =
        chat.group_members ??
        (chat as RawChatItem & { groupMembers?: RawChatItem["group_members"] })
            .groupMembers ??
        null;

    return {
        ...chat,
        avatar: resolveAvatarSource(chat.avatar),
        group_members: rawGroupMembers?.map((member) => ({
            ...member,
            avatar: resolveAvatarSource(member.avatar),
        })) ?? null,
        recipient_last_seen: chat.recipient_last_seen
            ? new Date(chat.recipient_last_seen)
            : null,
        created_at: new Date(chat.created_at),
        updated_at: new Date(chat.updated_at),
    };
}

export function normalizeMessage(message: RawMessage): Message {
    return {
        ...message,
        is_read_by_recipient: message.is_read_by_recipient ?? false,
        read_by_user_ids: message.read_by_user_ids ?? [],
        created_at: new Date(message.created_at),
        updated_at: new Date(message.updated_at),
    };
}

export function sortChatsByRecent(chats: ChatItemType[]): ChatItemType[] {
    return [...chats].sort(
        (left, right) => right.updated_at.getTime() - left.updated_at.getTime()
    );
}

export function sortMessagesChronologically(messages: Message[]): Message[] {
    return [...messages].sort(
        (left, right) => left.created_at.getTime() - right.created_at.getTime()
    );
}

export function resolveDirectChatPartner(
    chatId: string,
    currentPhone?: string | null
): string | null {
    if (!chatId.includes("::")) {
        return null;
    }

    const participants = chatId.split("::").filter(Boolean);
    if (participants.length === 0) {
        return null;
    }

    if (!currentPhone) {
        return participants[0] ?? null;
    }

    return (
        participants.find(
            (participant) => !phoneValuesMatch(participant, currentPhone)
        ) ?? null
    );
}

export function buildDirectChatIdVariants(chatId: string): string[] {
    if (!chatId.includes("::")) {
        return [chatId];
    }

    const participants = chatId.split("::").filter(Boolean);
    if (participants.length !== 2) {
        return [chatId];
    }

    const [leftParticipant, rightParticipant] = participants;
    const leftVariants = buildPhoneLookupVariants(leftParticipant);
    const rightVariants = buildPhoneLookupVariants(rightParticipant);
    const chatIdVariants = new Set<string>();

    for (const leftVariant of leftVariants) {
        for (const rightVariant of rightVariants) {
            chatIdVariants.add(
                [leftVariant, rightVariant].filter(Boolean).sort().join("::")
            );
        }
    }

    return chatIdVariants.size > 0 ? [...chatIdVariants] : [chatId];
}

export function areDirectChatIdsEquivalent(
    leftChatId: string,
    rightChatId: string
): boolean {
    if (!leftChatId.includes("::") || !rightChatId.includes("::")) {
        return leftChatId === rightChatId;
    }

    const leftParticipants = leftChatId.split("::").filter(Boolean);
    const rightParticipants = rightChatId.split("::").filter(Boolean);

    if (leftParticipants.length !== 2 || rightParticipants.length !== 2) {
        return leftChatId === rightChatId;
    }

    return leftParticipants.every((leftParticipant) =>
        rightParticipants.some((rightParticipant) =>
            phoneValuesMatch(leftParticipant, rightParticipant)
        )
    );
}

export function getChatDisplayName(
    chat: ChatItemType,
    currentPhone?: string | null
): string {
    if (chat.display_name?.trim()) {
        return chat.display_name;
    }

    if (chat.chat_type === "single") {
        return resolveDirectChatPartner(chat.chat_id, currentPhone) ?? chat.chat_id;
    }

    return chat.chat_id || "Group chat";
}

export function applyContactToSingleChat(
    chat: ChatItemType,
    contact: Contact
): ChatItemType {
    if (chat.chat_type !== "single") {
        return chat;
    }

    const nextDisplayName = toContactDisplayName(contact);
    const nextContactAvatar = contact.contact_avatar ?? "";
    const nextAvatar = nextContactAvatar || chat.avatar;
    const nextRecipientUserId = contact.linked_user_id ?? chat.recipient_user_id ?? null;
    const nextRecipientPublicKey =
        contact.linked_user_public_key ?? chat.recipient_public_key ?? null;
    const nextContactPhone = contact.contact_number;

    if (
        chat.display_name === nextDisplayName &&
        chat.avatar === nextAvatar &&
        chat.recipient_user_id === nextRecipientUserId &&
        chat.recipient_public_key === nextRecipientPublicKey &&
        chat.contact_phone === nextContactPhone
    ) {
        return chat;
    }

    return {
        ...chat,
        display_name: nextDisplayName,
        avatar: nextAvatar,
        recipient_user_id: nextRecipientUserId,
        recipient_public_key: nextRecipientPublicKey,
        contact_phone: nextContactPhone,
    };
}

export function buildChatFromMessage({
    conversationId,
    conversationType,
    message,
    currentUserId,
    unreadCount,
    fallbackExistingChat,
}: {
    conversationId: string;
    conversationType: "direct" | "group";
    message: Message;
    currentUserId: string;
    unreadCount: number;
    fallbackExistingChat?: ChatItemType | null;
}): ChatItemType {
    const lastMessageRecipientUserIds = [
        ...new Set(
            (message.message_recipient_keys ?? [])
                .map((key) => key.recipient_user_id)
                .filter(
                    (recipientUserId) =>
                        recipientUserId && recipientUserId !== message.sender_user_id
                )
        ),
    ];
    const lastMessageReadByUserIds = message.read_by_user_ids ?? [];
    const lastMessageReadByUserIdSet = new Set(lastMessageReadByUserIds);

    return {
        chat_id: conversationId,
        chat_type: conversationType === "group" ? "group" : "single",
        avatar: fallbackExistingChat?.avatar ?? "",
        display_name: fallbackExistingChat?.display_name ?? null,
        group_members: fallbackExistingChat?.group_members ?? null,
        recipient_user_id: fallbackExistingChat?.recipient_user_id ?? null,
        recipient_public_key: fallbackExistingChat?.recipient_public_key ?? null,
        contact_phone: fallbackExistingChat?.contact_phone ?? null,
        recipient_last_seen: fallbackExistingChat?.recipient_last_seen ?? null,
        recipient_who_can_see_last_seen:
            fallbackExistingChat?.recipient_who_can_see_last_seen ?? null,
        recipient_last_seen_visible:
            fallbackExistingChat?.recipient_last_seen_visible ?? null,
        recipient_who_can_see_status:
            fallbackExistingChat?.recipient_who_can_see_status ?? null,
        recipient_who_can_see_profile_picture:
            fallbackExistingChat?.recipient_who_can_see_profile_picture ?? null,
        recipient_profile_picture_visible:
            fallbackExistingChat?.recipient_profile_picture_visible ?? null,
        recipient_about_ciphertext:
            fallbackExistingChat?.recipient_about_ciphertext ?? null,
        recipient_about_encrypted_aes_key:
            fallbackExistingChat?.recipient_about_encrypted_aes_key ?? null,
        recipient_about_iv: fallbackExistingChat?.recipient_about_iv ?? null,
        recipient_who_can_see_about:
            fallbackExistingChat?.recipient_who_can_see_about ?? null,
        recipient_about_visible:
            fallbackExistingChat?.recipient_about_visible ?? null,
        stored_contact: fallbackExistingChat?.stored_contact ?? null,
        is_provisional: false,
        last_message_id: message.message_id,
        encrypted_preview_ciphertext:
            fallbackExistingChat?.encrypted_preview_ciphertext ?? null,
        encrypted_preview_iv: fallbackExistingChat?.encrypted_preview_iv ?? null,
        encrypted_preview_algorithm:
            fallbackExistingChat?.encrypted_preview_algorithm ?? null,
        chat_recipient_keys: fallbackExistingChat?.chat_recipient_keys ?? null,
        last_message_context: message.message_text_content ?? "",
        last_message_media: message.attached_media ?? null,
        last_message_sender_is_me: message.sender_user_id === currentUserId,
        last_message_sender_nickname:
            fallbackExistingChat?.last_message_sender_nickname ??
            message.sender_user_id,
        last_message_is_read_by_recipient:
            message.is_read_by_recipient ??
            (lastMessageRecipientUserIds.length > 0 &&
                lastMessageRecipientUserIds.every((recipientUserId) =>
                    lastMessageReadByUserIdSet.has(recipientUserId)
                )),
        last_message_read_by_user_ids: lastMessageReadByUserIds,
        last_message_recipient_user_ids: lastMessageRecipientUserIds,
        is_unreaded_chat: unreadCount > 0,
        unreaded_messages_length: unreadCount,
        is_archived_chat: fallbackExistingChat?.is_archived_chat ?? false,
        is_muted_chat_notifications:
            fallbackExistingChat?.is_muted_chat_notifications ?? false,
        is_pinned_chat: fallbackExistingChat?.is_pinned_chat ?? false,
        is_favourite_chat: fallbackExistingChat?.is_favourite_chat ?? false,
        is_blocked_chat: fallbackExistingChat?.is_blocked_chat ?? false,
        created_at: fallbackExistingChat?.created_at ?? message.created_at,
        updated_at: message.updated_at,
    };
}

export function buildChatFromReaction({
    conversationId,
    conversationType,
    messageId,
    reaction,
    updatedAt,
    currentUserId,
    unreadCount,
    fallbackExistingChat,
}: {
    conversationId: string;
    conversationType: "direct" | "group";
    messageId: string;
    reaction: MessageReaction;
    updatedAt: Date;
    currentUserId: string;
    unreadCount?: number;
    fallbackExistingChat?: ChatItemType | null;
}): ChatItemType {
    return {
        chat_id: conversationId,
        chat_type: conversationType === "group" ? "group" : "single",
        avatar: fallbackExistingChat?.avatar ?? "",
        display_name: fallbackExistingChat?.display_name ?? null,
        group_members: fallbackExistingChat?.group_members ?? null,
        recipient_user_id: fallbackExistingChat?.recipient_user_id ?? null,
        recipient_public_key: fallbackExistingChat?.recipient_public_key ?? null,
        contact_phone: fallbackExistingChat?.contact_phone ?? null,
        recipient_last_seen: fallbackExistingChat?.recipient_last_seen ?? null,
        recipient_who_can_see_last_seen:
            fallbackExistingChat?.recipient_who_can_see_last_seen ?? null,
        recipient_last_seen_visible:
            fallbackExistingChat?.recipient_last_seen_visible ?? null,
        recipient_who_can_see_status:
            fallbackExistingChat?.recipient_who_can_see_status ?? null,
        recipient_who_can_see_profile_picture:
            fallbackExistingChat?.recipient_who_can_see_profile_picture ?? null,
        recipient_profile_picture_visible:
            fallbackExistingChat?.recipient_profile_picture_visible ?? null,
        recipient_about_ciphertext:
            fallbackExistingChat?.recipient_about_ciphertext ?? null,
        recipient_about_encrypted_aes_key:
            fallbackExistingChat?.recipient_about_encrypted_aes_key ?? null,
        recipient_about_iv: fallbackExistingChat?.recipient_about_iv ?? null,
        recipient_who_can_see_about:
            fallbackExistingChat?.recipient_who_can_see_about ?? null,
        recipient_about_visible:
            fallbackExistingChat?.recipient_about_visible ?? null,
        stored_contact: fallbackExistingChat?.stored_contact ?? null,
        is_provisional: false,
        last_message_id: messageId,
        encrypted_preview_ciphertext: null,
        encrypted_preview_iv: null,
        encrypted_preview_algorithm: null,
        chat_recipient_keys: fallbackExistingChat?.chat_recipient_keys ?? null,
        last_message_context: reaction.reaction_emoji,
        last_message_media: "reaction",
        last_message_sender_is_me: reaction.user_id === currentUserId,
        last_message_sender_nickname: reaction.user_id,
        last_message_is_read_by_recipient:
            fallbackExistingChat?.last_message_is_read_by_recipient ?? null,
        last_message_read_by_user_ids:
            fallbackExistingChat?.last_message_read_by_user_ids ?? null,
        last_message_recipient_user_ids:
            fallbackExistingChat?.last_message_recipient_user_ids ?? null,
        is_unreaded_chat:
            unreadCount !== undefined
                ? unreadCount > 0
                : fallbackExistingChat?.is_unreaded_chat ?? false,
        unreaded_messages_length:
            unreadCount ?? fallbackExistingChat?.unreaded_messages_length ?? 0,
        is_archived_chat: fallbackExistingChat?.is_archived_chat ?? false,
        is_muted_chat_notifications:
            fallbackExistingChat?.is_muted_chat_notifications ?? false,
        is_pinned_chat: fallbackExistingChat?.is_pinned_chat ?? false,
        is_favourite_chat: fallbackExistingChat?.is_favourite_chat ?? false,
        is_blocked_chat: fallbackExistingChat?.is_blocked_chat ?? false,
        created_at: fallbackExistingChat?.created_at ?? updatedAt,
        updated_at: updatedAt,
    };
}
