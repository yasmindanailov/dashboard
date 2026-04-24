-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "resolution_note" TEXT,
ADD COLUMN     "resolved_by_id" UUID;
