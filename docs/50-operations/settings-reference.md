# Settings Reference — Aelium Dashboard

> **Catálogo canónico de TODOS los settings configurables.**
> Si vas a leer un setting → consulta este archivo para usar la `key` exacta. Si vas a añadir un setting → añádelo aquí en el mismo PR.

> **Última auditoría:** 2026-04-26 — F5 (auditoría completa de `backend/src/`, `backend/prisma/seed.ts`, ADRs).
> **Settings totales:** 21 implementados (seeded) + 5 documentados pendientes de implementar.
> **Tabla:** `Setting` con clave compuesta `(category, key)`. Valor `Json` flexible. Cache Redis 1min con invalidación en escritura ([ADR-044](../10-decisions/adr-044-settings-extensos.md)).

---

## Resumen ejecutivo

| Métrica | Valor |
|---------|-------|
| Settings seedados | 21 |
| Settings consumidos activamente | 12 (57%) |
| Settings huérfanos (feature futura) | 5 (24%) |
| Settings documentados sin seed | 5 (encriptación pendiente, partner, IA, etc.) |
| Secciones | 6 (auth, billing, general, support, referrals, support_inside) |

**Indicadores:**
- ✅ Setting implementado y consumido
- 🟡 Setting seedado pero sin consumidor todavía (hook aspiracional)
- ❌ Documentado pero NO seedado (deuda de implementación)

---

## Modelo de datos

```prisma
model Setting {
  category    String   // ej: "auth", "billing", "general"
  key         String   // ej: "max_login_attempts" — sin prefijo de category
  value       Json     // flexible (number, string, bool, jsonb)
  description String?
  updated_by  String?  @db.Uuid
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt

  @@id([category, key])
  @@map("settings")
}
```

**Acceso vía `SettingsService`** (cache Redis 1min):

```typescript
await settings.get('billing', 'invoice_prefix');           // → 'AEL'
await settings.getNumber('auth', 'max_login_attempts');    // → 5
await settings.getBoolean('referrals', 'system_active');   // → true
```

**Naming convention:** `<category>.<key>` en docs y referencias. En código se llama con dos parámetros separados (`get(category, key)`).

---

## Catálogo completo

### 🔐 auth.* (autenticación)

| Key | Tipo | Default | Estado | Consumidor | Origen |
|-----|------|---------|--------|------------|--------|
| `auth.max_login_attempts` | number | 5 | ✅ | `auth-login.service.ts:189` | [ADR-014](../10-decisions/adr-014-bloqueo-intentos-fallidos.md) · seed.ts:70 |
| `auth.block_duration_minutes` | number | 15 | ✅ | `auth-login.service.ts:194` | ADR-014 · seed.ts:71 |
| `auth.password_min_length` | number | 8 | 🟡 | (validación pendiente — hoy hardcoded) | seed.ts:72 |
| `auth.require_uppercase` | boolean | true | 🟡 | (pendiente uso en validador) | seed.ts:73 |
| `auth.require_lowercase` | boolean | true | 🟡 | (pendiente uso) | seed.ts:74 |
| `auth.require_number` | boolean | true | 🟡 | (pendiente uso) | seed.ts:75 |
| `auth.access_token_expires_minutes` | number | 15 | ✅ | `auth-token.service.ts:45` | [ADR-012](../10-decisions/adr-012-pbac-casl.md) · seed.ts:76 |
| `auth.refresh_token_expires_days` | number | 7 | ✅ | `auth-token.service.ts:50` | seed.ts:77 |
| `auth.email_verification_expires_hours` | number | 24 | ✅ | `auth-register.service.ts:156` | seed.ts:78 |
| `auth.password_reset_expires_hours` | number | 1 | ✅ | `auth-recovery.service.ts:42` | seed.ts:79 |
| `auth.two_factor_code_expires_minutes` | number | 5 | ✅ | `auth-login.service.ts:147` | [ADR-013](../10-decisions/adr-013-2fa-email.md) · seed.ts:80 |

### 💳 billing.* (facturación)

| Key | Tipo | Default | Estado | Consumidor | Origen |
|-----|------|---------|--------|------------|--------|
| `billing.invoice_prefix` | string | `"AEL"` | ✅ | `billing-invoice.service.ts:61` | [ADR-025](../10-decisions/adr-025-numeracion-secuencial-facturas.md) · seed.ts:63 |
| `billing.payment_due_days` | number | 7 | 🟡 | (ROADMAP EC-BILL-08 — pendiente integrar) | seed.ts:64 |
| `billing.default_tax_rate` | number | 21 | ✅ | `billing-calculator.service.ts:69` | [ADR-027](../10-decisions/adr-027-iva-por-pais.md) · seed.ts:62 |
| `billing.max_payment_retries` | number | 3 | ✅ | `billing-invoice.service.ts:91` | [ADR-030](../10-decisions/adr-030-periodo-gracia-reintentos.md) · sin seed (default in-code) |
| `billing.default_payment_provider` | string | (no seeded) | ❌ | (cuando exista plugin Stripe — [ADR-031](../10-decisions/adr-031-payment-providers.md)) | ADR-031 |
| `billing.invoice_advance_days` | number | (sin seed) | ❌ | (pendiente — días para anticipar generación de factura de renovación) | [ADR-044](../10-decisions/adr-044-settings-extensos.md) |
| `billing.payment_retry_interval_days` | number | (sin seed) | ❌ | (pendiente — días entre reintentos) | ADR-030 · ADR-044 |
| `billing.grace_period_days` | number | (sin seed) | ❌ | (pendiente — días antes de suspender por impago) | ADR-030 · ADR-044 |
| `billing.cancellation_after_suspension_days` | number | (sin seed) | ❌ | (pendiente — días hasta cancelar tras suspender) | ADR-030 · ADR-044 |
| `billing.data_retention_after_suspension_days` | number | (sin seed) | ❌ | (pendiente — días de retención de datos del servicio tras suspensión) | ADR-044 |

### 🏢 general.* (marca y empresa)

| Key | Tipo | Default | Estado | Consumidor | Origen |
|-----|------|---------|--------|------------|--------|
| `general.company_name` | string | `"Aelium"` | 🟡 | (pendiente — branding en facturas, emails) | seed.ts:59 |
| `general.company_email` | string | `"hola@aelium.net"` | 🟡 | (pendiente uso en footer de email) | seed.ts:60 |
| `general.default_currency` | string | `"EUR"` | 🟡 | Solo referencia en docs hoy ([ADR-027](../10-decisions/adr-027-iva-por-pais.md)) | seed.ts:61 |

### 💬 support.* (soporte y chat)

| Key | Tipo | Default | Estado | Consumidor | Origen |
|-----|------|---------|--------|------------|--------|
| `support.guest_session_ttl_days` | number | 30 | ✅ | `support-cleanup.worker.ts:42` | [ADR-037](../10-decisions/adr-037-arquitectura-dual-chat-tickets.md) · contract.md (sin seed explícito) |
| `support.auto_close_days` | number | 7 | 🟡 | (feature futura — auto-cerrar conversaciones inactivas) | seed.ts:65 |
| `support.ai_filter_enabled` | boolean | true | 🟡 | (feature futura — [ADR-057](../10-decisions/adr-057-agentes-ia.md) Sprint 15) | seed.ts:66 |
| `support.maintenance_critical_threshold_days` | number | (sin seed) | ❌ | (pendiente — alerta X días antes de fin de mes para tareas críticas) | [ADR-034](../10-decisions/adr-034-support-inside-modelo.md) · [ADR-042](../10-decisions/adr-042-sistema-notificaciones.md) |

### 🤝 referrals.* (sistema de referidos clientes normales)

| Key | Tipo | Default | Estado | Consumidor | Origen |
|-----|------|---------|--------|------------|--------|
| `referrals.monthly_credit_amount` | number | 3 | 🟡 | (pendiente — sprint dedicado) | [ADR-054](../10-decisions/adr-054-sistema-referidos-clientes.md) · seed.ts:67 |
| `referrals.system_active` | boolean | true | 🟡 | (toggle global — pendiente uso) | ADR-054 · seed.ts:68 |
| `referrals.first_purchase_discount_pct` | number | (sin seed) | ❌ | (pendiente — % descuento primer pedido del referido) | ADR-054 |
| `referrals.max_active_per_client` | number | 0 (sin límite) | ❌ | (pendiente) | ADR-054 |
| `referrals.credit_expiry_months` | number | 12 | ❌ | (pendiente — 0 = nunca expiran) | ADR-054 |

### 🤝 partner.* (sistema partner — Fase 2)

| Key | Tipo | Default | Estado | Consumidor | Origen |
|-----|------|---------|--------|------------|--------|
| `partner.payout.min_amount_eur` | number | 50 | ❌ | (pendiente Fase 2 — umbral mínimo de liquidación) | [ADR-051](../10-decisions/adr-051-partner-comisiones-liquidaciones.md) |
| `partner.client_inactive_suspend_days` | number | (sin seed) | ❌ | (pendiente — días sin servicios antes de suspender cuenta cliente del partner) | [ADR-048](../10-decisions/adr-048-partner-modelo-negocio.md) |

### 📨 notifications.* (centro y plantillas)

| Key | Tipo | Default | Estado | Consumidor | Origen |
|-----|------|---------|--------|------------|--------|
| `notifications.retention_days` | number | 90 | ❌ | (pendiente — borrado automático de notificaciones leídas tras N días) | [ADR-060](../10-decisions/adr-060-decisiones-pre-schema.md) · [ADR-042](../10-decisions/adr-042-sistema-notificaciones.md) |
| `notifications.enabled.<event>.<channel>` | boolean | (sin seed) | ❌ | (pendiente — toggle por evento × canal) | ADR-042 |
| `notifications.templates.<event>` | jsonb | (sin seed) | ❌ | (pendiente — plantillas editables desde UI) | ADR-042 · ver [`email-templates.md`](./email-templates.md) |

### 🛠️ infra.* (infraestructura)

| Key | Tipo | Default | Estado | Consumidor | Origen |
|-----|------|---------|--------|------------|--------|
| `infra.safety_margin_ram_pct` | number | 80 | ❌ | (pendiente módulo infrastructure — margen seguridad RAM) | [ADR-043](../10-decisions/adr-043-infraestructura-self-hosted.md) |
| `infra.safety_margin_cpu_pct` | number | 80 | ❌ | (pendiente — margen seguridad CPU) | ADR-043 |
| `infra.safety_margin_disk_pct` | number | 90 | ❌ | (pendiente — margen seguridad disco) | ADR-043 |

### 📦 storage.* (Sprint 11.5 MinIO)

| Key | Tipo | Default | Estado | Consumidor | Origen |
|-----|------|---------|--------|------------|--------|
| `storage.signed_url_expiry_minutes` | number | 60 | ❌ | (pendiente Sprint 11.5 — TTL de URLs firmadas para downloads) | Sprint 11.5 MinIO |
| `storage.max_upload_size_mb` | number | 10 | ❌ | (pendiente Sprint 11.5 — tamaño máximo de archivo subido) | Sprint 11.5 MinIO |

### 🤖 ai.* (agentes IA — Sprint 15 futuro)

| Key | Tipo | Default | Estado | Consumidor | Origen |
|-----|------|---------|--------|------------|--------|
| `ai.client_token_budget_daily` | number | (sin seed) | ❌ | (pendiente — budget diario de tokens por cliente para evitar coste descontrolado) | [ADR-057](../10-decisions/adr-057-agentes-ia.md) |
| `ai.provider.chat_filter` | string | (sin seed) | ❌ | (pendiente — modelo IA para filtro chat: ej `anthropic-sonnet`) | ADR-057 |
| `ai.provider.copilot` | string | (sin seed) | ❌ | (pendiente — modelo IA para copilot: ej `anthropic-opus`) | ADR-057 |

---

## Settings con encriptación obligatoria

Ningún setting **value** se encripta hoy en columna. Cuando se añadan **claves API de plugins** (Stripe, Mailgun, ResellerClub, etc.), debe aplicarse encriptación AES-256-GCM ([ADR-015](../10-decisions/adr-015-encriptacion-credenciales.md)) — **decisión arquitectónica firme**:

- `plugins.stripe.api_key` → encriptado.
- `plugins.stripe.webhook_secret` → encriptado.
- `plugins.mailgun.api_key` → encriptado.
- `plugins.resellerclub.api_key` → encriptado.
- `plugins.docker.<server_id>.credentials` → encriptado.

Patrón: helper `encryptedSetting('plugins.stripe.api_key', valuePlaintext)` antes de persistir; `decryptedSetting(...)` al leer. La columna `value` sigue siendo `Json`, pero el contenido es `{ encrypted: true, payload: '<base64>' }`.

---

## Settings que NO se ponen aquí (por qué)

- **Secrets criptográficos** (`JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`, `SENTRY_DSN`, `DATABASE_URL`, `REDIS_URL`) → **variables de entorno**, no tabla `settings`. Razón: arrancan antes de DB, rotación distinta, riesgo de cambio runtime no aceptable.
- **Constantes técnicas** (límites de buffer, tamaño máximo de payload, timeouts internos) → **código**. Razón: son detalles de implementación, no decisiones operativas del admin.

---

## Auditoría manual (cómo verificar drift)

Hoy es manual. Pasos:

1. **Listar lecturas en código:**
   ```bash
   grep -rEn 'settings\.(get|getNumber|getBoolean)\(' backend/src/
   ```
2. **Listar inserciones en seed:**
   ```bash
   grep -En "category:|key:" backend/prisma/seed.ts
   ```
3. **Comparar contra esta tabla.** Cualquier setting en código sin fila aquí = drift.

**Futuro deseable:** script de CI que falle si hay drift entre `seed.ts` y este archivo.

---

## Cómo añadir un setting nuevo

1. **Añadir entrada al seed** (`backend/prisma/seed.ts`) con default sensato.
2. **Añadir fila** en este archivo en la sección correspondiente, con `key`, tipo, default, estado, consumidor, origen.
3. **Si tiene credencial encriptada:** marcar explícitamente y usar helper `encryptedSetting`.
4. **Si afecta a billing, partner o financiero:** consultar [ADR-008](../10-decisions/adr-008-orden-construccion-sprints.md) y [ADR-033](../10-decisions/adr-033-outbox-pattern-pendiente.md) (Outbox).
5. **Si introduce decisión arquitectónica:** abrir ADR antes de codificar.

---

## Documentos relacionados

- [ADR-044](../10-decisions/adr-044-settings-extensos.md) — Decisión: settings por secciones, cache Redis 1min, validación, encriptación de claves de plugins.
- [ADR-015](../10-decisions/adr-015-encriptacion-credenciales.md) — Encriptación AES-256-GCM.
- [ADR-017](../10-decisions/adr-017-audit-log-inmutable.md) — Cada cambio de setting genera entrada en `audit_change_log`.
- [`email-templates.md`](./email-templates.md) — Plantillas (relacionado con `notifications.templates.*`).
- [`jobs-reference.md`](./jobs-reference.md) — Jobs que consumen settings de billing y support.
