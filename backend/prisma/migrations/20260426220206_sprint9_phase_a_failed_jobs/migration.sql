/*
  Warnings:

  - You are about to drop the column `task_id` on the `client_notes` table. All the data in the column will be lost.
  - You are about to drop the column `internal_notes` on the `tasks` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "FailedJobStatus" AS ENUM ('failed', 'retrying', 'resolved');

-- DropIndex
DROP INDEX "client_notes_task_id_idx";

-- AlterTable
ALTER TABLE "client_notes" DROP COLUMN "task_id";

-- AlterTable
ALTER TABLE "tasks" DROP COLUMN "internal_notes";

-- CreateTable
CREATE TABLE "failed_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bull_job_id" VARCHAR(200) NOT NULL,
    "queue" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "payload" JSONB NOT NULL,
    "last_error" TEXT NOT NULL,
    "stack_trace" TEXT,
    "attempts_made" INTEGER NOT NULL,
    "retried_at" TIMESTAMPTZ,
    "retried_by" UUID,
    "status" "FailedJobStatus" NOT NULL DEFAULT 'failed',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "failed_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "failed_jobs_queue_status_idx" ON "failed_jobs"("queue", "status");

-- CreateIndex
CREATE INDEX "failed_jobs_created_at_idx" ON "failed_jobs"("created_at");
