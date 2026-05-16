import { MemoChatListItem } from '@/components/chat-list-item'
import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { Colors } from '@/constants/theme'
import { rightNavRef } from '@/store/right-nav-ref'
import { useActiveChatStore } from '@/store/use-active-chat-store'
import type { ChatItemType } from '@/types/chats.type'
import { FlashList } from '@shopify/flash-list'
import { router } from 'expo-router'
import React from 'react'
import { StyleSheet, useColorScheme, View } from 'react-native'
import { Appbar } from 'react-native-paper'

const openChat = (chatId: string) => {
    useActiveChatStore.getState().setSelectedChatId(chatId)

    if (rightNavRef.isReady()) {
        rightNavRef.navigate('chatId', { chatId })
        return
    }

    router.navigate({
        pathname: '/chatId',
        params: { chatId },
    })
}

const ArchivePage = () => {
    const chats = useActiveChatStore((state) => state.chats)
    const archivedChats = React.useMemo(
        () => chats.filter((chat) => chat.is_archived_chat),
        [chats]
    )
    const scheme = useColorScheme()
    const resolvedScheme = scheme === 'unspecified' ? 'light' : scheme ?? 'light'
    const colors = Colors[resolvedScheme]

    const renderItem = React.useCallback(({ item }: { item: ChatItemType }) => (
        <MemoChatListItem
            item={item}
            colors={colors}
            onPress={openChat}
        />
    ), [colors])

    return (
        <ThemedView style={styles.main}>
            <Appbar.Header style={{ backgroundColor: colors.background }}>
                <Appbar.Content
                    title="Archive"
                    subtitle="Archived chats stay hidden from your main chat list."
                />
            </Appbar.Header>
            <FlashList
                data={archivedChats}
                keyExtractor={(item) => item.chat_id}
                renderItem={renderItem}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={(
                    <View style={styles.emptyContainer}>
                        <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
                            No archived chats yet.
                        </ThemedText>
                    </View>
                )}
            />
        </ThemedView>
    )
}

export default ArchivePage

const styles = StyleSheet.create({
    main: {
        flex: 1
    },
    listContent: {
        paddingBottom: 80,
        gap: 6,
    },
    emptyContainer: {
        padding: 16,
    },
    emptyText: {
        fontSize: 14,
    },
})
