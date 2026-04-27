import { Colors } from "@/constants/theme";
import { Message } from "@/types/messages";
import * as Haptics from 'expo-haptics';
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, TouchableWithoutFeedback, useColorScheme, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Icon, IconButton, TouchableRipple } from "react-native-paper";
import Animated, { Extrapolation, interpolate, SlideInLeft, SlideInRight, SlideOutLeft, SlideOutRight, useAnimatedStyle, useSharedValue, withSpring, ZoomIn, ZoomOut } from "react-native-reanimated";
import { Path, Svg } from 'react-native-svg';
import { runOnJS } from "react-native-worklets";
import PollComponent from "./poll-item";
import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";
import { DarkFileIcon, LightFileIcon } from "./ui/file-icons";

type BubbleProps = {
    message: Message;
    isDark: boolean;
    showTail?: boolean;
    isSelected: boolean;
    onLongPress: () => void;
    onPress: () => void;
    handleReply: (replyTo: string, replyMsg: string) => void;
    selectedMessageIds: Set<string>;
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

function Tail({ color, sent }: { color: string; sent: boolean }) {
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
}

function Bubble({ message, isDark, showTail = true, isSelected, onLongPress, onPress, handleReply, selectedMessageIds }: BubbleProps) {
    const {
        message_id,
        sender_user_id,
        message_text_content,
        created_at,
        attached_media,
        is_forward_message,
        media_url,
        media_aspect_ratio,
        video_thumbnail,
        poll,
        open_graph_data,
        reply_message,
        message_raction
    } = message;
    const scheme = useColorScheme();

    const theme = isDark ? DARK : LIGHT;
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme ?? 'light']
    const sent = sender_user_id === 'user_123';
    const bubbleColor = sent ? theme.sentBubble : theme.receivedBubble;
    const swipeX = useSharedValue(0);

    const reactionEmojis = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

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

    const panGesture = Gesture.Pan()
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
                runOnJS(handleReply)(sender_user_id, message_text_content || '');
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
        });

    return (
        <TouchableWithoutFeedback
            onLongPress={onLongPress}
            onPress={onPress}
        >
            <View
                key={message_id}
                style={[
                    styles.row,
                    sent ? styles.rowSent : styles.rowReceived,
                ]}
            >
                {isSelected && selectedMessageIds.size < 2 && (
                    <Animated.View
                        key={'animated-emojis-container'}
                        entering={sent ? SlideInRight.duration(100) : SlideInLeft.duration(100)}
                        exiting={sent ? SlideOutRight.duration(100) : SlideOutLeft.duration(100)}
                        style={[styles.reactionContainer, { backgroundColor: theme.cardReceived, left: sent ? undefined : 30, right: sent ? 30 : undefined }]}>
                        {reactionEmojis.map((item, index) => (
                            <Animated.View key={`animated-emoji-${index}`} entering={ZoomIn.delay(index * 20).duration(100)} exiting={ZoomOut.delay(index * 20).duration(100)}>
                                <TouchableRipple>
                                    <ThemedText style={styles.emojis}>{item}</ThemedText>
                                </TouchableRipple>
                            </Animated.View>
                        ))}
                    </Animated.View>
                )}
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
                <View style={styles.messageContentRow}>
                    <GestureDetector gesture={panGesture}>
                        <Animated.View style={[styles.bubbleAndTailWrapper, bubbleAndTailAnimatedStyle]}>
                            {!sent && (showTail
                                ? <Tail color={bubbleColor} sent={false} />
                                : <View style={styles.tailSpacer} />
                            )}
                            <View style={[
                                styles.bubble,
                                { backgroundColor: bubbleColor, paddingHorizontal: attached_media ? 4 : 10 },
                                !sent && showTail && styles.receivedBubbleWithTail,
                                sent && showTail && styles.sentBubbleWithTail,
                            ]}>
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
                                    <ThemedView style={[styles.replyContainer, { backgroundColor: sent ? theme.cardSent : theme.cardReceived, borderLeftColor: '#25D366', marginHorizontal: attached_media ? 0 : -4 }]}>
                                        <ThemedText style={{ fontSize: 14 }}>{reply_message.original_sender_user_id}</ThemedText>
                                        <ThemedText numberOfLines={2} ellipsizeMode='tail' style={{ fontSize: 12, color: colors.textSecondary, minWidth: 0, lineHeight: 16 }}>
                                            {reply_message.original_message_text}
                                        </ThemedText>
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
                                {poll && (
                                    <ThemedView style={styles.pollContentContainer}>
                                        <ThemedView style={styles.pollHeader}>
                                            <Icon
                                                source={poll.poll_multiple_answers ? "checkbox-multiple-marked-circle" : "checkbox-marked-circle"}
                                                color={colors.textSecondary}
                                                size={13}
                                            />
                                            <ThemedText style={[styles.pollHeaderText, { color: colors.textSecondary }]}>{poll.poll_multiple_answers ? 'Select one or more' : 'Select one only'}</ThemedText>
                                        </ThemedView>
                                        <PollComponent
                                            poll={{
                                                poll_id: poll.poll_id,
                                                poll_question: poll.poll_question,
                                                poll_options: poll.poll_options.map(opt =>
                                                    typeof opt === 'string'
                                                        ? { text: opt, votes: 0, user_voted: false }
                                                        : opt
                                                ),
                                                poll_multiple_answers: poll.poll_multiple_answers,
                                                total_votes: poll.total_votes || 0,
                                                user_has_voted: poll.user_has_voted || false
                                            }}
                                            onVote={(selectedOptions) => {
                                                console.log('User voted for options:', selectedOptions);
                                            }}
                                            isDark={isDark}
                                            isSent={sent}
                                        />
                                    </ThemedView>
                                )}
                                {attached_media === 'contact' && (
                                    <ThemedView style={[styles.contactCard, { backgroundColor: sent ? theme.cardSent : theme.cardReceived }]}>
                                        <ThemedView style={styles.contactContentContainer}>
                                            <View style={[styles.avatar, { backgroundColor: scheme === 'dark' ? '#052e16' : '#dcfce7' }]}>
                                                <Text style={[styles.avatarText, { color: scheme === 'dark' ? '#4ade80' : '#15803d' }]}>M</Text>
                                            </View>
                                            <ThemedText>Mohammed</ThemedText>
                                        </ThemedView>
                                    </ThemedView>
                                )}
                                {attached_media === 'file' && (
                                    <ThemedView style={[styles.fileCard, { backgroundColor: sent ? theme.cardSent : theme.cardReceived }]}>
                                        {isDark ? <DarkFileIcon /> : <LightFileIcon />}
                                        <ThemedView style={styles.innerFileCardContent}>
                                            <ThemedText style={styles.fileName}>app-release.apk</ThemedText>
                                            <ThemedText style={[styles.fileDetails, { color: isDark ? '#6C757C' : 'gray' }]}>104MB - BIN</ThemedText>
                                        </ThemedView>
                                    </ThemedView>
                                )}
                                {attached_media === 'photo' && (
                                    <Image
                                        source={{ uri: media_url || '' }}
                                        contentFit="cover"
                                        style={[styles.mediaPhoto, { aspectRatio: media_aspect_ratio }]}
                                    />
                                )}
                                {attached_media === 'video' && (
                                    <Image
                                        source={{ uri: video_thumbnail || '' }}
                                        contentFit="cover"
                                        style={[styles.mediaPhoto, { aspectRatio: media_aspect_ratio }]}
                                    />
                                )}
                                {message_text_content && (
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
                                        {created_at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
                                            <ThemedText style={{ color: scheme === 'dark' ? '#4ade80' : '#15803d' }}>Add contact</ThemedText>
                                        </TouchableRipple>
                                        <TouchableRipple style={styles.contactActionButton}>
                                            <ThemedText style={{ color: scheme === 'dark' ? '#4ade80' : '#15803d' }}>Message</ThemedText>
                                        </TouchableRipple>
                                    </ThemedView>
                                )}
                                {poll && (
                                    <TouchableRipple style={[styles.pollActionContainer, { borderTopColor: sent ? theme.borderSent : theme.borderReceive }]}>
                                        <ThemedText style={{ color: scheme === 'dark' ? '#4ade80' : '#15803d' }}>View votes</ThemedText>
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
                        </Animated.View>
                    </GestureDetector>
                </View>
            </View>
        </TouchableWithoutFeedback>
    );
}

export default Bubble;

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
        maxWidth: 280
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
        paddingVertical: 4,
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
        borderRadius: 7,
        borderLeftWidth: 3,
        overflow: 'hidden',
        paddingHorizontal: 8,
        paddingVertical: 4,
        marginBottom: 8,
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
        paddingTop: 12,
        gap: 10,
        minWidth: '100%',
        backgroundColor: 'transparent',
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
    mediaPhoto: {
        width: '100%',
        aspectRatio: 3 / 4,
        borderRadius: 6,
        marginBottom: 4
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
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 25,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    avatarText: {
        fontSize: 18,
        fontWeight: '500'
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