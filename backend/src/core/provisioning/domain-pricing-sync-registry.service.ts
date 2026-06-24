import { BadRequestException, Injectable, Logger } from '@nestjs/common';

/**
 * Sprint 15D Fase 15D.G·1 — `DomainPricingSyncRegistryService`.
 *
 * Patrón canónico genérico (espejo de `ReconcileRegistryService`) para que el
 * admin dispare **"sincronizar precios de dominios ahora"** sobre CUALQUIER
 * registrar (`capabilities.is_domain_registrar = true`) sin acoplarse a un slug
 * concreto (R4).
 *
 * Doctrina (igual que el reconcile registry):
 *   - **Plugin-agnostic**: este servicio NO conoce a `resellerclub` ni a futuros
 *     registrars. El cron de pricing de cada registrar registra su executor en
 *     `onModuleInit()` (la lógica `getTldPricing × markup → upsert domain_tld_pricing`
 *     ya vive en el cron). El registry solo guarda `slug → executor` y delega.
 *   - **Boundaries limpios (R4)**: vive en `core/provisioning/`; el módulo admin
 *     (`DomainsModule`) lo consume vía DI sin importar el módulo del plugin.
 *   - **Idempotencia + warning en re-register** (mismo criterio que reconcile).
 *
 * Heredable a 15D.II (transfer/restore pricing) + futuros registrars (15G, …).
 */

/** Resumen normalizado de una pasada de sincronización de precios. */
export interface DomainPricingSyncSummary {
  /** Filas (TLD×operación×años) que el registrar devolvió. */
  total: number;
  /** Filas escritas/actualizadas en `domain_tld_pricing` (source='sync'). */
  written: number;
  /** Omitidas por ser override manual del admin (no se pisan). */
  skippedManual: number;
  /** Omitidas por no estar en `tlds_offered`. */
  skippedNotOffered: number;
  /** Omitidas por moneda ≠ `default_currency` (fail-safe, ADR-084 A1.2). */
  skippedCurrency: number;
  /** Omitidas por coste inválido / error de fila. */
  skippedInvalid: number;
}

/** Executor canónico de sync de pricing de un registrar. */
export type DomainPricingSyncExecutor = () => Promise<DomainPricingSyncSummary>;

@Injectable()
export class DomainPricingSyncRegistryService {
  private readonly logger = new Logger(DomainPricingSyncRegistryService.name);
  private readonly executors = new Map<string, DomainPricingSyncExecutor>();

  /**
   * Registra el executor de sync de pricing de un registrar. Típicamente desde
   * el `onModuleInit()` del cron de pricing del propio plugin. Re-register
   * reemplaza + loguea WARN (síntoma de doble registro fuera de hot-reload dev).
   */
  register(slug: string, executor: DomainPricingSyncExecutor): void {
    if (this.executors.has(slug)) {
      this.logger.warn(
        `Pricing-sync executor for registrar "${slug}" already registered — ` +
          `overwriting. Unexpected outside hot-reload dev scenarios.`,
      );
    }
    this.executors.set(slug, executor);
    this.logger.log(
      `Registered pricing-sync executor for registrar "${slug}".`,
    );
  }

  /**
   * Ejecuta el executor del registrar. Lanza `BadRequestException` si el slug no
   * tiene executor (el caller debe validar `is_domain_registrar` + `hasExecutor`).
   */
  async runFor(slug: string): Promise<DomainPricingSyncSummary> {
    const executor = this.executors.get(slug);
    if (!executor) {
      throw new BadRequestException(
        `Registrar "${slug}" has no pricing-sync executor registered. ` +
          `Available: [${this.listRegisteredSlugs().join(', ')}].`,
      );
    }
    return executor();
  }

  /** True si el slug tiene executor registrado. */
  hasExecutor(slug: string): boolean {
    return this.executors.has(slug);
  }

  /** Slugs con executor registrado (diagnóstico + tests). */
  listRegisteredSlugs(): string[] {
    return Array.from(this.executors.keys()).sort();
  }
}
