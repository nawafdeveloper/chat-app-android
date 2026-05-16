import { db } from "@/db/client";
import { DbChat, DbChatInsert, chats as dbChats } from "@/db/schema";
import { resolveAvatarSource } from "@/lib/avatar-source";
import { deleteDbMessagesByChatRoom } from "@/lib/upsert-db-messages";
import type { ChatGroupMember, ChatItemType } from "@/types/chats.type";
import { eq } from "drizzle-orm";

function serializeGroupMembers(groupMembers?: ChatGroupMember[] | null) {
    if (!groupMembers || groupMembers.length === 0) {
        return null;
    }

    return JSON.stringify(
        groupMembers.map((member) => ({
            ...member,
            avatar: resolveAvatarSource(member.avatar),
        }))
    );
}

function parseGroupMembers(value?: string | null): ChatGroupMember[] | null {
    if (!value) {
        return null;
    }

    try {
        const members = JSON.parse(value);

        if (!Array.isArray(members)) {
            return null;
        }

        return members
            .map((member): ChatGroupMember | null => {
                if (!member || typeof member !== "object") {
                    return null;
                }

                const record = member as Record<string, unknown>;
                const userId =
                    typeof record.user_id === "string" ? record.user_id : "";

                if (!userId) {
                    return null;
                }

                return {
                    user_id: userId,
                    phone_number:
                        typeof record.phone_number === "string"
                            ? record.phone_number
                            : null,
                    public_key:
                        typeof record.public_key === "string"
                            ? record.public_key
                            : null,
                    name: typeof record.name === "string" ? record.name : null,
                    avatar: resolveAvatarSource(record.avatar as Parameters<typeof resolveAvatarSource>[0]),
                    is_admin: Boolean(record.is_admin),
                };
            })
            .filter((member): member is ChatGroupMember => Boolean(member));
    } catch {
        return null;
    }
}

function toDbChatInsert(chat: ChatItemType): DbChatInsert {
    return {
        chat_id: chat.chat_id,
        chat_type: chat.chat_type,
        avatar: resolveAvatarSource(chat.avatar) || "",
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
        recipient_user_id: chat.recipient_user_id ?? null,
        contact_phone: chat.contact_phone ?? null,
        display_name: chat.display_name ?? null,
        group_members_json:
            chat.chat_type === "group"
                ? serializeGroupMembers(chat.group_members)
                : null,
        last_message_is_read_by_recipient: chat.last_message_is_read_by_recipient ?? null,
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

function dbRowToChatItem(row: DbChat): ChatItemType {
    return {
        chat_id: row.chat_id,
        chat_type: row.chat_type as "single" | "group",
        avatar: resolveAvatarSource(row.avatar),
        display_name: row.display_name ?? null,
        group_members: parseGroupMembers(row.group_members_json),
        recipient_user_id: row.recipient_user_id ?? null,
        recipient_public_key: null,
        contact_phone: row.contact_phone ?? null,
        recipient_last_seen: null,
        recipient_who_can_see_last_seen: null,
        recipient_last_seen_visible: null,
        recipient_who_can_see_status: null,
        recipient_who_can_see_profile_picture: null,
        recipient_profile_picture_visible: null,
        recipient_about_ciphertext: null,
        recipient_about_encrypted_aes_key: null,
        recipient_about_iv: null,
        recipient_who_can_see_about: null,
        recipient_about_visible: null,
        stored_contact: null,
        is_provisional: false,
        last_message_id: row.last_message_id ?? null,
        encrypted_preview_ciphertext: row.encrypted_preview_ciphertext ?? null,
        encrypted_preview_iv: row.encrypted_preview_iv ?? null,
        encrypted_preview_algorithm: (row.encrypted_preview_algorithm ?? null) as ChatItemType["encrypted_preview_algorithm"],
        chat_recipient_keys: row.encrypted_aes_key
            ? (() => {
                try {
                    return JSON.parse(row.encrypted_aes_key);
                } catch {
                    return null;
                }
            })()
            : null,
        last_message_context: row.last_message_context,
        last_message_media: row.last_message_media ?? null,
        last_message_sender_is_me: row.last_message_sender_is_me ?? false,
        last_message_sender_nickname: row.last_message_sender_nickname,
        last_message_is_read_by_recipient: row.last_message_is_read_by_recipient ?? null,
        last_message_read_by_user_ids: null,
        last_message_recipient_user_ids: null,
        is_unreaded_chat: row.is_unread ?? false,
        unreaded_messages_length: row.unread_count ?? 0,
        is_archived_chat: row.is_archived ?? false,
        is_muted_chat_notifications: row.is_muted ?? false,
        is_pinned_chat: row.is_pinned ?? false,
        is_favourite_chat: row.is_favourite ?? false,
        is_blocked_chat: row.is_blocked ?? false,
        created_at: new Date(row.created_at),
        updated_at: new Date(row.updated_at),
    };
}

export async function getDbChats(): Promise<ChatItemType[]> {
    const rows = await db
        .select()
        .from(dbChats)
        .orderBy(dbChats.is_pinned, dbChats.updated_at);

    return rows.map(dbRowToChatItem);
}

export async function getDbChat(chatId: string): Promise<ChatItemType | null> {
    const rows = await db
        .select()
        .from(dbChats)
        .where(eq(dbChats.chat_id, chatId))
        .limit(1);

    return rows.length > 0 ? dbRowToChatItem(rows[0]) : null;
}

export async function markDbChatRead(chatId: string) {
    await db
        .update(dbChats)
        .set({
            is_unread: false,
            unread_count: 0,
        })
        .where(eq(dbChats.chat_id, chatId));
}

export async function deleteDbChat(chatId: string): Promise<void> {
    await deleteDbMessagesByChatRoom(chatId);

    await db.delete(dbChats).where(eq(dbChats.chat_id, chatId));
}

export async function upsertDbChats(chats: ChatItemType[]) {
    for (const chat of chats) {
        const values = toDbChatInsert(chat);

        const existing = await db
            .select({
                chat_id: dbChats.chat_id,
                group_members_json: dbChats.group_members_json,
            })
            .from(dbChats)
            .where(eq(dbChats.chat_id, values.chat_id))
            .limit(1);

        if (existing.length > 0) {
            const nextValues = {
                ...values,
                group_members_json:
                    values.group_members_json ??
                    existing[0].group_members_json ??
                    null,
            };

            await db
                .update(dbChats)
                .set(nextValues)
                .where(eq(dbChats.chat_id, values.chat_id));
        } else {
            await db.insert(dbChats).values(values);
        }
    }
}
