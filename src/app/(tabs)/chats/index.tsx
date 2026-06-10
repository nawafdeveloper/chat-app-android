import { NewChatFilledIcon, NewChatIcon } from '@/components/chat-icon'
import { MemoChatListItem } from '@/components/chat-list-item'
import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { Colors } from '@/constants/theme'
import { useIsTablet } from '@/context/screen-checking-context'
import { db } from '@/db/client'
import { contacts, currentUser, chats as dbChats, encryptedMedia, messages, pendingRealtimeEvents } from '@/db/schema'
import { deleteToken } from '@/helper/user-session'
import { authClient } from '@/lib/auth-client'
import { deleteMobilePushToken, getDecryptedDbMessagePage, MESSAGE_PAGE_SIZE } from '@/lib/chat-sync'
import { clearAllSensitiveData } from '@/lib/crypto-storage'
import { deleteCachedLocalMediaFiles } from '@/lib/message-media'
import { upsertDbChats } from '@/lib/upsert-db-chats'
import { useAuthStore } from '@/store/auth-store'
import { useNotificationNavigationStore } from '@/store/notification-navigation-store'
import { useNotificationStore } from '@/store/notification-store'
import { rightNavRef } from '@/store/right-nav-ref'
import { useActiveChatStore } from '@/store/use-active-chat-store'
import { useLogoutLoadingState } from '@/store/use-logout-loading-state'
import { useRealtimeStore } from '@/store/use-realtime-store'
import { ChatItemType } from '@/types/chats.type'
import { BasicAlertDialog, Column, Button as ComposeButton, Text as ComposeText, Host, Row, Spacer, Surface, TextButton } from '@expo/ui/jetpack-compose'
import { clip, fillMaxWidth, height, padding, Shapes, width, wrapContentHeight, wrapContentWidth } from '@expo/ui/jetpack-compose/modifiers'
import { MaterialIcons } from '@expo/vector-icons'
import { FlashList } from '@shopify/flash-list'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    InteractionManager,
    Platform,
    StyleSheet,
    useColorScheme,
    View
} from 'react-native'
import { ActivityIndicator, Appbar, FAB, Icon, Menu, Searchbar } from 'react-native-paper'

const SCROLL_THRESHOLD = 10
const APP_GREEN = '#25D366'
const CHAT_DEBUG = true
const API_BASE_URL = 'https://web.yahla.org'

type ChatPreferenceKey =
    | 'is_archived_chat'
    | 'is_pinned_chat'

const preferenceRequestKeys: Record<ChatPreferenceKey, string> = {
    is_archived_chat: 'isArchived',
    is_pinned_chat: 'isPinned',
}

async function patchChatAction(body: Record<string, unknown>) {
    const response = await fetch(`${API_BASE_URL}/api/chats`, {
        method: 'PATCH',
        headers: {
            Cookie: authClient.getCookie() ?? '',
            'Content-Type': 'application/json',
        },
        credentials: 'omit',
        body: JSON.stringify(body),
    })

    if (!response.ok) {
        throw new Error('Failed to update chat.')
    }
}

function debugChatsPage(stage: string, payload: Record<string, unknown> = {}) {
    if (!CHAT_DEBUG) {
        return
    }

}

function summarizeChatForDebug(chat: ChatItemType) {
    return {
        id: chat.chat_id,
        type: chat.chat_type,
        displayName: chat.display_name,
        recipientUserId: chat.recipient_user_id,
        lastMessageId: chat.last_message_id,
        lastMessageMedia: chat.last_message_media,
        lastMessageTextLength: chat.last_message_context?.length ?? 0,
        unread: chat.unreaded_messages_length,
        isUnread: chat.is_unreaded_chat,
        updatedAt: chat.updated_at instanceof Date
            ? chat.updated_at.toISOString()
            : String(chat.updated_at),
    }
}

const openChat = (chatId: string) => {
    debugChatsPage('open-chat-start', {
        chatId,
        rightNavReady: rightNavRef.isReady(),
        previousSelectedChatId: useActiveChatStore.getState().selectedChatId,
    })
    useActiveChatStore.getState().setSelectedChatId(chatId)

    if (rightNavRef.isReady()) {
        debugChatsPage('open-chat-right-nav', { chatId })
        rightNavRef.navigate('chatId', { chatId })
        return
    }

    debugChatsPage('open-chat-router', { chatId })
    router.navigate({
        pathname: '/chatId',
        params: { chatId },
    })
}

type AppbarIconProps = {
    color: string
    size: number
}

const createAppbarIcon = (
    name: React.ComponentProps<typeof MaterialIcons>['name'],
    displayName: string
) => {
    const Icon = ({ color, size }: AppbarIconProps) => (
        <MaterialIcons name={name} color={color} size={size} />
    )

    Icon.displayName = displayName

    return Icon
}

const CloseAppbarIcon = createAppbarIcon('close', 'CloseAppbarIcon')
const ArchiveAppbarIcon = createAppbarIcon('archive', 'ArchiveAppbarIcon')
const PinAppbarIcon = createAppbarIcon('push-pin', 'PinAppbarIcon')

const toggleSelection = (currentSelection: Set<string>, chatId: string) => {
    const nextSelection = new Set(currentSelection)

    if (nextSelection.has(chatId)) {
        nextSelection.delete(chatId)
    } else {
        nextSelection.add(chatId)
    }

    return nextSelection
}

const ChatsPage = () => {
    const { data: session } = authClient.useSession();
    const chats = useActiveChatStore((state) => state.chats);
    const chatsLoading = useActiveChatStore((state) => state.chatsLoading);
    const upsertChat = useActiveChatStore((state) => state.upsertChat);
    const realtimeStatus = useRealtimeStore((state) => state.status);
    const { setHasSession } = useAuthStore();
    const isTablet = useIsTablet();
    const pendingNotificationChatId = useNotificationNavigationStore((state) => state.pendingChatId);
    const clearPendingNotificationChatId = useNotificationNavigationStore((state) => state.clearPendingChatId);

    const scheme = useColorScheme()
    const resolvedScheme = scheme === 'unspecified' ? 'light' : scheme ?? 'light'
    const colors = Colors[resolvedScheme]

    const { logoutLoading, setLogoutLoading } = useLogoutLoadingState()

    const [isSearchFocus, setIsSearchFocus] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [appbarBg, setAppbarBg] = useState<string>(colors.background)
    const [selectedChatIds, setSelectedChatIds] = useState<Set<string>>(new Set())
    const [isUpdatingSelection, setIsUpdatingSelection] = useState(false)
    const [visible, setVisible] = useState(false);
    const [logoutDialogVisible, setLogoutDialogVisible] = useState(false);
    const ignoreNextChatPressRef = useRef<string | null>(null);
    const isScrolledRef = useRef(false);

    const openMenu = () => setVisible(true);

    const closeMenu = () => setVisible(false);

    const isSelectionMode = selectedChatIds.size > 0

    debugChatsPage('render', {
        userId: session?.user.id,
        chatsCount: chats.length,
        chatsLoading,
        realtimeStatus,
        selectedChatIds: Array.from(selectedChatIds),
        isSelectionMode,
        isSearchFocus,
        searchQueryLength: searchQuery.length,
        firstChat: chats[0] ? summarizeChatForDebug(chats[0]) : null,
        latestChat: chats.at(-1) ? summarizeChatForDebug(chats.at(-1) as ChatItemType) : null,
    })

    useEffect(() => {
        setAppbarBg(colors.background)
    }, [scheme]);

    useEffect(() => {
        debugChatsPage('store-state-updated', {
            chatsCount: chats.length,
            chatsLoading,
            realtimeStatus,
            chats: chats.slice(0, 8).map(summarizeChatForDebug),
        })
    }, [chats, chatsLoading, realtimeStatus])

    const handleScroll = useCallback((e: any) => {
        const offsetY = e.nativeEvent.contentOffset.y
        const isScrolled = offsetY > SCROLL_THRESHOLD

        if (isScrolledRef.current === isScrolled) {
            return
        }

        debugChatsPage('scroll-threshold-change', { offsetY, isScrolled })
        isScrolledRef.current = isScrolled
        setAppbarBg(isScrolled ? colors.card : colors.background)
    }, [colors.background, colors.card])

    const clearSelection = useCallback(() => {
        debugChatsPage('selection-clear', {
            selectedChatIds: Array.from(selectedChatIds),
        })
        setSelectedChatIds(new Set())
    }, [selectedChatIds])

    const setSelectedChatPreference = useCallback(async (
        key: ChatPreferenceKey,
        getValue: (chat: ChatItemType, selectedChats: ChatItemType[]) => boolean
    ) => {
        if (selectedChatIds.size === 0 || isUpdatingSelection) {
            return
        }

        const selectedIds = [...selectedChatIds]
        const selectedChats = useActiveChatStore
            .getState()
            .chats
            .filter((chat) => selectedIds.includes(chat.chat_id))

        if (selectedChats.length === 0) {
            clearSelection()
            return
        }

        const previousChats = selectedChats
        const nextChats = selectedChats.map((chat) => ({
            ...chat,
            [key]: getValue(chat, selectedChats),
        }))

        setIsUpdatingSelection(true)
        nextChats.forEach(upsertChat)
        void upsertDbChats(nextChats).catch((error) => {
            console.log('Failed to persist chat preference locally:', error)
        })

        try {
            await Promise.all(
                nextChats.map((chat) =>
                    patchChatAction({
                        chatId: chat.chat_id,
                        [preferenceRequestKeys[key]]: chat[key],
                    })
                )
            )
            clearSelection()
        } catch (error) {
            previousChats.forEach(upsertChat)
            void upsertDbChats(previousChats).catch((persistError) => {
                console.log('Failed to restore chat preference locally:', persistError)
            })
            console.log('Failed to update selected chats:', error)
        } finally {
            setIsUpdatingSelection(false)
        }
    }, [clearSelection, isUpdatingSelection, selectedChatIds, upsertChat])

    const handleArchiveSelectedChats = useCallback(() => {
        void setSelectedChatPreference('is_archived_chat', () => true)
    }, [setSelectedChatPreference])

    const handlePinSelectedChats = useCallback(() => {
        const selectedChats = chats.filter((chat) => selectedChatIds.has(chat.chat_id))
        const shouldPin = selectedChats.some((chat) => !chat.is_pinned_chat)

        void setSelectedChatPreference('is_pinned_chat', () => shouldPin)
    }, [chats, selectedChatIds, setSelectedChatPreference])

    const primeMessagesFromCache = useCallback((chatId: string) => {
        const currentUserId = session?.user.id;
        debugChatsPage('prime-cache-start', { chatId, currentUserId });
        if (!currentUserId) {
            debugChatsPage('prime-cache-skip-no-user', { chatId });
            return;
        }
        void getDecryptedDbMessagePage({
            chatId,
            currentUserId,
        }).then((cachedMessages) => {
            debugChatsPage('prime-cache-loaded', {
                chatId,
                cachedMessagesCount: cachedMessages.length,
                firstMessageId: cachedMessages[0]?.message_id,
                lastMessageId: cachedMessages.at(-1)?.message_id,
            });
            if (cachedMessages.length === 0) return;

            const {
                replaceMessages,
                setHasOlderMessages,
            } = useActiveChatStore.getState();

            replaceMessages(chatId, cachedMessages);
            setHasOlderMessages(chatId, cachedMessages.length === MESSAGE_PAGE_SIZE);
        }).catch((error) => {
            debugChatsPage('prime-cache-error', { chatId, error });
        });
    }, [session?.user.id]);

    useEffect(() => {
        if (!pendingNotificationChatId) {
            return;
        }

        let isCancelled = false;
        let retryTimeout: ReturnType<typeof setTimeout> | null = null;
        const chatId = pendingNotificationChatId;

        const finishNavigation = () => {
            clearPendingNotificationChatId(chatId);
            primeMessagesFromCache(chatId);
        };

        const navigateToPendingChat = (attempt = 0) => {
            if (isCancelled) {
                return;
            }

            useActiveChatStore.getState().setSelectedChatId(chatId);

            if (rightNavRef.isReady()) {
                debugChatsPage('notification-open-chat-right-nav', { chatId, attempt });
                rightNavRef.navigate('chatId', { chatId });
                finishNavigation();
                return;
            }

            if (isTablet && attempt < 10) {
                retryTimeout = setTimeout(() => {
                    navigateToPendingChat(attempt + 1);
                }, 50);
                return;
            }

            debugChatsPage('notification-open-chat-router', { chatId, attempt });
            router.navigate({
                pathname: '/chatId',
                params: { chatId },
            });
            finishNavigation();
        };

        const interaction = InteractionManager.runAfterInteractions(() => {
            requestAnimationFrame(() => {
                navigateToPendingChat();
            });
        });

        return () => {
            isCancelled = true;
            interaction.cancel?.();
            if (retryTimeout) {
                clearTimeout(retryTimeout);
            }
        };
    }, [
        clearPendingNotificationChatId,
        isTablet,
        pendingNotificationChatId,
        primeMessagesFromCache,
    ]);

    const handleChatPress = useCallback((chatId: string) => {
        debugChatsPage('handle-chat-press', {
            chatId,
            ignoreNextChatPress: ignoreNextChatPressRef.current,
            isSelectionMode,
        });
        if (ignoreNextChatPressRef.current === chatId) {
            ignoreNextChatPressRef.current = null;
            debugChatsPage('handle-chat-press-ignored-after-long-press', { chatId });
            return;
        }

        if (isSelectionMode) {
            debugChatsPage('handle-chat-press-toggle-selection', { chatId });
            setSelectedChatIds((currentSelection) => toggleSelection(currentSelection, chatId));
            return;
        }

        debugChatsPage('handle-chat-press-open', { chatId });
        openChat(chatId);
        InteractionManager.runAfterInteractions(() => {
            debugChatsPage('after-interactions-prime-cache', { chatId });
            primeMessagesFromCache(chatId);
        });
    }, [isSelectionMode, primeMessagesFromCache]);

    const handleChatLongPress = useCallback((chatId: string) => {
        debugChatsPage('handle-chat-long-press', { chatId });
        ignoreNextChatPressRef.current = chatId;
        setTimeout(() => {
            if (ignoreNextChatPressRef.current === chatId) {
                ignoreNextChatPressRef.current = null;
                debugChatsPage('long-press-ignore-window-expired', { chatId });
            }
        }, 700);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setIsSearchFocus(false);
        setSelectedChatIds((currentSelection) => {
            if (currentSelection.size === 0) return new Set([chatId]);
            return toggleSelection(currentSelection, chatId);
        });
    }, []);

    const confirmLogout = async () => {
        debugChatsPage('logout-confirm-start', { userId: session?.user.id });
        try {
            setLogoutLoading(true);

            await deleteCachedLocalMediaFiles();

            await db.transaction(async (tx) => {
                await tx.delete(encryptedMedia);
                await tx.delete(pendingRealtimeEvents);
                await tx.delete(messages);
                await tx.delete(dbChats);
                await tx.delete(contacts);
                await tx.delete(currentUser);
            });

            await clearAllSensitiveData();

            try {
                await deleteMobilePushToken({ cookies: authClient.getCookie() });
            } catch (error) {
                console.log('Failed to clear push token:', error);
            }

            await deleteToken();
            setHasSession(false);
            useNotificationStore.getState().setExpoPushToken('');
            useActiveChatStore.getState().reset();

            await authClient.signOut();
            void authClient.getSession();
        } catch (error) {
            debugChatsPage('logout-confirm-error', { error });
            console.log(error);
        } finally {
            debugChatsPage('logout-confirm-finish', { userId: session?.user.id });
            setLogoutLoading(false);
        }
    };

    const handleLogout = () => {
        debugChatsPage('logout-menu-press', { userId: session?.user.id });
        closeMenu();
        setLogoutDialogVisible(true);
    };

    const filteredChats = useMemo(() => chats.filter((chat) => {
        const matchesSearch =
            chat.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            chat.last_message_context.toLowerCase().includes(searchQuery.toLowerCase()) ||
            chat.contact_phone?.includes(searchQuery);
        return !chat.is_archived_chat && matchesSearch;
    }), [chats, searchQuery]);

    const pinnedChats = useMemo(() => filteredChats.filter((chat) => chat.is_pinned_chat), [filteredChats]);
    const recentChats = useMemo(() => filteredChats.filter((chat) => !chat.is_pinned_chat), [filteredChats]);

    useEffect(() => {
        debugChatsPage('derived-lists-updated', {
            filteredCount: filteredChats.length,
            pinnedCount: pinnedChats.length,
            recentCount: recentChats.length,
            pinnedIds: pinnedChats.map((chat) => chat.chat_id),
            recentIds: recentChats.slice(0, 10).map((chat) => chat.chat_id),
        })
    }, [filteredChats, pinnedChats, recentChats])

    const renderHeader = useCallback(() => (
        <>
            {pinnedChats.length > 0 && (
                <>
                    <ThemedText style={[styles.sectionLabel, { color: colors.textSecondary }]}>Pinned</ThemedText>
                    {pinnedChats.map((item) => (
                        <MemoChatListItem
                            key={item.chat_id}
                            item={item}
                            colors={colors}
                            isSelected={selectedChatIds.has(item.chat_id)}
                            isSelectionMode={isSelectionMode}
                            onPress={handleChatPress}
                            onLongPress={handleChatLongPress}
                        />
                    ))}
                </>
            )}

            {recentChats.length > 0 && (
                <ThemedText style={[styles.sectionLabel, { color: colors.textSecondary }]}>
                    {pinnedChats.length > 0 ? 'Recent' : 'Chats'}
                </ThemedText>
            )}
        </>
    ), [pinnedChats, recentChats, colors, selectedChatIds, isSelectionMode, handleChatPress, handleChatLongPress]);

    const renderItem = useCallback(({ item }: { item: ChatItemType }) => {
        debugChatsPage('flash-list-render-item', {
            chat: summarizeChatForDebug(item),
            isSelected: selectedChatIds.has(item.chat_id),
            isSelectionMode,
        })

        return (
            <MemoChatListItem
                item={item}
                colors={colors}
                isSelected={selectedChatIds.has(item.chat_id)}
                isSelectionMode={isSelectionMode}
                onPress={handleChatPress}
                onLongPress={handleChatLongPress}
            />
        )
    }, [colors, selectedChatIds, isSelectionMode, handleChatPress, handleChatLongPress]);

    if (logoutLoading) {
        debugChatsPage('render-logout-loading', { userId: session?.user.id })
        return (
            <ThemedView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ThemedView style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <ActivityIndicator size={'small'} color={colors.text} />
                    <ThemedText>Logging out from account</ThemedText>
                </ThemedView>
            </ThemedView>
        )
    }

    return (
        <ThemedView style={styles.main}>
            <Host matchContents style={styles.logoutDialogHost} colorScheme={resolvedScheme}>
                {logoutDialogVisible && (
                    <BasicAlertDialog
                        onDismissRequest={() => setLogoutDialogVisible(false)}
                        properties={{
                            dismissOnBackPress: true,
                            dismissOnClickOutside: true,
                            usePlatformDefaultWidth: true,
                        }}
                    >
                        <Surface
                            color={colors.background}
                            contentColor={colors.text}
                            tonalElevation={6}
                            shadowElevation={8}
                            modifiers={[
                                wrapContentWidth(),
                                wrapContentHeight(),
                                clip(Shapes.RoundedCorner(18)),
                            ]}
                        >
                            <Column modifiers={[padding(22, 20, 22, 18)]}>
                                <ComposeText
                                    color={colors.text}
                                    style={{
                                        typography: 'titleMedium',
                                        fontWeight: '700',
                                    }}
                                >
                                    Logout from account?
                                </ComposeText>
                                <Spacer modifiers={[height(10)]} />
                                <ComposeText
                                    color={colors.textSecondary}
                                    style={{
                                        typography: 'bodyMedium',
                                        lineHeight: 20,
                                    }}
                                >
                                    All chats, messages, images, videos, files, and cached media saved on this device will be deleted.
                                </ComposeText>
                                <Spacer modifiers={[height(22)]} />
                                <Row
                                    horizontalArrangement="end"
                                    verticalAlignment="center"
                                    modifiers={[fillMaxWidth()]}
                                >
                                    <TextButton onClick={() => setLogoutDialogVisible(false)}>
                                        <ComposeText color={colors.textSecondary}>Cancel</ComposeText>
                                    </TextButton>
                                    <Spacer modifiers={[width(8)]} />
                                    <ComposeButton
                                        onClick={() => {
                                            setLogoutDialogVisible(false);
                                            void confirmLogout();
                                        }}
                                        colors={{
                                            containerColor: '#D92D20',
                                            contentColor: '#FFFFFF',
                                        }}
                                    >
                                        <ComposeText color="#FFFFFF">Logout</ComposeText>
                                    </ComposeButton>
                                </Row>
                            </Column>
                        </Surface>
                    </BasicAlertDialog>
                )}
            </Host>
            <Appbar.Header
                style={[
                    styles.appbar,
                    {
                        backgroundColor: isSelectionMode ? colors.card : appbarBg,
                        paddingRight: isSearchFocus && !isSelectionMode ? 16 : 0,
                    },
                ]}
                statusBarHeight={isTablet ? 4 : undefined}
            >
                {isSelectionMode ? (
                    <>
                        <Appbar.Action icon={CloseAppbarIcon} onPress={clearSelection} />
                        <Appbar.Content
                            title={String(selectedChatIds.size)}
                            titleStyle={styles.selectionCount}
                        />
                        <Appbar.Action
                            icon={ArchiveAppbarIcon}
                            disabled={isUpdatingSelection}
                            onPress={handleArchiveSelectedChats}
                        />
                        <Appbar.Action
                            icon={PinAppbarIcon}
                            disabled={isUpdatingSelection}
                            onPress={handlePinSelectedChats}
                        />
                    </>
                ) : (
                    <>
                        <Appbar.Content title="YaHla" titleStyle={styles.appbarTitle} />
                        <Menu
                            visible={visible}
                            onDismiss={closeMenu}
                            anchorPosition='bottom'
                            contentStyle={{ backgroundColor: colors.background }}
                            anchor={<Appbar.Action icon="dots-vertical" onPress={() => {
                                debugChatsPage('menu-open', { userId: session?.user.id })
                                openMenu()
                            }} />}>
                            <Menu.Item onPress={handleLogout} title="Logout" leadingIcon={'logout'} />
                        </Menu>
                    </>
                )}
            </Appbar.Header>
            <ThemedView style={{ paddingHorizontal: 16 }}>
                <Searchbar
                    placeholder="Search"
                    onChangeText={(text) => {
                        debugChatsPage('search-change', { textLength: text.length });
                        setSearchQuery(text);
                    }}
                    value={searchQuery}
                    icon="magnify"
                    style={{ backgroundColor: colors.card }}
                    cursorColor={APP_GREEN}
                />
            </ThemedView>
            <FlashList
                data={recentChats}
                keyExtractor={(item) => item.chat_id}
                ListHeaderComponent={renderHeader}
                renderItem={renderItem}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                removeClippedSubviews={Platform.OS === 'android'}
                ListHeaderComponentStyle={{ gap: 6 }}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={!chatsLoading ? (
                    <View style={styles.emptyContainer}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                            <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
                                You have no chats yet, to create a new chat press the
                            </ThemedText>
                            <NewChatIcon size={18} color={colors.textSecondary} />
                            <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
                                green floating button
                            </ThemedText>
                        </View>
                    </View>
                ) : null}
                ListFooterComponent={
                    <ThemedView style={{ backgroundColor: 'transparent', paddingHorizontal: 16, paddingVertical: 8, gap: 16, borderBottomWidth: 1, borderBottomColor: colors.indicator + '44' }}>
                        {realtimeStatus === 'connecting' && (
                            <ActivityIndicator size={'small'} color={APP_GREEN} />
                        )}
                        <ThemedView style={{ flexDirection: 'row', alignItems: 'center', width: 'auto', marginHorizontal: 'auto', gap: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: 'transparent' }}>
                            <Icon
                                source="lock-check-outline"
                                color={colors.textSecondary}
                                size={13}
                            />
                            <ThemedText style={{ fontSize: 12, fontWeight: '400', color: colors.textSecondary }}>
                                All of your messages are end-to-end encrypted.
                            </ThemedText>
                        </ThemedView>
                    </ThemedView>
                }
            />
            {!isSelectionMode && !isTablet && (
                <FAB
                    icon={() => <NewChatFilledIcon size={24} color={colors.background} />}
                    style={styles.fab}
                    onPress={() => {
                        debugChatsPage('create-chat-press', { userId: session?.user.id })
                        router.push('/create-chat')
                    }}
                />
            )}
        </ThemedView>
    )
}

export default ChatsPage

const styles = StyleSheet.create({
    main: { flex: 1 },
    logoutDialogHost: {
        position: 'absolute',
        zIndex: 20,
    },
    appbar: {
        paddingLeft: 16,
    },
    appbarTitle: {
        fontWeight: '700',
    },
    selectionCount: {
        fontWeight: '700',
    },
    listContent: {
        paddingBottom: 80,
        gap: 6
    },
    sectionLabel: {
        fontSize: 12,
        fontWeight: '600',
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
    },
    emptyContainer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        padding: 16,
    },
    emptyText: {
        fontSize: 14,
        minWidth: 0,
    },
    fab: {
        position: 'absolute',
        margin: 16,
        right: 0,
        bottom: 0,
        backgroundColor: '#25D366'
    }
})
