-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('wow_call', 'maintenance', 'maintenance_management', 'custom_work', 'support_setup');

-- CreateEnum
CREATE TYPE "SupportInsideTier" AS ENUM ('basic', 'medium', 'pro');

-- CreateEnum
CREATE TYPE "SiSubscriptionStatus" AS ENUM ('active', 'cancelled', 'suspended');

-- CreateEnum
CREATE TYPE "SlotType" AS ENUM ('maintenance', 'maintenance_and_management');

-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('active', 'cancelled');

-- AlterEnum
ALTER TYPE "TaskStatus" ADD VALUE 'not_completed_in_time';

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "billing_month" VARCHAR(7),
ADD COLUMN     "client_note" TEXT,
ADD COLUMN     "is_recurring" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recurrence_day" INTEGER,
ADD COLUMN     "slot_id" UUID,
ADD COLUMN     "type" "TaskType" NOT NULL DEFAULT 'custom_work';

-- CreateTable
CREATE TABLE "support_inside_subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "tier" "SupportInsideTier" NOT NULL DEFAULT 'basic',
    "status" "SiSubscriptionStatus" NOT NULL DEFAULT 'active',
    "activated_at" TIMESTAMPTZ NOT NULL,
    "cancelled_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_inside_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_inside_slots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "support_inside_subscription_id" UUID NOT NULL,
    "assigned_service_id" UUID NOT NULL,
    "slot_type" "SlotType" NOT NULL DEFAULT 'maintenance',
    "is_included_free" BOOLEAN NOT NULL DEFAULT false,
    "billing_cycle" "BillingCycle",
    "price" DECIMAL(10,2),
    "status" "SlotStatus" NOT NULL DEFAULT 'active',
    "anniversary_day" INTEGER NOT NULL,
    "activated_at" TIMESTAMPTZ NOT NULL,
    "cancelled_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_inside_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_checklist_completions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_id" UUID NOT NULL,
    "checklist_item_id" UUID NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMPTZ,
    "completed_by" UUID,

    CONSTRAINT "task_checklist_completions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "completed_by" UUID NOT NULL,
    "client_notes" TEXT,
    "internal_notes" TEXT,
    "notified_channels" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "support_inside_subscriptions_service_id_key" ON "support_inside_subscriptions"("service_id");

-- CreateIndex
CREATE INDEX "support_inside_subscriptions_user_id_idx" ON "support_inside_subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "support_inside_subscriptions_status_idx" ON "support_inside_subscriptions"("status");

-- CreateIndex
CREATE INDEX "support_inside_slots_support_inside_subscription_id_idx" ON "support_inside_slots"("support_inside_subscription_id");

-- CreateIndex
CREATE INDEX "support_inside_slots_assigned_service_id_idx" ON "support_inside_slots"("assigned_service_id");

-- CreateIndex
CREATE INDEX "support_inside_slots_anniversary_day_idx" ON "support_inside_slots"("anniversary_day");

-- CreateIndex
CREATE UNIQUE INDEX "task_checklist_completions_task_id_checklist_item_id_key" ON "task_checklist_completions"("task_id", "checklist_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_logs_task_id_key" ON "maintenance_logs"("task_id");

-- CreateIndex
CREATE INDEX "tasks_due_date_idx" ON "tasks"("due_date");

-- CreateIndex
CREATE INDEX "tasks_billing_month_idx" ON "tasks"("billing_month");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "support_inside_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_inside_slots" ADD CONSTRAINT "support_inside_slots_support_inside_subscription_id_fkey" FOREIGN KEY ("support_inside_subscription_id") REFERENCES "support_inside_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_checklist_completions" ADD CONSTRAINT "task_checklist_completions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_checklist_completions" ADD CONSTRAINT "task_checklist_completions_checklist_item_id_fkey" FOREIGN KEY ("checklist_item_id") REFERENCES "product_checklist_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_logs" ADD CONSTRAINT "maintenance_logs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
