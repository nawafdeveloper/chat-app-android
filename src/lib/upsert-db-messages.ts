import { db } from "@/db/client";
import { encryptedMedia, messages as dbMessages } from "@/db/schema";
import { applyMessageReadByUser } from "@/lib/message-read-receipts";
import { upsertEncryptedMediaMetadataForMessage } from "@/lib/message-media";
import type { Message } from "@/types/messages";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { and, asc, desc, eq, inArray, lt } from "drizzle-orm";

type DbMessage = InferSelectModel<typeof dbMessages>;
type DbMessageInsert = InferInsertModel<typeof dbMessages>;

function parseJsonValue<T>(json: string | null | undefined): T | null {
    if (!json) return null;
    try {
        return JSON.parse(json) as T;
    } catch {
        return null;
    }
}

function mergeReadByUserIds(
    existingReadByUserIds: string[] | null | undefined,
    incomingReadByUserIds: string[] | null | undefined
) {
    const merged = [
        ...new Set([
            ...(existingReadByUserIds ?? []),
            ...(incomingReadByUserIds ?? []),
        ].filter(Boolean)),
    ];

    return merged.length > 0 ? merged : null;
}

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
        is_read_by_recipient: msg.is_read_by_recipient ?? false,
        read_by_user_ids_json: msg.read_by_user_ids?.length
            ? JSON.stringify(msg.read_by_user_ids)
            : null,
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
        message_recipient_keys: parseJsonValue(row.encrypted_aes_key),
        attached_media: (row.attached_media as Message["attached_media"]) ?? null,
        media_url: row.media_url ?? null,
        media_preview_url: row.media_preview_url ?? null,
        media_size_bytes: row.media_size_bytes ?? null,
        media_width: row.media_width ?? null,
        media_height: row.media_height ?? null,
        media_file_name: row.media_file_name ?? null,
        video_thumbnail: row.video_thumbnail ?? null,
        encrypted_media: null,
        media_object_key: null,
        media_preview_object_key: null,
        media_encrypted_aes_key: null,
        media_iv: null,
        media_mime_type: null,
        media_preview_mime_type: null,
        reply_message: parseJsonValue(row.reply_message_json),
        message_raction: parseJsonValue(row.reactions_json),
        poll: parseJsonValue(row.poll_json),
        location: parseJsonValue(row.location_json),
        contact: parseJsonValue(row.contact_json),
        event: parseJsonValue(row.event_json),
        open_graph_data: parseJsonValue(row.open_graph_json),
        is_forward_message: row.is_forward ?? false,
        deleted: row.is_deleted ?? false,
        user_id_delete_it: null,
        edited: row.is_edited ?? false,
        user_id_edit_it: null,
        user_ids_pin_it: row.is_pinned ? [] : null,
        user_ids_star_it: row.is_starred ? [] : null,
        message_text_content: null, // decrypted at runtime, not stored plaintext
        is_read_by_recipient: row.is_read_by_recipient ?? false,
        read_by_user_ids: parseJsonValue(row.read_by_user_ids_json) ?? [],
        created_at: new Date(row.created_at),
        updated_at: new Date(row.updated_at),
    };
}

function mergeDbReadReceiptFields(
    values: DbMessageInsert,
    existing: Pick<
        DbMessage,
        "is_read_by_recipient" | "read_by_user_ids_json"
    >
): DbMessageInsert {
    const mergedReadByUserIds = mergeReadByUserIds(
        parseJsonValue(existing.read_by_user_ids_json),
        parseJsonValue(values.read_by_user_ids_json)
    );

    return {
        ...values,
        is_read_by_recipient:
            Boolean(existing.is_read_by_recipient) ||
            Boolean(values.is_read_by_recipient),
        read_by_user_ids_json: mergedReadByUserIds
            ? JSON.stringify(mergedReadByUserIds)
            : null,
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

export async function getAllDbMessages(chatRoomId: string): Promise<Message[]> {
    const rows = await db
        .select()
        .from(dbMessages)
        .where(eq(dbMessages.chat_room_id, chatRoomId))
        .orderBy(asc(dbMessages.created_at));

    return rows.map(dbRowToMessage);
}

export async function getEveryDbMessage(): Promise<Message[]> {
    const rows = await db
        .select()
        .from(dbMessages)
        .orderBy(asc(dbMessages.chat_room_id), asc(dbMessages.created_at));

    return rows.map(dbRowToMessage);
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
            .select({
                message_id: dbMessages.message_id,
                is_read_by_recipient: dbMessages.is_read_by_recipient,
                read_by_user_ids_json: dbMessages.read_by_user_ids_json,
            })
            .from(dbMessages)
            .where(eq(dbMessages.message_id, values.message_id))
            .limit(1);

        if (existing.length > 0) {
            await db
                .update(dbMessages)
                .set(mergeDbReadReceiptFields(values, existing[0]))
                .where(eq(dbMessages.message_id, values.message_id));
        } else {
            await db.insert(dbMessages).values(values);
        }

        await upsertEncryptedMediaMetadataForMessage(msg);
    }
}

export async function markDbMessagesReadByUser({
    chatId,
    userId,
    readAt,
    currentUserId,
}: {
    chatId: string;
    userId: string;
    readAt: Date;
    currentUserId: string;
}): Promise<void> {
    const rows = await db
        .select()
        .from(dbMessages)
        .where(eq(dbMessages.chat_room_id, chatId))
        .orderBy(asc(dbMessages.created_at));

    const messagesToPersist = rows
        .map(dbRowToMessage)
        .map((message) => applyMessageReadByUser(message, userId, readAt))
        .filter((message, index) => {
            const row = rows[index];
            const wasRead = Boolean(row.is_read_by_recipient);
            const existingReadByUserIds =
                parseJsonValue<string[]>(row.read_by_user_ids_json) ?? [];

            return (
                Boolean(message.is_read_by_recipient) !== wasRead ||
                (message.read_by_user_ids ?? []).length !==
                    existingReadByUserIds.length
            );
        });

    if (messagesToPersist.length === 0) {
        return;
    }

    await upsertDbMessages(messagesToPersist, currentUserId);
}

// Delete all messages for a chat room (called when chat is deleted locally)
export async function deleteDbMessagesByChatRoom(chatRoomId: string): Promise<void> {
    const messageRows = await db
        .select({ message_id: dbMessages.message_id })
        .from(dbMessages)
        .where(eq(dbMessages.chat_room_id, chatRoomId));
    const messageIds = messageRows.map((message) => message.message_id);

    if (messageIds.length > 0) {
        await db
            .delete(encryptedMedia)
            .where(inArray(encryptedMedia.message_id, messageIds));
    }

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
