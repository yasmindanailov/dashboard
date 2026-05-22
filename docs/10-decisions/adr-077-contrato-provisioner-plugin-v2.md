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
> **Sprint:** 15C Fase 15C.E (mergeado).
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
> **Sprint:** 15C.II Fase E (mergeado).
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
> **Sprint:** 15C.II Fase F.3 (mergeado).
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

---

### Amendment A7 (2026-05-13) — campo opcional `ssl?` en `ServiceInfo` (Sprint 15C.II Fase F.7)

> **Justificado por:** Sprint 15C.II Fase F.7 + [ADR-083 Amendment A8](./adr-083-plugin-enhance-cp-specifics.md#amendments). `/dashboard/services/[id]` y `/admin/services/[id]` no exponen hoy el estado del certificado SSL/TLS del sitio — un dato que cualquier panel reseller profesional muestra junto a las métricas (el cliente necesita saber si su sitio aparecerá como "No seguro" en el navegador; el admin necesita anticipar renovaciones de los certs custom que no auto-renuevan). La doctrina **DH-INV-6** ([ADR-082](./adr-082-modelo-domain-hosting-dns-doctrine.md)) prohíbe que Aelium **gestione** el cert — pero NO prohíbe **leerlo** y exponer el estado al usuario; la gestión real (renovar, reemplazar, configurar `force_https`) sigue viviendo en el panel del proveedor vía SSO.
> **Sprint:** 15C.II Fase F.7 (mergeado).
> **Compatibilidad:** Hacia atrás. NO bumpea `contractVersion` — sigue `'v2'`. El campo es **opcional** en `ServiceInfo`. Plugins existentes que no lo declaran tienen comportamiento idéntico al actual (el frontend trata `ssl` ausente como "el plugin no expone el estado del cert" → no card). Mismo patrón canónico que `metrics?` y `recoveryHint?` (Amendment A5). NO toca ningún otro shape. NO requiere migración de datos.

#### A7.1. Cambio canónico en `ServiceInfo` (§2 shapes — `getServiceInfo()` output)

Se añade un tipo enum + un sub-shape + un campo opcional al shape canónico `ServiceInfo`:

```typescript
/**
 * Estado canónico del certificado SSL/TLS del recurso. La UI ramifica por
 * este valor (NUNCA por matching de strings sobre `issuer` o por aritmética
 * de fechas en cliente — eso vive server-side, ver A7.4).
 *
 *   - `'valid'`          → cert presente, expira en > 14 días naturales.
 *   - `'expiring_soon'`  → cert presente, expira en ≤ 14 días pero todavía
 *                            no expirado. Aviso ámbar al usuario; el plugin
 *                            puede declarar `autoRenew: true` para señalar
 *                            que el proveedor renovará a tiempo (LetsEncrypt).
 *   - `'expired'`        → cert presente pero `expiresAt <= now`. Aviso rojo
 *                            — el sitio aparecerá como "No seguro" en
 *                            navegadores hasta que se renueve.
 *   - `'none'`           → no hay cert configurado para el dominio (caso
 *                            de dominios añadidos antes de issuance, tras
 *                            revocación, o sitios servidos solo por HTTP).
 *                            Aviso gris informativo + CTA SSO al panel.
 *
 * Extensible: futuras clases (p.ej. `'invalid_chain'`, `'self_signed'`,
 * `'untrusted_root'`) se añaden a esta unión + se documentan aquí + el
 * frontend las ramifica explícitamente. El plugin es la única autoridad
 * sobre el estado — el cálculo (comparación de fechas + heurística de
 * auto-renew) vive **server-side** (en el plugin), NUNCA en el frontend.
 */
export type ServiceSslStatus = 'valid' | 'expiring_soon' | 'expired' | 'none';

/**
 * Sub-shape del campo opcional `ServiceInfo.ssl?`. Read-only — Aelium no
 * gestiona el cert (DH-INV-6 — el proveedor es authoritative); este shape
 * existe solo para que la UI exponga el estado al cliente / admin.
 */
export interface ServiceSslSummary {
  /** Estado canónico — ver `ServiceSslStatus`. */
  status: ServiceSslStatus;

  /**
   * ISO-8601. Solo presente cuando `status` ∈ {`valid`, `expiring_soon`,
   * `expired`} (en `none` no hay cert, no hay fecha). El frontend lo
   * renderiza como "expira en X días" (formato relativo); admin puede
   * mostrar la fecha exacta en tooltip.
   */
  expiresAt?: string;

  /**
   * Si el proveedor renueva el cert automáticamente (típico LetsEncrypt) o
   * lo dejó manual (custom upload del cliente). `undefined` si el plugin
   * no puede determinarlo. El frontend renderiza la línea "renovación
   * automática: sí/no" solo si el valor está definido (no inventa "no").
   */
  autoRenew?: boolean;

  /**
   * Emisor del cert ("Let's Encrypt Authority X3", "DigiCert", "ZeroSSL"…).
   * Display-only — la UI lo muestra como texto. El frontend NUNCA ramifica
   * comportamiento por este valor (eso lo hace `status` + `autoRenew`); el
   * plugin sí puede usarlo internamente para derivar `autoRenew` (ver A7.4).
   */
  issuer?: string;
}

export interface ServiceInfo {
  // ... campos existentes (status, statusReason?, recoveryHint?, display,
  //                        metrics?, capabilities, availableActions, fetchedAt) ...

  /**
   * Solo presente si el plugin puede leer el estado del cert SSL/TLS del
   * recurso. Si ausente (incluyendo cuando el plugin sabe leerlo pero la
   * lectura falló o devolvió datos parciales/ilegibles), la UI no
   * renderiza la card SSL. Ver `ServiceSslSummary`.
   *
   * La presencia del campo es la **señal de capability** — no se añade un
   * flag nuevo a `PluginCapabilities` (mismo patrón que `metrics?` y
   * `recoveryHint?`, Amendments A5).
   */
  ssl?: ServiceSslSummary;
}
```

#### A7.2. Impacto en wrappers (§5 pipeline) — passthrough transparente

`getServiceInfoWithCache` (`core/provisioning/plugin-utils.ts`) cachea/devuelve el `ServiceInfo` completo tal cual lo retorna el plugin — `ssl` viaja en el mismo objeto serializado a Redis sin tratamiento especial. La rama de fallback del wrapper (plugin lanza / circuit open → `ServiceInfo` sintético con `status: 'unknown'`) **no** declara `ssl` (no es algo que podamos saber sin contactar al proveedor — coherente con el patrón de no fabricar datos en fallback; mismo criterio que `metrics` y `recoveryHint`). Ningún otro wrapper se ve afectado.

#### A7.3. Test contract genérico (§7) — invariante nueva

```typescript
// backend/src/plugins/provisioners/plugin-contract.spec.ts
it('declara ssl como ServiceSslSummary | undefined en getServiceInfo()', async () => {
  const info = await plugin.getServiceInfo(syntheticService);
  if (info.ssl !== undefined) {
    expect(['valid', 'expiring_soon', 'expired', 'none']).toContain(info.ssl.status);
    if (info.ssl.expiresAt !== undefined) {
      expect(() => new Date(info.ssl!.expiresAt!).toISOString()).not.toThrow();
    }
    // Invariante de consistencia: status='none' implica no hay cert →
    // no hay fecha de expiración.
    if (info.ssl.status === 'none') {
      expect(info.ssl.expiresAt).toBeUndefined();
    }
  }
});
```

Plugins que no expongan SSL omiten el campo — el test no falla (es opcional). Como `getServiceInfo()` con `syntheticService` puede no llegar a contactar al proveedor (plugins sin metadata válida devuelven `ssl: undefined`), el test es robusto en modo `'static-only'` (`enhance_cp`) — la invariante solo aprieta cuando el plugin elige exponerlo.

#### A7.4. Umbral canónico de `expiring_soon` (decisión)

El umbral entre `valid` y `expiring_soon` es **fijo: 14 días naturales** antes de `expiresAt`. Razón:

- **Industry standard.** Let's Encrypt y la mayoría de ACME emiten certs de 90 días con auto-renovación 30 días antes; un umbral de 14d da ~2 semanas de aviso antes de cualquier expiración real (LE no debería llegar nunca a `expiring_soon` salvo fallo de renovación — útil precisamente para detectar esos fallos).
- **NO setting per-plugin.** Introducir un setting `provisioning.<plugin>.ssl_expiring_soon_days` complica el contrato sin caso de uso real (YAGNI). Si un plugin necesita un umbral distinto en el futuro, se promueve a setting con su propio Amendment.
- **Cálculo server-side.** El plugin compara `expires` vs `now` y decide el `status` — el frontend NUNCA hace aritmética de fechas (evita races UTC/local + permite tests deterministas con `MockDate`).

#### A7.5. Frontend — ramificación canónica

```typescript
// _shared/services/SslStatusCard.tsx — gateado por el contrato, NO por strings:
if (!info.ssl) return null;  // capability-driven (ADR-070)

const badgeVariant =
  info.ssl.status === 'valid' ? 'success' :
  info.ssl.status === 'expiring_soon' ? 'warning' :
  info.ssl.status === 'expired' ? 'destructive' :
  'neutral';  // 'none'
```

NUNCA por `issuer.includes("Let's Encrypt")` ni por matching de strings en `statusReason` (mantiene ADR-070 §"Cero `if (provisioner === 'X')`" + Amendment A5.4). El card vive en `frontend/app/_shared/services/` con prop `isAdmin?: boolean` — cliente y admin renderizan el mismo card (L16 — no duplicación); admin gana solo extras display-only (fecha exacta en `title` del badge + CTA "Gestionar SSL en el panel del proveedor" — SSO al panel del proveedor, coherente con DH-INV-6).

#### A7.6. Plugins existentes — actualización

- `internal`, `manual`: `getServiceInfo()` no expone SSL (concepto no aplicable a estos plugins) → no declaran `ssl`. Sin cambios.
- `enhance_cp` (Sprint 15C.II Fase F.7): `getServiceInfo()` lee el cert del primary domain del website vía `EnhanceApiClient.getDomainSsl(domainId)` (precedido de `getWebsite(orgId, websiteId)` para obtener `domain.id`) y mapea a `ssl` ([ADR-083 Amendment A8](./adr-083-plugin-enhance-cp-specifics.md#amendments)).
- Plugins futuros (15D RC, 15E Docker, 15G Plesk): heredan el patrón — si su API expone el cert, poblan `ssl` en `getServiceInfo()`; si no, lo omiten.

#### A7.7. Doctrina de adición de campos opcionales a `ServiceInfo` (refuerzo §3 + Amendments A3.6/A5.6)

Mismo patrón canónico que `ServiceAction.adminOnly` (A3.6), `ServiceInfo.recoveryHint?` (A5.6) y `ServiceAction.allowsSensitiveDataInAudit` (A4.5): ADR justificante → Amendment ADR-077 con shape + impacto wrappers + invariante test contract + plugins existentes → compatible hacia atrás (NO bumpea `contractVersion`) → frontend ramifica por el campo (NUNCA por slug ni por display strings) → cálculo server-side (no aritmética en el frontend) → documentar en `provisioning/contract.md` §"shapes" + `glossary.md`.

---

### Amendment A8 (2026-05-16) — método opcional `reconcileOne?(service)` + shapes `ServiceReconcileResult`/`ServiceDrift` + nuevo `ProvisionerErrorCode.RECONCILE_ONE_NOT_SUPPORTED` (Sprint 15C.II Fase F.9)

**Contexto.** Sprint 15C.II Fase F.9 — cierre del cabo de F.3: el CTA "Reconciliar contra el proveedor" del `AdminDriftBanner` (cuando `info.recoveryHint === 'reconcile'`) y las filas drift de `<PluginOperationalOverview>` (F.2) necesitan disparar una reconciliación per-servicio (single-shot, no reconcile-all). Hoy el cron L3 (`ReconcileRegistryService.reconcileAll`) recorre todos los services del plugin cada 6h — sin endpoint admin que reconcilia uno solo, el CTA del banner linka a la página de settings del plugin (placeholder F.3). DC.45 promovido del backlog en el re-plan §A.11.10. Dossier §A.11.10.6 + refinamiento §A.11.10.6.2 R1..R6 frozen + Amendment naming clash (commit `d3be27b` 2026-05-16).

> **Compatibilidad:** Hacia atrás. NO bumpea `contractVersion` — sigue `'v2'`. El método es **opcional** en `ProvisionerPlugin` (capability-driven por presencia). Plugins existentes que no lo declaran → endpoint admin responde `400 RECONCILE_ONE_NOT_SUPPORTED` y el frontend gatea el CTA preventivamente vía capability del admin overview (F.2). Mismo patrón canónico que A6 `testConnection?()` y A7 `ServiceInfo.ssl?`. NO toca ningún otro shape ni capability flag existente.

#### A8.1. Motivación

Tres razones convergentes a 2026-05-16:

1. **Cierre del cabo de F.3 — CTA "Reconciliar" sin endpoint single-shot.** F.3 introdujo `AdminDriftBanner` con `info.recoveryHint === 'reconcile'` que hoy linka a settings del plugin (reconcile-all) — semánticamente incorrecto cuando solo hay un service en drift y el admin quiere arreglarlo puntualmente. F.9 cierra el gap con endpoint admin `POST /admin/services/:id/reconcile` que delega al método opcional `reconcileOne?()` del plugin.

2. **Patrón heredable a plugins futuros.** 15D RC (ResellerClub), 15E Docker, 15G Plesk tendrán sus propios crons de reconcile y necesitarán también el endpoint single-shot. Tener el método en el contrato canónico (en vez de duplicar lógica plugin-internal) garantiza UX uniforme + reduce blast radius del orquestador genérico (`ProvisioningService.reconcileServiceAsAdmin` cubre todos los plugins).

3. **Doctrina DH-INV-6 + F.4 A1 preservada.** El cron L3 ya respeta el principio "lifecycle administrativo vs operacional" — solo auto-adopta status `active`/`suspended` del proveedor; resto emit-only. `reconcileOne` aplica la **misma doctrina** (R4 frozen) — un admin pulsando el botón sobre un servicio activo NO debe poder cancelarlo automáticamente por un desync transitorio del proveedor (caso `MockEnhanceServer` reiniciado perdiendo `patchSubscription`).

#### A8.2. Shape del método y de los tipos asociados (en `backend/src/core/provisioning/types.ts`)

```ts
// Tipo de drift detectado per-servicio. 3 valores alineados con el cron L3
// (Enhance `ReconcileChangeType`) para vocabulario canónico compartido —
// heredable a otros plugins (mapean sus diferencias a uno de estos 3).
export type ServiceDriftType =
  | 'subscription_missing'    // proveedor reporta 404 para provider_reference
  | 'status_divergence'        // status proveedor ≠ services.status
  | 'plan_divergence';         // plan/recursos proveedor ≠ provisioner_config

// Drift individual. Shape genérico heredable.
export interface ServiceDrift {
  readonly type: ServiceDriftType;
  readonly before: unknown;    // valor local Aelium pre-reconcile
  readonly after: unknown;     // valor del proveedor (ground truth)
  readonly applied: boolean;   // si el orquestador lo aplicó (R4 safe-adopt)
  readonly message?: string;   // mensaje humano opcional para audit/timeline
}

// Resultado de reconcileOne — driftsApplied ⊆ driftsDetected (R4 frozen).
export interface ServiceReconcileResult {
  readonly driftsDetected: readonly ServiceDrift[];
  readonly driftsApplied: readonly ServiceDrift[];
  readonly reconciledAt: Date;
}

// ProvisionerErrorCode extendido (10º valor):
export type ProvisionerErrorCode =
  | 'PROVIDER_TIMEOUT' | 'PROVIDER_RATE_LIMITED' | 'PROVIDER_AUTH_FAILED'
  | 'PROVIDER_RESOURCE_EXHAUSTED' | 'INVALID_PAYLOAD' | 'INVALID_STATE'
  | 'NOT_IMPLEMENTED' | 'PROVIDER_INTERNAL_ERROR' | 'NETWORK_ERROR'
  | 'RECONCILE_ONE_NOT_SUPPORTED';  // ← NUEVO Amendment A8 (retriable=false)

// Método opcional añadido al ProvisionerPlugin interface (entre testConnection?()
// y manifest):
interface ProvisionerPlugin {
  // ... métodos existentes ...
  testConnection?(): Promise<{ ok: boolean; message: string }>;
  reconcileOne?(service: ServiceWithRelations): Promise<ServiceReconcileResult>;
  readonly manifest: PluginManifest;
}
```

#### A8.3. Doctrina capability-driven por presencia (R1 frozen)

El método es **estrictamente opcional**. NO se introduce flag explícito en `PluginCapabilities` (`supports_reconcile_one` o similar — sería redundante con A6 `testConnection?()` y A7 `ServiceInfo.ssl?` que también son capability-driven por presencia).

**Gating en backend** (`ReconcileRegistryService.reconcileOne(slug, service)`):

```ts
async reconcileOne(slug: string, service: ServiceWithRelations): Promise<ServiceReconcileResult> {
  const plugin = this.pluginRegistry.getBySlug(slug);
  if (typeof plugin.reconcileOne !== 'function') {
    throw new ProvisionerPluginError(
      `Plugin '${slug}' does not implement reconcileOne()`,
      'RECONCILE_ONE_NOT_SUPPORTED',
      false, // no retriable — es bug del frontend que pidió un endpoint no soportado
      undefined,
      'reconcile', // módulo set explícito para GAP-N (F.3)
    );
  }
  return plugin.reconcileOne(service);
}
```

**Gating en frontend** — frozen R9 (§A.11.10.6.2 Amendment III, commit `8939a97`): el admin overview F.2 (`GET /api/v1/admin/plugins/:slug/operational-overview`) expone `reconciliation.supports_reconcile_one: boolean` **derivado server-side** vía `reconcileRegistry.hasReconcileOneExecutor(slug)` — refleja la presencia real del executor registrado por el cron del plugin en su `onModuleInit` (Amendment II, executor map paralelo). El `<AdminDriftBanner>` (cuando `recoveryHint === 'reconcile'`) y las filas drift de `<PluginOperationalOverview>` solo renderizan el botón si el flag está a `true`.

**Doctrina canónica: capability-driven por presencia, NO por flag del manifest.** Coherente con A6 (`testConnection?()`) y A7 (`ServiceInfo.ssl?`). El `PluginManifest` declarativo NO declara `reconcileOne` — la "capability" se infiere observando si el plugin (o su cron) registra un executor en el `ReconcileRegistryService`. Razón: facilita los plugins futuros (15D RC / 15E Docker / 15G Plesk) sin contaminar `PluginCapabilities` con flags redundantes; un plugin que añada `reconcileOne` simplemente expone el método + se auto-registra, sin tocar su manifest.

**Contract test invariant** (`provisioner-contract.spec.ts`): para todo plugin loaded la única invariante canónica es:
- Si `typeof plugin.reconcileOne === 'function'` → invocar contra un mock service devuelve un `ServiceReconcileResult` válido (no throw, shape ADR-077 A8.2: `driftsDetected: ServiceDrift[]` + `driftsApplied: ServiceDrift[]` ⊆ `driftsDetected` + `reconciledAt: Date`, con `applied=true` para cada drift en `driftsApplied`).
- NO se valida ningún flag del manifest (R9 — la capability está implícita por la presencia del método).

#### A8.4. Doctrina safe-to-adopt (R4 frozen) — espejo del cron L3

Los drifts detectados se clasifican en safe-to-adopt vs emit-only según las mismas reglas que el cron L3 (`enhance-reconciliation.cron.ts` `reconcileService`):

| Drift | `services.status` proveedor | Acción | Razón canónica |
|-------|-----|--------|-----|
| `status_divergence` | `active` / `suspended` | **auto-adopt** | F.4 A1 — lifecycle administrativo coherente con operacional |
| `status_divergence` | `cancelled` / `terminated` / `expired` | **emit-only** | Transición destructiva — requiere `deprovisionAsAdmin` explícito (DC.46) |
| `subscription_missing` | (404 al `provider_reference`) | **emit-only** | Protege contra desyncs transitorios (`MockEnhance` reiniciado, blip provider) |
| `plan_divergence` | (plan provider ≠ provisioner_config) | **auto-adopt** | Drift de catálogo, no destructivo (espejo del cron L3) |

Los drifts emit-only quedan en `driftsDetected` pero NO en `driftsApplied` — el frontend (R5 frozen §A.11.10.6.2) muestra "X drifts detectados, Y aplicados" y los no aplicados se navegan en el audit timeline (F.3 GAP-M).

#### A8.5. Impacto en wrappers y orquestador

El plugin SOLO devuelve el `ServiceReconcileResult`. TODO lo transversal vive en el orquestador (`ProvisioningService.reconcileServiceAsAdmin(serviceId, actorUserId)` — commit feat 7):

- **Carga del service** + 404 si no existe.
- **Shortcircuit terminal**: si `services.status ∈ {cancelled, terminated}` → 409 `INVALID_STATE` (sin invocar plugin).
- **Cooldown 30s Redis `SET NX EX` per-`serviceId`** (R6 frozen — `ProvisioningCacheService.tryAcquireReconcileSingleCooldown`). Si ventana activa: devolver último `ServiceReconcileResult` cacheado (coalescing, alineado a F.3 B.1 force-refresh) o `429 RECONCILE_IN_PROGRESS` con `Retry-After`.
- **Delegación al plugin** vía `ReconcileRegistryService.reconcileOne` (con guard 400 RECONCILE_ONE_NOT_SUPPORTED).
- **Transacción Prisma** dentro de la cual: aplicar drifts safe-adopt sobre `services.status` / `services.metadata` + `ClientNotesService.createFromServiceLifecycleAction(input, tx)` si `result.driftsApplied > 0` (R3 — categoría `reconciliation`, `triggered_by_action: 'service.reconciled_single'`).
- **Cache invalidation** `service_info` post-tx (heredable de F.4/F.5).
- **Audit `service.reconciled_single`** post-tx (con actor real).
- **Evento `service.reconciled_external_change`** con `trigger: 'manual_single'` (R2 frozen — reuso del evento existente + discriminador payload-level).

R8 audit centralizado — el plugin NUNCA emite eventos ni invalida cache (mismo patrón que A4 suspend/unsuspend).

#### A8.6. Plugins existentes — actualización

- `internal`, `manual`: NO declaran `reconcileOne` (concepto no aplicable — internal no tiene proveedor externo; manual es agent-driven). Sin cambios. El admin overview F.2 NO mostrará el botón para sus services.
- `enhance_cp` (Sprint 15C.II Fase F.9 commit feat 10): declara `reconcileOne(service)` espejo per-servicio del cron L3 (`enhance-reconciliation.cron.ts:reconcileService` línea ~257). Re-lee `getSubscription`, compara contra `services.metadata.subscription_id` + `product.provisioner_config.subscription_plan_id`, aplica safe-adopt según A8.4, devuelve `ServiceReconcileResult` con los 3 tipos de drift posibles. Posible [ADR-083 Amendment A9](./adr-083-plugin-enhance-cp-specifics.md#amendments) si se descubre lógica frozen-worthy del provider en el smoke real.
- Plugins futuros (15D RC, 15E Docker, 15G Plesk): heredan el patrón — si su API permite re-leer el estado de un único recurso, declaran `reconcileOne` y mapean sus drifts a los 3 `ServiceDriftType` canónicos; si no, omiten el método y el endpoint admin responde 400 capability-driven.

#### A8.7. Doctrina de adición de métodos opcionales a `ProvisionerPlugin` (refuerzo Amendment A6.5)

Mismo patrón canónico que A6 `testConnection?()` (refuerzo §"capability-driven por presencia"): ADR justificante → Amendment ADR-077 con firma + shapes asociados + impacto orquestador + invariante test contract + plugins existentes → compatible hacia atrás (NO bumpea `contractVersion`) → frontend gatea el CTA por presencia de la capability (NUNCA por slug — ADR-070) → orquestador maneja transversales (tx + cache + audit + evento + ClientNote) → documentar en `provisioning/contract.md` §"métodos" + `glossary.md`.

Convención de naming: el shape de retorno usa sufijo `Service*` cuando el resultado es per-servicio (`ServiceReconcileResult`, vs `ReconcileResult` agregado del reconcile-all en `reconcile-registry.service.ts:74`). Heredable a métodos futuros — `getBackupStatus(service)` futuro devolvería `ServiceBackupStatus`, no `BackupStatus`.

---

### Amendment A9 (2026-05-18) — campo opcional `ServiceInfo.apps?: AppPresence[]` + shape `AppPresence` + acción canónica `open_app_admin` (Sprint 15C.II Fase F.10)

**Contexto.** Sprint 15C.II Fase F.10 — capa base de App Management con deep-links a apps CMS instaladas (WordPress SSO contractual / Joomla URL canónica). El plan original "deep-links curados al panel del proveedor (email/DBs/files/logs)" se pivotó pre-código tras la investigación rigurosa del OAS de orchd (`docs/_research/sprint-15c/orchd-oas3-api.yaml`) — los endpoints SSO del panel ([`getOrgMemberLogin`](../_research/sprint-15c/orchd-oas3-api.yaml#L5039) emisor del OTP + [`createOtpSession`](../_research/sprint-15c/orchd-oas3-api.yaml#L3626) consumidor) son agnósticos a sección y construir sobre `?next=` no documentado violaría la doctrina de robustez heredable. En cambio, el OAS SÍ documenta endpoints contractuales para apps CMS instaladas dentro de un website ([`getWebsiteApps`](../_research/sprint-15c/orchd-oas3-api.yaml#L9408) + [`getWordpressUserSsoUrl`](../_research/sprint-15c/orchd-oas3-api.yaml#L9945)). Dossier [§A.11.10.7](../60-roadmap/sprint-15c-ii-hardening-enhance-dossier.md) re-redactado + handoff [§A.11.10.7.1](../60-roadmap/sprint-15c-ii-hardening-enhance-dossier.md) pivot + refinamiento [§A.11.10.7.2](../60-roadmap/sprint-15c-ii-hardening-enhance-dossier.md) R1..R6 frozen pre-código + [ADR-083 Amendment A9](./adr-083-plugin-enhance-cp-specifics.md#amendments) (Enhance specifics).

> **Justificado por:** sprint hardening 15C.II Fase F.10 — capa base App Management heredable a 15D RC / 15E Docker / 15G Plesk + futuros features F.10.x (stats UI per-app `DC.NEW-51`) y F.10.y (install/uninstall desde dashboard `DC.NEW-52`).
> **Sprint:** 15C.II Fase F.10 (PR doc-only commit 1 + commits feat 2..N rama `sprint15c-ii-fase-f10-curated-deeplinks`).
> **Compatibilidad:** Hacia atrás. NO bumpea `contractVersion` — sigue `'v2'`. Plugins existentes (`internal`, `manual`) omiten `ServiceInfo.apps` (concepto no aplicable — internal/manual no tienen apps CMS instalables). `enhance_cp` lo expone (Sprint 15C.II Fase F.10). Capability-driven por presencia: el frontend gatea el card por `info.apps !== undefined && info.apps.length > 0`, NUNCA por `provisioner_slug` — ADR-070. Mismo molde A5/A6/A7/A8.

#### A9.1. Motivación

Estándar profesional de paneles reseller (cPanel/Softaculous + Plesk/Application Vault como referentes, ~10 años en producción): el cliente espera ver "qué apps tengo instaladas en mi hosting" + atajo directo al admin de cada una. orchd cubre ~80% del estándar (catalog vía `getInstallableApps`, install/uninstall, deep-link WP SSO documentado, version management WP, users management WP+Joomla, themes/plugins management WP). El sprint 15C.II hardening promueve este feature al alcance de F.10 — capa base read-only — preservando heredabilidad a fases futuras de mutación.

Sin el shape contractual `AppPresence`, cada plugin con apps tendría que inventar su propio modelo + UI per-plugin → violación ADR-070 (cero `if (provisioner === 'X')` en frontend). Con `AppPresence` + action canónica `open_app_admin`, el frontend renderiza N atajos diferenciados sin saber el kind del proveedor; el plugin internamente decide cómo emitir la URL (SSO real / URL canónica / futuras).

#### A9.2. Shape `AppPresence` (en `backend/src/core/provisioning/types.ts`)

```typescript
/**
 * Sprint 15C.II Fase F.10 — ADR-077 Amendment A9.
 *
 * Representa una "aplicación instalada" dentro del recurso del proveedor
 * (típicamente una website/hosting): WordPress, Joomla, futuros CMS.
 *
 * Shape mínimo contractual genérico. Detalles per-kind (WordPressInfo,
 * JoomlaInfo, etc.) son plugin-internal y viven en endpoints/actions
 * plugin-internos invocados on-demand cuando la UI dedicada lo requiera
 * (A9.5 doctrina).
 *
 * Capability-driven por presencia (mismo molde A5/A6/A7/A8): plugins
 * que NO soporten apps instalables OMITEN el campo `ServiceInfo.apps`.
 */
export interface AppPresence {
  /**
   * ID estable provisto por el proveedor (UUID en Enhance; string libre
   * en general). Sirve como discriminator del payload en
   * `executeAction('open_app_admin', { appId })`.
   */
  appId: string;

  /**
   * String libre plugin-internal (mismo patrón `ServiceAction.slug`).
   * Convención: lowercase + snake_case si compuesto.
   *
   * Valores actuales (Sprint 15C.II Fase F.10):
   *   - 'wordpress' — WP app, SSO contractual orchd
   *   - 'joomla'    — Joomla app, URL canónica /administrator
   *
   * Valores futuros (heredabilidad): 'nodejs', 'python', 'drupal',
   * 'mediawiki', 'prestashop', etc. — añadidos sin amendment del
   * contrato cuando un plugin los soporte.
   */
  kind: string;

  /**
   * i18n key (translatable en el frontend). El plugin emite la key
   * canónica; el frontend traduce. Ejemplos: 'plugin.enhance_cp.apps.wordpress',
   * 'plugin.enhance_cp.apps.joomla'.
   */
  label: string;

  /**
   * Subdirectorio si la app NO está instalada en la raíz del recurso.
   * Si está en raíz, omitido. Permite multi-instancia: 2 WP en una
   * misma website (uno en '/', otro en '/blog') → 2 entries de
   * `AppPresence` diferenciadas por `path`.
   */
  path?: string;

  /** Versión instalada de la app (informativo). */
  version?: string;

  /**
   * Acciones disponibles per-instalación. Mismo shape `ServiceAction`
   * que las acciones del servicio entero (incluye `adminOnly`).
   *
   * Sprint 15C.II Fase F.10 declara una sola acción canónica:
   *   - 'open_app_admin' — abre el admin de la app (SSO o URL canónica
   *     según kind, payload `{ appId }`, returns `ActionResult.data`
   *     con `{ url, kind: 'sso'|'canonical', opensIn: 'new_tab' }`).
   *
   * Acciones futuras (heredabilidad — additivas a `actions[]`):
   *   - 'update_app_version' (DC.NEW-53)
   *   - 'install_app_plugin' (DC.NEW-53, WP-only)
   *   - 'set_default_wp_sso_user' (DC.NEW-53, WP-only)
   *   - 'uninstall_app' (DC.NEW-52)
   *   - …
   *
   * Si la action está ausente del array, el frontend NO renderiza el
   * botón (capability-driven por presencia). Ejemplo concreto Sprint
   * 15C.II Fase F.10: WordPress sin default user → `getDefaultWpSsoUser`
   * 404 → plugin omite 'open_app_admin' de `actions[]` → frontend
   * renderiza el atajo DISABLED con tooltip "Configura un usuario WP
   * por defecto en el panel" + CTA al panel via `SsoButton` existente.
   */
  actions: readonly ServiceAction[];
}
```

`ServiceInfo` extendida (A9.3):

```typescript
export interface ServiceInfo {
  // ...campos existentes A5/A6/A7/A8...

  /**
   * Sprint 15C.II Fase F.10 — Amendment A9.
   *
   * Apps CMS instaladas dentro del recurso del proveedor (websites con
   * WordPress / Joomla / etc.). Capability-driven por presencia
   * (mismo molde A5/A6/A7/A8): plugins que NO soporten apps OMITEN
   * el campo; plugins que sí lo soporten lo emiten (vacío si no hay
   * apps instaladas, array si hay).
   *
   * El frontend renderiza `<AppShortcutsCard>` solo si
   * `info.apps !== undefined && info.apps.length > 0`. NUNCA ramifica
   * por `provisioner_slug` (ADR-070).
   */
  apps?: readonly AppPresence[];
}
```

#### A9.3. Acción canónica `open_app_admin` (slug fijo + payload discriminator)

Slug fijo declarado en `plugin.inlineActions` (NO compuesto). Payload dinámico `{ appId: string }` discrimina la instalación específica. El plugin internamente discrimina por kind y emite URL fresh on-demand (NO cacheable — las URLs SSO son one-shot/short-TTL, las canónicas se generan fresh para consistencia).

```typescript
// En plugin.inlineActions del plugin Enhance (Sprint 15C.II Fase F.10):
{
  slug: 'open_app_admin',
  label: 'plugin.enhance_cp.actions.open_app_admin.label',
  description: 'plugin.enhance_cp.actions.open_app_admin.description',
  adminOnly: false,  // Cliente self-service: abrir admin de SU app
  // ...resto de campos ServiceAction estándar...
}

// Invocación desde el orquestador (heredada del flow F.9):
await plugin.executeAction(service, 'open_app_admin', { appId: '...' });

// Return ActionResult:
{
  success: true,
  data: {
    url: 'https://mi-website.com/wp-admin/index.php?token=...',  // o '${site_url}/administrator' para Joomla
    kind: 'sso' | 'canonical',  // discriminator para UX (mostrar "abrir con SSO" vs "abrir admin")
    opensIn: 'new_tab',  // siempre new_tab para no perder el dashboard
  },
}
```

**Manejo defensivo `404 NotFound`** (WP sin default user configurado): el plugin omite `'open_app_admin'` de `AppPresence.actions[]` para esa instalación; frontend renderiza el atajo disabled con tooltip + CTA al panel via `SsoButton` existente. NO se lanza error desde `executeAction` (la action ni se invoca — el frontend la oculta por capability-driven).

`ActionResult.data: Record<string, unknown>` ya existe en el contrato (Sprint 11 Fase 11.A) — cero amendment al shape de `ActionResult`.

#### A9.4. Doctrina capability-driven por presencia (R2 frozen §A.11.10.7.2)

Mismo patrón canónico A5/A6/A7/A8: plugins que soporten apps instalables emiten `ServiceInfo.apps?: AppPresence[]` (vacío si no hay instalaciones, array si hay); plugins que NO las soporten OMITEN el campo. Frontend gatea el card por presencia + length:

```tsx
// <ServiceDetailPage> (cliente o admin):
{info.apps && info.apps.length > 0 && (
  <AppShortcutsCard apps={info.apps} serviceId={service.id} isAdmin={isAdmin} />
)}
```

**Test contract genérico** (verificable en `plugin-contract.spec.ts`):

- Si un plugin declara `'open_app_admin'` en `inlineActions` → DEBE emitir `ServiceInfo.apps?: AppPresence[]` en `getServiceInfo()` (consistencia bidireccional).
- Si un plugin NO declara `'open_app_admin'` → DEBE omitir `ServiceInfo.apps` (no emitir array vacío misleading).
- Si `info.apps` está definido → cada `AppPresence` DEBE tener `appId` string no-vacío + `kind` string no-vacío + `label` i18n key + `actions: readonly ServiceAction[]` (vacío permitido para WP sin default user).

#### A9.5. Doctrina "detalles per-kind FUERA del contrato genérico" (R3 frozen)

`WordPressInfo`, `JoomlaInfo`, y futuros shapes per-kind NO entran en `AppPresence`. Razón:

- **Tamaño razonable de `getServiceInfo` response**: `getWordpressInfo` per-app suma 5+ fields adicionales × N apps × M services → respuesta hinchada. Cache TTL global de `getServiceInfo` (ADR-080 §C `serviceInfoCacheTtlSeconds`) no permite TTL independiente per-detalle.
- **Plugin-specific vs contractual genérico**: el contrato `ProvisionerPlugin` v2 modela conceptos transversales (servicio, acción, capability, drift, app). Los detalles per-kind son específicos del provisioner — pertenecen al plugin, NO al contrato.
- **Heredabilidad**: 15D RC / 15E Docker / 15G Plesk pueden añadir sus propios kinds (nodejs/python/...) con sus propios shapes específicos sin amendment del contrato.

Cuando F.10.x stats UI lo requiera, los detalles per-kind viven en:

- **Opción A** — endpoints REST dedicados: `GET /admin/services/:id/apps/:appId/details` que el frontend invoca cuando el usuario abre la tab "Detalles" de una app. Backend dispatch al plugin via método nuevo `plugin.getAppDetails?(service, appId)` opcional capability-driven.
- **Opción B** — inline action plugin-internal: `executeAction('get_app_details', { appId })` que devuelve `ActionResult.data: { wordpress?: WordPressInfo, joomla?: JoomlaInfo, ... }` discriminator por kind.
- **Decisión final**: se materializa en F.10.x con un Amendment ADR-077 A10 o A11 cuando se acometa.

#### A9.6. Extensibilidad futura (additiva, sin breaking changes)

El shape `AppPresence` está diseñado para crecer additivamente:

- **Acciones futuras**: cualquier action plugin-internal nueva (`update_app_version`, `install_app_plugin`, `uninstall_app`, `set_default_wp_sso_user`, ...) se suma a `AppPresence.actions[]` con su slug + label + adminOnly. Cero refactor.
- **Status del ciclo de vida**: cuando F.10.y materialice install/uninstall desde dashboard, `AppPresence` gana `status?: 'installed' | 'installing' | 'installing_failed' | 'uninstalling'` opcional (default 'installed' si campo ausente). Compatible hacia atrás — plugins que solo enumeran apps instaladas no añaden el campo.
- **Detalles per-kind fresh**: como se decida en A9.5 cuando F.10.x lo materialice (endpoint dedicado o inline action).
- **Cross-references**: si un plugin necesita exponer relación entre apps (ej: WP + WooCommerce plugin instalado), lo modela via `AppPresence.metadata?: Record<string, unknown>` plugin-internal — campo opcional libre añadido como sub-amendment cuando demanda emerja.

#### A9.7. Doctrina audit per-sub-recurso (R6 frozen — telemetry per-app)

Cuando admin ejecuta una action plugin-internal que opera sobre un **sub-recurso del service identificado por payload** (típicamente `{ appId, ... }`), el orquestador `ProvisioningService.executeAction` (o capa equivalente que maneje el flow admin) añade audit enriquecido con el ID del sub-recurso en `audit_access_log.metadata` JSON path:

```json
{
  "resource_type": "Service",
  "resource_id": "<service_uuid>",
  "target_user_id": "<service_owner_user_uuid>",
  "actor_role": "superadmin",
  "app_id": "<app_uuid>",
  "app_kind": "wordpress"
}
```

- **Cero schema change** — el `metadata Json?` existente en `AuditAccessLog` (Sprint 9 Fase E + ADR-017) permite tracking arbitrario. Coherente con `target_user_id` que ya vive como JSON path desde su creación.
- **Queryable hoy** via `metadata->'app_id'` Postgres operator. GIN index si volumen lo justifica.
- **Heredable a F.10.y futuro**: cuando install/uninstall desde dashboard emita `app.installed`/`app.uninstalled` en `audit_change_log`, lleva `changes_after: { app_id, app_kind, path, version }` JSON path. Cero refactor.

Generalización: cualquier action plugin-internal futura (DNS records, files, databases, futuras app sub-operations) que opere sobre sub-recurso identificable sigue el mismo patrón — `metadata.<resource_kind>_id` + `metadata.<resource_kind>_kind` cuando aplique.

#### A8.8. Plugins existentes — actualización

- `internal`, `manual`: `getServiceInfo()` NO emite `apps` (concepto no aplicable — internal/manual no tienen apps CMS instalables). Sin cambios. El frontend NO renderiza `<AppShortcutsCard>` para estos plugins.
- `enhance_cp` (Sprint 15C.II Fase F.10): `getServiceInfo()` emite `apps` via 4 nuevos métodos cliente Enhance (`getWebsiteApps` + `getWordpressInfo` + `getDefaultWpSsoUser` + `getJoomlaInfo`); declara `'open_app_admin'` en `inlineActions` + implementa `executeAction('open_app_admin', { appId })` dispatch por kind ([ADR-083 Amendment A9](./adr-083-plugin-enhance-cp-specifics.md#amendments)).
- Plugins futuros (15D RC / 15E Docker / 15G Plesk): heredan el patrón — si su API permite enumerar apps instalables dentro del recurso, declaran `'open_app_admin'` + emiten `apps` con kinds plugin-internos; si no, omiten el campo.

#### A9.9. Doctrina de adición de shapes contractuales nuevos a `ServiceInfo` (refuerzo §3 + Amendments A3.6/A5.6/A7.7)

Mismo patrón canónico que `ServiceInfo.recoveryHint?` (A5.7), `ServiceInfo.ssl?` (A7.7) y `ServiceAction.adminOnly?` (A3.6): ADR justificante → Amendment ADR-077 con shape mínimo contractual + impacto wrappers + invariante test contract + plugins existentes → compatible hacia atrás (NO bumpea `contractVersion`) → frontend ramifica por presencia (NUNCA por slug ni por display strings) → cálculo server-side (no aritmética en el frontend) → detalles per-kind fuera del contrato genérico (A9.5 doctrina) → documentar en `provisioning/contract.md` §"shapes" + `glossary.md`.

Cuando un sub-recurso del service emerge como entidad contractual con identidad propia (`appId` aquí), las acciones del sub-recurso viven en su propio `actions[]` array, NO en `ServiceInfo.availableActions[]` del servicio entero (D4 frozen §A.11.10.7.2). Heredable a futuros sub-recursos (DNS records, files, databases, ...).

---

### Amendment A10 (2026-05-21) — capability `is_domain_registrar` + sub-contrato de registrar (8 operaciones canónicas) + 7 códigos de error de dominio + campo opcional `ProvisionContext.operation` (Sprint 15D Fase 15D.A)

**Contexto.** Sprint 15D introduce el primer plugin de **registro de dominios** (ResellerClub, [ADR-081](./adr-081-plugin-resellerclub-specifics.md)) sobre la doctrina transversal de **comercio de dominios** ([ADR-084](./adr-084-comercio-dominios-registrar.md)) y el modelo Domain↔Hosting ([ADR-082](./adr-082-modelo-domain-hosting-dns-doctrine.md)). El §4 original del ADR mapeó `resellerclub` con slugs DNS (`view_dns_records`, `add_dns_record`, ...) — ese mapping queda **obsoleto para RC** tras la inversión de Sprint 15C ([ADR-082](./adr-082-modelo-domain-hosting-dns-doctrine.md): la autoridad DNS es Enhance, RC declara `has_dns_management=false`). Un registrar no es un "plugin genérico con N inline actions sueltas": es un rol con un **conjunto canónico de operaciones que la industria conoce desde hace 15 años** (WHMCS registrar module API, Blesta, HostBill). Sin un sub-contrato explícito, cada registrar futuro (Hexonet, OpenSRS, Namecheap) redescubriría qué operaciones exponer — el antipatrón "interface emerges from implementation" que este ADR evita. Además, los 9 `ProvisionerErrorCode` del §2.6 (10 con A8) son **todos de infraestructura** (timeout, rate-limit, auth, network) — ninguno captura la semántica de negocio de dominios, por lo que un "dominio ya registrado por otro" se reportaría como `PROVIDER_INTERNAL_ERROR` genérico y el cliente vería "error del proveedor" en vez de "ese dominio ya no está disponible".

> **Justificado por:** [ADR-084](./adr-084-comercio-dominios-registrar.md) (comercio de dominios + DOM-INV) + [ADR-081](./adr-081-plugin-resellerclub-specifics.md) (RC specifics) + [ADR-082](./adr-082-modelo-domain-hosting-dns-doctrine.md) (Domain↔Hosting). Materializa a nivel de contrato TypeScript la decisión de sesión 2026-05-21 "definir la abstracción de registrar ahora, no con el 2º registrar".
> **Sprint:** 15D Fase 15D.A (doc-only, junto a ADR-082 amendment + ADR-084 + ADR-081, misma rama `sprint15d-fase-a-doctrina`). Implementación del contrato en 15D core Fase D; `transfer_in` se difiere a Sprint 15D.II (la **doctrina** del slug se congela ahora; la **implementación** se fasea por madurez).
> **Compatibilidad:** Hacia atrás. NO bumpea `contractVersion` — sigue `'v2'`. `is_domain_registrar` pasa a ser **required** en `PluginCapabilities` (mismo patrón A1 `has_dns_management`) — plugins existentes (`internal`, `manual`, `enhance_cp`) lo declaran `false`. Los códigos de error nuevos son additivos al union `ProvisionerErrorCode`. `ProvisionContext.operation` es **opcional** (default `'register'`) — los plugins no-registrar lo ignoran. El frontend ramifica por la capability + presencia de inline actions (NUNCA por `provisioner_slug` — ADR-070).

#### A10.1. Capability flag `is_domain_registrar` (§3)

```typescript
export interface PluginCapabilities {
  // ... flags existentes (has_sso_panel, ..., has_dns_management A1, supports_suspend A4) ...

  /**
   * Indica si el plugin registra/gestiona dominios contra un registrar
   * (ResellerClub, Hexonet, OpenSRS, ...). Distinto de `has_dns_management`:
   * un registrar puede NO ser autoridad DNS (RC: NS van a Aelium/Enhance).
   *
   * Plugins con `is_domain_registrar=true` cumplen el SUB-CONTRATO DE
   * REGISTRAR (A10.2): provision() distingue register/renew/transfer_in vía
   * `ProvisionContext.operation`, y declaran las 5 inline actions canónicas
   * de gestión en `inlineActions` (modify_nameservers, modify_contacts,
   * toggle_privacy, toggle_registrar_lock, get_auth_code).
   *
   * Las garantías transversales (exactly-once por nombre, lock de
   * concurrencia, renovación verificada, guardia de margen) las gobierna
   * ADR-084 (DOM-INV-1..5), NO este contrato — aquí solo se declara la forma.
   */
  is_domain_registrar: boolean;
}
```

#### A10.2. Sub-contrato de registrar — tres planos

Cuando `is_domain_registrar=true`, el plugin cumple el sub-contrato de registrar en tres planos. Los planos B y C reusan el contrato existente (`provision()` + `executeAction()`); el plano A añade dos métodos **opcionales** nuevos (mismo patrón que `testConnection?()` A6 y `reconcileOne?()` A8 — opcionales en la interface, **required** cuando `is_domain_registrar=true`, enforzado por el test contract A10.4).

**Plano A — pre-venta (métodos nuevos del contrato, para que el buscador y el cron de pricing sean agnósticos al registrar — ADR-070):**

```typescript
export interface ProvisionerPlugin {
  // ... métodos existentes (provision, deprovision, getStatus, getServiceInfo,
  //     getSsoUrl, executeAction, testConnection? A6, reconcileOne? A8) ...

  /**
   * Sprint 15D — Amendment A10. Solo plugins con is_domain_registrar=true.
   * Consulta disponibilidad de un FQDN contra el registrar. Usado por el
   * buscador (/dashboard/domains/search) y como pre-flight de DOM-INV-1
   * (exactly-once por nombre, ADR-084) antes de un register.
   */
  checkDomainAvailability?(domain: string): Promise<DomainAvailability>;

  /**
   * Sprint 15D — Amendment A10. Solo plugins con is_domain_registrar=true.
   * Devuelve la matriz de COSTE mayorista por TLD/operación/años del
   * registrar. El cron de sync (ADR-084) aplica markup y puebla
   * `domain_tld_pricing`. Permite que el sync sea agnóstico al registrar.
   */
  getTldPricing?(): Promise<readonly TldCostEntry[]>;
}

export interface DomainAvailability {
  domain: string;
  available: boolean;
  /** El registrar marca el dominio como premium (precio dinámico fuera de
   * la tabla TLD pricing). v1 lo bloquea (`DOMAIN_PREMIUM`); venta v1.1. */
  premium: boolean;
  /** Precio premium si premium=true (informativo; no se vende en v1). */
  premiumPrice?: { amount: string; currency: string };
}

export interface TldCostEntry {
  tld: string;                                  // sin punto, lowercase ('com', 'es')
  operation: 'register' | 'renew' | 'transfer' | 'restore';
  years: number;                                // 1..10
  cost: { amount: string; currency: string };   // coste mayorista del registrar
}
```

`suggestDomainNames?()` (sugerencias del buscador rico) se difiere a Sprint 15D.II — su firma NO se congela aquí.

**Plano B — ciclo de vida (vía `provision()` idempotente + reconcile, NO inline actions):**

| # | Operación | Cómo | Sprint |
|---|---|---|---|
| 1 | `register_domain` | `provision(ctx)` con `ctx.operation='register'` (service nuevo, sin `provider_reference`). | 15D core |
| 2 | `renew_domain` | `provision(ctx)` con `ctx.operation='renew'` (al pagar la factura de renovación; idempotente por período — DOM-INV-4 ADR-084). | 15D core |
| 3 | `transfer_in` | `provision(ctx)` con `ctx.operation='transfer_in'` (lifecycle asíncrono con FSM — ADR-084). **Doctrina ahora, implementación 15D.II.** | 15D.II |

**Plano C — gestión (vía `executeAction(slug, payload)`, declaradas en `inlineActions`):**

| # | Slug | Descripción | `confirmRequired` |
|---|---|---|---|
| 4 | `modify_nameservers` | Cambiar NS del dominio. Peligrosa (rompe email/DNS si mal). | ✅ + texto de impacto |
| 5 | `modify_contacts` | Cambiar contactos registrant/admin/tech/billing. | ❌ |
| 6 | `toggle_privacy` | WHOIS privacy ON/OFF (default ON — ADR-081). | ❌ |
| 7 | `toggle_registrar_lock` | Theft protection / registrar lock ON/OFF. | ✅ |
| 8 | `get_auth_code` | Obtener/regenerar EPP auth code (para transfer-out). | ❌ |

`toggle_auto_renew` (preferencia de renovación del cliente) es una inline action **recomendada** adicional, no parte del set mínimo de gestión (no toda integración de registrar la expone igual). `request_transfer_out` y la cancelación se cubren por `deprovision()` + el lifecycle de `services.status`.

`ProvisionContext` extendido (additivo, §2.1):

```typescript
export interface ProvisionContext {
  // ... campos existentes (service, client, productConfig, serverId, correlationId) ...

  /**
   * Sprint 15D — Amendment A10. Intención del provision para plugins de
   * registrar (is_domain_registrar=true). El orquestador la fija según el
   * origen: checkout inicial → 'register'; cron de renovación
   * (generatePendingInvoices → invoice.paid) → 'renew'; checkout de
   * transferencia → 'transfer_in'.
   *
   * Opcional, default 'register' si ausente — los plugins no-registrar lo
   * ignoran. Es lo que permite distinguir un REINTENTO de register (crash
   * recovery, idempotente: no recrea) de una RENOVACIÓN intencional del
   * período siguiente (DOM-INV-1 + DOM-INV-4, ADR-084).
   */
  readonly operation?: 'register' | 'renew' | 'transfer_in';
}
```

#### A10.3. Códigos de error de dominio (additivos a `ProvisionerErrorCode`, §2.6)

Se añaden 7 códigos de **negocio de dominio** al union. Todos `retriable=false` (no son fallos transitorios — reintentar no cambia el resultado; el cliente o el admin deben actuar):

```typescript
export type ProvisionerErrorCode =
  | /* ...los 10 existentes... */
  | 'DOMAIN_UNAVAILABLE'      // el dominio ya está registrado (por otro o por nosotros en reintento) → UX "no disponible"
  | 'DOMAIN_PREMIUM'          // precio dinámico fuera de la tabla TLD pricing → bloquear en v1 (venta v1.1, ADR-084)
  | 'REGISTRANT_INELIGIBLE'   // el registrant no cumple requisitos del TLD (.es→NIF, .eu→residencia UE) → DOM-INV-5
  | 'TRANSFER_REJECTED'       // el registrar de origen/destino rechazó el transfer (lock, <60d, NACK) → 15D.II
  | 'INVALID_AUTH_CODE'       // EPP/auth code incorrecto en transfer_in → 15D.II
  | 'DOMAIN_IN_REDEMPTION'    // dominio en RGP/redemption: no renovable normal, requiere restore (fee distinto) → ADR-084 lifecycle
  | 'REGISTRAR_LOCKED';       // operación bloqueada por registrar lock activo (hay que desbloquear antes)
```

Cada plugin de registrar **mapea sus errores nativos** (códigos RC, códigos EPP 2xxx, ...) a estos códigos canónicos (RC: ADR-081). El `GlobalExceptionFilter` + el frontend traducen el código a un mensaje accionable i18n (R14). Los códigos retriable existentes (`PROVIDER_TIMEOUT`, `PROVIDER_RATE_LIMITED`, `NETWORK_ERROR`) siguen aplicando a las llamadas al registrar.

#### A10.4. Test contract genérico (§7) — invariantes nuevas

```typescript
it('declara is_domain_registrar como boolean', () => {
  expect(typeof plugin.capabilities.is_domain_registrar).toBe('boolean');
});

it('si is_domain_registrar=true → declara las 5 inline actions canónicas de gestión', () => {
  if (plugin.capabilities.is_domain_registrar) {
    const slugs = plugin.inlineActions.map((a) => a.slug);
    for (const required of ['modify_nameservers', 'modify_contacts', 'toggle_privacy', 'toggle_registrar_lock', 'get_auth_code']) {
      expect(slugs).toContain(required);
    }
  }
});

it('si is_domain_registrar=true → implementa los métodos de pre-venta (plano A)', () => {
  if (plugin.capabilities.is_domain_registrar) {
    expect(typeof plugin.checkDomainAvailability).toBe('function');
    expect(typeof plugin.getTldPricing).toBe('function');
  }
});

it('modify_nameservers (si presente) es confirmRequired=true (peligrosa)', () => {
  const ns = plugin.inlineActions.find((a) => a.slug === 'modify_nameservers');
  if (ns) expect(ns.confirmRequired).toBe(true);
});
```

#### A10.5. Mapping canónico actualizado (§3 + §4)

La tabla del §3 gana la columna `is_domain_registrar`; el mapping de `inlineActions` del §4 para `resellerclub` queda **redefinido** por este amendment (los slugs DNS salen — ADR-082 A1; entran los de registrar):

| Plugin | `has_dns_management` (A1) | `is_domain_registrar` (A10) | `inlineActions` de registrar |
|---|---|---|---|
| `internal` | ❌ | **❌** | — |
| `manual` | ❌ | **❌** | — |
| `enhance_cp` (15C) | ✅ | **❌** (es hosting/DNS, no registrar) | — (declara las 4 DNS de A1) |
| `resellerclub` (15D) | ❌ | **✅** | `modify_nameservers`, `modify_contacts`, `toggle_privacy`, `toggle_registrar_lock`, `get_auth_code` (+ `toggle_auto_renew` recomendada) — **supersede** el mapping DNS del §4 |
| `docker_engine` (15E) | ❌ | **❌** | — |
| `plesk_obsidian` (15G) | ⚠ por config | **❌** | — |

#### A10.6. Plugins existentes — actualización requerida

Sprint 15D core Fase D añade `is_domain_registrar: false` a `internal`, `manual` y `enhance_cp` (mismo cambio mecánico que A1 para `has_dns_management`). El test contract (§7) lo enforza. `resellerclub` nace con `true`.

#### A10.7. Pipeline de wrappers (§5) — sin cambios

`is_domain_registrar`, `ProvisionContext.operation` y los códigos de error nuevos se consumen en el **orquestador** (que fija `operation` según el origen y aplica las garantías DOM-INV de ADR-084) y en el **plugin** (que mapea errores). Los wrappers cross-cutting `getServiceInfoWithCache` / `executeActionWithCacheInvalidation` / `getSsoUrlWithAudit` funcionan sin modificación — las inline actions de registrar son `executeAction(slug, payload)` como cualquier otra.

#### A10.8. Doctrina heredable (futuros registrars)

Cualquier registrar futuro (Hexonet, OpenSRS, Namecheap, ...) declara `is_domain_registrar: true`, implementa `provision()` con los 3 modos de `operation`, declara las 5 inline actions canónicas de gestión y mapea sus errores nativos a los 7 códigos de dominio. **Cero cambios en el core, el frontend ni el contrato** — encaja en la abstracción. Esto es el objetivo explícito de definir el sub-contrato ahora (sesión 2026-05-21) en vez de extraerlo con el 2º registrar.

---

### Amendment A11 (2026-05-22) — campo opcional `ServiceInfo.domain?: DomainInfo` (estado de gestión del dominio) capability-driven por `is_domain_registrar` (Sprint 15D, refinamiento doctrinal pre-Fase B)

**Contexto.** A10 definió el sub-contrato de registrar: las 5 inline actions de gestión (`modify_nameservers`, `modify_contacts`, `toggle_privacy`, `toggle_registrar_lock`, `get_auth_code`) + el ciclo de vida vía `provision(operation)`. Pero **no especificó qué datos del dominio devuelve `getServiceInfo()`** para que la UI de gestión pinte los **valores actuales** antes de un modify: NS actuales, lock ON/OFF, privacy ON/OFF, expiración real, sub-fase del ciclo ICANN, disponibilidad del auth-code y resumen de contactos. [ADR-081 §6](./adr-081-plugin-resellerclub-specifics.md) fija solo el mapeo de `status` (a `ServiceInfoStatus`). Sin estos campos, las 5 inline actions no tienen contra qué renderizar estado → cada registrar inventaría su propio shape → violación [ADR-070](./adr-070-service-info-sso-acciones-curadas.md). Es el **mismo problema que A9 resolvió para apps** con `AppPresence` — aquí se resuelve para dominios con `DomainInfo`.

> **Justificado por:** revaloración de doctrina pre-Fase B (sesión 2026-05-22, Yasmin ↔ Claude) + [ADR-084](./adr-084-comercio-dominios-registrar.md) (comercio de dominios) + [ADR-081](./adr-081-plugin-resellerclub-specifics.md) (RC).
> **Sprint:** 15D refinamiento doctrinal (doc-only, misma rama que ADR-084 A1). Implementación: Fase B (shape + tipos en `core/provisioning/types.ts`) → Fase D/F (RC lo emite desde `domains/details`).
> **Compatibilidad:** Hacia atrás. NO bumpea `contractVersion` — sigue `'v2'`. Campo **opcional**, capability-driven por presencia (mismo molde A5/A6/A7/A8/A9). Plugins no-registrar OMITEN el campo.

#### A11.1. Shape `DomainInfo` (en `backend/src/core/provisioning/types.ts`)

```typescript
/**
 * Sprint 15D — ADR-077 Amendment A11.
 * Estado de gestión de un dominio reportado por el registrar, para que la
 * UI de gestión (cliente/admin) renderice valores actuales + las 5 inline
 * actions de registrar (A10). Capability-driven por presencia: solo plugins
 * con is_domain_registrar=true lo emiten; el resto OMITE ServiceInfo.domain.
 *
 * PII: `contacts` es un RESUMEN (presencia + nombre del registrant), NUNCA
 * direcciones/teléfonos/emails completos — ServiceInfo se cachea en Redis
 * (ADR-080) y NO debe contener PII completa (R12 + RGPD). Los detalles
 * completos de contacto se leen on-demand para el form de `modify_contacts`,
 * fuera del snapshot cacheado.
 */
export interface DomainInfo {
  /** FQDN registrado (= services.domain). */
  fqdn: string;
  /** Nameservers actuales según el registrar. */
  nameservers: readonly string[];
  /** Expiración real del registrar (ISO-8601). Espejo de services.expires_at
   *  (ADR-082 A2.3). Autoritativa para dominios; display.expiresAt la refleja. */
  expiresAt?: string;
  /** Sub-fase del ciclo ICANN (ADR-082 A2.3). 'active' si el dominio vigente;
   *  el resto cuando ServiceInfo.status='expired'. */
  lifecycle: 'active' | 'expired' | 'redemption' | 'pending_delete';
  /** WHOIS privacy ON/OFF (default ON — ADR-081). Refleja toggle_privacy. */
  whoisPrivacy: boolean;
  /** Registrar lock / theft protection ON/OFF. Refleja toggle_registrar_lock. */
  registrarLock: boolean;
  /** Si el auth/EPP code puede obtenerse AHORA (get_auth_code). p.ej. false si
   *  registrarLock activo o dominio <60 días desde el registro. */
  authCodeAvailable: boolean;
  /** Preferencia de auto-renovación (en v1 = factura + avisos, no cobro — ADR-084). */
  autoRenew?: boolean;
  /** Resumen de contactos (presencia + nombre del registrant). SIN PII completa. */
  contacts?: {
    registrantName?: string;
    hasAdmin: boolean;
    hasTech: boolean;
    hasBilling: boolean;
  };
}
```

#### A11.2. `ServiceInfo` extendida

```typescript
export interface ServiceInfo {
  // ...campos existentes A5/A6/A7/A8/A9...

  /**
   * Sprint 15D — Amendment A11. Estado de gestión del dominio.
   * Capability-driven por presencia: plugins con is_domain_registrar=true
   * lo emiten para services de product.type='domain'; el resto lo OMITE.
   * El frontend renderiza el card de gestión de dominio solo si
   * `info.domain !== undefined`. NUNCA ramifica por `provisioner_slug` (ADR-070).
   */
  domain?: DomainInfo;
}
```

#### A11.3. Consistencia bidireccional (test contract §7, extiende A10.4)

- Si `is_domain_registrar=true` → `getServiceInfo()` de un service de `product.type='domain'` (no terminal) DEBE emitir `info.domain` (con `fqdn` no-vacío + `lifecycle` válido + booleans definidos).
- Si `is_domain_registrar=false` → DEBE omitir `info.domain` (no emitir objeto vacío misleading).
- `DomainInfo.contacts`, si presente, NO contiene PII completa (solo resumen).

```typescript
it('si is_domain_registrar=true → getServiceInfo de un dominio activo emite info.domain', async () => {
  if (plugin.capabilities.is_domain_registrar) {
    const info = await plugin.getServiceInfo(domainServiceFixture);
    expect(info.domain).toBeDefined();
    expect(info.domain!.fqdn).toBeTruthy();
    expect(['active', 'expired', 'redemption', 'pending_delete']).toContain(info.domain!.lifecycle);
    expect(typeof info.domain!.whoisPrivacy).toBe('boolean');
    expect(typeof info.domain!.registrarLock).toBe('boolean');
  }
});
```

#### A11.4. Frontend (capability-driven, ADR-070)

El card de gestión de dominio (`<DomainManagementCard>` en `_shared/services/`, Fase F) se renderiza por `info.domain !== undefined`, y cada inline action por presencia en `availableActions` — cero `if (provisioner_slug === 'resellerclub')`. Cliente y admin comparten el card (L16); `isAdmin` solo ramifica acciones admin (suspend/unsuspend) y deep-links. Mismo patrón que `<SslStatusCard>` (A7/F.7) y `<AppShortcutsCard>` (A9/F.10).

#### A11.5. Heredable

Cualquier registrar futuro (Hexonet, OpenSRS, ...) emite `ServiceInfo.domain: DomainInfo` desde su `getServiceInfo()` mapeando su API nativa → la UI de gestión funciona sin tocar el frontend ni el contrato. Coherente con A9 (apps) y A10 (sub-contrato de registrar).
