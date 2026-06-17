CREATE TABLE `video_edit_history` (
	`id` varchar(36) NOT NULL DEFAULT (UUID()),
	`videoId` varchar(15) NOT NULL,
	`edit_spec` json NOT NULL,
	`result_key` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `video_edit_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `video_edit_history_video_id_idx` ON `video_edit_history` (`videoId`);