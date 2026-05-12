import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../types/authenticated-request';

/** Request augmentado con `correlationId` (middleware) y `user` (JwtAuthGuard). */
interface ContextualRequest extends Request {
  correlationId?: string;
  user?: AuthenticatedUser;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  constructor(private readonly prisma: PrismaService) {}

  async catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<ContextualRequest>();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.message
        : 'Internal server error';

    const correlationId = request.correlationId ?? null;

    // Log to error_log table for 5xx errors
    if (status >= 500) {
      try {
        await this.prisma.errorLog.create({
          data: {
            level: 'error',
            // GAP-15CII-N (Sprint 15C.II Fase F.3): si el error — o algún
            // eslabón de su cadena `cause` — trae un `module` string (p.ej.
            // `ProvisionerPluginError` marcado por el wrapper de provisioning
            // con `provisioning.<slug>`), regístralo en vez del genérico
            // `'http'`. Duck-typed: el filtro no se acopla a ningún módulo.
            module: resolveErrorModule(exception),
            message: message,
            stack_trace:
              exception instanceof Error ? exception.stack : undefined,
            correlation_id: correlationId,
            user_id: request.user?.id ?? null,
            request_path: request.url,
            request_method: request.method,
            metadata: {
              status,
              params: request.params,
            },
          },
        });
      } catch (dbError) {
        this.logger.error('Failed to persist error log', dbError);
      }
    }

    this.logger.error(
      `[${correlationId}] ${request.method} ${request.url} → ${status}: ${message}`,
    );

    // Sprint 8 Fase B.5 (2026-04-29): preservar metadata adicional del
    // body cuando una HttpException se construye con un objeto (ej.
    // `BadRequestException({ message, missing_required: [...] })`).
    // Sin esto, casos como EC-T8-01 (items requeridos sin completar)
    // perderían el array `missing_required` que la UI necesita para
    // resaltar los items bloqueantes en el checklist.
    const extraBody: Record<string, unknown> = {};
    if (exception instanceof HttpException) {
      const exResponse = exception.getResponse();
      if (
        exResponse &&
        typeof exResponse === 'object' &&
        !Array.isArray(exResponse)
      ) {
        const obj = exResponse as Record<string, unknown>;
        for (const key of Object.keys(obj)) {
          if (key !== 'message' && key !== 'statusCode' && key !== 'error') {
            extraBody[key] = obj[key];
          }
        }
      }
    }

    response.status(status).json({
      statusCode: status,
      message,
      correlationId,
      timestamp: new Date().toISOString(),
      ...extraBody,
    });
  }
}

/**
 * Resuelve el `module` para `error_log`: recorre el error y su cadena `cause`
 * (máx. 5 niveles, defensivo contra ciclos) buscando el primer objeto con un
 * `module` string. Si ninguno lo trae, `'http'` (origen genérico HTTP).
 * GAP-15CII-N (Sprint 15C.II Fase F.3).
 */
export function resolveErrorModule(exception: unknown): string {
  let current: unknown = exception;
  for (let depth = 0; depth < 5 && current; depth++) {
    const mod = (current as { module?: unknown }).module;
    if (typeof mod === 'string' && mod.length > 0) {
      return mod;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return 'http';
}
