-- Sprint 8 Fase D — Cleanup legacy `support-inside-basic` (ADR-075).
--
-- Contexto: el seed `sample-products.ts` sembraba históricamente un
-- producto demo `support-inside-basic` (type=support_inside) que entró
-- en conflicto conceptual con los 3 planes canónicos (Básico/Medium/Pro)
-- introducidos por ADR-075 §B.2 + seed `support-inside-plans.ts`.
--
-- El seed se modificó para no volver a sembrarlo, pero el producto
-- quedó persistido en BDs ya inicializadas. Esta migración lo elimina
-- de forma idempotente y versionada (no SQL ad-hoc) — queda audit en
-- `_prisma_migrations` y se aplica igual en dev/CI/staging/prod sin
-- intervención manual.
--
-- Doctrina:
--   - DELETE filtrado por slug exacto — no toca otros productos.
--   - Idempotente: si el producto no existe (BDs limpias / nuevas),
--     `WHERE slug = ...` devuelve 0 filas y la migración pasa OK.
--   - El CASCADE de FK definido en `support_inside_config.product_id`
--     elimina la fila de config si existiera (no aplica al legacy
--     porque se sembró antes de Sprint 8 Fase D).
--   - El CASCADE de FK definido en `product_pricing.product_id`
--     elimina los pricing rows asociados.
--   - Si por error el producto tuviera Services activos asociados
--     (no debería — es solo un producto demo), la FK
--     `services.product_id` es NO ACTION y la migración fallaría con
--     un error claro. Esto es buscado: el operador debe decidir
--     manualmente qué hacer con esos services antes de aplicar.

DELETE FROM products
WHERE slug = 'support-inside-basic'
  AND type = 'support_inside';
