-- Sprint 16 Fase 16.B (2026-05-02) — ADR-079.
-- Tasks como bridge unidireccional read-only + consolidación notas con source tracking.
-- Migración Opción B (drop + reseed) — pre-producción permite refactor limpio (ADR-069).

-- ════════════════════════════════════════════════════════════════════════════
-- 1. CLIENT NOTES — drop schema viejo + recrear canónico
-- ════════════════════════════════════════════════════════════════════════════
-- El schema previo tenía conversation_id + task_id directos + 5 categorías
-- (conversation/solution/billing/technical/general). Pasa a polimórfico
-- (`source_system` + `source_id`) + 7 categorías canónicas + acción gatillo.

DROP TABLE IF EXISTS "client_notes" CASCADE;
DROP TYPE IF EXISTS "NoteCategory";

CREATE TYPE "NoteCategory" AS ENUM (
  'support',
  'maintenance',
  'onboarding',
  'billing',
  'project',
  'technical_incident',
  'exceptional'
);

CREATE TYPE "NoteSourceSystem" AS ENUM (
  'ticket',
  'chat',
  'maintenance_log',
  'task_completion',
  'exceptional'
);

CREATE TABLE "client_notes" (
  "id"                  uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"             uuid               NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "author_id"           uuid               NOT NULL REFERENCES "users"("id"),
  "category"            "NoteCategory"     NOT NULL,
  "body"                text               NOT NULL,
  "source_system"       "NoteSourceSystem" NOT NULL,
  "source_id"           uuid,
  "triggered_by_action" varchar(100),
  "is_pinned"           boolean            NOT NULL DEFAULT false,
  "created_at"          timestamptz        NOT NULL DEFAULT now()
);

CREATE INDEX "client_notes_user_id_created_at_idx"        ON "client_notes" ("user_id", "created_at" DESC);
CREATE INDEX "client_notes_author_id_idx"                 ON "client_notes" ("author_id");
CREATE INDEX "client_notes_source_system_source_id_idx"   ON "client_notes" ("source_system", "source_id");
CREATE INDEX "client_notes_category_idx"                  ON "client_notes" ("category");

-- ════════════════════════════════════════════════════════════════════════════
-- 2. TASKS — drop schema viejo + recrear canónico
-- ════════════════════════════════════════════════════════════════════════════
-- De 16 a 11 columnas canónicas. Drop completo: title, description, type,
-- created_by, service_id, conversation_id (reemplazados por source_system +
-- source_id), client_note, is_recurring, recurrence_day, billing_month,
-- reason, metadata. UNIQUE compuesto (service_id, billing_month, type) se
-- reemplaza por UNIQUE PARCIAL (source_system, source_id) WHERE status IN
-- ('pending','in_progress'). task_tags + task_tag_assignments eliminados.

-- Las dependencias (TaskChecklistCompletion, MaintenanceLog, ClientNote)
-- vienen con FK ON DELETE CASCADE/SET NULL; el CASCADE en `tasks` propaga
-- y limpia todo. ServiceChecklistItem permanece intacto (no FK a tasks).

DROP TABLE IF EXISTS "task_tag_assignments" CASCADE;
DROP TABLE IF EXISTS "task_tags" CASCADE;
DROP TABLE IF EXISTS "tasks" CASCADE;
DROP TYPE IF EXISTS "TaskType";

CREATE TYPE "TaskSourceSystem" AS ENUM (
  'support_ticket',
  'support_inside_slot',
  'provisioning_manual',
  'client_lifecycle',
  'project'
);

-- TaskStatus + TaskPriority enums permanecen idénticos (definidos en migraciones
-- previas). El DROP TABLE tasks no los elimina porque otros usos no existen,
-- pero al ser independientes los preservamos sin tocarlos.

CREATE TABLE "tasks" (
  "id"            uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  "source_system" "TaskSourceSystem" NOT NULL,
  "source_id"     uuid               NOT NULL,
  "client_id"     uuid               NOT NULL REFERENCES "users"("id"),
  "assigned_to"   uuid               REFERENCES "users"("id"),
  "priority"      "TaskPriority"     NOT NULL DEFAULT 'medium',
  "status"        "TaskStatus"       NOT NULL DEFAULT 'pending',
  "due_date"      timestamptz,
  "completed_at"  timestamptz,
  "completed_by"  uuid               REFERENCES "users"("id"),
  "created_at"    timestamptz        NOT NULL DEFAULT now(),
  "updated_at"    timestamptz        NOT NULL DEFAULT now()
);

-- UNIQUE PARCIAL canónico ADR-079 §3.1: 1 task ACTIVA por (sistema, source_id).
-- Tasks terminadas no entran al índice → ticket reabierto / mes siguiente
-- crean task nueva sin colisión.
CREATE UNIQUE INDEX "tasks_uniq_active_per_source"
  ON "tasks" ("source_system", "source_id")
  WHERE "status" IN ('pending', 'in_progress');

CREATE INDEX "tasks_assigned_to_idx"           ON "tasks" ("assigned_to");
CREATE INDEX "tasks_status_idx"                ON "tasks" ("status");
CREATE INDEX "tasks_client_id_idx"             ON "tasks" ("client_id");
CREATE INDEX "tasks_source_system_source_id_idx" ON "tasks" ("source_system", "source_id");
CREATE INDEX "tasks_due_date_idx"              ON "tasks" ("due_date");

-- ADR-079 §3.8 Sprint 16: NO se crea FK física sobre `client_notes.source_id`.
-- El campo es polimórfico y apunta a entidades distintas según `source_system`
-- (tasks | conversations | support_inside_slots | projects). Una FK simple
-- contra `tasks(id)` rechazaría las notas de ticket / mantenimiento porque
-- su source_id no vive en tasks. La integridad se valida a nivel listener.

-- ════════════════════════════════════════════════════════════════════════════
-- 3. MAINTENANCE LOGS — rename `notes` → `client_facing_notes`
-- ════════════════════════════════════════════════════════════════════════════
-- ADR-079 §3.8: el campo es contenido público del email al cliente con el
-- resumen del mantenimiento, no una nota interna. Las notas internas viven
-- ahora en `client_notes` con `source_system='maintenance_log'`. Renombrado
-- para evitar confusión semántica.

ALTER TABLE "maintenance_logs"
  RENAME COLUMN "notes" TO "client_facing_notes";
