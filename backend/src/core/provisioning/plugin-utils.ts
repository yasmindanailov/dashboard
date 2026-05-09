import { ForbiddenException, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import type { AuditService } from '../../modules/audit/audit.service';
import { getErrorMessage } from '../common/utils/error.util';

import type { CircuitBreakerRegistry } from './circuit-breaker';
import { CircuitOpenError } from './circuit-breaker';
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
 * Sprint 15A Fase F (ADR-080 §5) — envuelto con circuit breaker:
 *   - Cache hit → no se invoca al proveedor ni al breaker.
 *   - Cache miss → ejecuta vía breaker. Si breaker open, devuelve fallback
 *     `unknown` cacheado 30s (mismo path que ProvisionerPluginError no-retriable).
 *
 * Estrategia de errores (degradación elegante):
 *   - Si breaker está open → fallback unknown (sin tocar al proveedor).
 *   - Si plugin lanza ProvisionerPluginError(retriable=false): se cachea
 *     un payload corto con `status='unknown'` por 30s para evitar martillar
 *     al proveedor. UI muestra warning.
 *   - Si plugin lanza otro error: se rethrow (orquestador decide). El
 *     breaker contabiliza el fallo internamente.
 *   - Si Redis falla: se llama al plugin igual (cache fail-open).
 */
export async function getServiceInfoWithCache(
  plugin: ProvisionerPlugin,
  service: ServiceWithRelations,
  cache: ProvisioningCacheService,
  events: EventEmitter2,
  options: GetServiceInfoOptions,
  breakers?: CircuitBreakerRegistry,
): Promise<ServiceInfo> {
  const logger = new Logger(SPRINT_11_LOGGER_PREFIX);

  if (!options.forceRevalidate) {
    const cached = await cache.get<ServiceInfo>(service.id);
    if (cached) return cached;
  }

  const startedAt = Date.now();
  const breaker = breakers?.getOrCreate(`${plugin.slug}:getServiceInfo`);

  try {
    const info = breaker
      ? await breaker.execute(() => plugin.getServiceInfo(service))
      : await plugin.getServiceInfo(service);
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
    if (err instanceof CircuitOpenError) {
      logger.warn(
        `Circuit open for ${plugin.slug}/getServiceInfo (service ${service.id}). Returning unknown fallback.`,
      );
      const fallback: ServiceInfo = buildUnknownStateFallback(service, plugin);
      await cache.set(service.id, fallback, 30);
      return fallback;
    }

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
  /**
   * Sprint 15C Fase 15C.E (ADR-077 Amendment A3) — `true` si el actor
   * tiene rol staff (`superadmin` / `agent_*`). Usado para enforce
   * `ServiceAction.adminOnly`: si `declared.adminOnly && !actorIsAdmin` →
   * HTTP 403 + audit `service.action_admin_only_violation`.
   *
   * El controller decide el valor (ej. `ADMIN_ROLES.includes(req.user.role.slug)`)
   * y lo pasa al wrapper. NO se infiere de los permisos CASL — esos son
   * grano grueso (Action.Update sobre Subject.Service); este flag es
   * grano fino por inline action.
   */
  actorIsAdmin: boolean;
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
  breakers?: CircuitBreakerRegistry,
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

  // Sprint 15C Fase 15C.E (ADR-077 Amendment A3 + ADR-083 Amendment A3) —
  // enforcement adminOnly. Defense-in-depth: el frontend ya filtra acciones
  // por rol, pero el backend nunca confía en el frontend. Audit pesado +
  // evento canónico para visibilidad operativa de intentos.
  if (declared.adminOnly && !ctx.actorIsAdmin) {
    logger.warn(
      `Forbidden: non-admin actor=${ctx.actorUserId} attempted adminOnly action="${actionSlug}" on plugin=${plugin.slug} service=${service.id}`,
    );
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

  // Sprint 15A Fase F (ADR-080 §5) — envuelto con circuit breaker.
  // Si breaker open → fail-fast con `action.circuit_open` (mejor UX que
  // esperar 30s a un timeout del proveedor caído).
  const breaker = breakers?.getOrCreate(`${plugin.slug}:executeAction`);

  let result: ActionResult;
  try {
    result = breaker
      ? await breaker.execute(() =>
          plugin.executeAction(service, actionSlug, payload),
        )
      : await plugin.executeAction(service, actionSlug, payload);
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      logger.warn(
        `Circuit open for ${plugin.slug}/executeAction (action=${actionSlug}, service=${service.id}). Failing fast.`,
      );
      result = {
        success: false,
        message: 'action.circuit_open',
      };
    } else {
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
  /**
   * Sprint 15C Fase 15C.E — campo opcional propagado desde el controller
   * para uniformar el shape del contexto en los 3 wrappers cross-cutting.
   * `getSsoUrlWithAudit` no enforce el flag (no aplica a SSO), pero
   * acepta el campo para que callers (`ProvisioningService`) no necesiten
   * un objeto literal específico por wrapper.
   */
  actorIsAdmin?: boolean;
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
