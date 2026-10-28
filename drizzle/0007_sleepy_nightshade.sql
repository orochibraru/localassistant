CREATE TABLE `home` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
DROP INDEX `floor_name_unique`;--> statement-breakpoint
ALTER TABLE `floor` ADD `home_id` text REFERENCES home(id);--> statement-breakpoint
ALTER TABLE `device` ADD `home_id` text REFERENCES home(id);--> statement-breakpoint
ALTER TABLE `room` ADD `home_id` text REFERENCES home(id);