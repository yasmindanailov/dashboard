# Servicios — Guía de administración

> Módulo: `services` (instancias contratadas — tabla `services`) gestionadas por el orquestador `provisioning`.
> Sprints: 11 (orquestador + plugins triviales + frontend) — Fases 11.A → 11.E.
> Última actualización: 2026-05-02 (Sprint 11 Fase 11.E cierre).
> Audiencia: superadmin + `agent_full` (`Manage.Service`); `agent_billing` y `agent_support` con `Read/List.Service`.

---

## 1. Qué es "servicios" para el staff

Un **servicio** (`services` row) es una instancia concreta de un **producto** (`products` row) contratada por un cliente: una cuenta cPanel concreta, un dominio concreto, un contenedor Docker concreto, una suscripción Support Inside concreta. **No confundir con el catálogo** de productos (`/admin/products`) — ahí se editan los productos vendibles; aquí se gestionan las instancias activas de los clientes.

El módulo se compone de dos piezas coordinadas:

| Pieza | Rol |
|-------|-----|
| **`services` (tabla)** | Estado canónico de cada instancia: cliente, producto, status, dominio, ciclo de cobro, próximo vencimiento, `provisioner_slug` denormalizado, `provider_reference` (ID externo en el proveedor), `provisioner_data` jsonb. Co-propiedad funcional billing↔provisioning. |
| **`provisioning` (módulo)** | Orquestador del lifecycle: escucha `invoice.paid`, decide qué plugin invocar, ejecuta, persiste resultado, cachea `service_info` para la página detalle, audita acciones cliente. Detalles internos en [`docs/features/provisioning/admin.md`](../provisioning/admin.md). |

> **Doctrina canónica ([ADR-070](../../10-decisions/adr-070-service-info-sso-acciones-curadas.md)):** una sola página `/dashboard/services/[id]` para TODOS los productos. La UI ramifica por capability flags del plugin, NUNCA por `if (provisioner === 'X')`. El admin tiene una vista cross-cliente paralela en `/admin/services` con filtros para ops/incidentes.

---

## 2. UI canónica — 2 rutas admin (Sprint 11 Fase 11.D)

### 2.1 `/admin/services` (vista cross-cliente)

**Tabla con filtros** para ops/incidentes. Columnas:

| Cliente | Producto | Plugin | Estado | Vencimiento | Acciones |
|---------|----------|--------|--------|-------------|----------|

Filtros en cabecera: cliente (search-as-you-type), `provisioner_slug` (select), `status` (select), texto libre. Paginación canónica DS.

> **Para qué sirve:** ver qué clientes tienen servicios `pending`/`failed` para investigar incidente de provisioning, listar por plugin para verificar despliegue de un proveedor concreto, encontrar rápidamente un servicio del que sólo conoces el dominio.
>
> **Para qué NO sirve:** atención cotidiana al cliente. Cuando un cliente abre ticket sobre su servicio, abre su ficha en `/admin/clients/<id>` (que tendrá bloque "Servicios contratados" — pendiente sprint posterior, **DC.29** en `backlog.md`).

### 2.2 `/admin/services/<id>` (detalle admin) — ✅ Sprint 15C Fase 15C.J

SC nativo paralelo al detalle cliente (`/dashboard/services/[id]/page.tsx`). Llama `GET /admin/services/${id}` que devuelve el mismo `ServiceDetailResponse` shape pero sin filtro ownership (`AdminProvisioningController.detail` con `isAdmin=true`). Reusa `ServiceHeader` + `MetricsBar` + `SsoButton` + `ActionsBar` (con `isAdmin=true`) del `_shared/services/`. Añade:

- **Card "Datos del servicio (admin)"** — info no expuesta al cliente: Service ID, owner link a `/admin/clients/[user_id]`, provisioner_slug, producto (nombre + slug + type), estado canónico Prisma, fecha creación.
- **SSO panel** — mismo botón que el cliente. Al pulsarlo, el wrapper `getSsoUrlWithAudit` detecta admin sobre service ajeno y emite `service.admin_sso_impersonation` (Sprint 15C Fase F) → portal transparency del cliente afectado lo expone.
- **`ActionsBar`** — renderiza únicamente las actions cuyo `slug` NO está en `INTERNAL_HELPER_SLUGS = ['change_package', 'list_available_plans']` (blacklist Fase J en `_shared/services/ActionsBar.tsx`). Para `enhance_cp`: solo `force_resync` aparece como botón directo.
- **Card "Operaciones admin"** — botón "Cambiar plan…" (CC `AdminServiceOperationsCard` colocated en `_components/`) que abre `ChangePackageModal`. El modal:
  1. Al abrir, invoca `executeAction('list_available_plans')` (10ª inline action `adminOnly=true`, ADR-083 Amendment A3) para poblar dropdown con planes del Master Org Aelium.
  2. Admin selecciona target + confirma → invoca `executeAction('change_package', {planId})`.
  3. Backend hace PATCH a Enhance + actualiza `service.metadata.enhance_plan_id` (Sprint 15C Fase H bug fix — evita `plan_divergence` false-positive en cron L3).
  4. Success → modal cierra + Server Action revalida `/admin/services/${id}`.
- **Banner DNS gestión** — link condicional si `info.capabilities.has_dns_management=true`. La UI admin nativa de DNS (`/admin/services/[id]/dns`) llegará en sprint futuro; por ahora el admin abre el panel del proveedor vía SSO.

**Reprovision/Deprovision** — endpoints `POST /admin/services/:id/reprovision` y `POST /admin/services/:id/deprovision` siguen disponibles vía REST + script (no son scope de 15C.J — se difieren a sprint futuro de hardening admin):

```bash
curl -X POST $API/v1/admin/services/<id>/reprovision -H "Authorization: Bearer $TOKEN"
curl -X POST $API/v1/admin/services/<id>/deprovision -H "Authorization: Bearer $TOKEN"
```

---

## 3. Endpoints REST — operativa para staff (Sprint 11 Fase 11.D)

### 3.1 Cliente (`/api/v1/services/`) — referencia, no para staff

| Método | Path | Permiso CASL | Devuelve |
|--------|------|--------------|----------|
| `GET` | `/services` | `List.Service` (filtrado `user_id = caller.id`) | Listado paginado |
| `GET` | `/services/:id` | `Read.Service` (ownership) | Detalle + `getServiceInfo()` cacheado 60s |
| `POST` | `/services/:id/sso` | `Read.Service` (ownership) | `{ sso: SsoUrl \| null }` — abre panel proveedor; emite `service.sso_opened` |
| `POST` | `/services/:id/actions/:slug` | `Update.Service` (ownership) | `ActionResult` — valida slug ∈ `inline_actions`; emite `service.action_executed` |

### 3.2 Admin (`/api/v1/admin/services/`)

| Método | Path | Permiso CASL | Uso típico |
|--------|------|--------------|-----------|
| `GET` | `/admin/services` | `Manage.Service` (`AdminOnlyGuard` + `agent_full`) | Vista cross-cliente con filtros (`?clientId=`, `?provisionerSlug=`, `?status=`, `?q=`) |
| `GET` | `/admin/services/:id` | `Manage.Service` | Detalle admin (sin restricción ownership) |
| `POST` | `/admin/services/:id/reprovision` | `Manage.Service` | Escotilla: re-ejecuta `plugin.provision()`. Útil cuando reparaste la causa raíz de un fallo. Idempotente. Emite `service.activated` o `service.provisioning_failed` según resultado. |
| `POST` | `/admin/services/:id/deprovision` | `Manage.Service` | Cancelación admin: marca `services.status='cancelled'`, llama `plugin.deprovision()`, emite `service.cancelled`. Auditado en `audit_change_log` con `actor=staff`. |

> **Defense in depth:** los endpoints `/admin/*` pasan por `JwtAuthGuard` → `AdminOnlyGuard` → `PoliciesGuard(Manage.Service)`. Tres capas que el atacante debe romper para ejecutar reprovision/deprovision sobre servicio ajeno.

---

## 4. Estados canónicos y transiciones

```
                 invoice.paid (cliente paga)
                          │
                          ▼
                     ┌─────────┐
                     │ pending │ ◄── BillingCheckoutService crea aquí
                     └────┬────┘
                          │ orquestador toma el job (BullMQ provisioning-dispatch)
                          ▼
                  ┌───────────────┐
                  │ provisioning  │
                  └───────┬───────┘
                          │
              ┌───────────┴────────────┬──────────────────────┐
              ▼                        ▼                      ▼
        ┌──────────┐            ┌──────────────┐       ┌────────────┐
        │  active  │            │ wait_for_task│       │ cancelled  │
        │          │            │ _completion  │       │ + reason   │
        └────┬─────┘            └──────┬───────┘       └────────────┘
             │                         │ task.completed
             │                         ▼
             │                   service.activated
             │                   (listener provisioning-on-task-completed)
             │
             │ admin acción / impago
             ▼
       ┌───────────┐                ┌──────────┐
       │ suspended │ ────────────► │ cancelled │
       └───────────┘  grace expira └──────────┘
```

**Quien controla cada transición:**

| Transición | Disparador | Servicio responsable |
|------------|-----------|---------------------|
| `pending → provisioning → active` | `invoice.paid` → orquestador → plugin OK con `followUp: ['mark_active']` | `ProvisioningOrchestratorService.markActive()` |
| `pending → wait_for_task_completion → active` | Plugin manual con `followUp: ['create_setup_task']` → agente completa task | `ProvisioningOnTaskCompletedListener` (filtra por `capabilities.completes_via_task`) |
| `pending → cancelled` | Plugin lanza error no-retriable (auth fail, invalid payload, etc.) | Orquestador con `cancellation_reason='provisioning_failed:<code>'` |
| `active → suspended` | `autoSuspendServices` cron tras agotar reintentos de pago | `billing-lifecycle.worker` — emite `service.suspended` (huérfano hoy; Sprint 11 Fase 11.C+ lo enchufa al orquestador para `plugin.deprovision()` o pause) |
| `suspended → cancelled` | `autoCancelServices` cron tras `billing.cancellation_after_suspension_days` | `billing-lifecycle.worker` |
| `* → cancelled` (admin) | `POST /admin/services/:id/deprovision` | `ProvisioningService.deprovision()` |
| Reabrir desde fallo | `POST /admin/services/:id/reprovision` | `ProvisioningService.reprovision()` (idempotente) |

---

## 5. Schema canónico — `services` (Sprint 11 Fase 11.B + columnas nuevas)

Detalle completo en [`docs/30-data/billing.md`](../../30-data/billing.md). Resumen de los campos relevantes para el staff:

| Campo | Notas |
|-------|-------|
| `provisioner_slug` | Denormalizado de `product.provisioner` al provisionar. **Inmutable tras `service.activated`** — el plugin que provisionó es el dueño del lifecycle aunque el admin cambie luego `product.provisioner` desde Settings. |
| `provider_reference` | ID externo en el sistema del proveedor (cPanel account ID, ResellerClub domain ID, Docker container ID, etc.). NULL para plugins `internal`/`manual`. **Indexado** para resolver el servicio desde callbacks/webhooks. |
| `provisioner_data` (jsonb) | Datos adicionales del plugin: credenciales encriptadas, `ssl_expires_at`, `resource_config`. Encriptado en reposo si contiene secrets ([ADR-015](../../10-decisions/adr-015-encriptacion-credenciales.md)). |
| `metadata` (jsonb) | Datos planos sin secretos para auditoría / display. |
| `cancellation_reason` (text) | Cuando es fallo de provisioning, formato `provisioning_failed:<ProvisionerErrorCode>` (ej: `provisioning_failed:PROVIDER_AUTH_FAILED`). |

---

## 6. Plugins disponibles (Sprint 11 Fase 11.C — triviales)

| Plugin | Slug | Ámbito | `has_sso_panel` | Acciones inline | Cuándo se usa |
|--------|------|--------|-----------------|-----------------|---------------|
| Internal | `internal` | Productos digitales sin proveedor externo (Support Inside, futuros add-ons digitales) | ❌ | (vacío) | Activación inmediata al cobro. `followUp: ['mark_active']`. |
| Manual | `manual` | Productos cuya activación requiere intervención humana (hosting hoy, productos sin API automatizable) | ❌ | (vacío — el cliente interactúa por ticket) | Crea Task `support_setup` en cola pública (ADR-072). Agente la completa → service activado vía `ProvisioningOnTaskCompletedListener`. |

**Plugins reales planificados** (Sprint 15A-G — cada uno con su propio sub-sprint):

| Plugin | Sprint | Productos | SSO | Acciones inline canónicas |
|--------|--------|-----------|-----|---------------------------|
| `enhance_cp` | 15C | Hosting Enhance Control Panel | ✅ | `reset_account_password`, `view_disk_usage`, `view_bandwidth_usage` |
| `cpanel_whm` | 15C bis | Hosting cPanel/WHM | ✅ | (mismas que `enhance_cp`) |
| `resellerclub` | 15D | Dominios ResellerClub | ❌ | DNS records CRUD + transfer-out + auto-renew |
| `docker_engine` | 15E | Contenedores Docker propios | ⚠ condicional (depende de `docker_template.admin_panel_url`) | `restart_container`, `view_logs_tail_100`, `reset_admin_password`, `change_subdomain`, `request_resource_upgrade` |
| `plesk_obsidian` | 15G | Hosting Plesk | ✅ | (mismas que `enhance_cp`) |

> **Doctrina del catálogo de acciones:** lista CERRADA por plugin. Añadir una acción nueva exige cumplir 5 criterios + ADR específico del plugin (ver [ADR-077](../../10-decisions/adr-077-contrato-provisioner-plugin-v2.md) §4 doctrina canónica).

---

## 7. Cómo opera el agente la cola de provisioning

El orquestador funciona solo — el agente sólo interviene cuando algo falla o cuando el plugin es `manual`. Detalles operativos completos (cómo se reenruta una tarea de la cola pública, cómo se reprovisiona tras corregir credenciales, qué métricas vigilar) en [`docs/features/provisioning/admin.md`](../provisioning/admin.md).

**Resumen rápido:**

1. Cliente paga factura → `invoice.paid` (Outbox) → orquestador encola N jobs `provision-service` (uno por `service_id` en `invoice_items`).
2. Worker BullMQ ejecuta el plugin correspondiente. Si `mark_active` → service `active` + email cliente. Si `create_setup_task` → tarea aparece en `/admin/tasks?scope=unassigned` para que un agente la tome.
3. Si plugin lanza error retriable → BullMQ reintenta con backoff `[30s, 90s, 270s, 810s, ...]`. Si supera 5 intentos → DLQ + alerta superadmin (`dlq.job_failed`).
4. Si plugin lanza error no-retriable → service `cancelled` + emite `service.provisioning_failed` (alerta superadmin pendiente, ver §11).

---

## 8. Eventos emitidos del dominio service (Sprint 11 Fase 11.B)

| Evento | Cuándo se emite | Consumidor canónico |
|--------|-----------------|---------------------|
| `service.activated` | `markActive()` post-provision OK | Plugins reales Sprint 15 (ej. listener para abrir tickets de bienvenida) |
| `service.provisioning_failed` | Error no-retriable o plugin no registrado | Listener notifications (pendiente — alerta superadmin) |
| `service.metrics_fetched` | Wrapper `getServiceInfoWithCache` cache-miss | Listener audit (pendiente — RGPD: cliente sabe cuándo se consultó) |
| `service.action_executed` | Wrapper `executeActionWithCacheInvalidation` | Listener audit (pendiente) |
| `service.sso_opened` | Wrapper `getSsoUrlWithAudit` post-éxito | Listener audit (pendiente — RGPD genérico) |
| `service.admin_sso_impersonation` ⭐ | Wrapper `getSsoUrlWithAudit` cuando `actorIsAdmin && service.user_id !== actorUserId` (Sprint 15C Fase 15C.F) | **`AuditAdminSsoImpersonationListener`** persiste `audit_access_log` con `metadata.target_user_id = service.user_id` → portal `/dashboard/transparency` lo expone al cliente afectado (ADR-083 §4 decisión 14) |
| `service.reconciled_external_change` ⭐ | `EnhanceReconciliationCron` (`@Cron(EVERY_6_HOURS)` estático, Sprint 15C Fase 15C.H) cuando detecta drift comparando Enhance subscription vs Aelium-side. 3 sub-tipos: `subscription_missing` (404), `status_divergence` (Aelium adopta auto si target ∈ {active, suspended}), `plan_divergence` (compara contra `service.metadata.enhance_plan_id`, NO contra `Product.provisioner_config`) | **`AuditOnServiceReconciledExternalChangeListener`** persiste `audit_change_log` (user_id=null, sistema) con `_meta.gdpr_visible_to_data_subject` per change_type. **`NotificationsOnReconciliationThresholdExceededListener`** SQL count + dispatchToSuperadmins si supera setting `provisioning.enhance_cp.reconciliation_alert_threshold` (default 5/24h, dedupe 24h). ADR-083 §6 decisión 24 |
| `service.provisioned` | `BillingCheckoutService` al CREAR el service (legacy histórico — coexiste, ver decisión local) | `SupportInsideOnServiceProvisionedListener` (Sprint 8 D.12.9 / ADR-076) |

> **Decisión local canónica:** `service.activated` (nuevo Sprint 11) coexiste con `service.provisioned` (legacy). Plugins reales Sprint 15 consumen `service.activated` — `service.provisioned` se preserva intacto para no romper Sprint 8 D.12.9. Documentado en docstring de `ProvisioningOrchestratorService` y en [`current.md` §Sprint 11 §9 (ahora movido a `completed/sprint-11-provisioning.md`)](../../60-roadmap/completed/sprint-11-provisioning.md).

---

## 9. Permisos CASL

Resumen extraído de [`_matrix.md`](../../20-modules/_matrix.md) (granularidad ADR-067):

| Subject | superadmin | agent_full | agent_billing | agent_support | client | partner |
|---------|:---------:|:----------:|:-------------:|:-------------:|:------:|:-------:|
| `Service` | Manage | Manage | Read/List | Read/List | Read+List+Update (own) | Read/List (partner_scoped) |

- **Cliente** sólo ve sus servicios (filtro `user_id = caller.id` server-side). Puede ejecutar acciones inline + abrir SSO sobre los suyos.
- **`agent_billing` / `agent_support`**: lectura para contexto en su rol (factura/conversación). NO mutaciones.
- **`agent_full` / superadmin**: gestión completa, incluyendo reprovision/deprovision.

---

## 10. Smoke testing manual (para Yasmin tras el cierre)

> Cuenta seedeada: Carla (`cliente@aelium.test` / `Cliente2026!`).

1. **Flujo manual end-to-end** (plugin `manual`):
   - Login Carla → `/dashboard/billing/checkout?product_pricing_id=<hosting-pro-mensual>` → completar pago.
   - Login admin → `/admin/tasks?scope=unassigned` → debe aparecer task `support_setup` con el service_id.
   - Tomar la task → completarla con notas → en `/admin/services` filtrar por Carla → service debe estar `active`.
   - Login Carla → `/dashboard/services` → ver el service `Activo` → click en el detalle → cabecera + estado correctos. SSO null + acciones vacías (esperado para `manual`).

2. **Flujo `internal` end-to-end** (Support Inside):
   - Login Carla → `/dashboard/support-inside` → suscribirse a Plan Pro → completar pago.
   - El listener Sprint 8 D.12.9 + plugin `internal` deben coordinarse: subscription creada → service `active` inmediato.
   - Login Carla → `/dashboard/services` → ver Plan Pro `Activo`.

3. **Flujo admin escotilla**:
   - Login superadmin → `/admin/services` → filtro `provisioner_slug=internal` → reprovision sobre un service `pending` → confirmar entrada en `audit_change_log` (table directa por ahora; portal `/admin/audit` ya operativo desde Sprint 9).

4. **Verificaciones genéricas**:
   - Sin errores en consola del navegador.
   - UI cumple Design System (tokens `--brand`, `--surface-*`, `--text-*` — sin colores fantasma).
   - Marker ADR-078 presente en cada Client Component nuevo (`grep -r "TODO(ADR-078" frontend/app` → 5 entries esperadas Fase 11.D).

---

## 11. Cabos sueltos registrados (post-Sprint 11)

| ID | Tema | Dónde se cierra |
|----|------|-----------------|
| **DC.17** (cierre parcial) | UI inline del slot Support Inside desde `/dashboard/services/[id]` (cliente lo solicita desde la card del servicio) | Sprint posterior — endpoint y vista listos, falta formulario inline + tests E2E. Reescrito en `backlog.md` DC.30 |
| **DC.29** (nueva) | Bloque "Servicios contratados" en `/admin/clients/[id]` (vista relacional cotidiana del agente) | Oportunista al tocar `/admin/clients/[id]` |
| **DC.30** (nueva) | UI inline Support Inside en detalle servicio cliente | Sprint posterior |
| **DC.31** (nueva) | `<AuditLogFeed>` inline en `/dashboard/services/[id]` | Diferido — la transparencia RGPD ya vive en `/dashboard/transparency` |
| Listener `notifications` para `service.provisioning_failed` | Alerta superadmin de fallos de provisioning | Sprint posterior — los plugins reales Sprint 15 lo necesitan |
| Listener `audit` para `service.metrics_fetched` / `action_executed` / `sso_opened` | RGPD: cliente sabe qué se consultó/ejecutó/abrió | Sprint posterior — pipeline ya emite los eventos correctamente |
| `service.cancelled/paused/resumed/suspended` huérfanos | El orquestador escuchará estos eventos para invocar `plugin.deprovision()` o pause | Sprint posterior cuando llegue plugin con efecto real (`docker_engine` Sprint 15E) |

---

## Referencias canónicas

- [ADR-021](../../10-decisions/adr-021-provisioners.md) — interfaz mínima v1.
- [ADR-070](../../10-decisions/adr-070-service-info-sso-acciones-curadas.md) — `getServiceInfo` + SSO + acciones curadas + 5 criterios para acción nueva.
- [ADR-077](../../10-decisions/adr-077-contrato-provisioner-plugin-v2.md) — contrato canónico v2 congelado.
- [ADR-078](../../10-decisions/adr-078-auth-server-side-cookies-httponly.md) — auth server-side (Sprint 11 Fase 11.D = última excepción permitida del patrón viejo).
- [`docs/features/provisioning/admin.md`](../provisioning/admin.md) — operativa interna del orquestador.
- [`docs/20-modules/provisioning/contract.md`](../../20-modules/provisioning/contract.md) — contrato canónico del módulo.
- [`docs/30-data/billing.md`](../../30-data/billing.md) — schema `services`.
- [`docs/50-operations/jobs-reference.md`](../../50-operations/jobs-reference.md) — cola `provisioning-dispatch` + DLQ.
- [`docs/60-roadmap/completed/sprint-11-provisioning.md`](../../60-roadmap/completed/sprint-11-provisioning.md) — retrospectiva del sprint.
