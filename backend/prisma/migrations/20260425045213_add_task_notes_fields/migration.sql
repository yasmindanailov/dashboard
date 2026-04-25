-- AlterTable
ALTER TABLE "client_notes" ADD COLUMN     "task_id" UUID;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "internal_notes" TEXT,
ALTER COLUMN "type" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "client_notes_task_id_idx" ON "client_notes"("task_id");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
