CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `batch_account` ON `import_batches` (`account_id`);--> statement-breakpoint
CREATE TABLE `images` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `image_account` ON `images` (`account_id`);--> statement-breakpoint
CREATE TABLE `wardrobe_items` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`source_key` text NOT NULL,
	`purchase_id` text,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `item_account_source` ON `wardrobe_items` (`account_id`,`source_key`);--> statement-breakpoint
CREATE INDEX `item_account` ON `wardrobe_items` (`account_id`);--> statement-breakpoint
CREATE TABLE `outfits` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `outfit_account` ON `outfits` (`account_id`);--> statement-breakpoint
CREATE TABLE `preferences` (
	`account_id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `purchase_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`source_key` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_account_source` ON `purchase_lines` (`account_id`,`source_key`);