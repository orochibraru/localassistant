INSERT INTO `home` (`id`, `name`) VALUES ('home', 'Home');--> statement-breakpoint
UPDATE `floor` SET `home_id` = 'home' WHERE `home_id` IS NULL;--> statement-breakpoint
UPDATE `room` SET `home_id` = 'home' WHERE `home_id` IS NULL;--> statement-breakpoint
UPDATE `device` SET `home_id` = 'home' WHERE `home_id` IS NULL;
