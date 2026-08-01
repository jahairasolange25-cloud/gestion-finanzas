CREATE TABLE `budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`period` text DEFAULT 'monthly' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'expense' NOT NULL,
	`icon` text DEFAULT 'tag' NOT NULL,
	`color` text DEFAULT '#6366f1' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fixed_expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`category_id` text,
	`frequency` text DEFAULT 'monthly' NOT NULL,
	`charge_day` integer DEFAULT 1 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`target_cents` integer NOT NULL,
	`current_cents` integer DEFAULT 0 NOT NULL,
	`icon` text DEFAULT 'piggy-bank' NOT NULL,
	`color` text DEFAULT '#10b981' NOT NULL,
	`deadline` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`category_id` text,
	`concept` text,
	`note` text,
	`date` text NOT NULL,
	`ts` integer NOT NULL,
	`year` integer NOT NULL,
	`month` integer NOT NULL,
	`quarter` integer NOT NULL,
	`semester` integer NOT NULL,
	`week_iso` integer NOT NULL,
	`day` integer NOT NULL,
	`day_of_week` integer NOT NULL,
	`hour` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
