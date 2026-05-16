-- Sprint 15C.II Fase F.8 (2026-05-16) — Alertas de cuota (disco).
--
-- Materializa la tabla de state-tracking edge-triggered del detector
-- `QuotaThresholdDetectorService` (core/provisioning/), invocado al final
-- de cada pasada del cron L3 del plugin (Enhance: `EnhanceReconciliationCron
-- .runAsExecutor`). Patrón Prometheus/AlertManager — emite el evento
-- `service.quota_threshold_crossed` SOLO en la transición `<threshold →
-- ≥threshold`; las pasadas consecutivas above NO re-emiten porque la última
-- fila previa actúa de flag (`kind='crossed_up'`).
--
-- Decisiones canónicas (dossier §A.11.10.5.1 R1/R2/R3 frozen):
--
--   - Tabla dedicada (vs `services.metadata.quotaAlerts`): historial
--     trazable + auditable + FK con integridad referencial + edge-trigger
--     compatible. Patrón establecido por `AuditChangeLog`/`FailedJob`.
--
--   - 2 enums Prisma nuevos: `QuotaAlertResource` (solo `disk` en F.8;
--     bandwidth diferido por reset mensual — promoción futura F.8.x) y
--     `QuotaAlertKind` (`crossed_up`/`crossed_down`). Postgres permite
--     `CREATE TYPE` + uso en `CREATE TABLE` en la misma transacción de
--     migración (distinto del `ALTER TYPE ADD VALUE`, que NO se permite en
--     la misma tx que su uso — F.6 ya documentó esta diferencia).
--
--   - FK `ON DELETE CASCADE`: si un Service se elimina físicamente (no
--     operación normal — los services se marcan `cancelled`/`terminated`,
--     no se borran), su historial de alertas pierde sentido aislado.
--     Coherente con `ServiceChecklistItem` y `SupportInsideSlot`.
--
--   - `@@index([service_id, resource, detected_at])`: el lookup canónico
--     del detector es `findFirst({ where: {service_id, resource},
--     orderBy: {detected_at:'desc'} })` — este índice composite cubre
--     filtro + ordenación.
--
--   - `used_pct` y `threshold_pct` como `DECIMAL(5,2)` (3 dígitos enteros +
--     2 decimales — rango `[0.00, 999.99]`): captura el porcentaje con
--     precisión suficiente para tests deterministas y para que la UI
--     muestre "87.42%" si el plugin reporta granularidad fina. `(5,2)`
--     versus `(3,2)` deja margen sin coste real (NUMERIC en Postgres no
--     paga storage por dígitos no usados).

-- ─── Enums ────────────────────────────────────────────────────────────────
CREATE TYPE "QuotaAlertResource" AS ENUM ('disk');

CREATE TYPE "QuotaAlertKind" AS ENUM ('crossed_up', 'crossed_down');

-- ─── Tabla ────────────────────────────────────────────────────────────────
CREATE TABLE "service_quota_alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "service_id" UUID NOT NULL,
    "resource" "QuotaAlertResource" NOT NULL,
    "kind" "QuotaAlertKind" NOT NULL,
    "used_pct" DECIMAL(5, 2) NOT NULL,
    "threshold_pct" DECIMAL(5, 2) NOT NULL,
    "detected_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_quota_alerts_pkey" PRIMARY KEY ("id")
);

-- ─── Índice composite canónico ────────────────────────────────────────────
CREATE INDEX "service_quota_alerts_service_id_resource_detected_at_idx"
    ON "service_quota_alerts" ("service_id", "resource", "detected_at");

-- ─── Foreign key ──────────────────────────────────────────────────────────
ALTER TABLE "service_quota_alerts"
    ADD CONSTRAINT "service_quota_alerts_service_id_fkey"
    FOREIGN KEY ("service_id") REFERENCES "services" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
