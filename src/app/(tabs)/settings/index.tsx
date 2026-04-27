import { ThemedView } from '@/components/themed-view'
import { Colors } from '@/constants/theme'
import { useIsTablet } from '@/context/screen-checking-context'
import { rightNavRef } from '@/store/right-nav-ref'
import { router } from 'expo-router'
import React from 'react'
import { FlatList, Pressable, StyleSheet, useColorScheme } from 'react-native'
import { Appbar, Icon, List } from 'react-native-paper'
import { IconSource } from 'react-native-paper/lib/typescript/components/Icon'

type SettingList = {
    key: string;
    title: string;
    description: string;
    icon: IconSource;
    href: string;
}

const SettingsPage = () => {
    const isTablet = useIsTablet()
    const scheme = useColorScheme()
    const resolvedScheme = scheme === 'unspecified' ? 'light' : scheme ?? 'light'
    const colors = Colors[resolvedScheme]

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
