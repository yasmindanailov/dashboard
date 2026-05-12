# ADR-077 — Contrato canónico `ProvisionerPlugin` v2: firma congelada + capability flags + shapes

> **Status:** Active (extiende [ADR-021](./adr-021-provisioners.md), materializa la decisión arquitectónica de [ADR-070](./adr-070-service-info-sso-acciones-curadas.md))
> **Date:** 2026-05-01
> **Domain:** provisioning, plugins, cross-cutting
> **Sprint:** Sprint 11 (Fase 11.A — congelación de contratos antes de cualquier código de orquestador)

---

## Contexto

[ADR-021](./adr-021-provisioners.md) (2025-11) declaró la interfaz mínima de un `ProvisionerPlugin` con tres métodos: `provision`, `deprovision`, `getStatus`. Hizo explícito el principio canónico *"el plugin internamente hace lo que tenga que hacer"*. Esa interfaz es necesaria pero **insuficiente** para soportar la doctrina de UX que [ADR-070](./adr-070-service-info-sso-acciones-curadas.md) (2026-04-29) cerró:

- Página `/dashboard/services/[id]` única para todos los productos sin condicionales por plugin → necesita `getServiceInfo()` normalizado.
- Delegación al panel especialista (cPanel/Plesk/Enhance/Collabora admin) cuando el plugin lo soporte → necesita `getSsoUrl()`.
- Acciones curadas inline auditables (reset password, restart container, DNS records CRUD) → necesita `executeAction()`.

ADR-070 declaró estos tres mecanismos pero **a nivel arquitectónico abstracto** — describió qué hace cada uno y dio ejemplos de payload. No congeló:

1. La firma TypeScript exacta de los 6 métodos del contrato v2.
2. El shape exhaustivo de `ServiceInfo`, `SsoUrl`, `ActionResult`, `ServiceMetrics`.
3. La lista cerrada de **capability flags** que el frontend usa para condicionar UI.
4. La doctrina de cómo se invocan (sync/async, pipeline de cache + audit + circuit breaker, qué se delega al plugin y qué hace el orquestador).
5. La política de versionado del contrato cuando deba evolucionar (v3 futuro).

Sprint 11 (P2.1) implementa el orquestador `provisioning` y los dos plugins triviales (`internal`, `manual`). Sprint 15A construye el plugin framework y los helpers compartidos. Sprints 15C/D/E/G implementan plugins reales (Enhance CP, ResellerClub, Docker Engine, Plesk).

> **¿Qué pasaría si NO tomáramos esta decisión?** Cada plugin se desarrollaría con micro-divergencias del contrato — campos opcionales que un plugin trata como obligatorios, capability flags que algún plugin omite y otros declaran, shapes que difieren en el orden de propiedades por convenio implícito, retornos `null` vs `undefined` interpretados distinto. Sprint 15A construiría el framework con ambigüedades que se trasladarían a 15C/D/E. Code review se llenaría de "¿esto debería ser opcional o obligatorio?" sin fuente de verdad, y la regla R4 (no importar plugins desde core) se erosionaría porque cada plugin redefine sus propios tipos. **Es exactamente el antipatrón que ADR-070 §Cuándo revisar advierte cuando dice "si Aelium evoluciona a operar el control panel del cliente, revisar"**: la diferencia entre interfaz curada e interfaz emergente.

---

## Opciones consideradas

### A. Status quo — deferir el contrato exacto a Sprint 15A (plugin framework)

- **Pros**: Sprint 11 arranca antes; el primer plugin real "descubre" la firma necesaria.
- **Contras**: Sprint 11 implementa orquestador + 2 plugins triviales sin contrato firme → cuando Sprint 15A llegue, los 2 plugins triviales se reescriben para alinearse. Sprint 11 paga refactor inevitable. Y el patrón "interface emerge from implementation" es exactamente lo que la doctrina del proyecto evita en cada sprint cerrado.

### B. Definir el contrato en código directamente (sin ADR)

- **Pros**: rapidez.
- **Contras**: cualquier cambio del contrato pasa por code review en lugar de ADR explícito. Sprint 15A puede modificarlo unilateralmente. La regla R0 (las decisiones arquitectónicas requieren ADR) se rompe. **No reproducible** — un nuevo desarrollador que mire `core/provisioning/types.ts` no encuentra el "por qué" de cada campo.

### C. (elegida) Congelar el contrato en este ADR antes del primer commit de Sprint 11

- ADR-077 declara los 6 métodos con firma TypeScript exacta + shapes completos + capability flags cerrados + política de versionado.
- Sprint 11 Fase 11.A traslada el contrato a `backend/src/core/provisioning/types.ts` **literal** (sin reinterpretar).
- Sprint 15A consume el contrato como fuente de verdad para los helpers.
- Sprints 15C/D/E/G implementan plugins reales sobre el contrato sin tocarlo.
- Cualquier evolución (`v3`) requiere ADR específico que documente migración + compatibilidad.

- **Pros**:
  - Contratos congelados antes de codear → cero refactor inter-sprint.
  - ADR como fuente de verdad → futuras conversaciones citan §3.X de este ADR, no archivos de código.
  - Test contract genérico (`plugin-contract.spec.ts`) verifica que cualquier plugin nuevo cumple la firma — ejecutado en CI.
  - Compatible con el patrón de Sprint 8 D.0 (ADR-075 redactado antes de Fase D código): redactar ADR antes del primer commit funciona y produce sprint robusto.
- **Contras**:
  - Sprint 11 Fase 11.A se retrasa ~0.5 sesión por la redacción del ADR.
  - Riesgo: el ADR se queda "demasiado abstracto" y el primer plugin real (Sprint 15C Enhance CP) descubre un caso no previsto. Mitigación: **§"Cuándo revisar"** explícita.

---

## Decisión

**Opción C — congelar el contrato canónico `ProvisionerPlugin` v2 en este ADR antes del primer commit de orquestador.**

A continuación se especifica de forma exhaustiva la firma, los shapes, los capability flags, la doctrina de invocación y la política de versionado.

---

### 1. Firma canónica TypeScript del contrato v2

```typescript
/**
 * ProvisionerPlugin v2 — contrato canónico congelado por ADR-077.
 *
 * Cualquier plugin de provisioning DEBE implementar los 6 métodos:
 *   - 3 heredados de ADR-021 (provision, deprovision, getStatus)
 *   - 3 nuevos de ADR-070 (getServiceInfo, getSsoUrl, executeAction)
 *
 * Versionado: el contrato v2 es estable. Cambios futuros que rompan
 * compatibilidad requieren ADR explícito + bump a v3 + migración.
 */
export interface ProvisionerPlugin {
  /** Identificador canónico del plugin. snake_case o kebab-case
   *  (regex `/^[a-z][a-z0-9_-]*$/`, ver Amendment A2). Inmutable. */
  readonly slug: string;

  /** Versión del contrato implementado. Hoy: 'v2'. */
  readonly contractVersion: 'v2';

  /** Capability flags declarados estáticamente. Ver §3. */
  readonly capabilities: PluginCapabilities;

  /** Lista cerrada de acciones inline soportadas. Ver §4. */
  readonly inlineActions: readonly ServiceAction[];

  // ─── Métodos heredados ADR-021 ──────────────────────────────────────────

  /**
   * Crea el servicio en el sistema externo (o marca activo si interno).
   * Idempotente: si ya existe `provider_reference`, devuelve éxito sin recrear.
   * Lanza ProvisionerPluginError con código semántico (ver §6) en fallo.
   */
  provision(ctx: ProvisionContext): Promise<ProvisionResult>;

  /**
   * Cancela / elimina el servicio en el sistema externo.
   * Idempotente: si ya está cancelado externamente, devuelve éxito.
   */
  deprovision(ctx: DeprovisionContext): Promise<void>;

  /**
   * Lectura puntual del estado real en el sistema externo.
   * NO debe consultar cache de Aelium — es la fuente de verdad ad-hoc.
   * Usado por crons de reconciliación, no por la página `/dashboard/services/[id]`.
   */
  getStatus(service: Service): Promise<ServiceStatusReport>;

  // ─── Métodos nuevos ADR-070 (canónicos a partir de v2) ──────────────────

  /**
   * Devuelve información normalizada del servicio para renderizar
   * `/dashboard/services/[id]`. El orquestador la cachea en Redis con
   * TTL configurable. Plugins NO gestionan la cache — el wrapper
   * `core/provisioning/plugin-utils.executeWithCache()` lo hace.
   */
  getServiceInfo(service: Service): Promise<ServiceInfo>;

  /**
   * Devuelve URL firmada de single sign-on al panel del proveedor.
   * Devuelve `null` si el plugin no soporta SSO (ej. resellerclub, manual).
   * El orquestador audita la llamada con `service.sso_opened`.
   */
  getSsoUrl(service: Service): Promise<SsoUrl | null>;

  /**
   * Ejecuta una acción inline del catálogo `inlineActions`.
   * El wrapper `executeActionWithCacheInvalidation()` invalida cache
   * y emite `service.action_executed` automáticamente.
   * El plugin SOLO implementa la lógica del proveedor.
   */
  executeAction(
    service: Service,
    actionSlug: string,
    payload: Record<string, unknown>,
  ): Promise<ActionResult>;
}
```

---

### 2. Shapes congelados

#### 2.1 `ProvisionContext`

```typescript
export interface ProvisionContext {
  /** Servicio Prisma con relaciones precargadas: client, product, pricing. */
  readonly service: ServiceWithRelations;

  /** Datos del cliente sanitizados (sin password hashes ni secrets). */
  readonly client: ClientPublicData;

  /** Configuración del producto (jsonb plano declarado en `products.config`). */
  readonly productConfig: Record<string, unknown>;

  /** ID de servidor asignado por `infrastructure.pickServerForProduct()`.
   * Solo poblado para plugins que declaran `capabilities.requires_server = true`
   * (hoy solo `docker_engine`). Resto de plugins reciben `null`. */
  readonly serverId: string | null;

  /** Correlation ID para audit + log. */
  readonly correlationId: string;
}
```

#### 2.2 `ProvisionResult`

```typescript
export interface ProvisionResult {
  /** Identificador del recurso en el sistema externo (cPanel account ID,
   * domain ID, container ID, etc.). NULL para plugins `internal` y `manual`. */
  providerReference: string | null;

  /** Metadata adicional del proveedor para persistir en `services.metadata`.
   * Plano, sin secretos. */
  metadata: Record<string, string | number | boolean>;

  /** Acciones de seguimiento que el orquestador debe ejecutar tras éxito.
   * Hoy: ['mark_active'] (default), ['create_setup_task'] (manual provisioner). */
  followUp: ProvisioningFollowUp[];
}

export type ProvisioningFollowUp =
  | 'mark_active'              // services.status = 'active' inmediatamente
  | 'wait_for_task_completion' // services.status = 'pending', listener `provisioning-on-task-completed` lo activa
  | 'create_setup_task';       // crea Task(type=support_setup) en cola pública
```

#### 2.3 `ServiceInfo` (canónico — frontend lo consume server-side)

```typescript
export interface ServiceInfo {
  /** Estado real del servicio en el proveedor.
   * Distinto de services.status (cache local) — el plugin lo determina. */
  status: ServiceInfoStatus;
  statusReason?: string;

  display: {
    primary: string;            // ej. "miweb.com" / "cliente1.aelium.net"
    secondary?: string;         // ej. "Hosting Pro 10GB"
    expiresAt?: string;         // ISO-8601
    autoRenew?: boolean;
  };

  metrics?: ServiceMetrics;     // undefined si plugin no expone

  /** Capability flags por instancia de servicio (overrides estáticos por contexto).
   * Ej. un servicio Docker en pool sin admin panel devuelve has_sso_panel=false aunque
   * el plugin declare en static capabilities has_sso_panel=true. */
  capabilities: ServiceCapabilities;

  /** Acciones disponibles para ESTE servicio (subset de plugin.inlineActions
   * filtrado por estado actual; ej. restart no aparece si status='cancelled'). */
  availableActions: readonly ServiceAction[];

  /** Timestamp de la lectura del proveedor (cache se calcula desde aquí). */
  fetchedAt: string;            // ISO-8601
}

export type ServiceInfoStatus =
  | 'active'
  | 'suspended'
  | 'expired'
  | 'pending'
  | 'failed'
  | 'cancelled'
  | 'unknown';                  // proveedor caído / timeout

export interface ServiceMetrics {
  diskUsedMb?: number;
  diskTotalMb?: number;
  bandwidthUsedMb?: number;
  bandwidthTotalMb?: number;
  ramUsedMb?: number;           // Docker only
  ramTotalMb?: number;
  cpuUsagePercent?: number;     // Docker only
  emailAccountsUsed?: number;
  emailAccountsTotal?: number;
  databasesUsed?: number;
  databasesTotal?: number;
  custom?: Record<string, string | number>;
  fetchedAt: string;            // ISO-8601
}

export interface ServiceCapabilities extends PluginCapabilities {
  /** Por instancia: si el SSO está disponible AHORA (puede degradarse aunque el plugin lo soporte). */
  hasSsoPanel: boolean;
  /** Por instancia: subset de inline_actions disponible para este servicio + su estado actual. */
  inlineActions: readonly ServiceAction[];
}
```

#### 2.4 `SsoUrl`

```typescript
export interface SsoUrl {
  /** URL completa con session token. */
  url: string;
  /** Cuándo expira el token. ISO-8601. Típicamente 5-15 min. */
  expiresAt: string;
  /** Etiqueta del panel de destino (i18n key del plugin). */
  panelLabel: string;
  /** Canónico: siempre 'new_tab' para no perder el dashboard. */
  opensIn: 'new_tab';
}
```

#### 2.5 `ActionResult` + `ServiceAction`

```typescript
export interface ServiceAction {
  /** Slug canónico (snake_case o kebab-case, ver Amendment A2) — lista cerrada por plugin. */
  slug: string;
  /** Etiqueta i18n key. */
  label: string;
  /** Descripción i18n key (opcional). */
  description?: string;
  /** Si requiere modal de confirmación. */
  confirmRequired: boolean;
  /** Texto de confirmación i18n key (si confirmRequired). */
  confirmationText?: string;
  /** Si renderizar con estilo destructive. */
  destructive: boolean;
  /** Schema de payload (Zod descrito como JSON Schema 7).
   * Usado por frontend para construir el formulario inline. */
  payloadSchema?: Record<string, unknown>;
}

export interface ActionResult {
  /** Si la acción terminó OK desde el punto de vista del plugin. */
  success: boolean;
  /** Mensaje al cliente (i18n key del plugin). */
  message?: string;
  /** Side effects para que el orquestador notifique a otros módulos.
   * Lista cerrada — solo strings de §5. */
  sideEffects?: readonly ActionSideEffect[];
  /** Datos adicionales que el frontend renderiza inline (ej. logs tail). */
  data?: Record<string, unknown>;
}

export type ActionSideEffect =
  | 'service.metrics_invalidated'
  | 'service.restarted'
  | 'service.dns_modified'
  | 'service.password_reset'
  | 'service.subdomain_changed';
```

#### 2.6 `ProvisionerPluginError`

Error semántico canónico — todos los plugins lanzan instancias de esta clase, no `Error` plano.

```typescript
export class ProvisionerPluginError extends Error {
  constructor(
    message: string,
    public readonly code: ProvisionerErrorCode,
    public readonly retriable: boolean,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ProvisionerPluginError';
  }
}

export type ProvisionerErrorCode =
  | 'PROVIDER_TIMEOUT'        // retriable=true
  | 'PROVIDER_RATE_LIMITED'   // retriable=true
  | 'PROVIDER_AUTH_FAILED'    // retriable=false (credenciales mal — alerta admin)
  | 'PROVIDER_RESOURCE_EXHAUSTED' // retriable=false (capacidad superada)
  | 'INVALID_PAYLOAD'         // retriable=false (DTO mal — bug del orquestador)
  | 'INVALID_STATE'           // retriable=false (servicio en estado incompatible)
  | 'NOT_IMPLEMENTED'         // retriable=false (capability declarada pero no soportada — bug)
  | 'PROVIDER_INTERNAL_ERROR' // retriable=true por defecto, plugin puede sobreescribir
  | 'NETWORK_ERROR';          // retriable=true
```

El orquestador usa `error.retriable` para decidir si reintentar (con backoff [30s, 90s, 270s]) o ir directo a DLQ + emitir `service.provisioning_failed`.

---

### 3. `PluginCapabilities` — flags estáticos cerrados

Lista canónica congelada. Cualquier flag nuevo requiere ADR específico.

```typescript
export interface PluginCapabilities {
  /** Soporta SSO al panel externo (es decir, getSsoUrl puede devolver no-null). */
  has_sso_panel: boolean;

  /** Etiqueta del panel para el botón cliente. Solo si has_sso_panel=true. */
  panel_label?: string;

  /** Devuelve métricas en getServiceInfo.metrics. */
  has_metrics: boolean;

  /** Aelium guarda series temporales (server_metrics filtradas). Solo Docker. */
  has_metrics_history: boolean;

  /** Requiere asignación de servidor (`pickServerForProduct`). Solo Docker. */
  requires_server: boolean;

  /** Provision es síncrono (devuelve antes de N segundos) o asíncrono.
   * Si async, el orquestador no espera el resultado y delega al webhook
   * o cron de reconciliación del plugin. */
  provision_mode: 'sync' | 'async';

  /** Plugin completa el provisioning vía Task del agente.
   * Si true, el listener `provisioning-on-task-completed` activa el servicio
   * cuando se cierra la Task asociada. Hoy solo `manual`. */
  completes_via_task: boolean;

  /** Aelium puede hacer reconciliación periódica (cron `service-reconcile`)
   * llamando a getStatus(). Falsi si la operación es cara para el proveedor. */
  supports_reconciliation: boolean;
}
```

**Mapping inicial canónico (Sprint 11 + Sprint 15 referencia):**

| Plugin | has_sso_panel | has_metrics | has_metrics_history | requires_server | provision_mode | completes_via_task | supports_reconciliation |
|---|---|---|---|---|---|---|---|
| `internal` | ❌ | ❌ | ❌ | ❌ | `sync` | ❌ | ❌ |
| `manual` | ❌ | ❌ | ❌ | ❌ | `sync` | ✅ | ❌ |
| `enhance_cp` (15C) | ✅ | ✅ | ❌ | ❌ | `sync` | ❌ | ✅ |
| `cpanel_whm` (15C bis) | ✅ | ✅ | ❌ | ❌ | `sync` | ❌ | ✅ |
| `resellerclub` (15D) | ❌ | ❌ | ❌ | ❌ | `sync` | ❌ | ✅ |
| `docker_engine` (15E) | ⚠ condicional | ✅ | ✅ | ✅ | `sync` | ❌ | ✅ |
| `plesk_obsidian` (15G) | ✅ | ✅ | ❌ | ❌ | `sync` | ❌ | ✅ |

`docker_engine.has_sso_panel` es ⚠ condicional: depende de si `docker_template.yaml` declara `admin_panel_url` — el plugin lo determina por servicio (vía `ServiceCapabilities`, no estático).

---

### 4. `inlineActions` — declaración estática del catálogo de acciones

Cada plugin declara su lista cerrada en construcción (no se mutan en runtime). Las acciones disponibles **por servicio** (filtradas por estado) las devuelve `getServiceInfo().capabilities.inlineActions`.

**Mapping canónico inicial** (referencia para Sprints 15A-G):

| Plugin | Slugs aprobados |
|---|---|
| `internal` | (vacío — solo lectura) |
| `manual` | (vacío desde cliente; agente actúa via tasks) |
| `enhance_cp` / `cpanel_whm` | `reset_account_password`, `view_disk_usage`, `view_bandwidth_usage` |
| `resellerclub` | `view_dns_records`, `add_dns_record`, `update_dns_record`, `delete_dns_record`, `request_transfer_out`, `toggle_auto_renew` |
| `docker_engine` | `restart_container`, `view_logs_tail_100`, `reset_admin_password`, `change_subdomain`, `request_resource_upgrade` |

**Doctrina canónica** para añadir un slug nuevo (heredada de ADR-070, reafirmada aquí):

1. Frecuencia >5 veces/mes por cliente.
2. Idempotente o reversible.
3. Sin estado dual (sin espejo cPanel local).
4. Auditable significativamente.
5. Aprobada por superadmin vía ADR específico del plugin.

Cualquier acción no listada arriba ni aprobada vía ADR queda fuera del dashboard. Cliente la ejecuta vía SSO o ticket.

---

### 5. Pipeline canónico de invocación (orquestador → plugin)

El orquestador `provisioning` NO llama a los plugins directamente. Usa **3 helpers wrapper** que centralizan cache, audit, circuit breaker y emisión de eventos.

```typescript
// core/provisioning/plugin-utils.ts

/**
 * Wrapper canónico para getServiceInfo:
 *   1. Lee cache Redis service_info:<id>
 *   2. Si miss o stale: llama plugin.getServiceInfo(service)
 *   3. Cachea con TTL (settings.provisioning.service_info_ttl_seconds, default 60)
 *   4. Emite service.metrics_fetched (audit)
 *   5. Si plugin lanza ProvisionerPluginError(retriable=false): cache short-TTL del error
 *      con `status='unknown'` para evitar martillar al proveedor; UI muestra warning
 */
export async function getServiceInfoWithCache(
  plugin: ProvisionerPlugin,
  service: Service,
  redis: Redis,
  events: EventEmitter2,
): Promise<ServiceInfo> { /* ... */ }

/**
 * Wrapper canónico para executeAction:
 *   1. Valida que actionSlug ∈ plugin.inlineActions[].slug
 *   2. Valida payload contra plugin.inlineActions[i].payloadSchema (Zod)
 *   3. Ejecuta plugin.executeAction()
 *   4. Invalida cache service_info:<id>
 *   5. Emite service.action_executed (audit)
 *   6. Si side_effects incluye 'service.metrics_invalidated' → invalida también server_metrics:<id> (Docker)
 */
export async function executeActionWithCacheInvalidation(
  plugin: ProvisionerPlugin,
  service: Service,
  actionSlug: string,
  payload: Record<string, unknown>,
  redis: Redis,
  events: EventEmitter2,
  audit: AuditService,
): Promise<ActionResult> { /* ... */ }

/**
 * Wrapper canónico para getSsoUrl:
 *   1. Llama plugin.getSsoUrl(service)
 *   2. Si null: devuelve null (UI oculta botón)
 *   3. Si url: emite service.sso_opened (audit con IP, UA, panelLabel)
 *   4. Devuelve la URL al frontend
 */
export async function getSsoUrlWithAudit(
  plugin: ProvisionerPlugin,
  service: Service,
  audit: AuditService,
  request: { ip: string; userAgent: string },
): Promise<SsoUrl | null> { /* ... */ }
```

**Regla canónica:** **los plugins NUNCA llaman directamente a Redis, EventEmitter o AuditService.** El plugin recibe los datos por parámetro (vía contexto) y devuelve el resultado. La interceptación cross-cutting vive en estos 3 wrappers.

Esto materializa R4 (plugins no se importan desde core, pero sí los plugins importan helpers de `core/provisioning/plugin-utils` — los helpers son librería, no orquestador). Y R7 + R11 (errores y circuit breaker) los implementa el wrapper, no cada plugin.

---

### 6. Política de versionado del contrato

- **v2** es la versión canónica fijada por este ADR. Estable hasta nuevo ADR que justifique v3.
- Los plugins declaran `contractVersion: 'v2'` literal. El orquestador rechaza plugins con `contractVersion !== 'v2'` con error explícito + alerta admin.
- Cambios **compatibles hacia atrás** (añadir un capability flag opcional, añadir un campo opcional a un shape) se documentan como amendment a este ADR (sección "Amendments" al final). NO bumpean a v3.
- Cambios **breaking** (renombrar método, eliminar campo, cambiar tipo) requieren:
  1. ADR-NNN nuevo que justifique el cambio.
  2. Bump a `contractVersion: 'v3'` en plugins migrados.
  3. Período de coexistencia v2+v3 si hay plugins en producción → orquestador soporta ambos hasta migración total.
  4. Test contract genérico actualizado.

**Ejemplo de cambio breaking previsible:** si un plugin futuro requiere métricas time-series (no solo snapshot), eso podría exigir que `ServiceMetrics` se convierta en stream — eso es v3.

---

### 7. Test contract genérico

Sprint 11 Fase 11.A entrega un test parametrizado que **cualquier plugin nuevo debe pasar**:

```typescript
// tests/unit/plugin-contract.spec.ts
describe.each(REGISTERED_PROVISIONER_PLUGINS)(
  'ProvisionerPlugin contract v2 — %s',
  (plugin) => {
    it('declara slug en snake_case o kebab-case (Amendment A2)', () => { /* ... */ });
    it('declara contractVersion === v2', () => { /* ... */ });
    it('declara capabilities completas', () => { /* ... */ });
    it('todas las inlineActions tienen slug único', () => { /* ... */ });
    it('si has_sso_panel=true → declara panel_label', () => { /* ... */ });
    it('si requires_server=true → solo aplica a docker_engine', () => { /* ... */ });
    it('completes_via_task=true → existe listener provisioning-on-task-completed configurado', () => { /* ... */ });
    it('provision con ProvisionContext válido devuelve ProvisionResult shape', () => { /* ... */ });
    it('deprovision con servicio inexistente externamente NO lanza (idempotente)', () => { /* ... */ });
    it('getServiceInfo devuelve ServiceInfo shape', () => { /* ... */ });
    it('getSsoUrl devuelve null o SsoUrl shape', () => { /* ... */ });
    it('executeAction con slug inválido lanza ProvisionerPluginError(INVALID_PAYLOAD)', () => { /* ... */ });
  },
);
```

Este test corre en CI. Cualquier PR que añada un plugin nuevo debe pasar el test antes de merge.

---

## Consecuencias

- ✅ **Ganamos:**
  - **Contrato congelado** antes del primer commit de orquestador. Cero ambigüedad cross-sprint.
  - **Test contract genérico** garantiza que cualquier plugin futuro cumple la firma — error en CI inmediato si un plugin se desvía.
  - **Wrappers cross-cutting** centralizados (`executeActionWithCacheInvalidation`, etc.) → cada plugin solo escribe lógica del proveedor, no boilerplate de cache/audit.
  - **Política de versionado explícita** → la conversación "¿esto es breaking?" tiene respuesta canónica.
  - **R4 reforzado**: plugins importan de `core/provisioning/plugin-utils` (librería) pero NO de `modules/provisioning` (orquestador). El linter ESLint puede enforzarlo.
  - **Sprint 11 robusto** — replica el patrón Sprint 8 D.0 (ADR-075 antes de código) que produjo el mejor sprint del proyecto.
- ⚠️ **Aceptamos:**
  - **Sprint 11 Fase 11.A se retrasa ~0.5 sesión** redactando este ADR + test contract. Inversión que paga >5x cuando llegan Sprints 15A-G.
  - **Riesgo de que un plugin real (Enhance CP, Sprint 15C) descubra un caso no previsto**. Mitigación: §"Cuándo revisar" + amendments para cambios compatibles + bump a v3 para breaking.
  - **El orquestador depende de helpers `plugin-utils`** — si cambian su contrato, todos los plugins lo notan. Mitigación: helpers forman parte del contrato canónico, su firma se documenta aquí también.
- 🚪 **Cierra:**
  - **No `interface emerges from implementation`** — el contrato existe ANTES del primer plugin real.
  - **No plugin importa Redis/EventEmitter directamente** — pasa por wrappers.
  - **No `contractVersion` ad-hoc** — solo `'v2'` hoy; cambio requiere ADR.
  - **No acciones ad-hoc en código** — toda acción nueva pasa por la doctrina §4 (5 criterios + ADR plugin específico).
  - **No `if (provisioner === 'X')` en frontend** — page reads `getServiceInfo().capabilities` y ramifica por capability flag, nunca por slug.

---

## Cuándo revisar

- **Si Sprint 15C (Enhance CP) descubre un caso no cubierto** (ej. paginación de métricas, webhook de cambios async, multi-language errors): añadir amendment a este ADR si compatible; ADR-NNN nuevo + bump v3 si breaking.
- **Si surge un plugin con `provision_mode: async` real** (ej. cPanel sólo confirma cuenta tras 30 min): hoy ningún plugin lo necesita pero el flag está reservado. Cuando llegue, validar que el orquestador soporta el modo asíncrono con `provider_reference` parcialmente poblado y reconciliación posterior.
- **Si un partner del Sprint 19 quiere invocar `executeAction` sobre servicios de sus clientes**: revisar §3 capabilities (añadir `partner_can_execute: boolean`) o ADR específico que lo gobierne.
- **Si el helper `executeActionWithCacheInvalidation` se vuelve cuello de botella** (ej. acciones que tocan 50 servicios a la vez): considerar versión batch del wrapper.
- **Si un capability flag se vuelve true en >5 plugins** (ej. `has_metrics`): pasar a default `true` con opt-out, no opt-in.

---

## Referencias

- **Módulos afectados:**
  - `provisioning` (Sprint 11) — orquestador implementa los 3 wrappers + el listener `invoice.paid` + cola BullMQ.
  - `core/provisioning/plugin-utils` (Sprint 11 + 15A) — librería de wrappers compartidos.
  - `core/provisioning/types.ts` (Sprint 11 Fase 11.A) — types congelados literales de §1 + §2.
  - `plugins/provisioners/internal` y `plugins/provisioners/manual` (Sprint 11 Fase 11.C) — plugins triviales que validan el chasis.
  - `plugins/provisioners/{enhance_cp, resellerclub, docker_engine, plesk_obsidian}` (Sprints 15C/D/E/G) — plugins reales que consumen el contrato.
- **Reglas relacionadas:**
  - [R4](../00-foundations/rules.md) — plugins no importan desde core (orquestador). Sí importan de `core/provisioning/plugin-utils` (librería).
  - [R7](../00-foundations/rules.md) — todos los errores se registran y notifican (`ProvisionerPluginError` + DLQ).
  - [R11](../00-foundations/rules.md) — circuit breaker en llamadas externas. Implementado en wrappers.
  - [R12](../00-foundations/rules.md) — credenciales encriptadas. `productConfig` recibe credenciales descifradas en `ProvisionContext` y el plugin no las persiste.
  - [R13](../00-foundations/rules.md) — fallos no desaparecen. Cola BullMQ con DLQ + `service.provisioning_failed`.
  - [R14](../00-foundations/rules.md) — manejo de errores frontend. `ProvisionerPluginError.message` se sanitiza antes de devolver al cliente.
- **ADRs relacionados:**
  - [ADR-021](./adr-021-provisioners.md) — interfaz mínima v1 (`provision/deprovision/getStatus`). Este ADR la **extiende** con 3 métodos nuevos a v2.
  - [ADR-070](./adr-070-service-info-sso-acciones-curadas.md) — decisión arquitectónica de `getServiceInfo` + `getSsoUrl` + `executeAction`. Este ADR la **materializa** con firma exhaustiva.
  - [ADR-009](./adr-009-estrategia-plugins.md) — patrón plugin general (manifest, loader, encriptación de credenciales).
  - [ADR-017](./adr-017-audit-log-inmutable.md) — `AuditService.logAccess`. Wrappers lo invocan.
  - [ADR-033](./adr-033-outbox-pattern-pendiente.md) — `invoice.paid` viaja por Outbox. Orquestador consume del bus.
  - [ADR-055](./adr-055-resiliencia-circuit-breaker.md) — circuit breaker. Wrappers lo aplican.
  - [ADR-063](./adr-063-bullmq-canonico-dlq-retries.md) — cola `provisioning-dispatch` con DLQ.
  - [ADR-066](./adr-066-tres-portales-raiz-portalbadge.md) — página vive en `/dashboard/services/[id]` (portal cliente).
  - [ADR-046](./adr-046-sistema-proyectos.md) — Sprint 22 Projects extenderá `services.status` con `project_development` + nuevo trigger de provisioning. **No afecta a este contrato** (las extensiones de Projects son orthogonales al plugin).
- **Glosario:** *ProvisionerPlugin v2*, *Capability flag*, *Inline action*, *Service info*, *Side effect*, *Provision mode* (a añadir en `glossary.md`).
- **Sprint:** 11 Fase 11.A (congelación) + 11.B-E (consumo del contrato).
- **Inspiración industrial:** WHMCS Server Modules API (desde 2010), Blesta Module API, FOSSBilling Server Modules — convergen en patrones similares (capability flags, action catalog, SSO opcional).

---

## Amendments

> Reservado para cambios compatibles hacia atrás post-cierre del ADR. Cada amendment con fecha + ADR específico que lo justifica.

### Amendment A1 (2026-05-07) — capability flag `has_dns_management`

> **Justificado por:** [ADR-082](./adr-082-modelo-domain-hosting-dns-doctrine.md) §3 (DNS-as-capability) + §6 (cross-plugin DNS authority resolver).
> **Sprint:** 15C Fase 15C.A (junto a ADR-082 transversal y ADR-083 Enhance specifics, mismo PR doc-only).
> **Compatibilidad:** Hacia atrás. NO bumpea `contractVersion` — sigue `'v2'`. Plugins existentes (`internal`, `manual`) se actualizan con `has_dns_management: false`. El flag pasa a ser **required** en `PluginCapabilities` — el test contract genérico (§7) lo enforza.

#### A1.1. Cambio canónico en `PluginCapabilities` (§3)

Se añade un flag booleano nuevo, **required**:

```typescript
export interface PluginCapabilities {
  // ... flags existentes (has_sso_panel, panel_label, has_metrics, etc.) ...

  /**
   * Indica si el plugin gestiona zonas DNS authoritative (puede listar
   * y CRUD records de las zonas asociadas a sus services).
   *
   * Plugins con `has_dns_management=true` DEBEN soportar las 4 inline
   * actions canónicas en `executeAction()`:
   *   - 'list_dns_records'  → devuelve la lista completa de records de la zona.
   *   - 'add_dns_record'    → crea un record (payload validado vs schema).
   *   - 'update_dns_record' → modifica un record existente.
   *   - 'delete_dns_record' → elimina un record por ID.
   *
   * El orquestador `provisioning` invoca estas actions vía
   * `core/provisioning/dns-authority-resolver.ts` (ADR-082 §6) cuando
   * sirve `GET/POST/PATCH/DELETE /api/v1/services/{id}/dns/records`.
   *
   * Plugins con `has_dns_management=false` NO declaran esos slugs en
   * `inlineActions` — el resolver los excluye del routing.
   */
  has_dns_management: boolean;
}
```

#### A1.2. Mapping canónico actualizado (§3)

La tabla del §3 del ADR original se extiende con la columna `has_dns_management`:

| Plugin | has_sso_panel | has_metrics | has_metrics_history | requires_server | provision_mode | completes_via_task | supports_reconciliation | **has_dns_management** |
|---|---|---|---|---|---|---|---|---|
| `internal` | ❌ | ❌ | ❌ | ❌ | `sync` | ❌ | ❌ | **❌** |
| `manual` | ❌ | ❌ | ❌ | ❌ | `sync` | ✅ | ❌ | **❌** |
| `enhance_cp` (15C) | ✅ | ✅ | ❌ | ❌ | `sync` | ❌ | ✅ | **✅** |
| `cpanel_whm` (15C bis) | ✅ | ✅ | ❌ | ❌ | `sync` | ❌ | ✅ | **✅** (si Aelium opera DNS authority) |
| `resellerclub` (15D) | ❌ | ❌ | ❌ | ❌ | `sync` | ❌ | ✅ | **❌** (NS van a Aelium, RC no es authority) |
| `docker_engine` (15E) | ⚠ condicional | ✅ | ✅ | ✅ | `sync` | ❌ | ✅ | **❌** (delega a Enhance) |
| `plesk_obsidian` (15G) | ✅ | ✅ | ❌ | ❌ | `sync` | ❌ | ✅ | **⚠ por configuración** |

#### A1.3. Test contract genérico (§7) — invariantes nuevas

El test parametrizado (`backend/src/plugins/provisioners/plugin-contract.spec.ts`) se extiende con tres invariantes:

```typescript
it('declara has_dns_management como boolean', () => {
  expect(typeof plugin.capabilities.has_dns_management).toBe('boolean');
});

it('si has_dns_management=true → declara las 4 inline actions canónicas DNS', () => {
  if (plugin.capabilities.has_dns_management) {
    const slugs = plugin.inlineActions.map((a) => a.slug);
    for (const required of ['list_dns_records', 'add_dns_record', 'update_dns_record', 'delete_dns_record']) {
      expect(slugs).toContain(required);
    }
  }
});

it('si has_dns_management=false → NO declara las inline actions DNS', () => {
  if (!plugin.capabilities.has_dns_management) {
    const slugs = plugin.inlineActions.map((a) => a.slug);
    for (const dnsSlug of ['list_dns_records', 'add_dns_record', 'update_dns_record', 'delete_dns_record']) {
      expect(slugs).not.toContain(dnsSlug);
    }
  }
});
```

#### A1.4. Plugins existentes — actualización requerida

Sprint 15C Fase 15C.C aplica el cambio a los plugins triviales:

```typescript
// backend/src/plugins/provisioners/internal/internal.plugin.ts
readonly capabilities: PluginCapabilities = {
  has_sso_panel: false,
  has_metrics: false,
  has_metrics_history: false,
  requires_server: false,
  provision_mode: 'sync',
  completes_via_task: false,
  supports_reconciliation: false,
  has_dns_management: false,  // ← NUEVO Amendment A1
};

// backend/src/plugins/provisioners/manual/manual.plugin.ts — idem (false).
```

#### A1.5. Pipeline de wrappers (§5) — sin cambios

El flag `has_dns_management` se consume en el **orquestador** (`dns-authority-resolver`) y en el **frontend** (condicional de pestaña DNS), no en los wrappers cross-cutting `getServiceInfoWithCache` / `executeActionWithCacheInvalidation` / `getSsoUrlWithAudit`. Los wrappers existentes funcionan con las inline actions canónicas DNS sin modificación — son `executeAction(slug, payload)` igual que cualquier otra acción.

#### A1.6. Doctrina de adición de capability flags (refuerzo §3)

Este Amendment establece el **patrón canónico** para añadir capability flags futuros sin breaking change:

1. ADR específico (o transversal) que justifique el flag.
2. Amendment al ADR-077 con: tabla de mapping inicial + invariantes test contract + plugins existentes actualizados + pipeline impact analysis.
3. Compatible hacia atrás → NO bumpea `contractVersion`.
4. Test contract genérico ampliado en el mismo PR.
5. Frontend ramifica por el flag (NUNCA por slug — ADR-070 §"Cero `if (provisioner === 'X')`").

Cualquier flag que NO cumpla los 5 puntos requiere bump a `contractVersion: 'v3'` + ADR específico (§6 política de versionado).

---

### Amendment A2 (2026-05-08) — slug naming convention extendida (snake_case + kebab-case)

> **Justificado por:** Sprint 15C Fase 15C.C (PR #38). Implementación detectó que el regex efectivo del registry (`/^[a-z]+(-[a-z]+)*$/`, kebab-only) habría rechazado `enhance_cp` en boot — pese a que `enhance_cp` es el slug declarado por la doctrina canónica del proyecto desde Sprint 11 (ADR-021 §"Mapping productos → drivers", glossary §Provisioner) y desde Sprint 15A (ADR-080 §2 ejemplos `enhance_cp`/`docker_engine`/`cpanel_whm`).
> **Sprint:** 15C Fase 15C.C (review pre-merge).
> **Compatibilidad:** Hacia atrás. NO toca el comportamiento de plugins existentes — `internal` y `manual` siguen siendo válidos (cumplen ambos formatos por ser monoword). NO bumpea `contractVersion` — sigue `'v2'`. La invariante semántica del slug ("identificador canónico inmutable, único en el proceso") es idéntica.

#### A2.1. Cambio canónico en §6 política de versionado

El §6 declara que los plugins deben pasar el test contract genérico (§7), que a su vez declara la invariante slug-en-kebab-case. La invariante se reformula:

| Antes | Después |
|---|---|
| `slug` matches `/^[a-z]+(-[a-z]+)*$/` (kebab-case puro) | `slug` matches `/^[a-z][a-z0-9_-]*$/` (snake_case **o** kebab-case, debe empezar por letra minúscula) |

Plugins canónicos del proyecto y a qué formato corresponden:

| Slug | Formato | Origen |
|---|---|---|
| `internal` | monoword | Sprint 11 Fase 11.C |
| `manual` | monoword | Sprint 11 Fase 11.C |
| `enhance_cp` | snake_case | Sprint 15C — ADR-083, dossier 15C, glossary §Provisioner |
| `docker_engine` | snake_case | Sprint 15E (futuro) — ADR-080 §2 ejemplo, ROADMAP.md, glossary |
| `cpanel_whm` | snake_case | Sprint 15C bis (futuro) — ADR-080 §2 ejemplo |
| `plesk_obsidian` | snake_case | Sprint 15G (futuro) — ADR-077 §3 mapping |
| `claude_api` | snake_case | Sprint 15H (futuro) — `audit_change_log.integration_slug`, `integrations_registry.slug` |
| `resellerclub` | monoword | Sprint 15D (futuro) — dossier 15D, ADR-077 §3 mapping |
| `directadmin` | monoword | Sprint 15I (hipotético) — ADR-077 §3 mapping |

#### A2.2. Razón doctrinal — alinear regex con doctrina escrita

El proyecto adoptó snake_case como convención **de facto** para slugs multi-palabra desde el inicio de la cola P2:

1. **ADR-021** (Sprint 8 — provisioners) declaró el ejemplo `enhance_cp` en las tablas mapping productos→drivers.
2. **ADR-070** (2026-04-29) usa `enhance_cp` literal en su mapping de "Federated Server View".
3. **ADR-077** este ADR original — §3 tabla de mapping de capabilities lista `enhance_cp`, `docker_engine`, `cpanel_whm`, `plesk_obsidian` (todos snake_case).
4. **ADR-080 §2** (Sprint 15A) — `plugin_installs.slug` PK natural, ejemplos en docstring incluyen `enhance_cp`/`docker_engine`.
5. **ADR-082 §3** (Sprint 15C Fase A) — DNS-as-capability mapping enumera `enhance_cp` literal.
6. **ADR-083** (Sprint 15C Fase A) — slug canónico del plugin Enhance CP es `enhance_cp`.
7. **glossary.md §Provisioner / §"Driver"** — ejemplos `enhance_cp`, `docker_compose`.
8. **`audit_change_log.integration_slug`** ([docs/30-data/audit.md](../30-data/audit.md)) — ejemplos `stripe`, `resellerclub`, `enhance_cp`, `claude_api`.
9. **`integrations_registry.slug`** ([docs/30-data/system.md](../30-data/system.md)) — idéntico.
10. **ROADMAP.md / DECISIONS.md** — múltiples referencias a `enhance_cp` desde Sprint 8.

El regex kebab-only era un **bug pre-existente** del registry Sprint 11 Fase 11.B que NO había sido detectado porque los únicos plugins registrados eran `internal` y `manual` (monoword, ambos formatos pasan). El primer plugin con slug multi-palabra (`enhance_cp` Sprint 15C) lo expone.

Aceptar el bug y exigir kebab-case (`enhance-cp`) habría requerido tocar 10+ referencias canónicas en ADRs/glossary/data/seeds — churn doctrinal mayor que ampliar el regex. La doctrina escrita gana sobre la implementación accidental.

#### A2.3. Cambio canónico en `PluginRegistryService.tryValidate` (§5)

```typescript
// backend/src/core/provisioning/plugin-registry.ts
// Slug naming convention canónica (Sprint 11 + Sprint 15C Amendment A2):
// [a-z][a-z0-9_-]* — admite tanto kebab-case (`docker-engine`) como
// snake_case (`enhance_cp`, `resellerclub`). La doctrina del proyecto
// (ADR-018/021/070/077/080/082/083 + glossary) usa snake_case para
// plugins multi-palabra; el regex original kebab-only era un bug.
if (!/^[a-z][a-z0-9_-]*$/.test(plugin.slug)) {
  this.logger.error(
    `Plugin slug "${plugin.slug}" rejected: must match [a-z][a-z0-9_-]* ` +
      `(snake_case or kebab-case, starting with lowercase letter).`,
  );
  return;
}
```

#### A2.4. Test contract genérico (§7) — invariante actualizada

```typescript
// backend/src/plugins/provisioners/plugin-contract.spec.ts
const SLUG_NAMING = /^[a-z][a-z0-9_-]*$/;

it('declara slug en snake_case o kebab-case', () => {
  expect(plugin.slug).toMatch(SLUG_NAMING);
});
```

La constante anterior `KEBAB_CASE` se renombra a `SLUG_NAMING` para no perpetuar el nombre que sugiere kebab-only.

#### A2.5. Pipeline de wrappers (§5) — sin cambios

El slug se usa como clave en `Map<string, ProvisionerPlugin>` (`PluginRegistryService.activePlugins`) y como denormalizador en `services.provisioner_slug` + `plugin_installs.slug`. Ningún wrapper cross-cutting parsea el slug carácter a carácter — solo se compara igualdad de strings. La extensión del regex es transparente para el pipeline.

#### A2.6. Coherencia transversal post-amendment

Tras este amendment, las referencias inline a "kebab-case" en este ADR (§1 línea ~85, §2.5 línea ~283, §7 línea ~519) y en ADR-080 (§1 línea ~76, §2 línea ~151) deben leerse como **histórico** — la convención canónica es ahora `[a-z][a-z0-9_-]*` (snake_case o kebab-case). El cleanup textual de esas líneas se aplica en el PR #38 con cita a este amendment.

[`docs/30-data/plugin-installs.md`](../30-data/plugin-installs.md) §"Reglas de negocio" se actualiza al mismo tiempo (la invariante "`slug` ∈ kebab-case" pasa a "`slug` ∈ snake_case o kebab-case").

---

### Amendment A3 (2026-05-09) — campo opcional `adminOnly` en `ServiceAction`

> **Justificado por:** [ADR-083 Amendment A3](./adr-083-plugin-enhance-cp-specifics.md#amendments), donde `change_package`, `force_resync` y la nueva 10ª action `list_available_plans` se declararon admin-only. La decisión 32 original de ADR-083 §9 anotaba *"acciones admin (CASL `Subject.Service` + scope admin se verifica en wrapper, no en plugin)"* pero NO existía un mecanismo canónico de scope adminOnly en el contrato `ProvisionerPlugin` v2 — el rol cliente tiene `Action.Update` sobre `Subject.Service` (cf. [`backend/src/core/casl/permissions.ts:299-303`](../../backend/src/core/casl/permissions.ts#L299-L303)), por lo que cualquier cliente podía invocar `POST /services/:id/actions/change_package` sin filtro. **Vulnerabilidad de privilegio real** — la materialización exige formalizar el flag transversal en el contrato.
> **Sprint:** 15C Fase 15C.E (PR pendiente).
> **Compatibilidad:** Hacia atrás. NO bumpea `contractVersion` — sigue `'v2'`. El campo es **opcional** en `ServiceAction`. Plugins existentes que no lo declaran tienen comportamiento idéntico al actual (default `false` = client-callable). NO toca el shape de `ActionResult`. NO requiere migración de datos.

#### A3.1. Cambio canónico en `ServiceAction` (§3 shapes)

Se añade un campo opcional al shape canónico `ServiceAction`:

```typescript
export interface ServiceAction {
  // ... campos existentes (slug, label, description?, confirmRequired,
  //                       confirmationText?, destructive, payloadSchema?) ...

  /**
   * Si `true`, la acción solo puede ser invocada por usuarios con rol
   * admin (`superadmin` / `agent_full` / `agent_billing` / `agent_support`).
   * El wrapper `executeActionWithCacheInvalidation` la enforce con
   * HTTP 403 (ForbiddenException) + audit pesado + evento
   * `service.action_admin_only_violation` cuando un cliente la invoca.
   *
   * Default `false` (client-callable). Plugins existentes que no declaran
   * el campo conservan comportamiento previo.
   *
   * Frontend filtra `inlineActions` por rol: el cliente sólo ve acciones
   * con `adminOnly !== true`; admin ve todas.
   *
   * Semántica:
   *   - `adminOnly: true` → acción operacional admin (cambio de plan que
   *     requiere ajuste billing manual, force-resync diagnóstico, etc.).
   *   - `destructive: true` → acción que requiere confirmación visible
   *     (`confirmRequired: true`) por riesgo de pérdida de datos.
   *   - Las dos dimensiones son ortogonales: una acción puede ser
   *     `adminOnly` sin ser destructive (ej. `change_package`, sólo
   *     impacta billing), o destructive sin ser admin-only (ej.
   *     `delete_dns_record`, cliente puede borrar su propio record).
   */
  adminOnly?: boolean;
}
```

#### A3.2. Cambio canónico en wrapper `executeActionWithCacheInvalidation` (§5 pipeline)

El `ExecuteActionContext` añade un campo `actorIsAdmin` y el wrapper enforce el flag antes de invocar al plugin:

```typescript
export interface ExecuteActionContext {
  actorUserId: string;
  ipAddress: string;
  userAgent?: string | null;
  /** Sprint 15C Fase 15C.E — flag para enforcement de `ServiceAction.adminOnly`. */
  actorIsAdmin: boolean;
}

export async function executeActionWithCacheInvalidation(/* params canónicos */): Promise<ActionResult> {
  const declared = plugin.inlineActions.find((a) => a.slug === actionSlug);
  if (!declared) { /* return success=false (acción desconocida) */ }

  // Enforcement adminOnly (Amendment A3):
  if (declared.adminOnly && !ctx.actorIsAdmin) {
    await audit.logAccess({
      user_id: ctx.actorUserId,
      action: 'service.action_admin_only_violation',
      ip_address: ctx.ipAddress,
      user_agent: ctx.userAgent ?? null,
      resource: 'Service',
      metadata: {
        resource_id: service.id,
        provisioner_slug: plugin.slug,
        action_slug: actionSlug,
      },
    });
    events.emit('service.action_admin_only_violation', {
      service_id: service.id,
      user_id: service.user_id,
      actor_user_id: ctx.actorUserId,
      provisioner_slug: plugin.slug,
      action_slug: actionSlug,
      ip: ctx.ipAddress,
    });
    throw new ForbiddenException({
      code: 'ACTION_ADMIN_ONLY',
      message: 'This action requires admin role.',
      action_slug: actionSlug,
    });
  }

  // ... resto del pipeline canónico (circuit breaker, plugin.executeAction,
  //     cache invalidation, audit OK, evento `service.action_executed`) ...
}
```

#### A3.3. Test contract genérico (§7) — invariante nueva

```typescript
// backend/src/plugins/provisioners/plugin-contract.spec.ts
it('declara adminOnly como boolean | undefined en cada inline action', () => {
  for (const action of plugin.inlineActions) {
    if (action.adminOnly !== undefined) {
      expect(typeof action.adminOnly).toBe('boolean');
    }
  }
});
```

#### A3.4. Plugins existentes — sin actualización requerida

Los plugins triviales `internal` y `manual` no declaran `inlineActions` con `adminOnly` (no aplica — sus actions son cliente-callable). NO requieren cambios. El plugin `enhance_cp` aplica el flag a `change_package`, `force_resync` y `list_available_plans` en Sprint 15C Fase 15C.E ([ADR-083 Amendment A3](./adr-083-plugin-enhance-cp-specifics.md#amendments)).

#### A3.5. Frontend — ramificación canónica (patrón aspiracional)

> **Estado real al cierre de Sprint 15C Fase 15C.E**: el frontend hoy NO implementa este filter. El componente `frontend/app/_shared/services/ActionsBar.tsx` recibe `info.availableActions` y los renderiza todos sin discriminar por rol. Esto NO es un bug operativo — el backend enforce con HTTP 403 + audit + evento, así que un cliente que viera un botón admin-only solo recibiría 403 al pulsarlo (defense-in-depth funciona). Pero la UX correcta es ocultar el botón. **Materialización canónica del filter en Sprint 15C Fase 15C.E.2** (frontend acciones curadas — añadida al dossier §7 tras review riguroso 2026-05-09), junto con el form admin de productos extendido para `provisioner_config`. La página `/admin/services/[id]` (modal admin `change_package` operable) llega en **Fase 15C.J** (cierre real).

Patrón canónico para esa fase futura:

```typescript
// frontend: filtrar inline actions visibles según rol — PATRÓN ASPIRACIONAL
const visibleActions = serviceInfo.availableActions.filter(
  (a) => !a.adminOnly || currentUser.isAdmin
);
```

NUNCA por slug (mantiene la doctrina ADR-070 §"Cero `if (provisioner === 'X')`"). El campo `adminOnly` es **declarativo** — la UI lo respetará y el wrapper backend ya lo enforce como defense-in-depth (defensa profunda + audit pesado independientemente de que el frontend filtre o no).

#### A3.6. Doctrina de adición de campos opcionales a `ServiceAction`

Este Amendment establece el patrón canónico para añadir flags semánticos a `ServiceAction` sin breaking change:

1. ADR específico (o transversal) que justifique el campo nuevo.
2. Amendment al ADR-077 con: shape extendido + impacto en wrappers + invariante test contract + plugins existentes (typically sin cambios si el campo es opcional).
3. Compatible hacia atrás → NO bumpea `contractVersion`.
4. Frontend ramifica por el campo (NUNCA por slug).
5. Documentar en `provisioning/contract.md` §7 + `glossary.md` el término canónico.

Cualquier campo nuevo NO opcional o que rompa el shape requiere bump a `contractVersion: 'v3'` + ADR específico (§6 política de versionado).

---

### Amendment A4 (2026-05-10) — capability flag `supports_suspend`

> **Justificado por:** Audit pre Sprint 15C.II Hardening (gap G3). El plugin `enhance_cp` tiene `patchSubscription({ isSuspended: true|false })` operativo desde Sprint 15C Fase B (`EnhanceApiClient`), pero el manifest NO declara una capability para que el frontend sepa si el plugin soporta suspensión inline. Esto hace que la acción "Suspender servicio" no pueda ramificarse por capability flag (doctrina ADR-070 + §1.2 P6) y queda invisible al admin.
> **Compatibilidad:** Hacia atrás. NO bumpea `contractVersion` — sigue `'v2'`. Plugins existentes (`internal`, `manual`) declaran `supports_suspend: false`; `enhance_cp` lo declara `true`. Pasa a ser **required** en `PluginCapabilities` — el contract test (§7) lo enforza.
> **Aplicación:** Sprint 15C.II Fase F (admin overview operativo) consume el flag para mostrar/ocultar la acción "Suspender / Reactivar servicio" inline cuando aplica. Heredable a 15D ResellerClub (NO suspende dominios — `false`), 15E Docker Engine (`true` via `docker stop`), 15G Plesk (`true`).

#### A4.1. Shape extendido `PluginCapabilities`

```typescript
export interface PluginCapabilities {
  // ... flags existentes (has_sso_panel, panel_label, has_metrics, has_dns_management, etc.) ...

  /**
   * El plugin soporta suspender / reactivar el servicio sin desprovisionarlo.
   * Cuando `true`, el frontend admin puede ofrecer la acción inline "Suspender servicio" /
   * "Reactivar servicio" en `/admin/services/[id]` (ramificación por capability flag,
   * NUNCA por slug — doctrina ADR-070 §"Cero if(provisioner === 'X')").
   *
   * Plugins con `supports_suspend=true` DEBEN implementar `executeAction` para los slugs
   * `suspend_service` y `unsuspend_service` (idempotentes — invocar dos veces seguidas
   * no es error). El status canónico del service transiciona a `suspended` /
   * `active` respectivamente, emitiendo `service.suspended` / `service.unsuspended`.
   *
   * Plugins con `supports_suspend=false` NO declaran esos slugs en `inlineActions`.
   * El contract test (§7) verifica la consistencia bidireccional.
   */
  supports_suspend: boolean;
}
```

#### A4.2. Tabla actualizada (extiende §3 + Amendments A1, A2, A3)

| Plugin | has_sso_panel | has_metrics | has_dns_management | requires_server | provision_mode | supports_reconciliation | **supports_suspend** |
|---|---|---|---|---|---|---|---|
| `internal` | false | false | false | false | sync | false | **false** |
| `manual` | false | false | false | true | task-completed | false | **false** |
| `enhance_cp` | true | true | true | false | sync | true | **true** |
| `resellerclub` (15D) | true | false | false | false | sync | true | **false** |
| `docker_engine` (15E) | ⚠ template | true | false | true | sync | true | **true** |
| `plesk` (15G) | true | true | ⚠ TBD | true | sync | true | **true** |

#### A4.3. Test contract genérico

```typescript
it('declara supports_suspend como boolean', () => {
  expect(typeof plugin.capabilities.supports_suspend).toBe('boolean');
});

it('si supports_suspend=true → declara las 2 inline actions canónicas', () => {
  if (plugin.capabilities.supports_suspend) {
    const slugs = plugin.inlineActions.map((a) => a.slug);
    expect(slugs).toContain('suspend_service');
    expect(slugs).toContain('unsuspend_service');
  }
});

it('si supports_suspend=false → NO declara esas inline actions', () => {
  if (!plugin.capabilities.supports_suspend) {
    const slugs = plugin.inlineActions.map((a) => a.slug);
    expect(slugs).not.toContain('suspend_service');
    expect(slugs).not.toContain('unsuspend_service');
  }
});
```

#### A4.4. Doctrina

- **Idempotencia obligatoria:** `suspend_service` invocado sobre un service ya suspendido retorna `{ success: true }` con `data.alreadySuspended = true` (NO error). Aplica simétricamente a `unsuspend_service`. **Materialización Fase F.1 (ver A4.5):** el guard de idempotencia vive en el **orquestador** (`ProvisioningService.suspendAsAdmin` corta antes de invocar al plugin si `services.status === 'suspended'` y retorna `alreadySuspended: true`) — el plugin no necesita re-consultar el estado del proveedor en el caso normal.
- **Eventos canónicos:** `service.suspended` / `service.unsuspended` emitidos por el orquestador (`ProvisioningService.suspendAsAdmin` / `unsuspendAsAdmin`) post-action exitosa, NUNCA por el plugin (regla R8 audit centralizado).
- **Permisos:** ambas actions DEBEN declarar `adminOnly: true` (Amendment A3) — la suspensión es una operación administrativa, NO cliente self-service. Defense-in-depth: backend wrapper enforce 403 + audit + emite `service.action_admin_only_violation`. Además, el path genérico `executeActionForUser` rechaza estos 2 slugs con `ForbiddenException(USE_DEDICATED_SUSPEND_ENDPOINT)` — la suspensión transiciona `services.status` y exige el motivo canónico del DTO, así que el camino sancionado es el endpoint dedicado.
- **Diferencia con `deprovision`:** `deprovision` destruye recursos en el proveedor (irreversible para el cliente sin re-provision). `suspend_service` preserva los datos en el proveedor — solo desactiva el acceso. Crítico para no-pago temporal vs cancelación definitiva.

#### A4.5. Materialización (Sprint 15C.II Fase F.1, 2026-05-12)

> **Reconciliación con el dossier §A.9.6.1:** el apuntado expandido del dossier (2026-05-10) proponía métodos dedicados del contrato `suspendService`/`unsuspendService` + wrappers `suspendServiceWithAudit`/`unsuspendServiceWithAudit` + `reason: string` libre. **Gana el ADR (este Amendment A4.4 estaba frozen):** se materializa como **inline actions** `suspend_service`/`unsuspend_service` (NO métodos dedicados del contrato — eso habría sido un cambio breaking del shape `ProvisionerPlugin`) + se mejora el motivo a un **enum canónico** `SuspensionReason` (no string libre — más robusto: i18n-limpio, analytics-limpio, defendible legalmente; coherente con la doctrina L13 "la UI/comms ramifican por contrato, no por display strings").

- **Contrato (`core/provisioning/types.ts`):** `PluginCapabilities.supports_suspend: boolean` (required) + `export type SuspensionReason = 'overdue_payment' | 'abuse_investigation' | 'scheduled_maintenance' | 'gdpr_restriction' | 'other'` — taxonomía **cliente-segura** (la UI muestra la etiqueta localizada `service.suspension_reason.<reason>`, NUNCA la nota interna del admin). El plugin recibe `executeAction('suspend_service', { reason })` por si su API de proveedor lo acepta (Enhance no lo usa — `patchSubscription({ isSuspended })` no tiene campo motivo).
- **Plugin Enhance:** `supports_suspend: true` + las 2 inline actions + `actionSuspendService`/`actionUnsuspendService` (vía `patchSubscription({ isSuspended })`, operativo desde Sprint 15C Fase B) + `filterActionsByStatus` (`suspend_service` ⇔ `active`, `unsuspend_service` ⇔ `suspended`) + `getServiceInfo` statusReason i18n key `plugin.enhance_cp.status_reason.suspended` para subscriptions suspendidas (no expone el member ID del operador Enhance — el motivo real lo ve el admin en el banner Aelium-side).
- **Orquestador (`ProvisioningService`):** `suspendAsAdmin(serviceId, dto, actorUserId, ctx)` / `unsuspendAsAdmin(serviceId, actorUserId, ctx)` — load+guard estado (idempotente; 409 `SERVICE_NOT_SUSPENDABLE`/`SERVICE_NOT_SUSPENDED` si el estado no lo permite, 409 `SUSPEND_NOT_SUPPORTED` si `!capabilities.supports_suspend`) → `executeActionWithCacheInvalidation` con el slug canónico (breaker + cache invalidate + audit `service.action_executed:<slug>` + enforcement adminOnly) → `prisma.service.update` (`status`, `suspended_at`, `suspension_reason` combinado `"<reason>: <internal_note>"` igual que `cancellation_reason`) → re-invalida cache → emite `service.suspended`/`service.unsuspended` → audit `logChange` + `logAccess`. `getInfoForUser` expone `suspended_at`/`suspension_reason` en el summary; `adminServiceSummarySelect` los incluye en el listado. Diseñado para ser invocable internamente por el futuro cron billing `billing-suspend-on-overdue` (Sprint 8 Fase 8.1).
- **REST + notifications:** DTO `SuspendServiceDto` (`{ reason, internal_note?, notify_client? }`) + endpoints `POST /admin/services/:id/suspend|unsuspend` (triple guard, `Action.Update` sobre `Subject.Service`). Listeners `notifications-on-service-suspended`/`-unsuspended` (patrón L11+L12, degradación elegante R7) + 4 plantillas seedeadas `service.suspended`/`service.unsuspended` (email + campana; el email ramifica el CTA por motivo: regulariza pago / soporte / nada para mantenimiento; NUNCA incluye la nota interna).
- **Frontend admin:** `SuspendServiceModal` (`mode: 'suspend' | 'unsuspend'` — suspend con AlertBanner warning + Select motivo + Textarea nota + toggle notificar, SIN typing-confirm porque es reversible; unsuspend confirmación simple) + botones "Suspender servicio…"/"Reanudar servicio" en `AdminServiceOperationsCard` (ramifica por la presencia de las inline actions en `availableActions`, no por slug) + banner amarillo "Servicio suspendido" en `/admin/services/[id]` + `suspend_service`/`unsuspend_service` en `INTERNAL_HELPER_SLUGS` del `ActionsBar`.
- **Tabla A4.2 actualizada:** sin cambios — `enhance_cp` ya estaba marcado `supports_suspend: true`; `internal`/`manual` `false`; `resellerclub` (15D) `false`; `docker_engine` (15E) y `plesk` (15G) `true`.

---

### Amendment A5 (2026-05-11) — campo opcional `recoveryHint` en `ServiceInfo`

> **Justificado por:** Sprint 15C.II Fase E (BUG-15CII-I — smoke real Yasmin Fase D 2026-05-10) + [ADR-083 Amendment A5](./adr-083-plugin-enhance-cp-specifics.md#amendments). El detalle admin de servicio (`/admin/services/[id]`) gateaba el CTA "Re-aprovisionar ahora" del `AdminDriftBanner` por una heurística de string (`info.statusReason.endsWith('.status_reason.not_yet_provisioned')`). El smoke real detectó que `subscription_missing` (recurso borrado externamente del proveedor) requiere IDÉNTICA acción admin pero NO activaba el CTA. El fix "1 línea" propuesto en el dossier §A.9.4 (un `Set` de claves i18n hardcodeado en el frontend) traslada el problema: cada plugin SaaS futuro (15D RC, 15E Docker, 15G Plesk) tendría que recordar añadir sus claves a una lista que vive en otro paquete. La solución robusta es que el **plugin clasifique su propio drift** y la UI ramifique por un campo declarativo del contrato, NUNCA por matching de strings.
> **Sprint:** 15C.II Fase E (PR pendiente).
> **Compatibilidad:** Hacia atrás. NO bumpea `contractVersion` — sigue `'v2'`. El campo es **opcional** en `ServiceInfo`. Plugins existentes que no lo declaran tienen comportamiento idéntico al actual (el frontend trata `recoveryHint` ausente como "sin acción de recuperación canónica"). NO toca ningún otro shape. NO requiere migración de datos.

#### A5.1. Cambio canónico en `ServiceInfo` (§2 shapes — `getServiceInfo()` output)

Se añade un tipo enum + un campo opcional al shape canónico `ServiceInfo`:

```typescript
/**
 * Pista de recuperación canónica que el plugin emite cuando reporta un
 * `status` ∈ {`unknown`, `failed`} (drift / proveedor inaccesible). La
 * UI ramifica por este valor para ofrecer el CTA de remediación correcto
 * — NUNCA matchea `statusReason` por string (ese es i18n display, no
 * contrato de comportamiento).
 *
 *   - `'reprovision'`     → el recurso no existe en el proveedor (nunca se
 *                            creó, o se borró externamente). Remediación:
 *                            `POST /admin/services/:id/reprovision`
 *                            (re-ejecuta `plugin.provision()` steps 1-N).
 *                            Caso enhance_cp: `not_yet_provisioned`,
 *                            `subscription_missing`.
 *   - `'reconcile'`       → el recurso existe pero la metadata local
 *                            divergió (plan, refs, etc.). Remediación:
 *                            reconciliación single-shot del plugin (cron L3
 *                            manual) que re-lee el ground truth del
 *                            proveedor y actualiza Aelium (DH-INV-6).
 *   - `'contact_support'` → drift no auto-remediable por el admin (estado
 *                            del proveedor incoherente, requiere
 *                            intervención manual fuera de Aelium). La UI
 *                            no ofrece CTA accionable, solo el statusReason
 *                            técnico (admin) o el mensaje genérico (cliente).
 *
 * Extensible: futuras clases de remediación se añaden a esta unión + se
 * documentan aquí + el frontend las ramifica explícitamente (`AdminDriftBanner`).
 */
export type ServiceRecoveryHint = 'reprovision' | 'reconcile' | 'contact_support';

export interface ServiceInfo {
  // ... campos existentes (status, statusReason?, display, metrics?,
  //                        capabilities, availableActions, fetchedAt) ...

  /**
   * Solo relevante cuando `status` ∈ {`unknown`, `failed`}. Si presente,
   * indica la clase de remediación canónica que la UI debe ofrecer al
   * admin. Si ausente (incluyendo cuando `status === 'active'`), la UI no
   * ofrece CTA de recuperación. Ver `ServiceRecoveryHint`.
   */
  recoveryHint?: ServiceRecoveryHint;
}
```

#### A5.2. Impacto en wrappers (§5 pipeline) — passthrough transparente

`getServiceInfoWithCache` (`core/provisioning/plugin-utils.ts`) cachea/devuelve el `ServiceInfo` completo tal cual lo retorna el plugin — `recoveryHint` viaja en el mismo objeto serializado a Redis sin tratamiento especial. La rama de fallback del wrapper (cuando el plugin lanza o el circuit está open → devuelve un `ServiceInfo` sintético con `status: 'unknown'` + `statusReason: 'service.status_reason.plugin_not_registered'` o equivalente) declara `recoveryHint: 'contact_support'` (no es algo que el admin pueda re-aprovisionar — el plugin ni siquiera respondió). Ningún otro wrapper se ve afectado.

#### A5.3. Test contract genérico (§7) — invariante nueva

```typescript
// backend/src/plugins/provisioners/plugin-contract.spec.ts
it('declara recoveryHint como ServiceRecoveryHint | undefined en getServiceInfo()', async () => {
  const info = await plugin.getServiceInfo(syntheticService);
  if (info.recoveryHint !== undefined) {
    expect(['reprovision', 'reconcile', 'contact_support']).toContain(info.recoveryHint);
  }
  // Invariante de consistencia: si el plugin emite recoveryHint, el status
  // debe ser uno de los estados de drift (no tiene sentido sobre `active`).
  if (info.recoveryHint !== undefined) {
    expect(['unknown', 'failed', 'suspended', 'expired']).toContain(info.status);
  }
});
```

#### A5.4. Frontend — ramificación canónica

```typescript
// admin/services/[id]/page.tsx — gateado por el contrato, NO por strings:
const showReprovision = isDrift && info.recoveryHint === 'reprovision';

// AdminDriftBanner.tsx — preparado para ramificar todas las clases:
//   'reprovision'     → botón "Re-aprovisionar ahora"
//   'reconcile'       → botón "Reconciliar contra el proveedor" (cron L3 manual)
//   'contact_support' → sin CTA accionable, solo statusReason técnico
```

NUNCA por slug ni por `statusReason.endsWith(...)` (mantiene ADR-070 §"Cero `if (provisioner === 'X')`" + desacopla display i18n de comportamiento). El campo `recoveryHint` es **declarativo** — la UI lo respeta; el plugin es la única autoridad sobre qué drift es recuperable y cómo.

#### A5.5. Plugins existentes — actualización

- `internal`, `manual`: `getServiceInfo()` nunca reporta drift (status siempre `active`) → no declaran `recoveryHint`. Sin cambios.
- `enhance_cp` (Sprint 15C.II Fase E): `getServiceInfo()` mapea su lógica de drift a `recoveryHint` ([ADR-083 Amendment A5](./adr-083-plugin-enhance-cp-specifics.md#amendments)): `not_yet_provisioned` / `subscription_missing` → `'reprovision'`; `plan_divergence` / drift de refs → `'reconcile'`; resto de estados incoherentes → `'contact_support'`.
- Plugins futuros (15D/15E/15G): heredan el patrón — clasifican su drift al implementar `getServiceInfo()`.

#### A5.6. Doctrina de adición de campos opcionales a `ServiceInfo` (refuerzo §3 + Amendment A3.6)

Mismo patrón canónico que `ServiceAction.adminOnly` (Amendment A3.6) y `ServiceAction.allowsSensitiveDataInAudit` (Amendment A4.5): ADR justificante → Amendment ADR-077 con shape + impacto wrappers + invariante test contract + plugins existentes → compatible hacia atrás (NO bumpea `contractVersion`) → frontend ramifica por el campo (NUNCA por slug ni por display strings) → documentar en `provisioning/contract.md` §"shapes" + `glossary.md`.

---

### Amendment A6 (2026-05-12) — método opcional `testConnection?()` + campo opcional `module?` en `ProvisionerPluginError` (Sprint 15C.II Fase F.3)

> **Justificado por:** Sprint 15C.II Fase F.3 (GAP-15CII-G8 + GAP-15CII-N) + [ADR-083 Amendment A7](./adr-083-plugin-enhance-cp-specifics.md#amendments). (a) **G8** — el botón "Probar conexión" del admin ([ADR-080 §3/§7](./adr-080-plugin-framework.md)) tenía dos modos: `testConnectionMethod === 'getStatus'` (invoca `plugin.getStatus(servicioSintético)`) y `'custom'` (sin mecanismo de contrato — no había forma de implementarlo). El modo `'getStatus'` no sirve para plugins cuyo `getStatus()` exige `provider_reference` real (Enhance): un servicio sintético siempre reporta "sin metadata" → falso negativo. La solución correcta es un **probe dedicado** contra el proveedor, lo que requiere un método de contrato. (b) **N** — `ProvisionerPluginError` no llevaba el módulo de origen → `GlobalExceptionFilter` registraba `error_log.module = 'http'` (inútil para triage) en vez del módulo real (`provisioning.<slug>`).
> **Sprint:** 15C.II Fase F.3 (PR pendiente).
> **Compatibilidad:** Hacia atrás. NO bumpea `contractVersion` — sigue `'v2'`. Método **opcional** (`testConnection?()`) — plugins existentes que no lo declaran conservan comportamiento previo. Campo **opcional** (`ProvisionerPluginError.module?`) — el wrapper lo setea; los consumidores que no lo leen no se ven afectados. NO toca ningún otro shape. NO requiere migración.

#### A6.1. Método opcional `testConnection?()` en `ProvisionerPlugin` (§1 interfaz)

Se añade un **7º método, opcional**, a la interfaz canónica `ProvisionerPlugin` (los 6 obligatorios — `provision`, `deprovision`, `getStatus`, `getServiceInfo`, `getSsoUrl`, `executeAction` — no cambian):

```typescript
export interface ProvisionerPlugin {
  // ... slug, contractVersion, capabilities, inlineActions, manifest,
  //     provision, deprovision, getStatus, getServiceInfo, getSsoUrl, executeAction ...

  /**
   * Probe ligero de conectividad/credenciales contra el proveedor — invocado
   * por el admin desde "Probar conexión" (`POST /admin/plugins/:slug/test-connection`).
   *
   * OBLIGATORIO si `manifest.testConnectionMethod === 'custom'` (ver
   * [ADR-080 §3](./adr-080-plugin-framework.md)). Para `'getStatus'` o `null`
   * el plugin no lo implementa (el framework usa el path sintético / 400).
   *
   * Contrato del probe:
   *   - Usa las credenciales configuradas del plugin (secret vault).
   *   - NO opera sobre ningún servicio (no recibe `service`).
   *   - SIN side-effects (read-only contra el proveedor).
   *   - Captura sus propios errores y los traduce a `{ ok: false, message }`
   *     — NUNCA lanza (el framework no envuelve esto en try/catch defensivo
   *     más allá de un guard genérico).
   */
  testConnection?(): Promise<{ ok: boolean; message: string }>;
}
```

`AdminPluginsService.testConnection`: rama `'custom'` → invoca `plugin.testConnection()` (devuelve `400` si el manifest lo declara pero el plugin no lo implementa — bug de wiring del plugin); rama `'getStatus'` → servicio sintético `buildSyntheticService(...)` ahora con `metadata: {}` defensivo (ningún plugin que lea `service.metadata` en `getStatus` debe romper ante el sintético); `testConnectionMethod === null` ⇒ `400`. Invariante del test contract genérico (§7): `manifest.testConnectionMethod === 'custom'` ⇒ `typeof plugin.testConnection === 'function'`.

#### A6.2. Campo opcional `module?` en `ProvisionerPluginError` (§"errores semánticos" — R7)

`ProvisionerPluginError` gana un campo **mutable opcional** `module?: string`. Los plugins lanzan `new ProvisionerPluginError(message, code, retriable)` **sin** conocer su contexto de invocación; el wrapper cross-cutting que sí sabe el slug (`getServiceInfoWithCache`, §5) lo setea antes de re-lanzar: `err.module ??= 'provisioning.<slug>'`. `GlobalExceptionFilter.resolveErrorModule(exception)` recorre el error y su cadena `cause` (máx. 5 niveles, defensivo contra ciclos) buscando el primer `module` string — **duck-typed**: el filtro NO importa `ProvisionerPluginError`, sigue genérico — y lo registra en `error_log.module`. Scope: solo el path HTTP (`getServiceInfo` re-lanza al filtro; `executeAction`/`getSsoUrl` swallow; los jobs BullMQ del orquestador no pasan por el filtro HTTP).

#### A6.3. Plugins existentes — actualización

- `internal`, `manual`: `testConnectionMethod` sigue `'getStatus'` (o `null`) → no implementan `testConnection()`. Sin cambios.
- `enhance_cp` (Sprint 15C.II Fase F.3): `testConnectionMethod` `'getStatus'` → `'custom'` + `testConnection()` = probe canónico de [ADR-083 §1 dec.5 / Amendment A7.3](./adr-083-plugin-enhance-cp-specifics.md#amendments) (`GET /version` vivo + `GET /orgs/{masterOrgId}` token válido + RBAC del master org).
- Plugins futuros (15D/15E/15G): si su `getStatus()` necesita `provider_reference` real, declaran `testConnectionMethod: 'custom'` + implementan `testConnection()` (probe sin servicio). Si su `getStatus()` funciona sin metadata, pueden quedarse en `'getStatus'`.

#### A6.4. Nota — `manifest.serviceInfoCacheTtlSeconds?` (GAP-15CII-G4)

F.3 también añadió un campo opcional al **manifest** (`PluginManifest.serviceInfoCacheTtlSeconds?`) — vive en [ADR-080 Amendment C](./adr-080-plugin-framework.md#amendments) (es manifest, no contrato). Relevante aquí solo porque el TTL resultante lo consume `getServiceInfoWithCache` (§5) vía `ProvisioningService.resolveServiceInfoTtl(plugin)` con precedencia `manifest > setting global > 60s` y *sanity floor* 5s en runtime.
