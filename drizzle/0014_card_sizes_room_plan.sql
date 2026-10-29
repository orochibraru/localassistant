CREATE TABLE `card_size` (
	`user_id` text NOT NULL,
	`device_id` text NOT NULL,
	`size` text NOT NULL,
	PRIMARY KEY(`user_id`, `device_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `device`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `room` ADD `plan_x` integer;--> statement-breakpoint
ALTER TABLE `room` ADD `plan_y` integer;--> statement-breakpoint
ALTER TABLE `room` ADD `plan_width` integer;--> statement-breakpoint
ALTER TABLE `room` ADD `plan_height` integer;