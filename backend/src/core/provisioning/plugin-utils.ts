import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import type { AuditService } from '../../modules/audit/audit.service';
import { getErrorMessage } from '../common/utils/error.util';

import type { ProvisioningCacheService } from './provisioning-cache.service';
import {
  ActionResult,
  ProvisionerPlugin,
  ProvisionerPluginError,
  ServiceAction,
  ServiceInfo,
  ServiceWithRelations,
  SsoUrl,
} from './types';

/**
 * Sprint 11 Fase 11.B (2026-05-01) — wrappers cross-cutting canónicos.
 * Materializan ADR-077 §5 (pipeline de invocación orquestador → plugin).
 *
 * Doctrina canónica:
 *   - Los plugins NUNCA llaman directamente a Redis, EventEmitter ni
 *     AuditService. El plugin recibe los datos por parámetro y devuelve
 *     el resultado. La interceptación cross-cutting vive en estos 3 wrappers.
 *   - Esto materializa R4 (plugins no se importan desde core) — los plugins
 *     importan de `core/provisioning/types` (contrato) + `core/provisioning/plugin-utils`
 *     (librería de wrappers). NO importan de `modules/provisioning` (orquestador).
 *   - R7 + R11 (errores y circuit breaker básico) se aplican aquí.
 *
 * Eventos emitidos (consumidos por `audit` y `notifications`):
 *   - `service.metrics_fetched` — cuando getServiceInfo() lee del proveedor (cache miss).
 *   - `service.action_executed` — tras executeAction(), incluye success + sideEffects.
 *   - `service.sso_opened` — tras getSsoUrl() exitoso, audit con IP + UA.
 */

const SPRINT_11_LOGGER_PREFIX = 'provisioning.plugin-utils';

// ────────────────────────────────────────────────────────────────────────────
// 1. Wrapper: getServiceInfo con cache
// ────────────────────────────────────────────────────────────────────────────

export interface GetServiceInfoOptions {
  /** TTL en segundos. Default 60. Override por setting `provisioning.service_info_ttl_seconds`. */
  ttlSeconds: number;
  /** Forzar miss + revalidación (admin "Refresh ahora"). */
  forceRevalidate?: boolean;
}

/**
 * Lee `getServiceInfo()` con cache Redis + emisión de evento `service.metrics_fetched`
 * en cache miss para auditoría RGPD (cliente sabe cuándo se consultó al proveedor).
 *
 * Estrategia de errores (degradación elegante):
 *   - Si plugin lanza ProvisionerPluginError(retriable=false): se cachea
 *     un payload corto con `status='unknown'` por 30s para evitar martillar
 *     al proveedor. UI muestra warning.
 *   - Si plugin lanza otro error: se rethrow (orquestador decide).
 *   - Si Redis falla: se llama al plugin igual (cache fail-open).
 */
export async function getServiceInfoWithCache(
  plugin: ProvisionerPlugin,
  service: ServiceWithRelations,
  cache: ProvisioningCacheService,
  events: EventEmitter2,
  options: GetServiceInfoOptions,
): Promise<ServiceInfo> {
  const logger = new Logger(SPRINT_11_LOGGER_PREFIX);

  if (!options.forceRevalidate) {
    const cached = await cache.get<ServiceInfo>(service.id);
    if (cached) return cached;
  }

  const startedAt = Date.now();

  try {
    const info = await plugin.getServiceInfo(service);
    await cache.set(service.id, info, options.ttlSeconds);

    events.emit('service.metrics_fetched', {
      service_id: service.id,
      user_id: service.user_id,
      provisioner_slug: plugin.slug,
      fetched_at: new Date().toISOString(),
      source_latency_ms: Date.now() - startedAt,
    });

    return info;
  } catch (err) {
    if (err instanceof ProvisionerPluginError && !err.retriable) {
      logger.warn(
        `Plugin ${plugin.slug} returned non-retriable error for service ${service.id}: ${err.code}`,
      );
      const fallback: ServiceInfo = buildUnknownStateFallback(service, plugin);
      // Short TTL para evitar martillar al proveedor mientras el problema se resuelve.
      await cache.set(service.id, fallback, 30);
      return fallback;
    }

    logger.error(
      `getServiceInfo failed for ${plugin.slug}/${service.id}: ${getErrorMessage(err)}`,
    );
    throw err;
  }
}

function buildUnknownStateFallback(
  service: ServiceWithRelations,
  plugin: ProvisionerPlugin,
): ServiceInfo {
  return {
    status: 'unknown',
    statusReason: 'Provider unavailable',
    display: {
      primary: service.label ?? service.domain ?? service.id,
      secondary: service.product.name,
    },
    capabilities: {
      ...plugin.capabilities,
      hasSsoPanel: false,
      inlineActions: [],
    },
    availableActions: [],
    fetchedAt: new Date().toISOString(),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 2. Wrapper: executeAction con invalidación de cache + audit
// ────────────────────────────────────────────────────────────────────────────

export interface ExecuteActionContext {
  /** ID del usuario que dispara la acción (cliente final, normalmente). */
  actorUserId: string;
  /** IP de la request (audit RGPD). */
  ipAddress: string;
  /** User-Agent (audit RGPD). */
  userAgent?: string | null;
}

/**
 * Ejecuta una acción inline:
 *   1. Valida que `actionSlug` está en `plugin.inlineActions[].slug`.
 *   2. Llama a `plugin.executeAction()`.
 *   3. Invalida cache `service_info:<id>` (forzar próxima lectura fresh).
 *   4. Emite `service.action_executed` (consumido por audit + notificaciones).
 *   5. Persiste audit log explícito vía `AuditService.logChange`.
 *
 * Si el plugin lanza `ProvisionerPluginError(INVALID_PAYLOAD)` o el slug no
 * está registrado, se devuelve `success=false` con el código del error
 * (no se relanza — el frontend renderiza el mensaje al cliente).
 */
export async function executeActionWithCacheInvalidation(
  plugin: ProvisionerPlugin,
  service: ServiceWithRelations,
  actionSlug: string,
  payload: Record<string, unknown>,
  ctx: ExecuteActionContext,
  cache: ProvisioningCacheService,
  events: EventEmitter2,
  audit: AuditService,
): Promise<ActionResult> {
  const logger = new Logger(SPRINT_11_LOGGER_PREFIX);

  const declared: ServiceAction | undefined = plugin.inlineActions.find(
    (a) => a.slug === actionSlug,
  );
  if (!declared) {
    logger.warn(
      `Action slug "${actionSlug}" not declared by plugin ${plugin.slug}`,
    );
    return {
      success: false,
      message: 'action.unknown',
    };
  }

  let result: ActionResult;
  try {
    result = await plugin.executeAction(service, actionSlug, payload);
  } catch (err) {
    const code =
      err instanceof ProvisionerPluginError
        ? err.code
        : 'PROVIDER_INTERNAL_ERROR';
    logger.error(
      `executeAction ${actionSlug} failed for ${plugin.slug}/${service.id}: ${code} — ${getErrorMessage(err)}`,
    );
    result = {
      success: false,
      message:
        code === 'INVALID_PAYLOAD'
          ? 'action.invalid_payload'
          : 'action.provider_error',
    };
  }

  // Invalidación de cache siempre (incluso si falló — el estado puede haber cambiado parcialmente).
  await cache.invalidate(service.id);

  // Audit log explícito (R3 + ADR-017).
  await audit.logChange({
    user_id: ctx.actorUserId,
    entity_type: 'Service',
    entity_id: service.id,
    action: `service.action_executed:${actionSlug}`,
    changes_after: {
      provisioner_slug: plugin.slug,
      success: result.success,
      side_effects: result.sideEffects ?? [],
    },
  });

  // Evento canónico para consumidores async (notifications, métricas).
  events.emit('service.action_executed', {
    service_id: service.id,
    user_id: service.user_id,
    actor_user_id: ctx.actorUserId,
    provisioner_slug: plugin.slug,
    action_slug: actionSlug,
    success: result.success,
    side_effects: result.sideEffects ?? [],
    destructive: declared.destructive,
    ip: ctx.ipAddress,
  });

  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// 3. Wrapper: getSsoUrl con audit
// ────────────────────────────────────────────────────────────────────────────

export interface GetSsoUrlContext {
  actorUserId: string;
  ipAddress: string;
  userAgent?: string | null;
}

/**
 * Devuelve URL de SSO al panel del proveedor:
 *   1. Llama plugin.getSsoUrl(service).
 *   2. Si null → devuelve null (UI oculta botón).
 *   3. Si url → emite `service.sso_opened` + audit log.
 *
 * El plugin SOLO genera la URL — no audita ni emite eventos.
 */
export async function getSsoUrlWithAudit(
  plugin: ProvisionerPlugin,
  service: ServiceWithRelations,
  ctx: GetSsoUrlContext,
  events: EventEmitter2,
  audit: AuditService,
): Promise<SsoUrl | null> {
  const logger = new Logger(SPRINT_11_LOGGER_PREFIX);

  if (!plugin.capabilities.has_sso_panel) {
    return null;
  }

  let sso: SsoUrl | null;
  try {
    sso = await plugin.getSsoUrl(service);
  } catch (err) {
    logger.error(
      `getSsoUrl failed for ${plugin.slug}/${service.id}: ${getErrorMessage(err)}`,
    );
    return null;
  }

  if (!sso) {
    return null;
  }

  // Audit obligatorio (ADR-077 §1, ADR-017).
  await audit.logAccess({
    user_id: ctx.actorUserId,
    action: 'sso_panel_open',
    ip_address: ctx.ipAddress,
    user_agent: ctx.userAgent ?? null,
    resource: 'Service',
    metadata: {
      resource_id: service.id,
      provisioner_slug: plugin.slug,
      panel_label: sso.panelLabel,
    },
  });

  events.emit('service.sso_opened', {
    service_id: service.id,
    user_id: service.user_id,
    actor_user_id: ctx.actorUserId,
    provisioner_slug: plugin.slug,
    panel_label: sso.panelLabel,
    ip: ctx.ipAddress,
  });

  return sso;
}
