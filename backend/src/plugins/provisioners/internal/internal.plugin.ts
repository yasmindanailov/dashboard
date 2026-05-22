import { Injectable, Logger } from '@nestjs/common';

import {
  ActionResult,
  EMPTY_PLUGIN_SCHEMA,
  PROVISIONER_PLUGIN_CONTRACT_VERSION,
  PluginCapabilities,
  PluginManifest,
  ProvisionContext,
  ProvisionResult,
  ProvisionerPlugin,
  ProvisionerPluginError,
  ServiceAction,
  ServiceInfo,
  ServiceStatusReport,
  ServiceWithRelations,
  SsoUrl,
} from '../../../core/provisioning/types';

/**
 * Sprint 11 Fase 11.C (2026-05-02) — Plugin trivial `internal`.
 *
 * Ámbito canónico (ADR-077 §3 mapping inicial): productos digitales sin
 * proveedor externo cuya activación termina en el momento del cobro
 * (Support Inside, productos puramente Aelium-side, futuros add-ons
 * digitales sin SaaS de terceros).
 *
 * Comportamiento:
 *   - `provision()` → `followUp: ['mark_active']`. El orquestador marca
 *     `services.status='active'` inmediatamente y emite `service.activated`.
 *   - `deprovision()` → no-op (no hay recurso externo que cancelar; el
 *     orquestador del orquestador maneja `services.status` aparte).
 *   - `getStatus()` → reporta el estado local del service como verdad
 *     externa (no hay verdad fuera de Aelium para estos servicios).
 *   - `getServiceInfo()` → display normalizado canónico para
 *     `/dashboard/services/[id]`.
 *   - `getSsoUrl()` → `null` (no soporta SSO; capability flag declarado).
 *   - `executeAction()` → siempre error `INVALID_PAYLOAD` (catálogo vacío;
 *     defensivo si el orquestador llama por bug).
 *
 * Reglas:
 *   - R4: el plugin importa SOLO de `core/provisioning/types`. NO importa
 *     de `modules/provisioning/*` (orquestador). Enforced por ESLint
 *     `no-restricted-imports`.
 *   - R7: errores semánticos vía `ProvisionerPluginError` con código.
 *   - R12: no persiste secretos en metadata.
 *
 * Tests contract genérico (`tests/unit/plugin-contract.spec.ts`)
 * verifican firma + invariantes ADR-077 §7.
 */
@Injectable()
export class InternalProvisionerPlugin implements ProvisionerPlugin {
  private readonly logger = new Logger(InternalProvisionerPlugin.name);

  readonly slug = 'internal';
  readonly contractVersion = PROVISIONER_PLUGIN_CONTRACT_VERSION;

  readonly capabilities: PluginCapabilities = {
    has_sso_panel: false,
    has_metrics: false,
    has_metrics_history: false,
    requires_server: false,
    provision_mode: 'sync',
    completes_via_task: false,
    supports_reconciliation: false,
    has_dns_management: false, // ADR-077 Amendment A1
    supports_suspend: false, // ADR-077 Amendment A4 — servicios internos no se suspenden
    is_domain_registrar: false, // ADR-077 Amendment A10 — no es registrar de dominios
  };

  readonly inlineActions: readonly ServiceAction[] = [];

  /**
   * Manifest declarativo Sprint 15A — ADR-080 §1.
   * Plugin trivial sin config ni secrets externos: schemas vacíos canónicos.
   */
  readonly manifest: PluginManifest = {
    slug: 'internal',
    version: '1.0.0',
    manifestVersion: 'v1',
    label: 'plugin.internal.label',
    description: 'plugin.internal.description',
    docsUrl: 'docs/features/provisioning/admin.md#plugin-internal',
    settingsCategory: 'provisioner',
    configSchema: EMPTY_PLUGIN_SCHEMA,
    secretsSchema: EMPTY_PLUGIN_SCHEMA,
    testConnectionMethod: null,
  };

  async provision(ctx: ProvisionContext): Promise<ProvisionResult> {
    this.logger.log(
      `Provisioning service ${ctx.service.id} (product=${ctx.service.product.slug}, correlation=${ctx.correlationId}).`,
    );
    return Promise.resolve({
      providerReference: null,
      metadata: {},
      followUp: ['mark_active'] as const,
    });
  }

  async deprovision(): Promise<void> {
    return Promise.resolve();
  }

  async getStatus(service: ServiceWithRelations): Promise<ServiceStatusReport> {
    return Promise.resolve({
      status: this.mapServiceStatus(service.status),
      checkedAt: new Date().toISOString(),
    });
  }

  async getServiceInfo(service: ServiceWithRelations): Promise<ServiceInfo> {
    const info: ServiceInfo = {
      status: this.mapServiceStatus(service.status),
      display: {
        primary: service.label ?? service.domain ?? service.product.name,
        secondary: service.product.name,
      },
      capabilities: {
        ...this.capabilities,
        hasSsoPanel: false,
        inlineActions: [],
      },
      availableActions: [],
      fetchedAt: new Date().toISOString(),
    };
    return Promise.resolve(info);
  }

  async getSsoUrl(): Promise<SsoUrl | null> {
    return Promise.resolve(null);
  }

  executeAction(
    _service: ServiceWithRelations,
    actionSlug: string,
    _payload: Record<string, unknown>,
  ): Promise<ActionResult> {
    return Promise.reject(
      new ProvisionerPluginError(
        `Plugin "${this.slug}" does not support inline actions (slug="${actionSlug}").`,
        'INVALID_PAYLOAD',
        false,
      ),
    );
  }

  private mapServiceStatus(serviceStatus: string): ServiceInfo['status'] {
    switch (serviceStatus) {
      case 'active':
        return 'active';
      case 'cancelled':
        return 'cancelled';
      case 'terminated':
        return 'cancelled';
      case 'suspended':
        return 'suspended';
      case 'expired':
        return 'expired';
      case 'pending':
      case 'provisioning':
        return 'pending';
      case 'failed':
        return 'failed';
      default:
        return 'unknown';
    }
  }
}
