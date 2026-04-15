CREATE TABLE "hubtel_payment_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"client_reference" text NOT NULL,
	"hubtel_checkout_id" text,
	"checkout_url" text,
	"amount" numeric(15, 2) NOT NULL,
	"currency" text DEFAULT 'GHS' NOT NULL,
	"customer_phone" text,
	"customer_name" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp,
	"paid_at" timestamp,
	"momo_network" text,
	"momo_reference" text,
	"result_payment_received" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hubtel_payment_links_client_reference_unique" UNIQUE("client_reference")
);
--> statement-breakpoint
CREATE TABLE "hubtel_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_reference" text NOT NULL,
	"raw_payload" text NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"processed_at" timestamp,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hubtel_webhook_events_client_reference_unique" UNIQUE("client_reference")
);
--> statement-breakpoint
ALTER TABLE "hubtel_payment_links" ADD CONSTRAINT "hubtel_payment_links_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hubtel_payment_links" ADD CONSTRAINT "hubtel_payment_links_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hubtel_payment_links" ADD CONSTRAINT "hubtel_payment_links_result_payment_received_payments_received_id_fk" FOREIGN KEY ("result_payment_received") REFERENCES "public"."payments_received"("id") ON DELETE no action ON UPDATE no action;