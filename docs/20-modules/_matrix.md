# Matriz de integraciones — Módulos backend

> **Mapa explícito de cómo se conectan los módulos.**
> Resuelve el problema histórico de "los sistemas se conectan en algún punto y no es coherente".

> **Última auditoría:** abril 2026 (commits ~`8c4d893`).

---

## Estado general

**Cumplimiento de Regla R1 (módulos no se llaman directamente entre sí, solo vía eventos):** ✅ **100%**

Auditoría exhaustiva confirmó:
- **0 imports cross-módulo** entre `backend/src/modules/*/`
- Todas las inyecciones cross-módulo aparentes son **sub-services del mismo dominio** (R15: división por tamaño, no acoplamiento entre dominios)
- Comunicación entre dominios distintos: **100% por eventos** (`EventEmitter2`) o **lectura via Prisma** (data isolation por servicio)

---

## Matriz de dependencias

Filas = módulo origen. Columnas = módulo destino. Celda = tipo de relación.

| Origen → Destino | auth | clients | products | billing | support | support_inside | tasks | dashboard | notifications | audit | error-log | partner | core |
|------------------|------|---------|----------|---------|---------|----------------|-------|-----------|---------------|-------|-----------|---------|------|
| **auth** | (sub R15) | — | — | — | — | — | — | — | — | write `audit_access_log` (DC.8 — directo, no via AuditService) | — | — | prisma, settings, email, casl |
| **clients** | read users | (sub R15) | — | read invoices | — | — | — | — | — | — | — | — | prisma, casl |
| **products** | — | — | (sub R15) | — | — | — | — | — | — | — | — | — | prisma, casl |
| **billing** | read users | read billing_profiles | read products, product_pricing | (sub R15) | — | — | — | — | dispatchToUser via `BillingEmailListener` | — | — | — | prisma, settings, email, casl, **outbox**, **storage**, **jobs** |
| **support** | read users | read client_notes | — | read services | (sub R15) | read SI subscription via supportQueryService include | — | — | — | — | — | — | prisma, settings, email, casl |
| **support_inside** | — | — | — | invoke `BillingCheckoutService.checkout()` (subscribe) — emite `service.provisioned` | listener `SupportInsidePriorityListener` consume `conversation.created` | (sub R15) | crea `Task(type=maintenance_management)` via cron `maintenance-monthly` (cola pública ADR-072) | — | — | listener `SupportInsideAuditListener` → `AuditService.logChange` (4 eventos) | — | — | prisma, casl, **events**, **jobs** |
| **tasks** | read users | write `client_notes` via `ClientNotesService` (Sprint 16: 5 entrypoints canónicos `createFromTicketCompletion`/`createFromChatCompletion`/`createFromMaintenanceCompletion`/`createFromTaskCompletion`/`createExceptional`); listener `ClientLifecycleTaskCreatorListener` consume `service.activated` + helper `clientsService.isFirstService` | — | (no FK directa post Sprint 16; `source_id` polimórfico apunta a `services(id)` cuando `source_system='provisioning_manual'`) | invoke `SupportService.updateConversation` (bridge ticket↔task ADR-074); listener `SupportTicketTaskCreatorListener` consume `conversation.assigned` + `conversation.reactivated` (Sprint 16 Amendment A1) | listener `tasks-on-slot-released` cancela task `support_inside_slot` huérfana (Sprint 16); listener `tasks-on-service-cancelled` cancela task `provisioning_manual` huérfana (Sprint 16) | (sub R15) | — | dispatchToUser via `TasksEmailListener` + 3 listeners cron (overdue / unassigned / maintenance.critical) + 2 listeners conversation lifecycle (`conversation.resolved` cliente + `conversation.auto_closed` agente) | — | — | — | prisma, casl, **events**, **jobs** (5 colas: tasks-overdue + tasks-unassigned-overdue + maintenance-critical + maintenance-monthly + support-resolved-auto-close) |
| **provisioning** | read users (cargar `client` data en `ProvisionContext`) | — | read products (resolver `provisioner_slug` + `provisioner_config`) | listener `invoice.paid` (BullMQ async) + write `services.status/provisioner_slug/provider_reference/metadata` post-provision | — | indirecto via plugin `internal` (futuro Fase 11.C) consume `service.activated` | invoke `TasksService.create(type=support_setup)` cuando plugin manual followUp=create_setup_task (cola pública ADR-072) | — | (Fase 11.E: emit `service.provisioning_failed` consumible por listener notifications) | wrapper `executeActionWithCacheInvalidation` invoke `AuditService.logChange` + wrapper `getSsoUrlWithAudit` invoke `AuditService.logAccess` | — | — | prisma, casl, **events**, **jobs** (cola `provisioning-dispatch`), **redis DB 2** (cache `service_info`) |
| **dashboard** | read users | read clients data | — | read invoices, services | read conversations | read SI subscription (helper `getClientOverview` include) | read tasks | — | — | — | — | — | prisma |
| **notifications** | read users (resolver recipients + superadmins) | — | — | — | — | — | — | — | (sub R15) | — | — | — | prisma, **email**, **jobs** |
| **audit** | — | — | — | — | — | — | — | — | — | (sub R15) | — | — | prisma |
| **error-log** | — | — | — | — | — | — | — | — | emite `system.error` → `notifications-system-error.listener` (Sprint 9.5) | — | (sub R15) | — | prisma, **events** |
| **partner** | (stub) | (stub) | (stub) | (stub) | (stub) | — | (stub) | (stub) | — | — | — | (stub) | — |

### Leyenda
- **`read X`**: el módulo origen lee tabla `X` del módulo destino vía Prisma. Lectura legítima — los módulos son aggregates, no microservicios estrictos.
- **`(sub R15)`**: relación INTRA-módulo (sub-services por Regla 15). No es acoplamiento entre dominios.
- **`(stub)`**: módulo definido pero sin implementación.
- **`—`**: sin relación directa.
- **`core`**: servicios globales (PrismaService, SettingsService, EmailService, CaslAbilityFactory, **OutboxService**, **StorageService**, **JobsModule**, **AuditService**, **events** EventEmitter2). Todos los módulos los usan; no es acoplamiento problemático.

> **Sprint 9 (2026-04-27) + Sprint 9.5 (2026-04-28) cambios estructurales:**
> - `audit/`, `notifications/`, `error-log/` salieron de stub a implementación real.
> - `notifications` es @Global y consumido por `BillingEmailListener` + `TasksEmailListener` + 3 listeners operativos (`outbox.event_failed`, `dlq.job_failed`, `system.error`).
> - `audit` es @Global; `AuditInterceptor` registrado APP-wide intercepta endpoints decorados con `@AuditAccess('Resource')`.
> - `error-log.service` emite `system.error` → consumido por `notifications-system-error.listener` (Sprint 9.5) con guard anti-loop hard si `module` proviene del dominio notifications.

> **Sprint 8 Fase D + D.12 (2026-05-01) cambios estructurales:**
> - `support_inside/` salió de stub a implementación real (3 tablas + 5 enums + 5 servicios + 3 listeners transversales).
> - `tasks` ahora invoca `SupportService.updateConversation` (excepción documentada R1 — [ADR-074](../10-decisions/adr-074-ticket-task-bridge.md)).
> - `support_inside` invoca `BillingCheckoutService.checkout()` para `subscribe()` y consume `service.provisioned` para crear `SupportInsideSubscription` ([ADR-076](../10-decisions/adr-076-checkout-unico-support-inside-via-evento.md)) — un único motor de checkout cliente.
> - 3 colas BullMQ scheduled nuevas (`tasks-overdue`, `tasks-unassigned-overdue`, `maintenance-critical`) + 1 cola Support Inside (`maintenance-monthly` con cron diario filtro `anniversary_day`).
> - 3 listeners transversales SI: `SupportInsidePriorityListener` (consume `conversation.created`), `SupportInsideAuditListener` (consume los 4 eventos `support_inside.*`), `SupportInsideOnServiceProvisionedListener` (consume `service.provisioned`).

> **Sprint 16 (2026-05-02) — cerrado al 100% — cambios estructurales (ADR-079 + Amendments A1/A2/A3):**
> - `tasks` refactorizado a **bridge unidireccional read-only**: 5 listeners cross-sistema cierran el flujo (`SupportTicketTaskCreatorListener` consume `conversation.assigned` + `conversation.reactivated`; `ClientLifecycleTaskCreatorListener` consume `service.activated` con `isFirstService`; `tasks-on-slot-released` consume `support_inside.slot_released`; `tasks-on-service-cancelled` consume `service.cancelled`; `ProvisioningOnTaskCompletedListener` filtra por `capabilities.completes_via_task`).
> - `ClientNotesService` consolidado en `modules/clients/` con 5 entrypoints canónicos. Tabla `client_notes` con source tracking polimórfico (`source_system` + `source_id` + `triggered_by_action`). Drop columns `conversation_id` y `task_id` directos.
> - **3 eventos `conversation.*` nuevos** (Amendment A1 lifecycle ticket): `conversation.resolved` (cliente), `conversation.reactivated` (substituye patrón legacy ADR-074 EC#3), `conversation.auto_closed` (agente).
> - **1 cola BullMQ nueva**: `support-resolved-auto-close` 02:30 UTC con setting `support.auto_close_resolved_days` default 7.
> - **Reasignación humana de tasks restringida a superadmin** (Amendment A2). `agent_full` perdió esta capacidad. Endpoint `PATCH /tasks/:id/cancel` `@deprecated` (DC.34 pendiente eliminación física).
> - **Lifecycle chat reducido a terminal único `resolved`** (Amendment A3). Backend rechaza `addMessage` en chat `resolved`, bloquea `closed` y reapertura para chats. ClientNote canónica `source_system='chat'` al cerrar/escalar chat.
> - **Schema tasks** simplificado: 16 → 12 columnas. Drop `task_tags` + `task_tag_assignments`. UNIQUE parcial activo `(source_system, source_id) WHERE status IN ('pending','in_progress')`.
> - **`MaintenanceLog.notes` → `client_facing_notes`** (DC.32 cerrada). Drop `internal_notes` (va a `client_notes`).

> **Sprint 11 Fases 11.A → 11.E (2026-05-02) — cerrado al 100% — cambios estructurales:**
> - `provisioning/` salió de stub a **módulo implementado completo** ([ADR-077](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md) + [ADR-078](../10-decisions/adr-078-auth-server-side-cookies-httponly.md)). Orquestador + chasis canónico + plugins triviales (`internal`/`manual`) + listener `provisioning-on-task-completed` + frontend (3 páginas + 5 componentes shared) + 8 endpoints REST (4 cliente + 4 admin) + cierre documental.
> - `provisioning` invoca `TasksService.create(type=support_setup)` cuando un plugin con `capabilities.completes_via_task=true` (ej. `manual`) devuelve `followUp: ['create_setup_task']`. Excepción documentada R1.
> - **1 cola BullMQ nueva**: `provisioning-dispatch` con DLQ + retries [30s, 90s, 270s, ...]. Consumida por `ProvisioningDispatchProcessor`.
> - **1 evento nuevo canónico**: `service.activated` (orquestador post-provision OK). Coexiste con `service.provisioned` legacy (`BillingCheckoutService` al CREAR el service — sigue intacto para Sprint 8 D.12.9). Plugins Sprint 15 consumen `service.activated`.
> - **4 eventos audit/RGPD nuevos**: `service.provisioning_failed`, `service.metrics_fetched`, `service.action_executed`, `service.sso_opened`. Wrappers cross-cutting los emiten automáticamente. Listeners `audit` + `notifications` pendientes para Sprint 12+ (no bloquean cierre — la transparencia ya vive en `/dashboard/transparency` desde Sprint 9).
> - **Redis DB 2 reservado** para cache `service_info:<id>` con prefijo `aelium-provisioning:` (DB 0 settings, DB 1 BullMQ, DB 2 provisioning cache).
> - **Schema services**: 2 columnas nuevas (`provisioner_slug`, `provider_reference`) con índice. Inmutables tras `service.activated`.
> - **ESLint `no-restricted-imports`** enforce R4 sobre `src/plugins/provisioners/**`: plugins importan SOLO de `core/provisioning/types`.
> - **ADR-078 fija doctrina auth server-side**: Fase 11.D = última excepción permitida del patrón `'use client' + localStorage`. Sprint 12+ requiere Server Components + cookies httpOnly. Marker mecánico `TODO(ADR-078, Sprint 13)` en cada Client Component nuevo.
> - Sprint 9.5 añade endpoints cliente `/notifications/*` + admin `/admin/notifications/templates`, `NotificationsRetentionCron`, `NotificationBell` Topbar, página admin de plantillas.
> - Los 3 módulos cumplen R1 (comunicación vía eventos cuando aplica) y R15 (todos sus archivos <300 líneas).

---

## Sub-services internos por Regla R15

División de servicios grandes por dominio. **NO es acoplamiento cross-módulo**, es organización del mismo módulo.

| Módulo | Service principal (fachada) | Sub-services |
|--------|----------------------------|--------------|
| **auth** | `AuthService` | `AuthLoginService`, `AuthRegisterService`, `AuthTokenService`, `AuthRecoveryService` |
| **billing** | `BillingService` | `BillingInvoiceService`, `BillingCheckoutService`, `BillingCalculatorService` |
| **clients** | `ClientsService` | `ClientsBillingService` |
| **products** | `ProductsService` | `ProductsCatalogService` |
| **support** | `SupportService` | `SupportChatService`, `SupportTicketService`, `SupportMessageService`, `SupportQueryService` |

> Implementación: el service principal queda como **fachada** que delega; sub-services contienen la lógica. Resultado de refactores en Sprint 7 y posteriores.

---

## Lectura cross-módulo (vía Prisma)

Algunos módulos leen tablas de otros módulos directamente con `prisma.<tabla>.findX()`. Esto **es aceptable** como patrón aggregator, pero conviene documentarlo:

### Lecturas legítimas
| Quién lee | Qué lee | Por qué |
|-----------|---------|---------|
| billing | `users` | Obtener email/nombre del destinatario al emitir factura |
| billing | `products`, `product_pricing` | Calcular precios en checkout |
| billing | `billing_profiles` | Adjuntar datos fiscales a factura |
| clients | `users` | Listar clientes (un cliente es un user con rol=client) |
| clients (vía ClientsBillingService) | `invoices` | Mostrar histórico de facturas en ficha del cliente |
| support | `users` | Resolver nombre/email del remitente del mensaje |
| support | `services` | Mostrar contexto de qué servicio tiene contratado el cliente que reporta |
| support | `client_notes` | Mostrar notas internas del cliente al agente en panel de chat |
| dashboard | `users`, `invoices`, `services`, `conversations`, `tasks` | Calcular stats agregadas |
| tasks | `users` | Resolver `assigned_to` y `created_by` |

### Riesgos potenciales
- **clients → users (lectura completa):** debería filtrar a `role=client` para no exponer otros roles. Pendiente verificar (deuda menor).
- ~~**tasks → users:** no valida que `assigned_to` existe antes de aceptar.~~ ✅ Cerrado P0.1 (2026-04-26) vía helper `assertAssignableUser` en `tasks.service.ts` (valida existencia + status=`active` + rol asignable).
- **auth, billing → audit_access_log:** escritura directa al log de auditoría. Funcionalmente correcto pero conceptualmente debería pasar por un `AuditService` centralizado (futuro Sprint).

---

## Escrituras cross-módulo

**Auditadas: cero violaciones serias.** Cada módulo escribe en sus tablas propias.

Únicas excepciones:
- **billing escribe en `services`** (estado: `pending → active → suspended → cancelled`). Esto es legítimo: el ciclo de vida de un servicio está dirigido por el ciclo de billing (impagos suspenden, pagos reactivan). Billing es **co-propietario funcional** del estado de Service.
- **auth y billing escriben en `audit_access_log`** y `audit_change_log`. Aceptable hoy; centralización pendiente.

---

## Comunicación por eventos

**Patrón principal de comunicación entre dominios distintos.** Detalles completos en [`_events.md`](./_events.md).

Resumen de flujos cross-módulo vía eventos:

```
auth.registered          ─────► support-guest-link.listener (vincular chats anónimos previos)

billing emits...
  invoice.created      ─┐
  invoice.paid          ├─────► billing-email.listener (notificar al cliente por email)
  invoice.failed        │
  invoice.overdue      ─┘

support emits...
  conversation.created ─┐
  conversation.assigned ├─────► support-email.listener (emails al cliente/agente)
  message.created      ─┘└────► support-websocket.listener (push al WS)

(Eventos huérfanos — emitidos sin listener actual:
 auth.* (7 eventos), service.suspended/resumed (cuando llegue plugin con efecto real, ej. docker_engine Sprint 15E), task.created (audit Sprint 9 Fase E pendiente), checkout.completed.
 Cerrados Sprint 8: task.assigned/overdue/unassigned_overdue + maintenance.completed/critical + 4 support_inside.* + service.provisioned consumido por SI Listener.
 Cerrados Sprint 11: invoice.paid consumido por ProvisioningOrchestratorService; service.activated emitido por orquestador.
 Cerrados Sprint 16 (Amendments A1+A3): conversation.assigned suma SupportTicketTaskCreatorListener; conversation.reactivated nuevo + reuse SupportTicketTaskCreatorListener; conversation.resolved + conversation.auto_closed nuevos con listeners notifications canónicos (DC.33 cerrada); service.activated suma ClientLifecycleTaskCreatorListener; service.cancelled suma tasks-on-service-cancelled.listener; support_inside.slot_released suma tasks-on-slot-released.listener; task.completed suma task-completed.listener.
 Pendientes consumidores Sprint 12+: service.provisioning_failed/metrics_fetched/action_executed/sso_opened — emitidos por orquestador y wrappers, esperando listeners audit + notifications cuando llegue plugin con coste de fallo significativo)
```

---

## Acoplamientos sospechosos

**Ninguno crítico** detectado en la auditoría.

Lista de "atención" (mejoras incrementales, no bloqueantes):

| # | Síntoma | Causa | Plan |
|---|---------|-------|------|
| A1 | `clients` lee tabla `users` sin filtrar por rol | El "cliente" es un `User` con `role.slug = 'client'`. Sin filtro explícito, listings podrían incluir agentes. | Validar filtro existe en `ClientsService.findAll()`. Issue menor. |
| A2 | Servicios escriben directo a `audit_access_log` | No hay `AuditService` centralizado. | Crear `AuditService` cuando se priorice módulo audit. |
| A3 | 15 eventos huérfanos (sin listener) | Features incompletas o decididas-pero-no-implementadas. | Documentar caso por caso en cada `contract.md`. |
| ~~A4~~ | ~~`Tasks.assigned_to` no valida existencia de User~~ | ✅ **Cerrado P0.1** (2026-04-26) vía `assertAssignableUser`. |

---

## Módulos completamente aislados

Estos módulos no aparecen en la matriz principal como origen ni destino (más allá de core):

| Módulo | Estado | Comunicación |
|--------|--------|--------------|
| ~~audit~~ | ✅ **implementado Sprint 9 Fase E** — ver matriz principal | `AuditService.logAccess` via `AuditInterceptor` + endpoint cliente `/audit/access`. Cron retención 730 días |
| ~~notifications~~ | ✅ **implementado Sprint 9 Fase D MVP** — ver matriz principal | @Global, multicanal (`EmailChannel` + `InAppChannel`), plantillas Handlebars, cola `notifications-dispatch` |
| ~~error-log~~ | ✅ **implementado Sprint 9 Fase F** — ver matriz principal | Persistido por `GlobalExceptionFilter` (5xx HTTP) + `ErrorLogService.log()` desde jobs/listeners. Endpoint admin `/admin/error-log` |
| ~~provisioning~~ | ✅ **implementado Sprint 11 Fases A→E (cerrado 2026-05-02)** — ver matriz principal. Plugins triviales `internal` + `manual` operativos. Plugins reales Sprint 15A-G. | Orquestador escucha `invoice.paid`, encola en cola BullMQ `provisioning-dispatch`, resuelve plugin desde `PluginRegistryService`, invoca `plugin.provision(ctx)`, persiste `provider_reference`/`metadata`, emite `service.activated`/`provisioning_failed`. Cache Redis DB 2 con TTL configurable. Frontend: `/dashboard/services` + `/dashboard/services/[id]` + `/admin/services` |
| promotions | stub | Listener de `invoice.created` para aplicar descuentos retroactivos |
| infrastructure | stub | Gestión de servidores físicos / VMs |
| knowledge-base | stub | Self-service docs para clientes |

---

## Matriz inversa: "quién depende de mí si toco X"

> Lista útil cuando vas a modificar un módulo y quieres saber el impacto.

| Si tocas... | Estos módulos pueden romperse |
|-------------|-------------------------------|
| **auth (User schema)** | clients, billing, support, tasks, dashboard (todos leen `users`) |
| **billing (Invoice/Service)** | clients (lee invoices), dashboard (lee invoices y services), support (lee services) |
| **products (Product/Pricing)** | billing (lee products en checkout), dashboard (futuro) |
| **support (Conversation/Message)** | dashboard (lee conversations), tasks (bridge ticket↔task ADR-074 + Amendment A1 reactivación + auto-close cron Sprint 16), support_inside (listener priority), clients (`ClientNotesService.createFromTicketCompletion`/`createFromChatCompletion` Sprint 16 Amendment A3) |
| **tasks (Task)** | dashboard (lee tasks), support_inside (cron `maintenance-monthly` crea tasks `support_inside_slot` + listener `tasks-on-slot-released` Sprint 16), provisioning (orquestador crea tasks `provisioning_manual` + listener `tasks-on-service-cancelled` Sprint 16), clients (listener `ClientLifecycleTaskCreatorListener` consume `service.activated` Sprint 16 + `ClientNotesService` consolidado) |
| **support_inside (Subscription/Slot/Config)** | clients (helper findOne enriquecido), support (helper findOne con tier), dashboard (overview con plan), audit (listener cambios) |
| **provisioning (Orchestrator/PluginRegistry/cache)** | Sprint 15A (plugin framework), Sprint 15C/D/E/G (plugins reales cPanel/Plesk/Enhance/ResellerClub/Docker), Sprint 12 (listener `notifications-on-provisioning-failed` + listener `audit-on-service-events` para los 5 eventos audit/RGPD nuevos), Sprint 19 (decisión partner `executeAction` sobre servicios de sus clientes) |
| **dashboard** | nadie (es módulo de solo lectura) |

> **Si tocas un módulo del que dependen otros**, ejecuta los tests E2E completos (`pnpm test:e2e`). Cubre login + checkout + soporte que tocan los acoplamientos transversales.

---

## Granularidad CASL por rol staff (ADR-067, Sprint 9.6)

Matriz canónica de qué `Action` tiene cada rol staff sobre cada `Subject` del enum. Define la **defense in depth nivel 3** sobre los endpoints `/api/v1/admin/*` (los niveles 1 y 2 son `JwtAuthGuard` + `AdminOnlyGuard`). Implementación: [`backend/src/core/casl/permissions.ts`](../../backend/src/core/casl/permissions.ts).

| Subject | superadmin | agent_full | agent_billing | agent_support | client | partner |
|---------|:---------:|:----------:|:-------------:|:-------------:|:------:|:-------:|
| `Dashboard` | Manage | Manage | Manage | Manage | Manage | Manage |
| `Profile` | Manage | Manage | Manage | Manage | Manage | Manage |
| `Client` | Manage | Manage | Manage | Read/List | — | — |
| `BillingProfile` | Manage | Manage | Manage | Read/List | Manage (own) | — |
| `ClientNote` | Manage | Manage | Manage | Create+Read | — | — |
| `Product` | Manage | Manage | — | — | Read/List (catálogo) | — |
| `ProductCategory` | Manage | Manage | — | — | — | — |
| `Invoice` | Manage | Manage | Manage | — | Read+List+Create (own) | Read/List (partner_scoped) |
| `Payment` | Manage | Manage | Manage | — | — | — |
| `Conversation` | Manage | Manage | — | Manage | Create+Read+List (own) | Read/List (partner_scoped) |
| `Message` | Manage | Manage | — | Manage | Create+Read | — |
| `Task` | Manage | Read+Update (own + cola pública) | Read+Update (own) | Read+Update (own) | — | — |
| `Maintenance` | Manage | Manage | Manage | Manage | — | — |
| `Service` | Manage | Manage | Read/List | Read/List | Read+List+Update (own) | Read/List (partner_scoped) |
| `AuditLog` | Manage | Read/List | — | — | Read/List (own) | — |
| `Notification` | Manage | Manage | Read+List+Update (own) | Read+List+Update (own) | Read+List+Update (own) | Read+List+Update (own) |
| **`NotificationTemplate` (ADR-067)** | **Manage** | — | — | — | — | — |
| `Promotion` | Manage | Manage | — | — | — | — |
| `KnowledgeBase` | Manage | Manage | — | Read/List | — | — |
| `ErrorLog` | Manage | Read/List | — | — | — | — |
| **`Job` (ADR-067)** | **Manage** | — | — | — | — | — |
| `Server` | Manage | Read/List | — | — | — | — |
| `Setting` | Manage | — (inverted) | — | — | — | — |
| `Agent` | Manage | — (inverted) | — | — | — | — |
| `SupportInside` | Manage | Manage | — | — | Read/List | — |
| `Referral` | Manage | Manage | — | — | Read/List | — |
| `Partner` | Manage | Read/List | — | — | — | Read+Update (own) |
| `PartnerClient` | Manage | — | — | — | — | Read/List (partner_scoped) |
| `PartnerCommission` | Manage | — | — | — | — | Read/List (partner_scoped) |
| `PartnerPayout` | Manage | — | — | — | — | Read/List (partner_scoped) |
| `PartnerTicket` | Manage | — | — | — | — | Manage (partner_scoped) |
| `PartnerNote` | Manage | — | — | — | — | Create+Read+List (partner_scoped) |
| `PartnerNotification` | Manage | — | — | — | — | Create+Read+List (partner_scoped) |
| `PartnerLink` | Manage | — | — | — | — | Create+Read (partner_scoped) |
| `PartnerUnlink` | Manage | — | — | — | — | Create+Read+List (partner_scoped) |

### Reglas derivadas

- **`Manage` = full CRUD** (Create, Read, Update, Delete, List).
- **`(own)` = condition-filtered** por `user_id = caller.id` server-side (CASL `conditions: { user_id }`).
- **`(partner_scoped)` = condition-filtered** por `partner_id = caller.partner_id`.
- **`(inverted)` = regla `cannot`** explícita — el rol pasa por wildcard `Manage All` (no aplica aquí porque sólo superadmin lo tiene) pero la inversa lo bloquea. Patrón usado para que `agent_full` NO pueda gestionar `Setting` ni `Agent` aunque tenga acceso amplio.
- **`—` = ausencia de regla** → CASL devuelve `false` por defecto → `PoliciesGuard` rechaza con 403.

### Verificación canónica

- Tests unit: [`backend/src/core/casl/casl-ability.factory.spec.ts`](../../backend/src/core/casl/casl-ability.factory.spec.ts) — 16 aserciones cubren la matriz canónica + Subjects nuevos.
- Tests E2E: [`tests/e2e/admin-granular-roles.spec.ts`](../../tests/e2e/admin-granular-roles.spec.ts) — 8 aserciones contra endpoints reales (positivas y negativas por rol).

---

## Cómo se mantiene esta matriz

- **Trigger de actualización:** cualquier cambio en imports, inyecciones o accesos cross-módulo.
- **Forma:** edición directa de este archivo + commit que cite la modificación.
- **Validación futura (no implementada):** un script de CI que escanea `backend/src/modules/` y compara con esta matriz, fallando si hay drift.

---

## Documentos relacionados

- [`README.md`](./README.md) — Cómo usar la carpeta `20-modules/`
- [`_events.md`](./_events.md) — Catálogo único de eventos del sistema
- [`_template-contract.md`](./_template-contract.md) — Plantilla canónica
- [`docs/00-foundations/rules.md`](../00-foundations/rules.md) — Reglas R1-R16, especialmente R1 y R15
