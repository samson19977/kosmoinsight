CREATE TABLE "admin_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_id" integer,
	"action" varchar(60) NOT NULL,
	"target_type" varchar(30) NOT NULL,
	"target_id" integer NOT NULL,
	"details" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "admins" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"email" varchar(100) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"role" varchar(30) DEFAULT 'admin',
	"is_active" boolean DEFAULT true,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "agent_commissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" integer NOT NULL,
	"order_id" integer,
	"loan_id" integer,
	"sale_amount_rwf" integer NOT NULL,
	"commission_rate_bps" integer NOT NULL,
	"commission_rwf" integer NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp,
	"note" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"code" varchar(50) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"email" varchar(100),
	"password_hash" varchar(255),
	"national_id" varchar(20),
	"district" varchar(100),
	"sector" varchar(100),
	"cell" varchar(100),
	"village" varchar(100),
	"region" varchar(50),
	"commission_rate_bps" integer DEFAULT 1500 NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"source" varchar(30) DEFAULT 'admin',
	"notes" text,
	"approved_at" timestamp,
	"approved_by_admin_id" integer,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "agents_code_unique" UNIQUE("code"),
	CONSTRAINT "agents_phone_unique" UNIQUE("phone"),
	CONSTRAINT "agents_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"first_name" varchar(50) NOT NULL,
	"last_name" varchar(50) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"email" varchar(100),
	"district" varchar(100),
	"sector" varchar(100),
	"cell" varchar(100),
	"village" varchar(100),
	"national_id" varchar(20),
	"agent_id" integer,
	"acquisition_channel" varchar(50),
	"acquisition_cost_rwf" integer,
	"source" varchar(30) DEFAULT 'order',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "installments" (
	"id" serial PRIMARY KEY NOT NULL,
	"loan_id" integer NOT NULL,
	"installment_number" integer NOT NULL,
	"due_date" timestamp NOT NULL,
	"amount_due_rwf" integer NOT NULL,
	"amount_paid_rwf" integer DEFAULT 0,
	"penalty_rwf" integer DEFAULT 0,
	"status" varchar(20) DEFAULT 'upcoming',
	"paid_at" timestamp,
	"reminder_sent_at" timestamp,
	"overdue_alert_sent_at" timestamp,
	"pending_momo_reference_id" varchar(100),
	"pending_momo_amount_rwf" integer,
	"pending_momo_phone" varchar(20),
	"pending_momo_initiated_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_type" varchar(20) NOT NULL,
	"account_id" integer,
	"amount_rwf" integer NOT NULL,
	"category" varchar(40) NOT NULL,
	"reference_type" varchar(30),
	"reference_id" integer,
	"description" text NOT NULL,
	"created_by_admin_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "loan_agreements" (
	"id" serial PRIMARY KEY NOT NULL,
	"loan_id" integer NOT NULL,
	"order_id" integer,
	"customer_id" integer NOT NULL,
	"agent_id" integer,
	"terms_version" varchar(20) DEFAULT 'v1' NOT NULL,
	"accepted_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" varchar(64),
	"user_agent" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "loan_agreements_loan_id_unique" UNIQUE("loan_id")
);
--> statement-breakpoint
CREATE TABLE "loan_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"loan_id" integer NOT NULL,
	"installment_id" integer,
	"type" varchar(20) NOT NULL,
	"amount_rwf" integer NOT NULL,
	"method" varchar(30),
	"phone" varchar(20),
	"momo_transaction_id" varchar(100),
	"admin_id" integer,
	"note" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "loans" (
	"id" serial PRIMARY KEY NOT NULL,
	"loan_number" varchar(50) NOT NULL,
	"order_id" integer,
	"customer_id" integer NOT NULL,
	"principal_rwf" integer NOT NULL,
	"down_payment_rwf" integer DEFAULT 0,
	"interest_rate_bps" integer DEFAULT 0,
	"term_months" integer NOT NULL,
	"total_payable_rwf" integer NOT NULL,
	"status" varchar(20) DEFAULT 'active',
	"guarantor_type" varchar(20) DEFAULT 'none',
	"guarantor_name" varchar(100),
	"guarantor_phone" varchar(20),
	"disbursed_at" timestamp DEFAULT now(),
	"expected_payoff_date" timestamp,
	"completed_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "loans_loan_number_unique" UNIQUE("loan_number")
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"product_id" integer,
	"product_name" varchar(100) NOT NULL,
	"quantity" integer NOT NULL,
	"price_rwf" integer NOT NULL,
	"subtotal_rwf" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_number" varchar(50) NOT NULL,
	"customer_id" integer,
	"customer_name" varchar(100) NOT NULL,
	"customer_email" varchar(100),
	"customer_phone" varchar(20) NOT NULL,
	"total_rwf" integer NOT NULL,
	"payment_method" varchar(50) NOT NULL,
	"order_status" varchar(30) DEFAULT 'pending',
	"payment_status" varchar(30) DEFAULT 'pending',
	"momo_reference" varchar(100),
	"agent_id" integer,
	"channel" varchar(20) DEFAULT 'web',
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"order_number" varchar(50) NOT NULL,
	"amount_rwf" integer NOT NULL,
	"payment_method" varchar(50) NOT NULL,
	"phone" varchar(20),
	"momo_transaction_id" varchar(100),
	"momo_reference" varchar(100),
	"status" varchar(30) DEFAULT 'pending',
	"notes" text,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"price_rwf" integer NOT NULL,
	"package_type" varchar(50) NOT NULL,
	"image_url" varchar(255),
	"stock" integer DEFAULT 9999,
	"low_stock_threshold" integer DEFAULT 10,
	"is_active" boolean DEFAULT true,
	"installment_eligible" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"change_qty" integer NOT NULL,
	"reason" varchar(100) NOT NULL,
	"order_id" integer,
	"admin_id" integer,
	"note" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_approved_by_admin_id_admins_id_fk" FOREIGN KEY ("approved_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installments" ADD CONSTRAINT "installments_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_created_by_admin_id_admins_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_agreements" ADD CONSTRAINT "loan_agreements_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_agreements" ADD CONSTRAINT "loan_agreements_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_agreements" ADD CONSTRAINT "loan_agreements_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_agreements" ADD CONSTRAINT "loan_agreements_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_transactions" ADD CONSTRAINT "loan_transactions_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_transactions" ADD CONSTRAINT "loan_transactions_installment_id_installments_id_fk" FOREIGN KEY ("installment_id") REFERENCES "public"."installments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_transactions" ADD CONSTRAINT "loan_transactions_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;