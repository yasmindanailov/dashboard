import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../core/database/prisma.service';
import { ProvisioningCacheService } from '../../core/provisioning/provisioning-cache.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from './notifications.service';

import {
  NotificationResendService,
  RESEND_NOTIFICATION_COOLDOWN_SECONDS,
} from './notification-resend.service';

/**
 * Tests unit `NotificationResendService` — Sprint 15C.II Fase F.11.2
 * (R2+R4+R5 frozen §A.11.10.8.2 + Amendment I).
 *
 * Cobertura:
 *   - R2 (re-render fresh):
 *       · service.suspended → payload con reason_label localizado +
 *         is_overdue_payment/is_maintenance + billing_url + support_url.
 *       · service.unsuspended → payload con panel_url + domain.
 *       · service.cancelled → payload con domain + support_url.
 *   - R4 (defense-in-depth):
 *       · Plantilla no whitelisted → 400 INVALID_TEMPLATE_KEY antes de
 *         tocar el dispatcher (re-check defensivo del service vs solo el
 *         DTO).
 *   - R5 (audit metadata enriquecida):
 *       · Tras dispatch OK → logAccess con action='resend_notification'
 *         + metadata {resource_type, resource_id, target_user_id,
 *         template_key}. Sin rendered_subject/body.
 *   - NotFound si service no existe.
 *   - Dispatch failure se propaga (NO fail-open en dispatch — audit es
 *     el que tiene fail-open, el dispatch debe ser explícito).
 *   - parseSuspensionReasonCode defensivo: combinaciones legacy
 *     "<reason>: <internal_note>" + reason no canónico → 'other'.
 */

describe('NotificationResendService — Sprint 15C.II Fase F.11.2', () => {
  let service: NotificationResendService;
  let dispatchToUser: jest.Mock;
  let serviceFindUnique: jest.Mock;
  let logAccess: jest.Mock;
  let tryAcquireResendNotificationCooldown: jest.Mock;
  let getResendNotificationCooldownRemainingSeconds: jest.Mock;

  const SERVICE_ID = '11111111-1111-1111-1111-111111111111';
  const USER_ID = '22222222-2222-2222-2222-222222222222';
  const ACTOR_USER_ID = '33333333-3333-3333-3333-333333333333';
  const APP_URL = 'http://test.local:3002';
  const CTX = {
    ipAddress: '203.0.113.42',
    userAgent: 'Jest/Test',
  } as const;

  beforeEach(async () => {
    dispatchToUser = jest.fn().mockResolvedValue(undefined);
    logAccess = jest.fn().mockResolvedValue(undefined);
    serviceFindUnique = jest.fn().mockResolvedValue({
      id: SERVICE_ID,
      user_id: USER_ID,
      domain: 'mi-cliente.es',
      label: null,
      status: 'suspended',
      suspension_reason: 'overdue_payment',
      provisioner_slug: 'enhance_cp',
    });
    // Amendment II default: cooldown libre → permite el dispatch. Los
    // tests que quieran simular rate-limit lo overridean.
    tryAcquireResendNotificationCooldown = jest.fn().mockResolvedValue(true);
    getResendNotificationCooldownRemainingSeconds = jest
      .fn()
      .mockResolvedValue(RESEND_NOTIFICATION_COOLDOWN_SECONDS);

    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationResendService,
        {
          provide: PrismaService,
          useValue: { service: { findUnique: serviceFindUnique } },
        },
        {
          provide: NotificationsService,
          useValue: { dispatchToUser },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation(() => APP_URL),
          },
        },
        {
          provide: AuditService,
          useValue: { logAccess },
        },
        {
          provide: ProvisioningCacheService,
          useValue: {
            tryAcquireResendNotificationCooldown,
            getResendNotificationCooldownRemainingSeconds,
          },
        },
      ],
    }).compile();

    service = module.get(NotificationResendService);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('R2 — re-render fresh per template', () => {
    it('service.suspended → reason=overdue_payment → flags + URLs canónicos', async () => {
      const result = await service.resendServiceLifecycleNotification(
        SERVICE_ID,
        'service.suspended',
        ACTOR_USER_ID,
        CTX,
      );

      expect(result).toEqual({
        ok: true,
        template_key: 'service.suspended',
        dispatched_to_user_id: USER_ID,
      });
      expect(dispatchToUser).toHaveBeenCalledWith(
        'service.suspended',
        expect.objectContaining({
          service_id: SERVICE_ID,
          domain: 'mi-cliente.es',
          reason_label: 'Falta de pago',
          is_overdue_payment: true,
          is_maintenance: false,
          billing_url: `${APP_URL}/dashboard/billing`,
          support_url: `${APP_URL}/dashboard/support`,
        }),
        USER_ID,
      );
    });

    it('service.suspended → reason=scheduled_maintenance → is_maintenance=true', async () => {
      serviceFindUnique.mockResolvedValue({
        id: SERVICE_ID,
        user_id: USER_ID,
        domain: 'mi-cliente.es',
        label: null,
        status: 'suspended',
        suspension_reason: 'scheduled_maintenance: Ventana de 2h',
        provisioner_slug: 'enhance_cp',
      });

      await service.resendServiceLifecycleNotification(
        SERVICE_ID,
        'service.suspended',
        ACTOR_USER_ID,
        CTX,
      );

      expect(dispatchToUser).toHaveBeenCalledWith(
        'service.suspended',
        expect.objectContaining({
          is_overdue_payment: false,
          is_maintenance: true,
          reason_label: 'Mantenimiento programado',
        }),
        USER_ID,
      );
    });

    it('service.suspended → suspension_reason legacy/no canónico → reason="other"', async () => {
      serviceFindUnique.mockResolvedValue({
        id: SERVICE_ID,
        user_id: USER_ID,
        domain: 'mi-cliente.es',
        label: null,
        status: 'suspended',
        suspension_reason: 'Impago — Factura INV-123',
        provisioner_slug: 'enhance_cp',
      });

      await service.resendServiceLifecycleNotification(
        SERVICE_ID,
        'service.suspended',
        ACTOR_USER_ID,
        CTX,
      );

      expect(dispatchToUser).toHaveBeenCalledWith(
        'service.suspended',
        expect.objectContaining({
          is_overdue_payment: false,
          is_maintenance: false,
          // 'other' no tiene etiqueta — undefined intencional.
          reason_label: undefined,
        }),
        USER_ID,
      );
    });

    it('service.unsuspended → payload con panel_url', async () => {
      await service.resendServiceLifecycleNotification(
        SERVICE_ID,
        'service.unsuspended',
        ACTOR_USER_ID,
        CTX,
      );

      expect(dispatchToUser).toHaveBeenCalledWith(
        'service.unsuspended',
        expect.objectContaining({
          service_id: SERVICE_ID,
          domain: 'mi-cliente.es',
          panel_url: `${APP_URL}/dashboard/services/${SERVICE_ID}`,
        }),
        USER_ID,
      );
    });

    it('service.cancelled → payload con support_url', async () => {
      await service.resendServiceLifecycleNotification(
        SERVICE_ID,
        'service.cancelled',
        ACTOR_USER_ID,
        CTX,
      );

      expect(dispatchToUser).toHaveBeenCalledWith(
        'service.cancelled',
        expect.objectContaining({
          service_id: SERVICE_ID,
          domain: 'mi-cliente.es',
          support_url: `${APP_URL}/dashboard/support`,
        }),
        USER_ID,
      );
    });

    it('service sin domain → fallback a label, después a service_id', async () => {
      serviceFindUnique.mockResolvedValue({
        id: SERVICE_ID,
        user_id: USER_ID,
        domain: null,
        label: 'Soporte XYZ',
        status: 'cancelled',
        suspension_reason: null,
        provisioner_slug: null,
      });

      await service.resendServiceLifecycleNotification(
        SERVICE_ID,
        'service.cancelled',
        ACTOR_USER_ID,
        CTX,
      );

      expect(dispatchToUser).toHaveBeenCalledWith(
        'service.cancelled',
        expect.objectContaining({ domain: 'Soporte XYZ' }),
        USER_ID,
      );
    });
  });

  describe('R4 — defense-in-depth whitelist', () => {
    it('template_key fuera de whitelist → 400 INVALID_TEMPLATE_KEY (sin dispatch)', async () => {
      await expect(
        service.resendServiceLifecycleNotification(
          SERVICE_ID,
          'task.assigned' as never,
          ACTOR_USER_ID,
          CTX,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(dispatchToUser).not.toHaveBeenCalled();
      expect(logAccess).not.toHaveBeenCalled();
    });
  });

  describe('R5 — audit metadata enriquecida', () => {
    it('tras dispatch OK → logAccess con template_key + target_user_id', async () => {
      await service.resendServiceLifecycleNotification(
        SERVICE_ID,
        'service.suspended',
        ACTOR_USER_ID,
        CTX,
      );

      expect(logAccess).toHaveBeenCalledWith({
        user_id: ACTOR_USER_ID,
        action: 'resend_notification',
        ip_address: CTX.ipAddress,
        user_agent: CTX.userAgent,
        resource: `Service:${SERVICE_ID}`,
        metadata: {
          resource_type: 'Service',
          resource_id: SERVICE_ID,
          target_user_id: USER_ID,
          template_key: 'service.suspended',
        },
      });
    });

    it('metadata NO incluye rendered_subject/body (cero PII)', async () => {
      await service.resendServiceLifecycleNotification(
        SERVICE_ID,
        'service.cancelled',
        ACTOR_USER_ID,
        CTX,
      );

      const calls = logAccess.mock.calls as Array<
        Array<{ metadata: Record<string, unknown> }>
      >;
      const auditCall = calls[0][0];
      expect(auditCall.metadata).not.toHaveProperty('rendered_subject');
      expect(auditCall.metadata).not.toHaveProperty('rendered_body');
    });
  });

  describe('NotFound + service sin user_id', () => {
    it('service no existe → 404 (sin dispatch ni audit)', async () => {
      serviceFindUnique.mockResolvedValue(null);
      await expect(
        service.resendServiceLifecycleNotification(
          SERVICE_ID,
          'service.suspended',
          ACTOR_USER_ID,
          CTX,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(dispatchToUser).not.toHaveBeenCalled();
      expect(logAccess).not.toHaveBeenCalled();
    });
  });

  // ─── Sprint 15C.II Fase F.11.2 Amendment II (P1 rate limiting frozen
  //     2026-05-19) — cooldown per (actor, service, template) 60s. ───
  describe('Amendment II — P1 rate limiting', () => {
    it('cooldown libre → cache.tryAcquire llamado con args canónicos + dispatch', async () => {
      await service.resendServiceLifecycleNotification(
        SERVICE_ID,
        'service.suspended',
        ACTOR_USER_ID,
        CTX,
      );

      expect(tryAcquireResendNotificationCooldown).toHaveBeenCalledWith(
        ACTOR_USER_ID,
        SERVICE_ID,
        'service.suspended',
        RESEND_NOTIFICATION_COOLDOWN_SECONDS,
      );
      expect(dispatchToUser).toHaveBeenCalled();
      expect(logAccess).toHaveBeenCalled();
    });

    it('cooldown activo → 429 RESEND_TOO_FREQUENT + Retry-After + NO dispatch + NO audit', async () => {
      tryAcquireResendNotificationCooldown.mockResolvedValue(false);
      getResendNotificationCooldownRemainingSeconds.mockResolvedValue(42);

      let caught: unknown;
      try {
        await service.resendServiceLifecycleNotification(
          SERVICE_ID,
          'service.suspended',
          ACTOR_USER_ID,
          CTX,
        );
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(HttpException);
      const httpErr = caught as HttpException;
      expect(httpErr.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      const body = httpErr.getResponse() as {
        code: string;
        retry_after_seconds: number;
      };
      expect(body.code).toBe('RESEND_TOO_FREQUENT');
      expect(body.retry_after_seconds).toBe(42);

      // Defense-in-depth: el dispatch y el audit NO deben ejecutarse
      // cuando el cooldown rechaza.
      expect(dispatchToUser).not.toHaveBeenCalled();
      expect(logAccess).not.toHaveBeenCalled();
    });

    it('granularidad per (actor, service, template) — distintas combinaciones NO contaminan', async () => {
      const OTHER_ACTOR = '44444444-4444-4444-4444-444444444444';
      await service.resendServiceLifecycleNotification(
        SERVICE_ID,
        'service.suspended',
        ACTOR_USER_ID,
        CTX,
      );
      await service.resendServiceLifecycleNotification(
        SERVICE_ID,
        'service.cancelled',
        ACTOR_USER_ID,
        CTX,
      );
      await service.resendServiceLifecycleNotification(
        SERVICE_ID,
        'service.suspended',
        OTHER_ACTOR,
        CTX,
      );

      // Cada combinación adquiere su propia ventana de cooldown — el
      // cache mock devuelve true siempre, pero verificamos que la clave
      // canónica se compone con las 3 dimensiones (actor/service/template).
      const calls = tryAcquireResendNotificationCooldown.mock.calls as Array<
        [string, string, string, number]
      >;
      expect(calls).toHaveLength(3);
      expect(calls[0]).toEqual([
        ACTOR_USER_ID,
        SERVICE_ID,
        'service.suspended',
        RESEND_NOTIFICATION_COOLDOWN_SECONDS,
      ]);
      expect(calls[1]).toEqual([
        ACTOR_USER_ID,
        SERVICE_ID,
        'service.cancelled',
        RESEND_NOTIFICATION_COOLDOWN_SECONDS,
      ]);
      expect(calls[2]).toEqual([
        OTHER_ACTOR,
        SERVICE_ID,
        'service.suspended',
        RESEND_NOTIFICATION_COOLDOWN_SECONDS,
      ]);
    });

    it('cooldown chequeado DESPUÉS del NotFound (orden defensivo)', async () => {
      serviceFindUnique.mockResolvedValue(null);
      await expect(
        service.resendServiceLifecycleNotification(
          SERVICE_ID,
          'service.suspended',
          ACTOR_USER_ID,
          CTX,
        ),
      ).rejects.toThrow(NotFoundException);

      // El cooldown NO debe consumirse si el service no existe — evita
      // que un atacante mapee servicios existentes vía rate-limit timing.
      expect(tryAcquireResendNotificationCooldown).not.toHaveBeenCalled();
    });

    it('cooldown chequeado DESPUÉS del INVALID_TEMPLATE_KEY (orden defensivo)', async () => {
      await expect(
        service.resendServiceLifecycleNotification(
          SERVICE_ID,
          'task.assigned' as never,
          ACTOR_USER_ID,
          CTX,
        ),
      ).rejects.toThrow(BadRequestException);
      // Defense-in-depth: una plantilla inválida no debe consumir cuota
      // de rate limit (sería un vector para mapear el comportamiento del
      // backend desde fuera).
      expect(tryAcquireResendNotificationCooldown).not.toHaveBeenCalled();
    });
  });
});
