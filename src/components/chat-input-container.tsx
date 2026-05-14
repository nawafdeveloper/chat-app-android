import { Colors, Fonts } from '@/constants/theme'
import { useChatTyping } from '@/hooks/use-chat-typing'
import { useSendChatMessage } from '@/hooks/use-send-chat-message'
import { authClient } from '@/lib/auth-client'
import { fetchAndDecryptMessageMedia } from '@/lib/message-media'
import { findFirstUrl } from '@/lib/url-links'
import { useActiveChatStore } from '@/store/use-active-chat-store'
import { OpenGraphData } from '@/types/messages'
import {
    AudioModule,
    RecordingPresets,
    setAudioModeAsync,
    useAudioRecorder,
    useAudioRecorderState,
} from 'expo-audio'
import { Image } from 'expo-image'
import React, { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, StyleSheet, TextInput, useColorScheme, View } from 'react-native'
import { IconButton } from 'react-native-paper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AttachmentContainer from './attachment-container'
import VoiceWaveform from './audio-recorder-visualizer'
import { ThemedText } from './themed-text'
import { ThemedView } from './themed-view'

type Props = {
    chatId?: string | null;
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
const CHAT_DEBUG = true;

function debugChatInput(stage: string, payload: Record<string, unknown> = {}) {
    if (!CHAT_DEBUG) {
        return;
    }

    console.log(`[chat-debug][chat-input][${stage}]`, {
        at: new Date().toISOString(),
        ...payload,
    });
}

async function fetchOpenGraphPreview(
    url: string,
    signal?: AbortSignal
): Promise<OpenGraphData | null> {
    const response = await fetch(
        `${API_BASE}/api/open-graph?url=${encodeURIComponent(url)}`,
        {
            cache: "no-store",
            signal,
            credentials: "omit",
        }
    );

    if (!response.ok) {
        return null;
    }

    const payload = (await response.json()) as {
        openGraphData?: OpenGraphData | null;
    };

    return payload.openGraphData ?? null;
}

function ReplyPhotoThumbnail({ url, isDark }: { url?: string | null; isDark: boolean }) {
    const [resolvedUri, setResolvedUri] = useState<string | null>(null);

    useEffect(() => {
        if (!url) {
            debugChatInput('reply-thumbnail-skip-no-url');
            return;
        }
        const absoluteUrl = url.startsWith('/') ? `${API_BASE}${url}` : url;
        debugChatInput('reply-thumbnail-load-start', { url: absoluteUrl });
        fetchAndDecryptMessageMedia({
            source: absoluteUrl,
            isPreview: true,
            fallbackExtension: 'jpg',
        }).then(uri => {
            debugChatInput('reply-thumbnail-load-finish', { url: absoluteUrl, resolved: Boolean(uri) });
            if (uri) setResolvedUri(uri);
        }).catch((error) => {
            debugChatInput('reply-thumbnail-load-error', { url: absoluteUrl, error });
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

const ChatInputContainer = ({ chatId, isReply, handleClearReply, replyMessage, replyToUser, replyMediaType, replyMediaUrl, inputRef, onVoiceMessageRecorded }: Props) => {
    const { data: session } = authClient.useSession();
    const insets = useSafeAreaInsets();
    const scheme = useColorScheme();
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme ?? 'light']

    const { sendMessage, sendVoiceMessage } = useSendChatMessage();
    const selectedChatId = useActiveChatStore((state) => state.selectedChatId);
    const activeChatId = chatId ?? selectedChatId;
    const setDraft = useActiveChatStore((state) => state.setDraft);
    const { handleDraftChange, stopTyping } = useChatTyping(activeChatId);
    const draftValue = useActiveChatStore((state) =>
        activeChatId ? state.draftsByChatId[activeChatId] ?? "" : ""
    );
    const linkPreviewDisabled = Boolean(
        (
            session?.user as
            | {
                disableLinkPreview?: boolean | null;
            }
            | undefined
        )?.disableLinkPreview
    );
    const draftFirstUrl = useMemo(() => findFirstUrl(draftValue), [draftValue]);

    const [attachmentVisible, setAttachmentVisible] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isSendingText, setIsSendingText] = useState(false);
    const [isSendingVoice, setIsSendingVoice] = useState(false);
    const [openGraphPreview, setOpenGraphPreview] =
        useState<OpenGraphData | null>(null);
    const [openGraphPreviewUrl, setOpenGraphPreviewUrl] = useState<string | null>(
        null
    );

    const audioRecorder = useAudioRecorder({
        ...RecordingPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
    });
    const canSendText = draftValue.trim().length > 0;

    const recorderState = useAudioRecorderState(audioRecorder, POLL_INTERVAL_MS);

    debugChatInput('render', {
        propChatId: chatId,
        selectedChatId,
        activeChatId,
        draftLength: draftValue.length,
        canSendText,
        isReply,
        replyMediaType,
        isRecording,
        isSendingText,
        isSendingVoice,
        attachmentVisible,
        openGraphPreviewUrl,
        hasOpenGraphPreview: Boolean(openGraphPreview),
        linkPreviewDisabled,
        draftFirstUrl,
    });

    useEffect(() => {
        debugChatInput('state-updated', {
            propChatId: chatId,
            selectedChatId,
            activeChatId,
            draftLength: draftValue.length,
            canSendText,
            isReply,
            replyMediaType,
            isRecording,
            isSendingText,
            isSendingVoice,
            attachmentVisible,
            draftFirstUrl,
        });
    }, [
        activeChatId,
        attachmentVisible,
        canSendText,
        chatId,
        draftFirstUrl,
        draftValue.length,
        isRecording,
        isReply,
        isSendingText,
        isSendingVoice,
        replyMediaType,
        selectedChatId,
    ]);

    const startRecording = async () => {
        debugChatInput('record-start-request', { activeChatId });
        const { granted } = await AudioModule.requestRecordingPermissionsAsync();
        debugChatInput('record-permission-result', { activeChatId, granted });
        if (!granted) return;

        await setAudioModeAsync({
            playsInSilentMode: true,
            allowsRecording: true,
        });

        await audioRecorder.prepareToRecordAsync();
        audioRecorder.record();
        setIsRecording(true);
        debugChatInput('record-started', { activeChatId });
    };

    const stopRecording = async () => {
        debugChatInput('record-stop-request', {
            activeChatId,
            isRecording: recorderState.isRecording,
            isSendingVoice,
            durationMillis: recorderState.durationMillis,
        });
        if (!recorderState.isRecording || isSendingVoice) return;

        const durationMillis = recorderState.durationMillis;
        await audioRecorder.stop();

        const uri = audioRecorder.uri;
        setIsRecording(false);
        if (uri) {
            setIsSendingVoice(true);
            try {
                debugChatInput('voice-send-start', { activeChatId, uri, durationMillis });
                await sendVoiceMessage({
                    uri,
                    durationMillis,
                    chatId: activeChatId,
                });
                debugChatInput('voice-send-success', { activeChatId, uri, durationMillis });
            } catch (error) {
                debugChatInput('voice-send-error', { activeChatId, uri, durationMillis, error });
                throw error;
            } finally {
                setIsSendingVoice(false);
                debugChatInput('voice-send-finish', { activeChatId });
            }
            onVoiceMessageRecorded?.(uri, durationMillis);
        } else {
            debugChatInput('record-stop-no-uri', { activeChatId, durationMillis });
        }
    };

    const cancelRecording = async () => {
        debugChatInput('record-cancel-request', {
            activeChatId,
            isRecording: recorderState.isRecording,
        });
        if (recorderState.isRecording) {
            await audioRecorder.stop();
        }
        setIsRecording(false);
        debugChatInput('record-cancelled', { activeChatId });
    };

    const resolveOpenGraphPreviewForSend = async () => {
        if (linkPreviewDisabled || !draftFirstUrl) {
            debugChatInput('open-graph-send-skip', {
                activeChatId,
                linkPreviewDisabled,
                draftFirstUrl,
            });
            return null;
        }

        if (openGraphPreviewUrl === draftFirstUrl && openGraphPreview) {
            debugChatInput('open-graph-send-use-cached', {
                activeChatId,
                draftFirstUrl,
            });
            return openGraphPreview;
        }

        try {
            debugChatInput('open-graph-send-fetch-start', {
                activeChatId,
                draftFirstUrl,
            });
            const preview = await fetchOpenGraphPreview(draftFirstUrl);
            debugChatInput('open-graph-send-fetch-finish', {
                activeChatId,
                draftFirstUrl,
                hasPreview: Boolean(preview),
            });
            return preview;
        } catch (error) {
            debugChatInput('open-graph-send-fetch-error', {
                activeChatId,
                draftFirstUrl,
                error,
            });
            return null;
        }
    };

    useEffect(() => {
        if (linkPreviewDisabled || !draftFirstUrl) {
            debugChatInput('open-graph-preview-reset', {
                activeChatId,
                linkPreviewDisabled,
                draftFirstUrl,
            });
            setOpenGraphPreview(null);
            setOpenGraphPreviewUrl(null);
            return;
        }

        let isActive = true;
        const controller = new AbortController();
        setOpenGraphPreview(null);
        setOpenGraphPreviewUrl(draftFirstUrl);
        debugChatInput('open-graph-preview-schedule', {
            activeChatId,
            draftFirstUrl,
        });

        const timer = window.setTimeout(() => {
            debugChatInput('open-graph-preview-fetch-start', {
                activeChatId,
                draftFirstUrl,
            });
            void fetchOpenGraphPreview(draftFirstUrl, controller.signal)
                .then((preview) => {
                    if (isActive) {
                        debugChatInput('open-graph-preview-fetch-finish', {
                            activeChatId,
                            draftFirstUrl,
                            hasPreview: Boolean(preview),
                        });
                        setOpenGraphPreview(preview);
                    }
                })
                .catch((error) => {
                    if (isActive) {
                        debugChatInput('open-graph-preview-fetch-error', {
                            activeChatId,
                            draftFirstUrl,
                            error,
                        });
                        setOpenGraphPreview(null);
                    }
                })
        }, 300);

        return () => {
            isActive = false;
            window.clearTimeout(timer);
            controller.abort();
            debugChatInput('open-graph-preview-cleanup', {
                activeChatId,
                draftFirstUrl,
            });
        };
    }, [activeChatId, draftFirstUrl, linkPreviewDisabled]);

    const handleToggleAttachment = () => {
        debugChatInput('attachment-toggle', {
            activeChatId,
            nextVisible: !attachmentVisible,
        });
        setAttachmentVisible(prev => !prev);
    };

    const handleSend = async () => {
        debugChatInput('send-press', {
            activeChatId,
            canSendText,
            isSendingText,
            draftLength: draftValue.length,
            draftPreview: draftValue.slice(0, 80),
        });
        if (!activeChatId || !canSendText || isSendingText) {
            debugChatInput('send-abort', {
                activeChatId,
                canSendText,
                isSendingText,
                draftLength: draftValue.length,
            });
            return;
        }

        setIsSendingText(true);
        try {
            const openGraphData = await resolveOpenGraphPreviewForSend();
            debugChatInput('send-stop-typing', { activeChatId });
            stopTyping(activeChatId);
            debugChatInput('send-message-start', {
                activeChatId,
                draftLength: draftValue.length,
                hasOpenGraphData: Boolean(openGraphData),
            });
            const sent = await sendMessage({
                text: draftValue,
                chatId: activeChatId,
                openGraphData,
            });
            debugChatInput('send-message-result', {
                activeChatId,
                sent,
                isReply,
            });
            if (sent && isReply) {
                handleClearReply();
            }
        } catch (error) {
            debugChatInput('send-message-error', {
                activeChatId,
                error,
            });
            throw error;
        } finally {
            setIsSendingText(false);
            debugChatInput('send-finish', { activeChatId });
        }
    };

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
                            disabled={isSendingVoice}
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
                                value={draftValue}
                                onChangeText={(text) => {
                                    if (!activeChatId) {
                                        debugChatInput('draft-change-skip-no-active-chat', {
                                            selectedChatId,
                                            propChatId: chatId,
                                            textLength: text.length,
                                        });
                                        return;
                                    }
                                    debugChatInput('draft-change', {
                                        activeChatId,
                                        previousLength: draftValue.length,
                                        nextLength: text.length,
                                        hasUrl: Boolean(findFirstUrl(text)),
                                    });
                                    setDraft(activeChatId, text);
                                    handleDraftChange(text);
                                }}
                                placeholder='Message'
                                multiline
                                style={[styles.input, { color: colors.text }]}
                                placeholderTextColor={colors.textSecondary}
                                enablesReturnKeyAutomatically={true}
                                selectionColor='#25D366'
                            />
                            <IconButton
                                icon={canSendText ? "plus" : "microphone-outline"}
                                iconColor={colors.text}
                                size={28}
                                style={{ margin: 0, marginBottom: 2 }}
                                onPress={() => {
                                    debugChatInput('left-action-press', {
                                        activeChatId,
                                        canSendText,
                                        action: canSendText ? 'attachment' : 'record',
                                    });
                                    if (canSendText) {
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
                            debugChatInput('right-action-press', {
                                activeChatId,
                                canSendText,
                                isSendingText,
                                action: canSendText ? 'send' : 'attachment',
                            });
                            if (!canSendText) {
                                handleToggleAttachment();
                            } else {
                                handleSend();
                            }
                        }}
                        icon={canSendText ? "send" : "plus"}
                        mode='contained'
                        disabled={isSendingText}
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
        fontFamily: Fonts.regular,
        marginBottom: -4,
        marginTop: -4
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
