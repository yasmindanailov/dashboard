import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { getErrorMessage } from '../../core/common/utils/error.util';

export interface ErrorLogEntry {
  level?: 'error' | 'warn' | 'fatal';
  module: string;
  message: string;
  stack_trace?: string | null;
  correlation_id?: string | null;
  user_id?: string | null;
  request_path?: string | null;
  request_method?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ErrorLogQuery {
  level?: string;
  module?: string;
  resolved?: boolean;
  page?: number;
  limit?: number;
}

/**
 * ErrorLogService — registro y consulta de errores operativos del sistema
 * (Sprint 9 Fase F + ADR-055 §Monitoring + R7).
 *
 * Tres puertas de entrada:
 *  1. `GlobalExceptionFilter` para errores HTTP 5xx (escribe directo a la
 *     tabla — existente).
 *  2. `log(entry)` — uso explícito desde jobs/listeners que capturan
 *     errores no-HTTP. Persiste fila + emite `system.error` para alerta
 *     superadmin (consumido por `NotificationsService` Fase D).
 *  3. Endpoints admin de consulta y "marcar como resuelto".
 *
 * El schema `ErrorLog` no tiene columnas dedicadas para `resolved` —
 * lo expresamos vía `metadata.resolved` + `metadata.resolved_at` +
 * `metadata.resolved_by`. Migrar a columnas dedicadas se difiere a
 * Sprint 9.5 si la UX lo justifica.
 */
@Injectable()
export class ErrorLogService {
  private readonly logger = new Logger(ErrorLogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async log(entry: ErrorLogEntry): Promise<{ id: string }> {
    try {
      const row = await this.prisma.errorLog.create({
        data: {
          level: entry.level ?? 'error',
          module: entry.module,
          message: entry.message,
          stack_trace: entry.stack_trace ?? null,
          correlation_id: entry.correlation_id ?? null,
          user_id: entry.user_id ?? null,
          request_path: entry.request_path ?? null,
          request_method: entry.request_method ?? null,
          ...(entry.metadata
            ? { metadata: entry.metadata as Prisma.InputJsonValue }
            : {}),
        },
        select: { id: true, module: true, message: true },
      });

      this.events.emit('system.error', {
        error_log_id: row.id,
        level: entry.level ?? 'error',
        module: row.module,
        message: row.message,
        correlation_id: entry.correlation_id ?? null,
      });

      return { id: row.id };
    } catch (err) {
      this.logger.error(
        `Failed to persist error log entry: ${getErrorMessage(err)}`,
      );
      return { id: '' };
    }
  }

  async findAll(query: ErrorLogQuery) {
    const where: Prisma.ErrorLogWhereInput = {};
    if (query.level) where.level = query.level;
    if (query.module) where.module = query.module;
    if (query.resolved !== undefined) {
      where.metadata = query.resolved
        ? { path: ['resolved'], equals: true }
        : { path: ['resolved'], not: true };
    }

    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 200);

    const [items, total] = await Promise.all([
      this.prisma.errorLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          level: true,
          module: true,
          message: true,
          correlation_id: true,
          user_id: true,
          request_path: true,
          created_at: true,
          metadata: true,
        },
      }),
      this.prisma.errorLog.count({ where }),
    ]);

    return paginate(items, total, page, limit);
  }

  async markResolved(id: string, actorId: string): Promise<{ resolved: true }> {
    const existing = await this.prisma.errorLog.findUnique({
      where: { id },
      select: { id: true, metadata: true },
    });
    if (!existing) {
      throw new NotFoundException(`Error log ${id} no encontrado`);
    }

    const meta = (existing.metadata ?? {}) as Record<string, unknown>;
    const updated = {
      ...meta,
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolved_by: actorId,
    };

    await this.prisma.errorLog.update({
      where: { id },
      data: { metadata: updated as Prisma.InputJsonValue },
    });

    return { resolved: true };
  }
}

