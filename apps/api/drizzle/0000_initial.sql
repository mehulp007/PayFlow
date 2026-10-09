CREATE TABLE "app_meta" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"role" text NOT NULL,
	"employee_id" text,
	"password_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"built_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_id" text,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"branch" text NOT NULL,
	"state" text NOT NULL,
	"pay_group" text DEFAULT 'General' NOT NULL,
	"join_date" date NOT NULL,
	"date_of_birth" date NOT NULL,
	"gender" text,
	"bank_account_last4" text,
	"bank_ready" boolean DEFAULT false NOT NULL,
	"monthly_basic" bigint NOT NULL,
	"monthly_hra" bigint NOT NULL,
	"monthly_special" bigint NOT NULL,
	"tax_regime" text DEFAULT 'new' NOT NULL,
	"old_regime_annual_deductions" bigint DEFAULT 0 NOT NULL,
	"annual_other_income" bigint DEFAULT 0 NOT NULL,
	"annual_prior_employer_taxable_salary" bigint DEFAULT 0 NOT NULL,
	"tax_already_deducted" bigint DEFAULT 0 NOT NULL,
	"pf_member" boolean DEFAULT true NOT NULL,
	"pf_on_actual_wages" boolean DEFAULT false NOT NULL,
	"eps_member" boolean DEFAULT false NOT NULL,
	"esi_member" boolean DEFAULT false NOT NULL,
	"employment_type" text NOT NULL,
	"position_level" integer NOT NULL,
	"job_title" text NOT NULL,
	"department" text NOT NULL,
	"manager_id" text,
	"work_email" text,
	"phone" text,
	"employment_status" text DEFAULT 'active' NOT NULL,
	"payroll_scope" boolean DEFAULT true NOT NULL,
	"leave_balance_days" integer DEFAULT 0 NOT NULL,
	"leave_taken_days" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_inputs" (
	"run_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"variable_pay" bigint DEFAULT 0 NOT NULL,
	"other_deduction" bigint DEFAULT 0 NOT NULL,
	"unpaid_days" integer DEFAULT 0 NOT NULL,
	"working_days" integer DEFAULT 30 NOT NULL,
	"note" text,
	CONSTRAINT "payroll_inputs_run_id_employee_id_pk" PRIMARY KEY("run_id","employee_id")
);
--> statement-breakpoint
CREATE TABLE "payroll_lines" (
	"run_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"gross" bigint NOT NULL,
	"deductions" bigint NOT NULL,
	"net" bigint NOT NULL,
	"employer_cost" bigint NOT NULL,
	"blocking_flags" integer DEFAULT 0 NOT NULL,
	"warning_flags" integer DEFAULT 0 NOT NULL,
	"result" jsonb NOT NULL,
	CONSTRAINT "payroll_lines_run_id_employee_id_pk" PRIMARY KEY("run_id","employee_id")
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"payment_date" date NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"prepared_by" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_inputs" ADD CONSTRAINT "payroll_inputs_run_id_payroll_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_inputs" ADD CONSTRAINT "payroll_inputs_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_run_id_payroll_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_employee_account" ON "app_users" USING btree ("employee_id") WHERE "app_users"."role" = 'employee' AND "app_users"."active" = true AND "app_users"."employee_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "audit_events_run_idx" ON "audit_events" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "employees_hierarchy_idx" ON "employees" USING btree ("employment_type","position_level","department");--> statement-breakpoint
CREATE INDEX "employees_manager_idx" ON "employees" USING btree ("manager_id");