import { Colors } from "@/constants/theme";
import { findContactByPhone, findContactByUserId, getContactDisplayName } from "@/lib/contact-display";
import {
    fetchAndDecryptMessageMedia,
    isLocalMediaUri,
    isMessageMediaSafeForJsDecrypt,
    materializeMessageMedia,
} from "@/lib/message-media";
import { upsertDbMessages } from "@/lib/upsert-db-messages";
import { useActiveChatStore } from "@/store/use-active-chat-store";
import { useContactDirectoryStore } from "@/store/use-contact-directory-store";
import { Message } from "@/types/messages";
import Slider from "@react-native-community/slider";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import * as Haptics from 'expo-haptics';
import { Image } from "expo-image";
import { router } from "expo-router";
import { useVideoPlayer, type VideoThumbnail } from "expo-video";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TouchableWithoutFeedback, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Icon, IconButton, TouchableRipple } from "react-native-paper";
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { Path, Svg } from 'react-native-svg';
import { runOnJS } from "react-native-worklets";
import { ChatAvatar } from "./decrypted-chat-avatar";
import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";
import { DarkFileIcon, LightFileIcon } from "./ui/file-icons";

type BubbleProps = {
    message: Message;
    currentUserId: string | null;
    isDark: boolean;
    showTail?: boolean;
    isSelected: boolean;
    selectedCount: number;
    onLongPress: (messageId: string) => void;
    onPress: (messageId: string) => void;
    handleReply: (replyTo: string, replyMsg: string) => void;
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
const getMediaSharedTransitionTag = (mediaType: "image" | "video", messageId: string) =>
    `${mediaType}-preview-${messageId}`;

type ActiveVoicePlayback = {
    messageId: string;
    pause: () => void;
    reset: () => void;
};

let activeVoicePlayback: ActiveVoicePlayback | null = null;
let latestVoicePlayRequestId: string | null = null;

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

function DecryptedMediaImage({
    source,
    previewSource,
    sourceIsPreview = false,
    aspectRatio,
    isDark,
    showPlayIcon = false,
    fallbackIcon = "image",
    containerStyle,
    showDownloadOverlay = false,
    isDownloading = false,
    downloadDetails,
    onDownload,
    message_id,
    senderName,
    timeStamp,
    onPreviewPress,
    sharedTransitionTag
}: {
    source?: string | null;
    previewSource?: string | null;
    sourceIsPreview?: boolean;
    aspectRatio: number;
    isDark: boolean;
    showPlayIcon?: boolean;
    fallbackIcon?: "image" | "video";
    containerStyle?: object;
    showDownloadOverlay?: boolean;
    isDownloading?: boolean;
    downloadDetails?: string | null;
    onDownload?: () => void;
    message_id: string;
    senderName: string;
    timeStamp: string;
    onPreviewPress?: (() => void) | null;
    sharedTransitionTag?: string;
}) {
    const [resolvedUri, setResolvedUri] = useState<string | null>(null);
    const [resolvedPreviewUri, setResolvedPreviewUri] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);
    const [isDecrypting, setIsDecrypting] = useState(false);

    useEffect(() => {
        let mounted = true;

        setResolvedUri(null);
        setResolvedPreviewUri(null);
        setFailed(false);
        setIsDecrypting(Boolean(source || previewSource));

        if (!source && !previewSource) {
            return () => {
                mounted = false;
            };
        }

        const load = async () => {
            let hasDisplayableMedia = false;

            try {
                if (previewSource) {
                    const previewUri = await fetchAndDecryptMessageMedia({
                        source: previewSource,
                        isPreview: true,
                        fallbackExtension: "jpg",
                    });

                    if (mounted) {
                        setResolvedPreviewUri(previewUri ?? null);
                    }
                    hasDisplayableMedia = Boolean(previewUri);
                }
            } catch {
                if (mounted && previewSource) {
                    setResolvedPreviewUri(previewSource);
                    hasDisplayableMedia = true;
                }
            }

            try {
                if (source) {
                    const uri = await fetchAndDecryptMessageMedia({
                        source,
                        isPreview: sourceIsPreview,
                        fallbackExtension: "jpg",
                    });

                    if (mounted) {
                        setResolvedUri(uri ?? null);
                    }
                    hasDisplayableMedia = Boolean(uri) || hasDisplayableMedia;
                }
            } catch {
                if (mounted && !hasDisplayableMedia) {
                    setFailed(true);
                }
            } finally {
                if (mounted) {
                    setIsDecrypting(false);
                }
            }
        };

        void load();

        return () => {
            mounted = false;
        };
    }, [previewSource, source, sourceIsPreview]);

    const displayUri = resolvedUri ?? resolvedPreviewUri;
    const shouldBlurPreview = Boolean(!resolvedUri && resolvedPreviewUri);
    const transitionTag = sharedTransitionTag ?? getMediaSharedTransitionTag("image", message_id);
    const handlePreviewPress = onPreviewPress === undefined ? (() => {
        router.push({
            pathname: '/image-preview',
            params: {
                imageUrl: displayUri ?? "",
                messageId: message_id,
                senderName,
                timeStamp,
            },
        });
    }) : onPreviewPress;

    if (!displayUri || failed) {
        return (
            <View
                style={[
                    styles.mediaPlaceholder,
                    {
                        aspectRatio,
                        backgroundColor: isDark ? "#182229" : "#edf2f7",
                    },
                    containerStyle,
                ]}
            >
                {showDownloadOverlay ? (
                    <Pressable
                        onPress={isDownloading ? undefined : onDownload}
                        style={styles.mediaPlaceholderDownload}
                    >
                        {isDownloading ? (
                            <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                            <Icon source="download" color="#ffffff" size={28} />
                        )}
                        <ThemedText style={styles.mediaDownloadTitle}>
                            {isDownloading ? "Downloading" : "Download"}
                        </ThemedText>
                    </Pressable>
                ) : !failed ? (
                    <ActivityIndicator size="small" color="#25D366" />
                ) : (
                    <Icon
                        source={fallbackIcon === "video" ? "video-off-outline" : "image-broken-variant"}
                        color={isDark ? "#8E9499" : "#64748b"}
                        size={28}
                    />
                )}
            </View>
        );
    }

    return (
        <Pressable onPress={handlePreviewPress ?? undefined} disabled={!handlePreviewPress}>
            <Animated.View
                sharedTransitionTag={transitionTag}
                style={[styles.mediaWrapper, { aspectRatio }, containerStyle,]}
            >

                <Animated.Image
                    source={{ uri: displayUri }}
                    resizeMode="cover"
                    blurRadius={!resolvedUri && resolvedPreviewUri ? 1 : 0}
                    style={[
                        styles.mediaPhoto,
                        shouldBlurPreview && styles.mediaPhotoBlurred,
                    ]}
                />

                {isDecrypting && (
                    <View style={styles.mediaDecryptingOverlay}>
                        <ActivityIndicator size="small" color="#ffffff" />
                    </View>
                )}
                {showPlayIcon && shouldBlurPreview && (
                    <View style={styles.playOverlay}>
                        <View style={{ padding: 10, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.2)' }}>
                            <Icon source="play" color="#ffffff" size={32} />
                        </View>
                    </View>
                )}
                {showDownloadOverlay && (
                    <Pressable
                        style={styles.playOverlay}
                        onPress={isDownloading ? undefined : onDownload}
                    >
                        <View style={styles.mediaDownloadButton}>
                            {isDownloading ? (
                                <ActivityIndicator size="small" color="#ffffff" />
                            ) : (
                                <Icon source="download" color="#ffffff" size={32} />
                            )}
                            <ThemedView style={styles.mediaDownloadTextContainer}>
                                <ThemedText style={styles.mediaDownloadTitle}>
                                    {isDownloading ? "Downloading" : "Download"}
                                </ThemedText>
                                {downloadDetails ? (
                                    <ThemedText style={styles.mediaDownloadDetails}>
                                        {downloadDetails}
                                    </ThemedText>
                                ) : null}
                            </ThemedView>
                        </View>
                    </Pressable>
                )}
            </Animated.View>
        </Pressable>
    );
}

const API_BASE = "https://halabakk-web.nawaf-alhasosah.workers.dev";

function ReplyPhotoThumbnail({ url, isDark }: { url?: string | null; isDark: boolean }) {
    const [resolvedUri, setResolvedUri] = useState<string | null>(null);

    useEffect(() => {
        if (!url) return;
        const absoluteUrl = url.startsWith('/') ? `${API_BASE}${url}` : url;
        fetchAndDecryptMessageMedia({
            source: absoluteUrl,
            isPreview: true,
            fallbackExtension: 'jpg',
        }).then(uri => {
            if (uri) setResolvedUri(uri);
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

function VideoMessagePreview({
    localVideoUri,
    source,
    previewSource,
    aspectRatio,
    isDark,
    showDownloadOverlay,
    isDownloading,
    downloadDetails,
    onDownload,
    message_id,
    senderName,
    timeStamp
}: {
    localVideoUri?: string | null;
    source?: string | null;
    previewSource?: string | null;
    aspectRatio: number;
    isDark: boolean;
    showDownloadOverlay: boolean;
    isDownloading: boolean;
    downloadDetails?: string | null;
    onDownload?: () => void;
    message_id: string;
    senderName: string;
    timeStamp: string;
}) {
    const player = useVideoPlayer(
        localVideoUri ? { uri: localVideoUri } : null
    );
    const videoDuration = formatAudioTime(player.duration ?? 0)
    const [thumbnail, setThumbnail] = useState<VideoThumbnail | null>(null);

    useEffect(() => {
        let mounted = true;

        setThumbnail(null);
        if (!localVideoUri) {
            return () => {
                mounted = false;
            };
        }

        player.generateThumbnailsAsync(0, { maxWidth: 1280 })
            .then((thumbnails) => {
                if (mounted) {
                    setThumbnail(thumbnails[0] ?? null);
                }
            })
            .catch((error) => {
                console.log("Failed to generate video thumbnail:", error);
            });

        return () => {
            mounted = false;
        };
    }, [localVideoUri, player]);

    if (thumbnail) {
        return (
            <Pressable onPress={() => router.push({ pathname: '/video-player', params: { videoUrl: localVideoUri, messageId: message_id, senderName: senderName, timeStamp: timeStamp } })}>
                <Animated.View
                    sharedTransitionTag={getMediaSharedTransitionTag("video", message_id)}
                    style={[styles.mediaWrapper, { aspectRatio }]}>
                    <Image
                        source={thumbnail}
                        contentFit="cover"
                        style={styles.mediaPhoto}
                    />
                    <View style={styles.playOverlay}>
                        <View style={styles.videoPlayBadge}>
                            <Icon source="play" color="#ffffff" size={32} />
                        </View>
                        <ThemedView style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'transparent', position: 'absolute', left: 8, bottom: 8, zIndex: 1 }}>
                            <Icon source="video" color="#ffffff" size={20} />
                            <ThemedText style={{ fontSize: 12, fontWeight: '500' }}>{videoDuration}</ThemedText>
                        </ThemedView>
                    </View>
                </Animated.View>
            </Pressable>
        );
    }

    return (
        <DecryptedMediaImage
            source={source}
            previewSource={previewSource}
            sourceIsPreview
            aspectRatio={aspectRatio}
            isDark={isDark}
            showPlayIcon
            fallbackIcon="video"
            showDownloadOverlay={showDownloadOverlay}
            isDownloading={isDownloading}
            downloadDetails={downloadDetails}
            onDownload={onDownload}
            message_id={message_id}
            senderName={senderName}
            timeStamp={timeStamp}
            sharedTransitionTag={getMediaSharedTransitionTag("video", message_id)}
            onPreviewPress={localVideoUri ? () => router.push({
                pathname: '/video-player',
                params: {
                    videoUrl: localVideoUri,
                    messageId: message_id,
                    senderName,
                    timeStamp,
                },
            }) : null}
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
    textColor
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
        isMountedRef.current = true;

        return () => {
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
            return null;
        }

        if (resolvedAudioUri) {
            return resolvedAudioUri;
        }

        setIsAudioLoading(true);
        try {
            const uri = await fetchAndDecryptMessageMedia({
                source: audioSource,
                fallbackExtension: "m4a",
            });

            if (!uri || !isMountedRef.current) {
                return null;
            }

            setResolvedAudioUri(uri);
            replacePlayerSourceSafely(uri);
            return uri;
        } catch (error) {
            console.log("Failed to load voice message:", error);
            return null;
        } finally {
            if (isMountedRef.current) {
                setIsAudioLoading(false);
            }
        }
    }, [audioSource, canLoadAudio, replacePlayerSourceSafely, resolvedAudioUri]);

    const handlePlayPause = useCallback(async () => {
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
            return;
        }

        latestVoicePlayRequestId = messageId;
        setResetPositionOverride(false);
        stopActiveVoicePlayback(messageId);

        const uri = await ensureAudioReady();
        if (!uri || latestVoicePlayRequestId !== messageId || !isMountedRef.current) {
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

function Bubble({ message, currentUserId, isDark, showTail = true, isSelected, selectedCount, onLongPress, onPress, handleReply }: BubbleProps) {
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
    const chats = useActiveChatStore((state) => state.chats);
    const contacts = useContactDirectoryStore((state) => state.contacts);
    const [isMediaDownloading, setIsMediaDownloading] = useState(false);

    const theme = isDark ? DARK : LIGHT;
    const colors = isDark ? Colors.dark : Colors.light;
    const sent = sender_user_id === currentUserId;
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
                    runOnJS(handleReply)(senderDisplayName, message_text_content || '');
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
        [handleReply, hasTriggered, message_text_content, senderDisplayName, swipeX]
    );

    const handleDownloadMedia = useCallback(async () => {
        if (!currentUserId || isMediaDownloading) {
            return;
        }

        setIsMediaDownloading(true);
        try {
            const localMessage = await materializeMessageMedia(message, {
                downloadFull: true,
            });

            useActiveChatStore.getState().updateMessage(
                localMessage.chat_room_id,
                localMessage.message_id,
                () => localMessage
            );
            await upsertDbMessages([localMessage], currentUserId);
        } catch (error) {
            console.log("Failed to download message media:", error);
        } finally {
            setIsMediaDownloading(false);
        }
    }, [currentUserId, isMediaDownloading, message]);

    return (
        <TouchableWithoutFeedback
            onLongPress={() => onLongPress(message_id)}
            onPress={() => onPress(message_id)}
        >
            <View
                style={[
                    styles.row,
                    sent ? styles.rowSent : styles.rowReceived,
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
                <GestureDetector gesture={panGesture}>
                    <Animated.View style={[styles.messageContentRow, bubbleAndTailAnimatedStyle]}>
                        {!sent && isGroupChat && (
                            <View style={styles.groupAvatarColumn}>
                                {showTail ? (
                                    <ChatAvatar
                                        userId={senderGroupMember?.user_id ?? sender_user_id}
                                        imageUrl={senderAvatar}
                                        displayName={senderDisplayName}
                                        contactPhone={senderPhone}
                                        style={styles.groupSenderAvatar}
                                        iconColor={groupSenderAccent}
                                        backgroundColor={isDark ? "#182229" : "#e8f0ef"}
                                        textColor={groupSenderAccent}
                                    />
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
                                {!sent && isGroupChat && (
                                    <ThemedView style={styles.groupSenderHeader}>
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
                                    </ThemedView>
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
                                    <ThemedView style={{ flexDirection: 'row', flex: 1, minWidth: 120, alignItems: 'center', justifyContent: 'space-between', marginHorizontal: attached_media ? 0 : -4, marginBottom: 4, backgroundColor: sent ? theme.cardSent : theme.cardReceived, borderRadius: 7, overflow: 'hidden' }}>
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
                                    </ThemedView>
                                )}
                                {open_graph_data && (
                                    <ThemedView style={[styles.openGraphContainer, { backgroundColor: sent ? theme.cardSent : theme.cardReceived }]}>
                                        <ThemedText style={styles.openGraphTitle}>{open_graph_data.og_title}</ThemedText>
                                        <ThemedText numberOfLines={3} ellipsizeMode="tail" style={[styles.openGraphDescription, { color: colors.textSecondary }]}>{open_graph_data.og_description}</ThemedText>
                                        <ThemedView style={styles.openGraphLinkContainer}>
                                            <Icon
                                                source="link"
                                                color={colors.textSecondary}
                                                size={13}
                                            />
                                            <ThemedText style={[styles.openGraphLink, { color: colors.textSecondary }]}>{open_graph_data.og_url}</ThemedText>
                                        </ThemedView>
                                    </ThemedView>
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
                                            <ThemedText numberOfLines={1} style={styles.fileName}>{fileName}</ThemedText>
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
                                                    {option}
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
                                    <Text style={[
                                        styles.messageText,
                                        { color: sent ? theme.sentText : theme.receivedText },
                                    ]}>
                                        {message_text_content}
                                    </Text>
                                )}
                                <View style={styles.metaRow}>
                                    <Text style={[
                                        styles.timeText,
                                        { color: sent ? theme.sentTime : theme.receivedTime },
                                    ]}>
                                        {formattedTime}
                                    </Text>
                                    {sent && (
                                        <Icon
                                            source={'check-all'}
                                            color={theme.check}
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
        previous.isSelected !== next.isSelected ||
        previous.onLongPress !== next.onLongPress ||
        previous.onPress !== next.onPress ||
        previous.handleReply !== next.handleReply
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

const BORDER_RADIUS = 8;

const styles = StyleSheet.create({
    row: {
        position: 'relative',
        flexDirection: 'row',
        marginVertical: 1,
        alignItems: 'flex-start',
        paddingHorizontal: 16,
        paddingVertical: 10,
        overflow: 'visible',
    },
    bubbleAndTailWrapper: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        overflow: 'visible',
        maxWidth: 280,
    },
    rowSent: {
        justifyContent: 'flex-end',
    },
    rowReceived: {
        justifyContent: 'flex-start',
    },
    reactionContainer: {
        position: 'absolute',
        top: -60,
        zIndex: 99,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 99,
        elevation: 3
    },
    emojis: {
        fontSize: 28,
        lineHeight: 32
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
        fontWeight: '700',
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
    },
    tailSent: {
        marginLeft: -9,
    },
    tailSpacer: {
        width: 16,
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
        backgroundColor: 'transparent'
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
    mediaWrapper: {
        width: '100%',
        borderRadius: 6,
        marginBottom: 4,
        overflow: 'hidden',
        position: 'relative',
    },
    mediaPhoto: {
        width: '100%',
        height: '100%',
    },
    mediaPhotoBlurred: {
        transform: [{ scale: 1.04 }],
    },
    mediaDecryptingOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.16)',
    },
    mediaPlaceholder: {
        width: '100%',
        borderRadius: 6,
        marginBottom: 4,
        justifyContent: 'center',
        alignItems: 'center',
    },
    mediaPlaceholderDownload: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 999,
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
    playOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    videoPlayBadge: {
        padding: 10,
        borderRadius: 99,
        backgroundColor: 'rgba(255,255,255,0.2)',
    },
    mediaDownloadButton: {
        padding: 10,
        paddingRight: 16,
        borderRadius: 999,
        backgroundColor: 'rgba(0,0,0,0.45)',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    mediaDownloadTextContainer: {
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'flex-start',
        backgroundColor: 'transparent',
    },
    mediaDownloadTitle: {
        color: 'white',
        fontWeight: '600',
        lineHeight: 16,
    },
    mediaDownloadDetails: {
        color: 'white',
        fontSize: 12,
        lineHeight: 14,
        fontWeight: '400',
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
        maxWidth: 280,
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
        lineHeight: 15
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
        borderWidth: 1
    },
    messageReactionEmoji: {
        fontSize: 10,
        lineHeight: 11
    }
});
