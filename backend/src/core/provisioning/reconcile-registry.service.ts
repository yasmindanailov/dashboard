import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import {
  ProvisionerPluginError,
  ServiceReconcileResult,
  ServiceWithRelations,
} from './types';

/**
 * Sprint 15C.II Fase B (2026-05-10) — `ReconcileRegistryService`.
 *
 * Materializa [ADR-083 Amendment A4.2](docs/10-decisions/adr-083-plugin-enhance-cp-specifics.md#a42-reconcile-dual-entry-point--naming-honesto-decisión-doctrinal-a2-frozen--gap-g1).
 *
 * Patrón canónico genérico para **cualquier plugin con
 * `capabilities.supports_reconciliation = true`** (ADR-077 §3) que quiera
 * exponer un endpoint admin "Reconciliar todos los servicios contra el
 * proveedor ahora". Cumple doble propósito:
 *
 *   1. **Decisión A2 (UX dual entry point)**: botón "↻ Reconciliar todos
 *      los servicios contra Enhance ahora" en `/admin/settings/plugins/[slug]`
 *      sin tener que esperar la siguiente ventana del cron L3 6h.
 *   2. **Gap G1 (vaporware doc)**: la doc operativa `admin-plugins-enhance.md
 *      §6.2 paso 13` afirmaba un endpoint manual cron que NO existía. Este
 *      registry es la materialización canónica que desbloquea smoke testing
 *      manual sin esperar 6h.
 *
 * Doctrina canónica:
 *
 * - **Plugin-agnostic**: este servicio NO conoce a `enhance_cp`,
 *   `resellerclub`, `docker_engine`, etc. Cada módulo de plugin SaaS
 *   registra su executor en `onModuleInit()` (típicamente del cron
 *   reconciliation que ya tiene la lógica). El registry solo guarda el
 *   mapping `slug → executor` y delega.
 *
 * - **Boundaries limpios (R4)**: vive en `core/provisioning/`. El admin-plugins
 *   service lo consume vía DI sin importar nada del módulo plugin concreto.
 *   Los plugins lo registran inyectando esta clase desde `core/provisioning/`.
 *   Cero coupling cross-module.
 *
 * - **Idempotencia + warning en re-register**: si un plugin se registra dos
 *   veces (bug en código, hot-reload dev, doble onModuleInit), el segundo
 *   registro reemplaza al primero pero loguea WARN para detectar el bug.
 *
 * - **Sin polling concurrent**: el caller (admin-plugins service) es responsable
 *   de evitar invocaciones concurrent del mismo slug si lo desea (ej. via
 *   advisory lock o setting flag). Por defecto el registry permite múltiples
 *   `runFor(slug)` en paralelo — el executor del plugin gestiona concurrencia
 *   interna si la necesita.
 *
 * Heredable a 15D RC (`resellerclub` con `supports_reconciliation: true`),
 * 15E Docker Engine, 15G Plesk Obsidian.
 */

/**
 * Función ejecutora canónica de reconciliation para un plugin. Devuelve
 * un resumen normalizado que el admin-plugins service propaga al cliente
 * de la API REST + persiste en audit_change_log.
 */
export type ReconcileExecutor = () => Promise<ReconcileResult>;

/**
 * Sprint 15C.II Fase F.9 (ADR-077 Amendment A8 — dossier §A.11.10.6.2 R1
 * frozen): executor per-servicio que delega al método opcional
 * `plugin.reconcileOne(service)`. Registrado por el cron del propio plugin
 * (typeically en `onModuleInit` paralelo a `register()` del reconcile-all)
 * para evitar inyectar `PluginRegistryService` aquí (rompería el
 * `ReconcileRegistryModule` leaf-importable — ciclo con `ProvisioningModule`
 * que provee `PluginRegistryService`).
 *
 * Convención: el cron del plugin captura su instancia `plugin` y registra
 * `(service) => plugin.reconcileOne!(service)`. Si el plugin NO implementa
 * `reconcileOne`, el cron NO debe llamar a `registerReconcileOne` — la
 * ausencia del executor en el map = capability ausente.
 */
export type ReconcileOneExecutor = (
  service: ServiceWithRelations,
) => Promise<ServiceReconcileResult>;

/**
 * Metadatos opcionales del schedule del plugin, declarados al registrar el
 * executor. Permiten al admin overview (Fase F.2) calcular "próxima
 * reconciliación" sin acoplarse al cron concreto del plugin.
 */
export interface ReconcileScheduleMeta {
  /**
   * Intervalo del cron del plugin en segundos (ej. 6h → 21600). El cálculo
   * de "próxima ejecución" asume ticks alineados a múltiplos del intervalo
   * desde epoch UTC — coincide con `CronExpression.EVERY_*` de @nestjs/schedule.
   */
  readonly intervalSeconds: number;
}

/**
 * Resultado normalizado de una pasada de reconciliation. Cada plugin
 * lo construye a partir de su propio shape interno (ej. `EnhanceReconciliationCron`
 * lo deriva de `ReconciliationSummary`).
 */
export interface ReconcileResult {
  /** Servicios revisados en esta pasada. */
  readonly servicesProcessed: number;
  /** Drifts detectados (suma de todos los sub-tipos). */
  readonly driftsDetected: number;
  /** Duración total en milisegundos de la pasada. */
  readonly durationMs: number;
  /** Detalles libres específicos del plugin (ej. desglose por sub-tipo drift). */
  readonly details?: Readonly<Record<string, unknown>>;
}

@Injectable()
export class ReconcileRegistryService {
  private readonly logger = new Logger(ReconcileRegistryService.name);
  private readonly executors = new Map<string, ReconcileExecutor>();
  private readonly scheduleMeta = new Map<string, ReconcileScheduleMeta>();

  /**
   * Sprint 15C.II Fase F.9 (ADR-077 Amendment A8): mapping paralelo per-servicio.
   * Patrón heredado del `executors` (reconcile-all) para preservar el
   * `ReconcileRegistryModule` leaf-importable (sin ciclo con `ProvisioningModule`
   * que provee `PluginRegistryService`). Cada plugin con `reconcileOne?()`
   * registra su executor en el `onModuleInit` del cron L3 (`enhance_cp`:
   * commit feat 10) — capturing la instancia del plugin en una closure.
   */
  private readonly reconcileOneExecutors = new Map<
    string,
    ReconcileOneExecutor
  >();

  /**
   * Registra un executor para un plugin slug. Típicamente invocado desde
   * el `onModuleInit()` del cron reconciliation del propio plugin.
   *
   * Si ya existe un executor para ese slug, el nuevo lo reemplaza pero
   * se loguea WARN — es síntoma de doble registro (bug). El caso legítimo
   * es solo el primer onModuleInit del proceso.
   *
   * `scheduleMeta` (opcional): intervalo del cron del plugin, usado por el
   * admin overview (Fase F.2) para calcular "próxima reconciliación".
   */
  register(
    slug: string,
    executor: ReconcileExecutor,
    scheduleMeta?: ReconcileScheduleMeta,
  ): void {
    if (this.executors.has(slug)) {
      this.logger.warn(
        `Reconcile executor for plugin "${slug}" already registered — overwriting. ` +
          `This is unexpected outside hot-reload dev scenarios.`,
      );
    }
    this.executors.set(slug, executor);
    if (scheduleMeta) {
      this.scheduleMeta.set(slug, scheduleMeta);
    }
    this.logger.log(`Registered reconcile executor for plugin "${slug}".`);
  }

  /** Metadatos de schedule declarados al registrar el executor, o `null`. */
  getScheduleMeta(slug: string): ReconcileScheduleMeta | null {
    return this.scheduleMeta.get(slug) ?? null;
  }

  /**
   * Ejecuta el executor del plugin. Lanza `BadRequestException` si el slug
   * no tiene executor registrado (el caller debería haber validado primero
   * `capabilities.supports_reconciliation` + `hasExecutor(slug)`).
   *
   * El executor maneja sus propios errores internos y devuelve un
   * `ReconcileResult` normalizado. Si el executor lanza, el error se
   * propaga al caller (admin-plugins service) que decide cómo responder
   * (audit + 500 al cliente).
   */
  async runFor(slug: string): Promise<ReconcileResult> {
    const executor = this.executors.get(slug);
    if (!executor) {
      throw new BadRequestException(
        `Plugin "${slug}" has no reconcile executor registered. ` +
          `Ensure the plugin module registers its executor in onModuleInit(). ` +
          `Available executors: [${this.listRegisteredSlugs().join(', ')}].`,
      );
    }
    return executor();
  }

  /** True si el slug tiene executor registrado. Útil para validación pre-runFor. */
  hasExecutor(slug: string): boolean {
    return this.executors.has(slug);
  }

  /** Lista slugs con executor registrado. Útil para diagnóstico + tests. */
  listRegisteredSlugs(): string[] {
    return Array.from(this.executors.keys()).sort();
  }

  /**
   * Sprint 15C.II Fase F.9 (ADR-077 Amendment A8 — `reconcileOne?(service)`
   * capability-driven, dossier §A.11.10.6.2 R1 frozen).
   *
   * Registra el executor per-servicio del plugin. Típicamente invocado desde
   * el `onModuleInit()` del cron del plugin (mismo lugar que `register()` del
   * reconcile-all). Solo lo invocan los plugins que implementan `reconcileOne`
   * — los demás omiten esta llamada (la ausencia en el map = capability
   * ausente).
   *
   * Idempotencia + warning en re-register (mismo criterio que `register()`).
   */
  registerReconcileOne(slug: string, executor: ReconcileOneExecutor): void {
    if (this.reconcileOneExecutors.has(slug)) {
      this.logger.warn(
        `ReconcileOne executor for plugin "${slug}" already registered — overwriting. ` +
          `This is unexpected outside hot-reload dev scenarios.`,
      );
    }
    this.reconcileOneExecutors.set(slug, executor);
    this.logger.log(`Registered reconcileOne executor for plugin "${slug}".`);
  }

  /**
   * Sprint 15C.II Fase F.9 (ADR-077 Amendment A8 — dossier §A.11.10.6.2 R1
   * frozen).
   *
   * Reconcilia un único servicio invocando el executor registrado del plugin.
   * Garantiza:
   *
   *   - El plugin registró un `ReconcileOneExecutor` (vía
   *     `registerReconcileOne` en su `onModuleInit`). Si no, lanza
   *     `ProvisionerPluginError({ code: 'RECONCILE_ONE_NOT_SUPPORTED',
   *     module: 'reconcile', retriable: false })`. El frontend gatea el CTA
   *     preventivamente leyendo la capability del manifest enriquecido vía
   *     admin overview F.2 — si llega aquí sin soporte es bug del frontend.
   *
   * NO maneja transacciones, cache, audit, eventos ni `ClientNote` — todo eso
   * vive en el orquestador (`ProvisioningService.reconcileServiceAsAdmin`,
   * commit feat 7 F.9). Este registry solo delega y valida la capability.
   *
   * El plugin devuelve el `ServiceReconcileResult` sin tocar `services.status`
   * directamente (el orquestador es la única autoridad para mutar la BD); el
   * shape contiene los drifts detectados + cuáles serían aplicables según R4
   * doctrine (safe-adopt) — el orquestador es quien materializa la mutación.
   */
  async reconcileOne(
    slug: string,
    service: ServiceWithRelations,
  ): Promise<ServiceReconcileResult> {
    const executor = this.reconcileOneExecutors.get(slug);
    if (!executor) {
      throw new ProvisionerPluginError(
        `Plugin "${slug}" no implementa reconcileOne() — la capability per-servicio no está disponible para este proveedor. ` +
          `Frontend debería ocultar el CTA "Reconciliar contra el proveedor" leyendo la capability del manifest.`,
        'RECONCILE_ONE_NOT_SUPPORTED',
        false, // no retriable — es invocación incorrecta del caller (bug frontend)
        undefined,
        'reconcile', // GAP-N F.3: módulo set explícito para error_log.module correcto
      );
    }
    return executor(service);
  }

  /** True si el slug registró executor per-servicio. Útil para tests + diagnóstico. */
  hasReconcileOneExecutor(slug: string): boolean {
    return this.reconcileOneExecutors.has(slug);
  }
}
