CREATE TABLE `circuits` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`circuit_id` text NOT NULL,
	`name` text NOT NULL,
	`competition` text NOT NULL,
	`source` text NOT NULL,
	`width` real NOT NULL,
	`length` real NOT NULL,
	`max_grade` real NOT NULL,
	`elevation_range` real NOT NULL,
	`object_key` text NOT NULL,
	`updated_at` text NOT NULL
);
