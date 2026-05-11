import { ChatAvatar } from '@/components/decrypted-chat-avatar'
import { SmallDecryptedMediaImage } from '@/components/small-decrypted-image-preview'
import { SmallVideoMessagePreview } from '@/components/small-decrypted-video-preview'
import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { Colors } from '@/constants/theme'
import { formatPhoneNumber } from '@/helper/phone-formatter'
import { authClient } from '@/lib/auth-client'
import { findContactByPhone, findContactByUserId, getContactDisplayName } from '@/lib/contact-display'
import { isLocalMediaUri, isMessageMediaSafeForJsDecrypt, materializeMessageMedia } from '@/lib/message-media'
import { upsertDbMessages } from '@/lib/upsert-db-messages'
import { useActiveChatStore } from '@/store/use-active-chat-store'
import { useContactDirectoryStore } from '@/store/use-contact-directory-store'
import { Message } from '@/types/messages'
import { useRoute } from '@react-navigation/native'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useMemo, useState } from 'react'
import { FlatList, StyleSheet, useColorScheme } from 'react-native'
import { ScrollView } from 'react-native-gesture-handler'
import { Appbar, Icon, List, Switch } from 'react-native-paper'

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

const EMPTY_MESSAGES: Message[] = [];

const TargetUserProfile = () => {
    const { data: session } = authClient.useSession()
    const scheme = useColorScheme()
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme ?? 'light']
    const currentUserId = session?.user.id ?? null;

    const params = useLocalSearchParams<{ chatId?: string | string[] }>();
    const navigationRoute = useRoute();
    const nativeChatId = (navigationRoute.params as { chatId?: string | string[] } | undefined)?.chatId;
    const expoChatId = Array.isArray(params.chatId) ? params.chatId[0] : params.chatId;
    const nativeRouteChatId = Array.isArray(nativeChatId) ? nativeChatId[0] : nativeChatId;
    const routeChatId = expoChatId ?? nativeRouteChatId;
    const selectedChatId = useActiveChatStore((state) => state.selectedChatId);
    const contacts = useContactDirectoryStore((state) => state.contacts);
    const activeChatId = routeChatId ?? selectedChatId;
    const activeChat = useActiveChatStore((state) =>
        activeChatId
            ? state.chats.find((chat) => chat.chat_id === activeChatId) ?? null
            : null
    );
    const messagesByChatId = useActiveChatStore(
        (state) => state.messagesByChatId
    );
    const messages = activeChatId ? messagesByChatId[activeChatId] : EMPTY_MESSAGES;
    const mediaContent = messages.filter(isVisualMediaMessage).sort((left, right) => right.created_at.getTime() - left.created_at.getTime());
    const chatTitle = activeChat?.display_name ?? activeChat?.contact_phone ?? 'Chat';
    const avatarTint = colors.text;
    const isGroupChat = activeChat?.chat_type === "group";

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

    const MediaItem = useCallback(({ message, isDark }: { message: Message; isDark: boolean }) => {
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
                ? activeChat?.group_members?.find(
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
                await upsertDbMessages([localMessage], currentUserId);
            } catch (error) {
                console.log("Failed to download message media:", error);
            } finally {
                setIsDownloading(false);
            }
        }, [currentUserId, isDownloading, message]);

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
            />
        );
    }, [activeChat?.group_members, contacts, currentUserId, formatBytes, isGroupChat]);

    return (
        <ThemedView style={styles.main}>
            <Appbar.Header style={{ backgroundColor: colors.background }}>
                <Appbar.BackAction onPress={() => router.back()} />
                <Appbar.Content title="" />
                <Appbar.Action icon="pencil" onPress={() => { }} />
            </Appbar.Header>
            <ScrollView style={{ flex: 1 }}>
                <ThemedView style={styles.topContentContainer}>
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
                    <ThemedView style={{ flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
                        <ThemedText style={{ fontSize: 22, fontWeight: '600' }} numberOfLines={1}>{chatTitle}</ThemedText>
                        <ThemedText numberOfLines={1} style={{ color: colors.textSecondary }}>
                            {formatPhoneNumber(activeChat?.contact_phone)}
                        </ThemedText>
                    </ThemedView>
                    <List.Item
                        title="Media Videos, Photos and Docs"
                        titleStyle={{ color: colors.textSecondary }}
                        right={props => (
                            <ThemedView style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <ThemedText style={{ color: colors.textSecondary }}>{mediaContent.length}</ThemedText>
                                <List.Icon {...props} icon="chevron-right" color={colors.textSecondary} />
                            </ThemedView>
                        )}
                        onPress={() => console.log('pressed')}
                        containerStyle={{ paddingHorizontal: 8 }}
                    />
                    <ThemedView style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-start', paddingHorizontal: 16 }}>
                        <FlatList
                            data={mediaContent.slice(0, 12)}
                            keyExtractor={(m) => m.message_id}
                            renderItem={({ item }) => <MediaItem message={item} isDark={scheme === 'dark'} />}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ gap: 8 }}
                        />
                    </ThemedView>
                    {activeChat?.chat_type === 'group' && (
                        <List.Item
                            title="Invite new user"
                            description="Add contact to this group"
                            descriptionStyle={{ color: colors.textSecondary }}
                            left={props => <List.Icon icon={'account-plus'} color={colors.text} />}
                            containerStyle={{ paddingHorizontal: 24 }}
                        />
                    )}
                    <List.Item
                        title="Mute notifications"
                        description="Turn off notifications for this conversation"
                        descriptionStyle={{ color: colors.textSecondary }}
                        right={props => (
                            <Switch />
                        )}
                        containerStyle={{ paddingHorizontal: 8 }}
                    />
                    {activeChat?.chat_type === 'single' && (
                        <>
                            <List.Item
                                title={`Block ${chatTitle}`}
                                titleStyle={{ color: 'red' }}
                                left={props => (
                                    <Icon source="block-helper" color="red" size={24} />
                                )}
                                containerStyle={{ paddingHorizontal: 24 }}
                            />
                            <List.Item
                                title="Delete chat"
                                titleStyle={{ color: 'red' }}
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
                            titleStyle={{ color: 'red' }}
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
        flex: 1
    },
    topContentContainer: {
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 20
    },
    avatar: {
        width: 145,
        height: 145,
        borderRadius: 99,
        alignItems: 'center',
        justifyContent: 'center',
    },
})