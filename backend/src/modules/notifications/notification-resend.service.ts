import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProvisioningCacheService } from '../../core/provisioning/provisioning-cache.service';
import type { SuspensionReason } from '../../core/provisioning/types';

import { PrismaService } from '../../core/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from './notifications.service';
import {
  isServiceLifecycleTemplateKey,
  type ServiceLifecycleTemplateKey,
} from './notification-resend.constants';

/**
 * Sprint 15C.II Fase F.11.2 — Amendment II frozen 2026-05-19 (P1 rate
 * limiting post-PR original).
 *
 * Ventana del cooldown server-side per `(actor_user_id, service_id,
 * template_key)` del endpoint admin `POST /admin/services/:id/notifications/resend`.
 *
 * **60s default** — corto pero defensivo: protege contra el spam burst
 * (doble-click accidental del admin o script con bucle) sin frustrar al
 * admin legítimo que reenvía la misma plantilla al mismo servicio tras
 * un rato razonable. Más restrictivo que `RECONCILE_SINGLE_COOLDOWN_SECONDS`
 * (30s) porque `reconcileOne` es read-mostly mientras que reenviar
 * notificación es side-effect sobre el cliente (mailbox + campana).
 *
 * Heredable a 15D RC / 15E Docker / 15G Plesk: cualquier endpoint admin
 * que dispare side-effects al cliente reutiliza este patrón cambiando
 * el slug de la clave Redis.
 */
export const RESEND_NOTIFICATION_COOLDOWN_SECONDS = 60;

/**
 * Sprint 15C.II Fase F.11.2 (R2+R4 frozen §A.11.10.8.2 + Amendment I).
 *
 * Servicio canónico para reenviar al cliente notificaciones de
 * lifecycle del service desde el panel admin (`POST
 * /admin/services/:id/notifications/resend`). Cierra el cabo "el cliente
 * no encuentra el email original / quiere otra copia".
 *
 * Doctrina canónica (R2 frozen — re-render fresh):
 *   - El payload se reconstruye desde el estado **actual** del Service
 *     (status, domain, suspension_reason, etc.). El dispatcher de
 *     `NotificationsService` ya re-renderiza fresh vía Handlebars contra
 *     la plantilla viva en `NotificationTemplate` (admin pudo editarla
 *     post-envío). NO se re-encola el render histórico del
 *     `notification_log`.
 *
 *   - Coherente con la doctrina F.4 A1 — el reenvío es una acción admin
 *     sobre el estado actual del lifecycle, no una re-emisión de un
 *     evento histórico.
 *
 *   - El listener original (`notifications-on-service-suspended.listener`,
 *     etc.) NO se re-dispara — el endpoint llama directamente al
 *     dispatcher con el payload reconstruido. Razón: re-emitir el evento
 *     dispararía OTROS listeners (audit, billing, etc.) — el reenvío es
 *     SOLO la notificación al cliente, no una nueva transición.
 *
 * Defense-in-depth (R4 frozen):
 *   - `template_key` validado en el DTO con `@IsIn(whitelist)` y vuelto
 *     a validar defensivamente aquí (`isServiceLifecycleTemplateKey`)
 *     antes del dispatch — el frontend solo refleja la whitelist pero el
 *     enforce real vive en backend.
 *
 * El método devuelve `{ ok, dispatched_to_user_id, template_key }`. El
 * dispatch en sí es asíncrono via BullMQ — el processor consume el job
 * y resuelve/renderiza/entrega. Una excepción aquí significa que el
 * trabajo NO se encoló (Service no existe, sin user_id, template_key
 * inválido).
 */
@Injectable()
export class NotificationResendService {
  private readonly logger = new Logger(NotificationResendService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    // Sprint 15C.II Fase F.11.2 Amendment II (P1 rate limiting) — cooldown
    // server-side per `(actor_user_id, service_id, template_key)` con TTL 60s.
    // Patrón canónico heredado de F.3 B.1 + F.9. Fail-OPEN si Redis cae.
    private readonly cache: ProvisioningCacheService,
  ) {}

  /**
   * Reenvía una de las plantillas de service-lifecycle (whitelist
   * `NOTIFICATION_TEMPLATE_WHITELIST_SERVICE_LIFECYCLE`) al dueño del
   * servicio, re-renderizada fresh contra el estado actual del Service.
   *
   * Audit R5 frozen — registra `audit_access_log` con action
   * `resend_notification` + metadata enriquecida (`template_key`,
   * `target_user_id`, `service_id`, `resource_type`). NO incluye
   * `rendered_subject`/`rendered_body` (cero PII en audit). NO incluye
   * `notification_id` por arquitectura asíncrona (BullMQ encola el job
   * sin devolver id en sync) — el cross-check vive en `notification_log`
   * filtrado por `service_id` + `user_id` + timestamp del audit.
   *
   * Audit fail-open (R7): si `auditService.logAccess` falla, la
   * notificación YA está encolada — perder el audit no debe deshacer
   * el side-effect.
   */
  async resendServiceLifecycleNotification(
    serviceId: string,
    templateKey: ServiceLifecycleTemplateKey,
    actorUserId: string,
    ctx: { ipAddress: string; userAgent: string | null },
  ): Promise<{
    ok: true;
    template_key: ServiceLifecycleTemplateKey;
    dispatched_to_user_id: string;
  }> {
    // Defensa: aunque el DTO ya valida @IsIn, re-chequeamos aquí —
    // el endpoint admin podría refactorizarse a aceptar params dinámicos
    // y la guardia no se debe descansar en el DTO. TS narrow lo reduce
    // a `never` dentro del if; usamos `String()` para serializar
    // defensivamente en el mensaje sin asumir el tipo.
    if (!isServiceLifecycleTemplateKey(templateKey)) {
      throw new BadRequestException({
        code: 'INVALID_TEMPLATE_KEY',
        message: `Plantilla "${String(templateKey)}" no está en la whitelist de service-lifecycle.`,
      });
    }

    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
      select: {
        id: true,
        user_id: true,
        domain: true,
        label: true,
        status: true,
        suspension_reason: true,
        provisioner_slug: true,
      },
    });
    if (!service) {
      throw new NotFoundException(`Service ${serviceId} no encontrado`);
    }

    // Sprint 15C.II Fase F.11.2 Amendment II (P1 rate limiting, frozen
    // 2026-05-19) — cooldown server-side per `(actor, service, template)`
    // con TTL 60s. Protege al cliente del spam (mailbox + campana)
    // independientemente del frontend. Heredable.
    const acquired = await this.cache.tryAcquireResendNotificationCooldown(
      actorUserId,
      serviceId,
      templateKey,
      RESEND_NOTIFICATION_COOLDOWN_SECONDS,
    );
    if (!acquired) {
      const retryAfter =
        await this.cache.getResendNotificationCooldownRemainingSeconds(
          actorUserId,
          serviceId,
          templateKey,
          RESEND_NOTIFICATION_COOLDOWN_SECONDS,
        );
      this.logger.warn(
        `Admin resend rate-limited: actor=${actorUserId} service=${serviceId} ` +
          `template=${templateKey} retry_after=${retryAfter}s`,
      );
      throw new HttpException(
        {
          code: 'RESEND_TOO_FREQUENT',
          message:
            'Ya se envió esta plantilla a este servicio hace pocos segundos. Espera antes de reintentarlo.',
          retry_after_seconds: retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const appUrl = this.config.get<string>(
      'NEXT_PUBLIC_APP_URL',
      'http://localhost:3002',
    );
    const displayDomain = service.domain ?? service.label ?? service.id;

    const payload = this.buildFreshPayload(
      templateKey,
      service,
      displayDomain,
      appUrl,
    );

    await this.notifications.dispatchToUser(
      templateKey,
      payload,
      service.user_id,
    );

    this.logger.log(
      `Admin resend: ${templateKey} dispatched to user=${service.user_id} ` +
        `(service=${serviceId} plugin=${service.provisioner_slug ?? 'none'})`,
    );

    // Audit R5 frozen — registra solo después de encolar OK. fail-open.
    await this.audit.logAccess({
      user_id: actorUserId,
      action: 'resend_notification',
      ip_address: ctx.ipAddress,
      user_agent: ctx.userAgent,
      resource: `Service:${serviceId}`,
      metadata: {
        resource_type: 'Service',
        resource_id: serviceId,
        target_user_id: service.user_id,
        template_key: templateKey,
      },
    });

    return {
      ok: true,
      template_key: templateKey,
      dispatched_to_user_id: service.user_id,
    };
  }

  /**
   * Dispatcher map (R2 frozen — fresh re-render): construye el payload
   * desde el estado actual del Service por template_key. Cada rama
   * espeja la forma del payload del listener original (mantener
   * sincronizado al añadir variables a la plantilla).
   *
   * `service.suspended` lee `suspension_reason` con el parseo defensivo
   * canónico (cadena combinada `"<reason>"` o `"<reason>: <internal_note>"`
   * — ver `parseSuspensionReasonCode`). El cliente NUNCA ve la
   * `internal_note` — solo la etiqueta canónica vía Handlebars `{{#if
   * is_overdue_payment}}` ramifica el CTA.
   */
  private buildFreshPayload(
    templateKey: ServiceLifecycleTemplateKey,
    service: {
      id: string;
      suspension_reason: string | null;
    },
    displayDomain: string,
    appUrl: string,
  ): Record<string, unknown> {
    switch (templateKey) {
      case 'service.suspended': {
        const reason = parseSuspensionReasonCode(service.suspension_reason);
        return {
          service_id: service.id,
          domain: displayDomain,
          reason_label: SUSPENSION_REASON_LABEL_ES[reason],
          is_overdue_payment: reason === 'overdue_payment',
          is_maintenance: reason === 'scheduled_maintenance',
          billing_url: `${appUrl}/dashboard/billing`,
          support_url: `${appUrl}/dashboard/support`,
        };
      }
      case 'service.unsuspended': {
        return {
          service_id: service.id,
          domain: displayDomain,
          panel_url: `${appUrl}/dashboard/services/${service.id}`,
        };
      }
      case 'service.cancelled': {
        return {
          service_id: service.id,
          domain: displayDomain,
          support_url: `${appUrl}/dashboard/support`,
        };
      }
    }
  }
}

/**
 * Espejo defensivo del helper canónico que usa el listener original
 * (`notifications-on-service-suspended.listener.ts`). Parseo del campo
 * combinado `suspension_reason` ("<reason>" o "<reason>: <internal_note>")
 * a la taxonomía canónica `SuspensionReason`. Valores no canónicos →
 * `'other'` (el email dirige a soporte).
 */
const CANONICAL_REASONS = new Set<SuspensionReason>([
  'overdue_payment',
  'abuse_investigation',
  'scheduled_maintenance',
  'gdpr_restriction',
  'other',
]);

function parseSuspensionReasonCode(raw: string | null): SuspensionReason {
  if (!raw) return 'other';
  const sep = raw.indexOf(': ');
  const prefix = (sep >= 0 ? raw.slice(0, sep) : raw).trim();
  return CANONICAL_REASONS.has(prefix as SuspensionReason)
    ? (prefix as SuspensionReason)
    : 'other';
}

const SUSPENSION_REASON_LABEL_ES: Record<SuspensionReason, string | undefined> =
  {
    overdue_payment: 'Falta de pago',
    abuse_investigation: 'Revisión de seguridad en curso',
    scheduled_maintenance: 'Mantenimiento programado',
    gdpr_restriction: 'Restricción del tratamiento (RGPD)',
    other: undefined,
  };
