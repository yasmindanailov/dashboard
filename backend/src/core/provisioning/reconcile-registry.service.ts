import { BadRequestException, Injectable, Logger } from '@nestjs/common';

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
}
