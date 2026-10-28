UPDATE `room` SET `floor_id` = (SELECT `id` FROM `floor` ORDER BY abs(`level`), `level` LIMIT 1) WHERE `floor_id` IS NULL AND `outdoor` = 0;
