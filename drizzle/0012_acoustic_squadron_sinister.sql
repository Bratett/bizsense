CREATE TABLE "business_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"allow_negative_stock" boolean DEFAULT false NOT NULL,
	"low_stock_threshold" integer DEFAULT 5 NOT NULL,
	"default_payment_terms_days" integer DEFAULT 0 NOT NULL,
	"default_credit_limit" numeric(15, 2) DEFAULT '0' NOT NULL,
	"invoice_footer_text" text,
	"momo_mtn_number" text,
	"momo_telecel_number" text,
	"momo_airtel_number" text,
	"whatsapp_business_number" text,
	"whatsapp_notify_invoice" boolean DEFAULT false NOT NULL,
	"whatsapp_notify_payment" boolean DEFAULT false NOT NULL,
	"whatsapp_notify_low_stock" boolean DEFAULT false NOT NULL,
	"whatsapp_notify_overdue" boolean DEFAULT false NOT NULL,
	"whatsapp_notify_payroll" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "business_settings_business_id_idx" ON "business_settings" USING btree ("business_id");