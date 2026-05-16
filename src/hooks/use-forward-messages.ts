import { authClient } from "@/lib/auth-client";
import { decryptMessageBatch } from "@/lib/chat-e2ee";
import { createUploadFileFromLocalUri } from "@/lib/local-upload-file";
import { fetchAndDecryptMessageMedia } from "@/lib/message-media";
import type { MessageMediaUploadFile } from "@/lib/message-media-upload";
import { useSendChatMessage } from "@/hooks/use-send-chat-message";
import type { Contact as DirectoryContact } from "@/types/contacts.type";
import type { Message } from "@/types/messages";
import { useCallback, useState } from "react";

type ForwardableMediaType = Extract<
    Message["attached_media"],
    "photo" | "video" | "voice" | "file"
>;

const FORWARDABLE_MEDIA_TYPES = new Set<ForwardableMediaType>([
    "photo",
    "video",
    "voice",
    "file",
]);

function isForwardableMediaType(
    attachedMedia: Message["attached_media"]
): attachedMedia is ForwardableMediaType {
    return Boolean(
        attachedMedia &&
            FORWARDABLE_MEDIA_TYPES.has(attachedMedia as ForwardableMediaType)
    );
}

function getForwardFallbackName(message: Message) {
    switch (message.attached_media) {
        case "photo":
            return "forwarded-image.jpg";
        case "video":
            return "forwarded-video.mp4";
        case "voice":
            return "forwarded-voice.m4a";
        default:
            return "forwarded-file";
    }
}

function getForwardMimeType(message: Message): string {
    if (message.media_mime_type || message.client_local_media_mime_type) {
        return (
            message.media_mime_type ??
            message.client_local_media_mime_type ??
            "application/octet-stream"
        );
    }

    switch (message.attached_media) {
        case "photo":
            return "image/jpeg";
        case "video":
            return "video/mp4";
        case "voice":
            return "audio/mp4";
        default:
            return "application/octet-stream";
    }
}

function buildForwardContact(
    contact: NonNullable<Message["contact"]>
): DirectoryContact {
    return {
        contact_id: contact.contact_id,
        contact_first_name: contact.contact_name,
        contact_second_name: "",
        contact_number: contact.contact_phone ?? "",
        contact_avatar: contact.contact_image,
        linked_user_id: contact.linked_user_id ?? undefined,
        contact_letter_group: "",
    };
}

async function createForwardUploadFile(
    message: Message,
    uri: string
): Promise<MessageMediaUploadFile | null> {
    const fallbackName =
        message.media_file_name ??
        message.client_local_media_name ??
        getForwardFallbackName(message);
    const fallbackMimeType = getForwardMimeType(message);

    if (/^https?:\/\//i.test(uri)) {
        const response = await fetch(uri, {
            headers: { Cookie: authClient.getCookie() ?? "" },
            credentials: "omit",
        });

        if (!response.ok) {
            return null;
        }

        const bytes = await response.arrayBuffer();

        return {
            name: fallbackName,
            type: response.headers.get("content-type") ?? fallbackMimeType,
            size: bytes.byteLength,
            arrayBuffer: async () => bytes,
        };
    }

    return createUploadFileFromLocalUri({
        uri,
        fallbackName,
        mimeType: fallbackMimeType,
        size:
            message.media_size_bytes ??
            message.client_local_media_size ??
            null,
    });
}

export function useForwardMessages() {
    const { data: session } = authClient.useSession();
    const { sendMessage, sendAttachment, sendContact } = useSendChatMessage();
    const [isForwarding, setIsForwarding] = useState(false);

    const forwardMessages = useCallback(
        async ({
            messages,
            targetChatIds,
        }: {
            messages: Message[];
            targetChatIds: string[];
        }) => {
            const currentUserId = session?.user.id;
            const uniqueMessages = [
                ...new Map(
                    messages.map((message) => [message.message_id, message])
                ).values(),
            ];
            const uniqueTargetChatIds = [...new Set(targetChatIds)].filter(Boolean);

            if (
                !currentUserId ||
                uniqueMessages.length === 0 ||
                uniqueTargetChatIds.length === 0
            ) {
                return false;
            }

            setIsForwarding(true);

            try {
                const decryptedMessages = await decryptMessageBatch({
                    currentUserId,
                    messages: uniqueMessages,
                });

                for (const targetChatId of uniqueTargetChatIds) {
                    for (const message of decryptedMessages) {
                        const text = message.message_text_content?.trim() ?? "";

                        if (message.attached_media === "contact" && message.contact) {
                            const didSend = await sendContact({
                                contact: buildForwardContact(message.contact),
                                chatId: targetChatId,
                                isForwardMessage: true,
                            });

                            if (!didSend) {
                                return false;
                            }

                            continue;
                        }

                        if (isForwardableMediaType(message.attached_media)) {
                            if (!message.media_url) {
                                return false;
                            }

                            const localMediaUri = await fetchAndDecryptMessageMedia({
                                source: message.media_url,
                                fallbackExtension:
                                    message.attached_media === "photo"
                                        ? "jpg"
                                        : message.attached_media === "video"
                                          ? "mp4"
                                          : message.attached_media === "voice"
                                            ? "m4a"
                                            : "bin",
                            });

                            if (!localMediaUri) {
                                return false;
                            }

                            const uploadFile = await createForwardUploadFile(
                                message,
                                localMediaUri
                            );

                            if (!uploadFile) {
                                return false;
                            }

                            const didSend = await sendAttachment({
                                file: uploadFile,
                                attachedMedia: message.attached_media,
                                chatId: targetChatId,
                                text: text || null,
                                mediaWidth: message.media_width ?? null,
                                mediaHeight: message.media_height ?? null,
                                isForwardMessage: true,
                            });

                            if (!didSend) {
                                return false;
                            }

                            continue;
                        }

                        if (!text) {
                            return false;
                        }

                        const didSend = await sendMessage({
                            text,
                            chatId: targetChatId,
                            clearDraft: false,
                            openGraphData: message.open_graph_data,
                            isForwardMessage: true,
                        });

                        if (!didSend) {
                            return false;
                        }
                    }
                }

                return true;
            } finally {
                setIsForwarding(false);
            }
        },
        [sendAttachment, sendContact, sendMessage, session?.user.id]
    );

    return {
        forwardMessages,
        isForwarding,
    };
}
