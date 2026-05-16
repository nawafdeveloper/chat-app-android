import { fetchAndDecryptMessageMedia } from "@/lib/message-media";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Icon } from "react-native-paper";
import Animated from "react-native-reanimated";

const getMediaSharedTransitionTag = (mediaType: "image" | "video", messageId: string) =>
    `${mediaType}-preview-${messageId}`;

export function SmallDecryptedMediaImage({
    source,
    previewSource,
    sourceIsPreview = false,
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
    sharedTransitionTag,
}: {
    source?: string | null;
    previewSource?: string | null;
    sourceIsPreview?: boolean;
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
    const resolvedUriIsPreview = Boolean(sourceIsPreview && resolvedUri);
    const shouldBlurPreview = Boolean(resolvedUriIsPreview || (!resolvedUri && resolvedPreviewUri));
    const transitionTag = sharedTransitionTag ?? getMediaSharedTransitionTag("image", message_id);
    const hasFullMedia = Boolean(resolvedUri && !sourceIsPreview);

    const handlePreviewPress = onPreviewPress === undefined ? (() => {
        // Only allow navigation if we have full media
        if (!hasFullMedia) return;

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
                    stylesSmall.mediaPlaceholder,
                    {
                        backgroundColor: isDark ? "#182229" : "#edf2f7",
                    },
                    containerStyle,
                ]}
            >
                {showDownloadOverlay ? (
                    <Pressable
                        onPress={isDownloading ? undefined : onDownload}
                        style={stylesSmall.mediaPlaceholderDownload}
                    >
                        {isDownloading ? (
                            <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                            <Icon source="download" color="#ffffff" size={20} />
                        )}
                    </Pressable>
                ) : !failed ? (
                    <ActivityIndicator size="small" color="#25D366" />
                ) : (
                    <Icon
                        source={fallbackIcon === "video" ? "video-off-outline" : "image-broken-variant"}
                        color={isDark ? "#8E9499" : "#64748b"}
                        size={20}
                    />
                )}
            </View>
        );
    }

    return (
        <Pressable onPress={handlePreviewPress ?? undefined} disabled={!hasFullMedia}>
            <Animated.View
                sharedTransitionTag={transitionTag}
                style={[stylesSmall.mediaWrapper, containerStyle]}
            >
                <Animated.Image
                    source={{ uri: displayUri }}
                    resizeMode="cover"
                    blurRadius={shouldBlurPreview ? 1 : 0}
                    style={[
                        stylesSmall.mediaPhoto,
                        shouldBlurPreview && stylesSmall.mediaPhotoBlurred,
                    ]}
                />

                {isDecrypting && (
                    <View style={stylesSmall.mediaDecryptingOverlay}>
                        <ActivityIndicator size="small" color="#ffffff" />
                    </View>
                )}
                {showPlayIcon && shouldBlurPreview && (
                    <View style={stylesSmall.playOverlay}>
                        <View style={{ padding: 6, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.2)' }}>
                            <Icon source="play" color="#ffffff" size={20} />
                        </View>
                    </View>
                )}
                {showDownloadOverlay && !hasFullMedia && (
                    <View style={stylesSmall.downloadCenterOverlay}>
                        <Pressable
                            style={stylesSmall.mediaDownloadButtonCenter}
                            onPress={isDownloading ? undefined : onDownload}
                        >
                            {isDownloading ? (
                                <ActivityIndicator size="small" color="#ffffff" />
                            ) : (
                                <Icon source="download" color="#ffffff" size={24} />
                            )}
                        </Pressable>
                    </View>
                )}
            </Animated.View>
        </Pressable>
    );
}

const stylesSmall = StyleSheet.create({
    mediaPlaceholder: {
        width: 120,
        height: 120,
        borderRadius: 12,
        marginBottom: 4,
        justifyContent: 'center',
        alignItems: 'center',
    },
    mediaPlaceholderDownload: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
    mediaWrapper: {
        width: 120,
        height: 120,
        borderRadius: 12,
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
    downloadCenterOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    mediaDownloadButtonCenter: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(0,0,0,0.65)',
        justifyContent: 'center',
        alignItems: 'center',
    },
});
