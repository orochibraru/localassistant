ALTER TABLE `device` ADD `control_dp` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `device` ADD `position_dp` integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE `device` ADD `position_state_dp` integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `device` ADD `unreachable_since` integer;--> statement-breakpoint
ALTER TABLE `device` ADD `unreachable_alerted` integer DEFAULT false NOT NULL;