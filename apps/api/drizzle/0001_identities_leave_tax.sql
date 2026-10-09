CREATE TABLE "identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"display_name" text,
	"password_hash" text NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identities_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "leave_balances" (
	"organization_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"carried_forward" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "leave_balances_employee_id_year_pk" PRIMARY KEY("employee_id","year")
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"type" text NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"days" integer NOT NULL,
	"reason" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_declarations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"tax_year" integer NOT NULL,
	"data" jsonb NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_by" text,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
-- Every existing account becomes an identity with one membership (same id).
INSERT INTO "identities" ("id", "username", "display_name", "password_hash", "must_change_password", "created_at")
SELECT "id", "username", "display_name", "password_hash", "must_change_password", "created_at" FROM "app_users";--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "identity_id" uuid;--> statement-breakpoint
UPDATE "app_users" SET "identity_id" = "id";--> statement-breakpoint
ALTER TABLE "app_users" ALTER COLUMN "identity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_declarations" ADD CONSTRAINT "tax_declarations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_declarations" ADD CONSTRAINT "tax_declarations_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leave_requests_org_idx" ON "leave_requests" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "leave_requests_employee_idx" ON "leave_requests" USING btree ("employee_id","from_date");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_declarations_year_unique" ON "tax_declarations" USING btree ("employee_id","tax_year");--> statement-breakpoint
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_users_membership_unique" ON "app_users" USING btree ("organization_id","identity_id");--> statement-breakpoint
-- Old-regime deduction totals become 2026-27 declarations before the column goes.
INSERT INTO "tax_declarations" ("organization_id", "employee_id", "tax_year", "data")
SELECT "organization_id", "id", 2026, jsonb_build_object(
  'monthlyRent', 0, 'rentCity', null, 'landlordPan', null, 'landlordRelation', null,
  'section123', "old_regime_annual_deductions", 'npsAdditional', 0, 'healthSelf', 0, 'healthParents', 0,
  'parentsSenior', false, 'homeLoanInterest', 0)
FROM "employees" WHERE "old_regime_annual_deductions" > 0;--> statement-breakpoint
ALTER TABLE "employees" DROP COLUMN "old_regime_annual_deductions";--> statement-breakpoint
ALTER TABLE "employees" DROP COLUMN "leave_balance_days";--> statement-breakpoint
ALTER TABLE "employees" DROP COLUMN "leave_taken_days";