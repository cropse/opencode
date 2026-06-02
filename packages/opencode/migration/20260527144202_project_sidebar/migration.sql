CREATE TABLE `project_sidebar` (
	`id` text PRIMARY KEY,
	`directory` text NOT NULL,
	`project_id` text,
	`worktree` text NOT NULL,
	`order` integer NOT NULL,
	`expanded` integer NOT NULL,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	CONSTRAINT `fk_project_sidebar_project_id_project_id_fk` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE CASCADE
);

--> statement-breakpoint
CREATE INDEX `project_sidebar_directory_idx` ON `project_sidebar` (`directory`);
--> statement-breakpoint
CREATE INDEX `project_sidebar_project_id_idx` ON `project_sidebar` (`project_id`);
