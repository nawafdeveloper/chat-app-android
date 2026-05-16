import { ChatAvatar } from '@/components/decrypted-chat-avatar'
import { ThemedText } from '@/components/themed-text'
import { Colors } from '@/constants/theme'
import type { ChatItemType } from '@/types/chats.type'
import { MaterialIcons } from '@expo/vector-icons'
import React, { useEffect, useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { Checkbox, TouchableRipple } from 'react-native-paper'

const APP_GREEN = '#25D366'

type ThemeColors = typeof Colors.light | typeof Colors.dark
type MediaType = 'image' | 'video' | 'audio' | 'document' | 'location' | 'contact' | null
type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'error'

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

const MediaPreviewText = ({ mediaType }: { mediaType: string | null }) => {
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

    return <ThemedText style={styles.mediaPreviewText}>{text}</ThemedText>
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

export type ChatListItemProps = {
    item: ChatItemType
    colors: ThemeColors
    isSelected?: boolean
    isSelectionMode?: boolean
    onPress: (chatId: string) => void
    onLongPress?: (chatId: string) => void
}

const ChatListItem = ({
    item,
    colors,
    isSelected = false,
    isSelectionMode = false,
    onPress,
    onLongPress,
}: ChatListItemProps) => {
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

    useEffect(() => {
        void summarizeChatForDebug(item)
    }, [item])

    return (
        <TouchableRipple
            key={item.chat_id}
            onPress={() => onPress(item.chat_id)}
            onLongPress={() => onLongPress?.(item.chat_id)}
            rippleColor={colors.textSecondary + '33'}
            underlayColor={colors.textSecondary + '22'}
            background={{ type: 'ripple', color: colors.textSecondary + '33', foreground: true }}
            style={[styles.chatRipple, { backgroundColor: isSelected ? colors.card : 'transparent', borderRadius: isSelected ? 18 : 0, marginHorizontal: isSelected ? 8 : 0 }]}
        >
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
                    userId={item.chat_type === 'group' ? item.chat_id : item.recipient_user_id}
                    imageUrl={item.avatar}
                    displayName={displayName}
                    style={styles.avatar}
                    iconColor={avatarText}
                    backgroundColor={avatarBg}
                    textColor={avatarText}
                    chatType={item.chat_type}
                />

                <View style={styles.chatBody}>
                    <View style={styles.chatTop}>
                        <View style={styles.chatNameContainer}>
                            <ThemedText style={[styles.chatName, { color: colors.text }]} numberOfLines={1}>
                                {displayName}
                            </ThemedText>
                            {item.is_muted_chat_notifications && (
                                <MaterialIcons
                                    name="volume-off"
                                    size={12}
                                    color={colors.textSecondary}
                                    style={styles.mutedIcon}
                                />
                            )}
                        </View>
                        <ThemedText style={[styles.chatTime, { color: item.is_unreaded_chat ? APP_GREEN : colors.textSecondary }]}>
                            {chatTime}
                        </ThemedText>
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
                            <ThemedText style={[styles.chatPreview, { color: colors.textSecondary }]} numberOfLines={1}>
                                {hasMedia
                                    ? <MediaPreviewText mediaType={item.last_message_media} />
                                    : item.last_message_context
                                }
                            </ThemedText>
                        </View>

                        <View style={styles.rightContainer}>
                            {!hasText && !hasMedia && item.last_message_sender_is_me && (
                                <MessageStatusIcon status={messageStatus} />
                            )}
                            {item.unreaded_messages_length > 0 && (
                                <View style={styles.badge}>
                                    <ThemedText style={[styles.badgeText, { color: colors.background }]}>
                                        {item.unreaded_messages_length}
                                    </ThemedText>
                                </View>
                            )}
                        </View>
                    </View>
                </View>
            </View>
        </TouchableRipple>
    )
}

export const MemoChatListItem = React.memo(ChatListItem)

const styles = StyleSheet.create({
    chatRipple: {
        overflow: 'hidden',
        padding: 6,
    },
    chatItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 8,
        paddingRight: 16,
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
})
