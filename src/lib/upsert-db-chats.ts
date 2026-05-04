import { db } from "@/db/client";
import { DbChatInsert, chats as dbChats } from "@/db/schema";
import type { ChatItemType } from "@/types/chats.type";
import { eq } from "drizzle-orm";

function toDbChatInsert(chat: ChatItemType): DbChatInsert {
    return {
        chat_id: chat.chat_id,
        chat_type: chat.chat_type,
        avatar: chat.avatar || "",
        last_message_id: chat.last_message_id ?? null,
        encrypted_preview_ciphertext: chat.encrypted_preview_ciphertext ?? null,
        encrypted_preview_iv: chat.encrypted_preview_iv ?? null,
        encrypted_preview_algorithm: chat.encrypted_preview_algorithm ?? null,
        last_message_context: chat.last_message_context || "",
        last_message_media: chat.last_message_media ?? null,
        last_message_sender_is_me: Boolean(chat.last_message_sender_is_me),
        last_message_sender_nickname: chat.last_message_sender_nickname || "",
        is_unread: Boolean(chat.is_unreaded_chat),
        unread_count: chat.unreaded_messages_length ?? 0,
        is_archived: Boolean(chat.is_archived_chat),
        is_muted: Boolean(chat.is_muted_chat_notifications),
        is_pinned: Boolean(chat.is_pinned_chat),
        is_favourite: Boolean(chat.is_favourite_chat),
        is_blocked: Boolean(chat.is_blocked_chat),
        encrypted_aes_key: chat.chat_recipient_keys
            ? JSON.stringify(chat.chat_recipient_keys)
            : null,
        encryption_algorithm: null,
        created_at:
            chat.created_at instanceof Date
                ? chat.created_at.toISOString()
                : String(chat.created_at),
        updated_at:
            chat.updated_at instanceof Date
                ? chat.updated_at.toISOString()
                : String(chat.updated_at),
    };
}

export async function upsertDbChats(chats: ChatItemType[]) {
    for (const chat of chats) {
        const values = toDbChatInsert(chat);

        const existing = await db
            .select({ chat_id: dbChats.chat_id })
            .from(dbChats)
            .where(eq(dbChats.chat_id, values.chat_id))
            .limit(1);

        if (existing.length > 0) {
            await db
                .update(dbChats)
                .set(values)
                .where(eq(dbChats.chat_id, values.chat_id));
        } else {
            await db.insert(dbChats).values(values);
        }
    }
}