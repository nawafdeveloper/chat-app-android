import { Image } from "expo-image";
import { router } from "expo-router";
import { useVideoPlayer, VideoThumbnail } from "expo-video";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Icon } from "react-native-paper";
import Animated from "react-native-reanimated";
import { DecryptedMediaImage } from "./decrypted-image-preview";
import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";

const getMediaSharedTransitionTag = (mediaType: "image" | "video", messageId: string) =>
    `${mediaType}-preview-${messageId}`;

export function VideoMessagePreview({
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
    timeStamp,
    formatAudioTime
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
    formatAudioTime: (seconds?: number | null | undefined) => string
}) {
    const player = useVideoPlayer(
        localVideoUri ? { uri: localVideoUri } : null
    );
    const [thumbnail, setThumbnail] = useState<VideoThumbnail | null>(null);
    const hasFullMedia = Boolean(localVideoUri);
    const thumbnailVideoUri =
        localVideoUri ??
        (source?.startsWith("file:") ||
            source?.startsWith("content:") ||
            source?.startsWith("asset:")
            ? source
            : null);
    const thumbnailPlayer = useVideoPlayer(
        thumbnailVideoUri ? { uri: thumbnailVideoUri } : null
    );
    const videoDuration = formatAudioTime(
        (hasFullMedia ? player.duration : thumbnailPlayer.duration) ?? 0
    )

    useEffect(() => {
        let mounted = true;

        setThumbnail(null);
        if (!thumbnailVideoUri) {
            return () => {
                mounted = false;
            };
        }

        thumbnailPlayer.generateThumbnailsAsync(0, { maxWidth: 1280 })
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
    }, [thumbnailPlayer, thumbnailVideoUri]);

    if (thumbnail) {
        return (
            <Pressable
                onPress={hasFullMedia ? () => router.push({ pathname: '/video-player', params: { videoUrl: localVideoUri, messageId: message_id, senderName: senderName, timeStamp: timeStamp } }) : undefined}
                disabled={!hasFullMedia}
            >
                <Animated.View
                    sharedTransitionTag={getMediaSharedTransitionTag("video", message_id)}
                    style={[styles.mediaWrapper, { aspectRatio }]}>
                    <Image
                        source={thumbnail}
                        contentFit="cover"
                        blurRadius={hasFullMedia ? 0 : 1}
                        style={[
                            styles.mediaPhoto,
                            !hasFullMedia && styles.mediaPhotoBlurred,
                        ]}
                    />
                    <View style={styles.playOverlay}>
                        {hasFullMedia ? (
                            <View style={styles.videoPlayBadge}>
                                <Icon source="play" color="#ffffff" size={32} />
                            </View>
                        ) : null}
                        <ThemedView style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'transparent', position: 'absolute', left: 8, bottom: 8, zIndex: 1 }}>
                            <Icon source="video" color="#ffffff" size={20} />
                            <ThemedText style={{ fontSize: 12, fontWeight: '500' }}>{videoDuration}</ThemedText>
                        </ThemedView>
                    </View>
                    {showDownloadOverlay && !hasFullMedia && (
                        <Pressable
                            style={styles.downloadCenterOverlay}
                            onPress={isDownloading ? undefined : onDownload}
                        >
                            <View style={aspectRatio < 1.4 ? styles.mediaDownloadButtonCompact : styles.mediaDownloadButton}>
                                {isDownloading ? (
                                    <ActivityIndicator size="small" color="#ffffff" />
                                ) : (
                                    <Icon source="download" color="#ffffff" size={aspectRatio < 1.4 ? 24 : 32} />
                                )}
                                {aspectRatio < 1.4 ? null : (
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
                                )}
                            </View>
                        </Pressable>
                    )}
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
            isLarge={aspectRatio < 1.4}
        />
    );
}

const styles = StyleSheet.create({
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
    downloadCenterOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.3)',
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
    mediaDownloadButtonCompact: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(0,0,0,0.62)',
        justifyContent: 'center',
        alignItems: 'center',
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
});
