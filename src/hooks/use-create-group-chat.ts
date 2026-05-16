import { authClient } from "@/lib/auth-client";
import {
    decryptChatPreviewBatch,
    encryptTextForRecipients,
} from "@/lib/chat-e2ee";
import { normalizeChatItem } from "@/lib/chat-utils";
import { toContactDisplayName } from "@/lib/contact-utils";
import { uploadEncryptedMessageMedia } from "@/lib/message-media-upload";
import { upsertDbChats } from "@/lib/upsert-db-chats";
import { useActiveChatStore } from "@/store/use-active-chat-store";
import { useNewGroupStore } from "@/store/use-new-group-store";
import type { ChatItemType } from "@/types/chats.type";
import { useCallback, useState } from "react";

const API_BASE_URL = "https://web.yahla.org";
const GROUP_CREATED_PREVIEW = "Group created";

type RawChatItem = Omit<ChatItemType, "created_at" | "updated_at"> & {
    created_at: string | Date;
    updated_at: string | Date;
};

type GroupRecipient = {
    userId: string;
    publicKey: string;
};

export function useCreateGroupChat() {
    const { data: session } = authClient.useSession();
    const selectedContacts = useNewGroupStore((state) => state.selectedContacts);
    const groupName = useNewGroupStore((state) => state.groupName);
    const groupAvatarFile = useNewGroupStore((state) => state.groupAvatarFile);
    const resetGroupStore = useNewGroupStore((state) => state.resetStore);
    const setStoreError = useNewGroupStore((state) => state.setError);
    const upsertChat = useActiveChatStore((state) => state.upsertChat);
    const setSelectedChatId = useActiveChatStore(
        (state) => state.setSelectedChatId
    );
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const createGroupChat = useCallback(async () => {
        const currentUserId = session?.user.id;
        const currentPublicKey = (
            session?.user as { yhlaPublicKey?: string | null } | undefined
        )?.yhlaPublicKey;
        const trimmedName = groupName.trim();

        if (isCreating) {
            return false;
        }

        setError(null);
        setStoreError(null);

        if (!currentUserId || !currentPublicKey) {
            const nextError = "Unlock your account keys before creating a group.";
            setError(nextError);
            setStoreError(nextError);
            return false;
        }

        if (!trimmedName) {
            const nextError = "Group name is required.";
            setError(nextError);
            setStoreError(nextError);
            return false;
        }

        if (selectedContacts.length === 0) {
            const nextError = "Select at least one group member.";
            setError(nextError);
            setStoreError(nextError);
            return false;
        }

        const missingEncryptionContact = selectedContacts.find(
            (contact) =>
                !contact.linked_user_id || !contact.linked_user_public_key
        );

        if (missingEncryptionContact) {
            const nextError = `${toContactDisplayName(
                missingEncryptionContact
            )} has not set up encryption yet.`;
            setError(nextError);
            setStoreError(nextError);
            return false;
        }

        const memberRecipients: GroupRecipient[] = selectedContacts.map(
            (contact) => ({
                userId: contact.linked_user_id!,
                publicKey: contact.linked_user_public_key!,
            })
        );
        const recipients: GroupRecipient[] = [
            {
                userId: currentUserId,
                publicKey: currentPublicKey,
            },
            ...memberRecipients,
        ];

        setIsCreating(true);

        try {
            const avatarUrl = groupAvatarFile
                ? (
                    await uploadEncryptedMessageMedia(
                        groupAvatarFile,
                        recipients.map((recipient) => ({
                            recipientUserId: recipient.userId,
                            publicKey: recipient.publicKey,
                        })),
                        null
                    )
                ).mediaUrl
                : "";
            const encryptedPreview = await encryptTextForRecipients(
                GROUP_CREATED_PREVIEW,
                recipients
            );
            const response = await fetch(`${API_BASE_URL}/api/chats`, {
                method: "POST",
                headers: {
                    Cookie: authClient.getCookie() ?? "",
                    "Content-Type": "application/json",
                },
                credentials: "omit",
                body: JSON.stringify({
                    name: trimmedName,
                    avatar: avatarUrl,
                    memberUserIds: memberRecipients.map(
                        (recipient) => recipient.userId
                    ),
                    encryptedChatPreview: encryptedPreview.encryptedContent,
                    chatPreviewRecipientKeys:
                        encryptedPreview.recipientEncryptionKeys,
                }),
            });

            const payload = (await response.json().catch(() => null)) as
                | { chat?: RawChatItem; error?: string }
                | null;

            if (!response.ok || !payload?.chat) {
                throw new Error(payload?.error ?? "Failed to create group.");
            }

            const normalizedChat = normalizeChatItem(payload.chat);
            const [decryptedChat] = await decryptChatPreviewBatch({
                chats: [normalizedChat],
                currentUserId,
            });
            const nextChat = {
                ...decryptedChat,
                last_message_context:
                    decryptedChat.last_message_context || GROUP_CREATED_PREVIEW,
            };

            await upsertDbChats([nextChat]);
            upsertChat(nextChat);
            setSelectedChatId(nextChat.chat_id);
            resetGroupStore();

            return true;
        } catch (nextError) {
            const nextMessage =
                nextError instanceof Error
                    ? nextError.message
                    : "Failed to create group.";

            setError(nextMessage);
            setStoreError(nextMessage);
            return false;
        } finally {
            setIsCreating(false);
        }
    }, [
        groupAvatarFile,
        groupName,
        isCreating,
        resetGroupStore,
        selectedContacts,
        session?.user,
        setSelectedChatId,
        setStoreError,
        upsertChat,
    ]);

    return {
        createGroupChat,
        isCreating,
        error,
    };
}
