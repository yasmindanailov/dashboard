-- Sprint 15A Fase D (2026-05-05) — Tabla `plugin_installs` (ADR-080 §2).
--
-- Decisión sobre la PK (ADR-080 §2): `slug` como PK natural (NO UUID).
-- Rompe conscientemente la convención del resto del schema porque:
--   1. El slug ES la identidad por contrato ADR-077 §1 (`ProvisionerPlugin.slug`
--      `readonly` e inmutable).
--   2. Cardinalidad acotada (~15 plugins de por vida) — un UUID artificial
--      duplicaría la identidad funcional sin ganancia.
--   3. Joins futuros `services.plugin_slug → plugin_installs.slug` con tipo
--      string nativo evitan indirección UUID.
--
-- Separación de `settings` (Setting model) — los secrets cifrados NUNCA se
-- mezclan con settings normales del cliente. Auditoría granular por fila.
--
-- Cifrado de `secrets`:
--   Cada campo del shape declarado por `manifest.secretsSchema` se cifra
--   individualmente con AES-256-GCM (`SecretVaultService`, ADR-080 §3) y se
--   persiste como blob `{ ciphertext, iv, tag, key_version }` en base64.
--   `key_version` permite rotación futura — Sprint 15A v1: única clave activa.

-- CreateTable
CREATE TABLE "plugin_installs" (
    "slug" VARCHAR(80) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "secrets" JSONB NOT NULL DEFAULT '{}',
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "installed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "installed_by" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,

    CONSTRAINT "plugin_installs_pkey" PRIMARY KEY ("slug")
);

-- CreateIndex
CREATE INDEX "plugin_installs_enabled_idx" ON "plugin_installs"("enabled");

-- Bootstrap canónico: plugins triviales `internal` y `manual` habilitados
-- por defecto. Sin estos, los servicios `internal` (Support Inside, etc.)
-- y `manual` (hosting-pro hoy) quedarían huérfanos al boot post-migración.
INSERT INTO "plugin_installs" ("slug", "enabled", "config", "secrets", "key_version")
VALUES
  ('internal', true, '{}'::jsonb, '{}'::jsonb, 1),
  ('manual',   true, '{}'::jsonb, '{}'::jsonb, 1);
