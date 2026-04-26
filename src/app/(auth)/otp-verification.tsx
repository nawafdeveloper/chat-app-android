import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, TextInput as RNTextInput, StyleSheet, useColorScheme, View } from 'react-native';
import { Button } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const OtpVerificationPage = () => {
    const insets = useSafeAreaInsets();
    const scheme = useColorScheme()
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme ?? 'light']

    const [otp, setOtp] = useState(['', '', '', '', '', '']);
    const [keyboardOffset, setKeyboardOffset] = useState(0);

    const inputRefs = useRef<(RNTextInput | null)[]>([]);

    const handleOtpChange = (text: string, index: number) => {
        if (text.length > 1) {
            const pastedCode = text.slice(0, 6).split('');
            const newOtp = [...otp];
            for (let i = 0; i < pastedCode.length; i++) {
                if (i + index < 6) {
                    newOtp[i + index] = pastedCode[i];
                }
            }
            setOtp(newOtp);

            const nextEmptyIndex = newOtp.findIndex((val, idx) => idx >= index && !val);
            if (nextEmptyIndex !== -1 && nextEmptyIndex < 6) {
                inputRefs.current[nextEmptyIndex]?.focus();
            } else if (newOtp.every(val => val !== '')) {
                inputRefs.current[5]?.blur();
            }
        } else {
            const newOtp = [...otp];
            newOtp[index] = text;
            setOtp(newOtp);

            if (text && index < 5) {
                inputRefs.current[index + 1]?.focus();
            }
        }
    };

    const handleKeyPress = (e: any, index: number) => {
        if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    };

    const handleVerify = () => {
        const otpString = otp.join('');
        if (otpString.length === 6) {
            console.log('Verifying OTP:', otpString);
            // Add your verification logic here
            router.push('../(complete-profile)');
        }
    };

    useEffect(() => {
        if (inputRefs.current[0]) {
            inputRefs.current[0].focus();
        }
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

    return (
        <KeyboardAvoidingView
            behavior={'height'}
            keyboardVerticalOffset={keyboardOffset}
            style={{ flex: 1 }}>
            <ThemedView style={[styles.main, { paddingTop: insets.top * 2, paddingBottom: insets.bottom }]}>
                <ThemedView style={styles.topContainer}>
                    <ThemedView style={styles.contextContainer}>
                        <ThemedText style={styles.title}>
                            Verification Code
                        </ThemedText>
                        <ThemedText style={styles.description}>
                            Enter the 6-digit code we sent to you by SMS.
                        </ThemedText>
                    </ThemedView>

                    <View style={styles.otpContainer}>
                        {otp.map((digit, index) => (
                            <RNTextInput
                                key={index}
                                ref={(ref) => { inputRefs.current[index] = ref; }}
                                value={digit}
                                onChangeText={(text) => handleOtpChange(text, index)}
                                onKeyPress={(e) => handleKeyPress(e, index)}
                                keyboardType="number-pad"
                                maxLength={6}
                                style={[
                                    styles.otpInput,
                                    {
                                        backgroundColor: colors.card,
                                        borderColor: otp[index] ? '#25D366' : colors.indicator,
                                        color: colors.text,
                                    }
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
                        disabled={otp.some(digit => digit === '')}
                        onPress={handleVerify}
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

export default OtpVerificationPage

const styles = StyleSheet.create({
    main: {
        flex: 1,
        paddingHorizontal: 16,
        justifyContent: 'space-between'
    },
    topContainer: {
        flex: 1,
        flexDirection: 'column',
        gap: 32,
        maxWidth: 400,
        marginHorizontal: 'auto'
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
    bottomContainer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'flex-end'
    },
});