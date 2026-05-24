import { ChatAvatar } from '@/components/decrypted-chat-avatar'
import { SmallDecryptedMediaImage } from '@/components/small-decrypted-image-preview'
import { SmallVideoMessagePreview } from '@/components/small-decrypted-video-preview'
import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { Colors, Fonts } from '@/constants/theme'
import { useCryptoKeys } from '@/context/crypto'
import { useIsTablet } from '@/context/screen-checking-context'
import { formatPhoneNumber } from '@/helper/phone-formatter'
import { useToggleChatNotifications } from '@/hooks/toggle-chat-notification'
import { authClient } from '@/lib/auth-client'
import type { AvatarSource } from '@/lib/avatar-source'
import { encryptTextForRecipients } from '@/lib/chat-e2ee'
import { getDecryptedDbVisualMediaMessagesForChat } from '@/lib/chat-sync'
import { applyContactToSingleChat, normalizeChatItem } from '@/lib/chat-utils'
import { encryptContactPayload } from '@/lib/contact-crypto'
import { findContactByPhone, findContactByUserId, getContactDisplayName } from '@/lib/contact-display'
import { hydrateLocalContacts } from '@/lib/contact-sync'
import { phoneValuesMatch } from '@/lib/contact-utils'
import { createUploadFileFromLocalUri } from '@/lib/local-upload-file'
import { isLocalMediaUri, isMessageMediaSafeForJsDecrypt, materializeMessageMedia } from '@/lib/message-media'
import { uploadEncryptedMessageMedia } from '@/lib/message-media-upload'
import { deleteDbChat, upsertDbChats } from '@/lib/upsert-db-chats'
import { upsertDbContacts } from '@/lib/upsert-db-contacts'
import { upsertDbMessages } from '@/lib/upsert-db-messages'
import { rightNavRef } from '@/store/right-nav-ref'
import { useActiveChatStore } from '@/store/use-active-chat-store'
import { useContactDirectoryStore } from '@/store/use-contact-directory-store'
import type { ChatGroupMember, ChatItemType } from '@/types/chats.type'
import type { Contact, StoredContactRecord } from '@/types/contacts.type'
import { Message } from '@/types/messages'
import { BasicAlertDialog, Column, Button as ComposeButton, Text as ComposeText, Host, Row, Spacer, Surface, TextButton } from '@expo/ui/jetpack-compose'
import { clip, fillMaxWidth, height, padding, Shapes, width, wrapContentHeight, wrapContentWidth } from '@expo/ui/jetpack-compose/modifiers'
import { StackActions, useRoute } from '@react-navigation/native'
import * as ImagePicker from 'expo-image-picker'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, FlatList, Modal, Pressable, StyleSheet, useColorScheme, View } from 'react-native'
import { ScrollView } from 'react-native-gesture-handler'
import { ActivityIndicator, Appbar, Checkbox, HelperText, Icon, IconButton, List, Menu, Searchbar, Switch, TextInput, TouchableRipple } from 'react-native-paper'

function isVisualMediaMessage(message: Message) {
    return (
        (message.attached_media === "photo" ||
            message.attached_media === "video") &&
        Boolean(message.media_url || message.media_preview_url)
    );
}

const getFileExtension = (
    fileName?: string | null,
    mimeType?: string | null
) => {
    const extension = fileName?.split(".").pop()?.toUpperCase();
    if (extension && extension !== fileName?.toUpperCase()) {
        return extension;
    }

    return mimeType?.split("/").pop()?.toUpperCase() ?? null;
};

const formatAudioTime = (seconds?: number | null) => {
    if (!seconds || !Number.isFinite(seconds) || seconds < 0) {
        return "0:00";
    }

    const roundedSeconds = Math.floor(seconds);
    const hours = Math.floor(roundedSeconds / 3600);
    const minutes = Math.floor((roundedSeconds % 3600) / 60);
    const remainingSeconds = roundedSeconds % 60;

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
    }

    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
};

function mergeProfileMediaSource(
    existingSource?: string | null,
    incomingSource?: string | null
) {
    if (incomingSource && isLocalMediaUri(incomingSource)) {
        return incomingSource;
    }

    if (existingSource && isLocalMediaUri(existingSource)) {
        return existingSource;
    }

    return incomingSource ?? existingSource ?? null;
}

function mergeProfileMediaMessage(
    existingMessage: Message | undefined,
    incomingMessage: Message
) {
    if (!existingMessage) {
        return incomingMessage;
    }

    return {
        ...existingMessage,
        ...incomingMessage,
        media_url: mergeProfileMediaSource(
            existingMessage.media_url,
            incomingMessage.media_url
        ),
        media_preview_url: mergeProfileMediaSource(
            existingMessage.media_preview_url,
            incomingMessage.media_preview_url
        ),
        video_thumbnail: mergeProfileMediaSource(
            existingMessage.video_thumbnail,
            incomingMessage.video_thumbnail
        ),
        media_object_key:
            incomingMessage.media_object_key ?? existingMessage.media_object_key,
        media_preview_object_key:
            incomingMessage.media_preview_object_key ??
            existingMessage.media_preview_object_key,
        encrypted_media:
            incomingMessage.encrypted_media ?? existingMessage.encrypted_media,
    };
}

function mergeProfileMediaMessages(
    cachedMediaMessages: Message[],
    liveMessages: Message[]
) {
    const mergedById = new Map<string, Message>();

    for (const message of cachedMediaMessages) {
        mergedById.set(message.message_id, message);
    }

    for (const message of liveMessages) {
        if (!isVisualMediaMessage(message)) {
            continue;
        }

        mergedById.set(
            message.message_id,
            mergeProfileMediaMessage(mergedById.get(message.message_id), message)
        );
    }

    return [...mergedById.values()];
}

function contactToGroupMember(contact: Contact): ChatGroupMember | null {
    if (!contact.linked_user_id) {
        return null;
    }

    return {
        user_id: contact.linked_user_id,
        phone_number: contact.contact_number,
        public_key: contact.linked_user_public_key ?? null,
        name: getContactDisplayName(contact),
        avatar: contact.contact_avatar ?? null,
        is_admin: false,
    };
}

function mergeGroupMembers(
    currentMembers: ChatGroupMember[],
    addedMembers: ChatGroupMember[]
) {
    const membersById = new Map<string, ChatGroupMember>();

    for (const member of currentMembers) {
        membersById.set(member.user_id, member);
    }

    for (const member of addedMembers) {
        membersById.set(member.user_id, {
            ...membersById.get(member.user_id),
            ...member,
        });
    }

    return [...membersById.values()];
}

function groupMembersMatchIntent(
    actualMembers?: ChatGroupMember[] | null,
    expectedMembers?: ChatGroupMember[] | null
) {
    if (!actualMembers || !expectedMembers) {
        return false;
    }

    if (actualMembers.length !== expectedMembers.length) {
        return false;
    }

    const actualById = new Map(
        actualMembers.map((member) => [member.user_id, member])
    );

    return expectedMembers.every((expectedMember) => {
        const actualMember = actualById.get(expectedMember.user_id);

        return (
            Boolean(actualMember) &&
            Boolean(actualMember?.is_admin) === Boolean(expectedMember.is_admin)
        );
    });
}

const EMPTY_MESSAGES: Message[] = [];
const EMPTY_GROUP_MEMBERS: ChatGroupMember[] = [];
const API_BASE_URL = "https://web.yahla.org";

type RawChatItem = Omit<ChatItemType, "avatar" | "created_at" | "updated_at" | "group_members"> & {
    avatar?: AvatarSource;
    group_members?: (Omit<ChatGroupMember, "avatar"> & {
        avatar?: AvatarSource;
    })[] | null;
    created_at: string | Date;
    updated_at: string | Date;
};

type ChatPatchResponse = {
    chat?: RawChatItem;
    error?: string;
};

type ContactPatchResponse = {
    contact?: StoredContactRecord;
    contacts?: StoredContactRecord[];
    error?: string;
};

function splitFullName(value: string) {
    const parts = value.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
    const firstName = parts.shift() ?? "";

    return {
        firstName,
        lastName: parts.join(" "),
    };
}

type MediaItemProps = {
    message: Message;
    isDark: boolean;
    activeChatGroupMembers?: ChatGroupMember[] | null;
    contacts: Contact[];
    currentUserId: string | null;
    formatBytes: (bytes?: number | null) => string | null;
    isGroupChat: boolean;
    onMessageUpdated?: (message: Message) => void;
};

function MediaItem({
    message,
    isDark,
    activeChatGroupMembers,
    contacts,
    currentUserId,
    formatBytes,
    isGroupChat,
    onMessageUpdated,
}: MediaItemProps) {
    const hasLocalFullMedia = isLocalMediaUri(message.media_url);
    const photoSource = message.media_url ?? null;
    const previewObjectKey =
        message.media_preview_object_key ?? message.encrypted_media?.preview_object_key ?? null;
    const photoPreviewSource = message.media_preview_url ?? previewObjectKey;
    const shouldShowMediaDownloadOverlay =
        (message.attached_media === "photo" || message.attached_media === "video") &&
        Boolean(message.media_url) &&
        !hasLocalFullMedia;
    const canDownloadFullMedia = isMessageMediaSafeForJsDecrypt(message);
    const fileSize = message.media_size_bytes ?? message.client_local_media_size ?? null;
    const fileName =
        message.media_file_name ??
        message.client_local_media_name ??
        message.media_url?.split("?")[0].split("/").filter(Boolean).pop() ??
        "File";
    const fileExtension = getFileExtension(fileName, message.client_local_media_mime_type);
    const fileDetails = [formatBytes(fileSize), fileExtension]
        .filter(Boolean)
        .join(" - ");
    const senderGroupMember =
        isGroupChat
            ? activeChatGroupMembers?.find(
                (member) => member.user_id === message.sender_user_id
            ) ?? null
            : null;
    const senderContact =
        findContactByUserId(contacts, message.sender_user_id) ??
        findContactByPhone(contacts, senderGroupMember?.phone_number);
    const senderDisplayName = senderContact
        ? getContactDisplayName(senderContact)
        : senderGroupMember?.name?.trim() || senderGroupMember?.phone_number || "You";

    const formattedTime = useMemo(
        () => message.created_at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        [message.created_at]
    );
    const videoThumbnailSource =
        message.video_thumbnail ?? message.media_preview_url ?? previewObjectKey;
    const videoPreviewSource =
        message.media_preview_url && message.media_preview_url !== videoThumbnailSource
            ? message.media_preview_url
            : null;
    const canDownloadMediaFromBubble = canDownloadFullMedia;

    const [isDownloading, setIsDownloading] = useState(false);

    useEffect(() => {
        if (
            !currentUserId ||
            hasLocalFullMedia ||
            !message.media_url ||
            (message.attached_media !== "photo" && message.attached_media !== "video")
        ) {
            return;
        }

        let cancelled = false;

        void materializeMessageMedia(message, { downloadFull: false })
            .then((localMessage) => {
                if (
                    cancelled ||
                    localMessage.media_url === message.media_url ||
                    !isLocalMediaUri(localMessage.media_url)
                ) {
                    return;
                }

                useActiveChatStore.getState().updateMessage(
                    localMessage.chat_room_id,
                    localMessage.message_id,
                    () => localMessage
                );
                onMessageUpdated?.(localMessage);
                return upsertDbMessages([localMessage], currentUserId);
            })
            .catch((error) => {
                console.log("Failed to restore cached media:", error);
            });

        return () => {
            cancelled = true;
        };
    }, [currentUserId, hasLocalFullMedia, message, onMessageUpdated]);

    const handleDownloadMedia = useCallback(async () => {
        if (!currentUserId || isDownloading) {
            return;
        }

        setIsDownloading(true);
        try {
            const localMessage = await materializeMessageMedia(message, {
                downloadFull: true,
            });

            useActiveChatStore.getState().updateMessage(
                localMessage.chat_room_id,
                localMessage.message_id,
                () => localMessage
            );
            onMessageUpdated?.(localMessage);
            await upsertDbMessages([localMessage], currentUserId);
        } catch (error) {
            console.log("Failed to download message media:", error);
        } finally {
            setIsDownloading(false);
        }
    }, [currentUserId, isDownloading, message, onMessageUpdated]);

    if (message.attached_media === 'video') {
        return (
            <SmallVideoMessagePreview
                localVideoUri={hasLocalFullMedia ? message.media_url : null}
                source={videoThumbnailSource}
                previewSource={videoPreviewSource}
                isDark={isDark}
                showDownloadOverlay={shouldShowMediaDownloadOverlay}
                isDownloading={isDownloading}
                downloadDetails={
                    canDownloadMediaFromBubble
                        ? fileDetails || formatBytes(message.media_size_bytes)
                        : "Too large"
                }
                onDownload={canDownloadMediaFromBubble ? handleDownloadMedia : undefined}
                message_id={message.message_id}
                senderName={senderDisplayName}
                timeStamp={formattedTime}
                chatId={message.chat_room_id}
                senderUserId={message.sender_user_id}
                messageText={message.message_text_content}
                mediaPreviewUrl={message.media_preview_url}
                formatAudioTime={formatAudioTime}
            />
        )
    }

    return (
        <SmallDecryptedMediaImage
            source={hasLocalFullMedia ? photoSource : null}
            previewSource={photoPreviewSource}
            isDark={isDark}
            showDownloadOverlay={shouldShowMediaDownloadOverlay}
            isDownloading={isDownloading}
            downloadDetails={
                canDownloadFullMedia
                    ? fileDetails || formatBytes(message.media_size_bytes)
                    : "Too large"
            }
            onDownload={canDownloadFullMedia ? handleDownloadMedia : undefined}
            message_id={message.message_id}
            senderName={senderDisplayName}
            timeStamp={formattedTime}
            chatId={message.chat_room_id}
            senderUserId={message.sender_user_id}
            messageText={message.message_text_content}
            mediaPreviewUrl={message.media_preview_url}
        />
    );
}

type InviteContactRowProps = {
    contact: Contact;
    selected: boolean;
    colors: typeof Colors.light | typeof Colors.dark;
    disabled: boolean;
    onToggle: (contact: Contact) => void;
};

function InviteContactRow({
    contact,
    selected,
    colors,
    disabled,
    onToggle,
}: InviteContactRowProps) {
    const displayName = getContactDisplayName(contact);

    return (
        <Pressable
            disabled={disabled}
            style={({ pressed }) => [
                styles.inviteContactItem,
                {
                    backgroundColor: selected
                        ? colors.card
                        : pressed
                            ? colors.indicator + "22"
                            : "transparent",
                    opacity: disabled ? 0.55 : 1,
                },
            ]}
            onPress={() => onToggle(contact)}
        >
            <ChatAvatar
                userId={contact.linked_user_id ?? contact.contact_id}
                imageUrl={contact.contact_avatar}
                displayName={displayName}
                contactPhone={contact.contact_number}
                style={styles.inviteContactAvatar}
                chatType="single"
            />
            <ThemedView style={styles.inviteContactText}>
                <ThemedText numberOfLines={1} style={styles.inviteContactName}>
                    {displayName}
                </ThemedText>
                <ThemedText
                    numberOfLines={1}
                    style={{ color: colors.textSecondary, fontSize: 13 }}
                >
                    {contact.contact_number}
                </ThemedText>
            </ThemedView>
            <Checkbox.Android
                status={selected ? "checked" : "unchecked"}
                color="#25D366"
                uncheckedColor={colors.textSecondary}
            />
        </Pressable>
    );
}

const TargetUserProfile = () => {
    const { data: session } = authClient.useSession()
    const scheme = useColorScheme()
    const resolvedScheme = scheme === 'unspecified' ? 'light' : scheme ?? 'light'
    const colors = Colors[resolvedScheme]
    const isTablet = useIsTablet()
    const currentUserId = session?.user.id ?? null;
    const currentPhone = (session?.user as { phoneNumber?: string | null } | undefined)?.phoneNumber ?? null;
    const currentPublicKey = (session?.user as { yhlaPublicKey?: string | null } | undefined)?.yhlaPublicKey ?? null;
    const { isReady: areCryptoKeysReady } = useCryptoKeys();
    const { isToggling, setChatNotificationsMuted } = useToggleChatNotifications();

    const params = useLocalSearchParams<{
        chatId?: string | string[];
        targetUserId?: string | string[];
        contactNumber?: string | string[];
        displayName?: string | string[];
        avatar?: string | string[];
        publicKey?: string | string[];
    }>();
    const navigationRoute = useRoute();
    const nativeParams = navigationRoute.params as {
        chatId?: string | string[];
        targetUserId?: string | string[];
        contactNumber?: string | string[];
        displayName?: string | string[];
        avatar?: string | string[];
        publicKey?: string | string[];
    } | undefined;
    const nativeChatId = nativeParams?.chatId;
    const expoChatId = Array.isArray(params.chatId) ? params.chatId[0] : params.chatId;
    const nativeRouteChatId = Array.isArray(nativeChatId) ? nativeChatId[0] : nativeChatId;
    const routeChatId = expoChatId ?? nativeRouteChatId;
    const getRouteParam = (
        expoValue?: string | string[],
        nativeValue?: string | string[]
    ) => {
        const resolvedExpoValue = Array.isArray(expoValue) ? expoValue[0] : expoValue;
        const resolvedNativeValue = Array.isArray(nativeValue) ? nativeValue[0] : nativeValue;

        return resolvedExpoValue ?? resolvedNativeValue ?? null;
    };
    const routeTargetUserId = getRouteParam(params.targetUserId, nativeParams?.targetUserId);
    const routeContactNumber = getRouteParam(params.contactNumber, nativeParams?.contactNumber);
    const routeDisplayName = getRouteParam(params.displayName, nativeParams?.displayName);
    const routeAvatar = getRouteParam(params.avatar, nativeParams?.avatar);
    const routePublicKey = getRouteParam(params.publicKey, nativeParams?.publicKey);
    const hasRouteProfileTarget = Boolean(routeTargetUserId || routeContactNumber);
    const selectedChatId = useActiveChatStore((state) => state.selectedChatId);
    const contacts = useContactDirectoryStore((state) => state.contacts);
    const setContacts = useContactDirectoryStore((state) => state.setContacts);
    const chats = useActiveChatStore((state) => state.chats);
    const setSelectedChatId = useActiveChatStore((state) => state.setSelectedChatId);
    const setRecipientPhone = useActiveChatStore((state) => state.setRecipientPhone);
    const openDirectContactChat = useActiveChatStore((state) => state.openDirectContactChat);
    const routeDirectChat = useMemo(
        () =>
            hasRouteProfileTarget
                ? chats.find((chat) =>
                    chat.chat_type === "single" &&
                    (
                        (!!routeTargetUserId && chat.recipient_user_id === routeTargetUserId) ||
                        (!!routeContactNumber && phoneValuesMatch(chat.contact_phone, routeContactNumber))
                    )
                ) ?? null
                : null,
        [chats, hasRouteProfileTarget, routeContactNumber, routeTargetUserId]
    );
    const activeChatId = routeChatId ?? (!hasRouteProfileTarget ? selectedChatId : routeDirectChat?.chat_id ?? null);
    const activeChat = useActiveChatStore((state) =>
        activeChatId
            ? state.chats.find((chat) => chat.chat_id === activeChatId) ?? null
            : null
    );
    const messagesByChatId = useActiveChatStore(
        (state) => state.messagesByChatId
    );
    const removeChat = useActiveChatStore((state) => state.removeChat);
    const upsertChat = useActiveChatStore((state) => state.upsertChat);
    const messages = activeChatId ? messagesByChatId[activeChatId] ?? EMPTY_MESSAGES : EMPTY_MESSAGES;
    const [profileMediaMessages, setProfileMediaMessages] = useState<Message[]>(EMPTY_MESSAGES);
    const [profileMediaChatId, setProfileMediaChatId] = useState<string | null>(null);
    const [isProfileMediaLoading, setIsProfileMediaLoading] = useState(false);
    const mediaContent = useMemo(
        () =>
            mergeProfileMediaMessages(
                profileMediaChatId === activeChatId
                    ? profileMediaMessages
                    : EMPTY_MESSAGES,
                messages
            )
                .filter(isVisualMediaMessage)
                .sort((left, right) => right.created_at.getTime() - left.created_at.getTime()),
        [activeChatId, messages, profileMediaChatId, profileMediaMessages]
    );
    const profileContact = useMemo(
        () =>
            hasRouteProfileTarget
                ? findContactByUserId(contacts, routeTargetUserId) ??
                findContactByPhone(contacts, routeContactNumber)
                : null,
        [contacts, hasRouteProfileTarget, routeContactNumber, routeTargetUserId]
    );
    const profileChatType = activeChat?.chat_type ?? (hasRouteProfileTarget ? "single" : undefined);
    const profilePhone = activeChat?.contact_phone ?? profileContact?.contact_number ?? routeContactNumber ?? null;
    const profileUserId = activeChat?.recipient_user_id ?? profileContact?.linked_user_id ?? routeTargetUserId ?? null;
    const profilePublicKey = activeChat?.recipient_public_key ?? profileContact?.linked_user_public_key ?? routePublicKey ?? null;
    const profileAvatar = activeChat?.avatar || profileContact?.contact_avatar || routeAvatar || "";
    const chatTitle =
        activeChat?.display_name ??
        (profileContact ? getContactDisplayName(profileContact) : null) ??
        routeDisplayName ??
        profilePhone ??
        'Chat';
    const avatarTint = colors.text;
    const isGroupChat = profileChatType === "group";
    const rawGroupMembers = activeChat?.group_members;
    const groupMembers = rawGroupMembers ?? EMPTY_GROUP_MEMBERS;
    const currentMember = groupMembers.find((member) => member.user_id === currentUserId);
    const isCurrentUserAdmin = Boolean(isGroupChat && currentMember?.is_admin);
    const editableContact = useMemo(
        () =>
            profileChatType === "single"
                ? profileContact ??
                findContactByUserId(contacts, activeChat?.recipient_user_id) ??
                findContactByPhone(contacts, activeChat?.contact_phone)
                : null,
        [activeChat?.contact_phone, activeChat?.recipient_user_id, contacts, profileChatType, profileContact]
    );
    const isViewingCurrentUser = Boolean(profileUserId && profileUserId === currentUserId);
    const canEditProfileName = Boolean(activeChat && ((profileChatType === "single" && editableContact) || isCurrentUserAdmin));
    const canEditGroupAvatar = Boolean(profileChatType === "group" && isCurrentUserAdmin);
    const canCreateProfileContact = Boolean(profileChatType === "single" && profilePhone && !editableContact && !isViewingCurrentUser);
    const canMessageProfileContact = Boolean(
        profileChatType === "single" &&
        profilePhone &&
        !isViewingCurrentUser &&
        (!routeDirectChat || routeDirectChat.chat_id !== selectedChatId)
    );
    const groupMemberRows = useMemo(
        () =>
            groupMembers.map((member) => {
                const savedContact =
                    findContactByUserId(contacts, member.user_id) ??
                    findContactByPhone(contacts, member.phone_number);
                const displayName = savedContact
                    ? getContactDisplayName(savedContact)
                    : member.name?.trim() ||
                    formatPhoneNumber(member.phone_number) ||
                    "Unknown member";
                const description = savedContact
                    ? formatPhoneNumber(member.phone_number ?? savedContact.contact_number)
                    : member.user_id === currentUserId
                        ? "You"
                        : null;

                return {
                    member,
                    displayName,
                    description,
                    avatar: savedContact?.contact_avatar || member.avatar || null,
                };
            }),
        [contacts, currentUserId, groupMembers]
    );

    const [isMuted, setIsMuted] = useState(activeChat?.is_muted_chat_notifications || false);
    const [pendingAction, setPendingAction] = useState<string | null>(null);
    const [activeDialog, setActiveDialog] = useState<'delete-chat' | 'exit-group' | null>(null);
    const [isEditingName, setIsEditingName] = useState(false);
    const [nameDraft, setNameDraft] = useState(chatTitle);
    const [profileError, setProfileError] = useState<string | null>(null);
    const [isInviteModalVisible, setIsInviteModalVisible] = useState(false);
    const [isInviteSearchFocus, setIsInviteSearchFocus] = useState(false);
    const [inviteSearchQuery, setInviteSearchQuery] = useState("");
    const [selectedInviteContactIds, setSelectedInviteContactIds] = useState<string[]>([]);
    const [inviteError, setInviteError] = useState<string | null>(null);
    const [memberMenuUserId, setMemberMenuUserId] = useState<string | null>(null);
    const groupMemberUserIds = useMemo(
        () => new Set(groupMembers.map((member) => member.user_id).filter(Boolean)),
        [groupMembers]
    );
    const invitableContacts = useMemo(
        () =>
            contacts.filter(
                (contact) =>
                    Boolean(contact.linked_user_id) &&
                    !groupMemberUserIds.has(contact.linked_user_id as string)
            ),
        [contacts, groupMemberUserIds]
    );
    const filteredInviteContacts = useMemo(() => {
        const query = inviteSearchQuery.trim().toLowerCase();

        if (!query) {
            return invitableContacts;
        }

        return invitableContacts.filter(
            (contact) =>
                getContactDisplayName(contact).toLowerCase().includes(query) ||
                contact.contact_number.includes(inviteSearchQuery)
        );
    }, [inviteSearchQuery, invitableContacts]);
    const selectedInviteContacts = useMemo(
        () =>
            invitableContacts.filter((contact) =>
                selectedInviteContactIds.includes(contact.contact_id)
            ),
        [invitableContacts, selectedInviteContactIds]
    );

    useEffect(() => {
        if (!isEditingName) {
            setNameDraft(chatTitle);
        }
    }, [chatTitle, isEditingName]);

    useEffect(() => {
        setIsEditingName(false);
        setProfileError(null);
        setIsInviteModalVisible(false);
        setIsInviteSearchFocus(false);
        setInviteSearchQuery("");
        setSelectedInviteContactIds([]);
        setInviteError(null);
        setMemberMenuUserId(null);
    }, [activeChatId]);

    useEffect(() => {
        if (!activeChatId || !currentUserId || !areCryptoKeysReady) {
            setProfileMediaMessages(EMPTY_MESSAGES);
            setProfileMediaChatId(null);
            setIsProfileMediaLoading(false);
            return;
        }

        let isCancelled = false;
        setProfileMediaChatId(activeChatId);
        setProfileMediaMessages(EMPTY_MESSAGES);
        setIsProfileMediaLoading(true);

        void getDecryptedDbVisualMediaMessagesForChat({
            chatId: activeChatId,
            currentUserId,
        })
            .then((cachedMediaMessages) => {
                if (!isCancelled) {
                    setProfileMediaChatId(activeChatId);
                    setProfileMediaMessages(cachedMediaMessages);
                }
            })
            .catch((error) => {
                if (isCancelled) {
                    return;
                }

                console.log("Failed to load profile media:", error);
                setProfileMediaChatId(activeChatId);
                setProfileMediaMessages(EMPTY_MESSAGES);
            })
            .finally(() => {
                if (!isCancelled) {
                    setIsProfileMediaLoading(false);
                }
            });

        return () => {
            isCancelled = true;
        };
    }, [activeChatId, areCryptoKeysReady, currentUserId]);

    const handleProfileMediaMessageUpdated = useCallback((updatedMessage: Message) => {
        if (updatedMessage.chat_room_id !== activeChatId) {
            return;
        }

        setProfileMediaChatId(updatedMessage.chat_room_id);
        setProfileMediaMessages((currentMessages) => {
            const existingMessage = currentMessages.find(
                (message) => message.message_id === updatedMessage.message_id
            );

            if (existingMessage) {
                return currentMessages.map((message) =>
                    message.message_id === updatedMessage.message_id
                        ? mergeProfileMediaMessage(message, updatedMessage)
                        : message
                );
            }

            if (!isVisualMediaMessage(updatedMessage)) {
                return currentMessages;
            }

            return [...currentMessages, updatedMessage];
        });
    }, [activeChatId]);

    const resetAfterChatRemoval = () => {
        setActiveDialog(null);

        if (rightNavRef.isReady()) {
            rightNavRef.dispatch(StackActions.popToTop());
        }

        router.dismissAll();
    };

    const handleBack = () => {
        if (isTablet && rightNavRef.isReady()) {
            rightNavRef.goBack()
            return
        }

        router.back()
    }

    const handleToggleNotifications = async () => {
        if (!activeChat?.chat_id || isToggling) {
            return;
        }

        const nextMuted = !isMuted;
        setIsMuted(nextMuted);
        const didSave = await setChatNotificationsMuted(activeChat.chat_id, nextMuted);

        if (!didSave) {
            setIsMuted(!nextMuted);
        }
    };

    const mergeUpdatedChat = useCallback(async (chat: ChatItemType) => {
        const nextChat =
            activeChat && chat.chat_id === activeChat.chat_id
                ? {
                    ...activeChat,
                    ...chat,
                    last_message_context:
                        activeChat.last_message_context || chat.last_message_context,
                    last_message_media:
                        activeChat.last_message_media ?? chat.last_message_media,
                }
                : chat;

        upsertChat(nextChat);
        await upsertDbChats([nextChat]);
    }, [activeChat, upsertChat]);

    const requestGroupMembers = useCallback(async (
        chatId: string,
        method: "POST" | "PATCH" | "DELETE",
        body: Record<string, unknown>
    ) => {
        const response = await fetch(
            `${API_BASE_URL}/api/chats/${encodeURIComponent(chatId)}/members`,
            {
                method,
                headers: {
                    Cookie: authClient.getCookie() ?? "",
                    "Content-Type": "application/json",
                },
                credentials: "omit",
                body: JSON.stringify(body),
            }
        );
        const payload = (await response.json().catch(() => null)) as ChatPatchResponse | null;

        if (!response.ok) {
            throw new Error(payload?.error ?? "Failed to update group members.");
        }

        return payload;
    }, []);

    const buildEncryptedGroupPreviewPayload = useCallback(async (
        nextMembers: ChatGroupMember[],
        previewText = activeChat?.last_message_context?.trim()
    ) => {
        if (!previewText || !currentUserId || !currentPublicKey) {
            return {};
        }

        const recipientsById = new Map<string, string>();
        recipientsById.set(currentUserId, currentPublicKey);

        for (const member of nextMembers) {
            if (member.user_id && member.public_key) {
                recipientsById.set(member.user_id, member.public_key);
            }
        }

        try {
            const encryptedPreview = await encryptTextForRecipients(
                previewText,
                [...recipientsById.entries()].map(([userId, publicKey]) => ({
                    userId,
                    publicKey,
                }))
            );

            return {
                encryptedChatPreview: encryptedPreview.encryptedContent,
                chatPreviewRecipientKeys: encryptedPreview.recipientEncryptionKeys,
            };
        } catch (error) {
            console.log("Failed to encrypt group preview for member update:", error);
            return {};
        }
    }, [activeChat?.last_message_context, currentPublicKey, currentUserId]);

    const applyGroupMemberUpdate = useCallback(async ({
        body,
        fallbackChat,
        method,
    }: {
        body: Record<string, unknown>;
        fallbackChat: ChatItemType;
        method: "POST" | "PATCH" | "DELETE";
    }) => {
        if (!activeChat?.chat_id) {
            return;
        }

        const payload = await requestGroupMembers(activeChat.chat_id, method, body);
        const responseChat = payload?.chat ? normalizeChatItem(payload.chat) : null;
        const shouldUseResponseChat =
            responseChat &&
            groupMembersMatchIntent(
                responseChat.group_members,
                fallbackChat.group_members
            );
        const nextChat = shouldUseResponseChat
            ? responseChat
            : {
                ...(responseChat ?? fallbackChat),
                group_members: fallbackChat.group_members,
                updated_at: responseChat?.updated_at ?? fallbackChat.updated_at,
            };

        await mergeUpdatedChat(nextChat);
    }, [activeChat?.chat_id, mergeUpdatedChat, requestGroupMembers]);

    const handleOpenInviteModal = useCallback(() => {
        if (!isCurrentUserAdmin || pendingAction !== null) {
            return;
        }

        setInviteError(null);
        setInviteSearchQuery("");
        setIsInviteSearchFocus(false);
        setSelectedInviteContactIds([]);
        setIsInviteModalVisible(true);
    }, [isCurrentUserAdmin, pendingAction]);

    const handleCloseInviteModal = useCallback(() => {
        if (pendingAction === "invite") {
            return;
        }

        setIsInviteModalVisible(false);
        setIsInviteSearchFocus(false);
        setInviteSearchQuery("");
        setSelectedInviteContactIds([]);
        setInviteError(null);
    }, [pendingAction]);

    const toggleInviteContact = useCallback((contact: Contact) => {
        if (pendingAction === "invite") {
            return;
        }

        setInviteError(null);
        setSelectedInviteContactIds((currentIds) =>
            currentIds.includes(contact.contact_id)
                ? currentIds.filter((contactId) => contactId !== contact.contact_id)
                : [...currentIds, contact.contact_id]
        );
    }, [pendingAction]);

    const handleInviteSelectedContacts = useCallback(async () => {
        if (!activeChat || !isCurrentUserAdmin || pendingAction !== null) {
            return;
        }

        if (selectedInviteContacts.length === 0) {
            setInviteError("Select at least one contact.");
            return;
        }

        const missingEncryptionContact = selectedInviteContacts.find(
            (contact) => !contact.linked_user_id || !contact.linked_user_public_key
        );

        if (missingEncryptionContact) {
            setInviteError(`${getContactDisplayName(missingEncryptionContact)} has not set up encryption yet.`);
            return;
        }

        const nextMembersToAdd = selectedInviteContacts
            .map(contactToGroupMember)
            .filter((member): member is ChatGroupMember => Boolean(member));
        const nextGroupMembers = mergeGroupMembers(groupMembers, nextMembersToAdd);
        const memberUserIds = nextMembersToAdd.map((member) => member.user_id);

        setPendingAction("invite");
        setInviteError(null);
        setProfileError(null);

        try {
            const encryptedPreviewPayload =
                await buildEncryptedGroupPreviewPayload(nextGroupMembers, "Added to group");
            const fallbackChat: ChatItemType = {
                ...activeChat,
                group_members: nextGroupMembers,
                updated_at: new Date(),
            };

            await applyGroupMemberUpdate({
                method: "POST",
                body: {
                    memberUserIds,
                    ...encryptedPreviewPayload,
                },
                fallbackChat,
            });
            setIsInviteModalVisible(false);
            setIsInviteSearchFocus(false);
            setInviteSearchQuery("");
            setSelectedInviteContactIds([]);
        } catch (error) {
            setInviteError(error instanceof Error ? error.message : "Failed to invite contacts.");
        } finally {
            setPendingAction(null);
        }
    }, [
        activeChat,
        applyGroupMemberUpdate,
        buildEncryptedGroupPreviewPayload,
        groupMembers,
        isCurrentUserAdmin,
        pendingAction,
        selectedInviteContacts,
    ]);

    const handleMakeGroupMemberAdmin = useCallback(async (member: ChatGroupMember) => {
        if (!activeChat || !isCurrentUserAdmin || pendingAction !== null || member.is_admin) {
            return;
        }

        setMemberMenuUserId(null);
        setPendingAction(`admin:${member.user_id}`);
        setProfileError(null);

        try {
            const nextGroupMembers = groupMembers.map((groupMember) =>
                groupMember.user_id === member.user_id
                    ? { ...groupMember, is_admin: true }
                    : groupMember
            );
            const fallbackChat: ChatItemType = {
                ...activeChat,
                group_members: nextGroupMembers,
                updated_at: new Date(),
            };

            await applyGroupMemberUpdate({
                method: "PATCH",
                body: {
                    memberUserId: member.user_id,
                    isAdmin: true,
                },
                fallbackChat,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to make member an admin.";
            setProfileError(message);
            Alert.alert("Could not update member", message);
        } finally {
            setPendingAction(null);
        }
    }, [
        activeChat,
        applyGroupMemberUpdate,
        groupMembers,
        isCurrentUserAdmin,
        pendingAction,
    ]);

    const handleRemoveGroupMember = useCallback(async (member: ChatGroupMember) => {
        if (
            !activeChat ||
            !isCurrentUserAdmin ||
            pendingAction !== null ||
            member.user_id === currentUserId
        ) {
            return;
        }

        setMemberMenuUserId(null);
        setPendingAction(`remove:${member.user_id}`);
        setProfileError(null);

        try {
            const nextGroupMembers = groupMembers.filter(
                (groupMember) => groupMember.user_id !== member.user_id
            );
            const fallbackChat: ChatItemType = {
                ...activeChat,
                group_members: nextGroupMembers,
                updated_at: new Date(),
            };

            await applyGroupMemberUpdate({
                method: "DELETE",
                body: {
                    memberUserId: member.user_id,
                },
                fallbackChat,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to remove member.";
            setProfileError(message);
            Alert.alert("Could not remove member", message);
        } finally {
            setPendingAction(null);
        }
    }, [
        activeChat,
        applyGroupMemberUpdate,
        currentUserId,
        groupMembers,
        isCurrentUserAdmin,
        pendingAction,
    ]);

    const confirmRemoveGroupMember = useCallback((
        member: ChatGroupMember,
        displayName: string
    ) => {
        if (member.user_id === currentUserId) {
            return;
        }

        setMemberMenuUserId(null);
        Alert.alert(
            "Remove member?",
            `Remove ${displayName} from this group?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Remove",
                    style: "destructive",
                    onPress: () => {
                        void handleRemoveGroupMember(member);
                    },
                },
            ]
        );
    }, [currentUserId, handleRemoveGroupMember]);

    const handleEditNamePress = () => {
        if (!canEditProfileName || pendingAction !== null) {
            return;
        }

        setNameDraft(chatTitle);
        setProfileError(null);
        setIsEditingName(true);
    };

    const handleSaveGroupName = async () => {
        if (!activeChat?.chat_id || !isCurrentUserAdmin || pendingAction !== null) {
            return;
        }

        const trimmedName = nameDraft.trim();
        if (!trimmedName) {
            setProfileError("Group name is required.");
            return;
        }

        if (trimmedName === (activeChat.display_name ?? "").trim()) {
            setIsEditingName(false);
            setNameDraft(chatTitle);
            return;
        }

        setPendingAction("name");
        setProfileError(null);

        try {
            const response = await fetch(`${API_BASE_URL}/api/chats/${encodeURIComponent(activeChat.chat_id)}`, {
                method: "PATCH",
                headers: {
                    Cookie: authClient.getCookie() ?? "",
                    "Content-Type": "application/json",
                },
                credentials: "omit",
                body: JSON.stringify({ displayName: trimmedName }),
            });
            const payload = (await response.json().catch(() => null)) as ChatPatchResponse | null;

            if (!response.ok) {
                throw new Error(payload?.error ?? "Failed to update group name.");
            }

            const nextChat = payload?.chat
                ? normalizeChatItem(payload.chat)
                : {
                    ...activeChat,
                    display_name: trimmedName,
                    updated_at: new Date(),
                };

            await mergeUpdatedChat(nextChat);
            setIsEditingName(false);
        } catch (error) {
            setProfileError(error instanceof Error ? error.message : "Failed to update group name.");
        } finally {
            setPendingAction(null);
        }
    };

    const handleSaveContactName = async () => {
        if (!activeChat || activeChat.chat_type !== "single" || pendingAction !== null) {
            return;
        }

        const trimmedName = nameDraft.trim();
        if (!trimmedName) {
            setProfileError("Contact name is required.");
            return;
        }

        if (trimmedName === chatTitle.trim()) {
            setIsEditingName(false);
            setNameDraft(chatTitle);
            return;
        }

        if (!editableContact?.contact_id) {
            setProfileError("This chat is not saved as a contact yet.");
            return;
        }

        if (!areCryptoKeysReady || !currentUserId) {
            setProfileError("Unlock your encryption keys before saving a contact.");
            return;
        }

        const { firstName, lastName } = splitFullName(trimmedName);
        if (!firstName) {
            setProfileError("Contact name is required.");
            return;
        }

        setPendingAction("contact-name");
        setProfileError(null);

        try {
            const encryptedContact = await encryptContactPayload(
                {
                    contact_first_name: firstName,
                    contact_second_name: lastName || undefined,
                    contact_number:
                        editableContact.contact_number ||
                        activeChat.contact_phone ||
                        "",
                    contact_avatar: editableContact.contact_avatar,
                    contact_bio: editableContact.contact_bio,
                },
                currentUserId
            );
            const response = await fetch(`${API_BASE_URL}/api/contacts`, {
                method: "PATCH",
                credentials: "omit",
                headers: {
                    Cookie: authClient.getCookie() ?? "",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    contactId: editableContact.contact_id,
                    encryptedContact,
                }),
            });
            const payload = (await response.json().catch(() => null)) as ContactPatchResponse | null;

            if (!response.ok) {
                throw new Error(payload?.error ?? "Failed to update contact name.");
            }

            const updatedRecords = [
                ...(payload?.contacts ?? []),
                ...(payload?.contact ? [payload.contact] : []),
            ];

            if (updatedRecords.length > 0) {
                await upsertDbContacts(updatedRecords);
                await hydrateLocalContacts({ currentUserId });
            } else {
                const nextContact: Contact = {
                    ...editableContact,
                    contact_first_name: firstName,
                    contact_second_name: lastName || undefined,
                    contact_letter_group: firstName.charAt(0).toUpperCase(),
                };
                setContacts(
                    currentUserId,
                    contacts.map((contact) =>
                        contact.contact_id === editableContact.contact_id
                            ? nextContact
                            : contact
                    )
                );
            }

            const nextChat = applyContactToSingleChat(activeChat, {
                ...editableContact,
                contact_first_name: firstName,
                contact_second_name: lastName || undefined,
            });
            upsertChat(nextChat);
            await upsertDbChats([nextChat]);
            setIsEditingName(false);
        } catch (error) {
            setProfileError(error instanceof Error ? error.message : "Failed to update contact name.");
        } finally {
            setPendingAction(null);
        }
    };

    const handleSaveNamePress = () => {
        if (pendingAction !== null) {
            return;
        }

        if (profileChatType === "group") {
            void handleSaveGroupName();
            return;
        }

        void handleSaveContactName();
    };

    const handleCreateProfileContact = () => {
        if (!profilePhone) {
            return;
        }

        router.push({
            pathname: "/create-new-contact",
            params: { phoneNumber: profilePhone },
        });
    };

    const handleMessageProfileContact = () => {
        if (!profilePhone || isViewingCurrentUser) {
            return;
        }

        let nextChatId = routeDirectChat?.chat_id ?? null;

        if (nextChatId) {
            setSelectedChatId(nextChatId);
            setRecipientPhone(profilePhone);
        } else {
            if (!currentPhone || !currentUserId) {
                setProfileError("Could not open this chat.");
                return;
            }

            nextChatId = openDirectContactChat({
                contact: {
                    contact_id: profileUserId ?? profilePhone,
                    linked_user_id: profileUserId ?? undefined,
                    linked_user_public_key: profilePublicKey ?? undefined,
                    contact_first_name: routeDisplayName || chatTitle || profilePhone,
                    contact_number: profilePhone,
                    contact_avatar: profileAvatar || undefined,
                    contact_letter_group: (routeDisplayName || chatTitle || profilePhone).charAt(0).toUpperCase(),
                },
                currentPhone,
                currentUserId,
            });
        }

        if (isTablet && rightNavRef.isReady()) {
            rightNavRef.navigate("chatId", { chatId: nextChatId });
            return;
        }

        router.navigate({
            pathname: "/chatId",
            params: { chatId: nextChatId },
        });
    };

    const handleAvatarPress = async () => {
        if (!activeChat?.chat_id || !canEditGroupAvatar || pendingAction !== null) {
            return;
        }

        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
            Alert.alert("Permission required", "Please allow access to your photo library.");
            return;
        }

        const picked = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
        });

        if (picked.canceled || !picked.assets[0]) {
            return;
        }

        const recipientsById = new Map<string, string>();
        for (const member of groupMembers) {
            if (member.user_id && member.public_key) {
                recipientsById.set(member.user_id, member.public_key);
            }
        }
        if (currentUserId && currentPublicKey) {
            recipientsById.set(currentUserId, currentPublicKey);
        }

        const recipients = [...recipientsById.entries()].map(([recipientUserId, publicKey]) => ({
            recipientUserId,
            publicKey,
        }));

        if (recipients.length === 0) {
            setProfileError("Group members are missing encryption keys.");
            return;
        }

        const asset = picked.assets[0];
        setPendingAction("avatar");
        setProfileError(null);

        try {
            const file = await createUploadFileFromLocalUri({
                uri: asset.uri,
                fallbackName: asset.fileName ?? `group-avatar-${Date.now()}.jpg`,
                mimeType: asset.mimeType ?? "image/jpeg",
                size: asset.fileSize ?? null,
            });
            const upload = await uploadEncryptedMessageMedia(file, recipients, null);
            const response = await fetch(`${API_BASE_URL}/api/chats/${encodeURIComponent(activeChat.chat_id)}`, {
                method: "PATCH",
                headers: {
                    Cookie: authClient.getCookie() ?? "",
                    "Content-Type": "application/json",
                },
                credentials: "omit",
                body: JSON.stringify({ avatar: upload.mediaUrl }),
            });
            const payload = (await response.json().catch(() => null)) as ChatPatchResponse | null;

            if (!response.ok) {
                throw new Error(payload?.error ?? "Failed to update group avatar.");
            }

            const nextChat = payload?.chat
                ? normalizeChatItem(payload.chat)
                : {
                    ...activeChat,
                    avatar: upload.mediaUrl,
                    updated_at: new Date(),
                };

            await mergeUpdatedChat(nextChat);
        } catch (error) {
            setProfileError(error instanceof Error ? error.message : "Failed to update group avatar.");
        } finally {
            setPendingAction(null);
        }
    };

    const handleToggleBlockUser = async () => {
        if (!activeChat?.chat_id || isGroupChat || pendingAction !== null) {
            return;
        }

        const previousChat = activeChat;
        const nextBlocked = !previousChat.is_blocked_chat;
        const nextChat = {
            ...previousChat,
            is_blocked_chat: nextBlocked,
        };

        setPendingAction("block");
        upsertChat(nextChat);
        void upsertDbChats([nextChat]).catch((error) => {
            console.log("Failed to persist blocked chat locally:", error);
        });

        try {
            const response = await fetch("https://web.yahla.org/api/chats", {
                method: "PATCH",
                headers: {
                    Cookie: authClient.getCookie() ?? "",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    chatId: previousChat.chat_id,
                    isBlocked: nextBlocked,
                }),
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => null) as { error?: string } | null;
                throw new Error(payload?.error ?? "Failed to update blocked setting.");
            }
        } catch (error) {
            upsertChat(previousChat);
            void upsertDbChats([previousChat]).catch((persistError) => {
                console.log("Failed to restore blocked chat locally:", persistError);
            });
            console.log("Failed to update blocked setting:", error);
        } finally {
            setPendingAction(null);
        }
    };

    const handleChatRemove = () => {
        if (pendingAction !== null) {
            return;
        }

        if (activeDialog === 'delete-chat') {
            void handleConfirmDeleteChat();
            return;
        }

        if (activeDialog === 'exit-group') {
            void handleConfirmExitGroup();
        }
    };

    const handleChatRemoveCancel = () => {
        if (pendingAction !== null) {
            return;
        }

        setActiveDialog(null);
    };

    const handleConfirmExitGroup = async () => {
        if (!activeChat?.chat_id || !isGroupChat || pendingAction !== null) {
            return;
        }

        setPendingAction("exit");

        try {
            const response = await fetch(`https://web.yahla.org/api/chats/${encodeURIComponent(activeChat.chat_id)}`, {
                method: "DELETE",
                headers: {
                    Cookie: authClient.getCookie() ?? "",
                },
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => null) as { error?: string } | null;
                throw new Error(payload?.error ?? "Failed to remove chat.");
            }

            try {
                await deleteDbChat(activeChat.chat_id);
            } catch (error) {
                console.log("Failed to remove chat from local database:", error);
            }

            removeChat(activeChat.chat_id);
            resetAfterChatRemoval();
        } catch (error) {
            console.log("Failed to remove chat:", error);
        } finally {
            setPendingAction(null);
        }
    };

    const handleConfirmDeleteChat = async () => {
        if (!activeChat?.chat_id || isGroupChat || pendingAction !== null) {
            return;
        }

        const chat = activeChat;
        const chatId = chat.chat_id;
        setPendingAction("delete");
        removeChat(chatId);

        try {
            const response = await fetch("https://web.yahla.org/api/chats", {
                method: "PATCH",
                headers: {
                    Cookie: authClient.getCookie() ?? "",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    chatId,
                    isDeleted: true,
                }),
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => null) as { error?: string } | null;
                throw new Error(payload?.error ?? "Failed to delete chat.");
            }

            try {
                await deleteDbChat(chatId);
            } catch (error) {
                console.log("Failed to delete chat from local database:", error);
            }

            resetAfterChatRemoval();
        } catch (error) {
            upsertChat(chat);
            console.log("Failed to delete chat:", error);
        } finally {
            setPendingAction(null);
        }
    };

    const isInviteSubmitting = pendingAction === "invite";
    const renderInviteContact = useCallback(
        ({ item }: { item: Contact }) => (
            <InviteContactRow
                contact={item}
                selected={selectedInviteContactIds.includes(item.contact_id)}
                colors={colors}
                disabled={isInviteSubmitting}
                onToggle={toggleInviteContact}
            />
        ),
        [colors, isInviteSubmitting, selectedInviteContactIds, toggleInviteContact]
    );

    const formatBytes = useCallback((bytes?: number | null) => {
        if (!bytes || bytes <= 0) {
            return null;
        }

        const units = ["B", "KB", "MB", "GB"];
        let value = bytes;
        let unitIndex = 0;

        while (value >= 1024 && unitIndex < units.length - 1) {
            value /= 1024;
            unitIndex += 1;
        }

        const formatted = value >= 10 || unitIndex === 0
            ? Math.round(value).toString()
            : value.toFixed(1);

        return `${formatted} ${units[unitIndex]}`;
    }, []);

    return (
        <ThemedView style={styles.main}>
            <Host matchContents style={styles.logoutDialogHost} colorScheme={resolvedScheme}>
                {activeDialog !== null && (
                    <BasicAlertDialog
                        onDismissRequest={handleChatRemoveCancel}
                        properties={{
                            dismissOnBackPress: true,
                            dismissOnClickOutside: true,
                            usePlatformDefaultWidth: true,
                        }}
                    >
                        <Surface
                            color={colors.background}
                            contentColor={colors.text}
                            tonalElevation={6}
                            shadowElevation={8}
                            modifiers={[
                                wrapContentWidth(),
                                wrapContentHeight(),
                                clip(Shapes.RoundedCorner(18)),
                            ]}
                        >
                            <Column modifiers={[padding(22, 20, 22, 18)]}>
                                <ComposeText
                                    color={colors.text}
                                    style={{
                                        typography: 'titleMedium',
                                        fontWeight: '700',
                                    }}
                                >
                                    {activeDialog === 'delete-chat' ? 'Delete this chat?' : 'Exit group?'}
                                </ComposeText>
                                <Spacer modifiers={[height(10)]} />
                                <ComposeText
                                    color={colors.textSecondary}
                                    style={{
                                        typography: 'bodyMedium',
                                        lineHeight: 20,
                                    }}
                                >
                                    {activeDialog === 'delete-chat' ? 'Are you sure you want to delete this chat, all messages will be deleted forever.' : 'Are you sure you want to exit from this group, are messages will be deleted.'}
                                </ComposeText>
                                <Spacer modifiers={[height(22)]} />
                                <Row
                                    horizontalArrangement="end"
                                    verticalAlignment="center"
                                    modifiers={[fillMaxWidth()]}
                                >
                                    <TextButton onClick={handleChatRemoveCancel}>
                                        <ComposeText color={colors.textSecondary}>Cancel</ComposeText>
                                    </TextButton>
                                    <Spacer modifiers={[width(8)]} />
                                    <ComposeButton
                                        onClick={handleChatRemove}
                                        colors={{
                                            containerColor: '#D92D20',
                                            contentColor: '#FFFFFF',
                                        }}
                                    >
                                        {pendingAction !== null ?
                                            <ActivityIndicator color="#FFFFFF" size={'small'} /> :
                                            <ComposeText color="#FFFFFF">{activeDialog === 'delete-chat' ? 'Delete' : 'Exit'}</ComposeText>
                                        }
                                    </ComposeButton>
                                </Row>
                            </Column>
                        </Surface>
                    </BasicAlertDialog>
                )}
            </Host>
            <Appbar.Header style={{ backgroundColor: colors.background }}>
                <Appbar.BackAction onPress={handleBack} />
                <Appbar.Content title="" />
                {canEditProfileName ? (
                    <Appbar.Action
                        icon={isEditingName ? "check" : "pencil"}
                        disabled={pendingAction !== null}
                        onPress={isEditingName ? handleSaveNamePress : handleEditNamePress}
                    />
                ) : null}
            </Appbar.Header>
            <Modal
                animationType="slide"
                visible={isInviteModalVisible}
                onRequestClose={handleCloseInviteModal}
            >
                <ThemedView style={[styles.inviteModal, { backgroundColor: colors.background }]}>
                    <Appbar.Header
                        style={[
                            styles.inviteModalHeader,
                            {
                                backgroundColor: colors.background,
                                borderBottomColor: colors.indicator + "33",
                            },
                        ]}
                    >
                        {isInviteSearchFocus ? (
                            <Searchbar
                                placeholder="Search"
                                onChangeText={setInviteSearchQuery}
                                value={inviteSearchQuery}
                                onIconPress={() => {
                                    setIsInviteSearchFocus(false);
                                    setInviteSearchQuery("");
                                }}
                                icon="arrow-left"
                                autoFocus
                                style={{ backgroundColor: colors.card, flex: 1 }}
                                cursorColor="#25D366"
                            />
                        ) : (
                            <>
                                <Appbar.BackAction
                                    disabled={isInviteSubmitting}
                                    onPress={handleCloseInviteModal}
                                />
                                <Appbar.Content
                                    title="Invite contacts"
                                    subtitle={`${selectedInviteContactIds.length || invitableContacts.length} ${selectedInviteContactIds.length ? "selected" : "contacts"}`}
                                />
                                <Appbar.Action
                                    icon="magnify"
                                    disabled={isInviteSubmitting}
                                    onPress={() => setIsInviteSearchFocus(true)}
                                />
                            </>
                        )}
                    </Appbar.Header>
                    {inviteError ? (
                        <HelperText type="error" visible style={styles.inviteHelperText}>
                            {inviteError}
                        </HelperText>
                    ) : null}
                    <FlatList
                        data={filteredInviteContacts}
                        keyExtractor={(contact) => contact.contact_id}
                        renderItem={renderInviteContact}
                        keyboardShouldPersistTaps="handled"
                        ListHeaderComponent={
                            <ThemedText style={[styles.inviteSectionHeader, { color: colors.textSecondary }]}>
                                CONTACTS
                            </ThemedText>
                        }
                        ListEmptyComponent={
                            <ThemedView style={styles.inviteEmptyContainer}>
                                <ThemedText style={{ color: colors.textSecondary }}>
                                    No contacts available
                                </ThemedText>
                            </ThemedView>
                        }
                        contentContainerStyle={styles.inviteListContent}
                    />
                    {selectedInviteContactIds.length > 0 ? (
                        <Pressable
                            disabled={isInviteSubmitting}
                            style={({ pressed }) => [
                                styles.inviteFab,
                                { opacity: pressed || isInviteSubmitting ? 0.82 : 1 },
                            ]}
                            onPress={handleInviteSelectedContacts}
                        >
                            {isInviteSubmitting ? (
                                <ActivityIndicator size="small" color="#1C1E21" />
                            ) : (
                                <ThemedText style={styles.inviteFabText}>
                                    Invite
                                </ThemedText>
                            )}
                        </Pressable>
                    ) : null}
                </ThemedView>
            </Modal>
            <ScrollView style={{ flex: 1 }}>
                <ThemedView style={styles.topContentContainer}>
                    <Pressable
                        disabled={!canEditGroupAvatar || pendingAction !== null}
                        onPress={handleAvatarPress}
                        style={styles.avatarButton}
                    >
                        <ChatAvatar
                            userId={
                                profileUserId ??
                                activeChat?.chat_id ??
                                activeChatId
                            }
                            imageUrl={profileAvatar}
                            displayName={chatTitle}
                            contactPhone={profilePhone}
                            style={styles.avatar}
                            iconColor={avatarTint}
                            backgroundColor={colors.card}
                            textColor={avatarTint}
                            chatType={profileChatType}
                        />
                        {canEditGroupAvatar ? (
                            pendingAction === "avatar" ? (
                                <View style={styles.avatarOverlay}>
                                    <ActivityIndicator color="#fff" size="small" />
                                </View>
                            ) : (
                                <ThemedView style={[styles.cameraIcon, { backgroundColor: Colors.dark.card }]}>
                                    <Icon
                                        source="camera-plus-outline"
                                        color={Colors.dark.text}
                                        size={24}
                                    />
                                </ThemedView>
                            )
                        ) : null}
                    </Pressable>
                    <ThemedView style={styles.profileNameContainer}>
                        {isEditingName ? (
                            <TextInput
                                label={profileChatType === "group" ? "Group name" : "Contact name"}
                                value={nameDraft}
                                onChangeText={setNameDraft}
                                disabled={pendingAction !== null}
                                mode="flat"
                                cursorColor="#25D366"
                                underlineColor={colors.indicator}
                                activeUnderlineColor="#25D366"
                                autoFocus
                                style={[
                                    styles.nameInput,
                                    {
                                        backgroundColor: colors.background,
                                    },
                                ]}
                            />
                        ) : (
                            <ThemedText style={styles.profileName} numberOfLines={1}>{chatTitle}</ThemedText>
                        )}
                        <ThemedText numberOfLines={1} style={{ color: colors.textSecondary }}>
                            {formatPhoneNumber(profilePhone)}
                        </ThemedText>
                        {(canCreateProfileContact || canMessageProfileContact) ? (
                            <ThemedView style={styles.profileActionRow}>
                                {canCreateProfileContact ? (
                                    <IconButton
                                        icon="account-plus"
                                        mode="contained"
                                        iconColor="#1C1E21"
                                        containerColor="#25D366"
                                        size={22}
                                        onPress={handleCreateProfileContact}
                                        disabled={pendingAction !== null}
                                    />
                                ) : null}
                                {canMessageProfileContact ? (
                                    <IconButton
                                        icon="message-text-outline"
                                        mode="contained"
                                        iconColor="#1C1E21"
                                        containerColor="#25D366"
                                        size={22}
                                        onPress={handleMessageProfileContact}
                                        disabled={pendingAction !== null}
                                    />
                                ) : null}
                            </ThemedView>
                        ) : null}
                        <HelperText
                            type="error"
                            visible={Boolean(profileError)}
                            style={styles.profileHelperText}
                        >
                            {profileError}
                        </HelperText>
                    </ThemedView>
                    <List.Item
                        title="Media Videos, Photos and Docs"
                        titleStyle={{ color: colors.textSecondary, fontFamily: Fonts.regular, lineHeight: 20 }}
                        right={() =>
                            isProfileMediaLoading ? (
                                <ActivityIndicator color={colors.textSecondary} size="small" />
                            ) : (
                                <ThemedText style={{ color: colors.textSecondary }}>{mediaContent.length}</ThemedText>
                            )
                        }
                        onPress={() => console.log('pressed')}
                        containerStyle={{ paddingHorizontal: 8 }}
                    />
                    <ThemedView style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-start', paddingHorizontal: 16 }}>
                        <FlatList
                            data={mediaContent}
                            keyExtractor={(m) => m.message_id}
                            renderItem={({ item }) => (
                                <MediaItem
                                    message={item}
                                    isDark={scheme === 'dark'}
                                    activeChatGroupMembers={activeChat?.group_members}
                                    contacts={contacts}
                                    currentUserId={currentUserId}
                                    formatBytes={formatBytes}
                                    isGroupChat={isGroupChat}
                                    onMessageUpdated={handleProfileMediaMessageUpdated}
                                />
                            )}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ gap: 8 }}
                        />
                    </ThemedView>
                    {activeChat?.chat_type === 'group' && (
                        <TouchableRipple
                            disabled={!isCurrentUserAdmin}
                            rippleColor={colors.textSecondary + '33'}
                            underlayColor={colors.textSecondary + '22'}
                            background={{ type: 'ripple', color: colors.textSecondary + '33', foreground: true }}
                            onPress={handleOpenInviteModal}
                            style={{ width: '100%' }}
                        >
                            <List.Item
                                title="Invite new contact"
                                titleStyle={{
                                    color: isCurrentUserAdmin ? colors.text : colors.textSecondary,
                                    fontFamily: Fonts.regular,
                                    lineHeight: 20
                                }}
                                description={isCurrentUserAdmin ? "Add contact to this group" : "Only admins can invite members"}
                                descriptionStyle={{ color: colors.textSecondary, fontFamily: Fonts.regular, lineHeight: 20 }}
                                left={props => (
                                    <List.Icon
                                        {...props}
                                        icon={'account-plus'}
                                        color={isCurrentUserAdmin ? colors.text : colors.textSecondary}
                                    />
                                )}
                            />
                        </TouchableRipple>
                    )}
                    {activeChat?.chat_type === 'group' && (
                        <ThemedView style={styles.groupMembersSection}>
                            <ThemedText style={[styles.sectionHeader, { color: colors.text }]}>
                                Group members
                            </ThemedText>
                            {groupMemberRows.map(({ member, displayName, description, avatar }) => (
                                <List.Item
                                    key={member.user_id}
                                    title={displayName}
                                    titleStyle={{ color: colors.text, fontFamily: Fonts.regular, lineHeight: 20 }}
                                    description={description}
                                    descriptionStyle={{ color: colors.textSecondary, fontFamily: Fonts.regular, lineHeight: 20 }}
                                    left={() => (
                                        <ChatAvatar
                                            userId={member.user_id}
                                            imageUrl={avatar}
                                            displayName={displayName}
                                            contactPhone={member.phone_number}
                                            style={styles.memberAvatar}
                                            iconColor={avatarTint}
                                            backgroundColor={colors.card}
                                            textColor={avatarTint}
                                            chatType="single"
                                        />
                                    )}
                                    style={{ paddingRight: 0 }}
                                    right={() => (
                                        <ThemedView style={styles.memberRightContent}>
                                            {member.is_admin ? (
                                                <ThemedView
                                                    style={[
                                                        styles.adminBadge,
                                                        { backgroundColor: colors.backgroundElement }
                                                    ]}
                                                >
                                                    <ThemedText style={[styles.adminBadgeText, { color: colors.textSecondary }]}>
                                                        Admin
                                                    </ThemedText>
                                                </ThemedView>
                                            ) : null}
                                            {pendingAction === `admin:${member.user_id}` ||
                                                pendingAction === `remove:${member.user_id}` ? (
                                                <ActivityIndicator color="#25D366" size="small" />
                                            ) : (
                                                <Menu
                                                    visible={memberMenuUserId === member.user_id}
                                                    onDismiss={() => setMemberMenuUserId(null)}
                                                    anchorPosition="bottom"
                                                    contentStyle={{ backgroundColor: colors.background }}
                                                    anchor={
                                                        <IconButton
                                                            icon="dots-vertical"
                                                            size={20}
                                                            disabled={!isCurrentUserAdmin || pendingAction !== null}
                                                            iconColor={colors.textSecondary}
                                                            onPress={() => setMemberMenuUserId(member.user_id)}
                                                        />
                                                    }
                                                >
                                                    <Menu.Item
                                                        title="Make admin"
                                                        leadingIcon="shield-account-outline"
                                                        disabled={
                                                            !isCurrentUserAdmin ||
                                                            Boolean(member.is_admin) ||
                                                            pendingAction !== null
                                                        }
                                                        onPress={() => {
                                                            void handleMakeGroupMemberAdmin(member);
                                                        }}
                                                    />
                                                    <Menu.Item
                                                        title="Remove from group"
                                                        leadingIcon={({ size }) => (
                                                            <Icon
                                                                source="account-remove-outline"
                                                                size={size}
                                                                color="red"
                                                            />
                                                        )}
                                                        disabled={
                                                            !isCurrentUserAdmin ||
                                                            member.user_id === currentUserId ||
                                                            pendingAction !== null
                                                        }
                                                        titleStyle={{ color: "red" }}
                                                        onPress={() => confirmRemoveGroupMember(member, displayName)}
                                                    />
                                                </Menu>
                                            )}
                                        </ThemedView>
                                    )}
                                    containerStyle={styles.groupMemberItem}
                                />
                            ))}
                        </ThemedView>
                    )}
                    <List.Item
                        title="Mute notifications"
                        titleStyle={{ fontFamily: Fonts.regular, lineHeight: 20 }}
                        description="Turn off notifications for this conversation"
                        descriptionStyle={{ color: colors.textSecondary, fontFamily: Fonts.regular, lineHeight: 20 }}
                        right={props => (
                            <Switch
                                onValueChange={handleToggleNotifications}
                                value={isMuted}
                                disabled={!activeChat?.chat_id || isToggling}
                                color='#25D366'
                            />
                        )}
                        containerStyle={{ paddingHorizontal: 8 }}
                    />
                    {activeChat?.chat_type === 'single' && (
                        <>
                            <List.Item
                                title={`${activeChat.is_blocked_chat ? 'Unblock' : 'Block'} ${chatTitle}`}
                                titleStyle={{ color: 'red', fontFamily: Fonts.regular, lineHeight: 20 }}
                                disabled={pendingAction !== null}
                                onPress={handleToggleBlockUser}
                                left={props => (
                                    pendingAction === "block" ? (
                                        <ActivityIndicator color="red" size="small" />
                                    ) : (
                                        <Icon
                                            source={activeChat.is_blocked_chat ? "check-circle-outline" : "block-helper"}
                                            color="red"
                                            size={24}
                                        />
                                    )
                                )}
                                containerStyle={{ paddingHorizontal: 24 }}
                            />
                            <List.Item
                                title="Delete chat"
                                titleStyle={{ color: 'red', fontFamily: Fonts.regular, lineHeight: 20 }}
                                disabled={pendingAction !== null}
                                onPress={() => setActiveDialog('delete-chat')}
                                left={props => (
                                    <Icon source="trash-can-outline" color="red" size={24} />
                                )}
                                containerStyle={{ paddingHorizontal: 24 }}
                            />
                        </>
                    )}
                    {activeChat?.chat_type === 'group' && (
                        <List.Item
                            title="Exit group"
                            titleStyle={{ color: 'red', fontFamily: Fonts.regular, lineHeight: 20 }}
                            disabled={pendingAction !== null}
                            onPress={() => setActiveDialog('exit-group')}
                            left={props => (
                                <Icon source="logout" color="red" size={24} />
                            )}
                            containerStyle={{ paddingHorizontal: 24 }}
                        />
                    )}
                </ThemedView>
            </ScrollView>
        </ThemedView>
    )
}

export default TargetUserProfile

const styles = StyleSheet.create({
    main: {
        flex: 1,
    },
    topContentContainer: {
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 20,
        paddingBottom: 60,
    },
    avatar: {
        width: 145,
        height: 145,
        borderRadius: 99,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarButton: {
        position: 'relative',
        width: 145,
        height: 145,
        borderRadius: 99,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'visible',
    },
    avatarOverlay: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 99,
        backgroundColor: 'rgba(0,0,0,0.45)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    cameraIcon: {
        position: 'absolute',
        right: 4,
        bottom: 6,
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 3,
    },
    profileNameContainer: {
        width: '100%',
        maxWidth: 430,
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 24,
    },
    profileName: {
        maxWidth: '100%',
        fontSize: 22,
        fontWeight: '600',
    },
    nameInput: {
        width: '100%',
        borderRadius: 0,
    },
    profileHelperText: {
        alignSelf: 'stretch',
        marginTop: -10,
        marginBottom: -10,
    },
    profileActionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
    },
    inviteModal: {
        flex: 1,
    },
    inviteModalHeader: {
        borderBottomWidth: 1,
    },
    inviteHelperText: {
        marginHorizontal: 16,
    },
    inviteListContent: {
        paddingBottom: 96,
        gap: 6,
    },
    inviteSectionHeader: {
        fontSize: 12,
        fontWeight: "600",
        letterSpacing: 0.5,
        paddingHorizontal: 24,
        paddingVertical: 10,
    },
    inviteContactItem: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 24,
        paddingVertical: 8,
    },
    inviteContactAvatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 12,
    },
    inviteContactText: {
        flex: 1,
        minWidth: 0,
        backgroundColor: "transparent",
    },
    inviteContactName: {
        fontSize: 16,
        fontWeight: "500",
        lineHeight: 19,
    },
    inviteEmptyContainer: {
        paddingTop: 60,
        alignItems: "center",
    },
    inviteFab: {
        position: "absolute",
        right: 16,
        bottom: 16,
        minWidth: 88,
        height: 52,
        borderRadius: 26,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#25D366",
        paddingHorizontal: 18,
    },
    inviteFabText: {
        color: "#1C1E21",
        fontSize: 16,
        fontWeight: "700",
    },
    groupMembersSection: {
        width: '100%',
        paddingTop: 4,
    },
    sectionHeader: {
        fontSize: 16,
        fontWeight: '600',
        paddingHorizontal: 24,
        paddingBottom: 4,
    },
    groupMemberItem: {
        paddingHorizontal: 16,
        flex: 1,
        marginRight: 0
    },
    memberAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
    },
    memberRightContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 4,
        flex: 1,
        width: '100%'
    },
    adminBadge: {
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 3,
    },
    adminBadgeText: {
        fontSize: 12,
        lineHeight: 14,
        fontFamily: Fonts.regular,
    },
    logoutDialogHost: {
        position: 'absolute',
        zIndex: 20,
    },
})
