CREATE TABLE `audit_log` (
	`id` varchar(36) NOT NULL DEFAULT (UUID()),
	`org_id` varchar(36),
	`actor_user_id` varchar(36),
	`action` varchar(100) NOT NULL,
	`entity_type` varchar(50) NOT NULL,
	`entity_id` varchar(100),
	`metadata` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transcript_chunks` (
	`id` varchar(15) NOT NULL,
	`videoId` varchar(15) NOT NULL,
	`chunkIndex` int NOT NULL,
	`startMs` int NOT NULL,
	`endMs` int NOT NULL,
	`speaker` varchar(64),
	`text` text NOT NULL,
	`tokens` int NOT NULL,
	`embedding` json,
	`embeddingModel` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `transcript_chunks_id` PRIMARY KEY(`id`),
	CONSTRAINT `video_chunk_unique` UNIQUE(`videoId`,`chunkIndex`)
);
--> statement-breakpoint
CREATE TABLE `video_edit_history` (
	`id` varchar(36) NOT NULL DEFAULT (UUID()),
	`videoId` varchar(15) NOT NULL,
	`edit_spec` json NOT NULL,
	`result_key` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `video_edit_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `notifications` MODIFY COLUMN `videoId` varchar(15);--> statement-breakpoint
ALTER TABLE `organization_invites` ADD `token` varchar(32);--> statement-breakpoint
ALTER TABLE `organization_invites` ADD `consumedAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `geminiApiKey` text;--> statement-breakpoint
ALTER TABLE `organization_invites` ADD CONSTRAINT `organization_invites_token_unique` UNIQUE(`token`);--> statement-breakpoint
ALTER TABLE `transcript_chunks` ADD CONSTRAINT `transcript_chunks_videoId_videos_id_fk` FOREIGN KEY (`videoId`) REFERENCES `videos`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `video_edit_history` ADD CONSTRAINT `video_edit_history_videoId_videos_id_fk` FOREIGN KEY (`videoId`) REFERENCES `videos`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `video_id_idx` ON `transcript_chunks` (`videoId`);--> statement-breakpoint
CREATE INDEX `video_edit_history_video_id_idx` ON `video_edit_history` (`videoId`);--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `comments_videoId_videos_id_fk` FOREIGN KEY (`videoId`) REFERENCES `videos`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `comments_parentCommentId_comments_id_fk` FOREIGN KEY (`parentCommentId`) REFERENCES `comments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_videoId_videos_id_fk` FOREIGN KEY (`videoId`) REFERENCES `videos`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shared_videos` ADD CONSTRAINT `shared_videos_videoId_videos_id_fk` FOREIGN KEY (`videoId`) REFERENCES `videos`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `space_videos` ADD CONSTRAINT `space_videos_videoId_videos_id_fk` FOREIGN KEY (`videoId`) REFERENCES `videos`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `storage_objects` ADD CONSTRAINT `storage_objects_videoId_videos_id_fk` FOREIGN KEY (`videoId`) REFERENCES `videos`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `invite_token_idx` ON `organization_invites` (`token`);