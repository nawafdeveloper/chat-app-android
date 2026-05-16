import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Fonts } from '@/constants/theme';
import { db } from '@/db/client';
import { currentUser } from '@/db/schema';
import { authClient } from '@/lib/auth-client';
import { uploadEncryptedProfileImage } from '@/lib/profile-image';
import { eq } from 'drizzle-orm';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { ActivityIndicator, Button, Icon, TextInput } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const CompleteProfilePage = () => {
    const { data: session } = authClient.useSession();
    const insets = useSafeAreaInsets();
    const scheme = useColorScheme();
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme ?? 'light'];

    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [profileImage, setProfileImage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
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

    const pickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (status !== 'granted') {
            Alert.alert('Permission required', 'Please allow access to your photo library.')
            return
        }

        const picked = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
        })

        if (picked.canceled) return

        setProfileImage(picked.assets[0].uri)
    }

    const handleNext = async () => {
        if (!firstName.trim() || isLoading) return

        setIsLoading(true)
        Keyboard.dismiss()

        try {
            const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ')
            const payload: { name: string; image?: string } = { name: fullName }

            if (profileImage) {
                const { imageUrl } = await uploadEncryptedProfileImage(profileImage)
                payload.image = imageUrl
            }

            const { error } = await authClient.updateUser(payload)
            if (error) throw new Error(error.message || 'Failed to update profile')

            if (session?.user.id) {
                await db.update(currentUser)
                    .set({
                        name: fullName,
                        ...(payload.image && { image: payload.image }),
                    })
                    .where(eq(currentUser.id, session.user.id))
            }

            // Force session to re-fetch so AppLayout sees the new name
            await authClient.getSession()

            // No router.push needed — AppStack re-evaluates hasName=true automatically
        } catch (err) {
            console.log('Failed to update profile:', err)
            Alert.alert(
                'Save failed',
                err instanceof Error ? err.message : 'Something went wrong. Please try again.'
            )
            setIsLoading(false)
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
                            Set up your profile
                        </ThemedText>
                        <ThemedText style={styles.description}>
                            Profiles are visible to people you message, contacts and groups.
                        </ThemedText>
                    </ThemedView>
                    <ThemedView style={styles.profileImageContainer}>
                        <Pressable
                            style={[styles.avatarButton, { backgroundColor: colors.avatarBg }]}
                            onPress={pickImage}
                            disabled={isLoading}
                        >
                            {profileImage ? (
                                <Image
                                    source={{ uri: profileImage }}
                                    contentFit='cover'
                                    style={styles.avatar}
                                />
                            ) : (
                                <Icon
                                    source="account-outline"
                                    color={colors.avatarIcon}
                                    size={52}
                                />
                            )}
                            {isLoading && profileImage && (
                                <View style={styles.avatarOverlay}>
                                    <ActivityIndicator color="#fff" size="small" />
                                </View>
                            )}
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
                        style={{ backgroundColor: colors.card, fontFamily: Fonts.regular }}
                    />
                    <TextInput
                        label="Last name (optional)"
                        value={lastName}
                        onChangeText={text => setLastName(text)}
                        cursorColor='#25D366'
                        underlineColor={colors.indicator}
                        activeUnderlineColor='#25D366'
                        style={{ backgroundColor: colors.card, fontFamily: Fonts.regular }}
                    />
                </ThemedView>
                <ThemedView style={styles.bottomContainer}>
                    <Button
                        mode="contained"
                        disabled={!firstName.trim() || isLoading}
                        onPress={handleNext}
                        buttonColor='#25D366'
                        textColor='#ffffff'
                        loading={isLoading}
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
        alignItems: 'center',
        overflow: 'visible',
    },
    avatar: {
        width: 90,
        height: 90,
        borderRadius: 99,
    },
    avatarOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.45)',
        borderRadius: 99,
        justifyContent: 'center',
        alignItems: 'center',
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
