# ADR-070 — Dashboard como puerta unificada: `getServiceInfo()` + SSO al panel externo + acciones curadas inline

> **Status:** Active
> **Date:** 2026-04-29
> **Domain:** provisioning, products, ui, cross-cutting
> **Sprint:** N/A (decisión arquitectónica que aplica a Sprint 11 + 15A/C/D/E + 18)

---

## Contexto

Aelium vende tres familias de productos cuya **operativa post-venta** vive en sistemas técnicamente muy distintos:

1. **Hostings** — operados por el control panel del proveedor (cPanel/WHM, Plesk, Enhance CP, DirectAdmin). El cliente final ya conoce esos paneles desde hace años (cPanel desde 1996, Plesk desde 2000) y la industria entera los usa.
2. **Dominios** — operados por la API del registrar (ResellerClub, Namecheap, Enom, GoDaddy reseller). No hay "panel del cliente" estándar — algunos registrars lo ofrecen, otros no, y los flujos comunes (cambiar DNS, transfer out) son **inseguros de delegar a panel externo** en B2B porque el reseller (Aelium) pierde trazabilidad de qué hizo el cliente final.
3. **Contenedores Docker auto-hosteados** (Cloud Office Collabora, Nextcloud, OpenClaw, Mailcow custom) — **no hay control panel externo**. Aelium **es** quien gestiona la infra (servidores, recursos, subdominios, métricas), por la doctrina de [ADR-043](./adr-043-infraestructura-self-hosted.md) (self-hosted Docker Compose) + [ADR-021](./adr-021-provisioners.md) (provisioners como plugins).

La pregunta arquitectónica de fondo es: **¿qué nivel de operativa post-venta vive en el dashboard de Aelium, y qué nivel se delega al panel externo?**

Hay tres antipatrones que la industria conoce desde hace 15 años y que conviene **no repetir**:

- **Antipatrón A — "dashboard partido"**: el dashboard ofrece factura/soporte pero para todo lo operativo el cliente debe ir a otro panel. Cliente B2B percibe el dashboard como "intermediario sin valor" y dejará de renovar.
- **Antipatrón B — "dashboard que replica el panel externo"**: el dashboard intenta gestionar emails, DBs, SSL, instalaciones de apps, etc., reimplementando lo que ya hace cPanel. Resultado: **drift** entre el modelo de Aelium y el real del proveedor, bugs constantes, doble fuente de verdad. Es lo que algunos billing panels intentaron en 2010 y abandonaron.
- **Antipatrón C — "dashboard manual"**: el cliente que necesita reset password de su hosting abre ticket → agente lo hace → cierra ticket. Carga operativa lineal con el número de clientes.

La industria (WHMCS desde 2010, Blesta desde 2013, HostBill, ClientExec, FOSSBilling) converge en un patrón canónico: **dashboard como puerta y archivo, panel externo como herramienta especializada, acciones inline curadas para flujos críticos auditables**.

[ADR-021](./adr-021-provisioners.md) declaró la interfaz mínima `provision/deprovision/getStatus` y dejó explícito (§"interfaz mínima"): *"el plugin internamente hace lo que tenga que hacer"*. Esto es correcto pero **insuficiente** para cerrar la pregunta de UX cliente. Necesitamos extender el contrato del plugin para que el dashboard pueda renderizar **el mismo layout de servicio independientemente del plugin** y delegar correctamente al panel externo cuando aplique.

> **¿Qué pasaría si NO tomáramos esta decisión?** Cada plugin se desarrollaría con un layout custom de página de servicio, copy-pasteando estructura del anterior con drift inevitable. La página `/dashboard/services/[id]` se llenaría de `if (provisioner === 'enhance_cp') { ... } else if (provisioner === 'docker_engine') { ... }`. La regla R4 (no importar plugins desde core) se rompería de facto. Cada nuevo plugin requeriría tocar el frontend. El cliente vería UX inconsistente entre productos del mismo dashboard. Es exactamente lo que la doctrina del proyecto quiere evitar.

---

## Opciones consideradas

### A. Status quo — interfaz mínima ADR-021 (`provision/deprovision/getStatus`)

- **Pros**: simple, ya documentado.
- **Contras**: insuficiente para que el frontend renderice información del servicio sin condicionales por plugin. No hay patrón canónico para delegación al panel externo. No hay patrón para acciones inline (reset password, restart container).

### B. Dashboard replica funcionalidad del panel externo

- Aelium implementa "Email Manager", "Database Manager", "File Manager", etc. en el dashboard, llamando bajo el capó al API del proveedor.
- **Pros**: experiencia totalmente unificada, cliente nunca sale del dashboard.
- **Contras**:
  - **Drift garantizado**: cPanel cambia layout/funcionalidad cada release; Aelium siempre va por detrás.
  - **Doble fuente de verdad**: estados de email accounts, dbs, ssl certs, etc. duplicados entre Aelium y cPanel.
  - **Coste de implementación astronómico**: cPanel WHM tiene >300 endpoints; replicar el 30% son ~100 features.
  - **Riesgo de inconsistencia legal**: si Aelium muestra "tienes SSL activo" pero cPanel revoca el cert, cliente recibe info incorrecta.
  - WHMCS lo intentó en su pasado (módulos "tools") y lo redujo drásticamente: hoy delega vía SSO al panel externo.

### C. Dashboard puramente como cobrador + soporte (delega todo)

- El dashboard sólo facturas/tickets. Toda operativa del producto → panel externo.
- **Pros**: cero replicación, cero drift.
- **Contras**:
  - **Antipatrón A**: cliente B2B percibe dashboard como intermediario sin valor, dejará de renovar.
  - Para Docker auto-hosteado **no hay panel externo a donde delegar** — Aelium **debe** mostrar al menos métricas básicas y acciones (start/stop/restart) o el cliente queda sin operativa para esos productos.
  - Audit log distribuido: Aelium no sabe qué hizo el cliente en cPanel; pierde trazabilidad legal.

### D. (elegida) Dashboard como puerta unificada con 3 mecanismos canónicos

- **Mecanismo A** — `getServiceInfo()` (pull lazy normalizado, layout único en frontend).
- **Mecanismo B** — `getSsoUrl()` (SSO al panel externo cuando exista).
- **Mecanismo C** — acciones curadas inline (set reducido y auditado, sólo lo que cumple criterios estrictos).

- **Pros**:
  - Frontend renderiza la misma plantilla `/dashboard/services/[id]` para todos los plugins, condicionando por capability flags del plugin. Cero `if (provisioner === ...)`.
  - Aelium sigue siendo **siempre la puerta de entrada** y **siempre el archivo histórico** (audit log centralizado).
  - SSO delega operaciones complejas al especialista (cPanel/Plesk/Enhance) sin replicarlas.
  - Acciones inline cubren el 80% de operaciones cotidianas del cliente con doctrina de cuándo añadir una nueva (criterios objetivos).
  - Para Docker auto-hosteado, el plugin rellena `metrics` con datos reales (Aelium gestiona la infra) y SSO opcional al panel del producto (Collabora admin, Nextcloud admin, etc.).
- **Contras**:
  - Plugins más complejos: cada uno implementa 6 métodos en lugar de 3.
  - Cache de `getServiceInfo()` requiere invalidación correcta tras acciones inline.
  - SSO depende de que el proveedor lo soporte (ResellerClub no soporta SSO al panel del titular en plan reseller — se sustituye por acciones inline curadas).

---

## Decisión

Se elige Opción D. El módulo `provisioning` (Sprint 11) y los plugins de provisioner (Sprint 15A/C/D/E/G) implementan tres mecanismos canónicos:

### Mecanismo A — `getServiceInfo(service): Promise<ServiceInfo>`

Método **obligatorio** de la interfaz `ProvisionerPlugin`. Devuelve un payload normalizado con la información que el dashboard necesita para renderizar la página `/dashboard/services/[id]`:

```typescript
interface ServiceInfo {
  // Estado del servicio (ya existía en getStatus)
  status: 'active' | 'suspended' | 'expired' | 'pending' | 'failed' | 'cancelled';
  status_reason?: string;        // texto libre del proveedor

  // Identidad y display
  display: {
    primary: string;             // ej. "miweb.com" / "cliente1.aelium.net" / "miempresa.es"
    secondary?: string;          // ej. "Hosting Pro 10GB" / "Cloud Office Pro 4GB"
    expires_at?: Date;           // dominios y hostings con renovación
    auto_renew?: boolean;
  };

  // Métricas del proveedor (opcional — el plugin rellena lo que pueda)
  metrics?: ServiceMetrics;

  // Capabilities del plugin (frontend usa para condicionar UI)
  capabilities: {
    has_sso_panel: boolean;        // true → mostrar botón "Abrir cPanel"
    panel_label?: string;          // ej. "Abrir cPanel" / "Abrir Enhance" / "Abrir Collabora"
    inline_actions: ServiceAction[];
    has_metrics_history: boolean;  // true sólo para docker_engine (Aelium guarda series)
  };
}

interface ServiceMetrics {
  disk_used_mb?: number;
  disk_total_mb?: number;
  bandwidth_used_mb?: number;
  bandwidth_total_mb?: number;
  ram_used_mb?: number;            // sólo Docker
  ram_total_mb?: number;
  cpu_usage_percent?: number;      // sólo Docker
  email_accounts_used?: number;
  email_accounts_total?: number;
  databases_used?: number;
  databases_total?: number;
  custom?: Record<string, string | number>;  // campos libres del plugin
  fetched_at: Date;                // timestamp de la lectura del proveedor
}

interface ServiceAction {
  slug: string;                    // 'restart' | 'reset_password' | 'edit_dns_record' | ...
  label: string;
  description?: string;
  confirm_required: boolean;
  confirmation_text?: string;
  destructive: boolean;            // true → render con estilo destructive en UI
}
```

**Comportamiento de cache**:
- Cache Redis con TTL configurable por plugin (default 60s).
- Invalidación automática tras ejecutar cualquier `executeAction(...)` del propio servicio.
- Settings: `provisioning.service_info_ttl_seconds` (global) + `plugin.<slug>.service_info_ttl_seconds` (override por plugin).
- Métricas históricas (`server_metrics` para Docker) sirven la capability `has_metrics_history` y la página puede mostrar gráfica 24h/7d/30d. Resto de plugins **no almacenan series** — sólo la lectura del momento.

### Mecanismo B — `getSsoUrl(service): Promise<SsoUrl | null>`

Método **opcional** de la interfaz. Devuelve URL firmada o `null` si el plugin no soporta SSO.

```typescript
interface SsoUrl {
  url: string;                    // URL completa con session token
  expires_at: Date;               // típicamente 5-15 min
  panel_label: string;            // "cPanel" / "Plesk" / "Enhance" / "Collabora admin"
  opens_in: 'new_tab';            // canónico — siempre new_tab para no perder el dashboard
}
```

**Auditoría obligatoria**: cada llamada a `getSsoUrl` registra fila en `audit_access_log` con `action='sso_panel_open'`, `target_service_id=<id>`, `provisioner_slug=<slug>`, IP, user-agent. Cumple [ADR-017](./adr-017-audit-log-inmutable.md) y la transparencia RGPD del [ADR-010](./adr-010-rgpd-retencion-datos.md).

**Soporte por plugin (mapping canónico)**:
- `cpanel_whm` ✅ — `WHM::create_user_session()` API.
- `enhance_cp` ✅ — `POST /api/v1/sessions/{customer_id}` API.
- `plesk_obsidian` ✅ — `secret_key` mecanismo + `&target=admin` redirect.
- `directadmin` ✅ — `CMD_LOGIN_KEYS` URL temporal.
- `docker_engine` ⚠️ condicional — sólo si el `docker_template.yaml` declara `admin_panel_url` (ej. Collabora `/loleaflet/dist/admin.html`, Nextcloud `/index.php/settings/admin`); el plugin genera URL con token temporal del propio app.
- `resellerclub` ❌ — devuelve `null`. Acciones inline cubren los flujos típicos.
- `internal` ❌ — N/A (productos sin panel).
- `manual` ❌ — N/A (no tiene proveedor).

### Mecanismo C — `executeAction(service, actionSlug, payload): Promise<ActionResult>`

Método obligatorio que ejecuta una acción declarada en `capabilities.inline_actions`. Registra **siempre** fila en `audit_access_log` con `action='service_action_<slug>'`, payload sanitizado, resultado.

```typescript
interface ActionResult {
  success: boolean;
  message?: string;            // mensaje al cliente (i18n key del plugin)
  side_effects?: string[];     // ej. ["service.restarted", "service.metrics_invalidated"]
}
```

#### Doctrina canónica de **cuándo añadir una acción inline a un plugin**

Una acción `X` se admite en `capabilities.inline_actions` **si y sólo si** cumple **TODOS** los criterios:

1. **Frecuencia**: el cliente promedio la solicitaría >5 veces/mes (medida real cuando exista, estimación profesional mientras no haya métricas).
2. **Idempotencia o reversibilidad**: la acción es idempotente (restart, fetch metrics) o reversible sin coste (cambiar DNS record que se puede revertir, vs. eliminar cuenta cPanel que no).
3. **Sin estado dual**: la acción **no requiere** que Aelium mantenga un espejo del estado del proveedor. Ej: "ver disco usado" sí (lectura puntual), "gestionar email accounts" no (requiere CRUD espejo).
4. **Auditable de forma significativa**: `audit_access_log` registra qué hizo el cliente con detalle suficiente para investigar incidencias.
5. **Aprobada por superadmin** vía pull request al ADR específico del plugin que la añade. No se añaden acciones unilateralmente desde código.

#### Acciones canónicas iniciales (mapping por plugin)

| Plugin | Acciones inline aprobadas |
|---|---|
| `docker_engine` | `restart_container` · `view_logs_tail_100` · `reset_admin_password` · `change_subdomain` · `request_resource_upgrade` (genera ticket) |
| `cpanel_whm` / `enhance_cp` | `reset_account_password` · `view_disk_usage` (lectura) · `view_bandwidth_usage` (lectura) |
| `resellerclub` | `view_dns_records` · `add_dns_record(type, name, value, ttl)` · `update_dns_record(id, ...)` · `delete_dns_record(id)` · `request_transfer_out` (genera auth code) · `toggle_auto_renew` |
| `internal` | (ninguna, sólo lectura del estado) |
| `manual` | (ninguna desde cliente; agente dispone de acciones via tasks) |

**Cualquier acción no listada arriba** queda **fuera del dashboard**. Si el cliente la necesita: (a) abre ticket, (b) usa el botón SSO al panel externo, (c) el equipo evalúa añadirla al plugin con ADR específico.

### Patrón de página `/dashboard/services/[id]` (frontend canónico)

Una sola plantilla React Server Component renderiza todos los servicios. Lee `getServiceInfo(service)` server-side, condiciona la UI a `capabilities`:

```tsx
// Pseudo-código orientativo
const info = await provisioningService.getServiceInfo(service);

return (
  <ServicePage>
    <ServiceHeader display={info.display} status={info.status} />

    {info.capabilities.has_sso_panel && (
      <SsoButton service={service} label={info.capabilities.panel_label} />
    )}

    {info.metrics && <MetricsBar metrics={info.metrics} />}

    {info.capabilities.has_metrics_history && (
      <MetricsChart serviceId={service.id} />     // sólo Docker
    )}

    <ActionsBar actions={info.capabilities.inline_actions} />

    <AuditLogFeed serviceId={service.id} />        // siempre presente, fuente única en Aelium
  </ServicePage>
);
```

### Eventos emitidos por el módulo `provisioning` (extiende `_events.md`)

- `service.action_executed` — payload `{ serviceId, actionSlug, clientId, success, sideEffects }`. Consumido por `audit` y opcionalmente por `notifications` para acciones destructivas.
- `service.sso_opened` — payload `{ serviceId, panelLabel, clientId, ip }`. Consumido por `audit`.
- `service.metrics_fetched` — payload `{ serviceId, fetchedAt, sourceLatencyMs }`. Sólo emitido cuando se invalida cache. Consumido por `audit` (RGPD: cliente sabe cuándo se consultó al proveedor).

---

## Consecuencias

- ✅ **Ganamos:**
  - **Página de servicio única** para todos los productos. Frontend cero condicional por plugin.
  - **Aelium = puerta de entrada permanente**. Cliente nunca pierde de vista el dashboard.
  - **Audit log completo**: SSO opens, acciones inline, métricas fetched, todo trazable.
  - **Plugins separados con interfaz expresiva**: añadir Plesk Obsidian es plugin nuevo + mapping de SSO + lista de acciones — sin tocar core.
  - **Doctrina objetiva** para qué añadir o no inline (los 5 criterios). Cierra debates futuros.
  - **Compatibilidad UX con WHMCS/Blesta** — clientes que vienen de esos sistemas reconocen el patrón.
- ⚠️ **Aceptamos:**
  - **Plugins más densos**: 6 métodos canónicos en lugar de 3. Mitigación: helpers compartidos en `core/provisioning/plugin-utils.ts` (cache wrapper, audit logger, circuit breaker boilerplate). Cada plugin sigue siendo independiente — los helpers son librería, no framework.
  - **Cache invalidation**: tras `executeAction` hay que invalidar `getServiceInfo` de ese servicio. Riesgo de inconsistencia si el plugin olvida emitir `service.metrics_invalidated`. Mitigación: helper `executeActionWithCacheInvalidation()` lo hace por defecto.
  - **Política de SSO depende del proveedor**: si Enhance cambia su API de SSO, hay que actualizar el plugin. Aceptable — riesgo localizado.
- 🚪 **Cierra:**
  - **No `if (provisioner === 'X')` en frontend** — cualquier ramificación así se rechaza en code review.
  - **No replicación de panel externo** — Aelium no implementa Email Manager, DB Manager, File Manager, etc. Cualquier intento se rechaza por criterio §3 ("sin estado dual").
  - **No acciones inline ad-hoc**: cada acción requiere ADR específico del plugin que la documente y justifique los 5 criterios.
  - **No SSO sin auditoría** — `getSsoUrl` siempre registra `sso_panel_open` en audit.

---

## Cuándo revisar

- Si una **misma acción se repite** en >3 plugins con la misma firma (ej. `reset_password` parametrizable) → considerar normalizarla a canónico en core, sin romper la doctrina "plugins libres dentro de la interfaz" — sería un helper, no obligación.
- Si Aelium evoluciona a operar **el control panel del cliente** (ej. fork de Plesk + customización) → revisar; en ese caso la separación dashboard/panel se difumina.
- Si **>30% de los tickets** son sobre operativa de panel externo → la ratio inline/SSO está desbalanceada; reconsiderar qué acciones añadir.
- Si el coste de mantener plugins SSO supera el ahorro de tickets → revisar si compensa mantener SSO o migrar a "panel externo abierto en nueva pestaña sin SSO" (degradación aceptable, peor UX).

---

## Referencias

- **Módulos afectados:**
  - `provisioning` — orquestador del lifecycle, dueño del cache `service_info` en Redis y de la emisión de `service.*` events. Sprint 11.
  - `plugins/provisioners/*` — cada plugin implementa los 3 mecanismos. Sprint 15A (framework helpers) + 15C/D/E/G (plugins concretos).
  - `dashboard` (frontend) — página `/dashboard/services/[id]` única. Sprint 11 base + iteraciones por plugin.
  - `audit` — consume `service.action_executed`, `service.sso_opened`, `service.metrics_fetched`. Ya existe ([ADR-017](./adr-017-audit-log-inmutable.md), Sprint 9 Fase E).
  - `infrastructure` — proveedor de `server_metrics` para `has_metrics_history` del plugin Docker. Sprint 10.
- **Reglas relacionadas:**
  - [R4](../00-foundations/rules.md) — plugins no se importan desde core.
  - [R7](../00-foundations/rules.md) — todos los errores se registran y notifican (acciones que fallan emiten `service.action_failed`).
  - [R11](../00-foundations/rules.md) — circuit breaker en llamadas externas.
  - [R12](../00-foundations/rules.md) — credenciales encriptadas.
  - [R13](../00-foundations/rules.md) — fallos no desaparecen (acciones inline en BullMQ con DLQ si aplica).
  - [R14](../00-foundations/rules.md) — manejo de errores frontend (mensajes del plugin se muestran sanitizados).
- **ADRs relacionados:**
  - [ADR-021](./adr-021-provisioners.md) — interfaz mínima (`provision/deprovision/getStatus`); este ADR la **extiende** con `getServiceInfo/getSsoUrl/executeAction` (no la supersede).
  - [ADR-009](./adr-009-estrategia-plugins.md) — patrón plugin general.
  - [ADR-043](./adr-043-infraestructura-self-hosted.md) — provee `server_metrics` para Docker.
  - [ADR-017](./adr-017-audit-log-inmutable.md) — audit obligatorio.
  - [ADR-010](./adr-010-rgpd-retencion-datos.md) — transparencia RGPD (cliente ve audit en su portal).
  - [ADR-066](./adr-066-tres-portales-raiz-portalbadge.md) — la página vive en `/dashboard/services/[id]` (portal cliente), no en admin.
- **Glosario:** *Service info*, *SSO panel*, *Acción curada*, *Capability flag* (añadidos en `glossary.md` con esta decisión).
- **Discusión externa:** conversación Yasmin ↔ Claude 2026-04-29 sobre cómo centralizar la operativa cliente sin caer en replicación del panel externo.
- **Inspiración industrial:** WHMCS Server Modules + Domain Registrar Modules + One-Click Login (desde 2010); Blesta Module API; HostBill Server App; FOSSBilling Server Modules.
