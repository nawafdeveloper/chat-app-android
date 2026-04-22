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

export type Event = {
    event_id: string;
    event_name: string;
    event_description: string | null;
    event_start_date: Date;
    event_start_time: Date;
    event_end_date: Date | null;
    event_end_time: Date | null;
    event_location: string | null;
};

export type PollOption = {
    text: string;
    votes: number;
    user_voted: boolean;
};

export type Poll = {
    poll_id: string;
    poll_question: string;
    poll_options: PollOption[]; // Replaces string[] with object containing text, votes, and user vote status
    poll_multiple_answers: boolean;
    total_votes: number;
    user_has_voted: boolean;
};

export type Contact = {
    contact_id: string;
    contact_name: string;
    contact_image: string;
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
    attached_media: 'photo' | 'video' | 'voice' | 'file' | 'contact' | 'location' | null;
    media_aspect_ratio?: number;
    event: Event | null;
    poll: Poll | null;
    reply_message: ReplyMessage | null;
    location: Location | null;
    media_url: string | null;
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