import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { Colors } from '@/constants/theme'
import Slider from '@react-native-community/slider'
import { router, useLocalSearchParams } from 'expo-router'
import { useVideoPlayer, VideoView } from 'expo-video'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, useColorScheme, useWindowDimensions } from 'react-native'
import {
    Gesture,
    GestureDetector,
    GestureHandlerRootView,
} from 'react-native-gesture-handler'
import { Appbar, Button, Icon, IconButton } from 'react-native-paper'
import Animated, {
    runOnJS,
    SlideInDown,
    SlideInUp,
    SlideOutDown,
    SlideOutUp,
    useAnimatedStyle,
    useSharedValue,
    withDecay,
    withSpring,
    withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const MIN_SCALE = 1
const MAX_SCALE = 5
const DOUBLE_TAP_SCALE = 2.5
const getParamValue = (value?: string | string[]) => Array.isArray(value) ? value[0] : value ?? ''
const getMediaSharedTransitionTag = (mediaType: 'image' | 'video', messageId: string) =>
    `${mediaType}-preview-${messageId}`

const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

const VideoPlayer = () => {
    const { videoUrl, messageId, senderName, timeStamp } = useLocalSearchParams<{
        videoUrl?: string | string[]
        messageId?: string | string[]
        senderName?: string | string[]
        timeStamp?: string | string[]
    }>()
    const playerVideoUrl = getParamValue(videoUrl)
    const previewMessageId = getParamValue(messageId)
    const previewSenderName = getParamValue(senderName)
    const previewTimeStamp = getParamValue(timeStamp)
    const scheme = useColorScheme()
    const insets = useSafeAreaInsets()
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme ?? 'light']
    const { width: screenWidth, height: screenHeight } = useWindowDimensions()

    const player = useVideoPlayer(playerVideoUrl, (p) => {
        p.loop = false
        p.play()
    })

    const [isPlaying, setIsPlaying] = useState(true)
    const [duration, setDuration] = useState(0)
    const [currentTime, setCurrentTime] = useState(0)
    const [isSeeking, setIsSeeking] = useState(false)
    const [sliderValue, setSliderValue] = useState(0)
    const [isHeaderAndFooterVisible, setIsHeaderAndFooterVisible] = useState(true)

    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

    const scale = useSharedValue(1)
    const savedScale = useSharedValue(1)
    const translateX = useSharedValue(0)
    const translateY = useSharedValue(0)
    const savedTranslateX = useSharedValue(0)
    const savedTranslateY = useSharedValue(0)
    const isPinching = useSharedValue(false)

    const getMaxPan = (currentScale: number) => {
        'worklet'
        const maxX = (screenWidth * (currentScale - 1)) / 2
        const maxY = (screenHeight * (currentScale - 1)) / 2
        return { maxX, maxY }
    }

    const clampValue = (value: number, min: number, max: number) => {
        'worklet'
        return Math.min(Math.max(value, min), max)
    }

    const toggleUI = () => setIsHeaderAndFooterVisible((prev) => !prev)

    const resetPinchFlag = () => {
        setTimeout(() => {
            isPinching.value = false
        }, 300)
    }

    const pinchGesture = Gesture.Pinch()
        .onBegin(() => { 'worklet' })
        .onUpdate((e) => {
            'worklet'
            scale.value = clampValue(savedScale.value * e.scale, MIN_SCALE, MAX_SCALE)
        })
        .onStart(() => { isPinching.value = true })
        .onEnd(() => {
            'worklet'
            if (scale.value < MIN_SCALE) {
                scale.value = withSpring(MIN_SCALE)
                savedScale.value = MIN_SCALE
                translateX.value = withSpring(0)
                translateY.value = withSpring(0)
                savedTranslateX.value = 0
                savedTranslateY.value = 0
            } else {
                savedScale.value = scale.value
                const { maxX, maxY } = getMaxPan(scale.value)
                const clampedX = clampValue(translateX.value, -maxX, maxX)
                const clampedY = clampValue(translateY.value, -maxY, maxY)
                translateX.value = withSpring(clampedX)
                translateY.value = withSpring(clampedY)
                savedTranslateX.value = clampedX
                savedTranslateY.value = clampedY
            }
        })
        .onFinalize(() => {
            'worklet'
            runOnJS(resetPinchFlag)()
            isPinching.value = false
        })

    const panGesture = Gesture.Pan()
        .averageTouches(true)
        .onUpdate((e) => {
            'worklet'
            if (scale.value <= 1) return
            const { maxX, maxY } = getMaxPan(scale.value)
            translateX.value = clampValue(savedTranslateX.value + e.translationX, -maxX, maxX)
            translateY.value = clampValue(savedTranslateY.value + e.translationY, -maxY, maxY)
            isPinching.value = true
        })
        .onEnd((e) => {
            'worklet'
            if (scale.value <= 1) return
            const { maxX, maxY } = getMaxPan(scale.value)
            translateX.value = withDecay(
                { velocity: e.velocityX, clamp: [-maxX, maxX], deceleration: 0.993 },
                (finished) => { 'worklet'; if (finished) savedTranslateX.value = translateX.value }
            )
            translateY.value = withDecay(
                { velocity: e.velocityY, clamp: [-maxY, maxY], deceleration: 0.993 },
                (finished) => { 'worklet'; if (finished) savedTranslateY.value = translateY.value }
            )
            isPinching.value = false
        })

    const doubleTapGesture = Gesture.Tap()
        .numberOfTaps(2)
        .maxDelay(250)
        .onEnd((e) => {
            'worklet'
            if (scale.value > MIN_SCALE) {
                scale.value = withTiming(MIN_SCALE, { duration: 280 })
                savedScale.value = MIN_SCALE
                translateX.value = withTiming(0, { duration: 280 })
                translateY.value = withTiming(0, { duration: 280 })
                savedTranslateX.value = 0
                savedTranslateY.value = 0
            } else {
                const targetScale = DOUBLE_TAP_SCALE
                const originX = e.x - screenWidth / 2
                const originY = e.y - screenHeight / 2
                const { maxX, maxY } = getMaxPan(targetScale)
                const newTranslateX = clampValue(-originX * (targetScale - 1), -maxX, maxX)
                const newTranslateY = clampValue(-originY * (targetScale - 1), -maxY, maxY)
                scale.value = withTiming(targetScale, { duration: 280 })
                savedScale.value = targetScale
                translateX.value = withTiming(newTranslateX, { duration: 280 })
                translateY.value = withTiming(newTranslateY, { duration: 280 })
                savedTranslateX.value = newTranslateX
                savedTranslateY.value = newTranslateY
            }
        })

    const singleTapGesture = Gesture.Tap()
        .numberOfTaps(1)
        .maxDelay(0)
        .onStart(() => { isPinching.value = false })
        .onEnd(() => {
            'worklet'
            if (isPinching.value) return
            runOnJS(toggleUI)()
        })

    const composed = Gesture.Simultaneous(
        Gesture.Exclusive(doubleTapGesture, singleTapGesture),
        Gesture.Simultaneous(pinchGesture, panGesture)
    )

    const animatedImageStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: translateX.value },
            { translateY: translateY.value },
            { scale: scale.value },
        ],
    }))

    const trackColor = scheme === 'dark' ? "#6C757C" : "#94a3b8"

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <ThemedView style={styles.main}>
                {isHeaderAndFooterVisible && (
                    <Animated.View
                        key="header"
                        entering={SlideInUp.duration(150)}
                        exiting={SlideOutUp.duration(150)}
                        style={{ position: 'absolute', left: 0, right: 0, top: 0, zIndex: 99, elevation: 10 }}
                    >
                        <Appbar.Header
                            style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.indicator + '33' }]}
                        >
                            <Appbar.BackAction onPress={() => router.back()} />
                            <Appbar.Content
                                title={
                                    <ThemedView style={styles.headerTitleContainer}>
                                        <ThemedText style={styles.headerTitle}>{previewSenderName}</ThemedText>
                                        <ThemedText style={styles.headerDescription}>{previewTimeStamp}</ThemedText>
                                    </ThemedView>
                                }
                            />
                            <Appbar.Action icon="progress-download" onPress={() => { }} color={colors.text} />
                        </Appbar.Header>
                    </Animated.View>
                )}

                {/* GestureDetector only wraps the video — NOT the play button */}
                <GestureDetector gesture={composed}>
                    <Animated.View
                        sharedTransitionTag={previewMessageId ? getMediaSharedTransitionTag('video', previewMessageId) : undefined}
                        style={[styles.video, animatedImageStyle]}
                    >
                        <VideoView
                            style={styles.video}
                            player={player}
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
                    </Animated.View>
                </GestureDetector>

                {/*
                  * Play/pause badge sits OUTSIDE GestureDetector.
                  * It intercepts its own touch → only togglePlayPause fires,
                  * singleTapGesture (toggleUI) never sees this press.
                  */}
                {isHeaderAndFooterVisible && (
                    <Pressable style={styles.playBadgeContainer} onPress={togglePlayPause}>
                        <ThemedView style={styles.videoPlayBadge}>
                            <Icon
                                source={isPlaying ? 'pause' : 'play'}
                                color="#ffffff"
                                size={48}
                            />
                        </ThemedView>
                    </Pressable>
                )}

                {isHeaderAndFooterVisible && (
                    <Animated.View
                        key="footer"
                        entering={SlideInDown.duration(150)}
                        exiting={SlideOutDown.duration(150)}
                        style={[
                            styles.footer,
                            { backgroundColor: colors.background, paddingBottom: insets.bottom * 2, borderTopColor: colors.indicator + '33' },
                        ]}
                    >
                        <ThemedView style={styles.footerTop}>
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
                        <ThemedView style={styles.footerBottom}>
                            <Button
                                buttonColor={colors.indicator + '33'}
                                textColor={colors.text}
                                icon="arrow-left-top"
                                mode="contained"
                                onPress={() => console.log('Pressed')}
                            >
                                Reply
                            </Button>
                            <IconButton
                                icon="emoticon-happy-outline"
                                iconColor={colors.text}
                                mode="contained"
                                containerColor={colors.indicator + '33'}
                                size={20}
                                onPress={() => console.log('Pressed')}
                            />
                        </ThemedView>
                    </Animated.View>
                )}
            </ThemedView>
        </GestureHandlerRootView>
    )
}

export default VideoPlayer

const styles = StyleSheet.create({
    main: { flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%' },
    header: { width: '100%', borderBottomWidth: 1, paddingRight: 12 },
    headerTitleContainer: { flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start' },
    headerTitle: { fontWeight: '600' },
    headerDescription: { fontSize: 13, fontWeight: '400' },
    video: { width: '100%', flex: 1, backgroundColor: 'black' },
    // Centered absolutely, sized to just the badge — taps outside reach GestureDetector
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
        position: 'absolute', bottom: 0, left: 0, right: 0,
        borderTopWidth: 1, zIndex: 99, elevation: 10,
        paddingVertical: 12, flexDirection: 'column',
        gap: 10, paddingHorizontal: 16,
    },
    footerTop: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
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
