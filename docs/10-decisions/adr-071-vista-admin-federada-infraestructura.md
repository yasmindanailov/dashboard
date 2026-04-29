# ADR-071 — Vista admin federada de infraestructura: `listRemoteServers()` + `getProviderHealthSummary()`

> **Status:** Active
> **Date:** 2026-04-29
> **Domain:** infrastructure, provisioning, ui (admin), cross-cutting
> **Sprint:** Sprint 10 (P2.5 backlog) ampliado en scope

---

## Contexto

[ADR-070](./adr-070-service-info-sso-acciones-curadas.md) (2026-04-29) estableció la doctrina **"dashboard como puerta unificada"** para la **vista cliente** de servicios: layout único `/dashboard/services/[id]` alimentado por `getServiceInfo()` + `getSsoUrl()` + acciones curadas. Esto resuelve el problema de "dashboard a medias" para el cliente final.

Queda abierto el caso simétrico desde **la vista admin**: el admin de Aelium opera sobre **dos clases muy distintas de "infra"**:

1. **Servidores propios Docker** (Hetzner/OVH/Contabo registrados en tabla `servers` por [ADR-043](./adr-043-infraestructura-self-hosted.md)). Aelium **es dueña** de su capacidad, métricas time-series, pools, plantillas Docker. Sprint 10 ya documentado.
2. **Servidores remotos del proveedor SaaS** (los servidores que Enhance CP / cPanel WHM / Plesk Obsidian / DirectAdmin tienen registrados en su propio sistema y exponen vía API admin). Aelium **NO los gestiona** — los gestiona el proveedor — pero el admin de Aelium **necesita visibilidad agregada** desde el dashboard sin tener que abrir N paneles externos para ver el estado global de su parque desplegado.

La pregunta arquitectónica: **¿cómo damos al admin una vista panorámica unificada de TODA la infra sobre la que opera Aelium (propia + remota), sin replicar el panel del proveedor ni introducir doble fuente de verdad?**

Antipatrones a evitar (los mismos que [ADR-070](./adr-070-service-info-sso-acciones-curadas.md) §"Antipatrones" pero aplicados a admin):

- **Antipatrón A1 — "vista admin partida"**: el admin abre `/admin/infrastructure` y sólo ve servidores Docker. Para ver Enhance CP/WHM debe ir a 2 paneles externos. **Pierde visibilidad agregada del estado de su negocio**. Es el síntoma que Yasmin identificó textualmente: *"así el dashboard se queda como a medias"*.
- **Antipatrón A2 — "BD espejo del proveedor"**: Aelium **almacena** los servidores remotos en su propia tabla `remote_servers` y sincroniza periódicamente. **Drift garantizado** (admin agrega servidor en Enhance, Aelium tarda 1h en saberlo) + **doble fuente de verdad** + **espacio en BD para datos consultivos**.
- **Antipatrón A3 — "panel admin replicado"**: Aelium implementa "Crear servidor en Enhance", "Eliminar cuenta en WHM", "Migrar entre servidores", etc. desde el dashboard. **Drift inevitable** (Enhance cambia API, Aelium siempre va por detrás) + **coste de implementación astronómico** + **riesgo legal si Aelium muestra info incorrecta**.

WHMCS resolvió esto desde 2015 con su vista *Server Status* (admin ve servidores propios + servidores listados vía API WHM/Plesk en una sola pantalla). Blesta, HostBill y FOSSBilling siguieron el mismo patrón. La solución industrial es **federación read-only con cache + delegación vía SSO + acciones curadas mínimas**, no replicación.

> **¿Qué pasaría si NO tomáramos esta decisión?** El admin tendría una visión parcial del parque (sólo Docker). Sprint 10 entregaría una vista admin a medias que validaría el antipatrón A1 textual de Yasmin. Cualquier futuro plugin SaaS (Plesk, DirectAdmin, AlmaLinux Cloud, etc.) reabriría la pregunta sin doctrina canónica. Eventual presión por meter `remote_servers` en BD (antipatrón A2). Esta ADR cierra la doctrina antes de codificar Sprint 10.

---

## Opciones consideradas

### A. Status quo — Sprint 10 sólo gestiona servidores propios

- **Pros**: scope reducido, sprint corto.
- **Contras**: vista admin parcial. Antipatrón A1 confirmado. Yasmin lo identifica como "dashboard a medias".

### B. BD espejo: tabla `remote_servers` sincronizada

- Aelium almacena copia local de servidores remotos vía cron de sync.
- **Pros**: queries rápidas, vista admin con join completo `servers ∪ remote_servers`.
- **Contras**:
  - **Drift garantizado**: el admin añade servidor en Enhance y Aelium tarda en saberlo; en el peor caso muestra datos obsoletos.
  - **Doble fuente de verdad**: estado en Enhance + estado en Aelium pueden divergir (capacidad detectada distinta, accounts count distinto, status distinto).
  - **Sync robusta es cara**: webhooks del proveedor (no todos lo soportan), reconciliación de borrados, manejo de credenciales rotadas.
  - **Espacio BD desperdiciado** para datos puramente consultivos.

### C. Replicar panel admin del proveedor en Aelium

- "Crear servidor en Enhance desde Aelium", "Eliminar cuenta WHM desde Aelium", etc.
- **Pros**: experiencia totalmente unificada.
- **Contras**: antipatrón A3. Coste astronómico. Drift inevitable. Riesgo legal. Misma razón por la que [ADR-070](./adr-070-service-info-sso-acciones-curadas.md) lo descartó para vista cliente.

### D. (elegida) Vista federada read-only con cache + SSO + acciones curadas

- Una sola página `/admin/infrastructure` con tres pestañas/secciones:
  - **TAB 1 — Servidores propios** (alimentado por tabla `servers`, métricas time-series locales).
  - **TAB 2 — Servidores remotos** (alimentado por `plugin.listRemoteServers()` con cache Redis 600s, snapshot del momento sin time-series).
  - **TAB 3 — Pools** (matriz producto × servidor, propios y remotos en lectura).
- Botón SSO al panel admin del proveedor (Enhance admin / WHM / Plesk admin) en cada bloque.
- Acciones curadas inline limitadas (refresh cache, restart service idempotente, etc.) con doble confirmación.
- **Pros**:
  - Sin doble fuente de verdad. Si el proveedor cambia algo, aparece en la siguiente sync sin tocar Aelium.
  - Visibilidad agregada en una sola página. Admin distingue de un vistazo qué controla (TAB 1 con gráfica) y qué consulta (TAB 2 con snapshot + última sync).
  - Coste BD: cero (no se persiste).
  - Coste API proveedor: cache 10 min absorbe sesiones admin múltiples.
  - Degradación elegante: si la API del proveedor cae, TAB 2 muestra ⚠ con datos cacheados + "API no disponible".
  - Audit trail completo: SSO opens, acciones admin, refresh cache.
  - Mismo patrón conceptual que vista cliente ([ADR-070](./adr-070-service-info-sso-acciones-curadas.md)) — coherencia doctrinal.
- **Contras**:
  - Latencia perceptible en primera carga (si cache miss): 200-800ms por plugin × N plugins. Mitigación: cache persistente + warm-up al boot del backend.
  - No todos los plugins soportan `listRemoteServers` (ResellerClub no tiene servidores). Mitigación: capability flag `has_remote_servers_listing`; vista oculta plugins sin soporte.

---

## Decisión

Se elige Opción D. La interfaz `ProvisionerPlugin` definida en [ADR-021](./adr-021-provisioners.md) y extendida en [ADR-070](./adr-070-service-info-sso-acciones-curadas.md) se **extiende adicionalmente** con dos métodos **opcionales** dedicados a la vista admin federada:

### Mecanismo A — `listRemoteServers(): Promise<RemoteServer[] | null>`

Método **opcional** del plugin. Devuelve la lista de servidores que el proveedor SaaS gestiona internamente, accesible vía su API admin con las credenciales del plugin (encriptadas via [ADR-015](./adr-015-encriptacion-credenciales.md)). Retorna `null` si el plugin no soporta esta capability (ej. `resellerclub`).

```typescript
interface RemoteServer {
  id: string;                       // ID en el proveedor (no en Aelium)
  hostname: string;
  ip_address?: string;
  location?: string;                // país/datacenter si el proveedor lo expone
  status: 'active' | 'maintenance' | 'unreachable' | 'unknown';
  capacity?: {
    cpu_cores?: number;
    ram_total_mb?: number;
    disk_total_gb?: number;
  };
  usage?: {
    cpu_usage_percent?: number;
    ram_used_mb?: number;
    disk_used_gb?: number;
    accounts_active?: number;
    accounts_total?: number;        // si el plan limita
    bandwidth_used_gb?: number;
  };
  // SSO al panel admin del servidor concreto (si el proveedor lo soporta)
  sso_admin_url?: string;
  // Servicios de Aelium activos en este servidor remoto (cross-reference)
  aelium_services_count?: number;   // calculado por Aelium, no por el proveedor
  fetched_at: Date;
}
```

**Cache**: Redis key `provisioner:<slug>:remote_servers`, TTL configurable `infra.remote_servers_cache_ttl_seconds` (default 600s = 10 min). Botón "Refrescar" en UI invalida cache + force fetch (audit obligatorio).

**Degradación**: si la API del proveedor falla (timeout, 5xx, circuit breaker abierto), `listRemoteServers` retorna **datos cacheados con flag `degraded: true`** y el frontend muestra ⚠ "API no disponible · datos de hace X minutos".

### Mecanismo B — `getProviderHealthSummary(): Promise<ProviderHealthSummary | null>`

Método **opcional**. Devuelve resumen agregado del proveedor para construir la cabecera de la sección sin abrir cada servidor.

```typescript
interface ProviderHealthSummary {
  provider_slug: string;            // 'enhance_cp' / 'cpanel_whm' / ...
  provider_label: string;           // 'Enhance CP' / 'cPanel WHM' / 'Plesk Obsidian'
  servers_total: number;
  servers_healthy: number;
  servers_with_warnings: number;    // disco >85%, CPU >75%, etc. — umbral del plugin
  servers_unreachable: number;
  total_active_services: number;    // servicios de Aelium provisionados aquí
  api_status: 'healthy' | 'degraded' | 'down';
  last_sync_at: Date;
  fetched_at: Date;
}
```

**Cache**: mismo TTL que `listRemoteServers`. Reusa el mismo fetch internamente (un solo round-trip al proveedor por sync).

### Soporte por plugin (mapping canónico inicial)

| Plugin | `listRemoteServers` | `getProviderHealthSummary` | API endpoint del proveedor |
|---|---|---|---|
| `enhance_cp` | ✅ | ✅ | `/api/v1/servers` (admin token) |
| `cpanel_whm` | ✅ | ✅ | `/json-api/listaccts` + `listpkgs` |
| `plesk_obsidian` | ✅ | ✅ | `/api/v2/servers` (XML-API) |
| `directadmin` | ✅ | ⚠ parcial (sin `accounts_active`) | `CMD_API_SHOW_ALL_USERS` |
| `docker_engine` | ⚠ N/A — Aelium **es** el proveedor | ⚠ N/A | usa tabla `servers` directamente |
| `resellerclub` | ❌ no aplica (no tiene servidores) | ❌ | — |
| `internal` | ❌ | ❌ | — |
| `manual` | ❌ | ❌ | — |

### Estructura de la página `/admin/infrastructure` (Sprint 10)

Una sola página React Server Component con tres pestañas:

```tsx
<AdminInfrastructurePage>
  <Tabs defaultValue="own">
    <Tab value="own" label="Servidores propios">
      <OwnServersTab />          {/* tabla `servers` + métricas time-series */}
    </Tab>

    <Tab value="remote" label="Servidores remotos">
      {/* itera plugins con capability flag has_remote_servers_listing */}
      {plugins.filter(p => p.capabilities.has_remote_servers_listing).map(plugin => (
        <RemoteProviderSection key={plugin.slug}>
          <ProviderSummaryHeader summary={await plugin.getProviderHealthSummary()} />
          <RemoteServersList servers={await plugin.listRemoteServers()} />
          {plugin.adminSsoUrl && <SsoButton url={plugin.adminSsoUrl} label={`Abrir ${plugin.label} ↗`} />}
        </RemoteProviderSection>
      ))}
    </Tab>

    <Tab value="pools" label="Pools (producto × servidor)">
      <PoolsMatrixTab />         {/* incluye servidores propios y remotos en read */}
    </Tab>
  </Tabs>
</AdminInfrastructurePage>
```

**Distinción visual**: TAB 1 (propios) muestra **gráficas time-series** (Aelium guarda histórico). TAB 2 (remotos) muestra **snapshot + "última sync hace X min"** (sin histórico). El admin distingue de un vistazo qué controla y qué consulta.

### Acciones curadas admin (extiende `executeAction` de [ADR-070](./adr-070-service-info-sso-acciones-curadas.md))

Mismo patrón que cliente (5 criterios canónicos) **+ un sexto** específico admin:

> **Criterio 6 (admin)**: doble confirmación obligatoria UI + sólo roles `superadmin` o `agent_full`. Nunca `agent_billing` ni `agent_support`.

Acciones admin canónicas iniciales:

| Plugin | Acción admin inline | Roles |
|---|---|---|
| `enhance_cp` | `refresh_remote_servers` (forzar sync) | superadmin + agent_full |
| `enhance_cp` | `view_account_count_per_server` (lectura, sin doble confirmación) | superadmin + agent_full |
| `cpanel_whm` | `refresh_remote_servers` | superadmin + agent_full |
| `cpanel_whm` | `restart_service_on_server({serverId, service: 'apache' \| 'mysql' \| 'exim'})` (idempotente, R11, audit obligatorio, doble confirmación) | **superadmin solo** |
| `plesk_obsidian` | `refresh_remote_servers` | superadmin + agent_full |
| `docker_engine` | (ya cubierto por TAB 1 propio: editar servidor, gestionar pools, editar plantillas) | superadmin + agent_full |
| `resellerclub` | N/A para esta vista (no tiene servidores) | — |

**Cualquier acción admin no listada queda fuera del dashboard.** Si el admin la necesita: SSO al panel del proveedor.

### Subjects CASL nuevos

Extiende [ADR-067](./adr-067-granularidad-casl-rol-staff.md) con un Subject nuevo:

- `RemoteServer` — `Read` (superadmin + agent_full), `Manage` (sólo superadmin para acciones inline destructivas).

Documentado en `backend/src/core/casl/permissions.ts` y replicado en `frontend/app/lib/permissions.ts` (DC.15 sigue pendiente, esto añade un caso más).

### API REST del backend

Bajo `/api/v1/admin/infrastructure/` (ADR-066 + AdminOnlyGuard):

- `GET /api/v1/admin/infrastructure/remote-servers` — agrega `listRemoteServers()` de todos los plugins activos. Cache Redis 600s.
- `GET /api/v1/admin/infrastructure/providers/health` — agrega `getProviderHealthSummary()`. Cache 600s.
- `POST /api/v1/admin/infrastructure/providers/:slug/refresh` — invalida cache + force fetch de un plugin concreto. Audit obligatorio. Sólo `superadmin` + `agent_full`.
- `POST /api/v1/admin/infrastructure/providers/:slug/actions/:actionSlug` — ejecuta acción admin inline. Validación de capabilities + doble confirmación + audit. Roles según mapping arriba.

### Eventos emitidos

Extiende `_events.md` con:

- `admin.remote_servers_refreshed` — payload `{ provider_slug, adminUserId, latencyMs, serversCount }`. Consumido por `audit`.
- `admin.provider_action_executed` — payload `{ provider_slug, actionSlug, adminUserId, success }`. Consumido por `audit` + `notifications` para acciones destructivas.

### Cache strategy detallada

```
Redis keys:
  provisioner:enhance_cp:remote_servers          TTL 600s
  provisioner:enhance_cp:provider_health         TTL 600s
  provisioner:cpanel_whm:remote_servers          TTL 600s
  provisioner:cpanel_whm:provider_health         TTL 600s
  ...

Warm-up (opcional):
  OnModuleInit del módulo `infrastructure` lanza fetch background
  para que la primera sesión admin no pague el cache miss inicial.
  Comportamiento controlado por setting `infra.remote_servers_warmup_enabled`.

Refresh manual:
  POST /providers/:slug/refresh elimina las dos keys y lanza fetch.
  Audit registra adminUserId, latencia, resultado.

Degradación (cache stale + API down):
  Si el fetch falla y existe cache previo (aunque expirado <24h),
  se sirve cache con flag `degraded: true` + `last_successful_sync_at`.
  Frontend muestra ⚠ "API no disponible · datos de hace X minutos".
```

---

## Consecuencias

- ✅ **Ganamos:**
  - **Vista admin panorámica** unificada en una sola página `/admin/infrastructure`. Cierra textualmente la inquietud "dashboard a medias".
  - **Cero doble fuente de verdad** — Aelium no almacena `remote_servers`. Si el proveedor cambia algo, aparece en la siguiente sync.
  - **Mismo patrón conceptual** que vista cliente ADR-070. Coherencia doctrinal en todo el dashboard.
  - **Audit trail completo** de operaciones admin sobre infra remota (refresh, SSO opens, acciones inline).
  - **Coste BD: cero**. Coste API proveedor: bajo (cache 10 min absorbe múltiples admins viendo).
  - **Degradación elegante** ante caída del proveedor.
  - **Capability flags** permiten añadir plugin SaaS nuevo sin tocar la página: si implementa `listRemoteServers`, aparece automáticamente en TAB 2.
- ⚠️ **Aceptamos:**
  - **Latencia primera carga**: 200-800ms por plugin × N plugins activos en cache miss. Mitigado con warm-up.
  - **Plugins más densos**: 2 métodos opcionales adicionales (los implementan sólo plugins SaaS con servidores).
  - **Capability dependiente del proveedor**: si Enhance cambia API o limita acceso, hay que actualizar el plugin. Aceptable — riesgo localizado.
  - **No hay migración entre servidores remotos desde dashboard** — operativa fuera del scope ([ADR-043 §G](./adr-043-infraestructura-self-hosted.md) ya lo dice para servidores propios; aplica también aquí).
- 🚪 **Cierra:**
  - **No tabla `remote_servers` en Prisma** (antipatrón A2 explícitamente rechazado).
  - **No replicar panel admin del proveedor** (antipatrón A3 — el dashboard no implementa "Crear servidor en Enhance", "Eliminar cuenta WHM", etc.).
  - **No vista admin partida** (antipatrón A1 — todo en una sola página).
  - **No acciones admin sin audit + doble confirmación** — criterio 6 del set canónico.

---

## Cuándo revisar

- Si **un proveedor expone webhooks** robustos y baratos para cambios en su parque (ej. Enhance añade webhook `server.added/removed`) → reconsiderar si vale la pena cachear más agresivo o incluso pasar a modelo push (cache + invalidación por webhook). **No es replicación si Aelium sólo invalida cache, no almacena estado.**
- Si **el número de plugins SaaS supera 5-6 con miles de servidores remotos cada uno** → reconsiderar paginación de `listRemoteServers` (hoy retorna lista completa).
- Si **algún proveedor cobra por request a su API admin** → reconsiderar TTL de cache (subirlo a 30-60 min) o introducir setting de "auto-refresh disabled, manual only".
- Si **un grupo de admins consume el dashboard a >100 reqs/min sostenido** → considerar Server-Sent Events para refresh incremental en lugar de full reload.

---

## Referencias

- **Módulos afectados:**
  - `infrastructure` (Sprint 10) — owner de `/admin/infrastructure` y de la agregación cross-plugin.
  - `provisioning` (Sprint 11) — define la interfaz extendida y registra plugins.
  - `plugins/provisioners/enhance_cp` (Sprint 15C) — implementa `listRemoteServers` + `getProviderHealthSummary`.
  - `plugins/provisioners/cpanel_whm` (futuro) — ídem.
  - `plugins/provisioners/plesk_obsidian` (futuro) — ídem.
  - `plugins/provisioners/docker_engine` (Sprint 15E) — N/A (Aelium **es** el proveedor; usa tabla `servers` directamente).
  - `audit` — consume `admin.remote_servers_refreshed`, `admin.provider_action_executed`.
- **Reglas relacionadas:**
  - [R4](../00-foundations/rules.md) — plugins no se importan desde core.
  - [R7](../00-foundations/rules.md) — todos los errores se registran (fetches que fallan emiten log con correlation ID).
  - [R11](../00-foundations/rules.md) — circuit breaker en cada plugin para llamadas externas.
  - [R12](../00-foundations/rules.md) — credenciales encriptadas (admin token de Enhance/WHM/Plesk).
- **ADRs relacionados:**
  - [ADR-021](./adr-021-provisioners.md) — interfaz mínima.
  - [ADR-070](./adr-070-service-info-sso-acciones-curadas.md) — vista cliente con misma doctrina (esta ADR es el simétrico admin).
  - [ADR-043](./adr-043-infraestructura-self-hosted.md) — Sprint 10 servidores propios, sigue íntegro.
  - [ADR-015](./adr-015-encriptacion-credenciales.md) — admin tokens del proveedor SaaS encriptados.
  - [ADR-017](./adr-017-audit-log-inmutable.md) — audit obligatorio para acciones admin.
  - [ADR-066](./adr-066-tres-portales-raiz-portalbadge.md) — la vista vive en `/admin/infrastructure` (portal admin).
  - [ADR-067](./adr-067-granularidad-casl-rol-staff.md) — extendido con Subject `RemoteServer`.
  - [ADR-055](./adr-055-resiliencia-circuit-breaker.md) — circuit breaker + degradación con cache stale.
- **Glosario:** *RemoteServer*, *Federated Server View*, *ProviderHealthSummary*, *Vista admin federada* (añadidos en `glossary.md`).
- **Discusión externa:** conversación Yasmin ↔ Claude 2026-04-29 — clarificación sobre vista admin con servidores propios + servidores remotos en una sola página.
- **Inspiración industrial:** WHMCS Server Status (desde 2015), Blesta Server Module API + admin views, HostBill multi-server admin dashboard, FOSSBilling provisioner servers index.
