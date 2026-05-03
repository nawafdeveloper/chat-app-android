import { ThemedView } from '@/components/themed-view'
import { Colors } from '@/constants/theme'
import { useIsTablet } from '@/context/screen-checking-context'
import { db } from '@/db/client'
import { currentUser } from '@/db/schema'
import { authClient } from '@/lib/auth-client'
import { fetchAndDecryptProfileImage, uploadEncryptedProfileImage } from '@/lib/profile-image'
import { rightNavRef } from '@/store/right-nav-ref'
import { useProfileStore } from '@/store/use-update-profile-store'
import { eq } from 'drizzle-orm'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'
import React, { useEffect, useState } from 'react'
import { Alert, FlatList, Pressable, StyleSheet, useColorScheme, View } from 'react-native'
import { ActivityIndicator, Appbar, Icon, List } from 'react-native-paper'
import { IconSource } from 'react-native-paper/lib/typescript/components/Icon'

type SettingList = {
    key: string;
    title: string;
    description: string;
    icon: IconSource;
    href: string;
}

const SettingsPage = () => {
    const { data: session } = authClient.useSession()
    const isTablet = useIsTablet()
    const scheme = useColorScheme()
    const resolvedScheme = scheme === 'unspecified' ? 'light' : scheme ?? 'light'
    const colors = Colors[resolvedScheme]

    const [loading, setLoading] = useState(false)
    const [avatarLoading, setAvatarLoading] = useState(false)
    const { setProfileImage, profileImage } = useProfileStore()

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
        handleFetchData();
    }, [session]);

    const settingsList: SettingList[] = [
        {
            key: 'general',
            title: 'General',
            description: 'Language and text sizes',
            icon: 'laptop',
            href: 'general-settings'
        },
        {
            key: 'profile',
            title: 'Profile',
            description: 'Name, profile photo and number',
            icon: 'account-circle-outline',
            href: 'profile-settings'
        },
        {
            key: 'account',
            title: 'Account',
            description: 'Account security and information',
            icon: 'key-outline',
            href: 'account-settings'
        },
        {
            key: 'privacy',
            title: 'Privacy',
            description: 'Block contacts, disappearing messages',
            icon: 'lock-outline',
            href: 'privacy-settings'
        },
        {
            key: 'chats',
            title: 'Chats',
            description: 'Theme, wallpaper and chats settings',
            icon: 'chat-processing-outline',
            href: 'chats-settings'
        },
        {
            key: 'notifications',
            title: 'Notifications',
            description: 'Messages notificaitons',
            icon: 'bell-outline',
            href: 'notifications-settings'
        },
        {
            key: 'help',
            title: 'Help and feedback',
            description: 'Help center, contact us privacy & policy',
            icon: 'help-circle-outline',
            href: 'help-settings'
        },
    ];

    const handleNavigateToSubSetting = (href: string) => {
        if (isTablet && rightNavRef.isReady()) {
            rightNavRef.navigate('subSetting', { href })
            return
        }

        router.push({ pathname: '/(tabs)/settings/sub-setting', params: { href: href } })
    };

    return (
        <ThemedView style={styles.main}>
            <Appbar.Header
                style={{
                    backgroundColor: colors.background,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.indicator + '33'
                }}
            >
                <Appbar.Content title={'Settings'} />
            </Appbar.Header>
            <ThemedView style={styles.settingsMainContainer}>
                <FlatList
                    style={styles.settingsList}
                    data={settingsList}
                    keyExtractor={(item) => item.key}
                    contentContainerStyle={styles.settingsListContent}
                    renderItem={({ item }) => (
                        <List.Item
                            key={item.key}
                            title={item.title}
                            description={item.description}
                            descriptionStyle={{ color: colors.textSecondary }}
                            onPress={() => handleNavigateToSubSetting(item.href)}
                            left={props => <List.Icon {...props} icon={item.icon} color={colors.textSecondary} />}
                        />
                    )}
                    ListHeaderComponent={
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
                    }
                />
            </ThemedView>
        </ThemedView>
    )
}

export default SettingsPage

const styles = StyleSheet.create({
    main: {
        flex: 1
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
        alignItems: 'center'
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
    settingsMainContainer: {
        flex: 1,
        flexDirection: 'column',
        gap: 8,
    },
    settingsList: {
        flex: 1,
    },
    settingsListContent: {
        paddingBottom: 20,
        paddingHorizontal: 16,
    },
})
