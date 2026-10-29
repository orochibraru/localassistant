CREATE TABLE `energy_reading` (
	`device_id` text NOT NULL,
	`hour` integer NOT NULL,
	`total` real NOT NULL,
	PRIMARY KEY(`device_id`, `hour`),
	FOREIGN KEY (`device_id`) REFERENCES `device`(`id`) ON UPDATE no action ON DELETE cascade
);
