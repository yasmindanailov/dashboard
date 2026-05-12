-- Sprint 15C.II Fase F.3 (2026-05-12) — GAP-15CII-M: timeline de auditoría per-servicio.
--
-- El timeline `/admin/services/[id]/audit` + `/dashboard/services/[id]/audit`
-- hace un UNION de dos fuentes filtradas por el servicio:
--   1. `audit_change_log` WHERE entity_type='Service' AND entity_id = :serviceId
--      → ya está cubierto por el índice compuesto `(entity_type, entity_id)`.
--   2. `audit_access_log` WHERE metadata->>'resource_id' = :serviceId
--      → la mitad access-log filtra hoy por un path JSONB **sin índice**.
--      Los eventos relevantes (`service.admin_sso_impersonation`, `service.sso_opened`,
--      lecturas staff `@AuditAccess('Service')`) guardan el id del servicio en
--      `metadata.resource_id` (no en una columna). Un seq scan sobre toda la
--      tabla por cada apertura del timeline no es aceptable a escala.
--
-- Solución canónica: **índice de expresión** B-tree sobre `(metadata->>'resource_id')`.
-- Postgres puede usarlo para igualdad exacta sobre el path JSONB. NULL para
-- las filas que no llevan `resource_id` en metadata (la mayoría) — un índice
-- parcial `WHERE metadata ? 'resource_id'` lo mantiene compacto.
--
-- Nota: los índices de expresión no se modelan en `schema.prisma` (Prisma 7
-- no los expresa de forma nativa) — vive solo aquí, en el historial de
-- migraciones. `prisma migrate deploy` lo aplica; `prisma migrate dev` podría
-- reportar drift cosmético (esperado y aceptable — mismo patrón que cualquier
-- índice de expresión/parcial añadido por migración manual).
--
-- `CONCURRENTLY` deliberadamente **omitido**: no puede correr dentro de la
-- transacción que Prisma envuelve alrededor de cada migración. En este punto
-- la tabla `audit_access_log` es pequeña; si en producción creciera mucho,
-- la operación se haría manualmente con `CREATE INDEX CONCURRENTLY` fuera de
-- la migración.

CREATE INDEX "audit_access_log_metadata_resource_id_idx"
    ON "audit_access_log" ((metadata->>'resource_id'))
    WHERE metadata ? 'resource_id';
