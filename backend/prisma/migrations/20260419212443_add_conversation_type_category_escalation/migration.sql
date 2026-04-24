-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('chat', 'ticket');

-- CreateEnum
CREATE TYPE "ConversationCategory" AS ENUM ('support_general', 'support_billing', 'support_technical', 'wdify_progress', 'wdify_feedback', 'escalated_chat');

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "category" "ConversationCategory",
ADD COLUMN     "escalated_from_id" UUID,
ADD COLUMN     "type" "ConversationType" NOT NULL DEFAULT 'chat';

-- CreateIndex
CREATE INDEX "conversations_type_idx" ON "conversations"("type");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_escalated_from_id_fkey" FOREIGN KEY ("escalated_from_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
