import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useCrypto } from '@/context/crypto';
import { usePinStore } from '@/store/use-new-pin-store';
import { triggerRefreshKeys } from '@/types/keys.module';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, TextInput as RNTextInput, StyleSheet, useColorScheme, View } from 'react-native';
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

    const { confirmPin, setConfirmPin, isConfirmMatch, reset } = usePinStore()
    const { register } = useCrypto()
    const inputRefs = useRef<(RNTextInput | null)[]>([])
    const [error, setError] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false)
    const [keyboardOffset, setKeyboardOffset] = useState(0);

    useEffect(() => {
        setConfirmPin('')
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

    const handleVerify = async () => {
        if (isProcessing || confirmPin.length !== PIN_LENGTH) return
        setIsProcessing(true)
        Keyboard.dismiss()

        if (isConfirmMatch) {
            try {
                const create = async () => {
                    try {
                        await register(confirmPin)
                        reset()
                    } catch (error) {
                        console.log(error);
                        setError(true)
                        setTimeout(() => {
                            setError(false)
                            setConfirmPin('')
                            setIsProcessing(false)
                        }, 600)
                    }
                }
                create()
                triggerRefreshKeys();
                router.replace('/(complete-profile)')
            } catch (err) {
                console.log(err)
                setError(true)
                setTimeout(() => {
                    setError(false)
                    setConfirmPin('')
                    setIsProcessing(false)
                    inputRefs.current[0]?.focus()
                }, 600)
            }
        } else {
            setError(true)
            setTimeout(() => {
                setError(false)
                setConfirmPin('')
                setIsProcessing(false)
                inputRefs.current[0]?.focus()
            }, 600)
        }
    }

    const handlePinChange = (text: string, index: number) => {
        if (error || isProcessing) return

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
        if (error || isProcessing) return
        if (key === 'Backspace' && !pinDigits[index] && index > 0) {
            inputRefs.current[index - 1]?.focus()
        }
    }

    const borderColor = (index: number) => {
        if (error) return pinColors.dotError
        return pinDigits[index] ? '#25D366' : colors.indicator
    }

    const isButtonDisabled = confirmPin.length !== PIN_LENGTH || isProcessing

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
                                editable={!error && !isProcessing}
                            />
                        ))}
                    </View>
                </ThemedView>
                <ThemedView style={styles.bottomContainer}>
                    <Button
                        mode="contained"
                        disabled={isButtonDisabled}
                        onPress={handleVerify}
                        buttonColor='#25D366'
                        textColor='#ffffff'
                        style={{ height: 45, width: 90, borderRadius: 99 }}
                    >
                        Verify
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
