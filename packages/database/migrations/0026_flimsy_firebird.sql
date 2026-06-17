ALTER TABLE `organization_invites` ADD `token` varchar(32);--> statement-breakpoint
ALTER TABLE `organization_invites` ADD `consumedAt` timestamp;--> statement-breakpoint
ALTER TABLE `organization_invites` ADD CONSTRAINT `organization_invites_token_unique` UNIQUE(`token`);--> statement-breakpoint
CREATE INDEX `invite_token_idx` ON `organization_invites` (`token`);