-- Sprint 8 Fase A — schemas para checklist + mantenimiento + vinculación de notas estructuradas a tasks.
-- Plan canónico: docs/60-roadmap/current.md §3.4 + ADR-061 (Support Inside).

-- CreateEnum
CREATE TYPE "ChecklistItemKind" AS ENUM ('product', 'service');

-- AlterTable: client_notes.task_id FK opcional → tasks(id) ON DELETE SET NULL
ALTER TABLE "client_notes" ADD COLUMN "task_id" UUID;

-- CreateTable: task_checklist_completions
CREATE TABLE "task_checklist_completions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "item_kind" "ChecklistItemKind" NOT NULL,
    "completed_by" UUID NOT NULL,
    "completed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "task_checklist_completions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: maintenance_logs
CREATE TABLE "maintenance_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "month_year" VARCHAR(7) NOT NULL,
    "notes" TEXT NOT NULL,
    "performed_by" UUID NOT NULL,
    "performed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "maintenance_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: service_checklist_items (snapshot de product_checklist_items al provisionar)
CREATE TABLE "service_checklist_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "service_id" UUID NOT NULL,
    "item_template_id" UUID,
    "label" VARCHAR(300) NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_notes_task_id_idx" ON "client_notes"("task_id");

-- CreateIndex
CREATE INDEX "task_checklist_completions_task_id_idx" ON "task_checklist_completions"("task_id");

-- CreateIndex
CREATE INDEX "task_checklist_completions_item_id_item_kind_idx" ON "task_checklist_completions"("item_id", "item_kind");

-- CreateIndex
CREATE UNIQUE INDEX "task_checklist_completions_uniq" ON "task_checklist_completions"("task_id", "item_id", "item_kind");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_logs_task_id_key" ON "maintenance_logs"("task_id");

-- CreateIndex
CREATE INDEX "maintenance_logs_service_id_idx" ON "maintenance_logs"("service_id");

-- CreateIndex
CREATE INDEX "maintenance_logs_month_year_idx" ON "maintenance_logs"("month_year");

-- CreateIndex
CREATE INDEX "maintenance_logs_client_id_idx" ON "maintenance_logs"("client_id");

-- CreateIndex
CREATE INDEX "service_checklist_items_service_id_idx" ON "service_checklist_items"("service_id");

-- CreateIndex (UNIQUE compuesto en tasks para idempotencia de mantenimiento mensual — EC-T8-02)
CREATE UNIQUE INDEX "tasks_uniq_maintenance_per_month" ON "tasks"("service_id", "billing_month", "type");

-- AddForeignKey: client_notes.task_id → tasks(id) ON DELETE SET NULL
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: tasks.service_id → services(id) ON DELETE SET NULL
-- Sprint 5 dejó tasks.service_id sin FK declarada en Prisma; el schema ahora la formaliza.
-- Nota: si la FK ya existe en la BD por una migración previa, este ALTER falla; en ese caso, comentar.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'tasks' AND constraint_name = 'tasks_service_id_fkey'
  ) THEN
    ALTER TABLE "tasks" ADD CONSTRAINT "tasks_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey: task_checklist_completions
ALTER TABLE "task_checklist_completions" ADD CONSTRAINT "task_checklist_completions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_checklist_completions" ADD CONSTRAINT "task_checklist_completions_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey: maintenance_logs
ALTER TABLE "maintenance_logs" ADD CONSTRAINT "maintenance_logs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "maintenance_logs" ADD CONSTRAINT "maintenance_logs_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "maintenance_logs" ADD CONSTRAINT "maintenance_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "maintenance_logs" ADD CONSTRAINT "maintenance_logs_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey: service_checklist_items
ALTER TABLE "service_checklist_items" ADD CONSTRAINT "service_checklist_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
