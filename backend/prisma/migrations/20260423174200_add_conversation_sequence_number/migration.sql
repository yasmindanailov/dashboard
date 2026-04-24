-- Add sequence_number column to conversations (for ticket identification TK-00001)
ALTER TABLE "conversations" ADD COLUMN "sequence_number" INTEGER;

-- Create unique index on sequence_number
CREATE UNIQUE INDEX "conversations_sequence_number_key" ON "conversations"("sequence_number");

-- Create PostgreSQL SEQUENCE for auto-incrementing ticket numbers
CREATE SEQUENCE IF NOT EXISTS conversation_ticket_seq START WITH 1 INCREMENT BY 1;

-- Backfill existing tickets with sequence numbers
UPDATE "conversations"
SET "sequence_number" = subq.row_num
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS row_num
  FROM "conversations"
  WHERE type = 'ticket'
) AS subq
WHERE "conversations".id = subq.id;

-- Update sequence to start after the last backfilled number
SELECT setval('conversation_ticket_seq', COALESCE((SELECT MAX(sequence_number) FROM "conversations"), 0));
