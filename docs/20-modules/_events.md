# Catálogo de eventos del sistema

> 📜 **DOCTRINA CANÓNICA VIGENTE: [ADR-079](../10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md) + Amendments A1/A2/A3 (Sprint 16 cerrado 2026-05-02).** El dominio `tasks`/`client_notes` adopta el contrato canónico: 5 listeners cross-sistema (`ClientLifecycleTaskCreatorListener`, `TasksOnSlotReleasedListener`, `TasksOnServiceCancelledListener`, `SupportTicketTaskCreatorListener` adaptado, `ProvisioningOnTaskCompletedListener` filtrando por capabilities). **3 eventos nuevos en `conversation.*`** (Amendment A1 lifecycle ticket): `conversation.resolved`, `conversation.reactivated`, `conversation.auto_closed`. Listeners adaptados: `SupportTicketTaskCreatorListener.handleAssigned` consume tanto `conversation.assigned` como `conversation.reactivated`; reasignación humana de tasks queda restringida a superadmin (Amendment A2). Lifecycle chat reducido a terminal único `resolved` con ClientNote canónica `source_system='chat'` (Amendment A3).

> **Fuente única de verdad** sobre qué eventos existen en Aelium Dashboard, quién los emite, quién los consume y qué payload llevan.
>
> Cada vez que un módulo emite un `eventEmitter.emit(...)` debe corresponderse con una entrada aquí. Cada `@OnEvent(...)` también.
>
> Detectar drift entre código y este catálogo es responsabilidad de cualquier agente IA que toque el módulo afectado.

> **Última auditoría:** 2026-05-08 (Sprint 15C Fase 15C.D cerrada + mergeada a master `a319063` — introduce **1 evento aspiracional nuevo** `provisioning.default_nameservers_changed` en sección `provisioning.*` con listener canónico `SyncDefaultNameserversToEnhanceListener` ya escrito + testeado, pendiente del emisor que llegará con la UI admin de settings en Sprint 12. Los 2 eventos `service.*` declarados en Fase 15C.A siguen aspiracionales; emisión + listeners llegan en Fases F + H). Historial: 2026-05-07 (Sprint 15C Fase 15C.A — 2 eventos `service.*` aspiracionales declarados en ADR-083 §6 decisión 24 + §4 decisión 14); 2026-05-03 post Sprint 16 cierre Fase 16.E; 2026-04-26 P0.2 (Outbox `invoice.*`); 2026-04-27 Sprint 9 (BullMQ dispatcher + eventos operativos `outbox.event_failed`/`dlq.job_failed`/`system.error`); 2026-04-28 Sprint 9.5 (consumidor `system.error`); 2026-05-01 Sprint 8 Fase C/D (`task.overdue`/`task.unassigned_overdue`/`maintenance.critical` + 4 `support_inside.*`); 2026-05-02 Sprint 11 (5 eventos `service.*` nuevos + consumidor canónico `invoice.paid`).
> **Sprint 15C (2026-05-07) cambios canónicos declarados (Fase 15C.A doc-only):** **2 eventos `service.*` nuevos aspiracionales** — `service.admin_sso_impersonation` (admin Aelium hace impersonation real al panel del proveedor; flag GDPR `gdpr_visible_to_data_subject=true` + portal RGPD lo expone al cliente) + `service.reconciled_external_change` (cron `reconcile-enhance-services` detecta divergencia subscription/status/plan en Enhance vs Aelium; DH-INV-6 doctrine ADR-082 §1 — Aelium adopta + alerta superadmin si threshold superado). Ver [ADR-083](../10-decisions/adr-083-plugin-enhance-cp-specifics.md) §4 decisión 14 + §6 decisión 24. Emisión + listeners: Sprint 15C Fases F + H.
> **Sprint 15C Fase 15C.D (2026-05-08) cambios canónicos:** **1 evento `provisioning.*` nuevo aspiracional** — `provisioning.default_nameservers_changed` (NS-sync C3 → C2 cuando superadmin edita el setting `provisioning.default_nameservers`). Listener canónico `SyncDefaultNameserversToEnhanceListener` (ADR-082 §4) ya escrito + testeado; pendiente del emisor que llegará con la UI admin de settings (Sprint 12). El listener degrada elegante si Enhance API falla. Ver sección `provisioning.*` abajo.
> **Sprint 16 (2026-05-02) cambios canónicos:** **3 eventos `conversation.*` nuevos** introducidos por Amendment A1 (`conversation.resolved` / `conversation.reactivated` / `conversation.auto_closed`); 5 listeners cross-sistema adaptados/nuevos en el dominio `tasks` (`ClientLifecycleTaskCreatorListener`, `TasksOnSlotReleasedListener`, `TasksOnServiceCancelledListener`, `SupportTicketTaskCreatorListener` consume `conversation.assigned` + `conversation.reactivated`, `ProvisioningOnTaskCompletedListener` filtra por `capabilities.completes_via_task`); ClientNote canónica `source_system='chat'` añade emisor en cierre/escalación de chats (Amendment A3); cron `support-resolved-auto-close` 02:30 UTC emite `conversation.auto_closed` (DC.33 cerrada).
> **Total eventos identificados:** 38 (35 de negocio + 3 operativos activos + 1 aspiracional `notification.dispatched`).
>
> ⚠️ **Corrección auditoría 2026-06-21:** los conteos de este catálogo están **desincronizados** — el propio doc se contradice (38 aquí vs 28 en el resumen ejecutivo; huérfanos 14 vs 15). El grep real da **~56 emisiones distintas** y **~11 huérfanos reales**, y varios `auth.*` marcados "huérfano esperando audit" **YA los consume** `audit-auth.listener.ts` desde Sprint 13.5. Pendiente reconciliar con el script de CI que este doc propone (§"Cómo se valida"). **No te fíes de los números absolutos** hasta esa reconciliación.
> **Convenio de naming:** `<dominio>.<acción>` en pasado. Verificado 100% conforme.
> **Bus:** `EventEmitter2` global (NestJS `@nestjs/event-emitter`) — los emisores críticos producen vía `OutboxService.enqueue(tx, ...)` y el `OutboxWorker.dispatch()` (invocado por `OutboxDispatchProcessor`, cola BullMQ `outbox-dispatch` con `repeat: { every: 5000 }` + `FOR UPDATE SKIP LOCKED`) los despacha al bus. ADR-064 cierra el §7 de ADR-033.
> **Outbox Pattern:** ✅ **11 eventos** — `invoice.created/paid/failed/overdue` + `domain.registered` (15D.D) + `domain.renewed`/`domain.expired`/`domain.entered_redemption` (15D.E) + `domain.nameservers_changed`/`privacy_changed`/`lock_changed` (15D.F.1). Pendientes `service.*` y `partner.*` (bajo P-DEPLOY) — ADR-033 + auditoría 2026-06-21 (MEDIUM-1: `service.*` ya accionable).

---

## Resumen ejecutivo

| Métrica | Valor |
|---------|-------|
| Eventos totales | 28 (de negocio) |
| Dominios | 7 (auth, checkout, conversation, invoice, message, service, task/maintenance) |
| Eventos con consumidor activo | 14 |
| **Eventos huérfanos (sin listener)** | **14** |
| Eventos con múltiples consumidores | 3 (`conversation.created`, `conversation.assigned`, `message.created`) |
| Listeners únicos | 8 (`billing-email`, `support-email`, `support-websocket`, `support-guest-link`, `tasks-email`, `MaintenanceCompletedListener`, `TasksOverdueListener`, `TasksUnassignedOverdueListener`, `MaintenanceCriticalListener`) |
| **Eventos críticos sin Outbox** | **9 / 13** — pendientes `service.*` (4), `checkout.completed`, `partner.*` (4 futuros). Cerrados `invoice.*` (4) en P0.2. Los `task.*` operativos (overdue/unassigned_overdue/maintenance.critical) NO requieren Outbox (alertas, no transacciones). |

### Diagnóstico de los 15 eventos huérfanos

No es necesariamente bug. Pueden ser:

1. **Hooks aspiracionales** — emitidos para que listeners futuros se enganchen sin tocar el código que emite (común en `auth.*`).
2. **Features incompletas** — el listener está planificado pero aún no implementado (caso de `service.*` esperando provisioning module).
3. **Código realmente muerto** — emisión que nadie nunca tendrá interés en escuchar (revisar y borrar).

Se ha clasificado cada evento huérfano abajo en la columna "Estado".

---

## Eventos operativos (cross-cutting)

Eventos sin dominio de negocio — emitidos por la infraestructura para alertas / monitoring.

| Evento | Emisor | Consumidores | Payload | Outbox | Estado |
|--------|--------|--------------|---------|--------|--------|
| `outbox.event_failed` | `OutboxWorker.processEvent()` cuando `retry_count >= max_retries` | `notifications-outbox.listener` → `NotificationsService.dispatchToSuperadmins` (campana + email — ADR-065) | `{ event_outbox_id, event_type, last_error, retry_count }` | no (es alerta operativa, no transacción) | ✅ emisor + consumidor activos (Sprint 9 Fases C+D — ADR-064 + ADR-065) |
| `dlq.job_failed` | `DlqService.handleFailed()` cuando un job BullMQ agota `attempts` | `notifications-dlq.listener` → `NotificationsService.dispatchToSuperadmins` (campana + email — ADR-065) | `{ failed_job_id, queue, name, last_error, attempts_made }` | no | ✅ emisor + consumidor activos (Sprint 9 Fases A+D — ADR-063 + ADR-065) |
| `system.error` | `ErrorLogService.log()` desde jobs/listeners no-HTTP. Para errores HTTP 5xx el `GlobalExceptionFilter` escribe directo a `error_log` sin emit (no necesita alerta — el admin ve en `/admin/error-log`) | `notifications-system-error.listener` → `NotificationsService.dispatchToSuperadmins` (campana + email vía plantilla `system.error` seedeada). Guard anti-loop hard: si `module` proviene del dominio notifications, el listener log + drop (EC-S9-07) | `{ error_log_id, level, module, message, correlation_id }` | no | ✅ emisor + consumidor activos (Sprint 9 Fase F + Sprint 9.5 — ADR-055 + ADR-065) |
| `notification.dispatched` | _(no implementado)_ — declarado en ADR-065 §3.2 como hook futuro para que `audit-notification.listener` registre integraciones en `audit_change_log`. Difere al sprint que aborde audit de integraciones (Stripe/ResellerClub/Docker) | — | `{ notification_id, event_type, channel, recipient_id }` | no | ⬜ aspiracional — declarado, no emitido |

---

## Catálogo completo (alfabético)

### 🔐 auth.*

| Evento | Emisor | Consumidores | Payload | Outbox | Estado |
|--------|--------|--------------|---------|--------|--------|
| `auth.2fa_required` | `auth-login.service.ts:initiate2fa()` | — | `{ userId }` | no | 🟡 huérfano (hook aspiracional para audit/notifications futuro) |
| `auth.account_blocked` | `auth-login.service.ts:handleFailedLogin()` | — | `{ userId, attempts }` | no | 🟡 huérfano (debería notificar al superadmin → R7) |
| `auth.email_verified` | `auth-register.service.ts:verifyEmail()` | — | `{ userId }` | no | 🟡 huérfano |
| `auth.login_failed` | `auth-login.service.ts:handleFailedLogin()` | — | `{ userId, attempt }` | no | 🟡 huérfano (audit log) |
| `auth.login_success` | `auth-token.service.ts:issueTokens()` | — | `{ userId }` | no | 🟡 huérfano (audit log) |
| `auth.password_reset` | `auth-recovery.service.ts:resetPassword()` | — | `{ userId }` | no | 🟡 huérfano (audit log) |
| `auth.registered` | `auth-register.service.ts:register()` | `support-guest-link.listener` | `{ userId, email }` | no | ✅ con consumidor (vincula chats guest previos) |
| `auth.session_closed` | `auth-token.service.ts:logout()`, `revokeSession()` | — | `{ userId, sessionId? }` | no | 🟡 huérfano (audit log) |

**Análisis del dominio auth:**
La mayoría de eventos `auth.*` se emiten "por si acaso" pero ningún listener los consume. Esto es **deuda controlada**: cuando se implemente el módulo `audit` (stub hoy), estos serán sus consumidores naturales. NO eliminar.

---

### 💳 invoice.*

| Evento | Emisor | Consumidores | Payload | Outbox | Estado |
|--------|--------|--------------|---------|--------|--------|
| `invoice.created` | `billing-invoice.service.ts:createInvoice()` | `billing-email.listener` | `{ invoice_id, invoice_number, user_id, total, currency }` | **sí** | ✅ con consumidor — Outbox vía `OutboxService.enqueue(tx, ...)` |
| `invoice.paid` | `billing-invoice.service.ts:markAsPaid()` | `billing-email.listener` | `{ invoice_id, invoice_number, user_id, total, currency, payment_provider }` | **sí** | ✅ con consumidor — Outbox |
| `invoice.failed` | `billing-lifecycle.worker.ts:retryOverduePayments()` | `billing-email.listener` | `{ invoice_id, invoice_number, user_id, retry_count, max_retries }` | **sí** | ✅ con consumidor — Outbox |
| `invoice.overdue` | `billing-invoice.service.ts:markAsOverdue()` | `billing-email.listener` | `{ invoice_id, invoice_number, user_id, total, retry_count, max_retries }` | **sí** | ✅ con consumidor — Outbox |

**Análisis del dominio invoice:**
**Cerrado P0.2 (2026-04-26):** los 4 eventos `invoice.*` se persisten en `event_outbox` dentro de la misma transacción que el cambio de estado de la factura. El `OutboxWorker` (`@Interval(5s)`, `FOR UPDATE SKIP LOCKED`) los despacha al bus con semántica at-least-once: si el proceso muere entre commit y emit, el evento queda en `pending` y se reintenta al arrancar (R8 + ADR-033).

---

### 💼 checkout.*

| Evento | Emisor | Consumidores | Payload | Outbox | Estado |
|--------|--------|--------------|---------|--------|--------|
| `checkout.completed` | `billing-checkout.service.ts:checkout()` | — | `{ user_id, service_id, invoice_id, product_name, total }` | no | 🟠 huérfano (cuando exista provisioning, lo escuchará para activar el servicio) |

**Análisis:** crítico cuando se implemente el módulo `provisioning`. Por ahora, la activación es manual (admin marca factura como pagada → invoice.paid → cliente notificado). Provisioning automático = consumir `checkout.completed` o `invoice.paid`.

---

### 🔧 service.*

| Evento | Emisor | Consumidores | Payload | Outbox | Estado |
|--------|--------|--------------|---------|--------|--------|
| `service.provisioned` | `BillingCheckoutService.checkout()` (legacy histórico — Sprint 8 D.12.9 lo emite al CREAR el service, antes del provisioning real) | `SupportInsideOnServiceProvisionedListener` | `{ service_id, user_id, product_id, product_type }` | no | ✅ consumido (ADR-076 — coexiste con `service.activated` Sprint 11) |
| `service.activated` | `ProvisioningOrchestratorService.markActive()` (Sprint 11 Fase 11.B — emitido CUANDO `services.status` pasa a `'active'` tras `plugin.provision()` exitoso) | **`ClientLifecycleTaskCreatorListener`** (Sprint 16) → task `client_lifecycle` primer servicio · `ReconcileDnsDefaultsOnServiceActivatedListener` (15C — reconcile zona hosting) · **`SwitchDomainNsOnHostingActivatedListener`** (15D.F.3 — si el activado es hosting, conmuta a Aelium los NS de un dominio hermano aparcado; [ADR-082 A4](../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md#amendments)). (Plugins reales 15A-G consumen este evento, NO `service.provisioned`.) | `{ service_id, user_id, correlation_id }` | no | ✅ consumidores Sprint 16 + 15C + 15D.F.3 |
| `service.provisioning_failed` | `ProvisioningOrchestratorService.provisionService()` cuando plugin lanza error no-retriable o no está registrado (Sprint 11 Fase 11.B) | (pendiente listener `notifications` — alerta superadmin) | `{ service_id, user_id, provisioner_slug, reason, correlation_id }` | no | 🟡 emitido sin consumidor todavía (Fase 11.E lo cierra cuando se cree el listener notifications) |
| `service.metrics_fetched` | Wrapper `getServiceInfoWithCache` en cache miss (Sprint 11 Fase 11.B) | (pendiente listener `audit` — RGPD: cliente sabe cuándo se consultó al proveedor) | `{ service_id, user_id, provisioner_slug, fetched_at, source_latency_ms }` | no | 🟡 emitido sin consumidor todavía (Fase 11.D/E) |
| `service.action_executed` | Wrapper `executeActionWithCacheInvalidation` (Sprint 11 Fase 11.B) | (pendiente listener `audit` + opcional `notifications` para acciones destructivas) | `{ service_id, user_id, actor_user_id, provisioner_slug, action_slug, success, side_effects, destructive, ip }` | no | 🟡 emitido sin consumidor todavía (Fase 11.D/E) |
| `service.sso_opened` | Wrapper `getSsoUrlWithAudit` tras SSO exitoso (Sprint 11 Fase 11.B) | (pendiente listener `audit` — RGPD) | `{ service_id, user_id, actor_user_id, provisioner_slug, panel_label, ip }` | no | 🟡 emitido sin consumidor todavía (Fase 11.D/E) |
| `service.action_admin_only_violation` ⭐ | Wrapper `executeActionWithCacheInvalidation` cuando un actor no-admin invoca una `ServiceAction.adminOnly=true` (Sprint 15C Fase 15C.E — [ADR-077 Amendment A3](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md#amendments) + [ADR-083 Amendment A3](../10-decisions/adr-083-plugin-enhance-cp-specifics.md#amendments)). Co-emitido junto a `audit.logAccess(action='service.action_admin_only_violation')` y `ForbiddenException` HTTP 403. | (pendiente listener `notifications-on-admin-only-violation` Sprint 13 hardening — alerta superadmin si N violaciones / hora > threshold; portal RGPD `/dashboard/transparency` lo lista) | `{ service_id, user_id, actor_user_id, provisioner_slug, action_slug, ip }` | no | ⬜ emitido Sprint 15C Fase 15C.E (defensa profunda + visibilidad operativa de intentos) |
| `service.cancelled` | `service-lifecycle.worker.ts:autoCancelServices()` | **`tasks-on-service-cancelled.listener`** (Sprint 16) → cancela task `provisioning_manual` huérfana con `source_id=service_id` | `{ service_id, user_id, reason }` | no | ✅ consumido por tasks (cancelación cross-sistema). Pendiente listener provisioning para `plugin.deprovision` cuando llegue plugin con efecto real (Sprint 15E) |
| `service.admin_sso_impersonation` ⭐ | `getSsoUrlWithAudit` cuando `actorIsAdmin && service.user_id !== actorUserId` (predicado canónico — admin abriendo su propio servicio NO emite, solo `service.sso_opened`). Sprint 15C Fase 15C.F — [ADR-083 §4 decisión 14](../10-decisions/adr-083-plugin-enhance-cp-specifics.md) + [Amendment A2](../10-decisions/adr-083-plugin-enhance-cp-specifics.md#amendments) (`client_id` → `user_id`). | **`AuditAdminSsoImpersonationListener`** (Sprint 15C Fase 15C.F) → persiste en `audit_access_log` con `action='admin_sso_impersonation'` + `metadata.target_user_id = service.user_id`. Portal RGPD `/dashboard/transparency` lo lista al cliente afectado (filter `TRANSPARENCY_VISIBLE_ACTIONS` extendido en `audit.controller.ts`). | `{ service_id, user_id, agent_user_id, agent_ip, agent_user_agent, provisioner_slug, panel_label, opened_at, gdpr_visible_to_data_subject: true }` | no | ✅ consumido Sprint 15C Fase F (listener + transparency UI) |
| `service.reconciled_external_change` ⭐ | `EnhanceReconciliationCron` (BullMQ-less @Cron EVERY_6_HOURS) cuando detecta divergencia comparando Enhance subscription vs Aelium-side (Sprint 15C Fase 15C.H — [ADR-083 §6 decisión 24](../10-decisions/adr-083-plugin-enhance-cp-specifics.md) + DH-INV-6 [ADR-082 §1](../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md)). 3 sub-tipos: `subscription_missing` (404 Enhance), `status_divergence` (Aelium adopta status Enhance auto si `active`/`suspended`; emit-only fuera del set safe-adopt), `plan_divergence` (compara contra `service.metadata.enhance_plan_id`, NO contra `Product.provisioner_config` — A4 doctrina Fase H). | **`AuditOnServiceReconciledExternalChangeListener`** (Sprint 15C Fase 15C.H) → persiste en `audit_change_log` con `user_id=null` (sistema), `entity='Service'`, `action='reconciled_external_change'`, `changes_after._meta.gdpr_visible_to_data_subject` (true para `subscription_missing`/`status_divergence`, false para `plan_divergence` por billing implication). **`NotificationsOnReconciliationThresholdExceededListener`** (Sprint 15C Fase 15C.H) → SQL count `audit_change_log` últimas 24h `+ 1` (race-tolerant) contra setting `provisioning.enhance_cp.reconciliation_alert_threshold` (default 5). Si excede → `dispatchToSuperadmins('enhance.reconciliation_threshold_exceeded')` + dedupe via setting interno `enhance_cp.reconciliation_last_alert_at` (ventana 24h). | `{ service_id, user_id, plugin_slug, change_type: 'subscription_missing'\|'status_divergence'\|'plan_divergence', expected, actual, detected_at }` | no | ✅ consumido Sprint 15C Fase H (cron + 2 listeners + bug fix `actionChangePackage` actualiza metadata) |
| `service.paused` | `subscription.service.ts:pauseService()` | — | `{ service_id, user_id, pause_max_date }` | no | 🟠 huérfano (provisioning → pausar instancia) |
| `service.resumed` | `subscription.service.ts:resumeService()`, `service-lifecycle.worker.ts:checkPauseExpiration()` | — | `{ service_id, user_id, reason }` | no | 🟠 huérfano (provisioning → reactivar). NO confundir con `service.unsuspended` (Fase F) — `service.resumed` es del flujo *pause* (cliente pausa voluntariamente / expiración de pausa); `service.unsuspended` es del flujo *suspend* admin. Unificarlos es un diferido (ver `service.unsuspended` abajo). |
| `service.suspended` ⭐ | **Emisor único canónico** (unificado en Sprint 15C.II Fase F.5 — `DC.44`; [ADR-077 Amendment A4.5](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md#a45-materialización-sprint-15cii-fase-f1-2026-05-12)): `ProvisioningService.suspendAsAdmin` (tras la inline action `suspend_service` del plugin si lo modela + `prisma.service.update(status='suspended', suspended_at, suspension_reason)`), invocado por (a) el admin (`POST /admin/services/:id/suspend` — `actor_user_id` = el admin) y (b) el cron de impago `ServiceLifecycleWorker.autoSuspendServices()` (diario 03:00, impago vencido con retries agotados — desde F.5 delega en `suspendAsAdmin` con `reason:'overdue_payment'`, `internal_note:'Factura N'`, `actorUserId: null` + `actorLabel:'system:billing-overdue-cron'`, `allowUnsupported: true`). | **`NotificationsOnServiceSuspendedListener`** (Sprint 15C.II Fase F) → si `notify_client !== false`: `dispatchToUser('service.suspended', {domain, reason_label, is_overdue_payment, is_maintenance, billing_url, support_url}, user_id)`. Email cliente-seguro (etiqueta localizada del motivo canónico, NUNCA la nota interna) + CTA ramificado por motivo (regulariza pago / soporte / nada para mantenimiento). `normalizeReason` valida defensivamente. Patrón L11+L12, R7. | `{ service_id, user_id, provisioner_slug, reason: SuspensionReason, actor_user_id: string\|null, actor?: 'system:...', suspended_at, notify_client }` | no | ✅ consumido Sprint 15C.II Fase F (listener email + campana) |
| `service.quota_threshold_crossed` ⭐ | **`QuotaThresholdDetectorService.detectAndNotify`** (Sprint 15C.II Fase F.8 — `core/provisioning/`, transversal heredable a todo plugin con `has_metrics`) invocado desde el cron de reconciliación L3 del plugin (Enhance: `EnhanceReconciliationCron.runAsExecutor` tras la pasada `runOnce()`). Edge-triggered: emite SOLO en la transición `<threshold → ≥threshold` (`crossed_up`); las pasadas consecutivas que siguen above NO re-emiten (la fila previa `ServiceQuotaAlert.kind='crossed_up'` actúa como flag). Cuando vuelve `<threshold` se inserta `crossed_down` sin emit (state-tracking). Threshold leído del manifest del plugin (`plugin_installs.config.quota_alert_threshold_pct`, default 85, `minimum:50/maximum:95` — ADR-080). | **`NotificationsOnServiceQuotaThresholdCrossedListener`** (Sprint 15C.II Fase F.8) → `dispatchToUser('service.quota_threshold_crossed', {domain, used_pct, used_mb_label, total_mb_label, service_url, support_url}, user_id)`. Email + campana con plantilla seedeada (subject `⚠ Estás al X% de almacenamiento en {domain}`). Patrón L11+L12, R7 (try/catch que loguea + traga; la fila `ServiceQuotaAlert` ya capturó el state). | `{ service_id, user_id, plugin_slug, resource: 'disk', used_pct, threshold_pct, used_mb, total_mb, detected_at }` (F.8: solo `resource='disk'`; bandwidth diferido — el reset mensual rompe el edge-trigger, requerirá handler especial al promocionarse) | no | ✅ consumido Sprint 15C.II Fase F.8 (detector + listener email + campana + tabla `service_quota_alerts` con FK + 2 enums Prisma `QuotaAlertResource`/`QuotaAlertKind`) |
| `service.unsuspended` ⭐ | **Emisor único canónico** ([ADR-077 Amendment A4.5](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md#a45-materialización-sprint-15cii-fase-f1-2026-05-12)): `ProvisioningService.unsuspendAsAdmin` (tras la inline action `unsuspend_service` del plugin si lo modela + `prisma.service.update(status='active', suspended_at=null, suspension_reason=null)`), invocado por (a) el admin (`POST /admin/services/:id/unsuspend` — `actor_user_id` = el admin) y (b) la auto-reactivación al pagar (Sprint 15C.II Fase F.5 — `ReactivateServicesOnInvoicePaidListener` `@OnEvent('invoice.paid')` → `ProvisioningService.reactivateSuspendedServiceOnPayment(serviceId)` → si el servicio está `suspended` con motivo `overdue_payment` → `unsuspendAsAdmin(serviceId, null, undefined, {actorLabel:'system:billing-on-invoice-paid', allowUnsupported:true})`). | **`NotificationsOnServiceUnsuspendedListener`** (Sprint 15C.II Fase F) → siempre `dispatchToUser('service.unsuspended', {domain, panel_url}, user_id)` ("tu servicio vuelve a estar activo" — sin toggle de supresión). Patrón L11+L12, R7. | `{ service_id, user_id, provisioner_slug, actor_user_id: string\|null, actor?: 'system:...', previous_suspension_reason }` | no | ✅ consumido Sprint 15C.II Fase F (listener email + campana) |

**Análisis del dominio service (actualizado 2026-05-02 — Sprint 11 cerrado al 100%):**
- **Coexistencia `service.provisioned` ↔ `service.activated`**: el evento histórico `service.provisioned` lo emite `BillingCheckoutService` al CREAR el service (antes del provisioning real); lo consume `SupportInsideOnServiceProvisionedListener` (ADR-076). El evento NUEVO `service.activated` lo emite el orquestador Sprint 11 cuando confirma `services.status='active'` tras `plugin.provision()` exitoso. Plugins reales Sprint 15 consumen `service.activated`, NO `service.provisioned`. Decisión local documentada en docstring de `ProvisioningOrchestratorService` y en [`completed/sprint-11-provisioning.md`](../60-roadmap/completed/sprint-11-provisioning.md).
- **5 eventos `service.*` nuevos Sprint 11 emitidos correctamente** por orquestador + wrappers (Fase 11.B). `provisioning_failed` / `metrics_fetched` / `action_executed` / `sso_opened` permanecen sin consumidor todavía: cierre Fase 11.E **no añade los listeners** porque (a) la transparencia RGPD ya vive en `/dashboard/transparency` desde Sprint 9, (b) ningún plugin con coste de fallo significativo está en producción todavía. **Cuándo enchufar:** Sprint 12 (Settings + KB) o cuando llegue primer plugin real (Sprint 15A-G) — el pipeline está intacto, sólo falta `@OnEvent('service.*')`.
- **`service.cancelled` consumido por `tasks` (Sprint 16) + `notifications-on-service-cancelled` (Sprint 15C.II Fase E). `service.suspended`/`service.unsuspended` consumidos por sus listeners email (Sprint 15C.II Fase F — ADR-077 Amendment A4.5). `service.paused`/`service.resumed` siguen huérfanos** — son del flujo *pause* (cliente pausa voluntariamente); los plugins triviales no necesitan acción real al pausar. Cuando un plugin tenga efecto real al pausar, el orquestador añadirá el listener correspondiente.
- **`service.suspended` — emisor único desde Sprint 15C.II Fase F.5** (`DC.44` materializado): `autoSuspendServices` ya no hace su propio `prisma.service.update` + emit directo — delega en `ProvisioningService.suspendAsAdmin` (`reason: 'overdue_payment'` + actor sistema `'system:billing-overdue-cron'` + `allowUnsupported: true` para plugins sin `supports_suspend`). Misma forma del evento que la suspensión manual del admin (`actor_user_id` = null para el cron + `actor: 'system:...'`). Auto-reactivación al pagar reusa `unsuspendAsAdmin` vía `ReactivateServicesOnInvoicePaidListener` (`invoice.paid` → solo reactiva los `suspended` con motivo `overdue_payment`). **Convención "actor sistema"** (taxonomía `system:<dominio>-<cron|job>`): `actorUserId: null` + `opts.actorLabel` → `audit_change_log.changes_after.actor` + el evento lleva `actor`; sin `audit_access_log` (no hay "lectura staff"). Sigue diferido (no es bug): `service.resumed` (pause) ↔ `service.unsuspended` (suspend) — conceptos distintos; y `autoCancelServices` aún hace su propio `prisma.update` (migrarlo a `deprovisionAsAdmin` sería destructivo — candidato a fase aparte).

---

### 💬 conversation.*

| Evento | Emisor | Consumidores | Payload | Outbox | Estado |
|--------|--------|--------------|---------|--------|--------|
| `conversation.assigned` | `support-message.service.ts:updateConversation()` | `support-email.listener`, `support-websocket.listener`, **`SupportTicketTaskCreatorListener.handleAssigned`** (solo `type='ticket'`) | `{ conversation_id, agent_id, agent_name, assigned_by }` | no | ✅ con 3 consumidores (Sprint 16: `tasks` listener consume para crear bridge task `support_ticket`) |
| `conversation.unassigned` | `support-message.service.ts:updateConversation({assigned_agent_id: null})` | `SupportTicketTaskCreatorListener.handleUnassigned` | `{ conversation_id, previous_agent_id }` | no | ✅ consumido (Sprint 8 Fase B.10.fix2 — cancela task bridge con `skipTicketRelease`) |
| `conversation.created` | `support-chat.service.ts:createUserChat()`, `createGuestChat()`, `support-ticket.service.ts:emitCreated()` | `support-email.listener`, `support-websocket.listener` | `{ conversation_id, type, user_id, user_name, user_email, subject, channel, is_guest? }` | no | ✅ con 2 consumidores |
| **`conversation.resolved`** (Sprint 16 Amendment A1) | `support-message.service.ts:updateConversation({status='resolved'})` | `notifications-conversation-resolved.listener` (cliente recibe email + campana CTA al ticket) | `{ conversation_id, type, user_id, agent_id, resolved_at }` | no — deuda futura | ✅ consumido (DC.33 cerrada Fase 16.E — plantilla `conversation.resolved` seedeada) |
| **`conversation.reactivated`** (Sprint 16 Amendment A1) | `support-message.service.ts:addMessage()` cuando cliente envía mensaje a ticket `resolved` (`reason='client_replied'`); `support-message.service.ts:updateConversation({status:'open'})` cuando admin reabre `closed → open` (`reason='admin_reopened'`). **Reemplaza patrón legacy ADR-074 EC#3** que reusaba `conversation.assigned`. | `SupportTicketTaskCreatorListener.handleAssigned` (reuse) → crea task NUEVA bridge | `{ conversation_id, agent_id (nullable), reason: 'client_replied' \| 'admin_reopened' }` | no | ✅ consumido (Sprint 16 Fase 16.C — el listener reuse no necesita un nuevo handler) |
| **`conversation.auto_closed`** (Sprint 16 Amendment A1) | `support-resolved-auto-close.service.ts:run()` (cron BullMQ scheduled `30 2 * * *` UTC) cuando ticket en `resolved` >`support.auto_close_resolved_days` (default 7) → `→closed` silencioso. | `notifications-conversation-auto-closed.listener` (agente que resolvió recibe email + campana) | `{ conversation_id, sequence, agent_id, resolved_at, closed_at }` | no — operativo | ✅ consumido (DC.33 cerrada Fase 16.E — plantilla `conversation.auto_closed` seedeada) |

---

### 📨 message.*

| Evento | Emisor | Consumidores | Payload | Outbox | Estado |
|--------|--------|--------------|---------|--------|--------|
| `message.created` | `support-message.service.ts:addMessage()` | `support-email.listener`, `support-websocket.listener` | `{ conversation_id, message_id, sender_type, sender_id, is_internal, user_id, type }` | no | ✅ con 2 consumidores |

---

### 📋 task.* / maintenance.*

| Evento | Emisor | Consumidores | Payload | Outbox | Estado |
|--------|--------|--------------|---------|--------|--------|
| `task.created` | Listeners cross-sistema canónicos Sprint 16: `SupportTicketTaskCreatorListener`, `MaintenanceMonthlyService`, `ProvisioningOrchestratorService` (followUp `create_setup_task`), `ClientLifecycleTaskCreatorListener`, endpoint `promote-to-task` (Sprint 22). | — | `{ task }` con `source_system`/`source_id` polimórficos | no | 🟡 huérfano (audit futuro Sprint 9 Fase E EC-T8-44) |
| `task.assigned` | `tasks.service.ts:assign()` (incluye auto-asignación helper `core/tasks/auto-assign.ts`) y reasignación canónica superadmin (Amendment A2). | `tasks-email.listener` | `{ task, assignedBy }` | no — deuda EC-T8-28 / P-DEPLOY.4 | ✅ consumido (email + notification al agente vía `NotificationsService`) |
| `task.completed` | `tasks.service.ts:complete()`, `complete-ticket-bridge()`, `MaintenanceLogService.recordCompletion()` | `task-completed.listener` (Sprint 8 Fase B.9) | `{ task, completedBy }` | no | ✅ consumido (notifica cliente vía email + campana SI hay `clientNotes` y `source_system ≠ support_inside_slot`) |
| `maintenance.completed` | `MaintenanceLogService.recordCompletion()` post-commit (Sprint 8 Fase B.5) | `MaintenanceCompletedListener` | `{ taskId, maintenanceLogId, serviceId, clientId, monthYear, completedBy, completedAt, notes }` | no — deuda P-DEPLOY.4 | ✅ consumido (email + campana al cliente vía `NotificationsService`, plantilla seedeada) |
| `task.overdue` | `TasksOverdueService.run()` (cron BullMQ `tasks-overdue` `0 2 * * *` UTC, Sprint 8 Fase C 2026-05-01) | `TasksOverdueListener` → `NotificationsService.dispatchToUser` | `{ task_id, task_title, task_type, task_type_label, task_priority, task_priority_label, task_url, action_url, due_date_label, days_overdue, assigned_to }` | no — operativo (no de negocio) | ✅ consumido (email + campana al agente con plantilla seedeada) |
| `task.unassigned_overdue` | `TasksUnassignedOverdueService.run()` (cron BullMQ `tasks-unassigned-overdue` `0 9 * * *` UTC, [ADR-072](../10-decisions/adr-072-tareas-sin-asignar-cola-publica.md), Sprint 8 Fase C 2026-05-01) | `TasksUnassignedOverdueListener` → `NotificationsService.dispatchToSuperadmins` | `{ total, oldest_age_hours, by_type, task_ids, summary }` | no — operativo | ✅ consumido (email + campana al superadmin con resumen agregado pre-renderizado) |
| `maintenance.critical` | `MaintenanceCriticalService.run()` (cron BullMQ `maintenance-critical` `0 8 * * *` UTC, Sprint 8 Fase C 2026-05-01) | `MaintenanceCriticalListener` → `NotificationsService.dispatchToSuperadmins` | `{ total, threshold_days, service_ids, summary }` | no — operativo | ✅ consumido (email + campana al superadmin; degradación elegante: total=0 mientras Fase D no introduzca service_checklist_items) |

**Análisis del dominio task / maintenance** (estado tras Sprint 8 Fase B cerrado 2026-04-29):

- ✅ **`task.assigned`**: cerrado P0.1 (2026-04-26) + plantilla sin enums crudos en B.1.bis (`task_type_label`/`task_priority_label`). Cobertura E2E en `tests/e2e/tasks.spec.ts` + `tests/e2e/notifications.spec.ts`.
- ✅ **`task.completed`**: el evento se emite en 3 sitios (update directo, `complete()` legacy, `MaintenanceLogService` Fase B.5). **Sin consumidor todavía** — el listener `audit-tasks` que lo persistirá en `audit_change_log` queda en deuda EC-T8-44 (Sprint 9 Fase E ya provee `AuditService.logChange`, falta sólo wirearlo).
- ✅ **`maintenance.completed`** (Sprint 8 Fase B.5, NUEVO): emisión atómica post-commit desde `MaintenanceLogService`. Listener canónico en `MaintenanceCompletedListener` despacha vía `NotificationsService` con plantilla seedeada (email HTML + campana en `notification-templates.ts`). Cobertura E2E en `tests/e2e/tasks-checklist-and-maintenance-log.spec.ts`.
- ✅ **`task.overdue`** + **`maintenance.critical`** + **`task.unassigned_overdue`** (Sprint 8 Fase C, 2026-05-01): cerrados al 100%. 3 colas BullMQ scheduled (`tasks-overdue` `0 2 * * *`, `tasks-unassigned-overdue` `0 9 * * *`, `maintenance-critical` `0 8 * * *`) con leader election natural via Redis (ADR-063 + ADR-064). Listeners canónicos delegan en `NotificationsService` con plantillas seedeadas (EC-T8-30 cerrado: 6 plantillas nuevas en `notification-templates.ts`, todas pasan el guard EC-T8-17 sin triple-stash). Endpoint admin `POST /api/v1/admin/tasks/cron/:name` permite disparar manualmente para smoke + E2E. Cobertura: 21 tests unit + 5 E2E (`tasks-crons.spec.ts` 5/5 verde, suite full 112/112 sin regresión).
- 📋 **Outbox para `task.*` y `maintenance.*`**: deuda EC-T8-28 / P-DEPLOY.4. Hoy si el bus revienta entre commit y emit, el evento se pierde silenciosamente. Aceptable mientras el deploy productivo esté diferido (ADR-069); blocker para Sprint 14.

---

### 🛡️ support_inside.* (Sprint 8 Fase D backend — ADR-034 + ADR-061 + ADR-075)

| Evento | Emisor | Consumidores | Payload | Outbox | Estado |
|--------|--------|--------------|---------|--------|--------|
| `support_inside.subscribed` | `SupportInsideService.subscribe()` tras checkout + create/update subscription | `SupportInsideAuditListener` (D.12.3) | `{ subscription_id, client_id, product_id, service_id }` | no | ✅ consumido |
| `support_inside.cancelled` | `SupportInsideService.cancel()` tras transacción que libera slots + cancela Service estándar | `SupportInsideAuditListener` (D.12.3) | `{ subscription_id, client_id, reason, released_slots }` | no | ✅ consumido |
| `support_inside.slot_assigned` | `SupportInsideService.addSlot()` tras crear `SupportInsideSlot` | `SupportInsideAuditListener` (D.12.3) | `{ slot_id, subscription_id, client_id, service_id, slot_type, is_extra }` | no | ✅ consumido |
| `support_inside.slot_released` | `SupportInsideService.releaseSlot()` (manual) y `SupportInsideService.cancel()` (cascada) | `SupportInsideAuditListener` (D.12.3), **`tasks-on-slot-released.listener`** (Sprint 16) → cancela task `support_inside_slot` huérfana con `source_id=slot_id` | `{ slot_id, subscription_id, client_id, reason: 'manual'\|'subscription_cancelled' }` | no | ✅ con 2 consumidores (Sprint 16: tasks listener cierra cancelación cross-sistema) |

**Nota canónica**: los 4 eventos están declarados como hooks aspiracionales y **cerrados con consumidor en Sprint 8 Fase D.12** (`SupportInsideAuditListener`). Cumple R1 (módulos por eventos) — `audit-support-inside` se enganchó vía `@OnEvent('support_inside.*')` sin tocar `SupportInsideService`. Listeners adicionales (`SupportInsidePriorityListener` consume `conversation.created`, `SupportInsideOnServiceProvisionedListener` consume `service.provisioned`) materializan la doctrina ADR-061 §"tier de cuenta visible" y ADR-076 (checkout único vía evento).

---

### 🔌 plugin.* (Sprint 15A — ADR-080)

| Evento | Emisor | Consumidores | Payload | Outbox | Estado |
|--------|--------|--------------|---------|--------|--------|
| `plugin.installed` | `AdminPluginsService.update()` la primera vez que un plugin pasa de no-existente o `enabled=false` a `enabled=true` (Sprint 15A Fase G) | (pendiente listener `audit` por slug — Sprint 15A K.1 lo registra como aspiracional) | `{ slug, installed_by, installed_at }` | no | 🟡 emitido sin consumidor explícito (audit lo cubre vía `logChange` en el service) |
| `plugin.config_changed` | `AdminPluginsService.update()` tras persistir cualquier cambio (enabled/config/secrets) | **`PluginRegistryService.handleConfigChanged`** (recarga `activePlugins` desde DB sin re-validar contrato — ADR-080 §4) | `{ slug, changed_by, changed_at, secrets_modified }` | no | ✅ consumido |
| `plugin.uninstalled` | (futuro — no emitido en Sprint 15A; reservado para cuando llegue desinstalación física de un plugin del DI) | (pendiente) | `{ slug, uninstalled_by, uninstalled_at }` | no | 🟡 reservado, no emitido todavía |
| `plugin.circuit_opened` | `HouseCircuitBreaker.transitionTo('open')` (Sprint 15A Fase F.1) — tras N fallos en ventana en `getServiceInfoWithCache` o `executeActionWithCacheInvalidation` | **`NotificationsPluginCircuitListener.handleCircuitOpened`** → notif `internal` + `email` a superadmins | `{ breaker_name, opened_at, last_error_code, failure_count, reset_timeout_ms }` | no | ✅ consumido |
| `plugin.circuit_closed` | `HouseCircuitBreaker.transitionTo('closed')` desde half-open OK o `breaker.reset()` manual | **`NotificationsPluginCircuitListener.handleCircuitClosed`** → notif `internal` informativa de resolución (sin email) | `{ breaker_name, closed_at, downtime_seconds }` | no | ✅ consumido |

**Nota canónica**: el `breaker_name` codifica `<plugin_slug>:<operation>` (ej. `enhance_cp:getServiceInfo`). El listener parsea ambos componentes y los enriquece en el payload de la notificación. Plugins reales (Sprint 15C/D/E) no requieren tocar este pipeline — el breaker está cableado en los wrappers `core/provisioning/plugin-utils.ts` que consume `ProvisioningService` (ADR-080 §5).

---

### 🌐 provisioning.* (Sprint 15C Fase 15C.D — ADR-082 §4)

| Evento | Emisor | Consumidores | Payload | Outbox | Estado |
|--------|--------|--------------|---------|--------|--------|
| `provisioning.default_nameservers_changed` ⭐ | (futuro Sprint 12) Endpoint admin que actualiza el setting `provisioning.default_nameservers` desde `/admin/settings` — emite con `{ newValue, oldValue, changedBy }` | **`SyncDefaultNameserversToEnhanceListener`** (Sprint 15C Fase 15C.D) → invoca `EnhanceDnsDefaultsService.applyClusterNameservers(newValue)` que propaga NS-sync C3 → C2 al cluster Enhance vía `POST /v2/settings/dns/default-records`. Idempotente (añade faltantes, preserva existentes, reporta stale legacy SIN borrar). Degrada elegante si Enhance API falla (R7+R13) — el cron L3 (Fase 15C.H) reintentará. | `{ newValue: string[], oldValue: string[], changedBy: string }` | no | ⬜ aspiracional Sprint 15C (listener escrito + testeado en Fase 15C.D; emisor llega en Sprint 12 cuando se implemente UI admin de settings) |

**Nota canónica (ADR-082 §4 NS-sync 3 capas)**: el setting `provisioning.default_nameservers` (categoría `provisioning`, default `["ns1.aelium.net","ns2.aelium.net"]`, edit role superadmin) es **fuente de verdad cluster-wide** de los nameservers que Aelium ofrece a sus dominios. Tres capas físicas que deben coincidir:
- **C1** (Glue records de `aelium.net` en Cloudflare + WHOIS del registrar) — manual ops Yasmin, fuera del cluster.
- **C2** (Default DNS records platform-level del cluster Enhance vía API) — propagado automáticamente desde C3.
- **C3** (Setting Aelium fuente de verdad) — editable superadmin, dispara el evento `provisioning.default_nameservers_changed`.

El listener `BootstrapEnhanceDefaultsOnPluginInstalledListener` (`@OnEvent('plugin.installed')`, slug=`enhance_cp`) cubre el bootstrap inicial cuando se habilita el plugin — invoca el mismo servicio `EnhanceDnsDefaultsService.applyClusterNameservers(...)` con el valor actual del setting C3. Ambos listeners convergen en el mismo punto de reconciliación idempotente.

---

### 🌍 domain.* (Sprint 15D — ADR-084 §5)

> **Emisión faseada.** `domain.registered` ✅ (Fase 15D.D) · `domain.renewed` + `domain.expiring_soon` + `domain.expired` + `domain.entered_redemption` ✅ (**Fase 15D.E**) · gestión `domain.nameservers_changed`/`privacy_changed`/`lock_changed` ✅ (**Fase 15D.F.1**, `contacts_changed` → F.2) · `domain.transfer_*` (Sprint 15D.II). Todos vía **Outbox** (R8) salvo `domain.expiring_soon` (alerta) — ADR-084 §5. Los de gestión los emite el orquestador (`emitDomainManagementEvent`) tras una inline action de registrar exitosa; no hay estado local que mutar (el cambio vive en el registrar) → la tx solo persiste el evento para dispatch exactly-once.

| Evento | Emisor | Consumidores | Payload | Outbox | Estado |
|--------|--------|--------------|---------|--------|--------|
| `domain.registered` | orquestador `provisioning` tras `register` OK (**Fase 15D.D**) | notifs (confirmación), audit, **listener `ensure-dns-zone-on-domain-activated`** (zona DNS post-register — [ADR-082 A2.2](../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md), aspiracional Fase F) | `{ service_id, user_id, fqdn, years, expires_at, correlation_id }` | **sí** | ✅ **emitido (Fase 15D.D)** — vía Outbox, gated `is_domain_registrar`+`operation=register`+fresco; `expires_at:null` en register (lo puebla el reconcile Fase E) |
| `domain.renewed` | orquestador `provisioning` tras `renew` **verificado** (DOM-INV-4 — `expires_at` avanzó, [ADR-084 A1](../10-decisions/adr-084-comercio-dominios-registrar.md)); gated `domain_renew_performed` (no re-emite en idempotencia pura) (**Fase 15D.E**) | **`NotificationsOnDomainLifecycleListener`** (email + campana al cliente) | `{ service_id, user_id, fqdn, new_expires_at, correlation_id }` | **sí** | ✅ **emitido (Fase 15D.E)** — vía Outbox |
| `domain.expiring_soon` | **`DomainExpiryWarningsCron`** (diario 09:00 UTC, lee `services.expires_at`, edge-trigger por ventana) (**Fase 15D.E**) | **`NotificationsOnDomainLifecycleListener`** (email + campana, 30/14/7/1 días) | `{ service_id, user_id, fqdn, days_left }` | no (alerta) | ✅ **emitido (Fase 15D.E)** |
| `domain.expired` | **`ResellerclubReconciliationCron`** (6h, per-servicio vía `getServiceInfo`/`domains/details`, edge-trigger de `lifecycle`) (**Fase 15D.E**) | **`NotificationsOnDomainLifecycleListener`** (email + campana) | `{ service_id, user_id, fqdn }` | **sí** | ✅ **emitido (Fase 15D.E)** — vía Outbox |
| `domain.entered_redemption` | **`ResellerclubReconciliationCron`** (transición a `redemption`/`pending_delete`) (**Fase 15D.E**) | **`NotificationsOnDomainLifecycleListener`** (email + campana) | `{ service_id, user_id, fqdn }` | **sí** | ✅ **emitido (Fase 15D.E)** — vía Outbox |
| `domain.nameservers_changed` / `domain.privacy_changed` / `domain.lock_changed` | `ProvisioningService.executeActionForUser` tras inline action de gestión RC exitosa, vía `orchestrator.emitDomainManagementEvent` (gated `is_domain_registrar` + mapa estático slug→evento, R4) (**Fase 15D.F.1**) | audit (ya vía wrapper `service.action_executed:<slug>`); notifs si aplica | `{ service_id, user_id, fqdn, actor_user_id, correlation_id }` | **sí** | ✅ **emitido (Fase 15D.F.1)** — vía Outbox |
| `domain.contacts_changed` | `executeAction` (inline `modify_contacts`) | audit; notifs si aplica | `{ service_id, user_id, fqdn, ... }` | **sí** | ⬜ aspiracional (handler Fase 15D.F.2) |
| `domain.restored` | `AdminDomainsService.restoreDomain` (admin/soporte, 15D.II.R) tras `domains/restore` OK | **`GenerateInvoiceOnDomainRestoredListener`** (cobro del fee de restore, billing) + **`NotificationsOnDomainLifecycleListener`** (email + campana) + audit (R3, `audit_change_log` inline) | `{ service_id, user_id, fqdn, amount, currency, correlation_id }` | **sí** | ✅ **emitido (Fase 15D.II.R)** — vía Outbox |
| `domain.transfer_initiated` / `domain.transfer_completed` / `domain.transfer_failed` | FSM de transfer ([ADR-084 §4](../10-decisions/adr-084-comercio-dominios-registrar.md) + [A2](../10-decisions/adr-084-comercio-dominios-registrar.md#amendments)): `initiated` lo emite el orquestador (`initiateTransferIn`, al llegar a `submitted`); `completed`/`failed` los emite el reconcile cron (`advanceTransfer`) | **`completed`** → **`GenerateInvoiceOnDomainTransferCompletedListener`** (**cobro al completar**, billing, [ADR-084 A2.3](../10-decisions/adr-084-comercio-dominios-registrar.md#amendments)) + **`ReconcileDomainNsOnTransferCompletedListener`** (zona DNS al completar, [ADR-082 A5](../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md#amendments)) + **`NotificationsOnDomainTransferListener`**; `initiated`/`failed` → **`NotificationsOnDomainTransferListener`** (email + campana) | `{ service_id, user_id, fqdn, expires_at? }` (failed: `+ reason`) | **sí** | ✅ **emitido (Fase 15D.II.T2c.2 + T3)** — `transfer_completed` (reconcile) → factura + zona DNS + notif; `transfer_initiated` (orquestador) + `transfer_failed` (reconcile) → notif. Vía Outbox |

**Nota canónica (ADR-084 §5):** auto-renew con **cobro automático** se difiere por dependencia de método de pago guardado (Stripe, P3); en v1 la renovación es factura + avisos (`domain.expiring_soon`). Los `domain.*` se registran aquí antes de emitirse (regla del playbook §6).

---

## Listeners activos (consolidado)

| Listener | Eventos consumidos | Acciones |
|----------|--------------------|----------|
| `billing-email.listener` | `invoice.created`, `invoice.paid`, `invoice.failed`, `invoice.overdue` | Delega a `NotificationsService.dispatchToUser` — render plantilla + email + campana (Sprint 9 Fase D) |
| `support-email.listener` | `conversation.created`, `conversation.assigned`, `message.created` | Email a cliente o agente según tipo |
| `support-websocket.listener` | `conversation.created`, `conversation.assigned`, `message.created` | Push por WebSocket a clients conectados |
| `support-guest-link.listener` | `auth.registered` | Vincula chats guest previos al user nuevo (si email coincide) |
| `tasks-email.listener` | `task.assigned` | Delega a `NotificationsService.dispatchToUser` — email + campana al agente, con `task_type_label`/`task_priority_label` (Sprint 8 Fase B.1.bis sin enums crudos) |
| `MaintenanceCompletedListener` | `maintenance.completed` | Delega a `NotificationsService.dispatchToUser` — email + campana al cliente con resumen del trabajo + mes formateado es-ES (Sprint 8 Fase B.5) |
| `TasksOverdueListener` | `task.overdue` | Delega a `NotificationsService.dispatchToUser` — email + campana al agente cuya tarea pasó a `not_completed_in_time` (Sprint 8 Fase C, 2026-05-01) |
| `TasksUnassignedOverdueListener` | `task.unassigned_overdue` | Delega a `NotificationsService.dispatchToSuperadmins` — resumen agregado de la cola pública fuera de SLA por tipo (Sprint 8 Fase C / ADR-072) |
| `MaintenanceCriticalListener` | `maintenance.critical` | Delega a `NotificationsService.dispatchToSuperadmins` — resumen agregado de servicios sin maintenance_log >threshold (Sprint 8 Fase C) |
| `SupportInsidePriorityListener` | `conversation.created` | Si el cliente tiene SI activa, mapea `priority_tier` → `ConversationPriority` con compare-and-swap (sólo escala si `priority='normal'` — preserva elección manual del agente, EC-T8-47) (Sprint 8 Fase D.12.2) |
| `SupportInsideAuditListener` | `support_inside.subscribed/cancelled/slot_assigned/slot_released` | Delega en `AuditService.logChange()` con `entity_type` distinguiendo subscription vs slot (R3 audit inmutable, alimenta portal transparencia cliente) (Sprint 8 Fase D.12.3) |
| `SupportInsideOnServiceProvisionedListener` | `service.provisioned` | Si `product.type='support_inside'`: crea/reactiva `SupportInsideSubscription`. Materializa ADR-076 (checkout único vía evento). Filtra defensivamente para coexistir con futuros listeners hosting/docker (Sprint 8 Fase D.12.9) |
| `ProvisioningOrchestratorService.handleInvoicePaid` | `invoice.paid` | Resuelve `service.product.provisioner` desde `PluginRegistryService` → encola job en cola BullMQ `provisioning-dispatch` por cada `service_id` en `invoice.items`. Idempotente por `services.status` check. Distingue retriable vs non-retriable errors. Emite `service.activated` (followUp `mark_active`), `service.provisioning_failed` (no-retriable), `service.metrics_fetched`/`action_executed`/`sso_opened` (vía wrappers). (Sprint 11 Fase 11.B, `67fd733`) |
| `notifications-outbox.listener` | `outbox.event_failed` | Alerta superadmin (campana + email) cuando un row Outbox agota retries (Sprint 9 Fase D) |
| `notifications-dlq.listener` | `dlq.job_failed` | Alerta superadmin cuando un job BullMQ entra en DLQ (Sprint 9 Fase D) |
| `notifications-system-error.listener` | `system.error` | Alerta superadmin con guard anti-loop hard si `module` proviene del dominio notifications (Sprint 9.5) |
| **`SupportTicketTaskCreatorListener.handleAssigned`** (adaptado Sprint 16) | `conversation.assigned` (sólo `type='ticket'`), `conversation.reactivated` (Amendment A1) | Crea / reasigna task `support_ticket` (idempotente). El mismo handler atiende ambos eventos — Amendment A1 reemplaza patrón legacy ADR-074 EC#3. |
| **`SupportTicketTaskCreatorListener.handleUnassigned`** | `conversation.unassigned` | Cancela task bridge activa con flag `skipTicketRelease` para evitar ciclo. |
| **`ClientLifecycleTaskCreatorListener`** (Sprint 16) | `service.activated` | Si `clientsService.isFirstService(client_id)`: crea task `client_lifecycle` con SLA 48h. Helper canónico cierra el flujo de bienvenida primer servicio. |
| **`tasks-on-slot-released.listener`** (Sprint 16) | `support_inside.slot_released` | Cancela task `support_inside_slot` huérfana cuando el slot se libera (manual o cascada por cancel SI). |
| **`tasks-on-service-cancelled.listener`** (Sprint 16) | `service.cancelled` | Cancela task `provisioning_manual` huérfana cuando el servicio se cancela. |
| **`notifications-conversation-resolved.listener`** (Sprint 16 Amendment A1, DC.33) | `conversation.resolved` | Cliente recibe email + campana CTA al ticket. Plantilla `conversation.resolved` seedeada Fase 16.E. |
| **`notifications-conversation-auto-closed.listener`** (Sprint 16 Amendment A1, DC.33) | `conversation.auto_closed` | Agente que resolvió recibe email + campana del cierre silencioso. Plantilla `conversation.auto_closed` seedeada Fase 16.E. |
| **`PluginRegistryService.handleConfigChanged`** (Sprint 15A Fase E) | `plugin.config_changed` | Recarga `activePlugins` desde `plugin_installs` sin re-validar contrato. Materializa ADR-080 §4 (DB activación, DI disponibilidad). |
| **`NotificationsPluginCircuitListener.handleCircuitOpened`** (Sprint 15A Fase F.2) | `plugin.circuit_opened` | Notif `internal` + `email` a superadmins con plugin_slug + operation parseados del breaker_name. Plantillas seedeadas Fase F.2. |
| **`NotificationsPluginCircuitListener.handleCircuitClosed`** (Sprint 15A Fase F.2) | `plugin.circuit_closed` | Notif `internal` informativa de resolución (sin email — el superadmin ya recibió alerta del open). Plantilla seedeada Fase F.2. |
| **`BootstrapEnhanceDefaultsOnPluginInstalledListener`** (Sprint 15C Fase 15C.D) | `plugin.installed` (filtra slug=`enhance_cp`) | Lee setting `provisioning.default_nameservers` (NS-sync C3) e invoca `EnhanceDnsDefaultsService.applyClusterNameservers(...)` para propagar al cluster Enhance vía `POST /v2/settings/dns/default-records`. Idempotente. Degrada elegante si Enhance API falla (ADR-082 §4). |
| **`ReconcileDnsDefaultsOnServiceActivatedListener`** (Sprint 15C Fase 15C.D) | `service.activated` (filtra `provisioner_slug=enhance_cp` + refs Enhance presentes en metadata) | Reconcile defensivo de la zona DNS del website Enhance — verifica que tiene los NS canónicos esperados; si faltan, los añade. NUNCA borra records inesperados (operador/cliente pueden haber añadido CNAME/MX/TXT custom). Materializa ADR-082 §5 (defensivo, NO inline) — los defaults globales ya cubren el caso normal; este listener cubre el edge case "setting C3 cambió tras zona ya creada". |
| **`SyncDefaultNameserversToEnhanceListener`** (Sprint 15C Fase 15C.D, listener escrito + testeado; emisor llega Sprint 12 con UI admin de settings) | `provisioning.default_nameservers_changed` | Propaga NS-sync C3 → C2 al cluster Enhance vía `EnhanceDnsDefaultsService.applyClusterNameservers(...)`. Materializa ADR-082 §4. |
| **`NotificationsOnDomainLifecycleListener`** (Sprint 15D Fase 15D.E) | `domain.renewed`, `domain.expiring_soon`, `domain.expired`, `domain.entered_redemption` | Delega en `NotificationsService.dispatchToUser` — email + campana al cliente (4 plantillas seedeadas). `fqdn` viaja en el payload; `panel_url` desde `NEXT_PUBLIC_APP_URL`. Degradación elegante (R7). Heredable a futuros registrars. |

---

## Convenciones para añadir un evento nuevo

1. **Naming:** `<dominio>.<acción>` con la acción en pasado (ya emitida): `invoice.created`, no `invoice.create`.
2. **Payload:** objeto simple. Incluir los IDs necesarios (no el objeto completo). El listener vuelve a leer si necesita más datos.
3. **Documentar AQUÍ y en el `contract.md` del emisor**: nombre, trigger, payload, outbox-yes-no.
4. **Si es crítico (transición de estado, cambio de dinero, gestión de servicio):** **debe usar Outbox Pattern (R8)** desde el primer commit. Los eventos `invoice.*` son deuda histórica — el resto se debe hacer bien.
5. **Si es informativo (audit, log, notification opcional):** outbox no obligatorio; documentarlo igual.

---

## Cómo se valida que código y catálogo coinciden

**Hoy:** manualmente. Si descubres una emisión sin entrada aquí, o una entrada sin emisor real → hay drift, créame un issue.

**Futuro deseable:** script de CI que parsea código y verifica:
- Cada `eventEmitter.emit('xxx', ...)` tiene fila en este archivo
- Cada `@OnEvent('xxx')` tiene fila aquí y un emisor real

Pendiente para sprint dedicado.

---

## Hallazgos de la auditoría que generaron este documento

| Hallazgo | Severidad | Acción |
|----------|-----------|--------|
| 15 eventos huérfanos | 🟡 Media | Documentar caso por caso (hecho arriba). No eliminar — son hooks para módulos pendientes |
| ~~25/25 eventos sin Outbox~~ → 4/13 críticos cubiertos | 🟠 Media | ✅ `invoice.*` cerrado P0.2 (2026-04-26). Pendiente `service.*` (4) + `checkout.completed` cuando se implemente provisioning. |
| `auth.*` sin audit module que escuche | 🟡 Media | Esperado: módulo audit es stub. Cuando se implemente, listener natural. |
| `service.*` sin provisioning que escuche | 🟡 Media | Esperado: provisioning es stub. Plan: Sprint dedicado. |
| Naming 100% consistente | ✅ — | Mantener |

---

## Documentos relacionados

- [`README.md`](./README.md) — Cómo usar `20-modules/`
- [`_matrix.md`](./_matrix.md) — Matriz de dependencias entre módulos
- [`docs/00-foundations/rules.md`](../00-foundations/rules.md#r8--eventos-cr%C3%ADticos-usan-outbox-pattern) — Regla R8 (Outbox)
- [`docs/00-foundations/glossary.md`](../00-foundations/glossary.md) — Términos: evento, outbox, listener, worker
