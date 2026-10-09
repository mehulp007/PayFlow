ALTER TABLE "app_users" DROP CONSTRAINT "app_users_username_unique";--> statement-breakpoint
ALTER TABLE "app_users" DROP COLUMN "username";--> statement-breakpoint
ALTER TABLE "app_users" DROP COLUMN "display_name";--> statement-breakpoint
ALTER TABLE "app_users" DROP COLUMN "password_hash";--> statement-breakpoint
ALTER TABLE "app_users" DROP COLUMN "must_change_password";