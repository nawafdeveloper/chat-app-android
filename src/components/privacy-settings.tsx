import { Colors } from '@/constants/theme';
import { useIsTablet } from '@/context/screen-checking-context';
import { rightNavRef } from '@/store/right-nav-ref';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, useColorScheme } from 'react-native';
import { List, Switch } from 'react-native-paper';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

type ListItem = {
    key: string;
    title: string;
    description: string;
    href: string;
};

type SwitchItem = {
    key: string;
    title: string;
    description: string;
    isEnabled: boolean;
    setEnable: React.Dispatch<React.SetStateAction<boolean>>;
};

const PrivacySettings = () => {
    const isTablet = useIsTablet()
    const scheme = useColorScheme();
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme ?? 'light'];

    const [readReceipts, setReadReceipts] = useState(true);
    const [blockUnknown, setBlockUnknown] = useState(false);
    const [linkPreview, setLinkPreview] = useState(false);

    const firstListItems: ListItem[] = [
        {
            key: 'last-seen',
            title: 'Last seen & online',
            description: 'Control who can see when you were last active',
            href: 'last-seen-settings'
        },
        {
            key: 'profile-picture',
            title: 'Profile picture',
            description: 'Manage who can view your profile photo',
            href: 'profile-seen-settings'
        },
        {
            key: 'about',
            title: 'About',
            description: 'Choose who can see your bio and information',
            href: 'about-seen-settings'
        },
    ];

    const secondListItems: ListItem[] = [
        {
            key: 'blocked-contacts',
            title: 'Blocked contacts',
            description: 'View and manage blocked contacts',
            href: 'blocked-contacts-settings'
        },
    ];

    const switchsListItems: SwitchItem[] = [
        {
            key: 'link-preview',
            title: 'Disable link previews',
            description: `To help protect your IP address, previews for the links you share in chats will no longer be generated.`,
            isEnabled: linkPreview,
            setEnable: setLinkPreview
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
        <ScrollView style={{ flex: 1 }}>
            <ThemedView style={styles.main}>
                <ThemedView style={styles.sectionContainer}>
                    <ThemedText style={[styles.sectionTitle, { color: colors.textSecondary }]}>Who can see my personal information</ThemedText>
                    {firstListItems.map((item) => (
                        <List.Item
                            key={item.key}
                            title={item.title}
                            description={item.description}
                            descriptionStyle={{ color: colors.textSecondary }}
                            onPress={() => handleNavigateToSubSetting(item.href)}
                            style={{ borderBottomWidth: 1, borderBottomColor: colors.indicator + '33' }}
                        />
                    ))}
                </ThemedView>
                <ThemedView style={styles.sectionContainer}>
                    <ThemedText style={[styles.sectionTitle, { color: colors.textSecondary }]}>Privacy and security</ThemedText>
                    {secondListItems.slice(0, 1).map((item) => (
                        <List.Item
                            key={item.key}
                            title={item.title}
                            description={item.description}
                            descriptionStyle={{ color: colors.textSecondary }}
                            onPress={() => handleNavigateToSubSetting(item.href)}
                            style={{ borderBottomWidth: 1, borderBottomColor: colors.indicator + '33' }}
                        />
                    ))}
                </ThemedView>
                {secondListItems.slice(1, 3).map((item) => (
                    <List.Item
                        key={item.key}
                        title={item.title}
                        description={item.description}
                        descriptionStyle={{ color: colors.textSecondary }}
                        onPress={() => handleNavigateToSubSetting(item.href)}
                        style={{ borderBottomWidth: 1, borderBottomColor: colors.indicator + '33' }}
                    />
                ))}
                <ThemedView style={styles.sectionContainer}>
                    <ThemedText style={[styles.sectionTitle, { color: colors.textSecondary }]}>Advanced</ThemedText>
                    {switchsListItems.map((item) => (
                        <List.Item
                            key={item.key}
                            title={item.title}
                            description={item.description}
                            descriptionStyle={{ color: colors.textSecondary }}
                            style={{ borderBottomWidth: 1, borderBottomColor: colors.indicator + '33' }}
                            right={() => (
                                <Switch
                                    value={item.isEnabled}
                                    onValueChange={item.setEnable}
                                    color='#25D366'
                                />
                            )}
                        />
                    ))}
                </ThemedView>
            </ThemedView>
        </ScrollView>
    )
}

export default PrivacySettings

const styles = StyleSheet.create({
    main: {
        flex: 1,
        width: '100%',
        padding: 16,
        gap: 24
    },
    sectionContainer: {
        flex: 1,
        gap: 10
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '400'
    }
})