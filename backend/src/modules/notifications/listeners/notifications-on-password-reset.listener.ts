import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';

import { getErrorMessage } from '../../../core/common/utils/error.util';
import { PrismaService } from '../../../core/database/prisma.service';
import { NotificationsService } from '../notifications.service';

/**
 * NotificationsOnPasswordResetListener — Sprint 15C.II Fase D (2026-05-10).
 *
 * Cierra DC.NEW-15CII-EMAIL-RESET (dossier §A.8.4 D.2). Consume
 * `service.action_executed` emitido por el wrapper canónico
 * `executeActionWithCacheInvalidation`
 * ([core/provisioning/plugin-utils.ts](../../../core/provisioning/plugin-utils.ts))
 * y, cuando la action es `reset_account_password` con `success=true`,
 * envía un email al cliente con la nueva password.
 *
 * **Pre-condición R12 (ADR-083 Amendment A4.5 — gap G2):** este listener
 * SOLO es seguro porque el wrapper redacta `data.password` ANTES de
 * persistir audit_change_log via
 * [audit-sanitizer](../../../core/provisioning/audit-sanitizer.ts).
 * El evento NestJS in-memory conserva el plaintext temporal para que
 * este listener lo pase al dispatch — pero la fila persistida nunca
 * contiene la password. Ver §A.8.4 D.1 (sanitizer) + L test contract en
 * `core/provisioning/audit-sanitizer.spec.ts` + integración en
 * `enhance.plugin.spec.ts` (gap G2 R12).
 *
 * Doctrina canónica:
 *   - El listener NO invoca `EmailService.send` directamente (ADR-065 —
 *     ningún listener de negocio bypassa el orquestador notifications).
 *   - Usa `NotificationsService.dispatchToUser('service.password_reset',
 *     payload, user_id)`. El dispatcher resuelve recipient (email +
 *     language + first_name), renderiza la plantilla seedeada
 *     `service.password_reset` (Handlebars con escape XSS automático,
 *     EC-T8-17) y entrega vía `EmailChannel`.
 *   - Filter strict: `action_slug === 'reset_account_password' &&
 *     success === true && typeof data.password === 'string'`. Otros
 *     action_slugs / failures / data shapes inesperados son no-op
 *     silencioso (R7 + R13 — no rompemos al wrapper aunque algo en
 *     este path falle).
 *   - Heredable a 15D RC + 15G Plesk: cualquier plugin SaaS futuro que
 *     declare la action canónica `reset_account_password` reusa este
 *     listener sin tocar nada — la plantilla `service.password_reset` es
 *     genérica (variables `domain` + `new_password` + `panel_url`).
 *
 * Degradación elegante (R7): cualquier excepción del dispatch se loguea
 * y se traga. NO relanza — el wrapper ya ejecutó la action exitosamente
 * (la password está en Enhance), perder la notificación email NO debe
 * cancelar el side effect operativo. El admin sigue viendo la password
 * en el toast inmediato como fallback (UI_SPEC §1.2 P5).
 */
@Injectable()
export class NotificationsOnPasswordResetListener {
  private readonly logger = new Logger(
    NotificationsOnPasswordResetListener.name,
  );

  constructor(
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @OnEvent('service.action_executed')
  async handlePasswordReset(payload: {
    service_id: string;
    user_id: string;
    actor_user_id: string;
    provisioner_slug: string;
    action_slug: string;
    success: boolean;
    side_effects?: readonly string[];
    destructive?: boolean;
    ip?: string;
    data?: Record<string, unknown>;
  }): Promise<void> {
    // Filter strict — solo reset_account_password con éxito + password
    // plaintext en el payload. Cualquier otra cosa: silent no-op.
    if (payload.action_slug !== 'reset_account_password') return;
    if (payload.success !== true) return;

    const newPassword =
      typeof payload.data?.password === 'string' ? payload.data.password : null;
    if (!newPassword) {
      // Sanity: el plugin enhance retorna `data.password` siempre cuando
      // success=true. Si llega aquí sin password, es un bug del plugin
      // (o un plugin futuro que devuelve un shape distinto). Loguear y
      // abortar — NO reventar el flujo del wrapper.
      this.logger.warn(
        `service.action_executed:reset_account_password without data.password ` +
          `(plugin=${payload.provisioner_slug} service=${payload.service_id}). ` +
          `Skipping email notification.`,
      );
      return;
    }

    try {
      // Necesitamos `domain` (display primario en subject + body) — el
      // dispatcher carga email/first_name/language del user pero no el
      // service. Query mínima: solo `domain` + `label` (fallback chain
      // canónica: domain → label → service_id).
      const service = await this.prisma.service.findUnique({
        where: { id: payload.service_id },
        select: { domain: true, label: true },
      });
      const displayDomain =
        service?.domain ?? service?.label ?? payload.service_id;

      const appUrl = this.config.get<string>(
        'NEXT_PUBLIC_APP_URL',
        'http://localhost:3002',
      );
      // El cliente abre su propio servicio en el portal — desde ahí puede
      // pulsar SSO (botón canonical `<SsoButton>`) que abre el panel del
      // proveedor. El email enlaza al portal Aelium, NO al panel externo
      // (no podemos generar SSO link sin actor_user_id válido + audit en
      // este contexto async).
      const panelUrl = `${appUrl}/dashboard/services/${payload.service_id}`;

      await this.notifications.dispatchToUser(
        'service.password_reset',
        {
          service_id: payload.service_id,
          domain: displayDomain,
          new_password: newPassword,
          panel_url: panelUrl,
          provisioner_slug: payload.provisioner_slug,
        },
        payload.user_id,
      );

      this.logger.log(
        `service.password_reset email dispatched to user=${payload.user_id} ` +
          `(service=${payload.service_id} plugin=${payload.provisioner_slug})`,
      );
    } catch (err) {
      // Degradación elegante: si Prisma o Notifications fallan, NO
      // reventamos — la action ya se ejecutó OK contra Enhance, el admin
      // ve la password en el toast UI inmediato. Loguear para que el
      // listener `notifications-system-error` capture el error_log_id si
      // procede (ya filtra módulos `Notifications*` para evitar loops
      // ver guard EC-S9-07).
      this.logger.error(
        `Failed to dispatch service.password_reset email ` +
          `(service=${payload.service_id} user=${payload.user_id}): ` +
          `${getErrorMessage(err)}`,
      );
    }
  }
}
