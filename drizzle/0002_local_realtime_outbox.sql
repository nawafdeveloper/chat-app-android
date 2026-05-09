CREATE TABLE `pending_realtime_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`event_json` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pending_realtime_events_dedupe_unique` ON `pending_realtime_events` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `pending_realtime_events_created_at_idx` ON `pending_realtime_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `pending_realtime_events_event_type_idx` ON `pending_realtime_events` (`event_type`);
