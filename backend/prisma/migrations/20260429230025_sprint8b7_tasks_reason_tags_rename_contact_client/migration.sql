-- Sprint 8 Fase B.7 (2026-04-29) — ADR-073
-- Tipos de tarea más flexibles: rename `wow_call` → `contact_client`,
-- add `tasks.reason` libre, add tablas `task_tags` + `task_tag_assignments`.

-- 1. Rename enum value `wow_call` → `contact_client`. Postgres propaga
--    automáticamente a las filas existentes que ya guardan `wow_call`.
ALTER TYPE "TaskType" RENAME VALUE 'wow_call' TO 'contact_client';

-- 2. Añadir columna `reason` (texto libre opcional, max 100 chars).
ALTER TABLE "tasks" ADD COLUMN "reason" VARCHAR(100);

-- 3. Migrar tareas existentes: las que ya eran `wow_call` reciben un
--    `reason` por defecto que preserva el contexto operativo histórico
--    ("Bienvenida primer servicio"). El admin puede editarlo si quiere.
UPDATE "tasks"
SET "reason" = 'Bienvenida primer servicio'
WHERE "type" = 'contact_client' AND "reason" IS NULL;

-- 4. Tabla `task_tags`: catálogo de etiquetas extensibles.
CREATE TABLE "task_tags" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "slug"        VARCHAR(50) NOT NULL,
  "label"       VARCHAR(50) NOT NULL,
  "color"       VARCHAR(7),
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_by"  UUID,

  CONSTRAINT "task_tags_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "task_tags_slug_key" UNIQUE ("slug"),
  CONSTRAINT "task_tags_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL
);

-- 5. Tabla `task_tag_assignments`: M2M explícita Task ↔ TaskTag.
CREATE TABLE "task_tag_assignments" (
  "task_id"     UUID NOT NULL,
  "tag_id"      UUID NOT NULL,
  "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "task_tag_assignments_pkey" PRIMARY KEY ("task_id", "tag_id"),
  CONSTRAINT "task_tag_assignments_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE,
  CONSTRAINT "task_tag_assignments_tag_id_fkey"
    FOREIGN KEY ("tag_id") REFERENCES "task_tags"("id") ON DELETE CASCADE
);

CREATE INDEX "task_tag_assignments_tag_id_idx" ON "task_tag_assignments" ("tag_id");
