import { NewChatFilledIcon, NewChatIcon } from '@/components/chat-icon'
import { ChatAvatar } from '@/components/decrypted-chat-avatar'
import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { Colors } from '@/constants/theme'
import { db } from '@/db/client'
import { contacts, currentUser, chats as dbChats, encryptedMedia, messages, pendingRealtimeEvents } from '@/db/schema'
import { deleteToken } from '@/helper/user-session'
import { authClient } from '@/lib/auth-client'
import { deleteMobilePushToken, getDecryptedDbMessagePage, MESSAGE_PAGE_SIZE } from '@/lib/chat-sync'
import { clearAllSensitiveData } from '@/lib/crypto-storage'
import { deleteCachedLocalMediaFiles } from '@/lib/message-media'
import { useAuthStore } from '@/store/auth-store'
import { useNotificationStore } from '@/store/notification-store'
import { rightNavRef } from '@/store/right-nav-ref'
import { useActiveChatStore } from '@/store/use-active-chat-store'
import { useLogoutLoadingState } from '@/store/use-logout-loading-state'
import { useRealtimeStore } from '@/store/use-realtime-store'
import { ChatItemType } from '@/types/chats.type'
import { BasicAlertDialog, Column, Button as ComposeButton, Text as ComposeText, Host, Row, Spacer, Surface, TextButton } from '@expo/ui/jetpack-compose'
import { clip, fillMaxWidth, height, padding, Shapes, width, wrapContentHeight, wrapContentWidth } from '@expo/ui/jetpack-compose/modifiers'
import { MaterialIcons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import React, { useCallback, useMemo, useRef, useState } from 'react'
import {
    FlatList,
    InteractionManager,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    useColorScheme,
    View
} from 'react-native'
import { ActivityIndicator, Appbar, Checkbox, Divider, FAB, Icon, Menu, Searchbar } from 'react-native-paper'

const SCROLL_THRESHOLD = 10
const APP_GREEN = '#25D366'

type ThemeColors = typeof Colors.light | typeof Colors.dark

type MediaType = 'image' | 'video' | 'audio' | 'document' | 'location' | 'contact' | null
type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'error'

const MessageStatusIcon = ({ status }: { status: MessageStatus }) => {
    switch (status) {
        case 'sending':
            return <MaterialIcons name="schedule" size={14} color="#9ca3af" />
        case 'sent':
            return <MaterialIcons name="check" size={14} color="#9ca3af" />
        case 'delivered':
            return <MaterialIcons name="done-all" size={14} color="#9ca3af" />
        case 'read':
            return <MaterialIcons name="done-all" size={14} color={APP_GREEN} />
        case 'error':
            return <MaterialIcons name="error-outline" size={14} color="#ef4444" />
        default:
            return null
    }
}

const MediaPreviewText = ({
    mediaType,
}: {
    mediaType: string | null
}) => {
    if (!mediaType) return null

    const getText = () => {
        switch (mediaType) {
            case 'image': return 'Photo'
            case 'video': return 'Video'
            case 'audio': return 'Voice message'
            case 'document': return 'Document'
            case 'location': return 'Location'
            case 'contact': return 'Contact'
            default: return null
        }
    }

    const text = getText()
    if (!text) return null

    return <Text style={styles.mediaPreviewText}>{text}</Text>
}

const MediaTypeIcon = ({
    mediaType,
    size = 16,
    color = '#9ca3af',
}: {
    mediaType: MediaType | undefined
    size?: number
    color?: string
}) => {
    switch (mediaType) {
        case 'image':
            return <MaterialIcons name="image" size={size} color={color} />
        case 'video':
            return <MaterialIcons name="videocam" size={size} color={color} />
        case 'audio':
            return <MaterialIcons name="mic" size={size} color={color} />
        case 'document':
            return <MaterialIcons name="description" size={size} color={color} />
        case 'location':
            return <MaterialIcons name="location-on" size={size} color={color} />
        case 'contact':
            return <MaterialIcons name="person" size={size} color={color} />
        default:
            return null
    }
}

const openChat = (chatId: string) => {
    if (rightNavRef.isReady()) {
        rightNavRef.navigate('chatId', { chatId })
        return
    }

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
const DeleteAppbarIcon = createAppbarIcon('delete', 'DeleteAppbarIcon')
const ReadAllAppbarIcon = createAppbarIcon('done-all', 'ReadAllAppbarIcon')
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

type ChatItemProps = {
    item: ChatItemType
    colors: ThemeColors
    isSelected: boolean
    isSelectionMode: boolean
    onPress: (chatId: string) => void
    onLongPress: (chatId: string) => void
}

const ChatItem = ({
    item,
    colors,
    isSelected,
    isSelectionMode,
    onPress,
    onLongPress,
}: ChatItemProps) => {
    const avatarBg = colors.card
    const avatarText = colors.text

    const hasMedia = !!item.last_message_media
    const hasText = !!item.last_message_context && !hasMedia

    const messageStatus: MessageStatus = item.last_message_sender_is_me
        ? item.last_message_is_read_by_recipient
            ? 'read'
            : 'delivered'
        : 'received' as MessageStatus

    const displayName = item.display_name ?? item.contact_phone ?? 'Unknown'
    const chatTime = useMemo(
        () => new Date(item.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        [item.updated_at]
    )

    return (
        <Pressable
            onPress={() => onPress(item.chat_id)}
            onLongPress={() => onLongPress(item.chat_id)}
            style={[styles.chatRipple, { backgroundColor: isSelected ? colors.card : 'transparent' }]}>
            <View style={styles.chatItem}>
                {isSelectionMode && (
                    <View pointerEvents="none" style={styles.selectionCheckbox}>
                        <Checkbox.Android
                            status={isSelected ? 'checked' : 'unchecked'}
                            color={APP_GREEN}
                            uncheckedColor={colors.textSecondary}
                        />
                    </View>
                )}

                <ChatAvatar
                    userId={item.recipient_user_id}
                    imageUrl={item.avatar}
                    displayName={displayName}
                    style={styles.avatar}
                    iconColor={avatarText}
                    backgroundColor={avatarBg}
                    textColor={avatarText}
                />

                <View style={styles.chatBody}>
                    <View style={styles.chatTop}>
                        <View style={styles.chatNameContainer}>
                            <Text style={[styles.chatName, { color: colors.text }]} numberOfLines={1}>
                                {displayName}
                            </Text>
                            {item.is_muted_chat_notifications && (
                                <MaterialIcons
                                    name="volume-off"
                                    size={12}
                                    color={colors.textSecondary}
                                    style={styles.mutedIcon}
                                />
                            )}
                        </View>
                        <Text style={[styles.chatTime, { color: item.is_unreaded_chat ? APP_GREEN : colors.textSecondary }]}>
                            {chatTime}
                        </Text>
                    </View>

                    <View style={styles.chatBottom}>
                        <View style={styles.previewContainer}>
                            {hasMedia && (
                                <MediaTypeIcon
                                    mediaType={item.last_message_media as MediaType}
                                    size={16}
                                    color={colors.textSecondary}
                                />
                            )}
                            {hasText && item.last_message_sender_is_me && (
                                <MessageStatusIcon status={messageStatus} />
                            )}
                            <Text style={[styles.chatPreview, { color: colors.textSecondary }]} numberOfLines={1}>
                                {hasMedia
                                    ? <MediaPreviewText mediaType={item.last_message_media} />
                                    : item.last_message_context
                                }
                            </Text>
                        </View>

                        <View style={styles.rightContainer}>
                            {!hasText && !hasMedia && item.last_message_sender_is_me && (
                                <MessageStatusIcon status={messageStatus} />
                            )}
                            {item.unreaded_messages_length > 0 && (
                                <View style={styles.badge}>
                                    <Text style={[styles.badgeText, { color: colors.background }]}>
                                        {item.unreaded_messages_length}
                                    </Text>
                                </View>
                            )}
                        </View>
                    </View>
                </View>
            </View>
        </Pressable>
    )
}

const MemoChatItem = React.memo(ChatItem)

const ChatsPage = () => {
    const { data: session } = authClient.useSession();
    const chats = useActiveChatStore((state) => state.chats);
    const chatsLoading = useActiveChatStore((state) => state.chatsLoading);
    const realtimeStatus = useRealtimeStore((state) => state.status);
    const { setHasSession } = useAuthStore();

    const scheme = useColorScheme()
    const resolvedScheme = scheme === 'unspecified' ? 'light' : scheme ?? 'light'
    const colors = Colors[resolvedScheme]

    const { logoutLoading, setLogoutLoading } = useLogoutLoadingState()

    const [isSearchFocus, setIsSearchFocus] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [appbarBg, setAppbarBg] = useState<string>(colors.background)
    const [selectedChatIds, setSelectedChatIds] = useState<Set<string>>(new Set())
    const [visible, setVisible] = useState(false);
    const [logoutDialogVisible, setLogoutDialogVisible] = useState(false);
    const ignoreNextChatPressRef = useRef<string | null>(null);
    const isScrolledRef = useRef(false);

    const openMenu = () => setVisible(true);

    const closeMenu = () => setVisible(false);

    const isSelectionMode = selectedChatIds.size > 0

    const handleScroll = useCallback((e: any) => {
        const offsetY = e.nativeEvent.contentOffset.y
        const isScrolled = offsetY > SCROLL_THRESHOLD

        if (isScrolledRef.current === isScrolled) {
            return
        }

        isScrolledRef.current = isScrolled
        setAppbarBg(isScrolled ? colors.card : colors.background)
    }, [colors.background, colors.card])

    const clearSelection = () => {
        setSelectedChatIds(new Set())
    }

    const primeMessagesFromCache = useCallback((chatId: string) => {
        const currentUserId = session?.user.id;
        if (!currentUserId) return;
        if ((useActiveChatStore.getState().messagesByChatId[chatId]?.length ?? 0) > 0) {
            return;
        }

        void getDecryptedDbMessagePage({
            chatId,
            currentUserId,
        }).then((cachedMessages) => {
            if (cachedMessages.length === 0) return;

            const {
                setMessages,
                setHasOlderMessages,
            } = useActiveChatStore.getState();

            setMessages(chatId, cachedMessages);
            setHasOlderMessages(chatId, cachedMessages.length === MESSAGE_PAGE_SIZE);
        });
    }, [session?.user.id]);

    const handleChatPress = useCallback((chatId: string) => {
        if (ignoreNextChatPressRef.current === chatId) {
            ignoreNextChatPressRef.current = null;
            return;
        }

        if (isSelectionMode) {
            setSelectedChatIds((currentSelection) => toggleSelection(currentSelection, chatId));
            return;
        }

        openChat(chatId);
        InteractionManager.runAfterInteractions(() => {
            primeMessagesFromCache(chatId);
        });
    }, [isSelectionMode, primeMessagesFromCache]);

    const handleChatLongPress = useCallback((chatId: string) => {
        ignoreNextChatPressRef.current = chatId;
        setTimeout(() => {
            if (ignoreNextChatPressRef.current === chatId) {
                ignoreNextChatPressRef.current = null;
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
            useNotificationStore.getState().setExpoPushToken('');
            useActiveChatStore.getState().reset();

            await authClient.signOut();
            setHasSession(false);
            authClient.getSession();
        } catch (error) {
            console.log(error);
        } finally {
            setLogoutLoading(false);
        }
    };

    const handleLogout = () => {
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

    const renderHeader = useCallback(() => (
        <>
            {pinnedChats.length > 0 && (
                <>
                    <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Pinned</Text>
                    {pinnedChats.map((item) => (
                        <MemoChatItem
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
                <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
                    {pinnedChats.length > 0 ? 'Recent' : 'Chats'}
                </Text>
            )}
        </>
    ), [pinnedChats, recentChats, colors, selectedChatIds, isSelectionMode, handleChatPress, handleChatLongPress]);

    const renderItem = useCallback(({ item }: { item: ChatItemType }) => (
        <MemoChatItem
            item={item}
            colors={colors}
            isSelected={selectedChatIds.has(item.chat_id)}
            isSelectionMode={isSelectionMode}
            onPress={handleChatPress}
            onLongPress={handleChatLongPress}
        />
    ), [colors, selectedChatIds, isSelectionMode, handleChatPress, handleChatLongPress]);

    if (logoutLoading) {
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
                ]}>
                {isSelectionMode ? (
                    <>
                        <Appbar.Action icon={CloseAppbarIcon} onPress={clearSelection} />
                        <Appbar.Content
                            title={String(selectedChatIds.size)}
                            titleStyle={styles.selectionCount}
                        />
                        <Appbar.Action
                            icon={ReadAllAppbarIcon}
                        />
                        <Appbar.Action
                            icon={DeleteAppbarIcon}
                        />
                        <Appbar.Action
                            icon={ArchiveAppbarIcon}
                        />
                        <Appbar.Action
                            icon={PinAppbarIcon}
                        />
                    </>
                ) : isSearchFocus ? (
                    <Searchbar
                        placeholder="Search"
                        onChangeText={setSearchQuery}
                        value={searchQuery}
                        onIconPress={() => {
                            setIsSearchFocus(false)
                            setSearchQuery('')
                        }}
                        icon="arrow-left"
                        autoFocus
                        style={{ backgroundColor: colors.card, flex: 1 }}
                        cursorColor={APP_GREEN}
                    />
                ) : (
                    <>
                        <Appbar.Content title="YaaHalaa" titleStyle={styles.appbarTitle} />
                        <Appbar.Action icon="magnify" onPress={() => setIsSearchFocus(true)} />
                        <Menu
                            visible={visible}
                            onDismiss={closeMenu}
                            anchorPosition='bottom'
                            contentStyle={{ backgroundColor: colors.background }}
                            anchor={<Appbar.Action icon="dots-vertical" onPress={openMenu} />}>
                            <Menu.Item onPress={() => { }} title="New group" leadingIcon={'account-multiple-plus-outline'} />
                            <Menu.Item onPress={() => { }} title="Starred messages" leadingIcon={'star-outline'} />
                            <Menu.Item onPress={() => { }} title="Mar all as read" leadingIcon={'message-badge-outline'} />
                            <Divider />
                            <Menu.Item onPress={handleLogout} title="Logout" leadingIcon={'logout'} />
                        </Menu>
                    </>
                )}
            </Appbar.Header>
            {realtimeStatus === 'connecting' && (
                <ActivityIndicator size={'small'} color={APP_GREEN} />
            )}
            <FlatList
                data={recentChats}
                keyExtractor={(item) => item.chat_id}
                ListHeaderComponent={renderHeader}
                renderItem={renderItem}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                initialNumToRender={12}
                maxToRenderPerBatch={8}
                updateCellsBatchingPeriod={32}
                windowSize={7}
                removeClippedSubviews={Platform.OS === 'android'}
                ListHeaderComponentStyle={{ gap: 6 }}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={!chatsLoading ? (
                    <View style={styles.emptyContainer}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                                You have no chats yet, to create a new chat press the
                            </Text>
                            <NewChatIcon size={18} color={colors.textSecondary} />
                            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                                green floating button
                            </Text>
                        </View>
                    </View>
                ) : null}
                ListFooterComponent={
                    <ThemedView style={{ backgroundColor: 'transparent', paddingHorizontal: 16, paddingVertical: 8 }}>
                        <ThemedView style={{ flexDirection: 'row', alignItems: 'center', width: 'auto', marginHorizontal: 'auto', gap: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: 'transparent' }}>
                            <Icon
                                source="lock-check-outline"
                                color={colors.textSecondary}
                                size={20}
                            />
                            <ThemedText style={{ fontSize: 14, fontWeight: '400', color: colors.textSecondary }}>
                                All of your messages are end-to-end encrypted.
                            </ThemedText>
                        </ThemedView>
                    </ThemedView>
                }
            />
            {!isSelectionMode && (
                <FAB
                    icon={() => <NewChatFilledIcon size={24} color={colors.background} />}
                    style={styles.fab}
                    onPress={() => router.push('/create-chat')}
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
    chatRipple: {
        borderRadius: 18,
        marginHorizontal: 8,
        overflow: 'hidden',
    },
    chatItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 8,
        paddingRight: 16,
        paddingVertical: 8,
    },
    selectionCheckbox: {
        marginRight: 2,
    },
    avatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    avatarText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '500',
    },
    chatBody: {
        flex: 1,
        paddingVertical: 4,
    },
    chatTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    chatNameContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 8,
    },
    chatName: {
        fontSize: 16,
        fontWeight: '500',
        flex: 1,
    },
    mutedIcon: {
        marginLeft: 4,
    },
    chatTime: {
        fontSize: 12,
    },
    chatBottom: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    previewContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 8,
        gap: 4,
    },
    mediaPreviewText: {
        marginLeft: 4,
    },
    chatPreview: {
        fontSize: 14,
        flex: 1,
    },
    rightContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    badge: {
        backgroundColor: APP_GREEN,
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 5,
    },
    badgeText: {
        fontSize: 11,
        fontWeight: '700',
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
    },
})
