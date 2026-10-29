CREATE TABLE `presence` (
	`user_id` text PRIMARY KEY NOT NULL,
	`home` integer,
	`changed_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
