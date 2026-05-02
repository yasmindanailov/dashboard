-- Sprint 11 Fase 11.B (2026-05-01) — Columnas canónicas de provisioning en services.
-- Doctrina: ADR-077 §2.2 (ProvisionResult.providerReference) + ADR-021 §"plugin libre dentro de la interfaz".
--
-- Cambios:
--  1. services.provisioner_slug (varchar 100, nullable). Denormalizado de
--     `product.provisioner` al momento de provisionar. Inmutable tras
--     `service.activated` — el plugin que provisionó es el dueño del lifecycle
--     aunque el admin cambie luego `product.provisioner` desde Settings.
--     Indexado para queries de reconciliación cron + filtro admin.
--
--  2. services.provider_reference (varchar 500, nullable). ID del recurso en el
--     sistema externo (cPanel account ID, domain ID, container ID, etc.).
--     NULL para plugins `internal`/`manual` que no tienen referencia externa.
--     Indexado para resolver el servicio desde callbacks/webhooks del proveedor.
--
-- Compat hacia atrás: ambas columnas NULL para servicios existentes (no romper
-- datos). El orquestador (Fase 11.B) las rellena al ejecutar plugin.provision()
-- por primera vez.

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "provider_reference" VARCHAR(500),
ADD COLUMN     "provisioner_slug" VARCHAR(100);

-- CreateIndex
CREATE INDEX "services_provisioner_slug_idx" ON "services"("provisioner_slug");

-- CreateIndex
CREATE INDEX "services_provider_reference_idx" ON "services"("provider_reference");
