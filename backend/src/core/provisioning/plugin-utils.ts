import { ForbiddenException, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import type { AuditService } from '../../modules/audit/audit.service';
import { getErrorMessage } from '../common/utils/error.util';

import { redactSensitiveFields } from './audit-sanitizer';
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
    // Sprint 15C.II Fase E — ADR-077 Amendment A5: el proveedor no respondió
    // (circuit open / timeout / error de red). NO es un drift re-aprovisionable
    // — el plugin ni siquiera pudo leer. La UI muestra el estado pero no ofrece
    // CTA de recuperación (re-aprovisionar sobre un proveedor caído fallaría).
    recoveryHint: 'contact_support',
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
      // Sprint 15C.II Fase C round 5 (smoke real Yasmin 2026-05-10):
      // distinguir 3 categorías de error en lugar de colapsar todo a
      // `action.provider_error` genérico. La UI puede dar mensajes
      // útiles según la causa raíz:
      //   - INVALID_PAYLOAD → form/data del usuario incorrecta.
      //   - INVALID_STATE → drift detectable (recurso no existe en el
      //     proveedor — ej. login_id stale, member missing). Admin
      //     necesita force_resync o investigar en panel.
      //   - resto → error genérico transitorio (red, 5xx, etc.).
      // Heredable a 15D RC, 15E Docker, 15G Plesk.
      let message: string;
      if (code === 'INVALID_PAYLOAD') {
        message = 'action.invalid_payload';
      } else if (code === 'INVALID_STATE') {
        message = 'action.invalid_state';
      } else {
        message = 'action.provider_error';
      }
      result = {
        success: false,
        message,
      };
    }
  }

  // Invalidación de cache siempre (incluso si falló — el estado puede haber cambiado parcialmente).
  await cache.invalidate(service.id);

  // Sprint 15C.II Fase D (ADR-083 Amendment A4.5 — gap G2): sanitiza
  // `result.data` antes de persistir audit_change_log. R12 compliance:
  // secrets nunca audit. El regex canónico
  // `/(password|secret|token|apiKey|privateKey)/i` matchea las keys
  // sensibles y las sustituye por '[REDACTED]'. Plugins pueden declarar
  // `ServiceAction.allowsSensitiveDataInAudit` para excepciones (uncommon
  // — requiere ADR específico). Heredable a 15D RC, 15E Docker, 15G Plesk.
  //
  // El EVENTO emitido abajo conserva `result.data` plaintext para que
  // listeners async (ej. `notifications-on-password-reset` Sprint 15C.II
  // Fase D) reciban la password temporal en memoria y la envíen al
  // cliente por email. La persistencia (audit_change_log) NUNCA ve el
  // plaintext.
  const sanitizedDataForAudit =
    result.data !== undefined
      ? redactSensitiveFields(
          result.data,
          declared.allowsSensitiveDataInAudit ?? [],
        )
      : undefined;

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
      ...(sanitizedDataForAudit !== undefined
        ? { data: sanitizedDataForAudit }
        : {}),
    },
  });

  // Evento canónico para consumidores async (notifications, métricas).
  // CONSERVA `result.data` plaintext — los listeners (in-memory, no
  // persistente) reciben datos sensibles para enviarlos al destinatario
  // legítimo (ej. password reset email al cliente). La sanitización solo
  // aplica a la fila persistida en audit_change_log (arriba).
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
    data: result.data,
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
 *   4. Sprint 15C Fase 15C.F (ADR-083 §4 decisión 14 + §6 evento canónico):
 *      Si el actor es staff Y el service NO le pertenece (impersonation real),
 *      emite ADEMÁS `service.admin_sso_impersonation` con shape GDPR-flagged.
 *      Listener `audit-on-admin-sso-impersonation` lo persiste en
 *      `audit_access_log` con `metadata.target_user_id = service.user_id` para
 *      que el portal `/dashboard/transparency` del cliente afectado lo exponga.
 *
 * El plugin SOLO genera la URL — no audita ni emite eventos.
 *
 * Predicado canónico de impersonation: `actorIsAdmin && service.user_id !== actorUserId`.
 *   - Admin abriendo SU PROPIO servicio (caso edge raro) → solo `service.sso_opened`.
 *   - Admin abriendo servicio AJENO → ambos eventos.
 *   - Cliente abriendo su servicio → solo `service.sso_opened`.
 *   - Cliente abriendo ajeno → bloqueado en `provisioning.service.getSsoForUser`
 *     (ForbiddenException antes de llegar aquí).
 */
/**
 * Sprint 15C.II Fase C round 5 (smoke real Yasmin 2026-05-10) — shape
 * canónico de retorno del wrapper SSO. Antes retornaba `SsoUrl | null`,
 * lo que colapsaba 3 escenarios distintos en `null` indistinguible:
 *   1. Plugin no soporta SSO (`has_sso_panel=false`) → caso legítimo
 *      "esta funcionalidad no aplica" — la UI puede ocultar el botón.
 *   2. Plugin retornó `null` por refs missing en metadata (caso típico
 *      `not_yet_provisioned`) → ya manejado por el banner drift upstream.
 *   3. Plugin lanzó `INVALID_STATE` (recurso no existe en proveedor —
 *      ej. login_id stale, member missing) → drift detectable. Admin
 *      necesita info útil ("considera force_resync" / "investiga panel").
 *
 * El nuevo shape `{ sso, errorCode }` permite a la UI dar mensajes
 * específicos por causa raíz. Heredable a 15D RC, 15E Docker, 15G Plesk.
 */
export interface GetSsoUrlResult {
  sso: SsoUrl | null;
  /**
   * `null` (default) si caso legítimo (plugin no soporta SSO o refs
   * missing). Code canónico ProvisionerPluginError si el plugin lanzó
   * error real (típicamente `'INVALID_STATE'` para drift detectable).
   */
  errorCode: string | null;
}

export async function getSsoUrlWithAudit(
  plugin: ProvisionerPlugin,
  service: ServiceWithRelations,
  ctx: GetSsoUrlContext,
  events: EventEmitter2,
  audit: AuditService,
): Promise<GetSsoUrlResult> {
  const logger = new Logger(SPRINT_11_LOGGER_PREFIX);

  if (!plugin.capabilities.has_sso_panel) {
    return { sso: null, errorCode: null };
  }

  let sso: SsoUrl | null;
  try {
    sso = await plugin.getSsoUrl(service);
  } catch (err) {
    const code =
      err instanceof ProvisionerPluginError
        ? err.code
        : 'PROVIDER_INTERNAL_ERROR';
    logger.error(
      `getSsoUrl failed for ${plugin.slug}/${service.id}: ${getErrorMessage(err)}`,
    );
    return { sso: null, errorCode: code };
  }

  if (!sso) {
    return { sso: null, errorCode: null };
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

  // Sprint 15C Fase 15C.F — admin impersonation (ADR-083 §4 decisión 14).
  // Predicado canónico: staff + service de OTRO usuario. Shape canónico
  // congelado en ADR-083 §6 — listener `audit-on-admin-sso-impersonation`
  // lo persiste con `metadata.target_user_id = service.user_id` para que
  // el portal de transparencia del cliente afectado lo exponga.
  if (ctx.actorIsAdmin === true && service.user_id !== ctx.actorUserId) {
    events.emit('service.admin_sso_impersonation', {
      service_id: service.id,
      user_id: service.user_id,
      agent_user_id: ctx.actorUserId,
      agent_ip: ctx.ipAddress,
      agent_user_agent: ctx.userAgent ?? null,
      provisioner_slug: plugin.slug,
      panel_label: sso.panelLabel,
      opened_at: new Date().toISOString(),
      gdpr_visible_to_data_subject: true,
    });
  }

  return { sso, errorCode: null };
}
