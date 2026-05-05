import { db } from "@/db/client";
import { messages as dbMessages } from "@/db/schema";
import type { Message } from "@/types/messages";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { and, desc, eq, inArray, lt } from "drizzle-orm";

type DbMessage = InferSelectModel<typeof dbMessages>;
type DbMessageInsert = InferInsertModel<typeof dbMessages>;

function toDbMessageInsert(msg: Message, currentUserId: string): DbMessageInsert {
    return {
        message_id: msg.message_id,
        chat_room_id: msg.chat_room_id,
        sender_user_id: msg.sender_user_id,
        is_mine: msg.sender_user_id === currentUserId,
        encrypted_content_ciphertext: msg.encrypted_content_ciphertext ?? null,
        encrypted_content_iv: msg.encrypted_content_iv ?? null,
        encrypted_content_algorithm: msg.encrypted_content_algorithm ?? null,
        encrypted_aes_key: msg.message_recipient_keys
            ? JSON.stringify(msg.message_recipient_keys)
            : null,
        attached_media: msg.attached_media ?? null,
        media_url: msg.media_url ?? null,
        media_preview_url: msg.media_preview_url ?? null,
        media_size_bytes: msg.media_size_bytes ?? null,
        media_width: msg.media_width ?? null,
        media_height: msg.media_height ?? null,
        media_file_name: msg.media_file_name ?? null,
        video_thumbnail: msg.video_thumbnail ?? null,
        reply_message_json: msg.reply_message
            ? JSON.stringify(msg.reply_message)
            : null,
        reactions_json: msg.message_raction
            ? JSON.stringify(msg.message_raction)
            : null,
        poll_json: msg.poll ? JSON.stringify(msg.poll) : null,
        location_json: msg.location ? JSON.stringify(msg.location) : null,
        contact_json: msg.contact ? JSON.stringify(msg.contact) : null,
        event_json: msg.event ? JSON.stringify(msg.event) : null,
        open_graph_json: msg.open_graph_data
            ? JSON.stringify(msg.open_graph_data)
            : null,
        is_forward: msg.is_forward_message,
        is_deleted: msg.deleted,
        is_edited: msg.edited,
        is_pinned: msg.user_ids_pin_it?.includes(currentUserId) ?? false,
        is_starred: msg.user_ids_star_it?.includes(currentUserId) ?? false,
        send_status: msg.client_status ?? "sent",
        created_at:
            msg.created_at instanceof Date
                ? msg.created_at.toISOString()
                : String(msg.created_at),
        updated_at:
            msg.updated_at instanceof Date
                ? msg.updated_at.toISOString()
                : String(msg.updated_at),
    };
}

function dbRowToMessage(row: DbMessage): Message {
    const parseJson = <T>(json: string | null): T | null => {
        if (!json) return null;
        try {
            return JSON.parse(json) as T;
        } catch {
            return null;
        }
    };

    return {
        message_id: row.message_id,
        chat_room_id: row.chat_room_id,
        sender_user_id: row.sender_user_id,
        client_status: (row.send_status as Message["client_status"]) ?? "sent",
        client_error: null,
        client_received_via_realtime: false,
        encrypted_content_ciphertext: row.encrypted_content_ciphertext ?? null,
        encrypted_content_iv: row.encrypted_content_iv ?? null,
        encrypted_content_algorithm:
            (row.encrypted_content_algorithm as Message["encrypted_content_algorithm"]) ?? null,
        message_recipient_keys: parseJson(row.encrypted_aes_key),
        attached_media: (row.attached_media as Message["attached_media"]) ?? null,
        media_url: row.media_url ?? null,
        media_preview_url: row.media_preview_url ?? null,
        media_size_bytes: row.media_size_bytes ?? null,
        media_width: row.media_width ?? null,
        media_height: row.media_height ?? null,
        media_file_name: row.media_file_name ?? null,
        video_thumbnail: row.video_thumbnail ?? null,
        reply_message: parseJson(row.reply_message_json),
        message_raction: parseJson(row.reactions_json),
        poll: parseJson(row.poll_json),
        location: parseJson(row.location_json),
        contact: parseJson(row.contact_json),
        event: parseJson(row.event_json),
        open_graph_data: parseJson(row.open_graph_json),
        is_forward_message: row.is_forward ?? false,
        deleted: row.is_deleted ?? false,
        user_id_delete_it: null,
        edited: row.is_edited ?? false,
        user_id_edit_it: null,
        user_ids_pin_it: row.is_pinned ? [] : null,
        user_ids_star_it: row.is_starred ? [] : null,
        message_text_content: null, // decrypted at runtime, not stored plaintext
        is_read_by_recipient: undefined,
        read_by_user_ids: null,
        created_at: new Date(row.created_at),
        updated_at: new Date(row.updated_at),
    };
}

// Get the newest message page, or the next older page before a timestamp.
// The DB query is newest-first for paging, but the UI/store expects chronological order.
export async function getDbMessages(
    chatRoomId: string,
    limit = 20,
    beforeDate?: Date,
): Promise<Message[]> {
    const conditions = [eq(dbMessages.chat_room_id, chatRoomId)];
    if (beforeDate) {
        conditions.push(lt(dbMessages.created_at, beforeDate.toISOString()));
    }

    const rows = await db
        .select()
        .from(dbMessages)
        .where(and(...conditions))
        .orderBy(desc(dbMessages.created_at))
        .limit(limit);

    return rows
        .map(dbRowToMessage)
        .sort((left, right) => left.created_at.getTime() - right.created_at.getTime());
}

// Get a single message by ID
export async function getDbMessage(messageId: string): Promise<Message | null> {
    const rows = await db
        .select()
        .from(dbMessages)
        .where(eq(dbMessages.message_id, messageId))
        .limit(1);

    return rows.length > 0 ? dbRowToMessage(rows[0]) : null;
}

// Upsert one or more messages
export async function upsertDbMessages(
    msgs: Message[],
    currentUserId: string,
): Promise<void> {
    for (const msg of msgs) {
        const values = toDbMessageInsert(msg, currentUserId);

        const existing = await db
            .select({ message_id: dbMessages.message_id })
            .from(dbMessages)
            .where(eq(dbMessages.message_id, values.message_id))
            .limit(1);

        if (existing.length > 0) {
            await db
                .update(dbMessages)
                .set(values)
                .where(eq(dbMessages.message_id, values.message_id));
        } else {
            await db.insert(dbMessages).values(values);
        }
    }
}

// Delete all messages for a chat room (called when chat is deleted locally)
export async function deleteDbMessagesByChatRoom(chatRoomId: string): Promise<void> {
    await db
        .delete(dbMessages)
        .where(eq(dbMessages.chat_room_id, chatRoomId));
}

// Delete specific messages by ID
export async function deleteDbMessages(messageIds: string[]): Promise<void> {
    if (messageIds.length === 0) return;
    await db
        .delete(dbMessages)
        .where(inArray(dbMessages.message_id, messageIds));
}
