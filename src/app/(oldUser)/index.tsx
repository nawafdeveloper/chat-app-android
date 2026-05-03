import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useCrypto } from '@/hooks/use-crypto';
import { usePinOldUserStore } from '@/store/use-pin-old-user-store';
import { triggerRefreshKeys } from '@/types/keys.module';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, TextInput as RNTextInput, StyleSheet, useColorScheme, View } from 'react-native';
import { ActivityIndicator, Button } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PIN_LENGTH = 6

const OldUserPage = () => {
    const insets = useSafeAreaInsets();
    const scheme = useColorScheme();
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme ?? 'light']
    const {
        pin,
        canGoNext,
        setError,
        setProcessing,
        isProcessing,
        setPin,
        error,
        reset
    } = usePinOldUserStore()
    const { unlock } = useCrypto()

    const [keyboardOffset, setKeyboardOffset] = useState(0);
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

        try {
            const ok = await unlock(pin)

            if (!ok) {
                setError(true)
                setPin('')
                setProcessing(false)
                setTimeout(() => setError(false), 600)
                return
            }

            setProcessing(false)

            triggerRefreshKeys()

            router.replace('/(tabs)')
        } catch {
            setError(true)
            setProcessing(false)
            setPin('')
            setTimeout(() => setError(false), 600)
        }
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
                            Type your 6-digit PIN to continue.
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
                                        borderColor: digit ? '#25D366' : colors.indicator,
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
                        {isProcessing ? <ActivityIndicator color='#25D366' size={'small'} /> : <ThemedText>Verify</ThemedText>}
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