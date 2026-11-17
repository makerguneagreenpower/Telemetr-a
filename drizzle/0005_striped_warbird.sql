CREATE TABLE `race_replays` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`event_name` text NOT NULL,
	`run_name` text NOT NULL,
	`circuit_id` text NOT NULL,
	`circuit_name` text NOT NULL,
	`event_date` text NOT NULL,
	`created_at` text NOT NULL,
	`object_key` text NOT NULL,
	`best_lap_seconds` real,
	`total_time_seconds` real NOT NULL,
	`lap_count` integer NOT NULL,
	`telemetry_session_id` text
);
