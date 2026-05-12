import type { ChatItemType } from "./chats.type";
import type {
    EncryptedContentEnvelope,
    RecipientEncryptedAesKeyInput,
} from "./crypto.type";
import type { Message, MessageReaction } from "./messages";

type RealtimeMessage = Omit<Message, "created_at" | "updated_at"> & {
    created_at: string;
    updated_at: string;
};

export type ClientRealtimeEvent =
    | {
        type: "JOIN_CONVERSATION";
        conversationId: string;
    }
    | {
        type: "LEAVE_CONVERSATION";
        conversationId?: string;
    }
    | {
        type: "SEND_MESSAGE";
        debugTraceId?: string;
        clientMessageId?: string;
        conversationId?: string;
        conversationType: "direct" | "group";
        senderUserId?: string;
        senderNickname?: string;
        senderAvatarUrl?: string | null;
        recipientUserId?: string;
        senderPhone?: string;
        recipientPhone?: string;
        participantIds?: string[];
        notificationPlaintext?: string | null;
        content?: string;
        messageTextContent?: string | null;
        attachedMedia?: Message["attached_media"];
        mediaUrl?: string | null;
        mediaPreviewUrl?: string | null;
        mediaSizeBytes?: number | null;
        mediaWidth?: number | null;
        mediaHeight?: number | null;
        mediaFileName?: string | null;
        videoThumbnail?: string | null;
        isForwardMessage?: boolean;
        encryptedContent?: EncryptedContentEnvelope | null;
        recipientEncryptionKeys?: RecipientEncryptedAesKeyInput[] | null;
        encryptedChatPreview?: EncryptedContentEnvelope | null;
        chatPreviewRecipientKeys?: RecipientEncryptedAesKeyInput[] | null;
        replyMessage?: Message["reply_message"];
        openGraphData?: Message["open_graph_data"];
    }
    | {
        type: "REACT_MESSAGE";
        conversationId: string;
        conversationType: "direct" | "group";
        messageId: string;
        reactionEmoji: string;
    }
    | {
        type: "MARK_DELIVERED";
        conversationId: string;
        messageId?: string;
    }
    | {
        type: "MARK_READ";
        conversationId: string;
        messageId?: string;
    }
    | {
        type: "START_TYPING";
        conversationId: string;
    }
    | {
        type: "STOP_TYPING";
        conversationId: string;
    };

export type ServerRealtimeEvent =
    | {
        type: "GROUP_CREATED";
        chat: Omit<ChatItemType, "created_at" | "updated_at"> & {
            created_at: string;
            updated_at: string;
        };
    }
    | {
        type: "MESSAGE_SENT";
        conversationId: string;
        conversationType: "direct" | "group";
        clientMessageId: string | null;
        message: RealtimeMessage;
    }
    | {
        type: "NEW_MESSAGE";
        conversationId: string;
        conversationType: "direct" | "group";
        message: RealtimeMessage;
    }
    | {
        type: "CONVERSATION_UPDATED";
        conversationId: string;
        conversationType: "direct" | "group";
        lastMessage: RealtimeMessage;
        unreadCount: number;
    }
    | {
        type: "MESSAGE_REACTION_UPDATED";
        conversationId: string;
        conversationType: "direct" | "group";
        messageId: string;
        targetSenderUserId: string;
        reaction: MessageReaction;
        updatedAt: string;
        unreadCount?: number;
    }
    | {
        type: "MESSAGE_FLAGS_UPDATED";
        conversationId: string;
        messageId: string;
        userIdsPinIt: string[] | null;
        updatedAt: string;
    }
    | {
        type: "CONVERSATION_PRESENCE";
        conversationId: string;
        status: "joined" | "left";
        userId: string;
        activeUsers: string[];
        activeUsersCount: number;
    }
    | {
        type: "CONVERSATION_TYPING";
        conversationId: string;
        status: "started" | "stopped";
        userId: string;
        activeTypingUsers: string[];
    }
    | {
        type: "MARK_DELIVERED";
        conversationId: string;
        messageId: string | null;
        userId: string;
    }
    | {
        type: "MARK_READ";
        conversationId: string;
        messageId: string | null;
        userId: string;
        readAt: string;
    }
    | {
        type: "ERROR";
        message: string;
    };
