import { Colors } from "@/constants/theme";
import { useSendChatMessage } from "@/hooks/use-send-chat-message";
import { createUploadFileFromLocalUri, formatFileSize } from "@/lib/local-upload-file";
import { useFilePreviewBeforeSentStore } from "@/store/file-preview-before-sent";
import React, { useState } from "react";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    StyleSheet,
    TextInput,
    useColorScheme,
    View,
} from "react-native";
import { Appbar, IconButton } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";
import { DarkFileIcon, LightFileIcon } from "./ui/file-icons";

const FilePreviewBeforeSent = () => {
    const scheme = useColorScheme();
    const insets = useSafeAreaInsets();
    const resolvedScheme = scheme === "unspecified" ? "light" : scheme ?? "light";
    const colors = Colors[resolvedScheme];
    const isDark = resolvedScheme === "dark";
    const { sendAttachment } = useSendChatMessage();
    const { file, fileMessageContext, setFileMessageContext, hide } =
        useFilePreviewBeforeSentStore();
    const [isSending, setIsSending] = useState(false);

    const handleSend = async () => {
        if (!file || isSending) {
            return;
        }

        setIsSending(true);
        try {
            const uploadFile = await createUploadFileFromLocalUri({
                uri: file.uri,
                fallbackName: file.name,
                mimeType: file.mimeType,
                size: file.size,
            });
            const sent = await sendAttachment({
                file: uploadFile,
                attachedMedia: "file",
                text: fileMessageContext,
            });

            if (sent) {
                hide();
            }
        } finally {
            setIsSending(false);
        }
    };

    return (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
            <ThemedView style={styles.main}>
                <Appbar.Header style={{ backgroundColor: colors.background }}>
                    <Appbar.BackAction
                        iconColor={colors.text}
                        mode="contained"
                        containerColor={colors.indicator}
                        disabled={isSending}
                        onPress={hide}
                    />
                    <Appbar.Content title="" />
                </Appbar.Header>

                <ThemedView style={styles.previewBody}>
                    <ThemedView
                        style={[
                            styles.fileCard,
                            {
                                backgroundColor: colors.card,
                                borderColor: colors.indicator + "55",
                            },
                        ]}
                    >
                        {isDark ? <DarkFileIcon width={52} height={65} /> : <LightFileIcon width={52} height={65} />}
                        <ThemedView style={styles.fileInfo}>
                            <ThemedText numberOfLines={2} style={styles.fileName}>
                                {file?.name ?? "File"}
                            </ThemedText>
                            <ThemedText style={[styles.fileDetails, { color: colors.textSecondary }]}>
                                {formatFileSize(file?.size) || file?.mimeType || "Document"}
                            </ThemedText>
                        </ThemedView>
                    </ThemedView>
                </ThemedView>

                <View
                    style={[
                        styles.bottomInputContainer,
                        { paddingBottom: insets.bottom + 20, backgroundColor: colors.background },
                    ]}
                >
                    <TextInput
                        value={fileMessageContext}
                        onChangeText={setFileMessageContext}
                        placeholder="Message"
                        style={[styles.input, { color: colors.text, backgroundColor: colors.card }]}
                        placeholderTextColor={colors.textSecondary}
                        selectionColor="#25D366"
                    />
                    {isSending ? (
                        <View style={styles.sendButton}>
                            <ActivityIndicator size="small" color={colors.background} />
                        </View>
                    ) : (
                        <IconButton
                            icon="send"
                            iconColor={colors.background}
                            containerColor="#25D366"
                            size={24}
                            onPress={handleSend}
                        />
                    )}
                </View>
            </ThemedView>
        </KeyboardAvoidingView>
    );
};

export default FilePreviewBeforeSent;

const styles = StyleSheet.create({
    main: {
        flex: 1,
    },
    previewBody: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
    },
    fileCard: {
        width: "100%",
        maxWidth: 420,
        borderRadius: 8,
        borderWidth: 1,
        paddingHorizontal: 18,
        paddingVertical: 18,
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
    },
    fileInfo: {
        flex: 1,
        minWidth: 0,
        backgroundColor: "transparent",
        gap: 8,
    },
    fileName: {
        fontSize: 17,
        fontWeight: "600",
        lineHeight: 21,
    },
    fileDetails: {
        fontSize: 13,
        lineHeight: 16,
    },
    bottomInputContainer: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingTop: 8,
        gap: 8,
    },
    input: {
        flex: 1,
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginBottom: 4,
        borderRadius: 99,
    },
    sendButton: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: "#25D366",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 4,
    },
});
