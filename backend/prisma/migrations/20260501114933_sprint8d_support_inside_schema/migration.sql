-- CreateEnum
CREATE TYPE "SupportInsideSlotType" AS ENUM ('maintenance', 'maintenance_management');

-- CreateEnum
CREATE TYPE "SupportInsideSubscriptionStatus" AS ENUM ('active', 'cancelled', 'paused');

-- CreateEnum
CREATE TYPE "SupportInsideChannel" AS ENUM ('webchat', 'email', 'phone', 'whatsapp');

-- CreateEnum
CREATE TYPE "SupportInsidePriorityTier" AS ENUM ('standard', 'high', 'max');

-- CreateEnum
CREATE TYPE "SupportInsideCtaVisibility" AS ENUM ('hidden', 'catalog_banner', 'landing_cta');

-- DropForeignKey
ALTER TABLE "maintenance_logs" DROP CONSTRAINT "maintenance_logs_client_id_fkey";

-- DropForeignKey
ALTER TABLE "maintenance_logs" DROP CONSTRAINT "maintenance_logs_performed_by_fkey";

-- DropForeignKey
ALTER TABLE "task_checklist_completions" DROP CONSTRAINT "task_checklist_completions_completed_by_fkey";

-- DropForeignKey
ALTER TABLE "task_tag_assignments" DROP CONSTRAINT "task_tag_assignments_tag_id_fkey";

-- DropForeignKey
ALTER TABLE "task_tag_assignments" DROP CONSTRAINT "task_tag_assignments_task_id_fkey";

-- DropForeignKey
ALTER TABLE "task_tags" DROP CONSTRAINT "task_tags_created_by_fkey";

-- CreateTable
CREATE TABLE "support_inside_config" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "slots_included" INTEGER NOT NULL DEFAULT 0,
    "slot_types_allowed" "SupportInsideSlotType"[],
    "extra_slot_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "channels_active" "SupportInsideChannel"[],
    "priority_tier" "SupportInsidePriorityTier" NOT NULL DEFAULT 'standard',
    "response_sla_hours" INTEGER NOT NULL DEFAULT 24,
    "cta_visibility" "SupportInsideCtaVisibility" NOT NULL DEFAULT 'hidden',
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_inside_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_inside_subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "status" "SupportInsideSubscriptionStatus" NOT NULL DEFAULT 'active',
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMPTZ,
    "cancellation_reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_inside_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_inside_slots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subscription_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "slot_type" "SupportInsideSlotType" NOT NULL,
    "is_extra" BOOLEAN NOT NULL DEFAULT false,
    "extra_pricing_id" UUID,
    "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMPTZ,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_inside_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "support_inside_config_product_id_key" ON "support_inside_config"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "support_inside_subscriptions_client_id_key" ON "support_inside_subscriptions"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "support_inside_subscriptions_service_id_key" ON "support_inside_subscriptions"("service_id");

-- CreateIndex
CREATE INDEX "support_inside_subscriptions_client_id_idx" ON "support_inside_subscriptions"("client_id");

-- CreateIndex
CREATE INDEX "support_inside_subscriptions_product_id_idx" ON "support_inside_subscriptions"("product_id");

-- CreateIndex
CREATE INDEX "support_inside_subscriptions_status_idx" ON "support_inside_subscriptions"("status");

-- CreateIndex
CREATE INDEX "support_inside_slots_subscription_id_idx" ON "support_inside_slots"("subscription_id");

-- CreateIndex
CREATE INDEX "support_inside_slots_service_id_idx" ON "support_inside_slots"("service_id");

-- CreateIndex
CREATE INDEX "support_inside_slots_released_at_idx" ON "support_inside_slots"("released_at");

-- AddForeignKey
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_tag_assignments" ADD CONSTRAINT "task_tag_assignments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_tag_assignments" ADD CONSTRAINT "task_tag_assignments_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "task_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_checklist_completions" ADD CONSTRAINT "task_checklist_completions_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_logs" ADD CONSTRAINT "maintenance_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_logs" ADD CONSTRAINT "maintenance_logs_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_inside_config" ADD CONSTRAINT "support_inside_config_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_inside_subscriptions" ADD CONSTRAINT "support_inside_subscriptions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_inside_subscriptions" ADD CONSTRAINT "support_inside_subscriptions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_inside_subscriptions" ADD CONSTRAINT "support_inside_subscriptions_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_inside_slots" ADD CONSTRAINT "support_inside_slots_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "support_inside_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_inside_slots" ADD CONSTRAINT "support_inside_slots_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
