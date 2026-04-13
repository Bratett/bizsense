ALTER TABLE "pending_ai_actions" ADD COLUMN "reversed_at" timestamp;--> statement-breakpoint
ALTER TABLE "pending_ai_actions" ADD COLUMN "reversed_by" uuid REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_ai_actions" ADD COLUMN "reversal_reason" text;
