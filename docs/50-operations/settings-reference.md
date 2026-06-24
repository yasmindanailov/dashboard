# Settings Reference — Aelium Dashboard

> **Catálogo canónico de TODOS los settings configurables.**
> Si vas a leer un setting → consulta este archivo para usar la `key` exacta. Si vas a añadir un setting → añádelo aquí en el mismo PR.

> **Última auditoría:** 2026-05-01 — cierre Sprint 8 Fase C (8 settings nuevos: 7 `tasks.*` ADR-072 + 1 `support.maintenance_critical_threshold_days`, todos con consumidor real en los 3 crons BullMQ nuevos).
> **Settings totales:** 39 implementados (seeded) + 5 documentados pendientes de implementar.
> **Tabla:** `Setting` con clave compuesta `(category, key)`. Valor `Json` flexible. Cache Redis 1min con invalidación en escritura ([ADR-044](../10-decisions/adr-044-settings-extensos.md)).

---

## Resumen ejecutivo

| Métrica | Valor |
|---------|-------|
| Settings seedados | 39 (Sprint 11.5: 2 storage.*; Sprint 9 Fase A: 3 jobs.*; Sprint 9 Fase E: 1 audit.*; Sprint 9.5: 4 notifications.*; Sprint 8 Fase C: 1 support.* + 7 tasks.*) |
| Settings consumidos activamente | 29 (74%) |
| Settings huérfanos (feature futura) | 6 (15%) |
| Settings documentados sin seed | 5 (encriptación pendiente, partner, IA, etc.) |
| Secciones | 11 (auth, billing, general, support, referrals, partner, notifications, tasks, infra, storage, jobs, audit, ai) |

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
| `billing.invoice_prefix` | string | `"AEL"` | ✅ | `billing-invoice.service.ts` `generateInvoiceNumber` (Sprint 12: leído vía `SettingsService`, canónico — el previo `getSettingValue` con envoltorio `{value}` caía a 'AELIUM') · **editable `/admin/settings`** | [ADR-025](../10-decisions/adr-025-numeracion-secuencial-facturas.md) · [ADR-044 A1](../10-decisions/adr-044-settings-extensos.md) |
| `billing.payment_due_days` | number | 7 | ✅ | `billing-invoice.service.ts` `createInvoice` → `due_date` cuando el DTO no la fija (Sprint 12) · **editable `/admin/settings`** | [ADR-044 A1](../10-decisions/adr-044-settings-extensos.md) |
| `billing.default_tax_rate` | number | 21 | ✅ | `billing-calculator.service.ts` `calculateInvoiceTotals` (IVA por defecto) · **editable** | [ADR-027](../10-decisions/adr-027-iva-por-pais.md) · [ADR-044 A1](../10-decisions/adr-044-settings-extensos.md) |
| `billing.invoice_generation_days` | number | 7 | ✅ | `billing-lifecycle.worker.ts` `generatePendingInvoices` (antelación de la factura de renovación) · **editable** | [ADR-044 A1](../10-decisions/adr-044-settings-extensos.md) |
| `billing.max_payment_retries` | number | 3 | ✅ | `billing-invoice.service.ts` `createInvoice` → `invoice.max_retries` · **editable** | [ADR-030](../10-decisions/adr-030-periodo-gracia-reintentos.md) · ADR-044 A1 |
| `billing.retry_interval_days` | number | 3 | ✅ | `billing-lifecycle.worker.ts` `retryOverduePayments` + `markAsOverdue` (días entre reintentos) · **editable** | ADR-030 · ADR-044 A1 |
| `billing.suspension_days` | number | 7 | ✅ | `service-lifecycle.worker.ts` `autoSuspendServices` (margen antes de suspender por impago) · **editable** | ADR-030 · ADR-044 A1 |
| `billing.cancellation_days` | number | 30 | ✅ | `service-lifecycle.worker.ts` `autoCancelServices` (suspendido → cancelado) · **editable** | ADR-030 · ADR-044 A1 |
| `billing.default_payment_provider` | string | (no seeded) | ❌ | (cuando exista plugin Stripe — [ADR-031](../10-decisions/adr-031-payment-providers.md)) | ADR-031 |

> **Sprint 12 (fix):** los 6 settings de arriba (`default_tax_rate` + los 5 del ciclo de vida) estaban de facto **hardcodeados a su default** por el bug `{value}` de `BillingCalculatorService.getSettingValue` (leía un envoltorio inexistente). Corregido (lee crudo) + seedeados + **editables en `/admin/settings`** (grupo Facturación). Las **keys reales del código** son éstas; los nombres de ADR-044 (`invoice_advance_days`/`grace_period_days`/`cancellation_after_suspension_days`/`payment_retry_interval_days`) eran aspiracionales y no coincidían con el código. **Fuera de alcance (consciente):** `data_retention_after_suspension_days` (sin consumidor), formato de numeración más allá del prefijo (integridad legal ADR-025), `tax_config` rico (IRPF/autónomo-empresa → requiere cambiar el modelo de cálculo).

### 🏢 general.* (generales)

| Key | Tipo | Default | Estado | Consumidor | Origen |
|-----|------|---------|--------|------------|--------|
| `general.default_currency` | enum (EUR/USD/GBP) | `"EUR"` | 🟡 | Referencia ([ADR-027](../10-decisions/adr-027-iva-por-pais.md)) · **editable `/admin/settings`** | [ADR-044 A1](../10-decisions/adr-044-settings-extensos.md) |

> Sprint 12: el IVA por defecto vive en **`billing.default_tax_rate`** (lo consume `billing-calculator`); el `general.default_tax_rate` previo era un huérfano sin consumidor → retirado del seed.

> ⚠️ Sprint 12: `general.company_name` y `general.company_email` (huérfanos, sin consumidor) se **retiraron del seed** y se consolidaron en `branding.*` (canónico, abajo).

### 🎨 branding.* (marca — Sprint 12, ADR-044 A1)

Identidad de marca usada en las facturas. **Todos editables desde `/admin/settings`** (grupo «Marca»). Consumidor: `invoice-pdf.service.ts` `getCompanyInfo` + render del logo.

| Key | Tipo | Default | Estado | Notas |
|-----|------|---------|--------|-------|
| `branding.company_name` | string | `"Aelium"` | ✅ | Cabecera/pie del PDF. |
| `branding.company_email` | string | `"hola@aelium.net"` | ✅ | Email en el PDF. |
| `branding.company_nif` | string | `"B12345678"` | ✅ | NIF/CIF en el PDF. |
| `branding.company_address` | string | `"Calle Ejemplo 1"` | ✅ | Dirección fiscal. |
| `branding.company_city` | string | `"Madrid"` | ✅ | — |
| `branding.company_postal_code` | string | `"28001"` | ✅ | — |
| `branding.company_country` | string | `"España"` | ✅ | — |
| `branding.primary_color` | color (`#RRGGBB`) | `"#1a1a1a"` | ✅ | Color de la cabecera del PDF. |
| `branding.logo_key` | string (managed) | `""` | ✅ | S3 key del logo en MinIO. **No editable como texto** — `POST /admin/settings/branding/logo` (PNG/JPG). |

### 💬 support.* (soporte y chat)

| Key | Tipo | Default | Estado | Consumidor | Origen |
|-----|------|---------|--------|------------|--------|
| `support.guest_session_ttl_days` | number | 30 | ✅ | `support-cleanup.worker.ts:42` | [ADR-037](../10-decisions/adr-037-arquitectura-dual-chat-tickets.md) · contract.md (sin seed explícito) |
| `support.auto_close_resolved_days` | number | 7 | ✅ | `SupportResolvedAutoCloseService.run()` (Sprint 16 Amendment A1) — tickets en `resolved` >N días → `→closed` silencioso + emit `conversation.auto_closed` (notif al agente que resolvió). Lectura canónica `settingsService.getNumber('support', 'auto_close_resolved_days', 7)`. **Seed actual `seed.ts:32` siembra todavía la key legacy `support.auto_close_days`** — el servicio cae al default 7 hasta que la siembra se renombre (deuda menor — sub-sprint limpieza). | ADR-079 Amendment A1 |
| `support.ai_filter_enabled` | boolean | true | 🟡 | (feature futura — [ADR-057](../10-decisions/adr-057-agentes-ia.md) Sprint 15) | seed.ts:66 |
| `support.maintenance_critical_threshold_days` | number | 60 | ✅ | `MaintenanceCriticalService.run()` (Sprint 8 Fase C) — services activos sin `maintenance_log` >N días → emite `maintenance.critical` al superadmin | seed.ts (Sprint 8 Fase C) |

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

> **Estado tras Sprint 9 Fase D MVP + Sprint 9.5 (2026-04-28 + ADR-042 + ADR-065):**
> - Las plantillas viven en tabla Postgres `notification_templates` (no settings) — seedeadas en `prisma/seeds/notification-templates.ts` con 13 plantillas (`invoice.*`, `task.assigned`, `outbox.event_failed`, `dlq.job_failed`, `system.error` × email + internal). Editables desde `/admin/notifications/templates` con preview en línea.
> - Toggle por evento × canal se expresa con `notification_templates.active = false` por fila (granularidad fina).
> - Las 4 settings de abajo están seedeadas y consumidas activamente desde Sprint 9.5.

| Key | Tipo | Default | Estado | Consumidor | Origen |
|-----|------|---------|--------|------------|--------|
| `notifications.retention_days` | number | 90 | ✅ | `notifications-retention.cron.ts` (`cleanupReadNotifications` `EVERY_DAY_AT_2AM` UTC) — borra `internal` con `read_at < now() - N days` | [ADR-042](../10-decisions/adr-042-sistema-notificaciones.md) · [ADR-060](../10-decisions/adr-060-decisiones-pre-schema.md) · seed.ts |
| `notifications.unread_max_in_dropdown` | number | 50 | ✅ | `NotificationsService.findUnreadForUser()` — limita el `take` del dropdown del Topbar | ADR-042 · seed.ts |
| `notifications.email_enabled_globally` | boolean | true | 🟡 seedeado | (kill switch global futuro de `EmailChannel.isAvailableFor()` — hoy seedeado pero no leído por el canal; uso pendiente para entornos CI/staging sin spam SMTP) | ADR-065 · seed.ts |
| `notifications.maintenance_critical_threshold_days` | number | 7 | 🟡 seedeado, sin consumidor | Reservado para lead time intra-mes pre-cierre del mantenimiento mensual cuando llegue Fase D. **Distinto de `support.maintenance_critical_threshold_days = 60`** (Sprint 8 Fase C, alerta de servicios crónicos sin maintenance_log) | ADR-042 + ADR-041 · seed.ts |

### 📋 tasks.* (Sprint 8 Fase C — ADR-072)

| Key | Tipo | Default | Estado | Consumidor | Origen |
|-----|------|---------|--------|------------|--------|
| `tasks.overdue_to_failure_days` | number | 7 | ✅ | `TasksOverdueService.run()` (cron BullMQ `tasks-overdue` `0 2 * * *` UTC) — tareas con asignado y `due_date < now()-N` pasan a `not_completed_in_time` y emiten `task.overdue` al agente | Sprint 8 Fase C · seed.ts |
| `tasks.unassigned_sla_hours.contact_client` | number | 24 | ✅ | `TasksUnassignedOverdueService.run()` (cron BullMQ `tasks-unassigned-overdue` `0 9 * * *` UTC) — SLA por tipo de tarea en cola pública | [ADR-072](../10-decisions/adr-072-tareas-sin-asignar-cola-publica.md) §4 · seed.ts |
| `tasks.unassigned_sla_hours.maintenance` | number | 12 | ✅ | Igual | ADR-072 · seed.ts |
| `tasks.unassigned_sla_hours.maintenance_management` | number | 12 | ✅ | Igual | ADR-072 · seed.ts |
| `tasks.unassigned_sla_hours.custom_work` | number | 48 | ✅ | Igual | ADR-072 · seed.ts |
| `tasks.unassigned_sla_hours.support_setup` | number | 4 | ✅ | Igual (alta prioridad: tickets de soporte recién escalados) | ADR-072 · seed.ts |
| `tasks.unassigned_sla_hours.default` | number | 24 | ✅ | Fallback global cuando un tipo no tiene entrada específica | ADR-072 · seed.ts |

### 🛠️ infra.* (infraestructura)

| Key | Tipo | Default | Estado | Consumidor | Origen |
|-----|------|---------|--------|------------|--------|
| `infra.safety_margin_ram_pct` | number | 80 | ❌ | (pendiente módulo infrastructure — margen seguridad RAM) | [ADR-043](../10-decisions/adr-043-infraestructura-self-hosted.md) |
| `infra.safety_margin_cpu_pct` | number | 80 | ❌ | (pendiente — margen seguridad CPU) | ADR-043 |
| `infra.safety_margin_disk_pct` | number | 90 | ❌ | (pendiente — margen seguridad disco) | ADR-043 |

### 📦 storage.* (Sprint 11.5 MinIO + ADR-062)

| Key | Tipo | Default | Estado | Consumidor | Origen |
|-----|------|---------|--------|------------|--------|
| `storage.signed_url_expiry_minutes` | number | 60 | ✅ | `core/storage/storage.service.ts:getDefaultTtlSeconds()` | [ADR-062](../10-decisions/adr-062-storage-canonico-minio.md) · seed.ts |
| `storage.max_upload_size_mb` | number | 10 | 🟡 | (validar en uploads externos cuando se implementen Sprints 7.7 y 7.6.3 — adjuntos chat/tickets) | ADR-062 · seed.ts |

### ⚙️ jobs.* (Sprint 9 Fase A — ADR-063)

| Key | Tipo | Default | Estado | Consumidor | Origen |
|-----|------|---------|--------|------------|--------|
| `jobs.default_retries` | number | 5 | ✅ | `core/jobs/jobs.module.ts` defaults | [ADR-063](../10-decisions/adr-063-bullmq-canonico-dlq-retries.md) · seed.ts |
| `jobs.backoff_initial_ms` | number | 30000 | ✅ | `core/jobs/jobs.module.ts` defaults (30s → 60s → 120s → 240s → 480s) | ADR-063 · seed.ts |
| `jobs.dlq_alert_to_superadmin` | boolean | true | ✅ | `core/jobs/dlq.service.ts` (kill switch para entornos test) | ADR-063 · seed.ts |

### 🛡️ audit.* (Sprint 9 Fase E — ADR-017)

| Key | Tipo | Default | Estado | Consumidor | Origen |
|-----|------|---------|--------|------------|--------|
| `audit.access_retention_days` | number | 730 | ✅ | `modules/audit/audit-retention.cron.ts` (mínimo legal AEPD: 2 años) | [ADR-017](../10-decisions/adr-017-audit-log-inmutable.md) · seed.ts |

### 🔌 provisioning.* (Sprint 11 Fase 11.B — ADR-077 + Sprint 15C Fase D — ADR-082/083)

| Key | Tipo | Default | Estado | Consumidor | Origen |
|-----|------|---------|--------|------------|--------|
| `provisioning.service_info_ttl_seconds` | number | 60 | ✅ | `core/provisioning/plugin-utils.ts:getServiceInfoWithCache()` — TTL del cache Redis DB 2 (`aelium-provisioning:service_info:<id>`). Plugins NO gestionan cache; el wrapper lo hace por ellos. ADR-070 §Mecanismo A. | [ADR-077](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md) · seed.ts (Sprint 11 Fase 11.B) |
| `provisioning.default_nameservers` | array&lt;string&gt; | `["ns1.aelium.net","ns2.aelium.net"]` | ✅ Sprint 15C Fase D (seed + consumidores cableados) | NS-sync C3 (fuente de verdad ADR-082 §4). Consumidores cableados Fase D: helper `core/provisioning/dns-authority-resolver.ts` (compara `service.metadata.nameservers` vs default — decide authority `aelium`/`external`); listener `BootstrapEnhanceDefaultsOnPluginInstalledListener` (lo lee al `plugin.installed` slug=`enhance_cp` y propaga al cluster); listener `SyncDefaultNameserversToEnhanceListener` (responde a `provisioning.default_nameservers_changed` propagando C3→C2 idempotentemente vía `EnhanceDnsDefaultsService.applyClusterNameservers`). Lectura via `SettingsService.getJson<readonly string[]>(...)`. **Pendiente**: emisor del evento `provisioning.default_nameservers_changed` que llegará con la UI admin de settings (Sprint 12). C1 (glue records WHOIS) sigue manual. Plugin RC (Sprint 15D) lo leerá al ejecutar `domains/register?ns=...`. | [ADR-082](../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md) §4 + [ADR-083](../10-decisions/adr-083-plugin-enhance-cp-specifics.md) §"Settings canónicos NUEVOS" · seed Sprint 15C Fase D (PR #41, master `a319063`) |
| `provisioning.registrar_parking_nameservers` | array&lt;string&gt; | `["dns1.resellerclub.com","dns2.resellerclub.com"]` ⚠️ PROVISIONAL | ✅ Sprint 15D Fase F.3 (seed + consumidor cableado) | NS de **parking del registrar** para dominios-solo sin hosting (flujo F5, [ADR-082 Amendment A4](../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md#amendments)). Enhance no puede crear una zona DNS sin website + RC rechaza NS que no resuelven → un dominio-solo aparca en estos NS del registrar (que sí resuelven) en vez de los de Aelium. Consumidor: plugin RC en `provision(register)` cuando `ProvisionContext.dnsTargetHint='parking'`. El listener `switch-domain-ns-on-hosting-activated` conmuta a `default_nameservers` al añadir hosting. **⚠️ VALOR PROVISIONAL** — los NS de parking reales de RC son incertidumbre empírica (cuenta OT&E vacía); confirmar en el smoke de Fase G. | [ADR-082 A4](../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md#amendments) · seed Sprint 15D Fase F.3 |
| `provisioning.enhance_cp.reconciliation_alert_threshold` | number | 5 | ✅ Sprint 15C Fase H (consumidor cableado) | Consumidor: `NotificationsOnReconciliationThresholdExceededListener` (Sprint 15C Fase H) — cuenta filas `audit_change_log` con `action='reconciled_external_change'` en últimas 24h `+ 1` (race-tolerant) y, si supera threshold, llama `dispatchToSuperadmins('enhance.reconciliation_threshold_exceeded')`. Productor del evento: `EnhanceReconciliationCron` (`@Cron(EVERY_6_HOURS)` estático). DH-INV-6 doctrine ([ADR-082 §1](../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md)) — Aelium adopta cambios externos pero notifica si el flujo se vuelve patológico (operator pisando Aelium repetidamente). | [ADR-083](../10-decisions/adr-083-plugin-enhance-cp-specifics.md) §6 decisión 24 · seed Sprint 15C Fase D (PR #41, master `a319063`) · consumidor Fase H |
| `provisioning.enhance_cp.reconciliation_last_alert_at` | string (ISO timestamp) | (sin seed inicial — se crea on-demand) | ✅ Sprint 15C Fase H (interno) | **Setting interno** rotated automáticamente por `NotificationsOnReconciliationThresholdExceededListener.markAlerted()` cada vez que dispara una alerta superadmin. Se consulta antes del SQL count para dedupe: si `last_alert_at < now - 24h` → permite re-alertar; si no → skip silencioso. **NO editable admin** (UI debe ocultarlo). Persiste en `settings` table vía `prisma.setting.upsert` directo (NO via `SettingsService.set` — el servicio canónico es read-only). | [ADR-083](../10-decisions/adr-083-plugin-enhance-cp-specifics.md) §6 decisión 24 · Sprint 15C Fase H (PR [#49](https://github.com/yasmindanailov/dashboard/pull/49), master `1efeb83`) |

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
