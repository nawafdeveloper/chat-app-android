import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { usePinStore } from '@/store/use-new-pin-store';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, StyleSheet, TextInput, useColorScheme, View } from 'react-native';
import { Button } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PIN_LENGTH = 6

const COLORS = {
    dark: { dotFilled: '#FFFFFF', dotEmpty: '#3A3A3C', dotError: '#FF453A' },
    light: { dotFilled: '#000000', dotEmpty: '#E5E5EA', dotError: '#FF3B30' },
}

const VerifyNewPinCode = () => {
    const insets = useSafeAreaInsets();
    const scheme = useColorScheme();
    const isDark = scheme === 'dark'
    const colors = isDark ? COLORS.dark : COLORS.light

    const { confirmPin, setConfirmPin, isConfirmMatch, reset } = usePinStore()
    const inputRef = useRef<TextInput>(null)
    const [error, setError] = useState(false)
    const [keyboardOffset, setKeyboardOffset] = useState(0);
    const isProcessing = useRef(false)

    useEffect(() => {
        setConfirmPin('')
        isProcessing.current = false
        const timer = setTimeout(() => inputRef.current?.focus(), 100)
        return () => clearTimeout(timer)
    }, [])

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

    useEffect(() => {
        if (confirmPin.length !== PIN_LENGTH || isProcessing.current) return
        isProcessing.current = true

        if (isConfirmMatch) {
            const create = async () => {
                try {
                    reset()
                    router.replace('/(tabs)')
                } catch (error) {
                    console.log(error);
                    setError(true)
                    setTimeout(() => {
                        setError(false)
                        setConfirmPin('')
                        isProcessing.current = false
                    }, 600)
                }
            }
            create()
        } else {
            setError(true)
            setTimeout(() => {
                setError(false)
                setConfirmPin('')
                isProcessing.current = false
            }, 600)
        }
    }, [confirmPin])

    const dotColor = (i: number) => {
        if (error) return colors.dotError
        return i < confirmPin.length ? colors.dotFilled : colors.dotEmpty
    }

    return (
        <KeyboardAvoidingView
            behavior={'height'}
            keyboardVerticalOffset={keyboardOffset}
            style={{ flex: 1 }}>
            <ThemedView style={[styles.main, { paddingTop: insets.top * 2, paddingBottom: insets.bottom }]}>
                <ThemedView style={styles.topContainer}>
                    <ThemedView style={styles.contextContainer}>
                        <ThemedText style={styles.title}>Confirm your PIN</ThemedText>
                        <ThemedText style={styles.description}>
                            Enter your PIN again to confirm.
                        </ThemedText>
                    </ThemedView>
                    <View style={styles.dots}>
                        {Array(PIN_LENGTH).fill(0).map((_, i) => (
                            <View
                                key={i}
                                style={[
                                    styles.dot,
                                    { backgroundColor: dotColor(i) },
                                    i < confirmPin.length && !error && styles.dotFilled,
                                ]}
                            />
                        ))}
                    </View>

                    <TextInput
                        ref={inputRef}
                        value={confirmPin}
                        onChangeText={(text) => {
                            if (!error && !isProcessing.current) setConfirmPin(text)
                        }}
                        keyboardType="number-pad"
                        maxLength={PIN_LENGTH}
                        secureTextEntry
                        style={styles.hiddenInput}
                        caretHidden
                    />
                </ThemedView>
                <ThemedView style={styles.bottomContainer}>
                    <Button
                        mode="contained"
                        disabled={!confirmPin}
                        onPress={() => router.push('/(newUser)/verify-new-pin-code')}
                        buttonColor='#25D366'
                        textColor='#ffffff'
                    >
                        Next
                    </Button>
                </ThemedView>
            </ThemedView>
        </KeyboardAvoidingView>
    )
}

export default VerifyNewPinCode

const styles = StyleSheet.create({
    main: {
        flex: 1,
        paddingHorizontal: 16,
        justifyContent: 'space-between'
    },
    topContainer: {
        flex: 1,
        flexDirection: 'column',
        gap: 24
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
    dots: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 16,
        marginTop: 32
    },
    dot: {
        width: 14,
        height: 14,
        borderRadius: 7
    },
    dotFilled: {
        transform:
            [
                { scale: 1.1 }
            ]
    },
    hiddenInput: {
        position: 'absolute',
        opacity: 0,
        width: 0,
        height: 0
    },
})