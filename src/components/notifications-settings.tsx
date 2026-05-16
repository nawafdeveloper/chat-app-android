import { Colors } from '@/constants/theme'
import { authClient } from '@/lib/auth-client'
import React, { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, useColorScheme } from 'react-native'
import { List, Switch } from 'react-native-paper'
import { ThemedText } from './themed-text'
import { ThemedView } from './themed-view'

type NotificationSettingKey = 'disableMessagesNotifications' | 'disableGroupsNotifications'

type NotificationSwitchItem = {
    key: NotificationSettingKey
    title: string
    description: string
    icon: string
}

const notificationItems: NotificationSwitchItem[] = [
    {
        key: 'disableMessagesNotifications',
        title: 'Message notifications',
        description: 'Receive notifications for direct chat messages',
        icon: 'message-text-outline',
    },
    {
        key: 'disableGroupsNotifications',
        title: 'Group notifications',
        description: 'Receive notifications for group messages',
        icon: 'account-group-outline',
    },
]

const NotificationsSettings = () => {
    const { data: session } = authClient.useSession()
    const scheme = useColorScheme()
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme ?? 'light']
    const [disableMessagesNotifications, setDisableMessagesNotifications] = useState(
        Boolean(session?.user.disableMessagesNotifications)
    )
    const [disableGroupsNotifications, setDisableGroupsNotifications] = useState(
        Boolean(session?.user.disableGroupsNotifications)
    )
    const [updatingKey, setUpdatingKey] = useState<NotificationSettingKey | null>(null)

    useEffect(() => {
        setDisableMessagesNotifications(Boolean(session?.user.disableMessagesNotifications))
        setDisableGroupsNotifications(Boolean(session?.user.disableGroupsNotifications))
    }, [
        session?.user.disableGroupsNotifications,
        session?.user.disableMessagesNotifications,
    ])

    const getDisabledValue = (key: NotificationSettingKey) =>
        key === 'disableMessagesNotifications'
            ? disableMessagesNotifications
            : disableGroupsNotifications

    const setDisabledValue = (key: NotificationSettingKey, value: boolean) => {
        if (key === 'disableMessagesNotifications') {
            setDisableMessagesNotifications(value)
            return
        }

        setDisableGroupsNotifications(value)
    }

    const handleNotificationChange = async (
        key: NotificationSettingKey,
        enabled: boolean
    ) => {
        if (updatingKey) {
            return
        }

        const previousDisabledValue = getDisabledValue(key)
        const nextDisabledValue = !enabled
        setDisabledValue(key, nextDisabledValue)
        setUpdatingKey(key)

        try {
            const { error } = await authClient.updateUser({
                [key]: nextDisabledValue,
            })

            if (error) {
                throw new Error(error.message || 'Failed to update notifications.')
            }
        } catch (error) {
            setDisabledValue(key, previousDisabledValue)
            console.log('Failed to update notifications:', error)
        } finally {
            setUpdatingKey(null)
        }
    }

    return (
        <ScrollView style={{ flex: 1 }}>
            <ThemedView style={styles.main}>
                <ThemedView style={styles.sectionContainer}>
                    <ThemedText style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                        Notifications
                    </ThemedText>
                    {notificationItems.map((item) => {
                        const enabled = !getDisabledValue(item.key)

                        return (
                            <List.Item
                                key={item.key}
                                title={item.title}
                                description={item.description}
                                descriptionStyle={{ color: colors.textSecondary }}
                                left={props => <List.Icon {...props} icon={item.icon} color={colors.textSecondary} />}
                                style={{ borderBottomWidth: 1, borderBottomColor: colors.indicator + '33' }}
                                right={() => (
                                    <Switch
                                        value={enabled}
                                        onValueChange={(nextEnabled) =>
                                            handleNotificationChange(item.key, nextEnabled)
                                        }
                                        disabled={updatingKey === item.key}
                                        color="#25D366"
                                    />
                                )}
                            />
                        )
                    })}
                </ThemedView>
            </ThemedView>
        </ScrollView>
    )
}

export default NotificationsSettings

const styles = StyleSheet.create({
    main: {
        flex: 1,
        width: '100%',
        padding: 16,
        gap: 24,
    },
    sectionContainer: {
        flex: 1,
        gap: 10,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '400',
    },
})
