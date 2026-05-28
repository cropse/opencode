CREATE TABLE `project_sidebar` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`worktree` text NOT NULL,
	`order` integer NOT NULL DEFAULT 0,
	`expanded` integer NOT NULL DEFAULT 0,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL
);
