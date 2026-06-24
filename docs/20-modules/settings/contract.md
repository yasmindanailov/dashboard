# Settings — Contract

> Configuración global de negocio editable por el superadmin. Doctrina: [ADR-044](../../10-decisions/adr-044-settings-extensos.md) (+ Amendment A1).

---

## 1. Propósito

Centraliza la configuración de negocio editable (marca, numeración de facturas, períodos, márgenes, kill switches, NS por defecto) en una tabla `settings` con caché, validación contra un catálogo y auditoría — para que el superadmin la ajuste desde `/admin/settings` sin redeploy.

---

## 2. Estado de implementación

🟡 **Parcial** — desde **Sprint 12** (Amendment A1 de ADR-044).
- ✅ Lectura cacheada (`SettingsService`, desde Sprint 9.6) + tabla `settings`.
- ✅ CRUD admin (`admin-settings`) con catálogo + validación + auditoría + invalidación de caché.
- ✅ Marca (`branding.*`) con subida de logo a MinIO + consumo en la factura PDF.
- ⬜ Pendiente: secciones no catalogadas (fiscal `tax_config`, plantilla PDF, infra margins sin seed), branding en emails, Knowledge Base (diferido).

---

## 3. Modelos Prisma propios

| Tabla | Descripción | Invariantes destacadas |
|-------|-------------|------------------------|
| `settings` | Pares `(category, key)` → `value` jsonb + `description` + `updated_by`. | `@@unique([category, key])`. `value` se guarda **CRUDO** (sin envoltorio `{value}`). |

---

## 4. Modelos foráneos accedidos

| Tabla | Módulo dueño | Acceso | Razón |
|-------|--------------|--------|-------|
| `audit_change_log` | audit | escritura vía `AuditService.logChange` | Auditar cada cambio de setting (R3). |

---

## 5. API REST expuesta

| Método | Ruta | Descripción | Auth | CASL |
|--------|------|-------------|------|------|
| GET | `/api/v1/admin/settings` | Settings catalogados, agrupados por sección + valor actual | JWT | `Manage` + `Setting` (superadmin) |
| PATCH | `/api/v1/admin/settings/:category/:key` | Editar un setting (valida → audita → invalida caché) | JWT | `Manage` + `Setting` |
| GET | `/api/v1/admin/settings/branding/logo` | URL firmada del logo actual (o null) | JWT | `Manage` + `Setting` |
| POST | `/api/v1/admin/settings/branding/logo` | Subir el logo (multipart PNG/JPG) a MinIO | JWT | `Manage` + `Setting` |

> El sub-árbol `/admin/settings/plugins` lo sirve `admin-plugins` (ADR-080), no este módulo.

---

## 6. WebSocket gateway

N/A — el módulo no tiene gateway.

---

## 7. Eventos emitidos

Ninguno. Los cambios de setting se registran en `audit_change_log` (R3), no como evento de dominio (no disparan acciones cross-módulo). La invalidación de caché es in-proceso e inmediata.

---

## 8. Eventos consumidos

Ninguno.

---

## 9. Servicios consumidos (cross-módulo)

| Servicio | De módulo | Razón legítima |
|----------|-----------|----------------|
| `AuditService` | audit | Auditoría R3 de cambios (módulo global). |
| `SettingsService` | core/settings | Lectura + invalidación de caché (core global). |
| `StorageService` | core/storage | Subida/descarga del logo en MinIO (core global). |

---

## 10. CASL — Permisos

| Subject | superadmin | agent_full | agent_billing | agent_support | client | partner |
|---------|------------|------------|---------------|---------------|--------|---------|
| `Setting` | manage | — (denegado explícito) | — | — | — | — |

Sólo el superadmin gestiona settings (regla wildcard `Manage All`); el resto de staff lo tiene denegado explícito en `permissions.ts`.

---

## 11. Settings consumidos

Los **edita** (no sólo consume). El catálogo de qué es editable vive en `backend/src/core/settings/settings-catalog.ts`; el catálogo de qué está seedeado, en [`settings-reference.md`](../../50-operations/settings-reference.md). Editables v1: `general.default_currency`, `branding.*`, **`billing.*`** (prefijo, IVA `default_tax_rate`, antelación `invoice_generation_days`, reintentos `max_payment_retries`/`retry_interval_days`, impago `suspension_days`/`cancellation_days`, vencimiento `payment_due_days`), `support.*`, `notifications.*`, `provisioning.{default,registrar_parking}_nameservers`. Sprint 12.E corrigió el bug `{value}` de `BillingCalculatorService.getSettingValue` que tenía todo el ciclo de vida de billing hardcodeado a sus defaults.

---

## 12. Emails enviados

Ninguno.

---

## 13. Jobs / cron

Ninguno.

---

## 14. Invariantes

- **SET-INV-1:** `settings.value` se guarda **crudo** (el shape que lee `SettingsService`). NO se envuelve en `{value}`.
- **SET-INV-2:** Sólo se puede editar lo declarado `editable` en el catálogo; lo `managed` (p.ej. `branding.logo_key`) sólo por su endpoint dedicado; el resto se rechaza con 400.
- **SET-INV-3:** Todo cambio se valida contra el catálogo ANTES de persistir y se audita en `audit_change_log` (R3); la caché se invalida en la misma operación.
- **SET-INV-4:** Secrets (claves criptográficas, JWT, etc.) viven en env vars, **nunca** en `settings` (ADR-044).

---

## 15. Decisiones relacionadas

- [ADR-044](../../10-decisions/adr-044-settings-extensos.md) — Settings extensos por secciones (+ Amendment A1, Sprint 12).
- [ADR-062](../../10-decisions/adr-062-storage-canonico-minio.md) — Storage MinIO (logo de marca).
- [ADR-067](../../10-decisions/adr-067-granularidad-casl-subjects.md) — `Subject.Setting` superadmin-only.
- Auditoría 2026-06-21 §4 MEDIUM-2 — cerrada (cambios de setting ahora validados + auditados).

---

## 16. Excepciones documentadas

- **R1:** los accesos a `AuditService`/`StorageService`/`SettingsService` son a módulos **core globales**, no a otro módulo de negocio — legítimo.
- **R8 (outbox):** N/A — settings no emite eventos de dominio.

---

## 17. Pendiente / deuda técnica

- [ ] Branding en el footer de los emails (el render Handlebars no tiene layout común).
- [ ] Logo vectorial (SVG/WEBP) en el PDF (PDFKit sólo incrusta PNG/JPG).
- [ ] Subida de logo como job persistente + validación de imagen (dimensiones).
- [ ] Catalogar secciones aún no editables (fiscal `tax_config`, plantilla PDF, infra margins).
- [ ] Knowledge Base (diferido por Yasmin, 2026-06-24).

---

## 18. Cómo testear este módulo

- **Unit:** `backend/src/modules/admin-settings/admin-settings.service.spec.ts` (validación + audit + invalidación + logo) · `backend/src/modules/billing/invoice-pdf.service.spec.ts` (branding en PDF, fail-soft del logo).
- **Smoke manual:** en `/admin/settings` editar `billing.invoice_prefix` → persiste + entrada en `audit_change_log`; subir un logo → se ve en el PDF de una factura; valor inválido (`payment_due_days = -1`) → rechazado; rol no-superadmin → 403.
