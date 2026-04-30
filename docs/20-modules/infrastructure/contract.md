# infrastructure — Contract

## 1. Propósito

Inventario de **servidores propios** (Hetzner/OVH/Contabo/...) donde Aelium provisiona productos Docker auto-hosteados. Mantiene `servers` (con capacidad detectada automáticamente vía Docker API o SSH), `server_pools` (matriz N:N con `products`, exclusividad opcional), `server_metrics` (series time-series RAM/CPU/disco/contenedores) y `docker_templates` (plantillas `.yaml` que el plugin Docker inyecta variables y aterriza). Expone `pickServerForProduct(productId)` al módulo `provisioning` para selección del servidor menos cargado dentro del margen de seguridad configurado.

**Para servidores propios** (Docker), el módulo es **dueño** de su modelo de datos: `servers`, `server_pools`, `server_metrics`, `docker_templates`. Métricas time-series.

**Para servidores remotos** (Enhance CP, cPanel WHM, Plesk Obsidian, DirectAdmin), el módulo es **agregador read-only** ([ADR-071](../../10-decisions/adr-071-vista-admin-federada-infraestructura.md)): consume `listRemoteServers()` + `getProviderHealthSummary()` de cada plugin SaaS, **NO los almacena en BD**, los presenta en la página `/admin/infrastructure` TAB 2 con cache Redis 600s. Sin time-series — sólo snapshot del momento + última sync. Cero doble fuente de verdad.

## 2. Estado de implementación

⬜ **Stub.** Modelo `Server` ya existe en `prisma/schema.prisma` desde Sprint 5; operativa (CRUD UI, detección de capacidad, métricas, dashboard) pendiente Sprint 10.

> 📜 **Nota canónica ([ADR-070](../../10-decisions/adr-070-service-info-sso-acciones-curadas.md))**: Sprint 10 sólo aporta valor **emparejado con Sprint 15E (Plugin Docker Engine)** — único consumidor real de este módulo. Construirlo sin Sprint 15E viola YAGNI. Por tanto Sprint 10 = P2.5 y Sprint 15E = P2.6 en `backlog.md`, ejecutados en cadena corta.

## 3. Arquitectura → referencias canónicas

- [ADR-043](../../10-decisions/adr-043-infraestructura-self-hosted.md) — infra self-hosted Docker Compose, capacidad detectada automáticamente, pools con exclusividad, margen de seguridad configurable.
- [ADR-015](../../10-decisions/adr-015-encriptacion-credenciales.md) — `Server.credentials_encrypted` con AES-256-GCM.
- [ADR-021](../../10-decisions/adr-021-provisioners.md) — el plugin Docker recibe `server` inyectado por el orquestador; no toca `servers` directamente.
- [ADR-070](../../10-decisions/adr-070-service-info-sso-acciones-curadas.md) — `server_metrics` se usa para `capabilities.has_metrics_history = true` del plugin Docker (única vía time-series del sistema).
- [ADR-056](../../10-decisions/adr-056-estrategia-escalabilidad.md) — cuándo escalar a múltiples instancias (umbral capacidad >70%).
- [ADR-010 §RGPD](../../10-decisions/adr-010-rgpd-retencion-datos.md) — `Server.location_country/city/datacenter` visible al cliente en su portal de transparencia.

## 4. Modelos Prisma propios

Detalle completo en [`docs/30-data/infrastructure.md`](../../30-data/infrastructure.md). Resumen:

| Tabla | Estado | Notas |
|-------|--------|-------|
| `servers` | ✅ stub Prisma | UI/operativa pendiente Sprint 10. |
| `server_pools` | ⬜ | Relación N:N `servers ↔ products` con `is_exclusive`. |
| `server_metrics` | ⬜ | Time-series RAM/CPU/disco/containers. Cron `poll-server-metrics` (BullMQ scheduled). |
| `docker_templates` | ⬜ | Vive en módulo `products` (tabla compartida) — pero la **UI de gestión** vive en `/admin/infrastructure` (Sprint 10). |

## 5. Modelos foráneos accedidos

- `products` (lectura) — vía `server_pools.product_id` para listar pools por producto.
- `services` (lectura) — para calcular carga real (`server_metrics` agregadas + suma de `services.resource_config` activos por servidor).

## 6. Eventos

### Emite

- `server.capacity_warning` — un servidor pasa el margen de seguridad. Consumido por `notifications` (alerta admin).
- `server.pool_full` — todos los servidores del pool de un producto superan el margen. Consumido por `notifications` (alerta admin) + `provisioning` (puede pausar nuevos provisionings de ese producto hasta que se libere capacidad).
- `server.health_check_failed` — health check periódico falla 3 veces consecutivas. Consumido por `notifications` y posible `error-log`.

### Consume

- (ninguno hoy — el módulo es proveedor de servicios consultivos, no reactivo a eventos del bus).

## 7. API REST expuesta (Sprint 10)

Bajo `/api/v1/admin/infrastructure/` con `JwtAuthGuard` + `AdminOnlyGuard` + `PoliciesGuard` ([ADR-066](../../10-decisions/adr-066-tres-portales-raiz-portalbadge.md), [ADR-067](../../10-decisions/adr-067-granularidad-casl-rol-staff.md) — Subjects `Server` y `RemoteServer` sólo `superadmin` + `agent_full`).

### 7.1 Servidores propios (TAB 1 de la página admin)

- `GET /api/v1/admin/infrastructure/servers` — lista de servidores con métricas en tiempo real.
- `POST /api/v1/admin/infrastructure/servers` — registrar servidor + detección automática de capacidad.
- `PATCH /api/v1/admin/infrastructure/servers/:id` — editar (no edita capacidad, sólo metadatos).
- `DELETE /api/v1/admin/infrastructure/servers/:id` — soft delete; falla si tiene `services` activos.
- `GET /api/v1/admin/infrastructure/servers/:id/metrics?range=24h|7d|30d` — series time-series.

### 7.2 Servidores remotos federados ([ADR-071](../../10-decisions/adr-071-vista-admin-federada-infraestructura.md), TAB 2)

- `GET /api/v1/admin/infrastructure/remote-servers` — agrega `listRemoteServers()` de todos los plugins SaaS activos. Cache Redis 600s.
- `GET /api/v1/admin/infrastructure/providers/health` — agrega `getProviderHealthSummary()` (cabecera por proveedor con totales).
- `POST /api/v1/admin/infrastructure/providers/:slug/refresh` — invalida cache + force fetch. Audit obligatorio. Sólo `superadmin` + `agent_full`.
- `POST /api/v1/admin/infrastructure/providers/:slug/actions/:actionSlug` — ejecuta acción admin inline (refresh, restart_service idempotente, etc.). Validación de capabilities + doble confirmación + audit. Roles según mapping ADR-071 §"Acciones curadas admin".

### 7.3 Pools (TAB 3)

- `GET /api/v1/admin/infrastructure/pools` — matriz pools (incluye servidores propios y remotos en read).
- `POST /api/v1/admin/infrastructure/pools` — añadir entrada (server + product + exclusividad). Sólo aplica a servidores propios.
- `DELETE /api/v1/admin/infrastructure/pools/:id` — quitar entrada.

### 7.4 Plantillas Docker

- `GET /api/v1/admin/infrastructure/docker-templates` — listar plantillas.
- `POST/PATCH/DELETE /api/v1/admin/infrastructure/docker-templates` — CRUD plantillas YAML.

### 7.5 Servicio interno (no REST)

- `InfrastructureService.pickServerForProduct(productId): Promise<Server | null>` — invocado por `ProvisioningOrchestrator` cuando `plugin.requiresServer === true` (sólo Docker hoy).
- `InfrastructureService.aggregateRemoteServers(): Promise<RemoteServerWithProvider[]>` — agrega `listRemoteServers()` cross-plugin con cache. Consumido por endpoint REST 7.2.
- `InfrastructureService.aggregateProvidersHealth(): Promise<ProviderHealthSummary[]>` — agrega `getProviderHealthSummary()` cross-plugin con cache.

## 8. Edge cases relevantes

- **Servidor sin Docker API ni SSH disponibles**: registro falla con error claro al admin; sin servidor registrado parcial.
- **Capacidad detectada cambia** entre registro y uso: el cron `poll-server-metrics` detecta cambios y actualiza `ram_total_mb` / `cpu_cores_total` / `disk_total_gb` (con audit log de cambio + alerta si bajada >10%).
- **Pool exclusivo con producto eliminado**: `ON DELETE CASCADE` en `server_pools.product_id` libera la entrada automáticamente.
- **Servicio activo en servidor que se quiere borrar**: bloquea `DELETE` con error 409. Admin debe migrar manualmente (operativa fuera del dashboard, [ADR-043 §G](../../10-decisions/adr-043-infraestructura-self-hosted.md)).
- **Health check falla pero servidor responde a métricas**: estado `maintenance` automático; nuevos provisioning ignoran este servidor.
- **Cron `poll-server-metrics` cae**: BullMQ lo retoma vía `repeat: { every: 60s }` con leader election natural via Redis (ADR-056 §13.30+).

## 9. Pendientes registrados

- Implementar Sprint 10 (P2.5) emparejado con Sprint 15E (P2.6) Plugin Docker Engine.
- Decidir en Sprint 10: si el editor `docker_templates` vive aquí o en módulo `products` (preferencia actual: vive aquí porque es operación de admin de infra, no de catálogo).
- Backups de servidores de clientes y migración entre servidores **fuera del alcance** del dashboard (decisión consciente, [ADR-043 §G](../../10-decisions/adr-043-infraestructura-self-hosted.md)).
