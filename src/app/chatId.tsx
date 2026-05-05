import ChatInputContainer from '@/components/chat-input-container';
import Bubble from '@/components/message-bubble';
import { TiledBackground } from '@/components/tailed-wallpaper';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useChatMessages } from '@/hooks/use-chat-realtime';
import { authClient } from '@/lib/auth-client';
import { markDbChatRead } from '@/lib/upsert-db-chats';
import { rightNavRef } from '@/store/right-nav-ref';
import { useActiveChatStore } from '@/store/use-active-chat-store';
import { useRealtimeStore } from '@/store/use-realtime-store';
import type { Message } from '@/types/messages';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Keyboard, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, useColorScheme, View } from 'react-native';
import { Appbar, TouchableRipple } from 'react-native-paper';

const EMPTY_MESSAGES: Message[] = [];

const ChatId = () => {
    const { data: session } = authClient.useSession()
    const listRef = useRef<FlatList<Message>>(null);
    const inputRef = useRef<TextInput>(null);
    const scheme = useColorScheme();
    const isDark = scheme === 'dark';
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme ?? 'light']
    const params = useLocalSearchParams<{ chatId?: string | string[] }>();
    const routeChatId = Array.isArray(params.chatId) ? params.chatId[0] : params.chatId;

    const selectedChatId = useActiveChatStore((state) => state.selectedChatId);
    const setSelectedChatId = useActiveChatStore((state) => state.setSelectedChatId);
    const activeChatId = routeChatId ?? selectedChatId;
    const currentUserId = session?.user.id ?? null;
    const { loadOlderMessages } = useChatMessages(activeChatId);
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
    const chatInitial = chatTitle.trim().charAt(0).toUpperCase() || '?';

    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());
    const [isReply, setIsReply] = useState(false);
    const [replyToUser, setReplyToUser] = useState('');
    const [replyMessage, setReplyMessage] = useState('');
    const [keyboardOffset, setKeyboardOffset] = useState(-30);
    const selectedCount = selectedMessageIds.size;
    const selectionModeRef = useRef(selectionMode);
    const hasStartedMessageScrollRef = useRef(false);

    useEffect(() => {
        selectionModeRef.current = selectionMode;
    }, [selectionMode]);

    useEffect(() => {
        if (routeChatId && routeChatId !== selectedChatId) {
            setSelectedChatId(routeChatId);
        }
    }, [routeChatId, selectedChatId, setSelectedChatId]);

    useEffect(() => {
        if (!activeChatId) {
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
    }, [activeChatId]);

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

    const handleReply = useCallback((replyTo: string, replyMsg: string) => {
        setIsReply(true);
        setReplyToUser(replyTo);
        setReplyMessage(replyMsg);
        inputRef.current?.focus();
    }, []);

    const handleClearReply = useCallback(() => {
        setIsReply(false);
        setReplyToUser('');
        setReplyMessage('');
    }, []);

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
            handleReply={handleReply}
        />
    ), [
        currentUserId,
        handleBubblePress,
        handleLongPress,
        handleReply,
        isDark,
        selectedCount,
        selectedMessageIds,
    ]);

    const wallpapers: Record<string, { dark: any; light: any }> = {
        'wallpaper-1': { dark: require('../../assets/dark-wallpaper-1.svg'), light: require('../../assets/light-wallpaper-1.svg') },
        'wallpaper-2': { dark: require('../../assets/dark-wallpaper-2.svg'), light: require('../../assets/light-wallpaper-2.svg') },
        'wallpaper-3': { dark: require('../../assets/dark-wallpaper-3.svg'), light: require('../../assets/light-wallpaper-3.svg') },
        'wallpaper-4': { dark: require('../../assets/dark-wallpaper-4.svg'), light: require('../../assets/light-wallpaper-4.svg') },
        'wallpaper-5': { dark: require('../../assets/dark-wallpaper-5.svg'), light: require('../../assets/light-wallpaper-5.svg') },
        'wallpaper-6': { dark: require('../../assets/dark-wallpaper-6.svg'), light: require('../../assets/light-wallpaper-6.svg') },
        'wallpaper-7': { dark: require('../../assets/dark-wallpaper-7.svg'), light: require('../../assets/light-wallpaper-7.svg') },
        'wallpaper-8': { dark: require('../../assets/dark-wallpaper-8.svg'), light: require('../../assets/light-wallpaper-8.svg') },
        'wallpaper-9': { dark: require('../../assets/dark-wallpaper-9.svg'), light: require('../../assets/light-wallpaper-9.svg') },
        'wallpaper-10': { dark: require('../../assets/dark-wallpaper-10.svg'), light: require('../../assets/light-wallpaper-10.svg') },
    }

    const defaultWallpaper = {
        dark: require('../../assets/dark-wallpaper-1.svg'),
        light: require('../../assets/light-wallpaper-1.svg'),
    }

    const getWallpaper = (isDark: boolean) => {
        const key = session?.user.chatWallpaper ?? ''
        const pair = wallpapers[key] ?? defaultWallpaper
        return isDark ? pair.dark : pair.light
    }

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
                                <Appbar.Action icon="content-copy" onPress={() => { }} />
                                <Appbar.Action icon="arrow-left-top" onPress={() => { }} /></>
                        )}
                    </>
                ) : (
                    <>
                        <Appbar.BackAction onPress={handleExitFromChat} />
                        <Appbar.Content
                            title={
                                <TouchableRipple>
                                    <ThemedView style={styles.profileContainer}>
                                        <View style={[styles.avatar, { backgroundColor: scheme === 'dark' ? '#052e16' : '#dcfce7' }]}>
                                            <Text style={[styles.avatarText, { color: scheme === 'dark' ? '#4ade80' : '#15803d' }]}>{chatInitial}</Text>
                                        </View>
                                        <ThemedText numberOfLines={1}>{chatTitle}</ThemedText>
                                    </ThemedView>
                                </TouchableRipple>
                            }
                        />
                        <Appbar.Action icon="dots-vertical" onPress={() => { }} />
                    </>
                )}
            </Appbar.Header>
            <TiledBackground source={getWallpaper(isDark)} style={styles.background}>
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
                />
                <ChatInputContainer
                    isReply={isReply}
                    handleClearReply={handleClearReply}
                    replyMessage={replyMessage}
                    replyToUser={replyToUser}
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
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 25,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    avatarText: {
        fontSize: 18,
        fontWeight: '500'
    },
})
