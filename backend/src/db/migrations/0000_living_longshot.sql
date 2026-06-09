CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('whatsapp', 'sms', 'email', 'rcs');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('queued', 'sent', 'delivered', 'opened', 'clicked', 'failed');--> statement-breakpoint
CREATE TABLE "campaign_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" text NOT NULL,
	"campaign_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"personalized_message" text NOT NULL,
	"channel" "channel" NOT NULL,
	"status" "delivery_status" DEFAULT 'queued' NOT NULL,
	"failure_reason" text,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"clicked_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"channel" "channel" NOT NULL,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"segment_definition_id" uuid,
	"segment_rules_snapshot" jsonb,
	"message_template" text NOT NULL,
	"total_audience_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"city" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"items" jsonb,
	"attributed_campaign_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "segment_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"rules" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_deliveries" ADD CONSTRAINT "campaign_deliveries_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_deliveries" ADD CONSTRAINT "campaign_deliveries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_segment_definition_id_segment_definitions_id_fk" FOREIGN KEY ("segment_definition_id") REFERENCES "public"."segment_definitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_attributed_campaign_id_campaigns_id_fk" FOREIGN KEY ("attributed_campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_deliveries_message_id_idx" ON "campaign_deliveries" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_deliveries_campaign_customer_idx" ON "campaign_deliveries" USING btree ("campaign_id","customer_id");--> statement-breakpoint
CREATE INDEX "campaign_deliveries_campaign_id_idx" ON "campaign_deliveries" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_deliveries_customer_id_idx" ON "campaign_deliveries" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "campaign_deliveries_status_idx" ON "campaign_deliveries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "campaigns_status_idx" ON "campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "campaigns_segment_definition_id_idx" ON "campaigns" USING btree ("segment_definition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_email_idx" ON "customers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "customers_city_idx" ON "customers" USING btree ("city");--> statement-breakpoint
CREATE INDEX "orders_customer_id_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "orders_attributed_campaign_id_idx" ON "orders" USING btree ("attributed_campaign_id");