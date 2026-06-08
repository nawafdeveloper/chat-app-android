import { Colors } from '@/constants/theme'
import { db } from '@/db/client'
import { currentUser } from '@/db/schema'
import { authClient } from '@/lib/auth-client'
import { fetchAndDecryptProfileImage, uploadEncryptedProfileImage } from '@/lib/profile-image'
import { decryptText } from '@/lib/text-encryption'
import { useProfileStore } from '@/store/use-update-profile-store'
import { eq } from 'drizzle-orm'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, useColorScheme, View } from 'react-native'
import { Icon, TextInput } from 'react-native-paper'
import { ThemedText } from './themed-text'
import { ThemedView } from './themed-view'

const ProfileSettings = () => {
    const { data: session } = authClient.useSession()
    const scheme = useColorScheme()
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme ?? 'light']

    const {
        firstName, lastName, about, profileImage,
        setFirstName, setLastName, setAbout, setProfileImage,
        setOriginals
    } = useProfileStore()

    const [loading, setLoading] = useState(false)
    const [avatarLoading, setAvatarLoading] = useState(false)

    const loadImage = async (imageUrl: string | null | undefined) => {
        const objectKey = imageUrl?.split('/api/profile-image/')[1]
        if (!objectKey) return
        setAvatarLoading(true)
        try {
            const localUrl = await fetchAndDecryptProfileImage(objectKey)
            setProfileImage(localUrl)
        } catch (err) {
            console.log('❌ Failed to decrypt profile image:', err)
        } finally {
            setAvatarLoading(false)
        }
    }

    const handleFetchData = async () => {
        if (session?.user.name) {
            const [first = '', ...rest] = session.user.name.trim().split(' ')

            let decryptedAbout = ''
            if (session.user.aboutCiphertext && session.user.aboutEncryptedAesKey && session.user.aboutIv) {
                try {
                    decryptedAbout = await decryptText({
                        ciphertext: session.user.aboutCiphertext,
                        encryptedAesKey: session.user.aboutEncryptedAesKey,
                        iv: session.user.aboutIv,
                    })
                } catch (err) {
                    console.log('❌ Failed to decrypt about:', err)
                }
            }

            setOriginals(first, rest.join(' '), decryptedAbout)
        }

        if (session?.user.image) {
            await loadImage(session.user.image)
            return
        }
        try {
            const user = await db
                .select({ image: currentUser.image })
                .from(currentUser)
                .get()
            await loadImage(user?.image)
        } catch (err) {
            console.log('❌ Failed to load image from SQLite:', err)
        }
    }

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

        const localUri = picked.assets[0].uri
        setProfileImage(localUri)
        setAvatarLoading(true)
        setLoading(true)

        try {
            const { imageUrl } = await uploadEncryptedProfileImage(localUri)

            const { error } = await authClient.updateUser({ image: imageUrl })
            if (error) throw new Error(error.message || 'Failed to update profile')

            if (session?.user.id) {
                await db.update(currentUser)
                    .set({ image: imageUrl })
                    .where(eq(currentUser.id, session.user.id))
            }
        } catch (e: any) {
            setProfileImage(null)
            Alert.alert('Upload failed', e.message || 'Something went wrong. Please try again.')
        } finally {
            setLoading(false)
            setAvatarLoading(false)
        }
    }

    useEffect(() => {
        handleFetchData()
    }, [session])

    return (
        <ScrollView automaticallyAdjustKeyboardInsets={true}>
            <ThemedView style={styles.main}>
                <ThemedView style={styles.profileImageContainer}>
                    <Pressable
                        style={[styles.avatarButton, { backgroundColor: colors.avatarBg }]}
                        onPress={pickImage}
                        disabled={avatarLoading || loading}
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

                        {avatarLoading && (
                            <View style={styles.avatarOverlay}>
                                <ActivityIndicator color="#fff" size="small" />
                            </View>
                        )}

                        {!avatarLoading && (
                            <ThemedView style={[styles.cameraIcon, { backgroundColor: Colors.dark.card }]}>
                                <Icon
                                    source="camera-plus-outline"
                                    color={Colors.dark.text}
                                    size={20}
                                />
                            </ThemedView>
                        )}
                    </Pressable>
                </ThemedView>

                <ThemedView style={styles.sectionContainer}>
                    <ThemedText style={[styles.sectionHeading, { color: colors.textSecondary }]}>First name</ThemedText>
                    <TextInput
                        label="First name"
                        value={firstName}
                        onChangeText={setFirstName}
                        cursorColor='#25D366'
                        underlineColor={colors.indicator}
                        activeUnderlineColor='#25D366'
                        style={{ backgroundColor: colors.card, width: '100%' }}
                    />
                </ThemedView>

                <ThemedView style={styles.sectionContainer}>
                    <ThemedText style={[styles.sectionHeading, { color: colors.textSecondary }]}>Last name</ThemedText>
                    <TextInput
                        label="Last name"
                        value={lastName}
                        onChangeText={setLastName}
                        cursorColor='#25D366'
                        underlineColor={colors.indicator}
                        activeUnderlineColor='#25D366'
                        style={{ backgroundColor: colors.card, width: '100%' }}
                    />
                </ThemedView>

                <ThemedView style={styles.sectionContainer}>
                    <ThemedText style={[styles.sectionHeading, { color: colors.textSecondary }]}>About</ThemedText>
                    <TextInput
                        label="About"
                        value={about}
                        onChangeText={setAbout}
                        cursorColor='#25D366'
                        underlineColor={colors.indicator}
                        activeUnderlineColor='#25D366'
                        style={{ backgroundColor: colors.card, width: '100%' }}
                    />
                </ThemedView>
            </ThemedView>
        </ScrollView>
    )
}

export default ProfileSettings

const styles = StyleSheet.create({
    main: {
        flex: 1,
        width: '100%',
        padding: 16,
        gap: 24
    },
    sectionContainer: {
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'flex-start',
        gap: 8,
    },
    sectionHeading: {
        fontSize: 14,
        fontWeight: '400'
    },
    profileImageContainer: {
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 20
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
    saveButton: {
        width: '100%',
        paddingVertical: 14,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    saveButtonText: {
        fontSize: 15,
        fontWeight: '600',
    }
})