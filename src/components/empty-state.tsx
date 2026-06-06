import { Colors } from '@/constants/theme';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, useColorScheme } from 'react-native';
import { Icon } from 'react-native-paper';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

const EmptyState = () => {
    const scheme = useColorScheme();
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

    const handleCreateChat = () => {
        router.push('/create-chat');
    }

    return (
        <ThemedView style={[styles.emptyContainer, { backgroundColor: colors.background }]}>
            <ThemedView style={styles.buttonsContainer}>
                <Pressable onPress={handleCreateChat} style={styles.buttonContainer}>
                    <ThemedView style={[styles.iconContainer, { backgroundColor: colors.card }]}>
                        <Icon source="account-plus-outline" color={colors.text} size={26} />
                    </ThemedView>
                    <ThemedText style={styles.buttonTitle}>
                        Contact
                    </ThemedText>
                </Pressable>
                <Pressable onPress={handleCreateChat} style={styles.buttonContainer}>
                    <ThemedView style={[styles.iconContainer, { backgroundColor: colors.card }]}>
                        <Icon source="account-multiple-plus-outline" color={colors.text} size={26} />
                    </ThemedView>
                    <ThemedText style={styles.buttonTitle}>
                        Group
                    </ThemedText>
                </Pressable>
            </ThemedView>
            <ThemedView style={{ flexDirection: 'row', alignItems: 'flex-start', width: 'auto', marginHorizontal: 'auto', gap: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: 'transparent' }}>
                <Icon
                    source="chat-plus-outline"
                    color={colors.textSecondary}
                    size={20}
                />
                <ThemedText style={{ fontSize: 14, fontWeight: '400', color: colors.textSecondary, minWidth: 0, flexShrink: 1 }}>
                    To create new contact or new group, press on these buttons to start new chat
                </ThemedText>
            </ThemedView>
        </ThemedView>
    )
}

export default EmptyState

const styles = StyleSheet.create({
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 24,
        padding: 24
    },
    buttonsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 22
    },
    buttonContainer: {
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2
    },
    iconContainer: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 99,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonTitle: {
        fontSize: 14,
        fontWeight: '800'
    }
})