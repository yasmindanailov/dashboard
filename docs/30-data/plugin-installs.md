# Schema canónico — `plugin_installs`

> Sprint 15A — ADR-080 §2. Tabla dedicada a la **activación** y **configuración** de plugins de provisioning. Separada de `settings` por diseño: los secrets cifrados NUNCA se mezclan con settings normales del cliente.

---

## Doctrina canónica

- **PK natural `slug`** (NO UUID). Ruptura consciente de la convención del schema:
  1. El slug ES la identidad inmutable por contrato ([ADR-077 §1](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md)).
  2. Cardinalidad acotada (~15 plugins de por vida) — el UUID artificial duplicaría la identidad funcional.
  3. Joins futuros `services.plugin_slug → plugin_installs.slug` con tipo string nativo evitan indirección.

- **`enabled` es la fuente de activación**; el registro DI sigue siendo la fuente de **disponibilidad** (`PluginRegistryService` los combina — [ADR-080 §4](../10-decisions/adr-080-plugin-framework.md)).

- **`secrets` cifrado por campo** con AES-256-GCM (`SecretVaultService`, [ADR-080 §3](../10-decisions/adr-080-plugin-framework.md)). Cada campo declarado en `manifest.secretsSchema` se cifra individualmente con su IV propio. Shape persistido:

  ```jsonc
  {
    "api_key": {
      "ciphertext": "<base64>",
      "iv": "<base64, 12 bytes>",
      "tag": "<base64, 16 bytes>",
      "key_version": 1
    },
    "webhook_secret": { /* idem */ }
  }
  ```

- **`key_version`** identifica con qué versión de `ENCRYPTION_KEY` se cifraron los secrets. Permite rotación elegante (Sprint 15A v1: única clave activa; flujo de rotación documentado pero diferido — ADR-080 §3 "Política de rotación").

---

## Definición Prisma

```prisma
model PluginInstall {
  slug         String   @id @db.VarChar(80)
  enabled      Boolean  @default(false)
  config       Json     @default("{}")
  secrets      Json     @default("{}")
  key_version  Int      @default(1)
  installed_at DateTime @default(now()) @db.Timestamptz()
  installed_by String?  @db.Uuid
  updated_at   DateTime @default(now()) @updatedAt @db.Timestamptz()
  updated_by   String?  @db.Uuid

  @@index([enabled])
  @@map("plugin_installs")
}
```

---

## Definición SQL (post-migración)

```sql
CREATE TABLE "plugin_installs" (
    "slug"          VARCHAR(80)   NOT NULL PRIMARY KEY,
    "enabled"       BOOLEAN       NOT NULL DEFAULT false,
    "config"        JSONB         NOT NULL DEFAULT '{}',
    "secrets"       JSONB         NOT NULL DEFAULT '{}',
    "key_version"   INTEGER       NOT NULL DEFAULT 1,
    "installed_at"  TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "installed_by"  UUID,
    "updated_at"    TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by"    UUID
);

CREATE INDEX "plugin_installs_enabled_idx" ON "plugin_installs"("enabled");
```

Migración: [`20260505140000_sprint15a_plugin_installs/migration.sql`](../../backend/prisma/migrations/20260505140000_sprint15a_plugin_installs/migration.sql).

---

## Bootstrap canónico

La migración insertará dos filas iniciales:

```sql
INSERT INTO "plugin_installs" ("slug", "enabled", "config", "secrets", "key_version")
VALUES
  ('internal', true, '{}'::jsonb, '{}'::jsonb, 1),
  ('manual',   true, '{}'::jsonb, '{}'::jsonb, 1);
```

**Razón**: los plugins triviales `internal` y `manual` (Sprint 11 Fase 11.C) deben quedar habilitados al boot post-deploy. Sin estos, los servicios cuyo `provisioner_slug` apunta a ellos (Support Inside, hosting-pro hoy) quedarían huérfanos al reiniciar el backend.

El seed canónico [`seedPluginInstalls`](../../backend/prisma/seeds/plugin-installs.ts) preserva el flag `enabled` entre runs (no sobrescribe si el admin lo cambió). Solo crea filas que no existen.

---

## Relaciones

| Campo | Apunta a | Notas |
|-------|----------|-------|
| `slug` | `services.provisioner_slug` (denormalizado) | No es FK formal (denormalizado por R8). El registry valida coherencia al boot. |
| `installed_by` | `users.id` | NULLABLE — bootstrap rows del seed no tienen actor. ON DELETE SET NULL implícito (no FK formal por simetría con `updated_by`). |
| `updated_by` | `users.id` | NULLABLE — última edición. |

---

## Operaciones canónicas

| Operación | Quién la dispara | Acción |
|-----------|-----------------|--------|
| `INSERT` | `seedPluginInstalls` (boot inicial) o `AdminPluginsService.update()` (primer PATCH) | Crea row con `enabled=false` por defecto si no existe. |
| `UPDATE enabled` | `AdminPluginsService.update()` vía `PATCH /admin/plugins/:slug` | Solo superadmin (CASL `Subject.Plugin`). Emite `plugin.config_changed` → `PluginRegistryService` recarga `activePlugins`. |
| `UPDATE config / secrets` | Idem | Validados con Ajv contra `manifest.configSchema` / `manifest.secretsSchema`. Secrets cifrados con `SecretVaultService.encryptRecord()` antes de persistir. Audit `logChange` con secrets enmascarados como `<set>`/`<cleared>` (R3 + R12). |
| `DELETE` | (no soportado en Sprint 15A) | El admin deshabilita con `enabled=false`; la fila persiste para preservar audit history. La eliminación física requiere SQL manual con justificación documentada. |

---

## Reglas de negocio

| Invariante | Aplicación |
|------------|------------|
| `slug` ∈ snake_case o kebab-case (regex `/^[a-z][a-z0-9_-]*$/`) | Validado por `PluginRegistryService.tryValidate` al boot ([ADR-077 §6](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md) + [Amendment A2](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md#amendments)). Debe empezar por letra minúscula. |
| `slug` ∈ DI registrado vía `PROVISIONER_PLUGINS` | Si no, `PluginRegistryService.reloadActivation` loguea ERROR + servicios huérfanos en `pending`. NO rompe boot (R7). |
| `secrets` cifrados con `key_version` actual | `SecretVaultService.decrypt` lanza `KEY_VERSION_MISMATCH` si no coincide. La rotación elegante (multi-key activo) está diferida a sub-sprint condicionado. |
| Secrets NUNCA en plaintext en logs / audit / responses GET | Audit usa `<set>`/`<cleared>`, GET responde `'***'`/`null`. (R12 + ADR-080 §3). |

---

## Referencias

- [ADR-080 — Plugin Framework](../10-decisions/adr-080-plugin-framework.md) — fuente de verdad de las decisiones del modelo.
- [ADR-077 — Contrato `ProvisionerPlugin` v2](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md) — congelación del slug como identidad inmutable.
- [`docs/20-modules/_events.md` §🔌 plugin.*](../20-modules/_events.md) — 5 eventos canónicos del lifecycle.
- [`docs/features/admin/plugins.md`](../features/admin/plugins.md) — operativa diaria del superadmin.
- Backend:
  - [`backend/src/core/security/secret-vault.service.ts`](../../backend/src/core/security/secret-vault.service.ts) — vault AES-256-GCM.
  - [`backend/src/core/provisioning/plugin-registry.ts`](../../backend/src/core/provisioning/plugin-registry.ts) — loader desde DB + reload runtime.
  - [`backend/src/modules/admin-plugins/admin-plugins.service.ts`](../../backend/src/modules/admin-plugins/admin-plugins.service.ts) — REST handler + Ajv + audit.
- Frontend:
  - [`frontend/app/admin/settings/plugins/page.tsx`](../../frontend/app/admin/settings/plugins/page.tsx) — listado superadmin.
  - [`frontend/app/admin/settings/plugins/[slug]/page.tsx`](../../frontend/app/admin/settings/plugins/[slug]/page.tsx) — detalle + form dinámico.
