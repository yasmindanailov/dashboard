-- Sprint 8: Align Task model with DATABASE_SCHEMA.md
-- Ref: DECISIONS.md §10, DATABASE_SCHEMA.md tasks table

-- CreateEnum: TaskType
CREATE TYPE "TaskType" AS ENUM ('wow_call', 'maintenance', 'maintenance_management', 'project_task', 'custom_work', 'support_setup');

-- AlterEnum: TaskStatus — add not_completed_in_time
ALTER TYPE "TaskStatus" ADD VALUE 'not_completed_in_time';

-- AlterEnum: TaskPriority — rename normal→medium, urgent→critical
ALTER TYPE "TaskPriority" RENAME VALUE 'normal' TO 'medium';
ALTER TYPE "TaskPriority" RENAME VALUE 'urgent' TO 'critical';

-- AlterTable: tasks — add new columns
ALTER TABLE "tasks" ADD COLUMN "type" "TaskType" NOT NULL DEFAULT 'custom_work';
ALTER TABLE "tasks" ADD COLUMN "client_note" TEXT;
ALTER TABLE "tasks" ADD COLUMN "is_recurring" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tasks" ADD COLUMN "recurrence_day" INTEGER;
ALTER TABLE "tasks" ADD COLUMN "billing_month" VARCHAR(7);

-- Rename user_id → client_id (semantic alignment with DECISIONS.md §10)
ALTER TABLE "tasks" RENAME COLUMN "user_id" TO "client_id";

-- Make client_id NOT NULL (every task belongs to a client)
-- First set any NULL values to the created_by user (fallback)
UPDATE "tasks" SET "client_id" = "created_by" WHERE "client_id" IS NULL;
ALTER TABLE "tasks" ALTER COLUMN "client_id" SET NOT NULL;

-- Drop old tags column (replaced by type enum + metadata jsonb)
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "tags";

-- CreateIndex: due_date and billing_month for query performance
CREATE INDEX "tasks_due_date_idx" ON "tasks"("due_date");
CREATE INDEX "tasks_billing_month_idx" ON "tasks"("billing_month");

-- Rename existing index from user_id to client_id
DROP INDEX IF EXISTS "tasks_user_id_idx";
CREATE INDEX "tasks_client_id_idx" ON "tasks"("client_id");

-- AddForeignKey: Task → User relations
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
