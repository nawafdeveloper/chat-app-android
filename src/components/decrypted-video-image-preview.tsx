import { Image } from "expo-image";
import { router } from "expo-router";
import { useVideoPlayer, VideoThumbnail } from "expo-video";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
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
});