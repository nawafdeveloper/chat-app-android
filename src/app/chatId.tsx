import ChatInputContainer from '@/components/chat-input-container';
import ContactPreviewBeforeSent from '@/components/contact-preview-before-sent';
import { ChatAvatar } from '@/components/decrypted-chat-avatar';
import FilePreviewBeforeSent from '@/components/file-preview-before-sent';
import ImagePreviewBeforeSent from '@/components/image-preview-before-sent';
import Bubble from '@/components/message-bubble';
import { TiledBackground } from '@/components/tailed-wallpaper';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ForwardIcon } from '@/components/ui/file-icons';
import VideoPreviewBeforeSent from '@/components/video-preview-before-sent';
import { Colors } from '@/constants/theme';
import { useCryptoKeys } from '@/context/crypto';
import { useIsTablet } from '@/context/screen-checking-context';
import { useChatMessages } from '@/hooks/use-chat-realtime';
import { useForwardMessages } from '@/hooks/use-forward-messages';
import { useMessageActions } from '@/hooks/use-message-actions';
import { useSendChatMessage } from '@/hooks/use-send-chat-message';
import { authClient } from '@/lib/auth-client';
import { buildDirectChatId, decryptMessageBatch } from '@/lib/chat-e2ee';
import { areDirectChatIdsEquivalent, normalizeMessage } from '@/lib/chat-utils';
import { findContactByPhone, findContactByUserId, getContactDisplayName } from '@/lib/contact-display';
import { markChatReadOptimistically } from '@/lib/optimistic-read-receipts';
import { useContactPreviewBeforeSentStore } from '@/store/contact-preview-before-sent';
import { useFilePreviewBeforeSentStore } from '@/store/file-preview-before-sent';
import { useImagePreviewBeforeSentStore } from '@/store/image-preview-before-sent';
import { rightNavRef } from '@/store/right-nav-ref';
import { useActiveChatStore } from '@/store/use-active-chat-store';
import { useContactDirectoryStore } from '@/store/use-contact-directory-store';
import { useRealtimeStore } from '@/store/use-realtime-store';
import { useVideoPreviewBeforeSentStore } from '@/store/video-preview-before-sent';
import type { ChatItemType } from '@/types/chats.type';
import type { Contact } from '@/types/contacts.type';
import type { Message } from '@/types/messages';
import { useFocusEffect, useIsFocused, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Keyboard, KeyboardAvoidingView, Modal, NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, StyleSheet, TextInput, useColorScheme, type FlatListProps } from 'react-native';
import { ActivityIndicator, Appbar, Icon, IconButton, TouchableRipple } from 'react-native-paper';
import Animated, { ZoomIn, ZoomOut } from 'react-native-reanimated';

const EMPTY_MESSAGES: Message[] = [];
const EMPTY_USER_IDS: string[] = [];
const CHAT_DEBUG = true;

type MessageListItem =
    | {
        type: "message";
        id: string;
        message: Message;
    }
    | {
        type: "date";
        id: string;
        label: string;
    };

type MessageGroupMeta = {
    showTail: boolean;
    isGroupedWithPrevious: boolean;
    isGroupedWithNext: boolean;
};

type MessageScrollRequest = {
    messageId: string;
    source: "pinned" | "reply";
};

type RawMessage = Omit<Message, "created_at" | "updated_at"> & {
    created_at: string | Date;
    updated_at: string | Date;
};

function sortPinnedMessages(messages: Message[]) {
    return [...messages].sort(
        (left, right) => right.created_at.getTime() - left.created_at.getTime()
    );
}

function isMessageFlaggedByUser(
    message: Message | null | undefined,
    userId: string | null | undefined,
    flag: "pin" | "star"
) {
    if (!message || !userId) {
        return false;
    }

    const userIds =
        flag === "pin" ? message.user_ids_pin_it : message.user_ids_star_it;

    return userIds?.includes(userId) ?? false;
}

function buildForwardTargetChat({
    contact,
    currentPhone,
    currentUserId,
    existingChat,
}: {
    contact: Contact;
    currentPhone: string;
    currentUserId: string;
    existingChat?: ChatItemType | null;
}): ChatItemType {
    const chatId = buildDirectChatId(currentPhone, contact.contact_number);

    return {
        chat_id: chatId,
        chat_type: "single",
        avatar: contact.contact_avatar ?? existingChat?.avatar ?? "",
        display_name: getContactDisplayName(contact) || contact.contact_number,
        recipient_user_id: contact.linked_user_id,
        recipient_public_key: contact.linked_user_public_key ?? null,
        contact_phone: contact.contact_number,
        recipient_last_seen: existingChat?.recipient_last_seen ?? null,
        recipient_who_can_see_last_seen:
            existingChat?.recipient_who_can_see_last_seen ?? null,
        recipient_last_seen_visible:
            existingChat?.recipient_last_seen_visible ?? null,
        recipient_who_can_see_status:
            existingChat?.recipient_who_can_see_status ?? null,
        recipient_who_can_see_profile_picture:
            existingChat?.recipient_who_can_see_profile_picture ?? null,
        recipient_profile_picture_visible:
            existingChat?.recipient_profile_picture_visible ?? null,
        recipient_about_ciphertext:
            existingChat?.recipient_about_ciphertext ?? null,
        recipient_about_encrypted_aes_key:
            existingChat?.recipient_about_encrypted_aes_key ?? null,
        recipient_about_iv: existingChat?.recipient_about_iv ?? null,
        recipient_who_can_see_about:
            existingChat?.recipient_who_can_see_about ?? null,
        recipient_about_visible: existingChat?.recipient_about_visible ?? null,
        stored_contact: existingChat?.stored_contact ?? null,
        is_provisional: !existingChat,
        last_message_id: existingChat?.last_message_id ?? null,
        encrypted_preview_ciphertext:
            existingChat?.encrypted_preview_ciphertext ?? null,
        encrypted_preview_iv: existingChat?.encrypted_preview_iv ?? null,
        encrypted_preview_algorithm:
            existingChat?.encrypted_preview_algorithm ?? null,
        chat_recipient_keys: existingChat?.chat_recipient_keys ?? null,
        last_message_context: existingChat?.last_message_context ?? "",
        last_message_media: existingChat?.last_message_media ?? null,
        last_message_sender_is_me:
            existingChat?.last_message_sender_is_me ?? false,
        last_message_sender_nickname:
            existingChat?.last_message_sender_nickname ?? currentUserId,
        last_message_is_read_by_recipient:
            existingChat?.last_message_is_read_by_recipient ?? null,
        last_message_read_by_user_ids:
            existingChat?.last_message_read_by_user_ids ?? null,
        last_message_recipient_user_ids:
            existingChat?.last_message_recipient_user_ids ?? null,
        is_unreaded_chat: existingChat?.is_unreaded_chat ?? false,
        unreaded_messages_length:
            existingChat?.unreaded_messages_length ?? 0,
        is_archived_chat: existingChat?.is_archived_chat ?? false,
        is_muted_chat_notifications:
            existingChat?.is_muted_chat_notifications ?? false,
        is_pinned_chat: existingChat?.is_pinned_chat ?? false,
        is_favourite_chat: existingChat?.is_favourite_chat ?? false,
        is_blocked_chat: existingChat?.is_blocked_chat ?? false,
        created_at: existingChat?.created_at ?? new Date(),
        updated_at: existingChat?.updated_at ?? new Date(),
    };
}

function debugChatId(stage: string, payload: Record<string, unknown> = {}) {
    if (!CHAT_DEBUG) {
        return;
    }

}

function summarizeMessageForDebug(message: Message) {
    return {
        id: message.message_id,
        chatId: message.chat_room_id,
        sender: message.sender_user_id,
        media: message.attached_media,
        hasText: Boolean(message.message_text_content?.trim()),
        textLength: message.message_text_content?.length ?? 0,
        status: message.client_status,
        readByRecipient: message.is_read_by_recipient,
        createdAt: message.created_at?.toISOString?.() ?? String(message.created_at),
    };
}

function resolveCanonicalChatId(
    chatId: string | null | undefined,
    chats: ReturnType<typeof useActiveChatStore.getState>["chats"]
) {
    if (!chatId) {
        return null;
    }

    return (
        chats.find((chat) => chat.chat_id === chatId)?.chat_id ??
        chats.find((chat) => areDirectChatIdsEquivalent(chat.chat_id, chatId))?.chat_id ??
        chatId
    );
}

function getPinnedMessageLabel(message: Message) {
    switch (message.attached_media) {
        case "photo":
            return "Photo";
        case "video":
            return "Video";
        case "voice":
            return "Voice message";
        case "file":
            return message.media_file_name ?? "File";
        case "contact":
            return message.contact?.contact_name ?? "Contact";
        case "location":
            return message.location?.name ?? message.location?.formatted_address ?? "Location";
        default:
            break;
    }

    const textContent = message.message_text_content?.trim();
    if (textContent) {
        return textContent;
    }

    if (message.poll?.poll_question) {
        return message.poll.poll_question;
    }

    if (message.event && "event_name" in message.event) {
        return message.event.event_name;
    }

    return "Pinned message";
}

function getPinnedMessageIcon(message: Message) {
    switch (message.attached_media) {
        case 'file': return 'paperclip';
        case 'video': return 'video-outline';
        case 'photo': return 'image-outline';
        case 'voice': return 'microphone-outline';
        case 'contact': return 'account-box-outline';
        case 'location': return 'map-marker-outline';
        default: return null;
    }
}

function getLocalDateKey(date: Date) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function formatDateSeparator(date: Date) {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (getLocalDateKey(date) === getLocalDateKey(today)) {
        return "Today";
    }

    if (getLocalDateKey(date) === getLocalDateKey(yesterday)) {
        return "Yesterday";
    }

    return date.toLocaleDateString(undefined, {
        day: "numeric",
        month: "long",
        year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
    });
}

function formatLastSeen(date: Date | string | null | undefined) {
    if (!date) {
        return null;
    }

    const lastSeen = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(lastSeen.getTime())) {
        return null;
    }

    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const time = lastSeen.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
    });

    if (getLocalDateKey(lastSeen) === getLocalDateKey(today)) {
        return `last seen today at ${time}`;
    }

    if (getLocalDateKey(lastSeen) === getLocalDateKey(yesterday)) {
        return `last seen yesterday at ${time}`;
    }

    return `last seen ${lastSeen.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: lastSeen.getFullYear() === today.getFullYear() ? undefined : "numeric",
    })} at ${time}`;
}

function getGroupMemberDisplayName(
    member: NonNullable<ChatItemType["group_members"]>[number],
    contacts: Contact[]
) {
    const contact =
        findContactByUserId(contacts, member.user_id) ??
        findContactByPhone(contacts, member.phone_number);

    return (
        (contact ? getContactDisplayName(contact) : "") ||
        member.name?.trim() ||
        member.phone_number ||
        null
    );
}

function buildMessageListItems(messages: Message[]): MessageListItem[] {
    const newestFirstMessages = [...messages].reverse();
    const items: MessageListItem[] = [];

    newestFirstMessages.forEach((message, index) => {
        items.push({
            type: "message",
            id: message.message_id,
            message,
        });

        const nextOlderMessage = newestFirstMessages[index + 1];
        const isTopOfDateGroup =
            !nextOlderMessage ||
            getLocalDateKey(nextOlderMessage.created_at) !==
                getLocalDateKey(message.created_at);

        if (isTopOfDateGroup) {
            const dateKey = getLocalDateKey(message.created_at);

            items.push({
                type: "date",
                id: `date-${dateKey}`,
                label: formatDateSeparator(message.created_at),
            });
        }
    });

    return items;
}

function getGroupSystemEventLabel(
    event: Extract<NonNullable<Message["event"]>, { kind: "group-system" }>,
    currentUserId: string | null
) {
    const actorName =
        event.actor_user_id === currentUserId
            ? "You"
            : event.actor_name?.trim() || "Someone";
    const targetNames = event.target_names?.filter(Boolean).join(", ");

    switch (event.action) {
        case "member-left":
            return `${actorName} left`;
        case "member-added":
            return targetNames
                ? `${actorName} added ${targetNames}`
                : `${actorName} added a member`;
        case "name-changed":
            return event.next_name
                ? `${actorName} changed the group name to ${event.next_name}`
                : `${actorName} changed the group name`;
        case "image-changed":
            return `${actorName} changed the group photo`;
        default:
            return "Group updated";
    }
}

function getMessageEventLabel(message: Message, currentUserId: string | null) {
    const event = message.event;

    if (!event) {
        return null;
    }

    if ("kind" in event && event.kind === "group-system") {
        return getGroupSystemEventLabel(event, currentUserId);
    }

    if ("event_name" in event) {
        return event.event_name;
    }

    return "Event";
}

function canGroupMessage(message: Message) {
    return !getMessageEventLabel(message, null);
}

function areMessagesContinuousFromSameSender(
    left: Message | undefined,
    right: Message | undefined
) {
    return Boolean(
        left &&
        right &&
        canGroupMessage(left) &&
        canGroupMessage(right) &&
        left.sender_user_id === right.sender_user_id &&
        getLocalDateKey(left.created_at) === getLocalDateKey(right.created_at)
    );
}

function buildMessageGroupMetaById(messages: Message[]) {
    const metaById = new Map<string, MessageGroupMeta>();

    messages.forEach((message, index) => {
        const previousMessage = messages[index - 1];
        const nextMessage = messages[index + 1];
        const isGroupedWithPrevious = areMessagesContinuousFromSameSender(
            previousMessage,
            message
        );
        const isGroupedWithNext = areMessagesContinuousFromSameSender(
            message,
            nextMessage
        );

        metaById.set(message.message_id, {
            showTail: !isGroupedWithPrevious,
            isGroupedWithPrevious,
            isGroupedWithNext,
        });
    });

    return metaById;
}

function hasRenderableMessage(message: Message) {
    return Boolean(
        message.message_text_content?.trim() ||
        message.attached_media ||
        message.contact ||
        message.event ||
        message.poll ||
        message.location
    );
}

const ChatId = () => {
    const { data: session } = authClient.useSession()
    const listRef = useRef<FlatList<MessageListItem>>(null);
    const { isReady } = useCryptoKeys();
    const inputRef = useRef<TextInput>(null);
    const scheme = useColorScheme();
    const isDark = scheme === 'dark';
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme ?? 'light']
    const isTablet = useIsTablet();
    const params = useLocalSearchParams<{ chatId?: string | string[] }>();
    const navigationRoute = useRoute();
    const nativeChatId = (navigationRoute.params as { chatId?: string | string[] } | undefined)?.chatId;
    const expoChatId = Array.isArray(params.chatId) ? params.chatId[0] : params.chatId;
    const nativeRouteChatId = Array.isArray(nativeChatId) ? nativeChatId[0] : nativeChatId;
    const routeChatId = expoChatId ?? nativeRouteChatId;
    const isFocused = useIsFocused();
    const realtimeStatus = useRealtimeStore((state) => state.status);
    const { isVisible, hide: hideImagePreview } = useImagePreviewBeforeSentStore();
    const { isVideoVisible, hide: hideVideoPreview } = useVideoPreviewBeforeSentStore();
    const { isFileVisible, hide: hideFilePreview } = useFilePreviewBeforeSentStore();
    const { isContactVisible, hide: hideContactPreview } = useContactPreviewBeforeSentStore();
    const { starMessage, pinMessage, reactToMessage } = useMessageActions();
    const { forwardMessages, isForwarding } = useForwardMessages();

    const selectedChatId = useActiveChatStore((state) => state.selectedChatId);
    const chats = useActiveChatStore((state) => state.chats);
    const lastPinUpdate = useActiveChatStore((s) => s.lastPinUpdate);
    const setSelectedChatId = useActiveChatStore((state) => state.setSelectedChatId);
    const setReplyDraft = useActiveChatStore((state) => state.setReplyDraft);
    const clearReplyDraft = useActiveChatStore((state) => state.clearReplyDraft);
    const upsertChat = useActiveChatStore((state) => state.upsertChat);
    const activeChatId = useMemo(
        () => resolveCanonicalChatId(routeChatId ?? selectedChatId, chats),
        [chats, routeChatId, selectedChatId]
    );
    const contacts = useContactDirectoryStore((state) => state.contacts);
    const currentUserId = session?.user.id ?? null;
    const currentPhone = (session?.user as { phoneNumber?: string | null } | undefined)
        ?.phoneNumber ?? null;
    const { loadOlderMessages } = useChatMessages(activeChatId);
    const { retryMessage } = useSendChatMessage();
    const activeChat = useActiveChatStore((state) =>
        activeChatId
            ? state.chats.find((chat) => chat.chat_id === activeChatId) ?? null
            : null
    );
    const activePresence = useActiveChatStore((state) =>
        activeChatId ? state.presenceByChatId[activeChatId] ?? null : null
    );
    const activeTypingUsers = useActiveChatStore((state) =>
        activeChatId
            ? state.typingByChatId[activeChatId]?.activeTypingUsers ?? EMPTY_USER_IDS
            : EMPTY_USER_IDS
    );
    const messages = useActiveChatStore((state) =>
        activeChatId
            ? state.messagesByChatId[activeChatId] ?? EMPTY_MESSAGES
            : EMPTY_MESSAGES
    );
    const visibleMessages = useMemo(() => [...messages].reverse(), [messages]);
    const messageListItems = useMemo(
        () => buildMessageListItems(messages),
        [messages]
    );
    const messageGroupMetaById = useMemo(
        () => buildMessageGroupMetaById(messages),
        [messages]
    );
    const olderMessagesLoading = useActiveChatStore((state) =>
        activeChatId
            ? state.olderMessagesLoadingByChatId[activeChatId] ?? false
            : false
    );
    const hasOlderMessages = useActiveChatStore((state) =>
        activeChatId
            ? state.hasOlderMessagesByChatId[activeChatId] ?? false
            : false
    );
    const chatTitle = activeChat?.display_name ?? activeChat?.contact_phone ?? 'Chat';
    const avatarTint = colors.text;
    const isRealtimeConnecting = realtimeStatus === 'connecting';
    const groupMemberNames = useMemo(() => {
        if (activeChat?.chat_type !== "group") {
            return "";
        }

        return (
            activeChat.group_members
                ?.map((member) => getGroupMemberDisplayName(member, contacts))
                .filter((name): name is string => Boolean(name?.trim()))
                .join(", ") ?? ""
        );
    }, [activeChat?.chat_type, activeChat?.group_members, contacts]);
    const chatHeaderSubtitle = useMemo(() => {
        if (!activeChat) {
            return null;
        }

        if (activeChat.chat_type === "group") {
            const typingNames = activeTypingUsers
                .map((userId) => {
                    const member = activeChat.group_members?.find(
                        (groupMember) => groupMember.user_id === userId
                    );

                    return member
                        ? getGroupMemberDisplayName(member, contacts)
                        : null;
                })
                .filter((name): name is string => Boolean(name?.trim()));

            if (typingNames.length > 0) {
                const label =
                    typingNames.length === 1
                        ? typingNames[0]
                        : typingNames.join(", ");

                return {
                    text: `${label} typing ...`,
                    color: "#25D366",
                };
            }

            return groupMemberNames
                ? {
                    text: groupMemberNames,
                    color: colors.textSecondary,
                }
                : null;
        }

        if (activeTypingUsers.length > 0) {
            return {
                text: "typing ...",
                color: "#25D366",
            };
        }

        const recipientIsOnline = Boolean(
            activeChat.recipient_user_id &&
            activePresence?.activeUsers.includes(activeChat.recipient_user_id)
        );

        if (recipientIsOnline) {
            return {
                text: "online",
                color: "#25D366",
            };
        }

        if (activeChat.recipient_last_seen_visible === false) {
            return null;
        }

        const lastSeen = formatLastSeen(activeChat.recipient_last_seen);
        return lastSeen
            ? {
                text: lastSeen,
                color: colors.textSecondary,
            }
            : null;
    }, [
        activeChat,
        activePresence?.activeUsers,
        activeTypingUsers,
        colors.textSecondary,
        contacts,
        groupMemberNames,
    ]);

    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());
    const [isReply, setIsReply] = useState(false);
    const [replyToUser, setReplyToUser] = useState('');
    const [replyMessage, setReplyMessage] = useState('');
    const [replyMediaType, setReplyMediaType] = useState<'photo' | 'video' | 'voice' | 'file' | 'contact' | 'location' | null>(null);
    const [replyMediaUrl, setReplyMediaUrl] = useState('');
    const [keyboardOffset, setKeyboardOffset] = useState(-30);
    const [isReactionVisible, setIsReactionVisible] = useState(false);
    const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
    const [activePinnedMessageId, setActivePinnedMessageId] = useState<
        string | null
    >(null);
    const [showGoDownButton, setShowGoDownButton] = useState(false);
    const [isForwardVisible, setIsForwardVisible] = useState(false);
    const [selectedForwardContactIds, setSelectedForwardContactIds] = useState<Set<string>>(new Set());

    const selectedCount = selectedMessageIds.size;
    const selectionModeRef = useRef(selectionMode);
    const hasStartedMessageScrollRef = useRef(false);
    const lastReadReceiptKeyRef = useRef<string | null>(null);
    const lastOpenedChatReadKeyRef = useRef<string | null>(null);
    const pinnedMessagesRef = useRef<Message[]>([]);
    const activePinnedMessageIdRef = useRef<string | null>(null);
    const pendingMessageScrollRequestRef = useRef<MessageScrollRequest | null>(null);
    const isLoadingPinnedScrollTargetRef = useRef(false);
    const pinnedViewabilityConfigRef = useRef({
        itemVisiblePercentThreshold: 55,
    });

    const reactions = [
        { key: '1', label: '👍' },
        { key: '2', label: '❤️' },
        { key: '3', label: '😂' },
        { key: '4', label: '😮' },
        { key: '5', label: '😢' },
        { key: '6', label: '🙏' },
    ];

    const activePinnedMessage = useMemo(() => {
        if (pinnedMessages.length === 0) {
            return null;
        }

        return (
            pinnedMessages.find(
                (message) => message.message_id === activePinnedMessageId
            ) ?? pinnedMessages[0]
        );
    }, [activePinnedMessageId, pinnedMessages]);

    const selectedMessage = messages.find((m) => selectedMessageIds.has(m.message_id));
    const isSelectedMessageStarred = isMessageFlaggedByUser(
        selectedMessage,
        currentUserId,
        "star"
    );
    const isSelectedMessagePinned = isMessageFlaggedByUser(
        selectedMessage,
        currentUserId,
        "pin"
    );

    const activePinnedMessageIndex = useMemo(() => {
        if (!activePinnedMessage) {
            return -1;
        }

        return pinnedMessages.findIndex(
            (message) => message.message_id === activePinnedMessage.message_id
        );
    }, [activePinnedMessage, pinnedMessages]);

    const activePinnedMessageIcon = activePinnedMessage
        ? getPinnedMessageIcon(activePinnedMessage)
        : null;
    const forwardableContacts = useMemo(
        () =>
            [...contacts].sort((left, right) =>
                getContactDisplayName(left).localeCompare(
                    getContactDisplayName(right)
                )
            ),
        [contacts]
    );

    useEffect(() => {
        pinnedMessagesRef.current = pinnedMessages;
        setActivePinnedMessageId((current) => {
            if (pinnedMessages.length === 0) {
                return null;
            }

            return current && pinnedMessages.some((message) => message.message_id === current)
                ? current
                : pinnedMessages[0].message_id;
        });
    }, [pinnedMessages]);

    useEffect(() => {
        activePinnedMessageIdRef.current = activePinnedMessageId;
    }, [activePinnedMessageId]);

    useEffect(() => {
        setPinnedMessages([]);
        setActivePinnedMessageId(null);
    }, [activeChatId]);

    useEffect(() => {
        if (!activeChatId || !currentUserId || !isReady) {
            return;
        }

        let isCancelled = false;

        const fetchPinnedMessages = async () => {
            const response = await fetch(
                `https://web.yahla.org/api/messages?chatRoomId=${encodeURIComponent(activeChatId)}&limit=100&pinnedOnly=true`,
                {
                    cache: "no-store",
                    headers: {
                        Cookie: authClient.getCookie() ?? "",
                    },
                    credentials: "omit",
                }
            );

            if (!response.ok) {
                return;
            }

            const payload = (await response.json()) as {
                messages: RawMessage[];
            };
            const normalizedMessages = payload.messages.map(normalizeMessage);
            const decryptedMessages = await decryptMessageBatch({
                currentUserId,
                messages: normalizedMessages,
            });

            if (!isCancelled) {
                const nextPinnedMessages = sortPinnedMessages(
                    decryptedMessages.filter(
                        (message) =>
                            isMessageFlaggedByUser(message, currentUserId, "pin")
                    )
                );
                setPinnedMessages(nextPinnedMessages);
                setActivePinnedMessageId(
                    (current) =>
                        current && nextPinnedMessages.some((message) => message.message_id === current)
                            ? current
                            : nextPinnedMessages[0]?.message_id ?? null
                );
            }
        };

        void fetchPinnedMessages();

        return () => {
            isCancelled = true;
        };
    }, [activeChatId, currentUserId, isReady, lastPinUpdate]);

    debugChatId('render', {
        routeChatId,
        expoChatId,
        nativeRouteChatId,
        selectedChatId,
        activeChatId,
        isFocused,
        realtimeStatus,
        chatTitle,
        messagesCount: messages.length,
        visibleMessagesCount: visibleMessages.length,
        latestMessage: messages.at(-1) ? summarizeMessageForDebug(messages.at(-1) as Message) : null,
        selectedCount,
        selectionMode,
        previewVisible: { isVisible, isVideoVisible, isFileVisible, isContactVisible },
    });

    useEffect(() => {
        debugChatId('selection-mode-ref-sync', {
            activeChatId,
            selectionMode,
            selectedMessageIds: Array.from(selectedMessageIds),
        });
        selectionModeRef.current = selectionMode;
    }, [activeChatId, selectedMessageIds, selectionMode]);

    useEffect(() => {
        debugChatId('active-chat-state', {
            routeChatId,
            selectedChatId,
            activeChatId,
            activeChatExists: Boolean(activeChat),
            activeChatLastMessageId: activeChat?.last_message_id,
            unread: activeChat?.unreaded_messages_length,
            messagesCount: messages.length,
            firstMessage: messages[0] ? summarizeMessageForDebug(messages[0]) : null,
            lastMessage: messages.at(-1) ? summarizeMessageForDebug(messages.at(-1) as Message) : null,
        });
    }, [activeChat, activeChatId, messages, routeChatId, selectedChatId]);

    useEffect(() => {
        debugChatId('visible-messages-updated', {
            activeChatId,
            count: visibleMessages.length,
            topRenderedMessage: visibleMessages[0] ? summarizeMessageForDebug(visibleMessages[0]) : null,
            bottomRenderedMessage: visibleMessages.at(-1) ? summarizeMessageForDebug(visibleMessages.at(-1) as Message) : null,
        });
    }, [activeChatId, visibleMessages]);

    useFocusEffect(
        useCallback(() => {
            debugChatId('focus-effect-enter', {
                routeChatId,
                selectedChatId: useActiveChatStore.getState().selectedChatId,
                chatsCount: useActiveChatStore.getState().chats.length,
            });
            const focusedChatId =
                resolveCanonicalChatId(
                    routeChatId ?? useActiveChatStore.getState().selectedChatId,
                    useActiveChatStore.getState().chats
                );

            if (!focusedChatId) {
                debugChatId('focus-effect-no-chat', { routeChatId });
                return undefined;
            }

            debugChatId('focus-effect-set-selected', { focusedChatId });
            setSelectedChatId(focusedChatId);

            return () => {
                const state = useActiveChatStore.getState();
                debugChatId('focus-effect-cleanup', {
                    focusedChatId,
                    storeSelectedChatId: state.selectedChatId,
                });

                if (state.selectedChatId === focusedChatId) {
                    debugChatId('focus-effect-clear-selected', { focusedChatId });
                    state.setSelectedChatId(null);
                }
            };
        }, [routeChatId, setSelectedChatId])
    );

    useEffect(() => {
        if (
            !activeChatId ||
            !isFocused ||
            !activeChat ||
            (!activeChat.is_unreaded_chat &&
                (activeChat.unreaded_messages_length ?? 0) === 0)
        ) {
            return;
        }

        const lastMessageUpdatedAt =
            activeChat.updated_at instanceof Date
                ? activeChat.updated_at.getTime()
                : new Date(activeChat.updated_at).getTime();
        const readKey = [
            activeChatId,
            activeChat.last_message_id ?? "conversation",
            Number.isNaN(lastMessageUpdatedAt) ? "unknown" : lastMessageUpdatedAt,
        ].join(":");

        if (lastOpenedChatReadKeyRef.current === readKey) {
            return;
        }

        lastOpenedChatReadKeyRef.current = readKey;
        debugChatId('open-chat-mark-read', {
            activeChatId,
            messageId: activeChat.last_message_id,
            unread: activeChat.unreaded_messages_length,
        });
        markChatReadOptimistically({
            conversationId: activeChatId,
            messageId: activeChat.last_message_id,
        });
    }, [activeChat, activeChatId, isFocused]);

    const latestReadableIncomingMessage = useMemo(
        () => [...messages]
            .reverse()
            .find(
                (message) =>
                    message.sender_user_id !== currentUserId &&
                    hasRenderableMessage(message)
            ) ?? null,
        [currentUserId, messages]
    );

    useEffect(() => {
        if (!activeChatId || !isFocused || !latestReadableIncomingMessage) {
            debugChatId('read-receipt-skip', {
                activeChatId,
                isFocused,
                latestReadableIncomingMessage: latestReadableIncomingMessage
                    ? summarizeMessageForDebug(latestReadableIncomingMessage)
                    : null,
            });
            return;
        }

        const readReceiptKey = `${activeChatId}:${latestReadableIncomingMessage.message_id}`;
        if (lastReadReceiptKeyRef.current === readReceiptKey) {
            debugChatId('read-receipt-dedupe', { readReceiptKey });
            return;
        }

        lastReadReceiptKeyRef.current = readReceiptKey;
        debugChatId('read-receipt-schedule', {
            readReceiptKey,
            message: summarizeMessageForDebug(latestReadableIncomingMessage),
        });
        const timer = window.setTimeout(() => {
            debugChatId('read-receipt-send', {
                activeChatId,
                messageId: latestReadableIncomingMessage.message_id,
            });
            markChatReadOptimistically({
                conversationId: activeChatId,
                messageId: latestReadableIncomingMessage.message_id,
            });
        }, 100);

        return () => {
            debugChatId('read-receipt-clear-timer', { readReceiptKey });
            window.clearTimeout(timer);
        };
    }, [activeChatId, isFocused, latestReadableIncomingMessage]);

    useEffect(() => {
        const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', () => {
            debugChatId('keyboard-show', { activeChatId });
            setKeyboardOffset(-30);
        });
        const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {
            debugChatId('keyboard-hide', { activeChatId });
            setKeyboardOffset(-100);
        });

        return () => {
            debugChatId('keyboard-listeners-cleanup', { activeChatId });
            keyboardDidShowListener.remove();
            keyboardDidHideListener.remove();
        };
    }, [activeChatId]);

    const toggleReactionContainer = () => {
        debugChatId('reaction-toggle', {
            activeChatId,
            nextVisible: !isReactionVisible,
        });
        setIsReactionVisible(prev => !prev);
    };

    const handleLongPress = useCallback((messageId: string) => {
        debugChatId('message-long-press', { activeChatId, messageId });
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        selectionModeRef.current = true;
        setSelectionMode(true);
        setSelectedMessageIds(new Set([messageId]));
    }, [activeChatId]);

    const handleBubblePress = useCallback((messageId: string) => {
        debugChatId('message-press', {
            activeChatId,
            messageId,
            selectionMode: selectionModeRef.current,
        });
        if (!selectionModeRef.current) {
            return;
        }

        setSelectedMessageIds((currentSelection) => {
            const newSelected = new Set(currentSelection);
            if (newSelected.has(messageId)) {
                newSelected.delete(messageId);
                if (newSelected.size === 0) {
                    selectionModeRef.current = false;
                    setSelectionMode(false);
                }
            } else {
                newSelected.add(messageId);
            }
            return newSelected;
        });
    }, [activeChatId]);

    const handleRetryMessage = useCallback((message: Message) => {
        debugChatId('retry-message', {
            activeChatId,
            message: summarizeMessageForDebug(message),
        });
        void retryMessage(message);
    }, [activeChatId, retryMessage]);

    const handleReply = useCallback((
        replyTo: string,
        replyMsg: string | null,
        replayMedia: string | null | undefined,
        replyMediaType: 'photo' | 'video' | 'voice' | 'file' | 'contact' | 'location' | null,
        originalMessageId: string,
        originalSenderUserId: string
    ) => {
        if (!activeChatId) {
            debugChatId('reply-skip-no-active-chat', { originalMessageId });
            return;
        }

        debugChatId('reply-start', {
            activeChatId,
            originalMessageId,
            originalSenderUserId,
            replyTo,
            hasReplyText: Boolean(replyMsg),
            replyMediaType,
            hasReplyMedia: Boolean(replayMedia),
        });
        setReplyToUser('');
        setReplyMessage('');
        setReplyMediaType(null);
        setReplyMediaUrl('');

        setIsReply(true);
        setReplyToUser(replyTo);
        if (replyMsg) {
            setReplyMessage(replyMsg);
        }
        setReplyMediaType(replyMediaType);
        if (replayMedia) {
            setReplyMediaUrl(replayMedia);
        }
        setReplyDraft(activeChatId, {
            original_message_id: originalMessageId,
            original_sender_user_id: originalSenderUserId,
            original_message_text: replyMsg,
            original_attached_media: replyMediaType,
            original_attached_media_url: replayMedia ?? null,
        });
        inputRef.current?.focus();
    }, [activeChatId, setReplyDraft]);

    const handleClearReply = useCallback(() => {
        debugChatId('reply-clear', { activeChatId });
        setIsReply(false);
        setReplyToUser('');
        setReplyMessage('');
        setReplyMediaType(null);
        setReplyMediaUrl('');
        if (activeChatId) {
            clearReplyDraft(activeChatId);
        }
    }, [activeChatId, clearReplyDraft]);

    const handleCancelSelectionMode = useCallback(() => {
        debugChatId('selection-cancel', {
            activeChatId,
            selectedMessageIds: Array.from(selectedMessageIds),
        });
        selectionModeRef.current = false;
        setSelectionMode(false);
        setIsReactionVisible(false);
        setSelectedMessageIds(new Set());
    }, [activeChatId, selectedMessageIds]);

    const handleExitFromChat = () => {
        debugChatId('exit-chat', {
            activeChatId,
            rightNavReady: rightNavRef.isReady(),
        });
        if (rightNavRef.isReady()) {
            rightNavRef.goBack();
            return
        }

        router.dismissAll();
    };

    const setNextPinnedMessageAfter = useCallback((messageId: string) => {
        const currentPinnedMessages = pinnedMessagesRef.current;
        const currentPinnedIndex = currentPinnedMessages.findIndex(
            (message) => message.message_id === messageId
        );

        if (currentPinnedIndex < 0) {
            return;
        }

        const nextPinnedMessage =
            currentPinnedMessages[currentPinnedIndex + 1] ??
            currentPinnedMessages[currentPinnedIndex];

        if (
            nextPinnedMessage &&
            activePinnedMessageIdRef.current !== nextPinnedMessage.message_id
        ) {
            setActivePinnedMessageId(nextPinnedMessage.message_id);
        }
    }, []);

    const tryScrollToMessageId = useCallback((messageId: string) => {
        const messageIndex = messageListItems.findIndex(
            (item) => item.type === "message" && item.message.message_id === messageId
        );

        if (messageIndex < 0) {
            return false;
        }

        try {
            listRef.current?.scrollToIndex({
                index: messageIndex,
                animated: true,
                viewPosition: 0.5,
            });
            return true;
        } catch (error) {
            debugChatId('pinned-scroll-to-index-error', {
                activeChatId,
                messageId,
                messageIndex,
                error,
            });
            return false;
        }
    }, [activeChatId, messageListItems]);

    const loadOlderMessagesForMessageScroll = useCallback(() => {
        if (
            !activeChatId ||
            !hasOlderMessages ||
            olderMessagesLoading ||
            isLoadingPinnedScrollTargetRef.current
        ) {
            return;
        }

        isLoadingPinnedScrollTargetRef.current = true;
        void loadOlderMessages(activeChatId).finally(() => {
            isLoadingPinnedScrollTargetRef.current = false;
        });
    }, [activeChatId, hasOlderMessages, loadOlderMessages, olderMessagesLoading]);

    const completeMessageScrollRequest = useCallback((request: MessageScrollRequest) => {
        if (request.source === "pinned") {
            window.setTimeout(() => setNextPinnedMessageAfter(request.messageId), 350);
        }
    }, [setNextPinnedMessageAfter]);

    const requestMessageScroll = useCallback((messageId: string, source: MessageScrollRequest["source"]) => {
        const request = { messageId, source };
        pendingMessageScrollRequestRef.current = request;
        debugChatId('message-scroll-request', { activeChatId, messageId, source });

        if (tryScrollToMessageId(messageId)) {
            pendingMessageScrollRequestRef.current = null;
            completeMessageScrollRequest(request);
            return;
        }

        loadOlderMessagesForMessageScroll();
    }, [
        activeChatId,
        completeMessageScrollRequest,
        loadOlderMessagesForMessageScroll,
        tryScrollToMessageId,
    ]);

    useEffect(() => {
        const pendingRequest = pendingMessageScrollRequestRef.current;
        if (!pendingRequest) {
            return;
        }

        if (tryScrollToMessageId(pendingRequest.messageId)) {
            pendingMessageScrollRequestRef.current = null;
            completeMessageScrollRequest(pendingRequest);
            return;
        }

        loadOlderMessagesForMessageScroll();
    }, [
        completeMessageScrollRequest,
        loadOlderMessagesForMessageScroll,
        tryScrollToMessageId,
    ]);

    const requestPinnedMessageScroll = useCallback((messageId: string) => {
        requestMessageScroll(messageId, "pinned");
    }, [requestMessageScroll]);

    const handleReplyPreviewPress = useCallback((messageId: string) => {
        void Haptics.selectionAsync();
        requestMessageScroll(messageId, "reply");
    }, [requestMessageScroll]);

    const handlePinnedPress = useCallback(() => {
        if (!activePinnedMessage) {
            return;
        }

        void Haptics.selectionAsync();
        requestPinnedMessageScroll(activePinnedMessage.message_id);
    }, [activePinnedMessage, requestPinnedMessageScroll]);

    const handlePinnedScrollToIndexFailed = useCallback<
        NonNullable<FlatListProps<MessageListItem>["onScrollToIndexFailed"]>
    >((info) => {
        const failedItem = messageListItems[info.index];
        const pendingRequest =
            pendingMessageScrollRequestRef.current ??
            (failedItem?.type === "message"
                ? { messageId: failedItem.message.message_id, source: "pinned" as const }
                : null);

        if (!pendingRequest) {
            return;
        }

        pendingMessageScrollRequestRef.current = pendingRequest;
        window.setTimeout(() => {
            if (tryScrollToMessageId(pendingRequest.messageId)) {
                pendingMessageScrollRequestRef.current = null;
                completeMessageScrollRequest(pendingRequest);
            }
        }, 250);
    }, [completeMessageScrollRequest, messageListItems, tryScrollToMessageId]);

    const handlePinnedViewableItemsChanged = useRef<
        NonNullable<FlatListProps<MessageListItem>["onViewableItemsChanged"]>
    >(({ viewableItems }) => {
        const currentPinnedMessages = pinnedMessagesRef.current;
        if (currentPinnedMessages.length === 0) {
            return;
        }

        const visiblePinnedMessage = viewableItems
            .map((viewableItem) => viewableItem.item)
            .filter(
                (item): item is Extract<MessageListItem, { type: "message" }> =>
                    Boolean(item) && item.type === "message"
            )
            .map((item) => ({
                message: item.message,
                pinnedIndex: currentPinnedMessages.findIndex(
                    (pinnedMessage) =>
                        pinnedMessage.message_id === item.message.message_id
                ),
            }))
            .filter(({ pinnedIndex }) => pinnedIndex >= 0)
            .sort((left, right) => left.pinnedIndex - right.pinnedIndex)[0];

        if (visiblePinnedMessage) {
            setNextPinnedMessageAfter(visiblePinnedMessage.message.message_id);
        }
    }).current;

    const handleLoadOlderMessages = useCallback(() => {
        debugChatId('load-older-request', {
            activeChatId,
            hasStartedMessageScroll: hasStartedMessageScrollRef.current,
            olderMessagesLoading,
            hasOlderMessages,
        });
        if (
            !hasStartedMessageScrollRef.current ||
            !activeChatId ||
            olderMessagesLoading ||
            !hasOlderMessages
        ) {
            return;
        }

        void loadOlderMessages(activeChatId);
    }, [
        activeChatId,
        hasOlderMessages,
        loadOlderMessages,
        olderMessagesLoading,
    ]);

    const handleMessageScroll = useCallback(() => {
        if (!hasStartedMessageScrollRef.current) {
            debugChatId('message-list-first-scroll', { activeChatId });
        }
        hasStartedMessageScrollRef.current = true;
    }, [activeChatId]);

    const handleScroll = useCallback(
        (event: NativeSyntheticEvent<NativeScrollEvent>) => {
            const offsetY = event.nativeEvent.contentOffset.y;
            // In an inverted FlatList, offsetY > 150 means the user is viewing older messages (scrolled up)
            setShowGoDownButton(offsetY > 150);
            handleMessageScroll(); // keep existing scroll logic
        },
        [handleMessageScroll]
    );

    const scrollToBottom = useCallback(() => {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, []);

    const renderCenterBadge = useCallback(
        (label: string) => (
            <ThemedView style={styles.centerBadgeOuter}>
                <ThemedView
                    style={[
                        styles.centerBadge,
                        {
                            backgroundColor:
                                scheme === 'dark' ? '#13181C' : '#fff',
                        },
                    ]}
                >
                    <ThemedText
                        style={[
                            styles.centerBadgeText,
                            { color: colors.textSecondary },
                        ]}
                    >
                        {label}
                    </ThemedText>
                </ThemedView>
            </ThemedView>
        ),
        [colors.textSecondary, scheme]
    );

    const renderMessageItem = useCallback(({ item }: { item: MessageListItem }) => {
        if (item.type === "date") {
            return renderCenterBadge(item.label);
        }

        const { message: rowMessage } = item;
        const eventLabel = getMessageEventLabel(rowMessage, currentUserId);

        if (eventLabel) {
            return renderCenterBadge(eventLabel);
        }

        debugChatId('render-message-item', {
            activeChatId,
            message: summarizeMessageForDebug(rowMessage),
            isSelected: selectedMessageIds.has(rowMessage.message_id),
        });
        const groupMeta =
            messageGroupMetaById.get(rowMessage.message_id) ?? {
                showTail: true,
                isGroupedWithPrevious: false,
                isGroupedWithNext: false,
            };

        return (
            <Bubble
                message={rowMessage}
                currentUserId={currentUserId}
                currentPhone={currentPhone}
                isDark={isDark}
                showTail={groupMeta.showTail}
                isGroupedWithPrevious={groupMeta.isGroupedWithPrevious}
                isGroupedWithNext={groupMeta.isGroupedWithNext}
                isSelected={selectedMessageIds.has(rowMessage.message_id)}
                selectedCount={selectedCount}
                onLongPress={handleLongPress}
                onPress={handleBubblePress}
                onRetryMessage={handleRetryMessage}
                handleReply={handleReply}
                onReplyPress={handleReplyPreviewPress}
                isStarredByCurrentUser={isMessageFlaggedByUser(
                    rowMessage,
                    currentUserId,
                    "star"
                )}
            />
        );
    }, [
        activeChatId,
        currentUserId,
        currentPhone,
        handleBubblePress,
        handleLongPress,
        handleRetryMessage,
        handleReply,
        handleReplyPreviewPress,
        isDark,
        messageGroupMetaById,
        renderCenterBadge,
        selectedCount,
        selectedMessageIds,
    ]);

    const handleOpenProfile = () => {
        debugChatId('open-profile', {
            activeChatId,
            isTablet,
            rightNavReady: rightNavRef.isReady(),
        });

        if (!activeChatId) {
            return;
        }

        if (isTablet && rightNavRef.isReady()) {
            rightNavRef.navigate('targetUserProfile', { chatId: activeChatId });
            return;
        }

        router.navigate({
            pathname: '/targetUserProfile',
            params: { chatId: activeChatId }
        })
    };

    const pressReply = () => {
        const isGroupChat = activeChat?.chat_type === "group";
        const senderGroupMember =
            isGroupChat
                ? activeChat?.group_members?.find(
                    (member) => member.user_id === selectedMessage?.sender_user_id
                ) ?? null
                : null;
        const senderContact =
            findContactByUserId(contacts, selectedMessage?.sender_user_id) ??
            findContactByPhone(contacts, senderGroupMember?.phone_number);
        const senderDisplayName = senderContact
            ? getContactDisplayName(senderContact)
            : senderGroupMember?.name?.trim() || senderGroupMember?.phone_number || "You";
        handleReply(
            senderDisplayName,
            selectedMessage?.message_text_content || null,
            selectedMessage?.media_preview_url,
            selectedMessage?.attached_media || null,
            selectedMessage?.message_id || '',
            selectedMessage?.sender_user_id || ''
        );
    };

    const pressStarMessage = () => {
        if (selectedMessageIds.size === 0) {
            return;
        }

        const selectedMessages = messages.filter(m =>
            selectedMessageIds.has(m.message_id)
        );

        const anyUnstarred = selectedMessages.some(m =>
            !m.user_ids_star_it?.includes(currentUserId || '')
        );

        selectedMessages.forEach(message => {
            void starMessage(message, anyUnstarred);
        });
    };

    const pressPinMessage = () => {
        if (!currentUserId || selectedMessageIds.size !== 1 || !selectedMessage) {
            return;
        }

        const shouldPin = !isSelectedMessagePinned;

        if (
            shouldPin &&
            !pinnedMessages.some(
                (message) => message.message_id === selectedMessage.message_id
            ) &&
            pinnedMessages.length >= 2
        ) {
            return;
        }

        const previousPinnedMessages = pinnedMessages;
        const nextPinnedMessages = shouldPin
            ? sortPinnedMessages([
                ...pinnedMessages.filter(
                    (message) => message.message_id !== selectedMessage.message_id
                ),
                selectedMessage,
            ])
            : pinnedMessages.filter(
                (message) => message.message_id !== selectedMessage.message_id
            );

        setPinnedMessages(nextPinnedMessages);

        void pinMessage(selectedMessage, shouldPin).then((success) => {
            if (!success) {
                setPinnedMessages(previousPinnedMessages);
            }
        });
    };

    const pressReaction = (reactionEmoji: string) => {
        if (selectedMessageIds.size !== 1 || !selectedMessage) {
            return;
        }

        void Haptics.selectionAsync();
        setIsReactionVisible(false);
        selectionModeRef.current = false;
        setSelectionMode(false);
        setSelectedMessageIds(new Set());
        void reactToMessage(selectedMessage, reactionEmoji);
    };

    const openForwardOverlay = () => {
        if (selectedMessageIds.size === 0) {
            return;
        }

        setIsReactionVisible(false);
        setSelectedForwardContactIds(new Set());
        setIsForwardVisible(true);
    };

    const closeForwardOverlay = () => {
        if (isForwarding) {
            return;
        }

        setIsForwardVisible(false);
        setSelectedForwardContactIds(new Set());
    };

    const toggleForwardContact = (contact: Contact) => {
        if (!contact.linked_user_id || !contact.linked_user_public_key) {
            return;
        }

        setSelectedForwardContactIds((currentSelection) => {
            const nextSelection = new Set(currentSelection);

            if (nextSelection.has(contact.contact_id)) {
                nextSelection.delete(contact.contact_id);
            } else {
                nextSelection.add(contact.contact_id);
            }

            return nextSelection;
        });
    };

    const submitForwardMessages = async () => {
        if (
            !currentUserId ||
            !currentPhone ||
            selectedMessageIds.size === 0 ||
            selectedForwardContactIds.size === 0
        ) {
            return;
        }

        const messagesToForward = messages.filter((message) =>
            selectedMessageIds.has(message.message_id)
        );
        const targetContacts = contacts.filter(
            (contact) =>
                selectedForwardContactIds.has(contact.contact_id) &&
                contact.linked_user_id &&
                contact.linked_user_public_key
        );
        const targetChatIds = targetContacts.map((contact) => {
            const chatId = buildDirectChatId(currentPhone, contact.contact_number);
            const existingChat =
                chats.find((chat) => chat.chat_id === chatId) ??
                chats.find((chat) => areDirectChatIdsEquivalent(chat.chat_id, chatId)) ??
                null;

            upsertChat(
                buildForwardTargetChat({
                    contact,
                    currentPhone,
                    currentUserId,
                    existingChat,
                })
            );

            return chatId;
        });

        const didForward = await forwardMessages({
            messages: messagesToForward,
            targetChatIds,
        });

        if (didForward) {
            setIsForwardVisible(false);
            setSelectedForwardContactIds(new Set());
            selectionModeRef.current = false;
            setSelectionMode(false);
            setSelectedMessageIds(new Set());
        }
    };

    const renderForwardContact = ({ item }: { item: Contact }) => {
        const isSelected = selectedForwardContactIds.has(item.contact_id);
        const isDisabled = !item.linked_user_id || !item.linked_user_public_key;
        const displayName = getContactDisplayName(item) || item.contact_number;

        return (
            <Pressable
                disabled={isDisabled || isForwarding}
                onPress={() => toggleForwardContact(item)}
                style={({ pressed }) => [
                    styles.forwardContactRow,
                    {
                        opacity: isDisabled ? 0.45 : pressed ? 0.75 : 1,
                        backgroundColor: colors.background,
                    },
                ]}
            >
                <ChatAvatar
                    userId={item.linked_user_id ?? item.contact_number}
                    imageUrl={item.contact_avatar}
                    displayName={displayName}
                    contactPhone={item.contact_number}
                    style={styles.forwardContactAvatar}
                    iconColor={colors.text}
                    backgroundColor={colors.card}
                    textColor={colors.text}
                    chatType="single"
                />
                <ThemedView style={styles.forwardContactTextContainer}>
                    <ThemedText numberOfLines={1} style={styles.forwardContactName}>
                        {displayName}
                    </ThemedText>
                    <ThemedText
                        numberOfLines={1}
                        style={[styles.forwardContactPhone, { color: colors.textSecondary }]}
                    >
                        {isDisabled ? "Unavailable" : item.contact_number}
                    </ThemedText>
                </ThemedView>
                <Icon
                    source={
                        isSelected
                            ? "checkbox-marked-circle"
                            : "checkbox-blank-circle-outline"
                    }
                    color={isSelected ? "#25D366" : colors.textSecondary}
                    size={26}
                />
            </Pressable>
        );
    };

    return (
        <>
            <KeyboardAvoidingView
                behavior={'height'}
                keyboardVerticalOffset={keyboardOffset}
                style={{ flex: 1 }}>
            <Appbar.Header
                style={{
                    backgroundColor: colors.background,
                    paddingHorizontal: 16,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.indicator + '33'
                }}
            >
                {selectionMode ? (
                    <>
                        <Appbar.BackAction onPress={handleCancelSelectionMode} />
                        <Appbar.Content title={<ThemedText>{selectedMessageIds.size}</ThemedText>} />
                        <Appbar.Action icon={() => <ForwardIcon color={colors.text} size={24} />} onPress={openForwardOverlay} />
                        {selectedMessageIds.size < 2 && (
                            <>
                                <Appbar.Action icon={isSelectedMessageStarred ? "star" : "star-outline"} onPress={pressStarMessage} color={colors.text} />
                                {(isSelectedMessagePinned || pinnedMessages.length < 2) && (
                                    <Appbar.Action
                                        icon={isSelectedMessagePinned ? "pin-off-outline" : "pin-outline"}
                                        onPress={pressPinMessage}
                                        color={colors.text}
                                    />
                                )}
                                <Appbar.Action icon="emoticon-outline" onPress={toggleReactionContainer} color={colors.text} />
                                <Appbar.Action icon="arrow-u-left-top" onPress={pressReply} color={colors.text} />
                            </>
                        )}
                    </>
                ) : (
                    <>
                        <Appbar.BackAction onPress={handleExitFromChat} />
                        <Appbar.Content
                            style={styles.appbarContent}
                            title={
                                <TouchableRipple
                                    key={activeChat?.chat_id}
                                    style={styles.profilePressable}
                                    rippleColor={colors.textSecondary + '33'}
                                    underlayColor={colors.textSecondary + '22'}
                                    background={{ type: 'ripple', color: colors.textSecondary + '33', foreground: true }}
                                    onPress={handleOpenProfile}>
                                    <ThemedView style={styles.profileContainer}>
                                        <ChatAvatar
                                            userId={
                                                activeChat?.recipient_user_id ??
                                                activeChat?.chat_id ??
                                                activeChatId
                                            }
                                            imageUrl={activeChat?.avatar}
                                            displayName={chatTitle}
                                            contactPhone={activeChat?.contact_phone}
                                            style={styles.avatar}
                                            iconColor={avatarTint}
                                            backgroundColor={colors.card}
                                            textColor={avatarTint}
                                            chatType={activeChat?.chat_type}
                                        />
                                        <ThemedView style={styles.profileTextContainer}>
                                            <ThemedText
                                                numberOfLines={1}
                                                ellipsizeMode="tail"
                                                style={styles.profileTitle}
                                            >
                                                {chatTitle}
                                            </ThemedText>
                                            {chatHeaderSubtitle ? (
                                                <ThemedText
                                                    numberOfLines={1}
                                                    ellipsizeMode="tail"
                                                    style={[
                                                        styles.profileSubtitle,
                                                        { color: chatHeaderSubtitle.color },
                                                    ]}
                                                >
                                                    {chatHeaderSubtitle.text}
                                                </ThemedText>
                                            ) : null}
                                        </ThemedView>
                                    </ThemedView>
                                </TouchableRipple>
                            }
                        />
                        {isRealtimeConnecting && (
                            <ThemedView style={styles.headerConnectionIndicator}>
                                <ActivityIndicator size="small" color={avatarTint} />
                            </ThemedView>
                        )}
                    </>
                )}
            </Appbar.Header>
            <Modal
                animationType="slide"
                visible={isForwardVisible}
                onRequestClose={closeForwardOverlay}
            >
                <ThemedView style={[styles.forwardOverlay, { backgroundColor: colors.background }]}>
                    <Appbar.Header
                        style={[
                            styles.forwardHeader,
                            {
                                backgroundColor: colors.background,
                                borderBottomColor: colors.indicator + '33',
                            },
                        ]}
                    >
                        <Appbar.BackAction
                            onPress={closeForwardOverlay}
                            disabled={isForwarding}
                        />
                        <Appbar.Content
                            title={
                                <ThemedText>
                                    Forward to
                                    {selectedForwardContactIds.size > 0
                                        ? ` ${selectedForwardContactIds.size}`
                                        : ""}
                                </ThemedText>
                            }
                        />
                        {isForwarding ? (
                            <ActivityIndicator size="small" color="#25D366" />
                        ) : (
                            <Appbar.Action
                                icon="send"
                                color={
                                    selectedForwardContactIds.size > 0
                                        ? "#25D366"
                                        : colors.textSecondary
                                }
                                disabled={selectedForwardContactIds.size === 0}
                                onPress={submitForwardMessages}
                            />
                        )}
                    </Appbar.Header>
                    <FlatList
                        data={forwardableContacts}
                        keyExtractor={(item) => item.contact_id}
                        renderItem={renderForwardContact}
                        contentContainerStyle={styles.forwardContactsContent}
                        keyboardShouldPersistTaps="handled"
                        ListEmptyComponent={
                            <ThemedView style={styles.forwardEmptyContainer}>
                                <ThemedText style={{ color: colors.textSecondary }}>
                                    No contacts available
                                </ThemedText>
                            </ThemedView>
                        }
                    />
                </ThemedView>
            </Modal>
            {isReactionVisible && (
                <ThemedView style={{ paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly' }}>
                    {reactions.map((r) => (
                        <Pressable key={r.key} onPress={() => pressReaction(r.label)}>
                            <ThemedText style={{ fontSize: 24 }}>{r.label}</ThemedText>
                        </Pressable>
                    ))}
                </ThemedView>
            )}
            {activePinnedMessage && (
                <Pressable
                    accessibilityRole="button"
                    onPress={handlePinnedPress}
                    style={({ pressed }) => [
                        styles.pinnedBanner,
                        {
                            backgroundColor: colors.background,
                            borderBottomColor: colors.indicator + '33',
                            opacity: pressed ? 0.78 : 1,
                        },
                    ]}
                >
                    <ThemedView style={styles.pinnedBannerContent}>
                        <ThemedView style={styles.pinnedBarsContainer}>
                            {pinnedMessages.map((message, index) => (
                                <ThemedView
                                    key={message.message_id}
                                    style={[
                                        styles.pinnedBar,
                                        {
                                            backgroundColor:
                                                index === activePinnedMessageIndex
                                                    ? '#25D366'
                                                    : colors.textSecondary + '70',
                                        },
                                    ]}
                                />
                            ))}
                        </ThemedView>
                        <ThemedView style={[styles.pinnedPinIcon, { backgroundColor: colors.card }]}>
                            <Icon
                                source="pin-outline"
                                color={colors.textSecondary}
                                size={22}
                            />
                        </ThemedView>
                        {activePinnedMessageIcon && (
                            <Icon
                                source={activePinnedMessageIcon}
                                color={colors.textSecondary}
                                size={18}
                            />
                        )}
                        <ThemedText
                            numberOfLines={1}
                            style={[styles.pinnedMessageText, { color: colors.text }]}
                        >
                            {getPinnedMessageLabel(activePinnedMessage)}
                        </ThemedText>
                    </ThemedView>
                </Pressable>
            )}
            <TiledBackground source={isDark ? require('@/assets/bg-pattern-dark.png') : require('@/assets/bg-pattern-light.png')} style={styles.background}>
                <FlatList
                    ref={listRef}
                    data={messageListItems}
                    keyExtractor={(item) => item.id}
                    renderItem={renderMessageItem}
                    inverted
                    contentContainerStyle={styles.messagesContent}
                    contentInsetAdjustmentBehavior="automatic"
                    keyboardShouldPersistTaps="handled"
                    onScroll={handleScroll}
                    scrollEventThrottle={32}
                    onScrollToIndexFailed={handlePinnedScrollToIndexFailed}
                    onViewableItemsChanged={handlePinnedViewableItemsChanged}
                    viewabilityConfig={pinnedViewabilityConfigRef.current}
                    initialNumToRender={18}
                    maxToRenderPerBatch={10}
                    updateCellsBatchingPeriod={32}
                    windowSize={7}
                    removeClippedSubviews={Platform.OS === 'android'}
                    onEndReached={handleLoadOlderMessages}
                    onEndReachedThreshold={0.25}
                    ListFooterComponent={
                        <ThemedView style={styles.centerBadgeOuter}>
                            <ThemedView style={[styles.centerBadge, { backgroundColor: scheme === 'dark' ? '#13181C' : '#fff' }]}>
                                <Icon
                                    source="lock-check-outline"
                                    color="#25D366"
                                    size={16}
                                />
                                <ThemedText style={[styles.centerBadgeText, { color: colors.textSecondary }]}>
                                    All of your messages are end-to-end encrypted.
                                </ThemedText>
                            </ThemedView>
                        </ThemedView>
                    }
                />
                <ChatInputContainer
                    chatId={activeChatId}
                    isReply={isReply}
                    handleClearReply={handleClearReply}
                    replyMessage={replyMessage}
                    replyToUser={replyToUser}
                    replyMediaUrl={replyMediaUrl}
                    replyMediaType={replyMediaType}
                    inputRef={inputRef}
                />
                {showGoDownButton && (
                    <ThemedView style={styles.goDownButtonContainer}>
                        <Animated.View
                            key={'go-down-button'}
                            entering={ZoomIn.duration(150)}
                            exiting={ZoomOut.duration(150)}
                            style={[{ backgroundColor: 'transparent' }]}>
                            <IconButton
                                icon="chevron-double-down"
                                iconColor={colors.textSecondary}
                                containerColor={colors.card}
                                size={18}
                                onPress={scrollToBottom}
                            />
                        </Animated.View>
                    </ThemedView>
                )}
            </TiledBackground>
            </KeyboardAvoidingView>
            <Modal
                visible={isFileVisible}
                animationType="none"
                presentationStyle="fullScreen"
                hardwareAccelerated
                onRequestClose={hideFilePreview}
                onDismiss={hideFilePreview}
            >
                {isFileVisible ? <FilePreviewBeforeSent /> : null}
            </Modal>
            <Modal
                visible={isContactVisible}
                animationType="none"
                presentationStyle="fullScreen"
                hardwareAccelerated
                onRequestClose={hideContactPreview}
                onDismiss={hideContactPreview}
            >
                {isContactVisible ? <ContactPreviewBeforeSent /> : null}
            </Modal>
            <Modal
                visible={isVisible}
                animationType="none"
                presentationStyle="fullScreen"
                hardwareAccelerated
                onRequestClose={hideImagePreview}
                onDismiss={hideImagePreview}
            >
                {isVisible ? <ImagePreviewBeforeSent /> : null}
            </Modal>
            <Modal
                visible={isVideoVisible}
                animationType="none"
                presentationStyle="fullScreen"
                hardwareAccelerated
                onRequestClose={hideVideoPreview}
                onDismiss={hideVideoPreview}
            >
                {isVideoVisible ? <VideoPreviewBeforeSent /> : null}
            </Modal>
        </>
    );
};

export default ChatId

const styles = StyleSheet.create({
    background: {
        flex: 1,
    },
    messagesContent: {
        paddingVertical: 8,
    },
    centerBadgeOuter: {
        backgroundColor: 'transparent',
        paddingHorizontal: 16,
        paddingVertical: 8,
        alignItems: 'center',
    },
    centerBadge: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 10,
        maxWidth: '88%',
    },
    centerBadgeText: {
        fontSize: 12,
        lineHeight: 18,
        textAlign: 'left',
    },
    appbarContent: {
        flex: 1,
        minWidth: 0,
    },
    profilePressable: {
        flex: 1,
        minWidth: 0,
    },
    profileContainer: {
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10
    },
    profileTextContainer: {
        flex: 1,
        minWidth: 0,
        backgroundColor: 'transparent',
    },
    profileTitle: {
        fontSize: 16,
        lineHeight: 20,
        fontWeight: '500',
    },
    profileSubtitle: {
        marginTop: 1,
        fontSize: 12,
        lineHeight: 16,
    },
    headerConnectionIndicator: {
        width: 40,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
    },
    forwardOverlay: {
        flex: 1,
    },
    forwardHeader: {
        borderBottomWidth: 1,
    },
    forwardContactsContent: {
        paddingVertical: 8,
    },
    forwardContactRow: {
        minHeight: 68,
        paddingHorizontal: 18,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    forwardContactAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
    },
    forwardContactTextContainer: {
        flex: 1,
        minWidth: 0,
        backgroundColor: 'transparent',
    },
    forwardContactName: {
        fontSize: 16,
        lineHeight: 20,
        fontWeight: '500',
    },
    forwardContactPhone: {
        marginTop: 3,
        fontSize: 13,
        lineHeight: 16,
    },
    forwardEmptyContainer: {
        paddingVertical: 40,
        alignItems: 'center',
        backgroundColor: 'transparent',
    },
    pinnedBanner: {
        paddingVertical: 9,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
    },
    pinnedBannerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        minHeight: 34,
        backgroundColor: 'transparent',
    },
    pinnedBarsContainer: {
        width: 18,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        backgroundColor: 'transparent',
        flexDirection: 'column-reverse'
    },
    pinnedBar: {
        width: 2,
        height: 8,
        borderRadius: 999,
    },
    pinnedPinIcon: {
        width: 34,
        height: 34,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    pinnedMessageText: {
        flex: 1,
        minWidth: 0,
        fontSize: 14,
        lineHeight: 18,
        fontWeight: '500',
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 25,
        alignItems: 'center',
        justifyContent: 'center',
    },
    goDownButtonContainer: {
        position: 'absolute',
        bottom: 110,
        right: 16,
        zIndex: 99,
        backgroundColor: 'transparent'
    }
})
