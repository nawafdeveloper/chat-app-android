import { RecipientEncryptedAesKey, RecipientEncryptedAesKeyInput, TextEncryptionAlgorithm } from "./crypto.type";


export type EncryptedMessageMedia = {
    id?: string | null;
    message_id?: string | null;
    object_key: string;
    preview_object_key?: string | null;
    encrypted_aes_key: string;
    iv: string;
    mime_type: string;
    preview_mime_type?: string | null;
    original_size_bytes?: number | null;
    local_path?: string | null;
    preview_local_path?: string | null;
};

export type MessageMediaRecipientPublicKeyInput = {
    recipientUserId: string;
    publicKey: string | CryptoKey;
};

export interface MessageMediaUploadResult {
    mediaUrl: string;
    previewUrl: string | null;
    sizeBytes: number;
    objectKey: string;
    recipientEncryptionKeys: RecipientEncryptedAesKeyInput[];
}

export type MessageReaction = {
    id: string;
    user_id: string;
    reaction_emoji: string;
};

export type OpenGraphData = {
    og_url: string | null;
    og_title: string | null;
    og_description: string | null;
};

export type CalendarEvent = {
    event_id: string;
    event_name: string;
    event_description: string | null;
    event_start_date: Date;
    event_start_time: Date;
    event_end_date: Date | null;
    event_end_time: Date | null;
    event_location: string | null;
};

export type GroupSystemEvent = {
    kind: "group-system";
    action:
        | "member-left"
        | "member-added"
        | "name-changed"
        | "image-changed";
    actor_user_id: string;
    actor_name?: string | null;
    target_user_ids?: string[] | null;
    target_names?: string[] | null;
    previous_name?: string | null;
    next_name?: string | null;
};

export type Event = CalendarEvent | GroupSystemEvent;

export type Poll = {
    poll_id: string;
    poll_question: string;
    poll_options: PollOption[];
    poll_multiple_answers: boolean;
    total_votes: number;
    user_has_voted: boolean;
};

export type PollOption = {
    text: string;
    votes: number;
    user_voted?: boolean;
};

export type Contact = {
    contact_id: string;
    contact_name: string;
    contact_image: string;
    contact_phone?: string | null;
    linked_user_id?: string | null;
};

export type Location = {
    location_id: string;
    latitude: number;
    longitude: number;
    place_id?: string;
    formatted_address?: string;
    name?: string;
};

export type ReplyMessage = {
    original_message_id: string;
    original_sender_user_id: string;
    original_message_text: string | null;
    original_attached_media: 'photo' | 'video' | 'voice' | 'file' | 'contact' | 'location' | null;
    original_attached_media_url: string | null;
};

export type Message = {
    message_id: string;
    sender_user_id: string;
    chat_room_id: string;
    client_status?: "pending" | "sending" | "failed" | "sent";
    client_error?: string | null;
    client_received_via_realtime?: boolean;
    is_read_by_recipient?: boolean;
    is_delivered_to_recipient?: boolean;
    read_by_user_ids?: string[] | null;
    client_local_media_name?: string | null;
    client_local_media_size?: number | null;
    client_local_media_mime_type?: string | null;
    encrypted_content_ciphertext?: string | null;
    encrypted_content_iv?: string | null;
    encrypted_content_algorithm?: TextEncryptionAlgorithm | null;
    message_recipient_keys?: RecipientEncryptedAesKey[] | null;
    attached_media: 'photo' | 'video' | 'voice' | 'file' | 'contact' | 'location' | null;
    event: Event | null;
    poll: Poll | null;
    reply_message: ReplyMessage | null;
    location: Location | null;
    media_url: string | null;
    media_preview_url?: string | null;
    media_size_bytes?: number | null;
    media_width?: number | null;
    media_height?: number | null;
    media_file_name?: string | null;
    media_aspect_ratio?: number | null;
    media_object_key?: string | null;
    media_preview_object_key?: string | null;
    media_encrypted_aes_key?: string | null;
    media_iv?: string | null;
    media_mime_type?: string | null;
    media_preview_mime_type?: string | null;
    encrypted_media?: EncryptedMessageMedia | null;
    video_thumbnail: string | null;
    message_raction: MessageReaction | null;
    is_forward_message: boolean;
    message_text_content: string | null;
    open_graph_data: OpenGraphData | null;
    user_ids_pin_it: string[] | null;
    user_ids_star_it: string[] | null;
    deleted: boolean;
    user_id_delete_it: string | null;
    edited: boolean;
    user_id_edit_it: string | null;
    created_at: Date;
    updated_at: Date;
    contact: Contact | null;
};
