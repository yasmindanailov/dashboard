import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../../core/common/types/authenticated-request';
import { PrismaService } from '../../core/database/prisma.service';
import { AuditService } from './audit.service';

/**
 * AuditController — portal transparencia cliente (Sprint 9 Fase E +
 * ADR-017 + ADR-010 RGPD).
 *
 * Endpoint cliente (compartido — el rol determina qué ve, no la URL):
 *  - `GET /api/v1/audit/access` — el caller ve filas donde un staff
 *    accedió a SUS datos personales/financieros.
 *
 * NUNCA devuelve accesos cuyo `target_user_id` no sea el caller.
 * Filtro de ownership aplicado server-side, no opcional.
 */
@ApiTags('Audit / Transparency')
@ApiBearerAuth()
@Controller('audit')
@UseGuards(JwtAuthGuard)
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Lista cerrada de actions visibles al cliente en el portal de
   * transparencia. Sprint 9 Fase E congeló `'read'` (lecturas staff sobre
   * datos personales/financieros). Sprint 15C Fase 15C.F (ADR-083 §4
   * decisión 14) añade `'admin_sso_impersonation'` — cuando un agente
   * Aelium abre el panel del proveedor del cliente, queda registrado y
   * VISIBLE al data subject. Cualquier action nueva visible al cliente
   * debe añadirse aquí + en el `RESOURCE_LABEL`/`ACTION_LABEL` del SC
   * `frontend/app/dashboard/transparency/page.tsx` para que la UI sepa
   * traducir el slug a etiqueta humana en castellano.
   */
  private static readonly TRANSPARENCY_VISIBLE_ACTIONS: ReadonlyArray<string> =
    ['read', 'admin_sso_impersonation'];

  @Get('access')
  @ApiOperation({
    summary: 'Listar accesos staff a tus datos (portal transparencia RGPD)',
  })
  async myAccessLog(
    @Req() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    // Filtro ownership: solo accesos cuyo `metadata.target_user_id`
    // coincida con el caller, con action ∈ TRANSPARENCY_VISIBLE_ACTIONS
    // para excluir los registros legacy de `auth.*` (login_failed, etc.)
    // que contaminarían la vista del cliente.
    //
    // `findAccessLog` admite filtro por una sola action — para el set
    // canónico hacemos un fetch con limit holgado y filtramos in-memory
    // (cardinalidad pequeña: ≤PAGE_SIZE filas por cliente). Si la lista
    // crece, mover a `WHERE action IN (...)` en el service.
    const result = await this.auditService.findAccessLog({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    const callerId = req.user.id;
    const filtered = result.data.filter((entry) => {
      if (
        !AuditController.TRANSPARENCY_VISIBLE_ACTIONS.includes(entry.action)
      ) {
        return false;
      }
      return (
        entry.metadata &&
        typeof entry.metadata === 'object' &&
        (entry.metadata as Record<string, unknown>).target_user_id === callerId
      );
    });

    // Enriquecer con nombre + rol del actor staff (ADR-017 §"Quién puede
    // leer el audit log": el cliente debe VER el nombre real del agente).
    // Sin esto, el portal solo mostraba IP (`::1` en local) que es
    // inintelegible para el cliente final.
    const actorIds = Array.from(new Set(filtered.map((e) => e.user_id)));
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: {
            id: true,
            first_name: true,
            last_name: true,
            role: { select: { name: true } },
          },
        })
      : [];
    const actorMap = new Map(actors.map((a) => [a.id, a]));

    const enriched = filtered.map((entry) => {
      const actor = actorMap.get(entry.user_id);
      return {
        ...entry,
        actor: actor
          ? {
              first_name: actor.first_name,
              last_name: actor.last_name,
              role_name: actor.role.name,
            }
          : null,
      };
    });

    return {
      data: enriched,
      meta: {
        ...result.meta,
        total: enriched.length,
      },
    };
  }
}
