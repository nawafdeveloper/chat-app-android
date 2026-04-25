import { ThemedView } from '@/components/themed-view'
import { Colors } from '@/constants/theme'
import { rightNavRef } from '@/store/right-nav-ref'
import { MaterialIcons } from '@expo/vector-icons'
import { router } from 'expo-router'
import React, { useState } from 'react'
import {
    FlatList,
    StyleSheet,
    Text,
    useColorScheme,
    View
} from 'react-native'
import { Appbar, Searchbar, TouchableRipple } from 'react-native-paper'

const SCROLL_THRESHOLD = 10

// Message status types
type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'error'

// Media types
type MediaType = 'image' | 'video' | 'audio' | 'document' | 'location' | 'contact' | null

interface ChatMessage {
    text: string
    status: MessageStatus
    mediaType?: MediaType
    mediaUrl?: string
    mediaDuration?: string // for audio/video
    fileName?: string // for documents
    fileSize?: string
}

interface Chat {
    id: string
    name: string
    lastMessage: ChatMessage
    time: string
    unread: number
    pinned: boolean
    muted: boolean
    avatarColor: { light: { bg: string; text: string }; dark: { bg: string; text: string } }
    phoneNumber?: string
    isGroup?: boolean
    participants?: string[]
}

const CHATS: Chat[] = [
    {
        id: '1',
        name: 'Family',
        lastMessage: {
            text: 'Dinner at 7 tonight?',
            status: 'read',
            mediaType: null
        },
        time: '10:32 AM',
        unread: 0,
        pinned: true,
        muted: true,
        phoneNumber: '+1234567890',
        avatarColor: { light: { bg: '#ede9fe', text: '#7c3aed' }, dark: { bg: '#3b0764', text: '#a78bfa' } },
    },
    {
        id: '2',
        name: 'Work Team',
        lastMessage: {
            text: 'Deployment done',
            status: 'delivered',
            mediaType: null
        },
        time: '9:58 AM',
        unread: 3,
        pinned: true,
        muted: false,
        isGroup: true,
        participants: ['Ahmed', 'Sara', 'Mohammed'],
        avatarColor: { light: { bg: '#dbeafe', text: '#1d4ed8' }, dark: { bg: '#1e3a5f', text: '#60a5fa' } },
    },
    {
        id: '3',
        name: 'Sara',
        lastMessage: {
            text: 'Sounds good, see you there!',
            status: 'read',
            mediaType: null
        },
        time: '9:14 AM',
        unread: 0,
        pinned: false,
        muted: false,
        phoneNumber: '+1234567891',
        avatarColor: { light: { bg: '#ffedd5', text: '#c2410c' }, dark: { bg: '#431407', text: '#fb923c' } },
    },
    {
        id: '4',
        name: 'Mohammed',
        lastMessage: {
            text: 'Check out this file',
            status: 'sent',
            mediaType: 'document',
            fileName: 'Project_Proposal.pdf',
            fileSize: '2.4 MB'
        },
        time: 'Yesterday',
        unread: 1,
        pinned: false,
        muted: false,
        phoneNumber: '+1234567892',
        avatarColor: { light: { bg: '#dcfce7', text: '#15803d' }, dark: { bg: '#052e16', text: '#4ade80' } },
    },
    {
        id: '5',
        name: 'Khalid',
        lastMessage: {
            text: 'Watch this video',
            status: 'read',
            mediaType: 'video',
            mediaDuration: '1:23'
        },
        time: 'Mon',
        unread: 0,
        pinned: false,
        muted: false,
        phoneNumber: '+1234567893',
        avatarColor: { light: { bg: '#ccfbf1', text: '#0f766e' }, dark: { bg: '#042f2e', text: '#2dd4bf' } },
    },
    {
        id: '6',
        name: 'Tech Talk',
        lastMessage: {
            text: 'Anyone tried the new Expo SDK?',
            status: 'sending',
            mediaType: null
        },
        time: 'Sat',
        unread: 7,
        pinned: false,
        muted: true,
        isGroup: true,
        participants: ['Yousuf', 'Ali', 'Omar', 'Hassan'],
        avatarColor: { light: { bg: '#fef9c3', text: '#a16207' }, dark: { bg: '#422006', text: '#facc15' } },
    },
    {
        id: '7',
        name: 'Reem',
        lastMessage: {
            text: 'Voice message',
            status: 'delivered',
            mediaType: 'audio',
            mediaDuration: '0:24'
        },
        time: 'Mon',
        unread: 0,
        pinned: false,
        muted: false,
        phoneNumber: '+1234567894',
        avatarColor: { light: { bg: '#fee2e2', text: '#b91c1c' }, dark: { bg: '#450a0a', text: '#f87171' } },
    },
    {
        id: '8',
        name: 'Design Resources',
        lastMessage: {
            text: 'New design assets',
            status: 'read',
            mediaType: 'image',
            mediaUrl: 'https://example.com/image.jpg'
        },
        time: 'Mon',
        unread: 0,
        pinned: false,
        muted: false,
        isGroup: true,
        participants: ['Design Team'],
        avatarColor: { light: { bg: '#f3e8ff', text: '#7e22ce' }, dark: { bg: '#3b0764', text: '#c084fc' } },
    },
    {
        id: '9',
        name: 'John Doe',
        lastMessage: {
            text: 'Im here',
            status: 'read',
            mediaType: 'location'
        },
        time: 'Tue',
        unread: 0,
        pinned: false,
        muted: false,
        phoneNumber: '+1234567895',
        avatarColor: { light: { bg: '#e0f2fe', text: '#0369a1' }, dark: { bg: '#082f49', text: '#7dd3fc' } },
    },
    {
        id: '10',
        name: 'Contact Support',
        lastMessage: {
            text: 'Contact shared',
            status: 'sent',
            mediaType: 'contact'
        },
        time: 'Wed',
        unread: 2,
        pinned: false,
        muted: false,
        avatarColor: { light: { bg: '#fce7f3', text: '#be185d' }, dark: { bg: '#4c0519', text: '#f472b6' } },
    },
]

// Component to render message status icons
const MessageStatusIcon = ({ status }: { status: MessageStatus }) => {
    switch (status) {
        case 'sending':
            return <MaterialIcons name="schedule" size={14} color="#9ca3af" />
        case 'sent':
            return <MaterialIcons name="check" size={14} color="#9ca3af" />
        case 'delivered':
            return <MaterialIcons name="done-all" size={14} color="#9ca3af" />
        case 'read':
            return <MaterialIcons name="done-all" size={14} color="#25D366" />
        case 'error':
            return <MaterialIcons name="error-outline" size={14} color="#ef4444" />
        default:
            return null
    }
}

const MediaTypeIcon = ({ mediaType, size = 16, color = '#9ca3af' }: { mediaType: MediaType | undefined; size?: number; color?: string }) => {
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

const MediaPreviewText = ({ mediaType, mediaDuration, fileName, fileSize }: ChatMessage) => {
    if (!mediaType) return null

    const getText = () => {
        switch (mediaType) {
            case 'image':
                return 'Photo'
            case 'video':
                return `Video ${mediaDuration ? `· ${mediaDuration}` : ''}`
            case 'audio':
                return `Voice message ${mediaDuration ? `· ${mediaDuration}` : ''}`
            case 'document':
                return `${fileName || 'Document'}${fileSize ? ` · ${fileSize}` : ''}`
            case 'location':
                return 'Location'
            case 'contact':
                return 'Contact'
            default:
                return null
        }
    }

    const text = getText()
    if (!text) return null

    return <Text style={{ marginLeft: 4 }}>{text}</Text>
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

const ChatItem = ({ item, colors, scheme }: { item: Chat; colors: any; scheme: 'light' | 'dark' }) => {
    const av = item.avatarColor[scheme]
    const hasMedia = item.lastMessage.mediaType !== null
    const hasText = item.lastMessage.text && !hasMedia

    return (
        <TouchableRipple rippleColor={colors.card} key={item.id} onPress={() => openChat(item.id)}>
            <View style={styles.chatItem}>
                <View style={[styles.avatar, { backgroundColor: av.bg }]}>
                    <Text style={[styles.avatarText, { color: av.text }]}>{item.name[0]}</Text>
                </View>
                <View style={styles.chatBody}>
                    <View style={styles.chatTop}>
                        <View style={styles.chatNameContainer}>
                            <Text style={[styles.chatName, { color: colors.text }]} numberOfLines={1}>
                                {item.name}
                            </Text>
                            {item.muted && <MaterialIcons name="volume-off" size={12} color={colors.textSecondary} style={styles.mutedIcon} />}
                        </View>
                        <Text style={[styles.chatTime, { color: item.unread ? '#25D366' : colors.textSecondary }]}>
                            {item.time}
                        </Text>
                    </View>
                    <View style={styles.chatBottom}>
                        <View style={styles.previewContainer}>
                            {hasMedia && (
                                <MediaTypeIcon mediaType={item.lastMessage.mediaType} size={16} color={colors.textSecondary} />
                            )}
                            {hasText && <MessageStatusIcon status={item.lastMessage.status} />}
                            <Text style={[styles.chatPreview, { color: colors.textSecondary }]} numberOfLines={1}>
                                {hasMedia ? (
                                    <MediaPreviewText {...item.lastMessage} />
                                ) : (
                                    item.lastMessage.text
                                )}
                            </Text>
                        </View>
                        <View style={styles.rightContainer}>
                            {!hasText && !hasMedia && <MessageStatusIcon status={item.lastMessage.status} />}
                            {item.unread > 0 && (
                                <View style={styles.badge}>
                                    <Text style={styles.badgeText}>{item.unread}</Text>
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
    const scheme = useColorScheme()
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme ?? 'light']

    const [isSearchFocus, setIsSearchFocus] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [appbarBg, setAppbarBg] = useState<string>(colors.background)

    const handleScroll = (e: any) => {
        const offsetY = e.nativeEvent.contentOffset.y
        setAppbarBg(offsetY > SCROLL_THRESHOLD ? colors.card : colors.background)
    }

    const filteredChats = CHATS.filter(chat =>
        chat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (chat.lastMessage.text && chat.lastMessage.text.toLowerCase().includes(searchQuery.toLowerCase()))
    )

    const pinnedChats = filteredChats.filter((c) => c.pinned)
    const recentChats = filteredChats.filter((c) => !c.pinned)

    const resolvedScheme = scheme === 'unspecified' ? 'light' : scheme ?? 'light'

    const renderHeader = () => (
        <>
            {pinnedChats.length > 0 && (
                <>
                    <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Pinned</Text>
                    {pinnedChats.map((item) => (
                        <ChatItem key={item.id} item={item} colors={colors} scheme={resolvedScheme} />
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

    return (
        <ThemedView style={styles.main}>
            <Appbar.Header
                style={{
                    backgroundColor: appbarBg,
                    paddingLeft: 16,
                    paddingRight: isSearchFocus ? 16 : 0,
                }}
            >
                {isSearchFocus ? (
                    <Searchbar
                        placeholder="Search"
                        onChangeText={setSearchQuery}
                        value={searchQuery}
                        onIconPress={() => {
                            setIsSearchFocus(false)
                            setSearchQuery('')
                        }}
                        icon={'arrow-left'}
                        autoFocus
                        style={{ backgroundColor: colors.card, flex: 1 }}
                        cursorColor={'#25D366'}
                    />
                ) : (
                    <>
                        <Appbar.Content title="YaaHalaa" titleStyle={{ fontWeight: '700' }} />
                        <Appbar.Action icon="magnify" onPress={() => setIsSearchFocus(true)} />
                        <Appbar.Action icon="dots-vertical" onPress={() => { }} />
                    </>
                )}
            </Appbar.Header>

            <FlatList
                data={recentChats}
                keyExtractor={(item) => item.id}
                ListHeaderComponent={renderHeader}
                renderItem={({ item }) => <ChatItem item={item} colors={colors} scheme={resolvedScheme} />}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                contentContainerStyle={{ paddingBottom: 80 }}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <MaterialIcons name="chat-bubble-outline" size={64} color={colors.textSecondary} />
                        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                            No chats found
                        </Text>
                    </View>
                }
            />
        </ThemedView>
    )
}

export default ChatsPage

const styles = StyleSheet.create({
    main: { flex: 1 },
    sectionLabel: {
        fontSize: 12,
        fontWeight: '600',
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
    },
    chatItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 16,
        paddingRight: 16,
        paddingVertical: 8,
    },
    avatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    avatarText: { color: '#fff', fontSize: 18, fontWeight: '500' },
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
    chatName: { fontSize: 16, fontWeight: '500', flex: 1 },
    mutedIcon: { marginLeft: 4 },
    chatTime: { fontSize: 12 },
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
    chatPreview: { fontSize: 14, flex: 1 },
    rightContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    badge: {
        backgroundColor: '#25D366',
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 5,
    },
    badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
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
})
