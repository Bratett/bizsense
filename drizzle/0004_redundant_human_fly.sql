ALTER TABLE "expenses" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "approval_status" text DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "approved_by" uuid;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "is_capital_expense" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;