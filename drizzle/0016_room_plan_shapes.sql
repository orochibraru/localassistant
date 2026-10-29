ALTER TABLE `room` ADD `plan` text;--> statement-breakpoint
UPDATE `room` SET `plan` = json_array(json_object('x', `plan_x`, 'y', `plan_y`, 'width', `plan_width`, 'height', `plan_height`)) WHERE `plan_x` IS NOT NULL AND `plan_y` IS NOT NULL AND `plan_width` IS NOT NULL AND `plan_height` IS NOT NULL;
