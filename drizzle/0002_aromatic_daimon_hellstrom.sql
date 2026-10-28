CREATE TABLE `room` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_name_unique` ON `room` (`name`);--> statement-breakpoint
ALTER TABLE `device` ADD `room_id` text REFERENCES room(id) ON DELETE set null;