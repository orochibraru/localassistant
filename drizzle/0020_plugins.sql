CREATE TABLE `plugin` (
	`id` text PRIMARY KEY NOT NULL,
	`repository` text NOT NULL,
	`path` text DEFAULT '' NOT NULL,
	`ref` text NOT NULL,
	`manifest` text NOT NULL,
	`status` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `device` ADD `fields` text;--> statement-breakpoint
ALTER TABLE `device` ADD `secrets` text;--> statement-breakpoint
UPDATE `device` SET `fields` = json_object('host', coalesce(`host`, ''), 'deviceId', `external_id`, 'protocolVersion', coalesce(`protocol_version`, '3.3'), 'inverted', json(CASE WHEN `inverted` THEN 'true' ELSE 'false' END), 'controlDp', `control_dp`, 'positionDp', `position_dp`, 'positionStateDp', `position_state_dp`), `secrets` = CASE WHEN `local_key` IS NULL THEN NULL ELSE json_object('localKey', `local_key`) END WHERE `kind` = 'tuya-cover';--> statement-breakpoint
UPDATE `device` SET `fields` = json_object('host', coalesce(`host`, ''), 'serial', `external_id`), `secrets` = CASE WHEN `local_key` IS NULL THEN NULL ELSE json_object('accessCode', `local_key`) END WHERE `kind` = 'bambu-printer';--> statement-breakpoint
UPDATE `device` SET `fields` = json_object('prm', `external_id`), `secrets` = CASE WHEN `local_key` IS NULL THEN NULL ELSE json_object('token', `local_key`) END WHERE `kind` = 'linky';--> statement-breakpoint
UPDATE `device` SET `fields` = json_object('record', json(CASE WHEN json_extract(`options`, '$.record') THEN 'true' ELSE 'false' END), 'retentionDays', coalesce(json_extract(`options`, '$.retentionDays'), 7)), `secrets` = CASE WHEN `local_key` IS NULL THEN NULL ELSE json_object('url', `local_key`) END WHERE `kind` = 'camera';--> statement-breakpoint
UPDATE `device` SET `fields` = json_object('host', coalesce(`host`, ''), 'objectId', coalesce(json_extract(`options`, '$.objectId'), '')) WHERE `kind` = 'esphome-climate';--> statement-breakpoint
UPDATE `device` SET `fields` = json_object('buildingId', coalesce(`building_id`, 0)) WHERE `kind` IN ('melcloud-ata', 'melcloud-atw');--> statement-breakpoint
UPDATE `device` SET `options` = json_remove(`options`, '$.record', '$.retentionDays', '$.objectId') WHERE `options` IS NOT NULL;--> statement-breakpoint
UPDATE `setting` SET `key` = 'plugin:melcloud', `value` = json_object('homeId', NULL, 'values', json_object('email', json_extract(`value`, '$.email')), 'secrets', json_object('password', json_extract(`value`, '$.encryptedPassword'))) WHERE `key` = 'melcloud';--> statement-breakpoint
UPDATE `setting` SET `key` = 'plugin:dreame', `value` = json_object('homeId', NULL, 'values', json_object('email', json_extract(`value`, '$.email'), 'region', json_extract(`value`, '$.region')), 'secrets', json_object('password', json_extract(`value`, '$.encryptedPassword'))) WHERE `key` = 'dreame';--> statement-breakpoint
UPDATE `setting` SET `key` = 'plugin:frigate', `value` = json_object('homeId', json_extract(`value`, '$.homeId'), 'values', json_object('url', json_extract(`value`, '$.url'), 'notifyLabels', coalesce((SELECT group_concat(`labels`.`value`, ', ') FROM json_each(json_extract(`setting`.`value`, '$.notifyLabels')) AS `labels`), '')), 'secrets', json_object()) WHERE `key` = 'frigate';--> statement-breakpoint
INSERT INTO `setting` (`key`, `value`) SELECT 'plugin:zigbee', json_object('homeId', json_extract(`value`, '$.homeId'), 'values', json_object('topic', coalesce(json_extract(`value`, '$.zigbeeTopic'), 'zigbee2mqtt')), 'secrets', json_object()) FROM `setting` WHERE `key` = 'mqtt';--> statement-breakpoint
UPDATE `setting` SET `value` = json_remove(`value`, '$.zigbeeTopic') WHERE `key` = 'mqtt';
