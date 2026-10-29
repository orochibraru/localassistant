UPDATE `device` SET `kind` = 'home-assistant-light', `state` = NULL WHERE `kind` = 'home-assistant-switch' AND `external_id` LIKE 'light.%';
--> statement-breakpoint
UPDATE `device` SET `kind` = 'home-assistant-fan', `state` = NULL WHERE `kind` = 'home-assistant-switch' AND `external_id` LIKE 'fan.%';
