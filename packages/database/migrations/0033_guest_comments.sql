ALTER TABLE `comments` MODIFY COLUMN `authorId` varchar(15);--> statement-breakpoint
ALTER TABLE `comments` ADD `authorName` varchar(50);