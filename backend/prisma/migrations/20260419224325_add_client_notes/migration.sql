-- CreateEnum
CREATE TYPE "NoteCategory" AS ENUM ('conversation', 'solution', 'billing', 'technical', 'general');

-- CreateTable
CREATE TABLE "client_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "conversation_id" UUID,
    "category" "NoteCategory" NOT NULL DEFAULT 'conversation',
    "body" TEXT NOT NULL,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_notes_user_id_idx" ON "client_notes"("user_id");

-- CreateIndex
CREATE INDEX "client_notes_conversation_id_idx" ON "client_notes"("conversation_id");
