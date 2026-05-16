import { Colors, Fonts } from "@/constants/theme";
import { useIsTablet } from "@/context/screen-checking-context";
import { findContactByPhone, findContactByUserId, getContactDisplayName } from "@/lib/contact-display";
import { phoneValuesMatch } from "@/lib/contact-utils";
import {
    fetchAndDecryptMessageMedia,
    isLocalMediaUri,
    isMessageMediaSafeForJsDecrypt,
    materializeMessageMedia,
} from "@/lib/message-media";
import { upsertDbMessages } from "@/lib/upsert-db-messages";
import { rightNavRef } from "@/store/right-nav-ref";
import { useActiveChatStore } from "@/store/use-active-chat-store";
import { useContactDirectoryStore } from "@/store/use-contact-directory-store";
import { Message } from "@/types/messages";
import Slider from "@react-native-community/slider";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import * as Haptics from 'expo-haptics';
import { Image } from "expo-image";
import { router } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, TouchableWithoutFeedback, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Icon, IconButton, TouchableRipple } from "react-native-paper";
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { Path, Svg } from 'react-native-svg';
import { runOnJS } from "react-native-worklets";
import { ChatAvatar } from "./decrypted-chat-avatar";
import { DecryptedMediaImage } from "./decrypted-image-preview";
import { VideoMessagePreview } from "./decrypted-video-image-preview";
import { detectAndRenderLinks } from "./message-link-url-detector";
import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";
import { DarkFileIcon, LightFileIcon } from "./ui/file-icons";

type BubbleProps = {
    message: Message;
    currentUserId: string | null;
    isDark: boolean;
    showTail?: boolean;
    isGroupedWithPrevious?: boolean;
    isGroupedWithNext?: boolean;
    isSelected: boolean;
    selectedCount: number;
    onLongPress: (messageId: string) => void;
    onPress: (messageId: string) => void;
    onRetryMessage?: (message: Message) => void;
    handleReply: (
        replyTo: string,
        replyMsg: string | null,
        replayMedia: string | null | undefined,
        replyMediaType: 'photo' | 'video' | 'voice' | 'file' | 'contact' | 'location' | null,
        originalMessageId: string,
        originalSenderUserId: string
    ) => void;
    isStarredByCurrentUser: boolean
};

const DARK = {
    sentBubble: '#184D39',
    receivedBubble: '#1F272A',
    sentText: '#E9EDEF',
    receivedText: '#E9EDEF',
    sentTime: 'rgba(233,237,239,0.6)',
    receivedTime: 'rgba(233,237,239,0.5)',
    check: 'rgba(255,255,255,0.6)',
    cardReceived: '#1C2329',
    cardSent: '#134333',
    borderSent: '#14402f',
    borderReceive: '#2f363a'
};

const LIGHT = {
    sentBubble: '#D9FDD3',
    receivedBubble: '#FFFFFF',
    sentText: '#111B21',
    receivedText: '#111B21',
    sentTime: 'rgba(0,0,0,0.4)',
    receivedTime: 'rgba(0,0,0,0.4)',
    check: 'rgba(0,0,0,0.35)',
    cardReceived: '#fafafb',
    cardSent: '#cafdc1',
    borderSent: '#b3d5ad',
    borderReceive: '#e3e1df'
};

const TAIL_PATH = "M1.533,2.568L8,11.193V0L2.812,0C1.042,0,0.474,1.156,1.533,2.568z";
const MAX_SWIPE_TRANSLATION = 56;
const SWIPE_HARD_LIMIT = 72;
const SWIPE_RESISTANCE = 0.18;
const AnimatedIconButton = Animated.createAnimatedComponent(IconButton);
const CHAT_DEBUG = true;

function debugBubble(stage: string, payload: Record<string, unknown> = {}) {
    if (!CHAT_DEBUG) {
        return;
    }

}

function summarizeBubbleMessage(message: Message) {
    return {
        id: message.message_id,
        chatId: message.chat_room_id,
        sender: message.sender_user_id,
        media: message.attached_media,
        hasText: Boolean(message.message_text_content?.trim()),
        textLength: message.message_text_content?.length ?? 0,
        hasMediaUrl: Boolean(message.media_url),
        hasPreviewUrl: Boolean(message.media_preview_url || message.media_preview_object_key),
        status: message.client_status,
        readByRecipient: message.is_read_by_recipient,
        createdAt: message.created_at?.toISOString?.() ?? String(message.created_at),
    };
}

type ActiveVoicePlayback = {
    messageId: string;
    pause: () => void;
    reset: () => void;
};

let activeVoicePlayback: ActiveVoicePlayback | null = null;
let latestVoicePlayRequestId: string | null = null;

const formatAudioTime = (seconds?: number | null) => {
    if (!seconds || !Number.isFinite(seconds) || seconds < 0) {
        return "0:00";
    }

    const roundedSeconds = Math.floor(seconds);
    const hours = Math.floor(roundedSeconds / 3600);
    const minutes = Math.floor((roundedSeconds % 3600) / 60);
    const remainingSeconds = roundedSeconds % 60;

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
    }

    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
};

const stopActiveVoicePlayback = (exceptMessageId?: string) => {
    if (!activeVoicePlayback || activeVoicePlayback.messageId === exceptMessageId) {
        return;
    }

    activeVoicePlayback.pause();
    activeVoicePlayback.reset();
    activeVoicePlayback = null;
};

const ignoreReleasedPlayerError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("already released")) {
        return;
    }

    console.log("Voice player operation failed:", error);
};

const getUserHue = (userId: string | null | undefined): number => {
    if (!userId) {
        return 0;
    }

    let hash = 0;
    for (let i = 0; i < userId.length; i += 1) {
        hash = (hash << 5) - hash + userId.charCodeAt(i);
        hash |= 0;
    }

    return Math.abs(hash) % 360;
};

const formatBytes = (bytes?: number | null) => {
    if (!bytes || bytes <= 0) {
        return null;
    }

    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }

    const formatted = value >= 10 || unitIndex === 0
        ? Math.round(value).toString()
        : value.toFixed(1);

    return `${formatted} ${units[unitIndex]}`;
};

const getFileExtension = (
    fileName?: string | null,
    mimeType?: string | null
) => {
    const extension = fileName?.split(".").pop()?.toUpperCase();
    if (extension && extension !== fileName?.toUpperCase()) {
        return extension;
    }

    return mimeType?.split("/").pop()?.toUpperCase() ?? null;
};

const getAspectRatio = (message: Message) => {
    if (message.media_aspect_ratio && message.media_aspect_ratio > 0) {
        return message.media_aspect_ratio;
    }

    if (message.media_width && message.media_height) {
        return message.media_width / message.media_height;
    }

    return 3 / 4;
};

const API_BASE = "https://halabakk-web.nawaf-alhasosah.workers.dev";

function ReplyPhotoThumbnail({ url, isDark }: { url?: string | null; isDark: boolean }) {
    const [resolvedUri, setResolvedUri] = useState<string | null>(null);

    useEffect(() => {
        if (!url) {
            debugBubble('reply-thumbnail-skip-no-url');
            return;
        }
        const absoluteUrl = url.startsWith('/') ? `${API_BASE}${url}` : url;
        debugBubble('reply-thumbnail-load-start', { url: absoluteUrl });
        fetchAndDecryptMessageMedia({
            source: absoluteUrl,
            isPreview: true,
            fallbackExtension: 'jpg',
        }).then(uri => {
            debugBubble('reply-thumbnail-load-finish', { url: absoluteUrl, resolved: Boolean(uri) });
            if (uri) setResolvedUri(uri);
        }).catch((error) => {
            debugBubble('reply-thumbnail-load-error', { url: absoluteUrl, error });
        });
    }, [url]);

    if (!resolvedUri) {
        return (
            <View style={{ width: 55, height: 55, backgroundColor: isDark ? '#182229' : '#edf2f7', justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#25D366" />
            </View>
        );
    }

    return (
        <Image
            source={{ uri: resolvedUri }}
            contentFit="cover"
            style={{ width: 55, height: 55 }}
        />
    );
}

function VoiceMessagePreview({
    messageId,
    audioSource,
    canLoadAudio,
    isDark,
    userId,
    imageUrl,
    displayName,
    contactPhone,
    iconColor,
    textColor,
    chatType
}: {
    messageId: string;
    audioSource?: string | null;
    canLoadAudio: boolean;
    isDark: boolean;
    userId: string;
    imageUrl: string;
    displayName: string;
    contactPhone: string | null;
    iconColor: string | undefined;
    textColor: string;
    chatType: "single" | "group" | undefined;
}) {
    const player = useAudioPlayer(null, { updateInterval: 250 });
    const status = useAudioPlayerStatus(player);
    const [resolvedAudioUri, setResolvedAudioUri] = useState<string | null>(null);
    const [isAudioLoading, setIsAudioLoading] = useState(false);
    const [isSeeking, setIsSeeking] = useState(false);
    const [seekTime, setSeekTime] = useState(0);
    const [resetPositionOverride, setResetPositionOverride] = useState(false);
    const isMountedRef = useRef(true);
    const trackColor = isDark ? "#6C757C" : "#94a3b8";
    const fillColor = "#25D366";
    const playButtonColor = isDark ? "#E9EDEF" : "#1F2A2E";
    const duration = Number.isFinite(status.duration) && status.duration > 0
        ? status.duration
        : 0;
    const currentTime = Number.isFinite(status.currentTime) && status.currentTime > 0
        ? Math.min(status.currentTime, duration || status.currentTime)
        : 0;
    const displayedTime = resetPositionOverride
        ? 0
        : isSeeking
            ? seekTime
            : currentTime;
    const isAudioBusy = isAudioLoading || (status.isBuffering && Boolean(resolvedAudioUri));
    const isControlDisabled = !audioSource || !canLoadAudio || isAudioBusy;

    useEffect(() => {
        debugBubble('voice-render-state', {
            messageId,
            hasAudioSource: Boolean(audioSource),
            canLoadAudio,
            resolvedAudioUri: Boolean(resolvedAudioUri),
            isAudioLoading,
            isSeeking,
            duration,
            currentTime,
            playing: status.playing,
            buffering: status.isBuffering,
            isControlDisabled,
        });
    }, [
        audioSource,
        canLoadAudio,
        currentTime,
        duration,
        isAudioLoading,
        isControlDisabled,
        isSeeking,
        messageId,
        resolvedAudioUri,
        status.isBuffering,
        status.playing,
    ]);

    const pausePlayerSafely = useCallback(() => {
        try {
            player.pause();
        } catch (error) {
            ignoreReleasedPlayerError(error);
        }
    }, [player]);

    const playPlayerSafely = useCallback(() => {
        try {
            player.play();
        } catch (error) {
            ignoreReleasedPlayerError(error);
        }
    }, [player]);

    const replacePlayerSourceSafely = useCallback((uri: string) => {
        try {
            player.replace({ uri });
        } catch (error) {
            ignoreReleasedPlayerError(error);
        }
    }, [player]);

    const seekPlayerSafely = useCallback((seconds: number) => {
        try {
            void player.seekTo(seconds);
        } catch (error) {
            ignoreReleasedPlayerError(error);
        }
    }, [player]);

    useEffect(() => {
        debugBubble('voice-mounted', { messageId });
        isMountedRef.current = true;

        return () => {
            debugBubble('voice-unmounted', { messageId });
            isMountedRef.current = false;
            if (activeVoicePlayback?.messageId === messageId) {
                activeVoicePlayback = null;
            }
            if (latestVoicePlayRequestId === messageId) {
                latestVoicePlayRequestId = null;
            }
        };
    }, [messageId]);

    useEffect(() => {
        debugBubble('voice-source-reset', {
            messageId,
            hasAudioSource: Boolean(audioSource),
            isLocalAudioSource: Boolean(audioSource && isLocalMediaUri(audioSource)),
        });
        setResolvedAudioUri(null);
        setSeekTime(0);
        setIsSeeking(false);
        setResetPositionOverride(false);

        if (audioSource && isLocalMediaUri(audioSource)) {
            setResolvedAudioUri(audioSource);
            replacePlayerSourceSafely(audioSource);
        }
    }, [audioSource, replacePlayerSourceSafely]);

    useEffect(() => {
        if (!status.didJustFinish) {
            return;
        }

        if (activeVoicePlayback?.messageId === messageId) {
            activeVoicePlayback = null;
        }
        if (latestVoicePlayRequestId === messageId) {
            latestVoicePlayRequestId = null;
        }
        pausePlayerSafely();
        seekPlayerSafely(0);
        setSeekTime(0);
        setResetPositionOverride(true);
    }, [messageId, pausePlayerSafely, seekPlayerSafely, status.didJustFinish]);

    const ensureAudioReady = useCallback(async () => {
        if (!audioSource || !canLoadAudio) {
            debugBubble('voice-ensure-audio-skip', {
                messageId,
                hasAudioSource: Boolean(audioSource),
                canLoadAudio,
            });
            return null;
        }

        if (resolvedAudioUri) {
            debugBubble('voice-ensure-audio-use-resolved', { messageId });
            return resolvedAudioUri;
        }

        setIsAudioLoading(true);
        try {
            debugBubble('voice-ensure-audio-fetch-start', { messageId, audioSource });
            const uri = await fetchAndDecryptMessageMedia({
                source: audioSource,
                fallbackExtension: "m4a",
            });

            if (!uri || !isMountedRef.current) {
                debugBubble('voice-ensure-audio-fetch-empty-or-unmounted', {
                    messageId,
                    resolved: Boolean(uri),
                    isMounted: isMountedRef.current,
                });
                return null;
            }

            setResolvedAudioUri(uri);
            replacePlayerSourceSafely(uri);
            debugBubble('voice-ensure-audio-fetch-success', { messageId, uri });
            return uri;
        } catch (error) {
            debugBubble('voice-ensure-audio-fetch-error', { messageId, error });
            console.log("Failed to load voice message:", error);
            return null;
        } finally {
            if (isMountedRef.current) {
                setIsAudioLoading(false);
            }
        }
    }, [audioSource, canLoadAudio, replacePlayerSourceSafely, resolvedAudioUri]);

    const handlePlayPause = useCallback(async () => {
        debugBubble('voice-play-press', {
            messageId,
            isControlDisabled,
            playing: status.playing,
            hasAudioSource: Boolean(audioSource),
        });
        if (isControlDisabled) {
            return;
        }

        if (status.playing) {
            pausePlayerSafely();
            if (activeVoicePlayback?.messageId === messageId) {
                activeVoicePlayback = null;
            }
            if (latestVoicePlayRequestId === messageId) {
                latestVoicePlayRequestId = null;
            }
            debugBubble('voice-paused', { messageId });
            return;
        }

        latestVoicePlayRequestId = messageId;
        setResetPositionOverride(false);
        stopActiveVoicePlayback(messageId);

        const uri = await ensureAudioReady();
        if (!uri || latestVoicePlayRequestId !== messageId || !isMountedRef.current) {
            debugBubble('voice-play-abort-after-ready', {
                messageId,
                resolved: Boolean(uri),
                latestVoicePlayRequestId,
                isMounted: isMountedRef.current,
            });
            return;
        }

        activeVoicePlayback = {
            messageId,
            pause: pausePlayerSafely,
            reset: () => {
                seekPlayerSafely(0);
            },
        };
        playPlayerSafely();
        debugBubble('voice-playing', { messageId, uri });
    }, [ensureAudioReady, isControlDisabled, messageId, pausePlayerSafely, playPlayerSafely, seekPlayerSafely, status.playing]);

    const handleSlidingStart = useCallback((value: number) => {
        setResetPositionOverride(false);
        setIsSeeking(true);
        setSeekTime(value);
    }, []);

    const handleValueChange = useCallback((value: number) => {
        setSeekTime(value);
    }, []);

    const handleSlidingComplete = useCallback((value: number) => {
        const clampedValue = duration > 0
            ? Math.min(Math.max(value, 0), duration)
            : 0;

        setIsSeeking(false);
        setSeekTime(clampedValue);

        if (duration > 0) {
            seekPlayerSafely(clampedValue);
        }
    }, [duration, seekPlayerSafely]);

    return (
        <ThemedView style={styles.voiceCard}>
            <ThemedView style={{ position: 'relative', backgroundColor: 'transparent' }}>
                <ChatAvatar
                    userId={userId}
                    imageUrl={imageUrl}
                    displayName={displayName}
                    contactPhone={contactPhone}
                    style={[styles.groupSenderAvatar, { width: 42, height: 42 }]}
                    iconColor={iconColor}
                    backgroundColor={isDark ? "#182229" : "#e8f0ef"}
                    textColor={textColor}
                    chatType={chatType}
                />
                <ThemedView style={{ position: 'absolute', backgroundColor: 'transparent', bottom: -6, right: -9, zIndex: 1 }}>
                    <Icon
                        source="microphone"
                        color={isDark ? "#c8cece" : "#404242"}
                        size={24}
                    />
                </ThemedView>
            </ThemedView>
            {isAudioBusy ? (
                <ThemedView style={styles.voiceLoadingButton}>
                    <ActivityIndicator size="small" color={fillColor} />
                </ThemedView>
            ) : (
                <IconButton
                    icon={status.playing ? "pause" : "play"}
                    iconColor={playButtonColor}
                    containerColor="transparent"
                    mode="contained"
                    size={28}
                    disabled={!audioSource || !canLoadAudio}
                    style={styles.voicePlayButton}
                    onPress={handlePlayPause}
                />
            )}
            <ThemedView style={styles.voiceBody}>
                <ThemedView style={styles.voiceSliderRow}>
                    <Slider
                        style={styles.voiceSlider}
                        minimumValue={0}
                        maximumValue={duration > 0 ? duration : 1}
                        value={duration > 0 ? displayedTime : 0}
                        minimumTrackTintColor={fillColor}
                        maximumTrackTintColor={trackColor}
                        thumbTintColor={fillColor}
                        disabled={!resolvedAudioUri || duration <= 0}
                        onSlidingStart={handleSlidingStart}
                        onValueChange={handleValueChange}
                        onSlidingComplete={handleSlidingComplete}
                    />
                </ThemedView>
                <ThemedView style={styles.voiceMetaRow}>
                    <ThemedText style={[styles.voiceTimeText, { color: isDark ? "#9CA3AF" : "#64748b" }]}>
                        {formatAudioTime(displayedTime)} / {formatAudioTime(duration)}
                    </ThemedText>
                </ThemedView>
            </ThemedView>
        </ThemedView>
    );
}

const Tail = memo(function Tail({ color, sent }: { color: string; sent: boolean }) {
    return (
        <View style={[
            styles.tailContainer,
            sent ? styles.tailSent : styles.tailReceived,
        ]}>
            <Svg
                width={16}
                height={23}
                viewBox="0 0 16 23"
                style={sent ? { transform: [{ scaleX: -1 }] } : undefined}
            >
                <Path d={TAIL_PATH} fill={color} />
            </Svg>
        </View>
    );
});

function Bubble({ message, currentUserId, isDark, showTail = true, isGroupedWithPrevious = false, isGroupedWithNext = false, isSelected, selectedCount, onLongPress, onPress, onRetryMessage, handleReply, isStarredByCurrentUser }: BubbleProps) {
    const {
        message_id,
        sender_user_id,
        message_text_content,
        created_at,
        attached_media,
        is_forward_message,
        media_url,
        video_thumbnail,
        media_preview_url,
        media_preview_object_key,
        encrypted_media,
        media_size_bytes,
        media_file_name,
        client_local_media_name,
        client_local_media_size,
        client_local_media_mime_type,
        poll,
        open_graph_data,
        reply_message,
        message_raction,
        contact,
        location,
    } = message;
    const formattedTime = useMemo(
        () => created_at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        [created_at]
    );
    const isTablet = useIsTablet();
    const chats = useActiveChatStore((state) => state.chats);
    const contacts = useContactDirectoryStore((state) => state.contacts);
    const [isMediaDownloading, setIsMediaDownloading] = useState(false);

    const theme = isDark ? DARK : LIGHT;
    const colors = isDark ? Colors.dark : Colors.light;
    const sent = sender_user_id === currentUserId;
    const isFailedOutgoing = sent && message.client_status === "failed";
    const isPendingOutgoing =
        sent &&
        (message.client_status === "sending" || message.client_status === "pending");
    const isReadOutgoing = sent && Boolean(message.is_read_by_recipient);
    const statusIconSource = isPendingOutgoing ? "clock-outline" : "check-all";
    const statusIconColor = isPendingOutgoing
        ? theme.check
        : isReadOutgoing
            ? "#34B7F1"
            : theme.check;
    const bubbleColor = sent ? theme.sentBubble : theme.receivedBubble;
    const swipeX = useSharedValue(0);

    const activeChat =
        chats.find((chat) => chat.chat_id === message.chat_room_id) ?? null;
    const isGroupChat = activeChat?.chat_type === "group";
    const mediaAspectRatio = getAspectRatio(message);
    const fileName =
        media_file_name ??
        client_local_media_name ??
        media_url?.split("?")[0].split("/").filter(Boolean).pop() ??
        "File";
    const fileSize = media_size_bytes ?? client_local_media_size ?? null;
    const fileExtension = getFileExtension(fileName, client_local_media_mime_type);
    const fileDetails = [formatBytes(fileSize), fileExtension]
        .filter(Boolean)
        .join(" - ");
    const sharedContactName =
        contact?.contact_name ??
        message_text_content ??
        "Shared contact";
    const sharedContactPhone = contact?.contact_phone ?? null;
    const photoSource = media_url ?? null;
    const previewObjectKey =
        media_preview_object_key ?? encrypted_media?.preview_object_key ?? null;
    const photoPreviewSource = media_preview_url ?? previewObjectKey;
    const videoThumbnailSource =
        video_thumbnail ?? media_preview_url ?? previewObjectKey;
    const videoPreviewSource =
        media_preview_url && media_preview_url !== videoThumbnailSource
            ? media_preview_url
            : null;
    const hasLocalFullMedia = isLocalMediaUri(media_url);
    const shouldShowMediaDownloadOverlay =
        (attached_media === "photo" || attached_media === "video") &&
        Boolean(media_url) &&
        !hasLocalFullMedia;
    const canDownloadFullMedia = isMessageMediaSafeForJsDecrypt(message);
    const canDownloadMediaFromBubble = canDownloadFullMedia;
    const replySenderUserId =
        message.reply_message?.original_sender_user_id ?? null;
    const senderGroupMember =
        isGroupChat
            ? activeChat?.group_members?.find(
                (member) => member.user_id === message.sender_user_id
            ) ?? null
            : null;
    const replySenderGroupMember = isGroupChat
        ? activeChat?.group_members?.find(
            (member) => member.user_id === replySenderUserId
        ) ?? null
        : null;
    const senderContact =
        findContactByUserId(contacts, message.sender_user_id) ??
        findContactByPhone(contacts, senderGroupMember?.phone_number);
    const senderPhone =
        senderContact?.contact_number ?? senderGroupMember?.phone_number ?? null;
    const senderDisplayName = senderContact
        ? getContactDisplayName(senderContact)
        : senderGroupMember?.name?.trim() || senderGroupMember?.phone_number || "You";
    const shouldShowSenderPhone = Boolean(!senderContact && senderPhone);
    const senderAvatar =
        senderContact?.contact_avatar || senderGroupMember?.avatar || "";
    const senderDirectChat = chats.find((chat) =>
        chat.chat_type === "single" &&
        (
            (!!message.sender_user_id && chat.recipient_user_id === message.sender_user_id) ||
            (!!senderPhone && phoneValuesMatch(chat.contact_phone, senderPhone))
        )
    ) ?? null;
    const senderHue = getUserHue(message.sender_user_id);
    const groupSenderAccent = isDark
        ? `hsl(${senderHue}, 80%, 65%)`
        : `hsl(${senderHue}, 80%, 30%)`;
    const replySenderContact = findContactByUserId(contacts, replySenderUserId);
    const replySenderDisplayName =
        replySenderUserId === currentUserId
            ? "You"
            : replySenderContact
                ? getContactDisplayName(replySenderContact)
                : isGroupChat && replySenderGroupMember
                    ? (replySenderGroupMember.name?.trim() || replySenderGroupMember.phone_number) ?? ""
            : replySenderUserId ?? "";

    const handleOpenSenderProfile = useCallback(() => {
        if (!isGroupChat || sent) {
            return;
        }

        const profileParams = {
            chatId: senderDirectChat?.chat_id ?? undefined,
            targetUserId: message.sender_user_id,
            contactNumber: senderPhone ?? undefined,
            displayName: senderDisplayName,
            avatar: senderAvatar || undefined,
            publicKey: senderGroupMember?.public_key ?? senderContact?.linked_user_public_key ?? undefined,
        };

        if (isTablet && rightNavRef.isReady()) {
            rightNavRef.navigate("targetUserProfile", profileParams);
            return;
        }

        router.navigate({
            pathname: "/targetUserProfile",
            params: profileParams,
        });
    }, [
        isGroupChat,
        isTablet,
        message.sender_user_id,
        senderAvatar,
        senderContact?.linked_user_public_key,
        senderDirectChat?.chat_id,
        senderDisplayName,
        senderGroupMember?.public_key,
        senderPhone,
        sent,
    ]);

    debugBubble('render', {
        message: summarizeBubbleMessage(message),
        currentUserId,
        sent,
        isSelected,
        selectedCount,
        isGroupChat,
        activeChatId: activeChat?.chat_id ?? null,
        canDownloadMediaFromBubble,
        shouldShowMediaDownloadOverlay,
        isMediaDownloading,
        hasReply: Boolean(reply_message),
        hasContact: Boolean(contact),
        hasLocation: Boolean(location),
        hasOpenGraph: Boolean(open_graph_data),
    });

    useEffect(() => {
        debugBubble('state-updated', {
            message: summarizeBubbleMessage(message),
            sent,
            isSelected,
            selectedCount,
            isPendingOutgoing,
            isFailedOutgoing,
            isReadOutgoing,
            isMediaDownloading,
            activeChatId: activeChat?.chat_id ?? null,
        });
    }, [
        activeChat?.chat_id,
        isFailedOutgoing,
        isMediaDownloading,
        isPendingOutgoing,
        isReadOutgoing,
        isSelected,
        message,
        selectedCount,
        sent,
    ]);

    const swipeProgress = useAnimatedStyle(() => {
        const progress = interpolate(
            swipeX.value,
            [0, MAX_SWIPE_TRANSLATION],
            [0, 1],
            Extrapolation.CLAMP
        );

        return {
            opacity: progress,
            transform: [
                { translateX: interpolate(progress, [0, 1], [-18, 0], Extrapolation.CLAMP) },
            ],
        };
    });

    const replyButtonAnimatedStyle = useAnimatedStyle(() => {
        const progress = interpolate(
            swipeX.value,
            [0, MAX_SWIPE_TRANSLATION],
            [0, 1],
            Extrapolation.CLAMP
        );

        return {
            borderWidth: interpolate(progress, [0, 1], [0, 2], Extrapolation.CLAMP),
            borderRadius: 999,
        };
    });

    const bubbleAndTailAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: swipeX.value }],
    }));


    const hasTriggered = useSharedValue(false);

    const panGesture = useMemo(
        () => Gesture.Pan()
            .activeOffsetX([-12, 12])
            .failOffsetY([-10, 10])
            .onUpdate((event) => {
                const nextTranslation = Math.max(0, event.translationX);
                const resistedTranslation = nextTranslation <= MAX_SWIPE_TRANSLATION
                    ? nextTranslation
                    : MAX_SWIPE_TRANSLATION + (nextTranslation - MAX_SWIPE_TRANSLATION) * SWIPE_RESISTANCE;

                swipeX.value = Math.min(SWIPE_HARD_LIMIT, resistedTranslation);

                if (!hasTriggered.value && resistedTranslation >= MAX_SWIPE_TRANSLATION) {
                    hasTriggered.value = true;
                    runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
                }
            })
            .onEnd((event) => {
                const finalTranslation = Math.max(0, event.translationX);
                const finalResistedTranslation = finalTranslation <= MAX_SWIPE_TRANSLATION
                    ? finalTranslation
                    : MAX_SWIPE_TRANSLATION + (finalTranslation - MAX_SWIPE_TRANSLATION) * SWIPE_RESISTANCE;

                if (finalResistedTranslation >= MAX_SWIPE_TRANSLATION) {
                    runOnJS(debugBubble)('reply-swipe-complete', {
                        messageId: message.message_id,
                        chatId: message.chat_room_id,
                        senderUserId: message.sender_user_id,
                    });
                    runOnJS(handleReply)(
                        senderDisplayName,
                        message_text_content,
                        media_preview_url,
                        attached_media,
                        message.message_id,
                        message.sender_user_id
                    );
                }

                hasTriggered.value = false;
                swipeX.value = withSpring(0, {
                    damping: 22,
                    stiffness: 240,
                    mass: 0.7,
                });
            })
            .onFinalize(() => {
                if (hasTriggered.value) {
                    hasTriggered.value = false;
                }
                swipeX.value = withSpring(0, {
                    damping: 22,
                    stiffness: 240,
                    mass: 0.7,
                });
            }),
        [
            attached_media,
            handleReply,
            hasTriggered,
            media_preview_url,
            message.message_id,
            message.sender_user_id,
            message_text_content,
            senderDisplayName,
            swipeX,
        ]
    );

    const handleDownloadMedia = useCallback(async () => {
        debugBubble('download-media-press', {
            message: summarizeBubbleMessage(message),
            currentUserId,
            isMediaDownloading,
            canDownloadFullMedia,
        });
        if (!currentUserId || isMediaDownloading) {
            debugBubble('download-media-skip', {
                message: summarizeBubbleMessage(message),
                currentUserId,
                isMediaDownloading,
            });
            return;
        }

        setIsMediaDownloading(true);
        try {
            debugBubble('download-media-start', {
                message: summarizeBubbleMessage(message),
            });
            const localMessage = await materializeMessageMedia(message, {
                downloadFull: true,
            });

            useActiveChatStore.getState().updateMessage(
                localMessage.chat_room_id,
                localMessage.message_id,
                () => localMessage
            );
            await upsertDbMessages([localMessage], currentUserId);
            debugBubble('download-media-success', {
                message: summarizeBubbleMessage(localMessage),
            });
        } catch (error) {
            debugBubble('download-media-error', {
                message: summarizeBubbleMessage(message),
                error,
            });
            console.log("Failed to download message media:", error);
        } finally {
            setIsMediaDownloading(false);
            debugBubble('download-media-finish', {
                messageId: message.message_id,
                chatId: message.chat_room_id,
            });
        }
    }, [currentUserId, isMediaDownloading, message]);

    return (
        <TouchableWithoutFeedback
            onLongPress={() => {
                debugBubble('long-press', {
                    message: summarizeBubbleMessage(message),
                    sent,
                });
                onLongPress(message_id);
            }}
            onPress={() => {
                debugBubble('press', {
                    message: summarizeBubbleMessage(message),
                    sent,
                    isSelected,
                });
                onPress(message_id);
            }}
        >
            <View
                style={[
                    styles.row,
                    sent ? styles.rowSent : styles.rowReceived,
                    {
                        paddingTop: isGroupedWithPrevious ? 0 : 4,
                        paddingBottom: isGroupedWithNext ? 0 : 4,
                    },
                ]}
            >
                {isSelected && (
                    <ThemedView style={styles.selectOverlayer} />
                )}
                <Animated.View pointerEvents="none" style={[styles.swipeReplyButton, swipeProgress]}>
                    <AnimatedIconButton
                        icon="arrow-left-top"
                        iconColor={isDark ? '#ffffff' : '#000000'}
                        size={20}
                        mode="contained"
                        containerColor={isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'}
                        onPress={() => console.log('Forward Pressed')}
                        style={[styles.replySwipeIcon, { borderColor: colors.card }, replyButtonAnimatedStyle]}
                    />
                </Animated.View>
                {isFailedOutgoing && (
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Retry sending message"
                        hitSlop={8}
                        style={styles.retryButton}
                        onPress={() => {
                            debugBubble('retry-press', {
                                message: summarizeBubbleMessage(message),
                            });
                            onRetryMessage?.(message);
                        }}
                    >
                        <Icon
                            source="alert-circle"
                            color="#ef4444"
                            size={22}
                        />
                    </Pressable>
                )}
                <GestureDetector gesture={panGesture}>
                    <Animated.View style={[styles.messageContentRow, bubbleAndTailAnimatedStyle]}>
                        {!sent && isGroupChat && (
                            <View style={styles.groupAvatarColumn}>
                                {showTail ? (
                                    <Pressable
                                        accessibilityRole="button"
                                        hitSlop={6}
                                        onPress={handleOpenSenderProfile}
                                    >
                                        <ChatAvatar
                                            userId={senderGroupMember?.user_id ?? sender_user_id}
                                            imageUrl={senderAvatar}
                                            displayName={senderDisplayName}
                                            contactPhone={senderPhone}
                                            style={styles.groupSenderAvatar}
                                            iconColor={groupSenderAccent}
                                            backgroundColor={isDark ? "#182229" : "#e8f0ef"}
                                            textColor={groupSenderAccent}
                                            chatType={activeChat.chat_type}
                                        />
                                    </Pressable>
                                ) : (
                                    <View style={styles.groupSenderAvatarSpacer} />
                                )}
                            </View>
                        )}
                        <View style={styles.bubbleAndTailWrapper}>
                            {!sent && (showTail
                                ? <Tail color={bubbleColor} sent={false} />
                                : <View style={styles.tailSpacer} />
                            )}
                            <View style={[
                                styles.bubble,
                                { backgroundColor: bubbleColor, paddingHorizontal: attached_media ? 4 : 10, paddingVertical: attached_media === 'voice' ? 8 : 4 },
                                !sent && showTail && styles.receivedBubbleWithTail,
                                sent && showTail && styles.sentBubbleWithTail,
                            ]}>
                                {!sent && isGroupChat && showTail && (
                                    <TouchableRipple
                                        key={message_id}
                                        rippleColor={colors.textSecondary + '33'}
                                        underlayColor={colors.textSecondary + '22'}
                                        background={{ type: 'ripple', color: colors.textSecondary + '33', foreground: true }}
                                        style={styles.groupSenderHeader}
                                        onPress={handleOpenSenderProfile}
                                    >
                                        <>
                                            <ThemedText
                                                numberOfLines={1}
                                                style={[styles.groupSenderName, { color: groupSenderAccent }]}
                                            >
                                                {senderDisplayName}
                                            </ThemedText>
                                            {shouldShowSenderPhone && senderPhone ? (
                                                <ThemedText
                                                    numberOfLines={1}
                                                    style={[
                                                        styles.groupSenderPhone,
                                                        { color: isDark ? "#9CA3AF" : "#6B7280" },
                                                    ]}
                                                >
                                                    {senderPhone}
                                                </ThemedText>
                                            ) : null}
                                        </>
                                    </TouchableRipple>
                                )}
                                {is_forward_message && (
                                    <ThemedView style={styles.forwardContainer}>
                                        <Icon
                                            source="arrow-right-top"
                                            color={colors.textSecondary}
                                            size={16}
                                        />
                                        <ThemedText style={[styles.forwardText, { color: colors.textSecondary }]}>Forwarded</ThemedText>
                                    </ThemedView>
                                )}
                                {reply_message && (
                                    <TouchableRipple
                                        key={reply_message.original_message_id}
                                        rippleColor={colors.textSecondary + '33'}
                                        underlayColor={colors.textSecondary + '22'}
                                        background={{ type: 'ripple', color: colors.textSecondary + '33', foreground: true }}
                                        style={{ flexDirection: 'row', flex: 1, minWidth: 120, alignItems: 'center', justifyContent: 'space-between', marginHorizontal: attached_media ? 0 : -4, marginBottom: 4, backgroundColor: sent ? theme.cardSent : theme.cardReceived, borderRadius: 7, overflow: 'hidden' }}
                                        onPress={() => console.log('reply message pressed')}
                                    >
                                        <>
                                            <ThemedView style={[styles.replyContainer, { borderLeftColor: '#25D366', backgroundColor: 'transparent' }]}>
                                                <ThemedText style={{ fontSize: 14 }}>{replySenderDisplayName}</ThemedText>
                                                <ThemedText numberOfLines={2} ellipsizeMode='tail' style={{ fontSize: 12, color: colors.textSecondary, minWidth: 0, lineHeight: 16 }}>
                                                    {reply_message.original_message_text ? reply_message.original_message_text : (reply_message.original_attached_media === 'contact' ? '👤 Contact' : reply_message.original_attached_media === 'file' ? '📂 File' : reply_message.original_attached_media === 'photo' ? '🖼️ Photo' : reply_message.original_attached_media === 'video' ? '📽️ Video' : '🎤 Voice')}
                                                </ThemedText>
                                            </ThemedView>
                                            {reply_message.original_attached_media === 'photo' && (
                                                <ReplyPhotoThumbnail
                                                    url={reply_message.original_attached_media_url}
                                                    isDark={isDark}
                                                />
                                            )}
                                        </>
                                    </TouchableRipple>
                                )}
                                {open_graph_data && (
                                    <Pressable
                                        onPress={() => {
                                            if (open_graph_data.og_url?.startsWith('http://') || open_graph_data.og_url?.startsWith('https://')) {
                                                Linking.openURL(open_graph_data.og_url);
                                            } else {
                                                Linking.openURL(`https://${open_graph_data.og_url}`);
                                            }
                                        }}
                                        style={[styles.openGraphContainer, { backgroundColor: sent ? theme.cardSent : theme.cardReceived }]}>
                                        <ThemedText style={styles.openGraphTitle} numberOfLines={1}>{open_graph_data.og_title}</ThemedText>
                                        <ThemedText numberOfLines={2} ellipsizeMode="tail" style={[styles.openGraphDescription, { color: colors.textSecondary }]}>{open_graph_data.og_description}</ThemedText>
                                        <ThemedView style={styles.openGraphLinkContainer}>
                                            <Icon
                                                source="link"
                                                color={colors.textSecondary}
                                                size={13}
                                            />
                                            <ThemedText numberOfLines={1} ellipsizeMode="tail" style={[styles.openGraphLink, { color: colors.textSecondary }]}>{open_graph_data.og_url}</ThemedText>
                                        </ThemedView>
                                    </Pressable>
                                )}
                                {attached_media === 'contact' && (
                                    <ThemedView style={[styles.contactCard, { backgroundColor: sent ? theme.cardSent : theme.cardReceived }]}>
                                        <ThemedView style={styles.contactContentContainer}>
                                            <ChatAvatar
                                                userId={contact?.linked_user_id ?? contact?.contact_id ?? null}
                                                imageUrl={contact?.contact_image}
                                                displayName={sharedContactName}
                                                contactPhone={sharedContactPhone}
                                                style={styles.avatar}
                                                iconColor={colors.textSecondary}
                                                backgroundColor={sent ? theme.cardSent : theme.cardReceived}
                                                textColor={colors.text}
                                                chatType={activeChat?.chat_type}
                                            />
                                            <ThemedView style={styles.contactTextContainer}>
                                                <ThemedText numberOfLines={1}>{sharedContactName}</ThemedText>
                                                {sharedContactPhone && (
                                                    <ThemedText
                                                        numberOfLines={1}
                                                        style={[styles.contactPhone, { color: colors.textSecondary }]}
                                                    >
                                                        {sharedContactPhone}
                                                    </ThemedText>
                                                )}
                                            </ThemedView>
                                        </ThemedView>
                                    </ThemedView>
                                )}
                                {attached_media === 'file' && (
                                    <ThemedView style={[styles.fileCard, { backgroundColor: sent ? theme.cardSent : theme.cardReceived }]}>
                                        {isDark ? <DarkFileIcon /> : <LightFileIcon />}
                                        <ThemedView style={styles.innerFileCardContent}>
                                            <ThemedText numberOfLines={1} ellipsizeMode="tail" style={styles.fileName}>{fileName}</ThemedText>
                                            {fileDetails.length > 0 && (
                                                <ThemedText style={[styles.fileDetails, { color: isDark ? '#6C757C' : 'gray' }]}>
                                                    {fileDetails}
                                                </ThemedText>
                                            )}
                                        </ThemedView>
                                    </ThemedView>
                                )}
                                {attached_media === 'photo' && (
                                    <DecryptedMediaImage
                                        source={hasLocalFullMedia ? photoSource : null}
                                        previewSource={photoPreviewSource}
                                        aspectRatio={mediaAspectRatio}
                                        isDark={isDark}
                                        showDownloadOverlay={shouldShowMediaDownloadOverlay}
                                        isDownloading={isMediaDownloading}
                                        downloadDetails={
                                            canDownloadFullMedia
                                                ? fileDetails || formatBytes(media_size_bytes)
                                                : "Too large"
                                        }
                                        onDownload={canDownloadFullMedia ? handleDownloadMedia : undefined}
                                        message_id={message_id}
                                        senderName={senderDisplayName}
                                        timeStamp={formattedTime}
                                    />
                                )}
                                {attached_media === 'video' && (
                                    <VideoMessagePreview
                                        localVideoUri={hasLocalFullMedia ? media_url : null}
                                        source={videoThumbnailSource}
                                        previewSource={videoPreviewSource}
                                        aspectRatio={mediaAspectRatio}
                                        isDark={isDark}
                                        showDownloadOverlay={shouldShowMediaDownloadOverlay}
                                        isDownloading={isMediaDownloading}
                                        downloadDetails={
                                            canDownloadMediaFromBubble
                                                ? fileDetails || formatBytes(media_size_bytes)
                                                : "Too large"
                                        }
                                        onDownload={canDownloadMediaFromBubble ? handleDownloadMedia : undefined}
                                        message_id={message_id}
                                        senderName={senderDisplayName}
                                        timeStamp={formattedTime}
                                        formatAudioTime={formatAudioTime}
                                    />
                                )}
                                {attached_media === 'voice' && (
                                    <VoiceMessagePreview
                                        messageId={message_id}
                                        audioSource={media_url}
                                        canLoadAudio={canDownloadFullMedia}
                                        isDark={isDark}
                                        userId={senderGroupMember?.user_id ?? sender_user_id}
                                        imageUrl={senderAvatar}
                                        displayName={senderDisplayName}
                                        contactPhone={senderPhone}
                                        iconColor={groupSenderAccent}
                                        textColor={groupSenderAccent}
                                        chatType={activeChat?.chat_type}
                                    />
                                )}
                                {attached_media === 'location' && location && (
                                    <ThemedView style={[styles.locationCard, { backgroundColor: sent ? theme.cardSent : theme.cardReceived }]}>
                                        <Icon
                                            source="map-marker"
                                            color="#25D366"
                                            size={28}
                                        />
                                        <ThemedView style={styles.innerFileCardContent}>
                                            <ThemedText numberOfLines={1} style={styles.fileName}>
                                                {location.name ?? 'Location'}
                                            </ThemedText>
                                            <ThemedText numberOfLines={2} style={[styles.fileDetails, { color: isDark ? '#6C757C' : 'gray' }]}>
                                                {location.formatted_address ?? `${location.latitude}, ${location.longitude}`}
                                            </ThemedText>
                                        </ThemedView>
                                    </ThemedView>
                                )}
                                {poll && (
                                    <ThemedView style={[styles.pollContentContainer, { backgroundColor: sent ? theme.cardSent : theme.cardReceived }]}>
                                        <ThemedText style={styles.pollTitle}>{poll.poll_question}</ThemedText>
                                        {poll.poll_options.map((option, index) => (
                                            <ThemedView
                                                key={`${poll.poll_id}-${index}`}
                                                style={[styles.pollOptionRow, { borderColor: sent ? theme.borderSent : theme.borderReceive }]}
                                            >
                                                <ThemedText numberOfLines={1} style={styles.pollOptionText}>
                                                    {option.text}
                                                </ThemedText>
                                            </ThemedView>
                                        ))}
                                        {poll.poll_multiple_answers && (
                                            <ThemedText style={[styles.pollHintText, { color: colors.textSecondary }]}>
                                                Multiple answers
                                            </ThemedText>
                                        )}
                                    </ThemedView>
                                )}
                                {message_text_content && attached_media !== 'contact' && (
                                    <ThemedText style={[
                                        styles.messageText,
                                        { color: sent ? theme.sentText : theme.receivedText },
                                    ]}>
                                        {detectAndRenderLinks(
                                            message_text_content,
                                            { color: sent ? theme.sentText : theme.receivedText },
                                            '#25D366'
                                        )}
                                    </ThemedText>
                                )}
                                <View style={styles.metaRow}>
                                    <ThemedText style={[
                                        styles.timeText,
                                        { color: sent ? theme.sentTime : theme.receivedTime },
                                    ]}>
                                        {formattedTime}
                                    </ThemedText>
                                    {sent && !isFailedOutgoing && (
                                        <Icon
                                            source={statusIconSource}
                                            color={statusIconColor}
                                            size={14}
                                        />
                                    )}
                                    {isStarredByCurrentUser && (
                                        <Icon
                                            source={'star'}
                                            color={colors.textSecondary}
                                            size={14}
                                        />
                                    )}
                                </View>
                                {attached_media === 'contact' && (
                                    <ThemedView style={[styles.contactActionContainer, { borderTopColor: sent ? theme.borderSent : theme.borderReceive }]}>
                                        <TouchableRipple style={[styles.contactActionButton, { borderRightColor: sent ? theme.borderSent : theme.borderReceive, borderRightWidth: 1 }]}>
                                            <ThemedText style={{ color: isDark ? '#4ade80' : '#15803d' }}>Add contact</ThemedText>
                                        </TouchableRipple>
                                        <TouchableRipple style={styles.contactActionButton}>
                                            <ThemedText style={{ color: isDark ? '#4ade80' : '#15803d' }}>Message</ThemedText>
                                        </TouchableRipple>
                                    </ThemedView>
                                )}
                                {poll && (
                                    <TouchableRipple style={[styles.pollActionContainer, { borderTopColor: sent ? theme.borderSent : theme.borderReceive }]}>
                                        <ThemedText style={{ color: isDark ? '#4ade80' : '#15803d' }}>View votes</ThemedText>
                                    </TouchableRipple>
                                )}
                                {message_raction && (
                                    <Pressable style={[styles.messageReactionContainer, { backgroundColor: sent ? theme.cardSent : theme.cardReceived, borderColor: sent ? theme.borderSent + '44' : theme.borderReceive + '44' }]}>
                                        <ThemedText style={styles.messageReactionEmoji}>{message_raction.reaction_emoji}</ThemedText>
                                    </Pressable>
                                )}
                            </View>
                            {sent && (showTail
                                ? <Tail color={bubbleColor} sent={true} />
                                : <View style={styles.tailSpacer} />
                            )}
                        </View>
                    </Animated.View>
                </GestureDetector>
            </View>
        </TouchableWithoutFeedback>
    );
}

function areBubblePropsEqual(previous: BubbleProps, next: BubbleProps) {
    if (
        previous.message !== next.message ||
        previous.currentUserId !== next.currentUserId ||
        previous.isDark !== next.isDark ||
        previous.showTail !== next.showTail ||
        previous.isGroupedWithPrevious !== next.isGroupedWithPrevious ||
        previous.isGroupedWithNext !== next.isGroupedWithNext ||
        previous.isSelected !== next.isSelected ||
        previous.onLongPress !== next.onLongPress ||
        previous.onPress !== next.onPress ||
        previous.onRetryMessage !== next.onRetryMessage ||
        previous.handleReply !== next.handleReply ||
        previous.isStarredByCurrentUser !== next.isStarredByCurrentUser
    ) {
        return false;
    }

    if (
        (previous.isSelected || next.isSelected) &&
        previous.selectedCount !== next.selectedCount
    ) {
        return false;
    }

    return true;
}

export default memo(Bubble, areBubblePropsEqual);

const BORDER_RADIUS = 10;

const styles = StyleSheet.create({
    row: {
        position: 'relative',
        flexDirection: 'row',
        marginVertical: 3,
        alignItems: 'flex-start',
        paddingHorizontal: 16,
        paddingVertical: 8,
        overflow: 'visible',
    },
    bubbleAndTailWrapper: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        overflow: 'visible',
        maxWidth: 300,
    },
    rowSent: {
        justifyContent: 'flex-end',
    },
    rowReceived: {
        justifyContent: 'flex-start',
    },
    swipeReplyButton: {
        position: 'absolute',
        left: 20,
        bottom: 0,
        top: 0,
        flex: 1,
        backgroundColor: 'transparent',
        justifyContent: 'center'
    },
    replySwipeIcon: {
        borderWidth: 0,
    },
    messageContentRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        position: 'relative',
        overflow: 'visible',
        maxWidth: 324
    },
    retryButton: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'flex-end',
        marginRight: 6,
        marginBottom: 8,
        backgroundColor: 'transparent',
    },
    groupAvatarColumn: {
        width: 38,
        flexShrink: 0,
        alignSelf: 'flex-start',
        marginRight: 4,
        backgroundColor: 'transparent',
    },
    groupSenderAvatar: {
        width: 34,
        height: 34,
        borderRadius: 99,
        alignItems: 'center',
        justifyContent: 'center',
    },
    groupSenderAvatarSpacer: {
        width: 34,
        height: 34,
    },
    groupSenderHeader: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 4,
        maxWidth: '100%',
        paddingHorizontal: 4,
        paddingBottom: 2,
        backgroundColor: 'transparent',
    },
    groupSenderName: {
        flexShrink: 1,
        minWidth: 0,
        fontSize: 12,
        lineHeight: 15,
        fontFamily: Fonts.bold
    },
    groupSenderPhone: {
        flexShrink: 1,
        minWidth: 0,
        fontSize: 11,
        lineHeight: 14,
        fontWeight: '500',
    },
    selectOverlayer: {
        ...StyleSheet.absoluteFill,
        backgroundColor: '#25d3652f',
        zIndex: 999
    },
    tailContainer: {
        width: 10,
        height: 14,
        marginBottom: -2,
    },
    tailReceived: {
        marginRight: -3,
        marginLeft: -6
    },
    tailSent: {
        marginLeft: -9,
    },
    tailSpacer: {
        width: 0,
    },
    bubble: {
        maxWidth: '100%',
        minWidth: 80,
        borderRadius: BORDER_RADIUS,
        position: 'relative',
        overflow: 'visible'
    },
    receivedBubbleWithTail: {
        borderTopLeftRadius: 0,
    },
    sentBubbleWithTail: {
        borderTopRightRadius: 0,
    },
    forwardContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'transparent'
    },
    forwardText: {
        fontSize: 14,
        fontStyle: 'italic',
        fontWeight: '400'
    },
    replyContainer: {
        flexDirection: 'column',
        borderLeftWidth: 3,
        overflow: 'hidden',
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    openGraphContainer: {
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderRadius: 8,
        flexDirection: 'column',
        gap: 10,
        marginBottom: 8,
        minWidth: '100%',
        marginHorizontal: -6
    },
    openGraphTitle: {
        fontSize: 14,
        fontWeight: '600',
        lineHeight: 15
    },
    openGraphDescription: {
        fontSize: 14,
        fontWeight: '400',
        lineHeight: 15
    },
    openGraphLinkContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'transparent',
        maxWidth: '80%'
    },
    openGraphLink: {
        fontSize: 13,
        fontWeight: '400',
        lineHeight: 14
    },
    pollContentContainer: {
        paddingHorizontal: 12,
        paddingVertical: 12,
        gap: 10,
        minWidth: '100%',
        borderRadius: 8,
        marginBottom: 8,
    },
    pollHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'transparent',
    },
    pollHeaderText: {
        fontSize: 12,
        lineHeight: 13,
        fontWeight: '400'
    },
    pollTitle: {
        fontSize: 14,
        fontWeight: '600',
        lineHeight: 15
    },
    pollOptionRow: {
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: 'transparent',
    },
    pollOptionText: {
        fontSize: 14,
        lineHeight: 16,
    },
    pollHintText: {
        fontSize: 12,
        lineHeight: 14,
    },
    mediaPhotoBlurred: {
        transform: [{ scale: 1.04 }],
    },
    messageText: {
        fontSize: 15,
        lineHeight: 20,
        paddingHorizontal: 4
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 2,
        marginTop: 3,
        paddingRight: 4
    },
    timeText: {
        fontSize: 11,
        lineHeight: 14,
    },
    contactCard: {
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 8,
        minWidth: '100%'
    },
    contactContentContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: 'transparent'
    },
    contactTextContainer: {
        flex: 1,
        minWidth: 0,
        backgroundColor: 'transparent',
    },
    contactPhone: {
        fontSize: 12,
        lineHeight: 14,
        marginTop: 2,
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 25,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    voiceCard: {
        minWidth: 260,
        width: 300,
        paddingHorizontal: 4,
        paddingVertical: 6,
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: -14,
        backgroundColor: 'transparent',
        paddingRight: 18
    },
    voicePlayButton: {
        margin: 0,
        width: 42,
        height: 42,
    },
    voiceLoadingButton: {
        width: 42,
        height: 42,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
    },
    voiceBody: {
        flex: 1,
        minWidth: 0,
        backgroundColor: 'transparent',
        gap: 5,
        bottom: -10
    },
    voiceSliderRow: {
        height: 26,
        justifyContent: 'center',
        backgroundColor: 'transparent',
    },
    voiceSlider: {
        height: 34,
        marginHorizontal: -10,
    },
    voiceTrack: {
        height: 3,
        borderRadius: 999,
        position: 'relative',
    },
    voiceTrackFill: {
        width: '18%',
        height: 3,
        borderRadius: 999,
    },
    voiceThumb: {
        position: 'absolute',
        left: '18%',
        top: -4,
        width: 11,
        height: 11,
        borderRadius: 999,
        marginLeft: -5.5,
    },
    voiceMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'transparent',
    },
    voiceTimeText: {
        fontSize: 11,
        lineHeight: 13,
    },
    fileCard: {
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 8,
        minWidth: '100%'
    },
    locationCard: {
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 8,
        minWidth: '100%',
    },
    innerFileCardContent: {
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        gap: 7,
        backgroundColor: 'transparent'
    },
    fileName: {
        fontSize: 14,
        fontWeight: '500',
        lineHeight: 15,
        maxWidth: 200
    },
    fileDetails: {
        fontSize: 12,
        fontWeight: '400',
        lineHeight: 13,
    },
    contactActionContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderTopWidth: 1,
        backgroundColor: 'transparent',
        marginTop: 4,
        marginHorizontal: -4,
        marginBottom: -4
    },
    contactActionButton: {
        flex: 1,
        paddingVertical: 10,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'transparent'
    },
    pollActionContainer: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 10,
        borderTopWidth: 1,
        backgroundColor: 'transparent',
        marginTop: 4,
        marginHorizontal: -10,
        marginBottom: -4
    },
    messageReactionContainer: {
        position: 'absolute',
        bottom: -15,
        left: 20,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 99,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        elevation: 1,
        borderWidth: 1,
        marginBottom: 6
    },
    messageReactionEmoji: {
        fontSize: 10,
        lineHeight: 11
    }
});
