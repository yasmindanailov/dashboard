import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { getErrorMessage } from '../../core/common/utils/error.util';

export interface AuditAccessEntry {
  user_id: string;
  action: string;
  ip_address: string;
  user_agent?: string | null;
  resource?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AuditChangeEntry {
  user_id?: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  changes_before?: Record<string, unknown> | null;
  changes_after?: Record<string, unknown> | null;
  correlation_id?: string | null;
}

export interface AuditAccessQuery {
  user_id?: string;
  resource?: string;
  action?: string;
  resource_id?: string;
  page?: number;
  limit?: number;
}

/**
 * AuditService — registro centralizado de accesos y cambios sensibles
 * (Sprint 9 Fase E + ADR-017 + ADR-010 RGPD).
 *
 * R3 (audit inmutable): solo INSERT. Único DELETE permitido es el cron
 * `cleanupOldAuditLogs` que borra rows con `created_at < now() - 730 días`
 * (ADR-017 §Retención).
 *
 * Alcance Fase E (Opción A — mínimo viable defendible):
 *  - `logAccess`: lecturas staff sobre datos personales/financieros del
 *    cliente. Auto-aplicado vía `AuditInterceptor` + decorador
 *    `@AuditAccess('Resource')` en controllers staff.
 *  - `logChange`: disponible para uso explícito desde controllers cuando
 *    haya un PATCH sensible.
 *
 * Los `auth.*` listeners ya escriben directo a `audit_access_log` desde
 * Sprint 5. NO se migran en Fase E para no romper tests E2E ya verdes;
 * queda como deuda DC.8 (oportunista al tocar el archivo).
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra una lectura de recurso sensible. NUNCA relanza — el caller
   * no debe romperse si el audit falla (R7: log de stderr y degradación
   * silenciosa).
   */
  async logAccess(entry: AuditAccessEntry): Promise<void> {
    try {
      await this.prisma.auditAccessLog.create({
        data: {
          user_id: entry.user_id,
          action: entry.action,
          ip_address: entry.ip_address,
          user_agent: entry.user_agent ?? null,
          resource: entry.resource ?? null,
          ...(entry.metadata
            ? { metadata: entry.metadata as Prisma.InputJsonValue }
            : {}),
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to persist audit access entry: ${getErrorMessage(err)}`,
      );
    }
  }

  async logChange(entry: AuditChangeEntry): Promise<void> {
    try {
      await this.prisma.auditChangeLog.create({
        data: {
          user_id: entry.user_id ?? null,
          entity_type: entry.entity_type,
          entity_id: entry.entity_id,
          action: entry.action,
          ...(entry.changes_before
            ? {
                changes_before: entry.changes_before as Prisma.InputJsonValue,
              }
            : {}),
          ...(entry.changes_after
            ? {
                changes_after: entry.changes_after as Prisma.InputJsonValue,
              }
            : {}),
          correlation_id: entry.correlation_id ?? null,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to persist audit change entry: ${getErrorMessage(err)}`,
      );
    }
  }

  /**
   * Query para portal transparencia + auditoría admin. El controller
   * aplica filtro de ownership pasando `resource_id` o `user_id`
   * apropiados — nunca devuelve accesos a recursos ajenos al cliente.
   */
  async findAccessLog(query: AuditAccessQuery) {
    const where: Prisma.AuditAccessLogWhereInput = {};
    if (query.user_id) where.user_id = query.user_id;
    if (query.action) where.action = query.action;
    if (query.resource) where.resource = query.resource;
    if (query.resource_id) {
      where.metadata = {
        path: ['resource_id'],
        equals: query.resource_id,
      };
    }

    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 200);

    const [items, total] = await Promise.all([
      this.prisma.auditAccessLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          user_id: true,
          action: true,
          ip_address: true,
          user_agent: true,
          resource: true,
          metadata: true,
          created_at: true,
        },
      }),
      this.prisma.auditAccessLog.count({ where }),
    ]);

    return paginate(items, total, page, limit);
  }

  /**
   * Cron de retención (R3 — única operación DELETE permitida).
   * Borra rows con `created_at < now() - retention_days`.
   * Devuelve el count borrado para logging.
   */
  async cleanupOldAccessLogs(retentionDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 86400_000);
    const result = await this.prisma.auditAccessLog.deleteMany({
      where: { created_at: { lt: cutoff } },
    });
    return result.count;
  }
}
