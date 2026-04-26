import ChatInputContainer from '@/components/chat-input-container';
import Bubble from '@/components/message-bubble';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { messages } from '@/mocks/chats-messages';
import { rightNavRef } from '@/store/right-nav-ref';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { FlatList, ImageBackground, Keyboard, KeyboardAvoidingView, StyleSheet, Text, TextInput, useColorScheme, View } from 'react-native';
import { Appbar, TouchableRipple } from 'react-native-paper';

const ChatId = () => {
    const listRef = useRef<FlatList>(null);
    const inputRef = useRef<TextInput>(null);
    const scheme = useColorScheme();
    const isDark = scheme === 'dark';
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme ?? 'light']

    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());
    const [isReply, setIsReply] = useState(false);
    const [replyToUser, setReplyToUser] = useState('');
    const [replyMessage, setReplyMessage] = useState('');
    const [keyboardOffset, setKeyboardOffset] = useState(-30);

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

    const handleLongPress = (messageId: string) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setSelectionMode(true);
        setSelectedMessageIds(new Set([messageId]));
    };

    const handleBubblePress = (messageId: string) => {
        if (selectionMode) {
            const newSelected = new Set(selectedMessageIds);
            if (newSelected.has(messageId)) {
                newSelected.delete(messageId);
                if (newSelected.size === 0) {
                    setSelectionMode(false);
                }
            } else {
                newSelected.add(messageId);
            }
            setSelectedMessageIds(newSelected);
        }
    };

    const handleReply = (replyTo: string, replyMsg: string) => {
        setIsReply(true);
        setReplyToUser(replyTo);
        setReplyMessage(replyMsg);
        inputRef.current?.focus();
    };

    const handleClearReply = () => {
        setIsReply(false);
        setReplyToUser('');
        setReplyMessage('');
    };

    const handleCancelSelectionMode = () => {
        setSelectionMode(false);
        setSelectedMessageIds(new Set());
    };

    const handleExitFromChat = () => {
        if (rightNavRef.isReady()) {
            rightNavRef.goBack();
            return
        }

        router.back();
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
                                            <Text style={[styles.avatarText, { color: scheme === 'dark' ? '#4ade80' : '#15803d' }]}>M</Text>
                                        </View>
                                        <ThemedText>Mohammed</ThemedText>
                                    </ThemedView>
                                </TouchableRipple>
                            }
                        />
                        <Appbar.Action icon="dots-vertical" onPress={() => { }} />
                    </>
                )}
            </Appbar.Header>
            <ImageBackground
                source={
                    isDark
                        ? require('../../assets/bg-pattern-dark.png')
                        : require('../../assets/bg-pattern-light.png')
                }
                style={styles.background}
                resizeMode="cover"
            >
                <FlatList
                    ref={listRef}
                    data={messages}
                    keyExtractor={(item) => item.message_id}
                    renderItem={({ item }) => (
                        <Bubble
                            key={item.message_id}
                            message={item}
                            isDark={isDark}
                            isSelected={selectedMessageIds.has(item.message_id)}
                            onLongPress={() => handleLongPress(item.message_id)}
                            onPress={() => handleBubblePress(item.message_id)}
                            handleReply={handleReply}
                            selectedMessageIds={selectedMessageIds}
                        />
                    )}
                    contentInsetAdjustmentBehavior="automatic"
                    onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
                    onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
                />
                <ChatInputContainer
                    isReply={isReply}
                    handleClearReply={handleClearReply}
                    replyMessage={replyMessage}
                    replyToUser={replyToUser}
                    inputRef={inputRef}
                />
            </ImageBackground>
        </KeyboardAvoidingView>
    );
};

export default ChatId

const styles = StyleSheet.create({
    background: {
        flex: 1,
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