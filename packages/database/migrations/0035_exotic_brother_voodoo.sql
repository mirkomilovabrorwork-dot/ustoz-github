ALTER TABLE `videos` ADD `deletedAt` timestamp;--> statement-breakpoint
CREATE INDEX `owner_deleted_idx` ON `videos` (`ownerId`,`deletedAt`);