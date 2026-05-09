
import { StoredContactRecord } from "./contacts.type";
import { RecipientEncryptedAesKey, TextEncryptionAlgorithm } from "./crypto.type";

export type ChatGroupMember = {
    user_id: string;
    phone_number?: string | null;
    public_key?: string | null;
    name?: string | null;
    avatar?: string | null;
    is_admin?: boolean;
};

export type ChatItemType = {
    chat_id: string;
    chat_type: 'single' | 'group';
    avatar: string;
    display_name?: string | null;
    group_members?: ChatGroupMember[] | null;
    recipient_user_id?: string | null;
    recipient_public_key?: string | null;
    contact_phone?: string | null;
    recipient_last_seen?: Date | null;
    recipient_who_can_see_last_seen?: "all" | "contacts" | "nobody" | null;
    recipient_last_seen_visible?: boolean | null;
    recipient_who_can_see_status?: "all" | "contacts" | "nobody" | null;
    recipient_who_can_see_profile_picture?: "all" | "contacts" | "nobody" | null;
    recipient_profile_picture_visible?: boolean | null;
    recipient_about_ciphertext?: string | null;
    recipient_about_encrypted_aes_key?: string | null;
    recipient_about_iv?: string | null;
    recipient_who_can_see_about?: "all" | "contacts" | "nobody" | null;
    recipient_about_visible?: boolean | null;
    stored_contact?: StoredContactRecord | null;
    is_provisional?: boolean;
    last_message_id?: string | null;
    encrypted_preview_ciphertext?: string | null;
    encrypted_preview_iv?: string | null;
    encrypted_preview_algorithm?: TextEncryptionAlgorithm | null;
    chat_recipient_keys?: RecipientEncryptedAesKey[] | null;
    last_message_context: string;
    last_message_media: string | null;
    last_message_sender_is_me: boolean;
    last_message_sender_nickname: string;
    last_message_is_read_by_recipient?: boolean | null;
    last_message_read_by_user_ids?: string[] | null;
    last_message_recipient_user_ids?: string[] | null;
    is_unreaded_chat: boolean;
    unreaded_messages_length: number;
    is_archived_chat: boolean;
    is_muted_chat_notifications: boolean;
    is_pinned_chat: boolean;
    is_favourite_chat: boolean;
    is_blocked_chat: boolean;
    created_at: Date;
    updated_at: Date;
};
