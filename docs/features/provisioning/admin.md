# Provisioning — Vista interna del orquestador

> Módulo: `provisioning` (orquestador del lifecycle de servicios) + `core/provisioning` (chasis canónico) + `plugins/provisioners/*` (plugins concretos).
> Sprints: 11 Fases A→E (orquestador + chasis + plugins triviales + frontend + cierre); 15A-G (plugins reales — pendientes).
> Última actualización: 2026-05-02 (Sprint 11 Fase 11.E cierre).
> Audiencia: superadmin (operativa, recovery, monitoring) + `agent_full` (intervención manual + reprovision/deprovision).

> **Para la vista cliente del producto, ver [`docs/features/services/admin.md`](../services/admin.md) y [`client.md`](../services/client.md).**

---

## 1. Qué es el módulo provisioning

El módulo `provisioning` es el **director de orquesta** del lifecycle de servicios. NO habla con APIs externas — eso lo hace cada plugin (`internal`, `manual`, futuros `enhance_cp`, `resellerclub`, `docker_engine`, `plesk_obsidian`). El orquestador:

1. **Escucha** `invoice.paid` (Outbox dispatcher → bus interno).
2. **Decide** qué plugin invocar resolviendo `service.product.provisioner` desde el `PluginRegistryService`.
3. **Encola** un job `provision-service` por cada `service_id` distinto en `invoice.items` (cola BullMQ `provisioning-dispatch` con DLQ).
4. **Ejecuta** el plugin vía 3 wrappers cross-cutting (cache + audit + circuit breaker) que centralizan los aspectos transversales que ningún plugin debe duplicar.
5. **Persiste** el resultado (`services.status`, `provisioner_slug`, `provider_reference`, `metadata`) y emite eventos canónicos (`service.activated` o `service.provisioning_failed`).

> **Doctrina canónica ([ADR-077](../../10-decisions/adr-077-contrato-provisioner-plugin-v2.md)):** los plugins NUNCA llaman directamente a Redis, EventEmitter ni AuditService. El plugin sólo implementa la lógica del proveedor (cPanel/ResellerClub/Docker/etc.). Todo el chasis cross-cutting vive en `core/provisioning/plugin-utils.ts`.

---

## 2. Arquitectura — qué vive dónde

```
backend/src/
├── core/provisioning/                      ← CHASIS canónico (Sprint 11 Fase 11.B)
│   ├── types.ts                            ← Literal del ADR-077 §1+§2 (firma + shapes + capability flags + ProvisionerErrorCode)
│   ├── plugin-utils.ts                     ← 3 wrappers cross-cutting: getServiceInfoWithCache / executeActionWithCacheInvalidation / getSsoUrlWithAudit
│   ├── plugin-registry.ts                  ← PluginRegistryService (token DI multi-injection PROVISIONER_PLUGINS + 5 validaciones boot)
│   └── provisioning-cache.service.ts       ← ioredis Redis DB 2, fail-open, prefijo aelium-provisioning:service_info:<id>
│
├── modules/provisioning/                   ← ORQUESTADOR (Sprint 11 Fase 11.B + D)
│   ├── provisioning-orchestrator.service.ts  ← @OnEvent('invoice.paid') + provisionService() + markActive()
│   ├── provisioning-dispatch.processor.ts    ← Worker BullMQ delgado, delega en orquestador
│   ├── provisioning.service.ts             ← Listados + reprovision + deprovision (Fase 11.D)
│   ├── provisioning.controller.ts          ← 4 endpoints cliente (Fase 11.D)
│   ├── admin-provisioning.controller.ts    ← 4 endpoints admin (Fase 11.D)
│   ├── dto/provisioning.dto.ts             ← class-validator DTOs
│   ├── listeners/
│   │   └── provisioning-on-task-completed.listener.ts  ← Filtra por capabilities.completes_via_task (Fase 11.C)
│   └── provisioning.module.ts              ← Wirea PROVISIONER_PLUGINS via useFactory
│
└── plugins/provisioners/                   ← PLUGINS concretos (Sprint 11 Fase 11.C + 15A-G)
    ├── internal/internal.plugin.ts         ← Trivial — followUp: ['mark_active']
    ├── manual/manual.plugin.ts             ← Trivial — followUp: ['create_setup_task'] + completes_via_task=true
    ├── plugin-contract.spec.ts             ← Test contract genérico parametrizado por plugin (ADR-077 §7)
    └── (Sprint 15A-G: enhance_cp, cpanel_whm, resellerclub, docker_engine, plesk_obsidian)
```

**Regla R4 enforced** por ESLint `no-restricted-imports`:
- Plugins importan SOLO de `core/provisioning/types`. Si un plugin intenta `from 'src/modules/provisioning/*'` el lint falla.

---

## 3. Pipeline canónico end-to-end

```
1. Cliente paga factura
   │
   ▼
2. BillingInvoiceService.markAsPaid()
   ├── UPDATE invoices SET status='paid'
   └── OutboxService.enqueue(tx, 'invoice.paid', { invoice_id, ... })   ← R8 Outbox
                                            │
3. OutboxDispatchProcessor (cola outbox-dispatch, repeat 5s)
   └── eventEmitter.emit('invoice.paid', payload)
                                            │
4. ProvisioningOrchestratorService.handleInvoicePaid (@OnEvent)
   ├── Lee invoice.items para extraer service_ids distintos
   └── Por cada service_id: enqueueProvisioning(serviceId, correlationId)
       └── provisioningQueue.add('provision-service', payload, { jobId: `provision-${serviceId}-${correlationId}` })
                                            │
5. ProvisioningDispatchProcessor.process (worker BullMQ)
   └── ProvisioningOrchestratorService.provisionService(serviceId, correlationId)
       ├── service = SELECT * FROM services WHERE id = ? (con product, client, billingProfile, pricing precargados)
       ├── Idempotency guard:
       │     if (service.status ∈ {'active', 'cancelled', 'terminated'}) → log + skip
       ├── plugin = PluginRegistryService.get(service.product.provisioner)
       │     if (!plugin) → emit service.provisioning_failed{reason:'plugin_not_registered'}; return
       ├── UPDATE services SET status='provisioning', provisioner_slug=plugin.slug
       ├── ctx = { service, client, productConfig, serverId: null, correlationId }
       ├── result = await plugin.provision(ctx)                  ← lógica del proveedor
       ├── UPDATE services SET provider_reference=result.providerReference, metadata=result.metadata
       └── Procesa result.followUp:
             ├── 'mark_active' → markActive(service) → status='active' + emit service.activated
             ├── 'wait_for_task_completion' → log (listener provisioning-on-task-completed activará luego)
             └── 'create_setup_task' → tasksService.create(type='support_setup', cola pública ADR-072)
                                            │
6. (Si plugin lanza ProvisionerPluginError)
   ├── retriable=true → re-throw → BullMQ retry [30s, 90s, 270s, 810s, 2430s]
   │                                  └── Tras 5 intentos → DlqService → emit dlq.job_failed → alerta superadmin
   └── retriable=false → markFailed(service, code) → status='cancelled' + cancellation_reason='provisioning_failed:<code>' + emit service.provisioning_failed
```

**Idempotencia triple guard:**
1. **`jobId` estable** (`provision-${serviceId}-${correlationId}`) — BullMQ descarta duplicados automáticamente.
2. **`services.status` check al inicio** — si el service ya está `active`/`cancelled`/`terminated`, skip.
3. **`plugin.provision()` debe ser idempotente** por `provider_reference` — si el recurso ya existe en el proveedor, devuelve éxito sin recrear (responsabilidad del plugin, ADR-077 §1).

---

## 4. Cola BullMQ `provisioning-dispatch`

| Item | Valor |
|------|-------|
| Nombre | `provisioning-dispatch` |
| Job principal | `provision-service` (payload `{ service_id, correlation_id }`) |
| Productor | `ProvisioningOrchestratorService.handleInvoicePaid()` (auto vía `@OnEvent('invoice.paid')`) + endpoint admin `POST /admin/services/:id/reprovision` (manual) + tests |
| Procesador | `ProvisioningDispatchProcessor.process()` |
| Defaults | `attempts=5`, backoff exponencial 30s → 480s, `removeOnComplete: { age: 3600 }`, `removeOnFail: false` |
| DLQ | ✅ — `DlqService.register('provisioning-dispatch')` en `OnModuleInit` del processor |
| Tests unit | `provisioning-orchestrator.service.spec.ts` (10/10 verde) — service no encontrado, idempotente, terminal, plugin no registrado, OK mark_active, OK create_setup_task, retriable re-throw, no-retriable cancela, invoice.paid encola N services, sin services no encola |
| Tests E2E | `provisioning-manual-flow.spec.ts` + `provisioning-services-rest.spec.ts` (Fase 11.C+D) |

Detalle global de la cola en [`docs/50-operations/jobs-reference.md`](../../50-operations/jobs-reference.md).

---

## 5. Cache Redis DB 2 — `service_info`

`ProvisioningCacheService` mantiene el cache de `getServiceInfo()` para que la página `/dashboard/services/[id]` no martillee al proveedor.

| Item | Valor |
|------|-------|
| Redis DB | **2** (DB 0 settings, DB 1 BullMQ, DB 2 provisioning cache — reservada en `JobsModule`) |
| Prefijo | `aelium-provisioning:service_info:<service_id>` |
| TTL | Configurable vía setting `provisioning.service_info_ttl_seconds` (default 60s) |
| Política fail-open | Si Redis cae, log warn + llamada directa al plugin. Degradación elegante — la página sigue funcionando (sin cache, más lenta). |
| Invalidación | Automática en `executeActionWithCacheInvalidation()` tras éxito (el plugin no la gestiona). |
| Quién lee/escribe | SOLO `getServiceInfoWithCache()` y `executeActionWithCacheInvalidation()`. Plugins NO acceden al cache directamente (R4 + ADR-077 §5). |

---

## 6. PluginRegistryService — registro y validaciones al boot

El registry usa el patrón canónico NestJS de **token DI multi-injection** (`PROVISIONER_PLUGINS`). En `provisioning.module.ts`:

```typescript
{
  provide: PROVISIONER_PLUGINS,
  useFactory: (internal, manual) => [internal, manual],
  inject: [InternalProvisionerPlugin, ManualProvisionerPlugin],
}
```

> **Nota canónica:** NestJS DI no soporta `multi: true` Angular-style. La factory compone el array manualmente. Cuando llegue un plugin nuevo (Sprint 15A-G), basta añadirlo al `inject` y al return.

### Validaciones al boot (`onModuleInit`)

5 invariantes que deben cumplirse — si alguna falla, el backend NO arranca:

1. **`contractVersion === 'v2'`** — todos los plugins implementan el contrato v2 congelado por ADR-077.
2. **`slug` en kebab-case** — sin mayúsculas, espacios ni símbolos.
3. **No duplicados** — dos plugins no pueden tener el mismo slug.
4. **Coherencia `panel_label`** — si `has_sso_panel=true`, debe declarar `panel_label`.
5. **Action slug uniqueness** — dentro de cada plugin, `inlineActions[].slug` son únicos.

> Si quieres añadir una validación nueva (ej. todos los plugins deben tener `has_metrics_history=false` salvo `docker_engine`), edita `plugin-registry.ts` + añade test unit. Cualquier nueva validación requiere ADR si modifica el contrato canónico.

---

## 7. Operativa diaria — checklist del agente

### 7.1 Ver el estado de la cola

```bash
# (vía API de monitoring BullMQ, futuro Sprint 14 con Bull-Board / Arena)
# Hoy: revisar logs del backend + tabla failed_jobs
SELECT * FROM failed_jobs WHERE queue = 'provisioning-dispatch' ORDER BY created_at DESC LIMIT 20;
```

### 7.2 Cuando un cliente reporta "mi servicio no se activa"

1. Buscar el service en `/admin/services` (filtrar por cliente o por dominio).
2. Si `status='pending'` desde hace más de 5 minutos:
   - Si `provisioner_slug='manual'` → ir a `/admin/tasks?scope=unassigned` y buscar la task `support_setup` asociada (campo `service_id`). Tomarla y completarla.
   - Si plugin automático → revisar `failed_jobs` filtrando por payload `service_id`. Si hay entrada → ver `last_error`. Reparar causa raíz (credenciales, capacidad, etc.) y reprovisionar.
3. Si `status='cancelled'` con `cancellation_reason` empezando por `provisioning_failed:<code>`:
   - Identificar el `<code>` (es un `ProvisionerErrorCode`).
   - Reparar la causa según el código (ver tabla §8).
   - `POST /admin/services/:id/reprovision` para volver a intentarlo (idempotente).

### 7.3 Cuando el panel del proveedor está caído

- La página cliente seguirá funcionando — `getServiceInfo()` devuelve `status='unknown'` con cache short-TTL del error (evita martillar al proveedor).
- En la UI cliente verás "Estado no disponible temporalmente". Volverá automáticamente cuando el proveedor responda.

### 7.4 Cuando hay que reprovisionar un servicio activo

Caso típico: el cliente perdió acceso a su panel cPanel, el plugin tiene la capacidad de reset password pero el cron de reconciliación detectó drift. Manual:

```bash
# Reprovisionar (idempotente — el plugin verá provider_reference existente y devolverá éxito sin recrear)
curl -X POST $API/v1/admin/services/<id>/reprovision -H "Authorization: Bearer $TOKEN"
```

### 7.5 Cuando hay que cancelar admin un servicio

```bash
curl -X POST $API/v1/admin/services/<id>/deprovision -H "Authorization: Bearer $TOKEN"
```

Esto:
1. Marca `services.status='cancelled'` + `cancelled_at=now()` + `cancellation_reason='admin_deprovision'`.
2. Llama `plugin.deprovision(ctx)` (idempotente — si ya está cancelado externamente, no falla).
3. Emite `service.cancelled` + `audit_change_log` con `actor=staff`.

> **Cuidado:** `deprovision` puede ser irreversible según el plugin (`docker_engine` borra el contenedor, `resellerclub` no permite deshacer transfer-out). Confirma con el cliente antes de ejecutar.

---

## 8. ProvisionerErrorCode — semántica + acción del agente

| Código | Retriable | Causa típica | Qué hacer el agente |
|--------|-----------|--------------|---------------------|
| `PROVIDER_TIMEOUT` | ✅ | Proveedor lento / red | BullMQ reintenta solo. Si entra en DLQ tras 5 intentos → revisar status del proveedor. |
| `PROVIDER_RATE_LIMITED` | ✅ | Excedido cuota API del proveedor | Esperar. Si recurrente → revisar cuota del plan contratado con el proveedor. |
| `PROVIDER_AUTH_FAILED` | ❌ | Credenciales incorrectas / token expirado | **Acción inmediata:** revisar credenciales del plugin en Settings (Sprint 12) o env vars. Tras corregir, reprovisionar. |
| `PROVIDER_RESOURCE_EXHAUSTED` | ❌ | Capacidad superada (ej. servidor Docker sin RAM, plan cPanel sin slots) | Asignar más capacidad (Sprint 10 Infrastructure) o subir plan. Tras corregir, reprovisionar. |
| `INVALID_PAYLOAD` | ❌ | DTO mal del orquestador (bug interno) | Reportar issue al equipo. NO se reproduce por reintento. |
| `INVALID_STATE` | ❌ | Servicio en estado incompatible para la operación | Verificar `services.status`. Si está corrupto, intervenir vía SQL con audit trail. |
| `NOT_IMPLEMENTED` | ❌ | Capability declarada pero no soportada (bug del plugin) | Reportar issue. Bug. |
| `PROVIDER_INTERNAL_ERROR` | ✅ por defecto (plugin puede sobreescribir) | Error 500 del proveedor | BullMQ reintenta. Si recurrente → contactar soporte del proveedor. |
| `NETWORK_ERROR` | ✅ | DNS / red | BullMQ reintenta. Si recurrente → revisar conectividad backend → proveedor. |

---

## 9. Listener `provisioning-on-task-completed` (Sprint 11 Fase 11.C)

Cuando un agente completa una task asociada a un service en `wait_for_task_completion`, este listener activa el service.

```typescript
@OnEvent('task.completed')
async handle(payload: { task, completedBy }) {
  // Filtro canónico: NO por task.type ('support_setup' está hardcoded en el bridge ticket↔task).
  // Filtra por capability del plugin del service.
  if (!task.service_id) return;                   // task no asociada a service
  const service = await loadService(task.service_id);
  const plugin = registry.get(service.provisioner_slug);
  if (!plugin?.capabilities.completes_via_task) return;  // plugin no espera task

  // Activa el service
  await orchestrator.markActive(service);
}
```

**EC-P11-07 mutuamente excluyente con bridge ticket↔task:** el bridge filtra por `task.conversation_id != null`; este listener filtra por `service_id != null` + capability flag. Una task no puede tener ambas al mismo tiempo (clase `support_setup` vs `support_ticket` son tipos distintos).

> **Diseño abierto a Sprint 22 Projects:** cuando exista un plugin `project` con `capabilities.completes_via_task=true` reusará el mismo listener sin código nuevo.

---

## 10. Smoke testing manual del orquestador (Yasmin)

### 10.1 Flujo automático `internal`

```
Login Carla → /dashboard/billing/checkout (Plan Pro Support Inside, mensual)
            → completar pago manual (admin marca invoice.paid)
            → backend logs: ProvisioningOrchestratorService.provisionService called
            → service status: pending → provisioning → active (sub-segundo)
            → emit service.activated + (Sprint 8 D.12.9) service.provisioned (legacy)
            → SupportInsideOnServiceProvisionedListener crea/reactiva subscription
            → Carla ve plan activo en /dashboard/support-inside Y service activo en /dashboard/services
```

### 10.2 Flujo `manual` end-to-end

```
Login Carla → /dashboard/billing/checkout (producto manual, ej. hosting-pro)
            → completar pago
            → backend logs: provisión OK → followUp create_setup_task
            → tasksService.create(type=support_setup, assigned_to=null)
            → /admin/tasks?scope=unassigned muestra la task
Login admin → tomar task → completar con notas
            → emit task.completed
            → ProvisioningOnTaskCompletedListener filtra por completes_via_task=true (manual=true) → markActive
            → service status: pending → active
            → Carla recibe email + ve service activo
```

### 10.3 Flujo retriable

```
(simulación: plugin lanza ProvisionerPluginError(PROVIDER_TIMEOUT, retriable=true))
→ BullMQ encola con backoff 30s → 90s → 270s → 810s → 2430s
→ Si el plugin se recupera antes del 5º intento, OK
→ Si no, entra en DLQ + emite dlq.job_failed → alerta superadmin (campana + email)
```

### 10.4 Flujo no-retriable

```
(simulación: plugin lanza ProvisionerPluginError(PROVIDER_AUTH_FAILED, retriable=false))
→ Orquestador marca service cancelled + cancellation_reason='provisioning_failed:PROVIDER_AUTH_FAILED'
→ emit service.provisioning_failed
→ (TODO Fase posterior: listener notifications alerta superadmin con motivo + service_id)
```

### 10.5 Reprovisionar tras corregir causa raíz

```
1. Identificar service cancelled con cancellation_reason='provisioning_failed:PROVIDER_AUTH_FAILED'
2. Corregir credenciales del plugin (Settings o env)
3. POST /admin/services/<id>/reprovision
4. service status: cancelled → provisioning → active
5. emit service.activated
6. audit_change_log fila con actor=staff + correlation_id
```

---

## 11. Métricas a vigilar (cuando exista monitoring real — Sprint 14)

- **Cola `provisioning-dispatch` profundidad** (jobs pendientes).
- **DLQ `provisioning-dispatch` count** (jobs fallidos sin recuperar).
- **Latencia p95 `plugin.provision()`** por slug (detecta plugins lentos).
- **Tasa de éxito vs fallo** por `provisioner_slug` (detecta proveedor con problemas).
- **Cache hit ratio Redis DB 2** (`service_info:*`) — debería ser >80% en horario laboral.

---

## 12. Cabos sueltos registrados (para sprints futuros)

| Tema | Por qué no está hoy | Cuándo se cierra |
|------|---------------------|------------------|
| Listener `notifications` para `service.provisioning_failed` | Pipeline Sprint 11 emite el evento; listener no añadido para no bloquear cierre Fase 11.E | Sprint 12 / cuando llegue plugin real con coste de fallo significativo |
| Listener `audit` para `service.metrics_fetched` / `action_executed` / `sso_opened` | Pipeline Sprint 11 emite los eventos; transparencia RGPD ya cubierta vía `/dashboard/transparency` | Sprint 12 / portal RGPD |
| Reconciliación cron por plugin (`getStatus()` periódico) | Plugins triviales no necesitan reconciliación; Sprint 15A-G la añadirán | Sprint 15C+ (primer plugin con `supports_reconciliation=true`) |
| Webhook listener para plugins con `provision_mode='async'` | Hoy ningún plugin lo necesita; capability flag está reservado | Sprint cuando llegue plugin async (ej. ciertos cPanel) |
| Vista admin `/admin/services/:id` (detalle con audit feed inline + override `provisioner_data`) | Diferida a Sprint 13 §13.AUTH (requiere Server Components + cookies httpOnly) | Sprint 13 |

---

## Referencias canónicas

- [ADR-021](../../10-decisions/adr-021-provisioners.md) — interfaz mínima v1.
- [ADR-070](../../10-decisions/adr-070-service-info-sso-acciones-curadas.md) — service info + SSO + acciones curadas + 5 criterios para acción nueva.
- [ADR-077](../../10-decisions/adr-077-contrato-provisioner-plugin-v2.md) — contrato canónico v2 congelado.
- [ADR-009](../../10-decisions/adr-009-estrategia-plugins.md) — patrón plugin general.
- [ADR-033](../../10-decisions/adr-033-outbox-pattern-pendiente.md) — `invoice.paid` viaja por Outbox.
- [ADR-055](../../10-decisions/adr-055-resiliencia-circuit-breaker.md) — circuit breaker en wrappers.
- [ADR-063](../../10-decisions/adr-063-bullmq-canonico-dlq-retries.md) — cola con DLQ.
- [`docs/20-modules/provisioning/contract.md`](../../20-modules/provisioning/contract.md) — contrato del módulo (12 secciones canónicas).
- [`docs/features/services/admin.md`](../services/admin.md) — vista del producto Services para el staff.
- [`docs/50-operations/jobs-reference.md`](../../50-operations/jobs-reference.md) — cola `provisioning-dispatch`.
- [`docs/50-operations/settings-reference.md`](../../50-operations/settings-reference.md) — setting `provisioning.service_info_ttl_seconds`.
- [`docs/60-roadmap/completed/sprint-11-provisioning.md`](../../60-roadmap/completed/sprint-11-provisioning.md) — retrospectiva del sprint.
