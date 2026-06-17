CREATE TABLE `ai_usage_events` (
	`id` varchar(15) NOT NULL,
	`orgId` varchar(15) NOT NULL,
	`userId` varchar(15) NOT NULL,
	`videoId` varchar(15),
	`operation` varchar(32) NOT NULL,
	`model` varchar(64) NOT NULL,
	`inputTokens` int NOT NULL DEFAULT 0,
	`outputTokens` int NOT NULL DEFAULT 0,
	`costUsdMicros` bigint NOT NULL DEFAULT 0,
	`billingMonth` varchar(7) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ai_usage_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `ai_usage_events` ADD CONSTRAINT `ai_usage_events_org_fk` FOREIGN KEY (`orgId`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ai_usage_events` ADD CONSTRAINT `ai_usage_events_user_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ai_usage_events` ADD CONSTRAINT `ai_usage_events_video_fk` FOREIGN KEY (`videoId`) REFERENCES `videos`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `org_billing_month_idx` ON `ai_usage_events` (`orgId`,`billingMonth`);--> statement-breakpoint
CREATE INDEX `user_billing_month_idx` ON `ai_usage_events` (`userId`,`billingMonth`);--> statement-breakpoint
CREATE INDEX `video_id_idx` ON `ai_usage_events` (`videoId`);