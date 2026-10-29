CREATE TABLE `automation_run` (
	`id` text PRIMARY KEY NOT NULL,
	`automation_id` text NOT NULL,
	`cause` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`automation_id`) REFERENCES `automation`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `automation_run_automation_idx` ON `automation_run` (`automation_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `scene` (
	`id` text PRIMARY KEY NOT NULL,
	`home_id` text NOT NULL,
	`name` text NOT NULL,
	`members` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`home_id`) REFERENCES `home`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `automation` ADD `conditions` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
UPDATE `automation` SET `actions` = (SELECT json_group_array(CASE json_extract(`step`.`value`, '$.type') WHEN 'climate' THEN json_object('type', 'device', 'deviceId', json_extract(`step`.`value`, '$.deviceId'), 'command', json_object('type', 'climate', 'change', json_patch(json_object('power', json(iif(json_extract(`step`.`value`, '$.power'), 'true', 'false'))), json_object('mode', json_extract(`step`.`value`, '$.mode'), 'targetTemperature', json_extract(`step`.`value`, '$.targetTemperature'))))) WHEN 'printer' THEN json_object('type', 'device', 'deviceId', json_extract(`step`.`value`, '$.deviceId'), 'command', json_object('type', 'printer', 'change', json_object('command', json_extract(`step`.`value`, '$.command')))) WHEN 'vacuum' THEN json_object('type', 'device', 'deviceId', json_extract(`step`.`value`, '$.deviceId'), 'command', json_object('type', 'vacuum', 'change', json_object('command', json_extract(`step`.`value`, '$.command')))) ELSE json(`step`.`value`) END) FROM json_each(`automation`.`actions`) AS `step`) WHERE EXISTS (SELECT 1 FROM json_each(`automation`.`actions`) AS `step` WHERE json_extract(`step`.`value`, '$.type') IN ('climate', 'printer', 'vacuum'));
