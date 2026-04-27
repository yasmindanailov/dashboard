-- DropIndex
DROP INDEX "event_outbox_status_idx";

-- AlterTable
ALTER TABLE "event_outbox" ADD COLUMN     "next_retry_at" TIMESTAMPTZ;

-- CreateIndex
CREATE INDEX "event_outbox_status_next_retry_at_idx" ON "event_outbox"("status", "next_retry_at");
