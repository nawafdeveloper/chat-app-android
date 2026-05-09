import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { Colors } from '@/constants/theme'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useState } from 'react'
import { StyleSheet, useColorScheme, useWindowDimensions } from 'react-native'
import {
    Gesture,
    GestureDetector,
    GestureHandlerRootView,
} from 'react-native-gesture-handler'
import { Appbar, Button, IconButton } from 'react-native-paper'
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

const ImagePreview = () => {
    const { imageUrl, messageId, senderName, timeStamp } = useLocalSearchParams<{
        imageUrl?: string | string[]
        messageId?: string | string[]
        senderName?: string | string[]
        timeStamp?: string | string[]
    }>()
    const previewImageUrl = getParamValue(imageUrl)
    const previewMessageId = getParamValue(messageId)
    const previewSenderName = getParamValue(senderName)
    const previewTimeStamp = getParamValue(timeStamp)
    const scheme = useColorScheme()
    const insets = useSafeAreaInsets()
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme ?? 'light']
    const { width: screenWidth, height: screenHeight } = useWindowDimensions()

    const [isHeaderAndFooterVisible, setIsHeaderAndFooterVisible] = useState(true)

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
        .onBegin(() => {
            'worklet'
        })
        .onUpdate((e) => {
            'worklet'
            scale.value = clampValue(savedScale.value * e.scale, MIN_SCALE, MAX_SCALE)
        })
        .onStart(() => {
            isPinching.value = true
        })
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
                (finished) => {
                    'worklet'
                    if (finished) savedTranslateX.value = translateX.value
                }
            )
            translateY.value = withDecay(
                { velocity: e.velocityY, clamp: [-maxY, maxY], deceleration: 0.993 },
                (finished) => {
                    'worklet'
                    if (finished) savedTranslateY.value = translateY.value
                }
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
        .onStart(() => {
            isPinching.value = false
        })
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

                <GestureDetector gesture={composed}>
                    <Animated.View
                        sharedTransitionTag={previewMessageId ? getMediaSharedTransitionTag('image', previewMessageId) : undefined}
                        style={[styles.previewFrame, animatedImageStyle]}
                    >
                        <Animated.Image
                            source={{ uri: previewImageUrl }}
                            resizeMode="contain"
                            style={styles.image}
                        />
                    </Animated.View>
                </GestureDetector>

                {isHeaderAndFooterVisible && (
                    <Animated.View
                        key="footer"
                        entering={SlideInDown.duration(150)}
                        exiting={SlideOutDown.duration(150)}
                        style={[styles.footer, { backgroundColor: colors.background, paddingBottom: insets.bottom * 2, borderTopColor: colors.indicator + '33' }]}
                    >
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
                    </Animated.View>
                )}
            </ThemedView>
        </GestureHandlerRootView>
    )
}

export default ImagePreview

const styles = StyleSheet.create({
    main: { flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%' },
    header: { width: '100%', borderBottomWidth: 1, paddingRight: 12 },
    headerTitleContainer: { flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start' },
    headerTitle: { fontWeight: '600' },
    headerDescription: { fontSize: 13, fontWeight: '400' },
    previewFrame: { width: '100%', flex: 1, backgroundColor: 'black' },
    image: { width: '100%', flex: 1 },
    footer: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        borderTopWidth: 1, zIndex: 99, elevation: 10,
        paddingVertical: 12, flexDirection: 'row',
        alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16,
    },
})
