import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useCrypto } from '@/hooks/use-crypto';
import { authClient } from '@/lib/auth-client';
import { preloadUserChatsAndMessages } from '@/lib/chat-sync';
import { syncMobileContacts } from '@/lib/contact-sync';
import { useActiveChatStore } from '@/store/use-active-chat-store';
import { usePinOldUserStore } from '@/store/use-pin-old-user-store';
import { triggerRefreshKeys } from '@/types/keys.module';
import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, TextInput as RNTextInput, StyleSheet, useColorScheme, View } from 'react-native';
import { ActivityIndicator, Button } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PIN_LENGTH = 6

const OldUserPage = () => {
    const insets = useSafeAreaInsets();
    const scheme = useColorScheme();
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme ?? 'light']
    const { data: session } = authClient.useSession();
    const {
        pin,
        canGoNext,
        setError,
        setProcessing,
        isProcessing,
        setPin,
        error,
    } = usePinOldUserStore()
    const { unlock } = useCrypto()

    const [keyboardOffset, setKeyboardOffset] = useState(0);
    const [isPreloading, setIsPreloading] = useState(false);
    const [loadingTitle, setLoadingTitle] = useState('Loading your chats');
    const [syncError, setSyncError] = useState<string | null>(null);
    const inputRefs = useRef<(RNTextInput | null)[]>([])

    const pinDigits = Array.from({ length: PIN_LENGTH }, (_, index) => pin[index] ?? '')

    useEffect(() => {
        const timer = setTimeout(() => inputRefs.current[0]?.focus(), 100)
        return () => clearTimeout(timer)
    }, []);

    useEffect(() => {
        const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', () => {
            setKeyboardOffset(0);
        });
        const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {
            setKeyboardOffset(-100);
        });

        return () => {
            keyboardDidShowListener.remove();
            keyboardDidHideListener.remove();
        };
    }, []);

    const handlePinChange = (text: string, index: number) => {
        const sanitized = text.replace(/[^0-9]/g, '')

        if (sanitized.length > 1) {
            const newDigits = [...pinDigits]
            sanitized.slice(0, PIN_LENGTH - index).split('').forEach((digit, offset) => {
                newDigits[index + offset] = digit
            })
            setPin(newDigits.join(''))

            const nextEmptyIndex = newDigits.findIndex((digit, currentIndex) => currentIndex >= index && !digit)
            if (nextEmptyIndex !== -1 && nextEmptyIndex < PIN_LENGTH) {
                inputRefs.current[nextEmptyIndex]?.focus()
            } else {
                inputRefs.current[PIN_LENGTH - 1]?.blur()
            }
            return
        }

        const newDigits = [...pinDigits]
        newDigits[index] = sanitized
        setPin(newDigits.join(''))

        if (sanitized && index < PIN_LENGTH - 1) {
            inputRefs.current[index + 1]?.focus()
        }
    }

    const verify = async () => {
        if (!canGoNext) return

        setProcessing(true)
        setSyncError(null)

        try {
            const ok = await unlock(pin)

            if (!ok) {
                setError(true)
                setPin('')
                setProcessing(false)
                setSyncError('Incorrect PIN. Please try again.')
                setTimeout(() => setError(false), 600)
                return
            }

            const currentUserId =
                session?.user.id ?? (await authClient.getSession()).data?.user.id

            if (!currentUserId) {
                throw new Error('No user session found')
            }

            Keyboard.dismiss()
            setIsPreloading(true)
            setLoadingTitle('Loading your chats')

            await preloadUserChatsAndMessages({
                currentUserId,
                cookies: authClient.getCookie(),
                onLoadingTitleChange: setLoadingTitle,
                onChatsLoaded: (chats) => {
                    useActiveChatStore.getState().setChats(chats)
                },
                onChatMessagesLoaded: (chatId, messages, hasOlderMessages) => {
                    useActiveChatStore.getState().replaceMessages(chatId, messages)
                    useActiveChatStore
                        .getState()
                        .setHasOlderMessages(chatId, Boolean(hasOlderMessages))
                },
            })

            await syncMobileContacts({
                currentUserId,
                cookies: authClient.getCookie(),
                onLoadingTitleChange: setLoadingTitle,
            })

            setProcessing(false)
            triggerRefreshKeys()
        } catch {
            setError(true)
            setProcessing(false)
            setIsPreloading(false)
            setSyncError('Could not load your chats. Please try again.')
            setPin('')
            setTimeout(() => setError(false), 600)
        }
    }

    if (isPreloading) {
        return (
            <ThemedView style={[styles.loadingMain, { paddingTop: insets.top * 2, paddingBottom: Math.max(insets.bottom, 24) }]}>
                <ThemedView style={styles.loadingTopContainer}>
                    <ThemedText style={styles.loadingTitle}>
                        {loadingTitle}
                    </ThemedText>
                </ThemedView>
                <ThemedView style={styles.loadingBottomContainer}>
                    <ActivityIndicator color='#25D366' size='large' />
                </ThemedView>
            </ThemedView>
        )
    }

    return (
        <KeyboardAvoidingView
            behavior={'height'}
            keyboardVerticalOffset={keyboardOffset}
            style={{ flex: 1 }}>
            <ThemedView style={[styles.main, { paddingTop: insets.top * 2, paddingBottom: insets.bottom }]}>
                <ThemedView style={styles.topContainer}>
                    <ThemedView style={styles.contextContainer}>
                        <ThemedText style={styles.title}>
                            Enter your PIN
                        </ThemedText>
                        <ThemedText style={styles.description}>
                            {syncError ?? 'Type your 6-digit PIN to continue.'}
                        </ThemedText>
                    </ThemedView>
                    <View style={styles.otpContainer}>
                        {pinDigits.map((digit, index) => (
                            <RNTextInput
                                key={index}
                                ref={(ref) => { inputRefs.current[index] = ref }}
                                value={digit}
                                onChangeText={(text) => handlePinChange(text, index)}
                                keyboardType="number-pad"
                                maxLength={PIN_LENGTH}
                                style={[
                                    styles.otpInput,
                                    {
                                        backgroundColor: colors.card,
                                        borderColor: error ? '#ef4444' : digit ? '#25D366' : colors.indicator,
                                        color: colors.text,
                                    },
                                ]}
                                selectionColor="#25D366"
                                textAlign="center"
                            />
                        ))}
                    </View>
                </ThemedView>
                <ThemedView style={styles.bottomContainer}>
                    <Button
                        mode="contained"
                        disabled={!canGoNext || isProcessing}
                        onPress={verify}
                        buttonColor='#25D366'
                        textColor='#ffffff'
                    >
                        Verify
                    </Button>
                </ThemedView>
            </ThemedView>
        </KeyboardAvoidingView>
    )
}

export default OldUserPage

const styles = StyleSheet.create({
    main: {
        flex: 1,
        paddingHorizontal: 16,
        justifyContent: 'space-between'
    },
    loadingMain: {
        flex: 1,
        paddingHorizontal: 16,
        justifyContent: 'space-between',
    },
    loadingTopContainer: {
        width: '100%',
        maxWidth: 400,
        marginHorizontal: 'auto',
        alignItems: 'flex-start',
    },
    loadingTitle: {
        fontSize: 28,
        fontWeight: '600',
        lineHeight: 32,
    },
    loadingBottomContainer: {
        width: '100%',
        alignItems: 'center',
        justifyContent: 'flex-end',
    },
    topContainer: {
        flex: 1,
        flexDirection: 'column',
        gap: 24,
        maxWidth: 400,
        marginHorizontal: 'auto',
        width: '100%'
    },
    contextContainer: {
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'flex-start',
        gap: 12
    },
    title: {
        fontSize: 28,
        fontWeight: '600',
        lineHeight: 28
    },
    description: {
        fontSize: 16,
        lineHeight: 16,
        color: 'gray'
    },
    bottomContainer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'flex-end'
    },
    otpContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
    },
    otpInput: {
        flex: 1,
        height: 60,
        borderBottomWidth: 1.5,
        borderTopRightRadius: 4,
        borderTopLeftRadius: 4,
        fontSize: 24,
        fontWeight: '600',
        textAlign: 'center',
    },
})
