ALTER TABLE `messages` ADD `is_read_by_recipient` integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `messages` ADD `read_by_user_ids_json` text;
--> statement-breakpoint
UPDATE `messages`
SET `is_read_by_recipient` = 1
WHERE `message_id` IN (
    SELECT `last_message_id`
    FROM `chats`
    WHERE `last_message_is_read_by_recipient` = 1
);
