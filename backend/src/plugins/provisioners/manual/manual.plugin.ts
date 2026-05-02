import { Injectable, Logger } from '@nestjs/common';

import {
  ActionResult,
  PROVISIONER_PLUGIN_CONTRACT_VERSION,
  PluginCapabilities,
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
 * Sprint 11 Fase 11.C (2026-05-02) — Plugin trivial `manual`.
 *
 * Ámbito canónico (ADR-077 §3 mapping inicial): productos cuya activación
 * requiere intervención humana del agente (ej. hosting-pro hoy, productos
 * que necesitan setup mediante un panel SaaS sin API automatizable, o
 * cualquier servicio con onboarding manual).
 *
 * Comportamiento:
 *   - `provision()` → `followUp: ['create_setup_task']`. El orquestador
 *     crea Task `type='support_setup'` en cola pública (assigned_to=null,
 *     ADR-072). El agente que la complete dispara `task.completed`,
 *     consumido por `ProvisioningOnTaskCompletedListener` (Fase 11.C),
 *     que activa el servicio.
 *   - `capabilities.completes_via_task = true` ← clave: el listener
 *     filtra por este flag. NO se hardcodea `task.type === 'support_setup'`
 *     en el listener; el patrón abre la puerta a Sprint 22 Projects con
 *     plugin `project` reusando el mismo listener.
 *   - `deprovision()` → no-op (la cancelación admin la maneja el
 *     orquestador a nivel de `services.status`; no hay recurso externo
 *     que liberar).
 *   - `getStatus()`/`getServiceInfo()` reportan estado local — el plugin
 *     no consulta proveedor externo porque no existe.
 *   - `getSsoUrl()` → `null`.
 *   - `executeAction()` → `INVALID_PAYLOAD` (catálogo vacío; el cliente
 *     interactúa vía tickets/agente, no inline desde la card).
 *
 * Reglas:
 *   - R4: importa SOLO de `core/provisioning/types`. Enforced por ESLint.
 *   - R7: errores semánticos vía `ProvisionerPluginError`.
 */
@Injectable()
export class ManualProvisionerPlugin implements ProvisionerPlugin {
  private readonly logger = new Logger(ManualProvisionerPlugin.name);

  readonly slug = 'manual';
  readonly contractVersion = PROVISIONER_PLUGIN_CONTRACT_VERSION;

  readonly capabilities: PluginCapabilities = {
    has_sso_panel: false,
    has_metrics: false,
    has_metrics_history: false,
    requires_server: false,
    provision_mode: 'sync',
    completes_via_task: true,
    supports_reconciliation: false,
  };

  readonly inlineActions: readonly ServiceAction[] = [];

  async provision(ctx: ProvisionContext): Promise<ProvisionResult> {
    this.logger.log(
      `Provisioning service ${ctx.service.id} (manual setup task will be created — product=${ctx.service.product.slug}, correlation=${ctx.correlationId}).`,
    );
    return Promise.resolve({
      providerReference: null,
      metadata: {},
      followUp: ['create_setup_task'] as const,
    });
  }

  async deprovision(): Promise<void> {
    return Promise.resolve();
  }

  async getStatus(service: ServiceWithRelations): Promise<ServiceStatusReport> {
    return Promise.resolve({
      status: this.mapServiceStatus(service.status),
      statusReason:
        service.status === 'pending' || service.status === 'provisioning'
          ? 'Pending manual setup by agent'
          : undefined,
      checkedAt: new Date().toISOString(),
    });
  }

  async getServiceInfo(service: ServiceWithRelations): Promise<ServiceInfo> {
    const mappedStatus = this.mapServiceStatus(service.status);
    const info: ServiceInfo = {
      status: mappedStatus,
      statusReason:
        mappedStatus === 'pending'
          ? 'Pending manual setup by agent'
          : undefined,
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
