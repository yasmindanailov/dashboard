# provisioning — Contract

## 1. Propósito

Orquestador del lifecycle de servicios del cliente: recibe `invoice.paid` (vía R8 Outbox), decide qué `ProvisionerPlugin` invocar según `product.provisioner_slug`, le pasa contexto (servidor seleccionado por `infrastructure` cuando el plugin lo requiera, datos de cliente, configuración de producto), gestiona el resultado (success → `service.provisioned` + activar; failure → `service.provisioning_failed` + retries en BullMQ + DLQ), y mantiene el cache `service_info` en Redis que la página `/dashboard/services/[id]` consume.

**No habla con APIs externas.** El diálogo con cPanel, ResellerClub, Docker, Plesk, etc. lo hace cada plugin. El módulo `provisioning` es el **director de orquesta** que invoca la interfaz canónica.

## 2. Estado de implementación

⬜ **Stub.** Sprint 11 (P2.1 backlog) lo implementa.

Pendiente:
- **Fase 11.A — Contratos congelados** ([ADR-077](../../10-decisions/adr-077-contrato-provisioner-plugin-v2.md)): `core/provisioning/types.ts` literal del ADR + stubs `internal` y `manual` con interfaz cumplida + test contract genérico.
- **Fase 11.B — Orquestador**: `ProvisioningOrchestrator` (listener `invoice.paid` + cola `provisioning-dispatch` BullMQ) + 3 wrappers canónicos (`getServiceInfoWithCache`, `executeActionWithCacheInvalidation`, `getSsoUrlWithAudit`) en `core/provisioning/plugin-utils.ts`.
- **Fase 11.C — Plugins triviales**: `internal` (Support Inside) y `manual` (crea task `support_setup` en cola pública). Listener `provisioning-on-task-completed` filtrado por `capabilities.completes_via_task`.
- **Fase 11.D — Frontend**: página única cliente `/dashboard/services/[id]` (Server Component) + admin `/admin/services` con layout condicionado por `capabilities` del plugin.
- **Fase 11.E — Docs + retrospectiva**: `docs/features/provisioning/` + `docs/features/services/` + actualización `_events.md` + `_matrix.md`.

Cache Redis `service_info:<serviceId>` con TTL configurable + invalidación tras `executeAction` (gestionada por wrapper, no por plugin). Audit hooks emiten `service.action_executed`, `service.sso_opened`, `service.metrics_fetched` para que `audit` los persista.

## 3. Arquitectura → referencias canónicas

- [ADR-021](../../10-decisions/adr-021-provisioners.md) — interfaz mínima v1 `provision/deprovision/getStatus` y patrón "plugin libre dentro de la interfaz".
- [ADR-070](../../10-decisions/adr-070-service-info-sso-acciones-curadas.md) — decisión arquitectónica abstracta de `getServiceInfo` + `getSsoUrl` + `executeAction` + doctrina de acciones curadas (5 criterios para añadir una nueva).
- **[ADR-077](../../10-decisions/adr-077-contrato-provisioner-plugin-v2.md) — Contrato canónico `ProvisionerPlugin` v2 congelado (firma TypeScript + capability flags + shapes + pipeline canónico de wrappers + política de versionado + test contract genérico). Materializa ADR-070 a nivel de código. Sprint 11 Fase 11.A.**
- [ADR-071](../../10-decisions/adr-071-vista-admin-federada-infraestructura.md) — extensión opcional (vista admin federada) con `listRemoteServers` + `getProviderHealthSummary` para `/admin/infrastructure`. Mismo principio "no replicar panel del proveedor"; mapping inicial: `enhance_cp` ✅, `cpanel_whm` ✅, `plesk_obsidian` ✅, `directadmin` ⚠ parcial, `docker_engine` N/A (usa tabla `servers` directa), `resellerclub`/`internal`/`manual` ❌.
- [ADR-009](../../10-decisions/adr-009-estrategia-plugins.md) — patrón plugin general (manifest, loader, encriptación de credenciales).
- [ADR-043 §B](../../10-decisions/adr-043-infraestructura-self-hosted.md) — `infrastructure.pickServerForProduct()` se invoca **sólo** para plugins que consumen servidores propios (hoy únicamente `docker_engine` — Sprint 15E). El resto de plugins ignoran `infrastructure`.
- [ADR-033](../../10-decisions/adr-033-outbox-pattern-pendiente.md) — `invoice.paid` viaja por Outbox (R8); el orquestador consume desde el bus tras `OutboxDispatchProcessor`.
- [ADR-055](../../10-decisions/adr-055-resiliencia-circuit-breaker.md) — circuit breaker obligatorio en cada plugin (R11).
- [ADR-063](../../10-decisions/adr-063-bullmq-canonico-dlq-retries.md) — cola `provisioning-dispatch` con DLQ persistente; retries con backoff exponencial.
- [ADR-066](../../10-decisions/adr-066-tres-portales-raiz-portalbadge.md) — la página de servicio vive en `/dashboard/services/[id]` (portal cliente).

## 4. Modelos Prisma propios

| Tabla | Estado | Propósito |
|-------|--------|-----------|
| `services` | ✅ stub Prisma (Sprint 5) | Servicio activo del cliente. Campos canónicos `status`, `provisioner_slug`, `server_id` (NULL salvo Docker), `provider_reference` (ID externo en el sistema del proveedor), `metadata` jsonb (datos del plugin). |
| `service_metrics_snapshot` | ⬜ futuro | Snapshot puntual de métricas por servicio si el plugin no es Docker (sin time-series). Default: no se persiste, sólo cache Redis. Decisión final en Sprint 11. |

> **No** se persisten métricas time-series por servicio salvo Docker (que reusa `server_metrics` filtradas por contenedor del cliente). Ver nota canónica de [`infrastructure.md`](../../30-data/infrastructure.md).

## 5. Modelos foráneos accedidos

- `services` — propio.
- `products` (lectura) — para resolver `provisioner_slug`, configuración de bloque del provisioner, `docker_template_id`.
- `clients` (lectura) — datos del cliente para inyectar en provisioning.
- `servers` + `server_pools` (lectura) — sólo cuando `provisioner_slug = 'docker_engine'`.
- `audit_access_log` (escritura via `AuditService`) — toda acción inline + SSO open + métricas fetched.
- `failed_jobs` (escritura via `DlqService`) — cuando un job de provisioning agota retries.

## 6. Eventos

### Emite

- `service.provisioned` — provisioning OK, servicio activado.
- `service.provisioning_failed` — provisioning falló tras retries (consumido por `notifications` → alerta admin).
- `service.suspended` / `service.resumed` / `service.cancelled` — lifecycle.
- `service.action_executed` — payload `{ serviceId, actionSlug, clientId, success, sideEffects }`.
- `service.sso_opened` — payload `{ serviceId, panelLabel, clientId, ip }`.
- `service.metrics_fetched` — payload `{ serviceId, fetchedAt, sourceLatencyMs }`.

### Consume

- `invoice.paid` — dispara provisioning del servicio asociado.
- `invoice.refunded` (futuro) — puede disparar `deprovision` según política.
- `task.completed` (cuando el provisioner es `manual`) — listener marca `service.status = active`.

## 7. API REST expuesta (Sprint 11)

> Split admin/cliente según [ADR-066](../../10-decisions/adr-066-tres-portales-raiz-portalbadge.md):

### Cliente (`/api/v1/services/`)

- `GET /api/v1/services` — lista servicios del cliente autenticado.
- `GET /api/v1/services/:id` — detalle + `getServiceInfo()` (cached 60s Redis).
- `POST /api/v1/services/:id/sso` — devuelve `SsoUrl` del plugin si soporta SSO. Audit obligatorio.
- `POST /api/v1/services/:id/actions/:actionSlug` — ejecuta acción inline. Validación de que `actionSlug` está en `capabilities.inline_actions`. Audit obligatorio.

### Admin (`/api/v1/admin/services/`)

- `GET /api/v1/admin/services` — vista agente (filtros por cliente, plugin, estado).
- `POST /api/v1/admin/services/:id/reprovision` — fuerza re-ejecución (úselo como escotilla cuando un plugin falla y se reparó la causa raíz).
- `POST /api/v1/admin/services/:id/deprovision` — desactiva servicio (cancelación admin).

## 8. Edge cases relevantes

- **Plugin sin SSO**: `getSsoUrl` devuelve `null` → frontend oculta botón "Abrir panel".
- **Plugin con métricas no disponibles temporalmente**: `getServiceInfo` devuelve `metrics: undefined` → frontend muestra placeholder "Métricas no disponibles".
- **Cache invalidation tras `executeAction`**: helper `executeActionWithCacheInvalidation()` lo gestiona; los plugins no deben invalidar manualmente.
- **Provisioning timeout** (>30s): cola BullMQ retiene el job, retries con backoff [30s, 90s, 270s]; tras 3 fallos → DLQ + `service.provisioning_failed` + alerta admin.
- **Servicio cancelado mientras provisioning está en cola**: el processor verifica estado actual antes de ejecutar; si `status = cancelled`, marca job como descartado y registra en audit.
- **Plugin desactivado** (admin lo deshabilitó en Settings tras tener servicios activos): `getStatus` retorna error controlado; frontend muestra warning "Plugin temporalmente inactivo, contacta soporte".

## 9. Pendientes registrados

- Implementar (Sprint 11).
- Cuando se implemente Sprint 15E (Plugin Docker), añadir a `service_metrics` lectura filtrada por contenedor del cliente.
- Cuando se implemente Sprint 19 (Partner Module), abrir tema "qué partners pueden invocar `executeAction` de servicios de sus clientes" — decisión pendiente con ADR específico.
