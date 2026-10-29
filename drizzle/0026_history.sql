CREATE TABLE `device_sample` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_id` text NOT NULL,
	`at` integer NOT NULL,
	`value` real NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `device`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `device_sample_device_idx` ON `device_sample` (`device_id`,`at`);--> statement-breakpoint
CREATE TABLE `logbook_entry` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`home_id` text,
	`device_id` text,
	`name` text NOT NULL,
	`message` text NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`home_id`) REFERENCES `home`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `logbook_entry_at_idx` ON `logbook_entry` (`at`);--> statement-breakpoint
CREATE INDEX `logbook_entry_device_idx` ON `logbook_entry` (`device_id`,`at`);