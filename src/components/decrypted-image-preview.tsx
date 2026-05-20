import { fetchAndDecryptMessageMedia } from "@/lib/message-media";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Icon } from "react-native-paper";
import Animated from "react-native-reanimated";
import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";

const getMediaSharedTransitionTag = (mediaType: "image" | "video", messageId: string) =>
    `${mediaType}-preview-${messageId}`;

export function DecryptedMediaImage({
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
    chatId,
    senderUserId,
    messageText,
    mediaPreviewUrl,
    onPreviewPress,
    sharedTransitionTag,
    isLarge = true
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
    chatId?: string | null;
    senderUserId?: string | null;
    messageText?: string | null;
    mediaPreviewUrl?: string | null;
    onPreviewPress?: (() => void) | null;
    sharedTransitionTag?: string;
    isLarge?: boolean;
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
    const resolvedUriIsPreview = Boolean(sourceIsPreview && resolvedUri);
    const shouldBlurPreview = Boolean(resolvedUriIsPreview || (!resolvedUri && resolvedPreviewUri));
    const transitionTag = sharedTransitionTag ?? getMediaSharedTransitionTag("image", message_id);
    const handlePreviewPress = onPreviewPress === undefined ? (() => {
        router.push({
            pathname: '/image-preview',
            params: {
                imageUrl: displayUri ?? "",
                messageId: message_id,
                senderName,
                timeStamp,
                ...(chatId ? { chatId } : {}),
                ...(senderUserId ? { senderUserId } : {}),
                ...(messageText ? { messageText } : {}),
                ...(mediaPreviewUrl ? { mediaPreviewUrl } : {}),
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
                    blurRadius={shouldBlurPreview ? 1 : 0}
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
                        <View style={isLarge ? styles.mediaDownloadButton : styles.mediaDownloadButtonCompact}>
                            {isDownloading ? (
                                <ActivityIndicator size="small" color="#ffffff" />
                            ) : (
                                <Icon source="download" color="#ffffff" size={isLarge ? 32 : 24} />
                            )}
                            {isLarge ? (
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
                            ) : null}
                        </View>
                    </Pressable>
                )}
            </Animated.View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    mediaPlaceholder: {
        width: '100%',
        borderRadius: 8,
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
    mediaDownloadTitle: {
        color: 'white',
        fontWeight: '600',
        lineHeight: 16,
    },
    mediaWrapper: {
        width: '100%',
        borderRadius: 8,
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
    playOverlay: {
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
    mediaDownloadDetails: {
        color: 'white',
        fontSize: 12,
        lineHeight: 14,
        fontWeight: '400',
    },
});
