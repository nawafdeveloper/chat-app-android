import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { Colors } from '@/constants/theme'
import { useLoginStore } from '@/store/use-login-store'
import { router } from 'expo-router'
import React, { useEffect, useState } from 'react'
import { Keyboard, KeyboardAvoidingView, StyleSheet, useColorScheme } from 'react-native'
import { ActivityIndicator, Button, Icon, TextInput, TouchableRipple } from 'react-native-paper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const PhoneLoginPage = () => {
    const insets = useSafeAreaInsets();
    const scheme = useColorScheme()
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme ?? 'light']
    const {
        selectedCountry,
        phoneNumber,
        setPhoneNumber,
        isNextEnabled,
        handleNext,
        isLoading
    } = useLoginStore();

    const [keyboardOffset, setKeyboardOffset] = useState(0);

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
                            Phone number
                        </ThemedText>
                        <ThemedText style={styles.description}>
                            You will receive a verification code. Enter your phone number.
                        </ThemedText>
                    </ThemedView>
                    <TouchableRipple
                        onPress={() => router.push('/(auth)/select-country')}
                    >
                        <ThemedView style={[styles.countrySelectorButton, { backgroundColor: colors.card, borderBottomColor: colors.indicator }]}>
                            <ThemedText>{selectedCountry.label}</ThemedText>
                            <Icon
                                source="unfold-more-horizontal"
                                color={colors.text}
                                size={20}
                            />
                        </ThemedView>
                    </TouchableRipple>
                    <ThemedView style={styles.inputsContainer}>
                        <TextInput
                            value={selectedCountry.code}
                            keyboardType='numeric'
                            cursorColor='#25D366'
                            underlineColor={colors.background}
                            underlineColorAndroid={colors.background}
                            activeUnderlineColor={colors.background}
                            style={{
                                backgroundColor: colors.card
                            }}
                            editable={false}
                        />
                        <TextInput
                            label="Phone number"
                            value={phoneNumber}
                            onChangeText={text => setPhoneNumber(text)}
                            keyboardType='numeric'
                            cursorColor='#25D366'
                            underlineColor={colors.indicator}
                            activeUnderlineColor='#25D366'
                            style={{
                                backgroundColor: colors.card,
                                flex: 1
                            }}
                        />
                    </ThemedView>
                </ThemedView>
                <ThemedView style={styles.bottomContainer}>
                    <Button
                        mode="contained"
                        disabled={!isNextEnabled || isLoading}
                        onPress={handleNext}
                        buttonColor='#25D366'
                        textColor='#ffffff'
                    >
                        {isLoading ? <ActivityIndicator size={'small'} /> : 'Next'}
                    </Button>
                </ThemedView>
            </ThemedView>
        </KeyboardAvoidingView>
    )
}

export default PhoneLoginPage

const styles = StyleSheet.create({
    main: {
        flex: 1,
        paddingHorizontal: 16,
        justifyContent: 'space-between',
    },
    topContainer: {
        flex: 1,
        flexDirection: 'column',
        gap: 24,
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
    inputsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16
    },
    countrySelectorButton: {
        paddingVertical: 16,
        paddingHorizontal: 18,
        borderTopRightRadius: 4,
        borderTopLeftRadius: 4,
        borderBottomWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
    },
    bottomContainer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'flex-end'
    }
})