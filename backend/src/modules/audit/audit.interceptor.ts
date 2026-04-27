import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import type { AuthenticatedRequest } from '../../core/common/types/authenticated-request';
import { AuditService } from './audit.service';
import { AUDIT_ACCESS_KEY } from './audit.decorator';

const STAFF_ROLES = new Set([
  'superadmin',
  'agent_full',
  'agent_billing',
  'agent_support',
]);

/**
 * AuditInterceptor — auto-registra lecturas staff sobre datos de cliente
 * (Sprint 9 Fase E + ADR-017).
 *
 * Activa el log SOLO cuando:
 *  1. El handler está decorado con `@AuditAccess('Resource')`.
 *  2. El caller es staff (rol en STAFF_ROLES).
 *  3. El response devuelve un objeto con `id` y opcionalmente `user_id`
 *     que NO coincide con el `req.user.id` (i.e. accede a recurso ajeno).
 *
 * Cuando el cliente lee SUS propios datos, NO se registra — el portal
 * transparencia muestra solo accesos staff a sus datos, que es lo
 * relevante para RGPD.
 *
 * El interceptor NO bloquea el flujo si el audit falla (R3+R7: el
 * `auditService.logAccess` ya degrada silenciosamente con log).
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const resourceType = this.reflector.get<string | undefined>(
      AUDIT_ACCESS_KEY,
      context.getHandler(),
    );
    if (!resourceType) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const actor = req.user;
    const actorRoleSlug = actor?.role?.slug;

    // Sólo nos interesa registrar accesos staff. Cliente que lee sus
    // propios datos NO genera fila.
    if (!actorRoleSlug || !STAFF_ROLES.has(actorRoleSlug)) {
      return next.handle();
    }

    const resourceId = req.params?.id;
    const xff = req.headers['x-forwarded-for'];
    const ip =
      (typeof xff === 'string' ? xff.split(',')[0] : undefined) ??
      req.ip ??
      req.socket?.remoteAddress ??
      'unknown';
    const uaHeader = req.headers['user-agent'];
    const userAgent = typeof uaHeader === 'string' ? uaHeader : null;

    return next.handle().pipe(
      tap((response: unknown) => {
        const ownerId = extractOwnerId(response);

        // Si el actor staff lee su propio recurso (caso raro pero
        // posible: superadmin con su propia factura), no registramos.
        if (ownerId && ownerId === actor.id) return;

        void this.auditService.logAccess({
          user_id: actor.id,
          action: 'read',
          ip_address: ip,
          user_agent: userAgent,
          resource: resourceId
            ? `${resourceType}:${String(resourceId)}`
            : resourceType,
          metadata: {
            resource_type: resourceType,
            resource_id: resourceId ?? null,
            target_user_id: ownerId ?? null,
            actor_role: actorRoleSlug,
          },
        });
      }),
    );
  }
}

/**
 * Extrae el `user_id` (dueño del recurso) del response, probando los
 * shapes comunes. Devuelve null si no es inferible.
 */
function extractOwnerId(response: unknown): string | null {
  if (!response || typeof response !== 'object') return null;
  const obj = response as Record<string, unknown>;
  if (typeof obj.user_id === 'string') return obj.user_id;
  if (typeof obj.owner_id === 'string') return obj.owner_id;
  // Para Invoice: campo user_id existe en el modelo. Para ClientProfile:
  // user_id también. Caso edge: Service tiene user_id heredado.
  return null;
}
