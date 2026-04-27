import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../types/authenticated-request';

const STAFF_ROLES = new Set([
  'superadmin',
  'agent_full',
  'agent_billing',
  'agent_support',
]);

/**
 * AdminOnlyGuard — primera línea de defensa para rutas `/api/v1/admin/*`
 * (Sprint 9 Fase F + DC.7).
 *
 * Rechaza con 403 cualquier request cuyo `req.user.role.slug` no esté en
 * `STAFF_ROLES`. Se aplica ANTES que CASL — corta a la entrada los accesos
 * de clientes y partners. CASL queda como segunda capa para granularidad
 * por rol staff (agent_billing vs agent_support, etc., en Sprint 9.6).
 *
 * Uso esperado: registrado globalmente en `app.module.ts` o aplicado a
 * cada controller staff con `@UseGuards(JwtAuthGuard, AdminOnlyGuard)`.
 *
 * **Importante**: este guard NO sustituye a `JwtAuthGuard`. Asume que
 * `req.user` ya está poblado por el guard de auth previo.
 */
@Injectable()
export class AdminOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const slug = req.user?.role?.slug;
    if (!slug || !STAFF_ROLES.has(slug)) {
      throw new ForbiddenException(
        'Esta operación requiere permisos de staff.',
      );
    }
    return true;
  }
}
