import { Colors } from '@/constants/theme';
import { useSendChatMessage } from '@/hooks/use-send-chat-message';
import { createUploadFileFromLocalUri } from '@/lib/local-upload-file';
import { useVideoPreviewBeforeSentStore } from '@/store/video-preview-before-sent';
import Slider from '@react-native-community/slider';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Pressable, StyleSheet, TextInput, useColorScheme, View } from 'react-native';
import { Appbar, Icon, IconButton } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ViewShot, { captureRef } from 'react-native-view-shot';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

const PREVIEW_MAX_DIMENSION = 128;

const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

const getPreviewCaptureSize = (width: number, height: number) => {
    if (width <= 0 || height <= 0) {
        return {};
    }

    const scale = PREVIEW_MAX_DIMENSION / Math.max(width, height);

    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    };
};

const VideoPreviewBeforeSent = () => {
    const videoUrl = useVideoPreviewBeforeSentStore((state) => state.videoUrl);
    const hide = useVideoPreviewBeforeSentStore((state) => state.hide);

    useEffect(() => {
        if (!videoUrl) {
            hide();
        }
    }, [hide, videoUrl]);

    if (!videoUrl) {
        return null;
    }

    return <VideoPreviewContent videoUrl={videoUrl} />;
};

const VideoPreviewContent = ({ videoUrl }: { videoUrl: string }) => {
    const scheme = useColorScheme();
    const insets = useSafeAreaInsets();
    const resolvedScheme = scheme === 'unspecified' ? 'light' : scheme ?? 'light';
    const colors = Colors[resolvedScheme];
    const { sendAttachment } = useSendChatMessage();
    const { videoMessageContext, setVideoMessageContext, hide } = useVideoPreviewBeforeSentStore();

    const player = useVideoPlayer(videoUrl, (p) => {
        p.loop = false
        p.play()
    })

    const [keyboardOffset, setKeyboardOffset] = useState(-30);
    const [isPlaying, setIsPlaying] = useState(true)
    const [duration, setDuration] = useState(0)
    const [currentTime, setCurrentTime] = useState(0)
    const [isSeeking, setIsSeeking] = useState(false)
    const [sliderValue, setSliderValue] = useState(0)
    const [isSending, setIsSending] = useState(false)
    const [videoLayoutSize, setVideoLayoutSize] = useState({ width: 0, height: 0 })

    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const videoShotRef = useRef<ViewShot>(null)

    useEffect(() => {
        const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', () => {
            setKeyboardOffset(-30);
        });
        const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {
            setKeyboardOffset(-100);
        });

        return () => {
            keyboardDidShowListener.remove();
            keyboardDidHideListener.remove();
        };
    }, []);

    useEffect(() => {
        const subscription = player.addListener('statusChange', (status) => {
            if (status.status === 'readyToPlay') {
                setDuration(player.duration ?? 0)
            }
        })
        return () => subscription.remove()
    }, [player])

    useEffect(() => {
        const subscription = player.addListener('playingChange', (e) => {
            setIsPlaying(e.isPlaying)
        })
        return () => subscription.remove()
    }, [player])

    useEffect(() => {
        if (isPlaying && !isSeeking) {
            intervalRef.current = setInterval(() => {
                const t = player.currentTime ?? 0
                setCurrentTime(t)
                setSliderValue(t)
            }, 250)
        } else {
            if (intervalRef.current) {
                clearInterval(intervalRef.current)
                intervalRef.current = null
            }
        }
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current)
        }
    }, [isPlaying, isSeeking, player])

    const togglePlayPause = useCallback(() => {
        if (player.playing) {
            player.pause()
        } else {
            player.play()
        }
    }, [player])

    const handleSlidingStart = useCallback(() => {
        setIsSeeking(true)
        player.pause()
    }, [player])

    const handleValueChange = useCallback((value: number) => {
        setSliderValue(value)
        setCurrentTime(value)
    }, [])

    const handleSlidingComplete = useCallback(
        (value: number) => {
            player.currentTime = value
            setCurrentTime(value)
            setSliderValue(value)
            setIsSeeking(false)
            player.play()
        },
        [player]
    )

    const handleDiscardVideo = useCallback(() => {
        player.pause();
        hide();
    }, [hide, player]);

    const handleSendVideo = async () => {
        if (!videoUrl || isSending) return;

        setIsSending(true);
        let shouldHidePreview = false;
        try {
            const uploadFile = await createUploadFileFromLocalUri({
                uri: videoUrl,
                fallbackName: `video-${Date.now()}.mp4`,
                mimeType: 'video/mp4',
            });
            let previewFile = null;
            try {
                const previewUri = await captureRef(videoShotRef, {
                    format: 'jpg',
                    quality: 0.35,
                    result: 'tmpfile',
                    handleGLSurfaceViewOnAndroid: true,
                    ...getPreviewCaptureSize(videoLayoutSize.width, videoLayoutSize.height),
                });

                previewFile = await createUploadFileFromLocalUri({
                    uri: previewUri,
                    fallbackName: `video-${Date.now()}-preview.jpg`,
                    mimeType: 'image/jpeg',
                });
            } catch (error) {
                console.log('Failed to capture outgoing video preview:', error);
            }

            const sent = await sendAttachment({
                file: uploadFile,
                previewFile,
                attachedMedia: 'video',
                text: videoMessageContext,
            });

            if (sent) {
                shouldHidePreview = true;
            }
        } finally {
            setIsSending(false);
            if (shouldHidePreview) {
                handleDiscardVideo();
            }
        }
    };

    const trackColor = scheme === 'dark' ? "#6C757C" : "#94a3b8"

    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            keyboardVerticalOffset={keyboardOffset}
            behavior={'height'}
        >
            <Appbar.Header style={{ backgroundColor: colors.background }}>
                <Appbar.BackAction iconColor={colors.text} mode='contained' containerColor={colors.indicator} onPress={handleDiscardVideo} />
                <Appbar.Content title="" />
            </Appbar.Header>
            <ViewShot
                ref={videoShotRef}
                style={styles.video}
                options={{ format: 'jpg', quality: 0.35 }}
                onLayout={(event) => {
                    setVideoLayoutSize({
                        width: event.nativeEvent.layout.width,
                        height: event.nativeEvent.layout.height,
                    })
                }}
            >
                <VideoView
                    style={styles.videoContent}
                    player={player}
                    surfaceType="textureView"
                    fullscreenOptions={{ enable: false }}
                    allowsPictureInPicture
                    buttonOptions={{
                        showNext: false,
                        showPrevious: false,
                        showSeekBackward: false,
                        showSettings: false,
                        showSeekForward: false,
                        showSubtitles: false,
                        showBottomBar: false,
                        showPlayPause: false,
                    }}
                    nativeControls={false}
                />
            </ViewShot>
            <View
                pointerEvents="box-none"
                style={styles.playOverlay}
            >
                <Pressable style={styles.playBadgeContainer} onPress={togglePlayPause}>
                    <ThemedView style={styles.videoPlayBadge}>
                        <Icon
                            source={isPlaying ? 'pause' : 'play'}
                            color="#ffffff"
                            size={48}
                        />
                    </ThemedView>
                </Pressable>
            </View>
            <ThemedView style={styles.footer}>
                <ThemedText style={styles.timeLabel}>
                    {formatTime(currentTime)}
                </ThemedText>
                <Slider
                    style={styles.voiceSlider}
                    minimumValue={0}
                    maximumValue={duration > 0 ? duration : 1}
                    value={sliderValue}
                    minimumTrackTintColor={"#25D366"}
                    maximumTrackTintColor={trackColor}
                    thumbTintColor={"#25D366"}
                    disabled={duration <= 0}
                    onSlidingStart={handleSlidingStart}
                    onValueChange={handleValueChange}
                    onSlidingComplete={handleSlidingComplete}
                />
                <ThemedText style={styles.timeLabel}>
                    {formatTime(duration)}
                </ThemedText>
            </ThemedView>
            <View
                style={[
                    styles.bottomInputContainer,
                    { paddingBottom: insets.bottom + 20, backgroundColor: colors.background },
                ]}
            >
                <TextInput
                    value={videoMessageContext}
                    onChangeText={(text) => setVideoMessageContext(text)}
                    placeholder='Message'
                    style={[styles.input, { color: colors.text, backgroundColor: colors.card }]}
                    placeholderTextColor={colors.textSecondary}
                    enablesReturnKeyAutomatically={true}
                    selectionColor='#25D366'
                    multiline={false}
                />
                <IconButton
                    icon={isSending ? () => <ActivityIndicator size="small" color={Colors.dark.background} /> : "send"}
                    iconColor={Colors.dark.background}
                    containerColor='#25D366'
                    size={24}
                    disabled={isSending}
                    onPress={handleSendVideo}
                />
            </View>
        </KeyboardAvoidingView>
    )
}

export default VideoPreviewBeforeSent

const styles = StyleSheet.create({
    bottomInputContainer: {
        zIndex: 120,
        elevation: 12,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 8,
        gap: 8,
    },
    input: {
        flexDirection: 'row',
        gap: 10,
        paddingHorizontal: 16,
        paddingVertical: 6,
        flex: 1,
        borderRadius: 99,
        marginBottom: -4,
        marginTop: -4
    },
    video: {
        width: '100%',
        flex: 1,
        backgroundColor: 'black'
    },
    videoContent: {
        ...StyleSheet.absoluteFillObject,
    },
    playOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'transparent',
        justifyContent: 'center',
        alignItems: 'center',
    },
    playBadgeContainer: {
        position: 'absolute',
        zIndex: 100,
        elevation: 11,
    },
    videoPlayBadge: {
        padding: 10,
        borderRadius: 99,
        backgroundColor: 'rgba(255,255,255,0.2)',
    },
    footer: {
        borderTopWidth: 1,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
    },
    timeLabel: {
        fontSize: 12,
        fontVariant: ['tabular-nums'],
        minWidth: 38,
    },
    voiceSlider: {
        flex: 1,
        height: 34,
        marginHorizontal: -4,
    },
    footerBottom: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
})
