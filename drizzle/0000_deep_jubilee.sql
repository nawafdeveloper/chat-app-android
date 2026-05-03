CREATE TABLE `chats` (
	`chat_id` text PRIMARY KEY NOT NULL,
	`chat_type` text NOT NULL,
	`avatar` text NOT NULL,
	`last_message_id` text,
	`encrypted_preview_ciphertext` text,
	`encrypted_preview_iv` text,
	`encrypted_preview_algorithm` text,
	`last_message_context` text DEFAULT '' NOT NULL,
	`last_message_media` text,
	`last_message_sender_is_me` integer DEFAULT false,
	`last_message_sender_nickname` text DEFAULT '' NOT NULL,
	`is_unread` integer DEFAULT false,
	`unread_count` integer DEFAULT 0,
	`is_archived` integer DEFAULT false,
	`is_muted` integer DEFAULT false,
	`is_pinned` integer DEFAULT false,
	`is_favourite` integer DEFAULT false,
	`is_blocked` integer DEFAULT false,
	`encrypted_aes_key` text,
	`encryption_algorithm` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `chats_type_idx` ON `chats` (`chat_type`);--> statement-breakpoint
CREATE INDEX `chats_updated_at_idx` ON `chats` (`updated_at`);--> statement-breakpoint
CREATE INDEX `chats_pinned_idx` ON `chats` (`is_pinned`);--> statement-breakpoint
CREATE TABLE `contacts` (
	`contact_id` text PRIMARY KEY NOT NULL,
	`linked_user_id` text NOT NULL,
	`contact_ciphertext` text NOT NULL,
	`contact_encrypted_aes_key` text NOT NULL,
	`contact_iv` text NOT NULL,
	`contact_algorithm` text DEFAULT 'aes-256-gcm+rsa-oaep-sha256',
	`display_name` text,
	`avatar` text,
	`phone_number` text,
	`normalized_phone_hash` text NOT NULL,
	`is_blocked` integer DEFAULT false,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `contacts_linked_user_idx` ON `contacts` (`linked_user_id`);--> statement-breakpoint
CREATE INDEX `contacts_phone_hash_idx` ON `contacts` (`normalized_phone_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `contacts_linked_user_unique` ON `contacts` (`linked_user_id`);--> statement-breakpoint
CREATE TABLE `current_user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone_number` text,
	`image` text,
	`about_ciphertext` text,
	`about_iv` text,
	`yhla_public_key` text,
	`yhla_encrypted_private_key` text,
	`yhla_private_key_iv` text,
	`yhla_pin_salt` text,
	`yhla_pin_verification_tag` text,
	`yhla_pin_verification_iv` text,
	`chat_wallpaper` text DEFAULT 'wallpaper-1',
	`enable_read_receipts` integer DEFAULT true,
	`last_seen` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `encrypted_media` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text,
	`object_key` text NOT NULL,
	`preview_object_key` text,
	`encrypted_aes_key` text NOT NULL,
	`iv` text NOT NULL,
	`mime_type` text NOT NULL,
	`preview_mime_type` text,
	`original_size_bytes` integer DEFAULT 0,
	`local_path` text,
	`preview_local_path` text,
	`download_status` text DEFAULT 'not_downloaded',
	`created_at` text NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`message_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `encrypted_media_message_idx` ON `encrypted_media` (`message_id`);--> statement-breakpoint
CREATE INDEX `encrypted_media_object_key_idx` ON `encrypted_media` (`object_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `encrypted_media_object_key_unique` ON `encrypted_media` (`object_key`);--> statement-breakpoint
CREATE TABLE `messages` (
	`message_id` text PRIMARY KEY NOT NULL,
	`chat_room_id` text NOT NULL,
	`sender_user_id` text NOT NULL,
	`sender_nickname` text,
	`sender_avatar` text,
	`is_mine` integer DEFAULT false,
	`encrypted_content_ciphertext` text,
	`encrypted_content_iv` text,
	`encrypted_content_algorithm` text,
	`encrypted_aes_key` text,
	`attached_media` text,
	`media_url` text,
	`media_preview_url` text,
	`media_size_bytes` integer,
	`media_width` integer,
	`media_height` integer,
	`media_file_name` text,
	`video_thumbnail` text,
	`reply_message_json` text,
	`reactions_json` text,
	`poll_json` text,
	`location_json` text,
	`contact_json` text,
	`event_json` text,
	`open_graph_json` text,
	`is_forward` integer DEFAULT false,
	`is_deleted` integer DEFAULT false,
	`is_edited` integer DEFAULT false,
	`is_pinned` integer DEFAULT false,
	`is_starred` integer DEFAULT false,
	`send_status` text DEFAULT 'sent',
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`chat_room_id`) REFERENCES `chats`(`chat_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `messages_chat_room_idx` ON `messages` (`chat_room_id`);--> statement-breakpoint
CREATE INDEX `messages_sender_idx` ON `messages` (`sender_user_id`);--> statement-breakpoint
CREATE INDEX `messages_created_at_idx` ON `messages` (`created_at`);--> statement-breakpoint
CREATE INDEX `messages_pinned_idx` ON `messages` (`is_pinned`);--> statement-breakpoint
CREATE INDEX `messages_starred_idx` ON `messages` (`is_starred`);