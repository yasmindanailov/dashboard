-- CreateEnum
CREATE TYPE "AccountDeletionStatus" AS ENUM ('pending', 'rejected', 'completed', 'cancelled');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "anonymized_at" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE "account_deletion_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "status" "AccountDeletionStatus" NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "requested_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ,
    "reviewed_by_id" UUID,
    "review_note" TEXT,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "account_deletion_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "account_deletion_requests_user_id_idx" ON "account_deletion_requests"("user_id");

-- CreateIndex
CREATE INDEX "account_deletion_requests_status_idx" ON "account_deletion_requests"("status");

-- AddForeignKey
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
