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
            module: 'http',
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
