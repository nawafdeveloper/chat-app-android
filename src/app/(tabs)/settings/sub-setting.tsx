import PrivacySettings from '@/components/privacy-settings'
import { ThemedView } from '@/components/themed-view'
import { Colors } from '@/constants/theme'
import { rightNavRef } from '@/store/right-nav-ref'
import { RouteProp } from '@react-navigation/native'
import { router, useLocalSearchParams } from 'expo-router'
import React from 'react'
import { StyleSheet, useColorScheme } from 'react-native'
import { Appbar } from 'react-native-paper'

type SubSettingPageProps = {
    route?: RouteProp<{ subSetting: { href: string } }, 'subSetting'>
}

const SubSettingPage = ({ route }: SubSettingPageProps) => {
    const localParams = useLocalSearchParams<{ href?: string }>();
    const href = route?.params?.href ?? localParams.href;
    const scheme = useColorScheme()
    const resolvedScheme = scheme === 'unspecified' ? 'light' : scheme ?? 'light'
    const colors = Colors[resolvedScheme]

    const handleBack = () => {
        if (rightNavRef.isReady()) {
            rightNavRef.goBack()
            return
        }

        router.back()
    }

    const getTitle = () => {
        switch (href) {
            case 'general-settings':
                return 'General';
            case 'profile-settings':
                return 'Profile';
            case 'account-settings':
                return 'Account';
            case 'privacy-settings':
                return 'Privacy';
            case 'chats-settings':
                return 'Chats';
            case 'notifications-settings':
                return 'Notifications';
            case 'help-settings':
                return 'Help Center';
            default: return null;
        };
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
                <Appbar.BackAction onPress={handleBack} />
                <Appbar.Content title={getTitle()} />
            </Appbar.Header>
                <PrivacySettings />
        </ThemedView>
    )
}

export default SubSettingPage

const styles = StyleSheet.create({
    main: {
        flex: 1
    }
})
