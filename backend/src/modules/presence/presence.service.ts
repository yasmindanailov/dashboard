import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import {
  derivePresence,
  PresenceStatus,
} from '../../core/presence/presence.helper';

/**
 * PresenceService — Rediseño UI F3·E8 (presencia de staff).
 *
 * Mantiene `user_presence.last_seen_at` vía heartbeat y deriva el estado
 * (online/away/offline) al leer (sin cron de expiración). Reutilizable por
 * Support Inside ("tu técnico") y el dashboard ejecutivo E7 ("carga del
 * equipo"). El cálculo del estado vive en `core/presence/presence.helper.ts`.
 */
@Injectable()
export class PresenceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Upsert del heartbeat del usuario (lo llama el front periódicamente). */
  async heartbeat(userId: string): Promise<void> {
    await this.prisma.userPresence.upsert({
      where: { user_id: userId },
      create: { user_id: userId },
      update: { last_seen_at: new Date() },
    });
  }

  /** Estado de presencia derivado de un usuario. */
  async getPresence(
    userId: string,
    now: Date = new Date(),
  ): Promise<PresenceStatus> {
    const row = await this.prisma.userPresence.findUnique({
      where: { user_id: userId },
      select: { last_seen_at: true },
    });
    return derivePresence(row?.last_seen_at ?? null, now);
  }

  /**
   * Mapa `userId → estado` para listas (E7 carga del equipo, admin SI).
   * Una sola query; los usuarios sin fila → offline.
   */
  async getPresenceMap(
    userIds: string[],
    now: Date = new Date(),
  ): Promise<Record<string, PresenceStatus>> {
    const out: Record<string, PresenceStatus> = {};
    if (userIds.length === 0) return out;
    const rows = await this.prisma.userPresence.findMany({
      where: { user_id: { in: userIds } },
      select: { user_id: true, last_seen_at: true },
    });
    const byId = new Map(rows.map((r) => [r.user_id, r.last_seen_at]));
    for (const id of userIds) {
      out[id] = derivePresence(byId.get(id) ?? null, now);
    }
    return out;
  }
}
