CREATE TABLE `ai_chat_usage` (
	`id` varchar(15) NOT NULL,
	`videoId` varchar(15) NOT NULL,
	`clientId` varchar(64) NOT NULL,
	`dateUtc` date NOT NULL,
	`requestCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ai_chat_usage_id` PRIMARY KEY(`id`),
	CONSTRAINT `video_client_date_idx` UNIQUE(`videoId`,`clientId`,`dateUtc`)
);
