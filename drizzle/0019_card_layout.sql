CREATE TABLE `card_layout` (
	`user_id` text PRIMARY KEY NOT NULL,
	`order` text NOT NULL,
	`brief` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
