ALTER TABLE "businesses" ADD COLUMN "seeded_account_ids" jsonb;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "opening_balance_date" date;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "financial_year_start" text;