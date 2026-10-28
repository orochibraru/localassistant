CREATE TABLE `floor` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`level` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `floor_name_unique` ON `floor` (`name`);--> statement-breakpoint
ALTER TABLE `room` ADD `icon` text DEFAULT 'door' NOT NULL;--> statement-breakpoint
ALTER TABLE `room` ADD `floor_id` text REFERENCES floor(id);--> statement-breakpoint
ALTER TABLE `room` ADD `outdoor` integer DEFAULT false NOT NULL;