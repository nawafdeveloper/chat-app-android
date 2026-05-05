import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { usePinStore } from '@/store/use-new-pin-store';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, TextInput as RNTextInput, StyleSheet, useColorScheme, View } from 'react-native';
import { Button } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PIN_LENGTH = 6

const NewUserPage = () => {
    const insets = useSafeAreaInsets();
    const scheme = useColorScheme();
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme ?? 'light']

    const { pin, setPin, isPinComplete } = usePinStore()
    const inputRefs = useRef<(RNTextInput | null)[]>([])

    const [keyboardOffset, setKeyboardOffset] = useState(0);

    useEffect(() => {
        const timer = setTimeout(() => inputRefs.current[0]?.focus(), 100)
        return () => clearTimeout(timer)
    }, []);

    const pinDigits = Array.from({ length: PIN_LENGTH }, (_, index) => pin[index] ?? '')

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

    const handleKeyPress = (key: string, index: number) => {
        if (key === 'Backspace' && !pinDigits[index] && index > 0) {
            inputRefs.current[index - 1]?.focus()
        }
    }

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

    return (
        <KeyboardAvoidingView
            behavior={'height'}
            keyboardVerticalOffset={keyboardOffset}
            style={{ flex: 1 }}>
            <ThemedView style={[styles.main, { paddingTop: insets.top * 2, paddingBottom: insets.bottom }]}>
                <ThemedView style={styles.topContainer}>
                    <ThemedView style={styles.contextContainer}>
                        <ThemedText style={styles.title}>
                            Create your PIN
                        </ThemedText>
                        <ThemedText style={styles.description}>
                            PINs can help you restore your account and keep your data encrypted with YaaHalaa.
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
                        disabled={!isPinComplete}
                        onPress={() => router.push('/(newUser)/verify-new-pin-code')}
                        buttonColor='#25D366'
                        textColor='#ffffff'
                        style={{ height: 45, width: 90, borderRadius: 99 }}
                    >
                        Next
                    </Button>
                </ThemedView>
            </ThemedView>
        </KeyboardAvoidingView>
    )
}

export default NewUserPage

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
