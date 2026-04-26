import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Pressable, StyleSheet, useColorScheme } from 'react-native';
import { Button, Icon, TextInput } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const CompleteProfilePage = () => {
    const insets = useSafeAreaInsets();
    const scheme = useColorScheme();
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme ?? 'light'];

    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
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
                            Set up your profile
                        </ThemedText>
                        <ThemedText style={styles.description}>
                            Profiles are visible to people you message, contacts and groups.
                        </ThemedText>
                    </ThemedView>
                    <ThemedView style={styles.profileImageContainer}>
                        <Pressable style={[styles.avatarButton, { backgroundColor: colors.avatarBg }]}>
                            <Icon
                                source="account-outline"
                                color={colors.avatarIcon}
                                size={52}
                            />
                            <ThemedView style={[styles.cameraIcon, { backgroundColor: Colors.dark.card }]}>
                                <Icon
                                    source="camera-plus-outline"
                                    color={Colors.dark.text}
                                    size={20}
                                />
                            </ThemedView>
                        </Pressable>
                    </ThemedView>
                    <TextInput
                        label="First name (required)"
                        value={firstName}
                        onChangeText={text => setFirstName(text)}
                        cursorColor='#25D366'
                        underlineColor={colors.indicator}
                        activeUnderlineColor='#25D366'
                        style={{
                            backgroundColor: colors.card,
                        }}
                    />
                    <TextInput
                        label="Last name (required)"
                        value={lastName}
                        onChangeText={text => setLastName(text)}
                        cursorColor='#25D366'
                        underlineColor={colors.indicator}
                        activeUnderlineColor='#25D366'
                        style={{
                            backgroundColor: colors.card,
                        }}
                    />
                </ThemedView>
                <ThemedView style={styles.bottomContainer}>
                    <Button
                        mode="contained"
                        disabled={!firstName && !lastName}
                        onPress={() => router.push('../(newUser)')}
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

export default CompleteProfilePage

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
    profileImageContainer: {
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 12
    },
    avatarButton: {
        position: 'relative',
        width: 90,
        height: 90,
        borderRadius: 99,
        justifyContent: 'center',
        alignItems: 'center'
    },
    cameraIcon: {
        padding: 6,
        borderRadius: 99,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'absolute',
        right: 0,
        bottom: 0,
        zIndex: 99,
        elevation: 3
    },
    bottomContainer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'flex-end'
    }
})