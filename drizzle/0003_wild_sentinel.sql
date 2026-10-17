CREATE TABLE `cycle_closure_items` (
	`id` text PRIMARY KEY NOT NULL,
	`closure_id` text NOT NULL,
	`category_id` text,
	`category_name` text DEFAULT '' NOT NULL,
	`leftover_cents` integer NOT NULL,
	`decision` text NOT NULL,
	`target_category_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`closure_id`) REFERENCES `cycle_closures`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`target_category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_closure_items_closure` ON `cycle_closure_items` (`closure_id`);--> statement-breakpoint
CREATE TABLE `cycle_closures` (
	`id` text PRIMARY KEY NOT NULL,
	`cycle_key` text NOT NULL,
	`saved_cents` integer DEFAULT 0 NOT NULL,
	`carried_cents` integer DEFAULT 0 NOT NULL,
	`note` text,
	`closed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cycle_closures_cycle_key_unique` ON `cycle_closures` (`cycle_key`);--> statement-breakpoint
CREATE TABLE `savings_buckets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`pct` integer DEFAULT 0 NOT NULL,
	`icon` text DEFAULT 'piggy-bank' NOT NULL,
	`color` text DEFAULT '#10b981' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `savings_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`bucket_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`cycle_key` text DEFAULT '' NOT NULL,
	`note` text,
	`date` text NOT NULL,
	`ts` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`bucket_id`) REFERENCES `savings_buckets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_savings_bucket` ON `savings_entries` (`bucket_id`);--> statement-breakpoint
CREATE INDEX `idx_savings_cycle` ON `savings_entries` (`cycle_key`);--> statement-breakpoint
CREATE INDEX `idx_savings_ts` ON `savings_entries` (`ts`);--> statement-breakpoint
ALTER TABLE `budgets` ADD `cycle_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `budgets` ADD `carry_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_budgets_cat_cycle` ON `budgets` (`category_id`,`cycle_key`);--> statement-breakpoint
ALTER TABLE `transactions` ADD `cycle_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `fixed_expense_id` text REFERENCES fixed_expenses(id);--> statement-breakpoint
CREATE INDEX `idx_tx_cycle` ON `transactions` (`cycle_key`);--> statement-breakpoint
CREATE INDEX `idx_tx_cycle_category` ON `transactions` (`cycle_key`,`category_id`);--> statement-breakpoint
CREATE INDEX `idx_tx_fixed` ON `transactions` (`fixed_expense_id`);--> statement-breakpoint
UPDATE `transactions` SET `cycle_key` = CASE
	WHEN CAST(substr(`date`, 9, 2) AS INTEGER) >= 25 THEN substr(`date`, 1, 7)
	ELSE strftime('%Y-%m', date(`date`, 'start of month', '-1 day'))
END;--> statement-breakpoint
UPDATE `transactions` SET `fixed_expense_id` = substr(`client_id`, 4, instr(substr(`client_id`, 4), ':') - 1)
WHERE `client_id` LIKE 'fe:%'
	AND substr(`client_id`, 4, instr(substr(`client_id`, 4), ':') - 1) IN (SELECT `id` FROM `fixed_expenses`);--> statement-breakpoint
UPDATE `budgets` SET `cycle_key` = CASE
	WHEN CAST(strftime('%d', 'now') AS INTEGER) >= 25 THEN strftime('%Y-%m', 'now')
	ELSE strftime('%Y-%m', 'now', '-1 month')
END;--> statement-breakpoint
INSERT INTO `savings_buckets` (`id`, `name`, `pct`, `icon`, `color`, `sort_order`, `is_active`, `created_at`) VALUES
	('bucket-emergencia', 'Fondo de emergencia', 20, 'shield', '#f59e0b', 0, 1, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
	('bucket-metas', 'Metas grandes', 50, 'target', '#10b981', 1, 1, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
	('bucket-viaje', 'Viaje', 30, 'plane', '#3b82f6', 2, 1, CAST(strftime('%s', 'now') AS INTEGER) * 1000);