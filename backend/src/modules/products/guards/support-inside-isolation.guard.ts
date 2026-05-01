import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../../core/database/prisma.service';

/**
 * SupportInsideIsolationGuard — Sprint 8 Fase D + ADR-075 §A.2.
 *
 * Defense in depth para aislar el CRUD genérico de productos del
 * editor dedicado de Support Inside (`/admin/support-inside-plans`).
 *
 * Reglas:
 *   - `POST /admin/products` con `body.type === 'support_inside'` → 400
 *     salvo header `X-Aelium-Source: support-inside-admin`.
 *   - `PATCH /admin/products/:id` o `DELETE /admin/products/:id` cuyo
 *     producto tenga `type === 'support_inside'` → 400 salvo el mismo
 *     header.
 *
 * El header lo añade automáticamente el cliente HTTP de la página
 * dedicada (`apiClient.supportInside.update()` en frontend). Browsers y
 * curl externos no lo conocen — el aislamiento no se rompe por accidente.
 *
 * Cumple ADR-075 §"🚪 Cierra: No volver a permitir creación de
 * type='support_inside' desde /admin/products".
 */
@Injectable()
export class SupportInsideIsolationGuard implements CanActivate {
  static readonly INTERNAL_HEADER = 'x-aelium-source';
  static readonly INTERNAL_VALUE = 'support-inside-admin';

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();

    // Header interno → bypass. Caller legítimo (SupportInsidePlansAdmin*).
    const sourceHeader = req.headers[
      SupportInsideIsolationGuard.INTERNAL_HEADER
    ] as string | undefined;
    if (sourceHeader === SupportInsideIsolationGuard.INTERNAL_VALUE) {
      return true;
    }

    const method = req.method;
    const body = (req.body ?? {}) as { type?: string };
    const productId = (req.params?.id as string | undefined) ?? null;

    // POST con body.type=support_inside → bloqueo directo.
    if (method === 'POST' && body.type === 'support_inside') {
      throw new BadRequestException(
        'Los planes Support Inside se crean desde /admin/support-inside-plans (ADR-075). El CRUD genérico de productos no admite type=support_inside.',
      );
    }

    // PATCH / DELETE sobre product cuyo type=support_inside → bloqueo.
    if ((method === 'PATCH' || method === 'DELETE') && productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
        select: { type: true },
      });
      if (product?.type === 'support_inside') {
        throw new BadRequestException(
          'Este producto se gestiona en /admin/support-inside-plans (ADR-075).',
        );
      }
    }

    return true;
  }
}
