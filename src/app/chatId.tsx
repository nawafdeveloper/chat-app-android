import ChatInputContainer from '@/components/chat-input-container';
import { ChatAvatar } from '@/components/decrypted-chat-avatar';
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
import { markDbChatRead } from '@/lib/upsert-db-chats';
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
import { FlatList, Keyboard, KeyboardAvoidingView, Platform, StyleSheet, TextInput, useColorScheme } from 'react-native';
import { ActivityIndicator, Appbar, Icon, TouchableRipple } from 'react-native-paper';

const EMPTY_MESSAGES: Message[] = [];

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

    const selectedChatId = useActiveChatStore((state) => state.selectedChatId);
    const setSelectedChatId = useActiveChatStore((state) => state.setSelectedChatId);
    const setReplyDraft = useActiveChatStore((state) => state.setReplyDraft);
    const clearReplyDraft = useActiveChatStore((state) => state.clearReplyDraft);
    const activeChatId = routeChatId ?? selectedChatId;
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
    const selectedCount = selectedMessageIds.size;
    const selectionModeRef = useRef(selectionMode);
    const hasStartedMessageScrollRef = useRef(false);

    useEffect(() => {
        selectionModeRef.current = selectionMode;
    }, [selectionMode]);

    useFocusEffect(
        useCallback(() => {
            const focusedChatId =
                routeChatId ?? useActiveChatStore.getState().selectedChatId;

            if (!focusedChatId) {
                return undefined;
            }

            setSelectedChatId(focusedChatId);

            return () => {
                const state = useActiveChatStore.getState();

                if (state.selectedChatId === focusedChatId) {
                    state.setSelectedChatId(null);
                }
            };
        }, [routeChatId, setSelectedChatId])
    );

    useEffect(() => {
        if (!activeChatId || !isFocused) {
            return;
        }

        useActiveChatStore.getState().markChatRead(activeChatId);
        void markDbChatRead(activeChatId).catch((error) => {
            console.log('Failed to mark chat read locally:', error);
        });
        useRealtimeStore.getState().sendEvent({
            type: 'MARK_READ',
            conversationId: activeChatId,
        });
    }, [activeChatId, isFocused]);

    useEffect(() => {
        const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', () => {
            setKeyboardOffset(-30);
        });
        const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {
            setKeyboardOffset(-100);
        });

        return () => {
            keyboardDidShowListener.remove();
            keyboardDidHideListener.remove();
        };
    }, []);

    const handleLongPress = useCallback((messageId: string) => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        selectionModeRef.current = true;
        setSelectionMode(true);
        setSelectedMessageIds(new Set([messageId]));
    }, []);

    const handleBubblePress = useCallback((messageId: string) => {
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
    }, []);

    const handleRetryMessage = useCallback((message: Message) => {
        void retryMessage(message);
    }, [retryMessage]);

    const handleReply = useCallback((
        replyTo: string,
        replyMsg: string | null,
        replayMedia: string | null | undefined,
        replyMediaType: 'photo' | 'video' | 'voice' | 'file' | 'contact' | 'location' | null,
        originalMessageId: string,
        originalSenderUserId: string
    ) => {
        if (!activeChatId) {
            return;
        }

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
        selectionModeRef.current = false;
        setSelectionMode(false);
        setSelectedMessageIds(new Set());
    }, []);

    const handleExitFromChat = () => {
        if (rightNavRef.isReady()) {
            rightNavRef.goBack();
            return
        }

        router.back();
    };

    const handleLoadOlderMessages = useCallback(() => {
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
        hasStartedMessageScrollRef.current = true;
    }, []);

    const renderMessageItem = useCallback(({ item }: { item: Message }) => (
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
    ), [
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
        return <ImagePreviewBeforeSent />
    }

    if (isVideoVisible) {
        return <VideoPreviewBeforeSent />
    }

    const handleOpenProfile = () => {
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

                        <Appbar.Action icon="trash-can-outline" onPress={() => { }} />
                        {selectedMessageIds.size < 2 && (
                            <>
                                <Appbar.Action icon="emoticon-outline" onPress={() => { }} />
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
