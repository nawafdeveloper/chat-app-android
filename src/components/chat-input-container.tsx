import { Colors } from '@/constants/theme'
import React, { useState } from 'react'
import { StyleSheet, TextInput, useColorScheme } from 'react-native'
import { IconButton } from 'react-native-paper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ThemedText } from './themed-text'
import { ThemedView } from './themed-view'

const ChatInputContainer = () => {
    const insets = useSafeAreaInsets();
    const scheme = useColorScheme();
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme ?? 'light']

    const [message, setMessage] = useState('');
    const [isReply, setIsReply] = useState(false);

    return (
        <ThemedView style={[styles.main, { paddingBottom: insets.bottom + 10 }]}>
            <ThemedView style={[styles.mainInputContainer, { backgroundColor: colors.card, borderRadius: isReply ? 18 : 23 }]}>
                {isReply && (
                    <ThemedView style={[styles.replyContainer, { backgroundColor: colors.indicator, borderLeftColor: '#25D366' }]}>
                        <ThemedView style={styles.topContainer}>
                            <ThemedText style={{ fontSize: 14 }}>Mohammed</ThemedText>
                            <IconButton
                                icon={"close"}
                                iconColor={colors.text}
                                size={16}
                                style={{ margin: 0, height: 'auto' }}
                                onPress={() => setIsReply(false)}
                            />
                        </ThemedView>
                        <ThemedText numberOfLines={2} ellipsizeMode='tail' style={{ fontSize: 12, color: colors.textSecondary, minWidth: 0, lineHeight: 16 }}>
                            {'Yes!! It was insane 🔥 Can\'t believe that last minute goal. Yes!! It was insane 🔥 Can\'t believe that last minute goal'}
                        </ThemedText>
                    </ThemedView>
                )}
                <ThemedView style={[styles.inputContainer, { backgroundColor: colors.card }]}>
                    <TextInput
                        value={message}
                        onChangeText={(text) => setMessage(text)}
                        placeholder='Message'
                        multiline
                        style={[styles.input, { color: colors.text }]}
                        placeholderTextColor={colors.textSecondary}
                    />
                    <IconButton
                        icon={message.length > 0 ? "plus" : "microphone-outline"}
                        iconColor={colors.text}
                        size={28}
                        style={{ margin: 0, marginBottom: 2 }}
                        onPress={() => console.log('Mic Pressed')}
                    />
                </ThemedView>
            </ThemedView>
            <IconButton
                icon={message.length > 0 ? "send" : "plus"}
                mode='contained'
                iconColor={colors.background}
                containerColor='#25D366'
                size={28}
                style={{ margin: 0, marginBottom: 2 }}
                onPress={() => setIsReply(true)}
            />
        </ThemedView>
    )
}

export default ChatInputContainer

const styles = StyleSheet.create({
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