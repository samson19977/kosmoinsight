CREATE TABLE "rw_cells" (
	"id" serial PRIMARY KEY NOT NULL,
	"sector_id" integer NOT NULL,
	"name" varchar(100) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rw_districts" (
	"id" serial PRIMARY KEY NOT NULL,
	"province" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	CONSTRAINT "rw_districts_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "rw_sectors" (
	"id" serial PRIMARY KEY NOT NULL,
	"district_id" integer NOT NULL,
	"name" varchar(100) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rw_villages" (
	"id" serial PRIMARY KEY NOT NULL,
	"cell_id" integer NOT NULL,
	"name" varchar(100) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rw_cells" ADD CONSTRAINT "rw_cells_sector_id_rw_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."rw_sectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rw_sectors" ADD CONSTRAINT "rw_sectors_district_id_rw_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."rw_districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rw_villages" ADD CONSTRAINT "rw_villages_cell_id_rw_cells_id_fk" FOREIGN KEY ("cell_id") REFERENCES "public"."rw_cells"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agents_status_idx" ON "agents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agents_national_id_hash_idx" ON "agents" USING btree ("national_id_hash");--> statement-breakpoint
CREATE INDEX "customers_national_id_hash_idx" ON "customers" USING btree ("national_id_hash");--> statement-breakpoint
CREATE INDEX "customers_agent_id_idx" ON "customers" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "installments_status_idx" ON "installments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "installments_due_date_idx" ON "installments" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "installments_loan_id_idx" ON "installments" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "loans_status_idx" ON "loans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "loans_customer_id_idx" ON "loans" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "orders_order_status_idx" ON "orders" USING btree ("order_status");--> statement-breakpoint
CREATE INDEX "orders_payment_status_idx" ON "orders" USING btree ("payment_status");--> statement-breakpoint
CREATE INDEX "orders_customer_id_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "orders_agent_id_idx" ON "orders" USING btree ("agent_id");