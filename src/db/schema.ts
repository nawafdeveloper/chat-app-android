import { InferInsertModel, InferSelectModel, relations } from "drizzle-orm";
import {
    index,
    integer,
    sqliteTable,
    text,
    uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const currentUser = sqliteTable("current_user", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    phone_number: text("phone_number"),
    image: text("image"),
    about_ciphertext: text("about_ciphertext"),
    about_iv: text("about_iv"),
    yhla_public_key: text("yhla_public_key"),
    yhla_encrypted_private_key: text("yhla_encrypted_private_key"),
    yhla_private_key_iv: text("yhla_private_key_iv"),
    yhla_pin_salt: text("yhla_pin_salt"),
    yhla_pin_verification_tag: text("yhla_pin_verification_tag"),
    yhla_pin_verification_iv: text("yhla_pin_verification_iv"),
    chat_wallpaper: text("chat_wallpaper").default("wallpaper-1"),
    enable_read_receipts: integer("enable_read_receipts", { mode: "boolean" }).default(true),
    last_seen: text("last_seen"),
    updated_at: text("updated_at"),
});

export const chats = sqliteTable(
    "chats",
    {
        chat_id: text("chat_id").primaryKey(),
        chat_type: text("chat_type").notNull(),
        avatar: text("avatar").notNull(),
        last_message_id: text("last_message_id"),
        encrypted_preview_ciphertext: text("encrypted_preview_ciphertext"),
        encrypted_preview_iv: text("encrypted_preview_iv"),
        encrypted_preview_algorithm: text("encrypted_preview_algorithm"),
        last_message_context: text("last_message_context").notNull().default(""),
        last_message_media: text("last_message_media"),
        last_message_sender_is_me: integer("last_message_sender_is_me", { mode: "boolean" }).default(false),
        last_message_sender_nickname: text("last_message_sender_nickname").notNull().default(""),
        is_unread: integer("is_unread", { mode: "boolean" }).default(false),
        unread_count: integer("unread_count").default(0),
        is_archived: integer("is_archived", { mode: "boolean" }).default(false),
        is_muted: integer("is_muted", { mode: "boolean" }).default(false),
        is_pinned: integer("is_pinned", { mode: "boolean" }).default(false),
        is_favourite: integer("is_favourite", { mode: "boolean" }).default(false),
        is_blocked: integer("is_blocked", { mode: "boolean" }).default(false),
        encrypted_aes_key: text("encrypted_aes_key"),
        encryption_algorithm: text("encryption_algorithm"),
        created_at: text("created_at").notNull(),
        updated_at: text("updated_at").notNull(),
    },
    (table) => [
        index("chats_type_idx").on(table.chat_type),
        index("chats_updated_at_idx").on(table.updated_at),
        index("chats_pinned_idx").on(table.is_pinned),
    ]
);

export const messages = sqliteTable(
    "messages",
    {
        message_id: text("message_id").primaryKey(),
        chat_room_id: text("chat_room_id")
            .notNull()
            .references(() => chats.chat_id, { onDelete: "cascade" }),
        sender_user_id: text("sender_user_id").notNull(),
        sender_nickname: text("sender_nickname"),
        sender_avatar: text("sender_avatar"),
        is_mine: integer("is_mine", { mode: "boolean" }).default(false),
        encrypted_content_ciphertext: text("encrypted_content_ciphertext"),
        encrypted_content_iv: text("encrypted_content_iv"),
        encrypted_content_algorithm: text("encrypted_content_algorithm"),
        encrypted_aes_key: text("encrypted_aes_key"),
        attached_media: text("attached_media"),
        media_url: text("media_url"),
        media_preview_url: text("media_preview_url"),
        media_size_bytes: integer("media_size_bytes"),
        media_width: integer("media_width"),
        media_height: integer("media_height"),
        media_file_name: text("media_file_name"),
        video_thumbnail: text("video_thumbnail"),
        reply_message_json: text("reply_message_json"),
        reactions_json: text("reactions_json"),
        poll_json: text("poll_json"),
        location_json: text("location_json"),
        contact_json: text("contact_json"),
        event_json: text("event_json"),
        open_graph_json: text("open_graph_json"),
        is_forward: integer("is_forward", { mode: "boolean" }).default(false),
        is_deleted: integer("is_deleted", { mode: "boolean" }).default(false),
        is_edited: integer("is_edited", { mode: "boolean" }).default(false),
        is_pinned: integer("is_pinned", { mode: "boolean" }).default(false),
        is_starred: integer("is_starred", { mode: "boolean" }).default(false),
        send_status: text("send_status").default("sent"),
        created_at: text("created_at").notNull(),
        updated_at: text("updated_at").notNull(),
    },
    (table) => [
        index("messages_chat_room_idx").on(table.chat_room_id),
        index("messages_sender_idx").on(table.sender_user_id),
        index("messages_created_at_idx").on(table.created_at),
        index("messages_pinned_idx").on(table.is_pinned),
        index("messages_starred_idx").on(table.is_starred),
    ]
);

export const contacts = sqliteTable(
    "contacts",
    {
        contact_id: text("contact_id").primaryKey(),
        linked_user_id: text("linked_user_id").notNull(),
        contact_ciphertext: text("contact_ciphertext").notNull(),
        contact_encrypted_aes_key: text("contact_encrypted_aes_key").notNull(),
        contact_iv: text("contact_iv").notNull(),
        contact_algorithm: text("contact_algorithm").default("aes-256-gcm+rsa-oaep-sha256"),
        display_name: text("display_name"),
        avatar: text("avatar"),
        phone_number: text("phone_number"),
        normalized_phone_hash: text("normalized_phone_hash").notNull(),
        is_blocked: integer("is_blocked", { mode: "boolean" }).default(false),
        created_at: text("created_at").notNull(),
        updated_at: text("updated_at").notNull(),
    },
    (table) => [
        index("contacts_linked_user_idx").on(table.linked_user_id),
        index("contacts_phone_hash_idx").on(table.normalized_phone_hash),
        uniqueIndex("contacts_linked_user_unique").on(table.linked_user_id),
    ]
);

export const encryptedMedia = sqliteTable(
    "encrypted_media",
    {
        id: text("id").primaryKey(),
        message_id: text("message_id")
            .references(() => messages.message_id, { onDelete: "cascade" }),
        object_key: text("object_key").notNull(),
        preview_object_key: text("preview_object_key"),
        encrypted_aes_key: text("encrypted_aes_key").notNull(),
        iv: text("iv").notNull(),
        mime_type: text("mime_type").notNull(),
        preview_mime_type: text("preview_mime_type"),
        original_size_bytes: integer("original_size_bytes").default(0),
        local_path: text("local_path"),
        preview_local_path: text("preview_local_path"),
        download_status: text("download_status").default("not_downloaded"), // "not_downloaded"|"downloading"|"downloaded"|"failed"
        created_at: text("created_at").notNull(),
    },
    (table) => [
        index("encrypted_media_message_idx").on(table.message_id),
        index("encrypted_media_object_key_idx").on(table.object_key),
        uniqueIndex("encrypted_media_object_key_unique").on(table.object_key),
    ]
);

export const chatsRelations = relations(chats, ({ many }) => ({
    messages: many(messages),
    media: many(encryptedMedia),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
    chat: one(chats, {
        fields: [messages.chat_room_id],
        references: [chats.chat_id],
    }),
    media: one(encryptedMedia, {
        fields: [messages.message_id],
        references: [encryptedMedia.message_id],
    }),
}));

export const encryptedMediaRelations = relations(encryptedMedia, ({ one }) => ({
    message: one(messages, {
        fields: [encryptedMedia.message_id],
        references: [messages.message_id],
    }),
}));

export const contactsRelations = relations(contacts, ({ one }) => ({
    user: one(currentUser, {
        fields: [contacts.linked_user_id],
        references: [currentUser.id],
    }),
}));

export type DbChat = InferSelectModel<typeof chats>;
export type DbChatInsert = InferInsertModel<typeof chats>;