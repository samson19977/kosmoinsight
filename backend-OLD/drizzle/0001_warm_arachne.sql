ALTER TABLE "agents" ALTER COLUMN "national_id" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "national_id" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "national_id_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "national_id_hash" varchar(64);