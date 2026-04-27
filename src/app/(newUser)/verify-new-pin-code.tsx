import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { usePinStore } from '@/store/use-new-pin-store';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, StyleSheet, TextInput as RNTextInput, useColorScheme, View } from 'react-native';
import { Button } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PIN_LENGTH = 6

const COLORS = {
    dark: { dotFilled: '#FFFFFF', dotError: '#FF453A' },
    light: { dotFilled: '#000000', dotError: '#FF3B30' },
}

const VerifyNewPinCode = () => {
    const insets = useSafeAreaInsets();
    const scheme = useColorScheme();
    const isDark = scheme === 'dark'
    const pinColors = isDark ? COLORS.dark : COLORS.light
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme ?? 'light']

    const { confirmPin, setConfirmPin, isConfirmMatch } = usePinStore()
    const inputRefs = useRef<(RNTextInput | null)[]>([])
    const [error, setError] = useState(false)
    const [keyboardOffset, setKeyboardOffset] = useState(0);
    const isProcessing = useRef(false)

    useEffect(() => {
        setConfirmPin('')
        isProcessing.current = false
        const timer = setTimeout(() => inputRefs.current[0]?.focus(), 100)
        return () => clearTimeout(timer)
    }, [setConfirmPin])

    const pinDigits = Array.from({ length: PIN_LENGTH }, (_, index) => confirmPin[index] ?? '')

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
    }, [confirmPin, isConfirmMatch, setConfirmPin])

    const handlePinChange = (text: string, index: number) => {
        if (error || isProcessing.current) return

        const sanitized = text.replace(/[^0-9]/g, '')

        if (sanitized.length > 1) {
            const newDigits = [...pinDigits]
            sanitized.slice(0, PIN_LENGTH - index).split('').forEach((digit, offset) => {
                newDigits[index + offset] = digit
            })
            setConfirmPin(newDigits.join(''))

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
        setConfirmPin(newDigits.join(''))

        if (sanitized && index < PIN_LENGTH - 1) {
            inputRefs.current[index + 1]?.focus()
        }
    }

    const handleKeyPress = (key: string, index: number) => {
        if (error || isProcessing.current) return

        if (key === 'Backspace' && !pinDigits[index] && index > 0) {
            inputRefs.current[index - 1]?.focus()
        }
    }

    const borderColor = (index: number) => {
        if (error) return pinColors.dotError
        return pinDigits[index] ? '#25D366' : colors.indicator
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
                    <View style={styles.otpContainer}>
                        {pinDigits.map((digit, index) => (
                            <RNTextInput
                                key={index}
                                ref={(ref) => { inputRefs.current[index] = ref }}
                                value={digit}
                                onChangeText={(text) => handlePinChange(text, index)}
                                onKeyPress={(e) => handleKeyPress(e.nativeEvent.key, index)}
                                keyboardType="number-pad"
                                maxLength={PIN_LENGTH}
                                style={[
                                    styles.otpInput,
                                    {
                                        backgroundColor: colors.card,
                                        borderColor: borderColor(index),
                                        color: error ? pinColors.dotError : colors.text,
                                    },
                                ]}
                                selectionColor="#25D366"
                                textAlign="center"
                                editable={!error && !isProcessing.current}
                            />
                        ))}
                    </View>
                </ThemedView>
                <ThemedView style={styles.bottomContainer}>
                    <Button
                        mode="contained"
                        disabled={!confirmPin}
                        onPress={() => router.push('/(tabs)')}
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
