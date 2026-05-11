import { ChatAvatar } from '@/components/decrypted-chat-avatar'
import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { Colors } from '@/constants/theme'
import { formatPhoneNumber } from '@/helper/phone-formatter'
import { useActiveChatStore } from '@/store/use-active-chat-store'
import { useRoute } from '@react-navigation/native'
import { router, useLocalSearchParams } from 'expo-router'
import React from 'react'
import { StyleSheet, useColorScheme } from 'react-native'
import { ScrollView } from 'react-native-gesture-handler'
import { Appbar, IconButton } from 'react-native-paper'

const TargetUserProfile = () => {
    const scheme = useColorScheme()
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme ?? 'light']

    const params = useLocalSearchParams<{ chatId?: string | string[] }>();
    const navigationRoute = useRoute();
    const nativeChatId = (navigationRoute.params as { chatId?: string | string[] } | undefined)?.chatId;
    const expoChatId = Array.isArray(params.chatId) ? params.chatId[0] : params.chatId;
    const nativeRouteChatId = Array.isArray(nativeChatId) ? nativeChatId[0] : nativeChatId;
    const routeChatId = expoChatId ?? nativeRouteChatId;
    const selectedChatId = useActiveChatStore((state) => state.selectedChatId);
    const activeChatId = routeChatId ?? selectedChatId;
    const activeChat = useActiveChatStore((state) =>
        activeChatId
            ? state.chats.find((chat) => chat.chat_id === activeChatId) ?? null
            : null
    );
    const chatTitle = activeChat?.display_name ?? activeChat?.contact_phone ?? 'Chat';
    const avatarTint = colors.text;

    return (
        <ThemedView style={styles.main}>
            <Appbar.Header style={{ backgroundColor: colors.background }}>
                <Appbar.BackAction onPress={() => router.back()}/>
            </Appbar.Header>
            <ScrollView style={{ flex: 1 }}>
                <ThemedView style={styles.topContentContainer}>
                    <ChatAvatar
                        userId={
                            activeChat?.recipient_user_id ??
                            activeChat?.chat_id ??
                            activeChatId
                        }
                        imageUrl={activeChat?.avatar}
                        displayName={chatTitle}
                        contactPhone={activeChat?.contact_phone}
                        style={styles.avatar}
                        iconColor={avatarTint}
                        backgroundColor={colors.card}
                        textColor={avatarTint}
                    />
                    <ThemedView style={{ flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
                        <ThemedText style={{ fontSize: 22, fontWeight: '600' }} numberOfLines={1}>{chatTitle}</ThemedText>
                        <ThemedText numberOfLines={1} style={{ color: colors.textSecondary }}>
                            {formatPhoneNumber(activeChat?.contact_phone)}
                        </ThemedText>
                    </ThemedView>
                    <ThemedView style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                        <IconButton
                            icon="message-fast"
                            iconColor={'#25D366'}
                            mode="contained"
                            containerColor={colors.indicator + '33'}
                            size={32}
                        />
                        <IconButton
                            icon="account-plus"
                            iconColor={'#25D366'}
                            mode="contained"
                            containerColor={colors.indicator + '33'}
                            size={32}
                        />
                    </ThemedView>
                </ThemedView>
            </ScrollView>
        </ThemedView>
    )
}

export default TargetUserProfile

const styles = StyleSheet.create({
    main: {
        flex: 1
    },
    topContentContainer: {
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 20
    },
    avatar: {
        width: 145,
        height: 145,
        borderRadius: 99,
        alignItems: 'center',
        justifyContent: 'center',
    },
})