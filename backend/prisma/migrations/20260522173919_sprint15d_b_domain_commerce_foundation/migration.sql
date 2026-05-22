-- CreateEnum
CREATE TYPE "DomainPriceOperation" AS ENUM ('register', 'renew', 'transfer', 'restore');

-- CreateEnum
CREATE TYPE "DomainPriceSource" AS ENUM ('sync', 'manual');

-- CreateEnum
CREATE TYPE "ResellerclubContactType" AS ENUM ('registrant', 'admin', 'tech', 'billing');

-- DropForeignKey
ALTER TABLE "client_notes" DROP CONSTRAINT "client_notes_user_id_fkey";

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_assigned_to_fkey";

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_client_id_fkey";

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_completed_by_fkey";

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "expires_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "support_inside_config" ALTER COLUMN "applicable_product_types" DROP DEFAULT;

-- CreateTable
CREATE TABLE "domain_tld_pricing" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "registrar_slug" VARCHAR(50) NOT NULL,
    "tld" VARCHAR(63) NOT NULL,
    "operation" "DomainPriceOperation" NOT NULL,
    "years" INTEGER NOT NULL,
    "cost_amount" DECIMAL(12,2) NOT NULL,
    "cost_currency" VARCHAR(3) NOT NULL,
    "price_amount" DECIMAL(12,2) NOT NULL,
    "price_currency" VARCHAR(3) NOT NULL,
    "markup_percent" DECIMAL(5,2),
    "source" "DomainPriceSource" NOT NULL DEFAULT 'sync',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "synced_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domain_tld_pricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resellerclub_customers" (
    "user_id" UUID NOT NULL,
    "resellerclub_customer_id" VARCHAR(50) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resellerclub_customers_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "resellerclub_contact_handles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "contact_type" "ResellerclubContactType" NOT NULL,
    "resellerclub_contact_id" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resellerclub_contact_handles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "domain_tld_pricing_tld_operation_active_idx" ON "domain_tld_pricing"("tld", "operation", "active");

-- CreateIndex
CREATE UNIQUE INDEX "domain_tld_pricing_registrar_slug_tld_operation_years_price_key" ON "domain_tld_pricing"("registrar_slug", "tld", "operation", "years", "price_currency");

-- CreateIndex
CREATE UNIQUE INDEX "resellerclub_customers_resellerclub_customer_id_key" ON "resellerclub_customers"("resellerclub_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "resellerclub_contact_handles_user_id_contact_type_key" ON "resellerclub_contact_handles"("user_id", "contact_type");

-- CreateIndex
CREATE INDEX "services_expires_at_idx" ON "services"("expires_at");

-- AddForeignKey
ALTER TABLE "resellerclub_customers" ADD CONSTRAINT "resellerclub_customers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resellerclub_contact_handles" ADD CONSTRAINT "resellerclub_contact_handles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_checklist_completions" ADD CONSTRAINT "task_checklist_completions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_logs" ADD CONSTRAINT "maintenance_logs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
