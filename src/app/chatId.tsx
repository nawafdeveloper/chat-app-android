import ChatInputContainer from '@/components/chat-input-container';
import ContactPreviewBeforeSent from '@/components/contact-preview-before-sent';
import { ChatAvatar } from '@/components/decrypted-chat-avatar';
import FilePreviewBeforeSent from '@/components/file-preview-before-sent';
import ImagePreviewBeforeSent from '@/components/image-preview-before-sent';
import Bubble from '@/components/message-bubble';
import { TiledBackground } from '@/components/tailed-wallpaper';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import VideoPreviewBeforeSent from '@/components/video-preview-before-sent';
import { Colors } from '@/constants/theme';
import { useChatMessages } from '@/hooks/use-chat-realtime';
import { useSendChatMessage } from '@/hooks/use-send-chat-message';
import { authClient } from '@/lib/auth-client';
import { areDirectChatIdsEquivalent } from '@/lib/chat-utils';
import { markDbChatRead } from '@/lib/upsert-db-chats';
import { useContactPreviewBeforeSentStore } from '@/store/contact-preview-before-sent';
import { useFilePreviewBeforeSentStore } from '@/store/file-preview-before-sent';
import { useImagePreviewBeforeSentStore } from '@/store/image-preview-before-sent';
import { rightNavRef } from '@/store/right-nav-ref';
import { useActiveChatStore } from '@/store/use-active-chat-store';
import { useRealtimeStore } from '@/store/use-realtime-store';
import { useVideoPreviewBeforeSentStore } from '@/store/video-preview-before-sent';
import type { Message } from '@/types/messages';
import { useFocusEffect, useIsFocused, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, useColorScheme } from 'react-native';
import { ActivityIndicator, Appbar, Icon, TouchableRipple } from 'react-native-paper';

const EMPTY_MESSAGES: Message[] = [];
const CHAT_DEBUG = true;

function debugChatId(stage: string, payload: Record<string, unknown> = {}) {
    if (!CHAT_DEBUG) {
        return;
    }

    console.log(`[chat-debug][chatId][${stage}]`, {
        at: new Date().toISOString(),
        ...payload,
    });
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
    const listRef = useRef<FlatList<Message>>(null);
    const inputRef = useRef<TextInput>(null);
    const scheme = useColorScheme();
    const isDark = scheme === 'dark';
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme ?? 'light']
    const params = useLocalSearchParams<{ chatId?: string | string[] }>();
    const navigationRoute = useRoute();
    const nativeChatId = (navigationRoute.params as { chatId?: string | string[] } | undefined)?.chatId;
    const expoChatId = Array.isArray(params.chatId) ? params.chatId[0] : params.chatId;
    const nativeRouteChatId = Array.isArray(nativeChatId) ? nativeChatId[0] : nativeChatId;
    const routeChatId = expoChatId ?? nativeRouteChatId;
    const isFocused = useIsFocused();
    const realtimeStatus = useRealtimeStore((state) => state.status);
    const { isVisible } = useImagePreviewBeforeSentStore();
    const { isVideoVisible } = useVideoPreviewBeforeSentStore();
    const { isFileVisible } = useFilePreviewBeforeSentStore();
    const { isContactVisible } = useContactPreviewBeforeSentStore();

    const selectedChatId = useActiveChatStore((state) => state.selectedChatId);
    const chats = useActiveChatStore((state) => state.chats);
    const setSelectedChatId = useActiveChatStore((state) => state.setSelectedChatId);
    const setReplyDraft = useActiveChatStore((state) => state.setReplyDraft);
    const clearReplyDraft = useActiveChatStore((state) => state.clearReplyDraft);
    const activeChatId = useMemo(
        () => resolveCanonicalChatId(routeChatId ?? selectedChatId, chats),
        [chats, routeChatId, selectedChatId]
    );
    const currentUserId = session?.user.id ?? null;
    const { loadOlderMessages } = useChatMessages(activeChatId);
    const { retryMessage } = useSendChatMessage();
    const activeChat = useActiveChatStore((state) =>
        activeChatId
            ? state.chats.find((chat) => chat.chat_id === activeChatId) ?? null
            : null
    );
    const messages = useActiveChatStore((state) =>
        activeChatId
            ? state.messagesByChatId[activeChatId] ?? EMPTY_MESSAGES
            : EMPTY_MESSAGES
    );
    const visibleMessages = useMemo(() => [...messages].reverse(), [messages]);
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

    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());
    const [isReply, setIsReply] = useState(false);
    const [replyToUser, setReplyToUser] = useState('');
    const [replyMessage, setReplyMessage] = useState('');
    const [replyMediaType, setReplyMediaType] = useState<'photo' | 'video' | 'voice' | 'file' | 'contact' | 'location' | null>(null);
    const [replyMediaUrl, setReplyMediaUrl] = useState('');
    const [keyboardOffset, setKeyboardOffset] = useState(-30);
    const [isReactionVisible, setIsReactionVisible] = useState(false);
    const selectedCount = selectedMessageIds.size;
    const selectionModeRef = useRef(selectionMode);
    const hasStartedMessageScrollRef = useRef(false);
    const lastReadReceiptKeyRef = useRef<string | null>(null);

    const reactions = [
        { key: '1', label: '👍' },
        { key: '2', label: '❤️' },
        { key: '3', label: '😂' },
        { key: '4', label: '😮' },
        { key: '5', label: '😢' },
        { key: '6', label: '🙏' },
    ];

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
        }, [routeChatId, selectedChatId, setSelectedChatId])
    );

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
            useActiveChatStore.getState().markChatRead(activeChatId);
            void markDbChatRead(activeChatId).catch((error) => {
                debugChatId('read-receipt-db-error', { activeChatId, error });
                console.log('Failed to mark chat read locally:', error);
            });
            useRealtimeStore.getState().sendEvent({
                type: 'MARK_READ',
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

    const renderMessageItem = useCallback(({ item }: { item: Message }) => {
        debugChatId('render-message-item', {
            activeChatId,
            message: summarizeMessageForDebug(item),
            isSelected: selectedMessageIds.has(item.message_id),
        });

        return (
            <Bubble
                message={item}
                currentUserId={currentUserId}
                isDark={isDark}
                isSelected={selectedMessageIds.has(item.message_id)}
                selectedCount={selectedCount}
                onLongPress={handleLongPress}
                onPress={handleBubblePress}
                onRetryMessage={handleRetryMessage}
                handleReply={handleReply}
            />
        );
    }, [
        activeChatId,
        currentUserId,
        handleBubblePress,
        handleLongPress,
        handleRetryMessage,
        handleReply,
        isDark,
        selectedCount,
        selectedMessageIds,
    ]);

    if (isVisible) {
        debugChatId('render-image-preview-before-send', { activeChatId });
        return <ImagePreviewBeforeSent />
    }

    if (isVideoVisible) {
        debugChatId('render-video-preview-before-send', { activeChatId });
        return <VideoPreviewBeforeSent />
    }

    if (isFileVisible) {
        debugChatId('render-file-preview-before-send', { activeChatId });
        return <FilePreviewBeforeSent />
    }

    if (isContactVisible) {
        debugChatId('render-contact-preview-before-send', { activeChatId });
        return <ContactPreviewBeforeSent />
    }

    const handleOpenProfile = () => {
        debugChatId('open-profile', { activeChatId });
        router.navigate({
            pathname: '/targetUserProfile',
            params: { chatId: activeChatId }
        })
    };

    return (
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
                        <Appbar.Action icon="arrow-right-top" onPress={() => { }} />
                        <Appbar.Action icon="star-outline" onPress={() => { }} />
                        {selectedMessageIds.size < 2 && (
                            <>
                                <Appbar.Action icon="pin-outline" onPress={() => { }} />
                                <Appbar.Action icon="emoticon-outline" onPress={toggleReactionContainer} />
                                <Appbar.Action icon="arrow-left-top" onPress={() => { }} /></>
                        )}
                    </>
                ) : (
                    <>
                        <Appbar.BackAction onPress={handleExitFromChat} />
                        <Appbar.Content
                            title={
                                <TouchableRipple onPress={handleOpenProfile}>
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
                                        <ThemedText numberOfLines={1}>{chatTitle}</ThemedText>
                                    </ThemedView>
                                </TouchableRipple>
                            }
                        />
                        {isRealtimeConnecting && (
                            <ThemedView style={styles.headerConnectionIndicator}>
                                <ActivityIndicator size="small" color={avatarTint} />
                            </ThemedView>
                        )}
                        <Appbar.Action icon="dots-vertical" onPress={() => { }} />
                    </>
                )}
            </Appbar.Header>
            {isReactionVisible && (
                <ThemedView style={{ paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly' }}>
                    {reactions.map((r) => (
                        <Pressable key={r.key}>
                            <ThemedText style={{ fontSize: 24 }}>{r.label}</ThemedText>
                        </Pressable>
                    ))}
                </ThemedView>
            )}
            <TiledBackground source={isDark ? require('@/assets/bg-pattern-dark.png') : require('@/assets/bg-pattern-light.png')} style={styles.background}>
                <FlatList
                    ref={listRef}
                    data={visibleMessages}
                    keyExtractor={(item) => item.message_id}
                    renderItem={renderMessageItem}
                    inverted
                    contentContainerStyle={styles.messagesContent}
                    contentInsetAdjustmentBehavior="automatic"
                    keyboardShouldPersistTaps="handled"
                    onScroll={handleMessageScroll}
                    scrollEventThrottle={32}
                    initialNumToRender={18}
                    maxToRenderPerBatch={10}
                    updateCellsBatchingPeriod={32}
                    windowSize={7}
                    removeClippedSubviews={Platform.OS === 'android'}
                    onEndReached={handleLoadOlderMessages}
                    onEndReachedThreshold={0.25}
                    ListFooterComponent={
                        <ThemedView style={{ backgroundColor: 'transparent', paddingHorizontal: 16, paddingVertical: 8 }}>
                            <ThemedView style={{ flexDirection: 'row', alignItems: 'center', width: 'auto', marginHorizontal: 'auto', gap: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: scheme === 'dark' ? '#13181C' : '#fff' }}>
                                <Icon
                                    source="lock-check-outline"
                                    color="#25D366"
                                    size={20}
                                />
                                <ThemedText style={{ fontSize: 14, fontWeight: '400', color: colors.textSecondary }}>
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
            </TiledBackground>
        </KeyboardAvoidingView>
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
    profileContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10
    },
    headerConnectionIndicator: {
        width: 40,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 25,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
})
