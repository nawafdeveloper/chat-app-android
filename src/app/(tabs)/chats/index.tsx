import ChatFilledIcon, { ChatIcon } from '@/components/chat-icon'
import { ChatAvatarImage } from '@/components/decrypted-chat-avatar'
import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { Colors } from '@/constants/theme'
import { db } from '@/db/client'
import { contacts, currentUser, chats as dbChats, encryptedMedia, messages } from '@/db/schema'
import { deleteToken } from '@/helper/user-session'
import { useChatRealtime } from '@/hooks/use-chat-realtime'
import { authClient } from '@/lib/auth-client'
import { clearAllSensitiveData } from '@/lib/crypto-storage'
import { rightNavRef } from '@/store/right-nav-ref'
import { useActiveChatStore } from '@/store/use-active-chat-store'
import { ChatItemType } from '@/types/chats.type'
import { MaterialIcons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import React, { useState } from 'react'
import {
    Alert,
    FlatList,
    StyleSheet,
    Text,
    useColorScheme,
    View
} from 'react-native'
import { ActivityIndicator, Appbar, Checkbox, Divider, FAB, Menu, Searchbar, TouchableRipple } from 'react-native-paper'

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

    router.push({
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
    scheme: 'light' | 'dark'
    isSelected: boolean
    isSelectionMode: boolean
    onPress: () => void
    onLongPress: () => void
}

const ChatItem = ({
    item,
    colors,
    scheme,
    isSelected,
    isSelectionMode,
    onPress,
    onLongPress,
}: ChatItemProps) => {
    const avatarBg = colors.card
    const avatarText = colors.text

    const hasMedia = !!item.last_message_media
    const hasText = !!item.last_message_context && !hasMedia

    // Derive status from available fields
    const messageStatus: MessageStatus = item.last_message_sender_is_me
        ? item.last_message_is_read_by_recipient
            ? 'read'
            : 'delivered'
        : 'received' as MessageStatus

    const displayName = item.display_name ?? item.contact_phone ?? 'Unknown'

    return (
        <TouchableRipple
            rippleColor={colors.indicator}
            onPress={onPress}
            onLongPress={onLongPress}
            style={[
                styles.chatRipple,
                isSelected && { backgroundColor: colors.card },
            ]}>
            <View style={styles.chatItem}>
                {isSelectionMode && (
                    <Checkbox.Android
                        status={isSelected ? 'checked' : 'unchecked'}
                        onPress={onPress}
                        color={APP_GREEN}
                        uncheckedColor={colors.textSecondary}
                        style={styles.selectionCheckbox}
                    />
                )}

                {item.avatar ? (
                    <ChatAvatarImage iconColor={avatarText} backgroundColor={avatarBg} imageUrl={item.avatar} style={styles.avatar} />
                ) : displayName && displayName !== "Unknown" ? (
                    <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
                        <Text style={[styles.avatarText, { color: avatarText }]}>
                            {displayName[0]?.toUpperCase()}
                        </Text>
                    </View>
                ) : item.contact_phone ? (
                    <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
                        <Text style={[styles.avatarText, { color: avatarText }]}>
                            {item.contact_phone[0]}
                        </Text>
                    </View>
                ) : (
                    <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
                        <MaterialIcons
                            name="person"
                            size={24}
                            color={avatarText}
                        />
                    </View>
                )}

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
                            {new Date(item.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
        </TouchableRipple>
    )
}

const ChatsPage = () => {
    useChatRealtime();

    const chats = useActiveChatStore((state) => state.chats);
    const chatsLoading = useActiveChatStore((state) => state.chatsLoading);

    const scheme = useColorScheme()
    const resolvedScheme = scheme === 'unspecified' ? 'light' : scheme ?? 'light'
    const colors = Colors[resolvedScheme]

    const [isSearchFocus, setIsSearchFocus] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [appbarBg, setAppbarBg] = useState<string>(colors.background)
    const [selectedChatIds, setSelectedChatIds] = useState<Set<string>>(new Set())
    const [visible, setVisible] = useState(false);
    const [logoutLoading, setLogoutLoading] = useState(false);

    const openMenu = () => setVisible(true);

    const closeMenu = () => setVisible(false);

    const isSelectionMode = selectedChatIds.size > 0

    const handleScroll = (e: any) => {
        const offsetY = e.nativeEvent.contentOffset.y
        setAppbarBg(offsetY > SCROLL_THRESHOLD ? colors.card : colors.background)
    }

    const clearSelection = () => {
        setSelectedChatIds(new Set())
    }

    const handleChatPress = (chatId: string) => {
        if (isSelectionMode) {
            setSelectedChatIds((currentSelection) => toggleSelection(currentSelection, chatId))
            return
        }

        openChat(chatId)
    }

    const handleChatLongPress = (chatId: string) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setIsSearchFocus(false)
        setSelectedChatIds((currentSelection) => {
            if (currentSelection.size === 0) {
                return new Set([chatId])
            }

            return toggleSelection(currentSelection, chatId)
        })
    }

    const confirmLogout = async () => {
        try {
            setLogoutLoading(true);

            await db.transaction(async (tx) => {
                await tx.delete(encryptedMedia);
                await tx.delete(messages);
                await tx.delete(dbChats);
                await tx.delete(contacts);
                await tx.delete(currentUser);
            });

            await clearAllSensitiveData();

            await deleteToken();

            await authClient.signOut();
        } catch (error) {
            console.log(error);
        } finally {
            setLogoutLoading(false);
        }
    };

    const handleLogout = () => {
        Alert.alert(
            'Logout from account?',
            'Are you sure you want to logout from account? All messages will be deleted from this device.',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Logout', style: 'destructive', onPress: confirmLogout }
            ]
        );
    };

    const filteredChats = chats.filter((chat) => {
        const matchesSearch =
            chat.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            chat.last_message_context.toLowerCase().includes(searchQuery.toLowerCase())

        return !chat.is_archived_chat && matchesSearch
    })

    const pinnedChats = filteredChats.filter((chat) => chat.is_pinned_chat)
    const recentChats = filteredChats.filter((chat) => !chat.is_pinned_chat)

    const renderHeader = () => (
        <>
            {pinnedChats.length > 0 && (
                <>
                    <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Pinned</Text>
                    {pinnedChats.map((item) => (
                        <ChatItem
                            key={item.chat_id}
                            item={item}
                            colors={colors}
                            scheme={resolvedScheme}
                            isSelected={selectedChatIds.has(item.chat_id)}
                            isSelectionMode={isSelectionMode}
                            onPress={() => handleChatPress(item.chat_id)}
                            onLongPress={() => handleChatLongPress(item.chat_id)}
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
    )

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

            <FlatList
                data={recentChats}
                keyExtractor={(item) => item.chat_id}
                ListHeaderComponent={renderHeader}
                renderItem={({ item }) => (
                    <ChatItem
                        item={item}
                        colors={colors}
                        scheme={resolvedScheme}
                        isSelected={selectedChatIds.has(item.chat_id)}
                        isSelectionMode={isSelectionMode}
                        onPress={() => handleChatPress(item.chat_id)}
                        onLongPress={() => handleChatLongPress(item.chat_id)}
                    />
                )}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                ListHeaderComponentStyle={{ gap: 6 }}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <ChatIcon color={colors.textSecondary} />
                        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                            No chats found
                        </Text>
                    </View>
                }
            />
            {!isSelectionMode && (
                <FAB
                    icon={() => <ChatFilledIcon size={24} color={colors.background} />}
                    style={styles.fab}
                />
            )}
        </ThemedView>
    )
}

export default ChatsPage

const styles = StyleSheet.create({
    main: { flex: 1 },
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
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 100,
    },
    emptyText: {
        fontSize: 16,
        marginTop: 16,
    },
    fab: {
        position: 'absolute',
        margin: 16,
        right: 0,
        bottom: 0,
        backgroundColor: '#25D366'
    },
})
