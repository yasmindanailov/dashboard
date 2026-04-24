-- ═══════════════════════════════════════
-- Migration: Add guest chat fields
-- Sprint: 7.4.1 — Guest token generation
-- ═══════════════════════════════════════
-- 
-- Adds guest_name and guest_email fields to conversations table
-- for anonymous chat support from the landing page.
--
-- guest_name: displayed in chat bubbles (required for guest chats)
-- guest_email: optional, enables automatic account linking (7.5.1)
--
-- Also adds indexes for efficient lookup:
--   - guest_email: for linking by email when user registers
--   - guest_session_hash: for token-based conversation lookup
--
-- Ref: ROADMAP.md 7.4.1, DATABASE_SCHEMA.md, DECISIONS.md §38

-- Add guest identification fields
ALTER TABLE "conversations" ADD COLUMN "guest_name" VARCHAR(200);
ALTER TABLE "conversations" ADD COLUMN "guest_email" VARCHAR(255);

-- Add indexes for guest lookup and linking
CREATE INDEX "conversations_guest_email_idx" ON "conversations"("guest_email");
CREATE INDEX "conversations_guest_session_hash_idx" ON "conversations"("guest_session_hash");
