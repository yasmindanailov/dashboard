import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from '../notifications.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { getErrorMessage } from '../../../core/common/utils/error.util';

interface AuthReplayPayload {
  user_id: string;
  session_id: string;
  original_used_at: string;
  attempted_at: string;
  ip: string;
  revoked_sessions_count: number;
}

/**
 * NotificationsAuthReplayListener — Sprint 13 §13.AUTH Fase B (2026-05-03).
 *
 * Consume `auth.refresh_replay_detected` (emitido por
 * `AuthTokenService.refresh()` al detectar reuso de un refresh token ya
 * canjeado, ADR-078 §1.4).
 *
 * Acción: alerta inmediata al superadmin via campana + email (D12). Una
 * cuenta comprometida es de prioridad alta; el superadmin debe revisar el
 * ip atacante + decidir si reseteara la password del usuario afectado +
 * notificar al cliente afectado por canal externo.
 *
 * Enriquecimiento: añade `attacked_user_email` al payload mediante una
 * query rápida a Prisma (el listener tolera fallos de DB — degradación
 * elegante, log a stderr y abort silencioso, R7).
 *
 * Sin guard anti-loop: este listener no se auto-emite (no llama a
 * `auth.refresh()` desde dentro). El único riesgo sería que el dispatch
 * a notifications fallase y llegase como `system.error` con módulo
 * 'NotificationsAuthReplayListener' — el listener `NotificationsSystemErrorListener`
 * ya filtra módulos `Notifications*` (ver guard EC-S9-07), así que no
 * hace falta duplicar protección aquí.
 */
@Injectable()
export class NotificationsAuthReplayListener {
  private readonly logger = new Logger(NotificationsAuthReplayListener.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent('auth.refresh_replay_detected')
  async handleReplayDetected(payload: AuthReplayPayload): Promise<void> {
    let userEmail: string | null = null;
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: payload.user_id },
        select: { email: true },
      });
      userEmail = user?.email ?? null;
    } catch (err) {
      // No bloquea el alert: si la query falla, el superadmin recibe la
      // alerta sin email enriquecido. Mejor parcial que silenciosa.
      this.logger.warn(
        `Failed to enrich replay payload with user email (${payload.user_id}): ${getErrorMessage(err)}`,
      );
    }

    try {
      await this.notifications.dispatchToSuperadmins(
        'auth.refresh_replay_detected',
        {
          ...payload,
          attacked_user_email: userEmail ?? '<email no disponible>',
        } as unknown as Record<string, unknown>,
      );
      this.logger.warn(
        `Auth replay detected for user ${payload.user_id} from ip=${payload.ip}. Revoked ${payload.revoked_sessions_count} sessions. Superadmins alerted.`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to alert superadmins about auth.refresh_replay_detected (user ${payload.user_id}): ${getErrorMessage(err)}`,
      );
    }
  }
}
