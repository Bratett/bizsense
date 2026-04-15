CREATE TABLE "paye_bands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"lower_bound" numeric(15, 2) NOT NULL,
	"upper_bound" numeric(15, 2),
	"rate" numeric(7, 6) NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "momo_reconciliation_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"snapshot_date" text NOT NULL,
	"lines" text NOT NULL,
	"total_book_balance" numeric(15, 2) NOT NULL,
	"total_actual_balance" numeric(15, 2) NOT NULL,
	"net_variance" numeric(15, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payroll_lines" ADD COLUMN "is_paid" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_lines" ADD COLUMN "paid_at" timestamp;--> statement-breakpoint
ALTER TABLE "payroll_lines" ADD COLUMN "payment_journal_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "paye_bands" ADD CONSTRAINT "paye_bands_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "momo_reconciliation_snapshots" ADD CONSTRAINT "momo_reconciliation_snapshots_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_payment_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("payment_journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;