import { Colors } from '@/constants/theme'
import React, { useState } from 'react'
import { StyleSheet, TextInput, useColorScheme } from 'react-native'
import { IconButton } from 'react-native-paper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AttachmentContainer from './attachment-container'
import { ThemedText } from './themed-text'
import { ThemedView } from './themed-view'

type Props = {
    isReply: boolean;
    handleClearReply: () => void;
    replyToUser: string;
    replyMessage: string;
    inputRef: React.RefObject<TextInput | null>;
}

const ChatInputContainer = ({ isReply, handleClearReply, replyMessage, replyToUser, inputRef }: Props) => {
    const insets = useSafeAreaInsets();
    const scheme = useColorScheme();
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme ?? 'light']

    const [message, setMessage] = useState('');
    const [attachmentVisible, setAttachmentVisible] = useState(false);

    const handleToggleAttachment = () => setAttachmentVisible(prev => !prev);

    return (
        <ThemedView style={styles.container}>
            <AttachmentContainer visible={attachmentVisible} />
            <ThemedView style={[styles.main, { paddingBottom: insets.bottom + 10 }]}>
                <ThemedView style={[styles.mainInputContainer, { backgroundColor: scheme === 'dark' ? colors.card : colors.background, borderRadius: isReply ? 18 : 24 }]}>
                    {isReply && (
                        <ThemedView style={[styles.replyContainer, { backgroundColor: colors.indicator, borderLeftColor: '#25D366' }]}>
                            <ThemedView style={styles.topContainer}>
                                <ThemedText style={{ fontSize: 14 }}>{replyToUser}</ThemedText>
                                <IconButton
                                    icon={"close"}
                                    iconColor={colors.text}
                                    size={16}
                                    style={{ margin: 0, height: 'auto' }}
                                    onPress={handleClearReply}
                                />
                            </ThemedView>
                            <ThemedText numberOfLines={2} ellipsizeMode='tail' style={{ fontSize: 12, color: colors.textSecondary, minWidth: 0, lineHeight: 16 }}>
                                {replyMessage}
                            </ThemedText>
                        </ThemedView>
                    )}
                    <ThemedView style={[styles.inputContainer, { backgroundColor: scheme === 'dark' ? colors.card : colors.background, }]}>
                        <TextInput
                            ref={inputRef}
                            value={message}
                            onChangeText={(text) => setMessage(text)}
                            placeholder='Message'
                            multiline
                            style={[styles.input, { color: colors.text }]}
                            placeholderTextColor={colors.textSecondary}
                            enablesReturnKeyAutomatically={true}
                            selectionColor='#25D366'
                        />
                        <IconButton
                            icon={message.length > 0 ? "plus" : "microphone-outline"}
                            iconColor={colors.text}
                            size={28}
                            style={{ margin: 0, marginBottom: 2 }}
                            onPress={() => {
                                if (message.length > 0) {
                                    handleToggleAttachment();
                                }
                            }}
                        />
                    </ThemedView>
                </ThemedView>
                <IconButton
                    onPress={() => {
                        if (message.length === 0) {
                            handleToggleAttachment();
                        }
                    }}
                    icon={message.length > 0 ? "send" : "plus"}
                    mode='contained'
                    iconColor={colors.background}
                    containerColor='#25D366'
                    size={28}
                    style={{ margin: 0, marginBottom: 2 }}
                />
            </ThemedView>
        </ThemedView>
    )
}

export default ChatInputContainer

const styles = StyleSheet.create({
    container: {
        position: 'relative',
        backgroundColor: 'transparent',
        overflow: 'visible'
    },
    attachmentContainer: {
        position: 'absolute',
        left: 10,
        right: 10,
        top: -210,
        zIndex: 999,
        height: 200,
        borderRadius: 12,
        elevation: 1
    },
    main: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 10,
        paddingHorizontal: 16,
        paddingTop: 6,
        backgroundColor: 'transparent',
    },
    mainInputContainer: {
        flex: 1,
        flexDirection: 'column',
        overflow: 'hidden',
        paddingHorizontal: 3,
        paddingTop: 3
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 10,
        paddingLeft: 12,
        paddingRight: 8,
    },
    input: {
        flex: 1,
        maxHeight: 120,
        marginBottom: 4
    },
    replyContainer: {
        flexDirection: 'column',
        borderRadius: 12,
        margin: 2,
        borderLeftWidth: 3,
        overflow: 'hidden',
        paddingHorizontal: 8,
        paddingVertical: 4
    },
    topContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'transparent'
    }
})