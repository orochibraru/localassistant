UPDATE `plugin` SET `repository` = 'github:https://github.com/' || `repository` WHERE `repository` NOT LIKE '%:%';--> statement-breakpoint
INSERT INTO `setting` (`key`, `value`) SELECT 'sourceTokens', json_array(json_object('site', 'https://github.com', 'encryptedToken', json_extract(`value`, '$.encryptedToken'))) FROM `setting` WHERE `key` = 'githubToken';--> statement-breakpoint
DELETE FROM `setting` WHERE `key` = 'githubToken';
