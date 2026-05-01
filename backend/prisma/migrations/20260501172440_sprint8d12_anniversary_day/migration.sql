-- Sprint 8 Fase D.12.1 — anniversary_day en support_inside_slots
-- Doctrina: ADR-034 §recurrencia ("distribuir carga de trabajo a lo largo del mes").
-- Drift detectado: el primer commit de Fase D.7 disparaba el cron `0 6 1 * *` (todos día 1).
-- Esta migración añade el campo + backfill + CHECK + index.

-- 1. Añadir columna NULLABLE (permite filas existentes).
ALTER TABLE "support_inside_slots"
  ADD COLUMN "anniversary_day" INTEGER;

-- 2. Backfill: anniversary_day = LEAST(EXTRACT(DAY FROM assigned_at), 28)
--    Cumple ADR-034: día efectivo de contratación, capado a 28 para
--    evitar que febrero quede sin disparar.
UPDATE "support_inside_slots"
   SET "anniversary_day" = LEAST(EXTRACT(DAY FROM "assigned_at")::INTEGER, 28);

-- 3. Convertir a NOT NULL una vez todas las filas tienen valor.
ALTER TABLE "support_inside_slots"
  ALTER COLUMN "anniversary_day" SET NOT NULL;

-- 4. CHECK constraint 1..28 (defense in depth contra inserts manuales con day>28).
ALTER TABLE "support_inside_slots"
  ADD CONSTRAINT "support_inside_slots_anniversary_day_range_check"
  CHECK ("anniversary_day" BETWEEN 1 AND 28);

-- 5. Índice canónico (cron diario filtra WHERE anniversary_day = EXTRACT(DAY FROM NOW())).
CREATE INDEX "support_inside_slots_anniversary_day_idx"
  ON "support_inside_slots" ("anniversary_day");
