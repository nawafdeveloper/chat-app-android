import { Colors } from '@/constants/theme'
import { fetchAndDecryptMessageMedia } from '@/lib/message-media'
import {
    AudioModule,
    RecordingPresets,
    setAudioModeAsync,
    useAudioRecorder,
    useAudioRecorderState,
} from 'expo-audio'
import { Image } from 'expo-image'
import React, { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, TextInput, useColorScheme, View } from 'react-native'
import { IconButton } from 'react-native-paper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AttachmentContainer from './attachment-container'
import VoiceWaveform from './audio-recorder-visualizer'
import { ThemedText } from './themed-text'
import { ThemedView } from './themed-view'

type Props = {
    isReply: boolean;
    handleClearReply: () => void;
    replyToUser: string;
    replyMessage: string;
    replyMediaUrl: string;
    replyMediaType: 'photo' | 'video' | 'voice' | 'file' | 'contact' | 'location' | null;
    inputRef: React.RefObject<TextInput | null>;
    onVoiceMessageRecorded?: (uri: string, durationMillis: number) => void;
}

const POLL_INTERVAL_MS = 80;
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

const ChatInputContainer = ({ isReply, handleClearReply, replyMessage, replyToUser, replyMediaType, replyMediaUrl, inputRef, onVoiceMessageRecorded }: Props) => {
    const insets = useSafeAreaInsets();
    const scheme = useColorScheme();
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme ?? 'light']

    const [message, setMessage] = useState('');
    const [attachmentVisible, setAttachmentVisible] = useState(false);
    const [isRecording, setIsRecording] = useState(false);

    const audioRecorder = useAudioRecorder({
        ...RecordingPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
    });

    const recorderState = useAudioRecorderState(audioRecorder, POLL_INTERVAL_MS);

    const startRecording = async () => {
        const { granted } = await AudioModule.requestRecordingPermissionsAsync();
        if (!granted) return;

        await setAudioModeAsync({
            playsInSilentMode: true,
            allowsRecording: true,
        });

        await audioRecorder.prepareToRecordAsync();
        audioRecorder.record();
        setIsRecording(true);
    };

    const stopRecording = async () => {
        if (!recorderState.isRecording) return;

        const durationMillis = recorderState.durationMillis;
        await audioRecorder.stop();

        const uri = audioRecorder.uri;
        if (uri) {
            onVoiceMessageRecorded?.(uri, durationMillis);
        }

        setIsRecording(false);
    };

    const cancelRecording = async () => {
        if (recorderState.isRecording) {
            await audioRecorder.stop();
        }
        setIsRecording(false);
    };

    const handleToggleAttachment = () => setAttachmentVisible(prev => !prev);

    return (
        <ThemedView style={styles.container}>
            <AttachmentContainer visible={attachmentVisible} />
            {isRecording ? (
                <ThemedView style={[styles.recordingContainer, { paddingBottom: insets.bottom, borderTopColor: colors.indicator + '33' }]}>
                    <VoiceWaveform metering={recorderState.metering} />

                    <ThemedView style={styles.recordingActions}>
                        <IconButton
                            icon="delete-outline"
                            iconColor="#ef4444"
                            size={26}
                            style={{ margin: 0 }}
                            onPress={cancelRecording}
                        />

                        <ThemedText style={styles.duration}>
                            {formatDuration(recorderState.durationMillis)}
                        </ThemedText>

                        <IconButton
                            icon="send"
                            mode="contained"
                            iconColor={colors.background}
                            containerColor="#25D366"
                            size={26}
                            style={{ margin: 0 }}
                            onPress={stopRecording}
                        />
                    </ThemedView>
                </ThemedView>
            ) : (
                <ThemedView style={[styles.main, { paddingBottom: insets.bottom + 10 }]}>
                    <ThemedView style={[styles.mainInputContainer, { backgroundColor: scheme === 'dark' ? colors.card : colors.background, borderRadius: isReply ? 18 : 24 }]}>
                        {isReply && (
                            <ThemedView style={[styles.replyMainContainer, { backgroundColor: colors.indicator, }]}>
                                <ThemedView style={[styles.replyContextContainer, { borderLeftColor: '#25D366' }]}>
                                    <ThemedView style={styles.topContainer}>
                                        <ThemedText style={{ fontSize: 14 }}>{replyToUser}</ThemedText>
                                        <IconButton
                                            icon="close"
                                            iconColor={colors.text}
                                            size={16}
                                            style={{ margin: 0, height: 'auto' }}
                                            onPress={handleClearReply}
                                        />
                                    </ThemedView>
                                    <ThemedText numberOfLines={2} ellipsizeMode='tail' style={{ fontSize: 12, color: colors.textSecondary, minWidth: 0, lineHeight: 16 }}>
                                        {replyMessage ? replyMessage : null}
                                        {replyMediaType === 'contact' ? '👤 Contact' : replyMediaType === 'file' ? '📂 File' : replyMediaType === 'location' ? 'Location' : replyMediaType === 'photo' ? '🖼️ Photo' : replyMediaType === 'video' ? '📽️ Video' : replyMediaType === 'voice' ? '🎤 Voice' : null}
                                    </ThemedText>
                                </ThemedView>
                                {replyMediaUrl && (
                                    <ReplyPhotoThumbnail
                                        url={replyMediaUrl}
                                        isDark={scheme === 'dark'}
                                    />
                                )}
                            </ThemedView>
                        )}
                        <ThemedView style={[styles.inputContainer, { backgroundColor: scheme === 'dark' ? colors.card : colors.background }]}>
                            <TextInput
                                ref={inputRef}
                                value={message}
                                onChangeText={(text) => setMessage(text)}
                                placeholder='Message'
                                multiline
                                style={[styles.input, { color: colors.text }]}
                                placeholderTextColor={colors.textSecondary}
                                enablesReturnKeyAutomatically={true}
                                selectionColor='#25D366'
                            />
                            <IconButton
                                icon={message.length > 0 ? "plus" : "microphone-outline"}
                                iconColor={colors.text}
                                size={28}
                                style={{ margin: 0, marginBottom: 2 }}
                                onPress={() => {
                                    if (message.length > 0) {
                                        handleToggleAttachment();
                                    } else {
                                        startRecording();
                                    }
                                }}
                            />
                        </ThemedView>
                    </ThemedView>
                    <IconButton
                        onPress={() => {
                            if (message.length === 0) {
                                handleToggleAttachment();
                            } else {
                                // send text message
                            }
                        }}
                        icon={message.length > 0 ? "send" : "plus"}
                        mode='contained'
                        iconColor={colors.background}
                        containerColor='#25D366'
                        size={28}
                        style={{ margin: 0, marginBottom: 2 }}
                    />
                </ThemedView>
            )}
        </ThemedView>
    )
}

export default ChatInputContainer

function formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
    container: {
        position: 'relative',
        backgroundColor: 'transparent',
        overflow: 'visible'
    },
    recordingContainer: {
        flexDirection: 'column',
        gap: 10,
        padding: 16,
        borderTopWidth: 1,
    },
    recordingActions: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'transparent',
    },
    duration: {
        fontSize: 16,
        fontWeight: '600',
        color: '#25D366',
        fontVariant: ['tabular-nums'],
    },
    main: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 10,
        paddingHorizontal: 16,
        paddingTop: 6,
        backgroundColor: 'transparent',
    },
    mainInputContainer: {
        flex: 1,
        flexDirection: 'column',
        overflow: 'hidden',
        paddingHorizontal: 3,
        paddingTop: 3
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 10,
        paddingLeft: 12,
        paddingRight: 8,
    },
    input: {
        flex: 1,
        maxHeight: 120,
        marginBottom: 4
    },
    replyMainContainer: {
        overflow: 'hidden',
        borderRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        margin: 2
    },
    replyContextContainer: {
        flexDirection: 'column',
        borderLeftWidth: 6,
        flex: 1,
        backgroundColor: 'transparent',
        paddingLeft: 12,
        height: '100%',
        padding: 4
    },
    topContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'transparent',
    }
})