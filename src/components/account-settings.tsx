import { Colors } from '@/constants/theme';
import { useIsTablet } from '@/context/screen-checking-context';
import { rightNavRef } from '@/store/right-nav-ref';
import { router } from 'expo-router';
import React from 'react';
import { FlatList, StyleSheet, useColorScheme } from 'react-native';
import { List } from 'react-native-paper';
import { IconSource } from 'react-native-paper/lib/typescript/components/Icon';
import { ThemedView } from './themed-view';

type ListItem = {
    key: string;
    lebel: string;
    icon: IconSource;
    href: string;
};

const AccountSettings = () => {
    const isTablet = useIsTablet()
    const scheme = useColorScheme();
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme ?? 'light'];

    const listItems: ListItem[] = [
        { key: 'security', lebel: 'Security notifications', icon: 'security', href: 'security-notification-settings' },
        { key: 'account-info', lebel: 'Request account info', icon: 'file-document-check-outline', href: 'account-info-settings' },
        { key: 'delete', lebel: 'How to delete my account', icon: 'information-outline', href: 'delete-settings' }
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
            <FlatList
                style={styles.settingsList}
                data={listItems}
                keyExtractor={(item) => item.key}
                renderItem={({ item }) => (
                    <List.Item
                        key={item.key}
                        title={item.lebel}
                        onPress={() => handleNavigateToSubSetting(item.href)}
                        left={props => <List.Icon {...props} icon={item.icon} color={colors.textSecondary} />}
                    />
                )}
            />
        </ThemedView>
    )
}

export default AccountSettings

const styles = StyleSheet.create({
    main: {
        flex: 1,
        width: '100%',
        padding: 16,
        gap: 24
    },
    settingsList: {
        flex: 1,
    }
})