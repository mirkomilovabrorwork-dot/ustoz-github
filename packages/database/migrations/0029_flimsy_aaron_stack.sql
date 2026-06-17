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
