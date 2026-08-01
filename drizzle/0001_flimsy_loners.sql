CREATE INDEX `idx_tx_date` ON `transactions` (`date`);--> statement-breakpoint
CREATE INDEX `idx_tx_category` ON `transactions` (`category_id`);--> statement-breakpoint
CREATE INDEX `idx_tx_type` ON `transactions` (`type`);--> statement-breakpoint
CREATE INDEX `idx_tx_year_month` ON `transactions` (`year`,`month`);--> statement-breakpoint
CREATE INDEX `idx_tx_week` ON `transactions` (`week_iso`);--> statement-breakpoint
CREATE INDEX `idx_tx_created` ON `transactions` (`created_at`);