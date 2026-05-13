-- Sprint 15C.II Fase F.6.4 (2026-05-13) — Migración data one-shot:
-- split del `"<motivo>: <nota>"` combinado actual a su forma separada
-- (motivo-enum en la columna `services.suspension_reason` /
-- `services.cancellation_reason`, nota libre como `ClientNote` retroactivo)
-- + creación de los `ClientNote` faltantes para los servicios suspendidos /
-- cancelados antes de F.6.
--
-- Archivo SEPARADO del schema migration (`20260513090000_...`) porque
-- Postgres NO permite usar un enum value nuevo (`'service'`, `'lifecycle'`)
-- en la misma transacción que el `ALTER TYPE ADD VALUE` que lo añade.
-- Cada migración Prisma corre en su propia transacción → el ADD VALUE del
-- primer archivo está committed antes de que este SELECT/INSERT lo use.
--
-- Idempotente:
--   - Filas SIN `': '` en suspension_reason/cancellation_reason → ya están
--     en formato F.6.2 (solo enum), se ignoran.
--   - Filas CON `': '` → se procesan: extraer la parte de nota,
--     crear ClientNote retroactivo, dejar la columna solo con el enum.
--
-- Autor del ClientNote retroactivo: `NULL` (actor original desconocido).
-- El body lleva un sufijo `[Migración 2026-05-13 — autor original no
-- registrado]` para que el lector entienda por qué la nota no tiene autor
-- (alternativa "fallback a superadmin" descartada — mentir sobre quién
-- escribió la nota). El `created_at` se preserva del `suspended_at` /
-- `cancelled_at` original para mantener el orden cronológico en el
-- timeline del cliente (alternativa `NOW()` agruparía todas las notas
-- retroactivas en el momento de la migración).

-- ─── Suspensiones: ClientNote retroactivo + limpieza ─────────────────────
INSERT INTO "client_notes" (
    "id",
    "user_id",
    "author_id",
    "category",
    "body",
    "source_system",
    "source_id",
    "triggered_by_action",
    "is_pinned",
    "created_at"
)
SELECT
    gen_random_uuid(),
    s."user_id",
    NULL, -- actor original desconocido (convención F.6 actor sistema = NULL)
    'lifecycle'::"NoteCategory",
    SUBSTRING(s."suspension_reason" FROM POSITION(': ' IN s."suspension_reason") + 2)
        || ' [Migración 2026-05-13 — autor original no registrado]',
    'service'::"NoteSourceSystem",
    s."id",
    'service.suspended',
    false,
    COALESCE(s."suspended_at", NOW())
FROM "services" s
WHERE s."suspension_reason" IS NOT NULL
  AND POSITION(': ' IN s."suspension_reason") > 0;

UPDATE "services"
SET "suspension_reason" = SUBSTRING("suspension_reason" FROM 1 FOR POSITION(': ' IN "suspension_reason") - 1)
WHERE "suspension_reason" IS NOT NULL
  AND POSITION(': ' IN "suspension_reason") > 0;

-- ─── Cancelaciones: ClientNote retroactivo + limpieza ────────────────────
INSERT INTO "client_notes" (
    "id",
    "user_id",
    "author_id",
    "category",
    "body",
    "source_system",
    "source_id",
    "triggered_by_action",
    "is_pinned",
    "created_at"
)
SELECT
    gen_random_uuid(),
    s."user_id",
    NULL,
    'lifecycle'::"NoteCategory",
    SUBSTRING(s."cancellation_reason" FROM POSITION(': ' IN s."cancellation_reason") + 2)
        || ' [Migración 2026-05-13 — autor original no registrado]',
    'service'::"NoteSourceSystem",
    s."id",
    'service.cancelled',
    false,
    COALESCE(s."cancelled_at", NOW())
FROM "services" s
WHERE s."cancellation_reason" IS NOT NULL
  AND POSITION(': ' IN s."cancellation_reason") > 0;

UPDATE "services"
SET "cancellation_reason" = SUBSTRING("cancellation_reason" FROM 1 FOR POSITION(': ' IN "cancellation_reason") - 1)
WHERE "cancellation_reason" IS NOT NULL
  AND POSITION(': ' IN "cancellation_reason") > 0;
