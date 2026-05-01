-- Sprint 8 Fase D.12 fix (2026-05-01) — applicable_product_types en support_inside_config.
-- Doctrina: cada plan SI declara a qué tipos de producto se le pueden asignar
-- slots de mantenimiento. Default `{hosting_web, docker_service}` — los
-- servicios técnicos cuyo mantenimiento tiene sentido operativo. Excluye:
--   - `domain`         → no se mantiene, se renueva.
--   - `support_inside` → defense in depth contra auto-asignación.
--   - `we_do_it`/`custom_service` → tipos addon o proyecto, decidir al introducirlos.
--
-- Empty array = sin restricciones (no usado por defecto, reservado por si en el
-- futuro hay un plan "Enterprise" que cubre cualquier tipo).

-- 1. Añadir columna como array vacío por defecto.
ALTER TABLE "support_inside_config"
  ADD COLUMN "applicable_product_types" "ProductType"[] NOT NULL DEFAULT ARRAY[]::"ProductType"[];

-- 2. Backfill canónico para los 3 planes existentes (Básico/Medium/Pro)
--    con los tipos canónicos de mantenimiento. El admin puede afinar
--    desde el editor `/admin/support-inside-plans/<slug>` sin migración.
UPDATE "support_inside_config"
   SET "applicable_product_types" = ARRAY['hosting_web', 'docker_service']::"ProductType"[];
