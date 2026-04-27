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

    const rawId = req.params?.id;
    const resourceId = typeof rawId === 'string' ? rawId : undefined;
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
        const ownerId = extractOwnerId(response, resourceType, resourceId);

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
 * Extrae el `user_id` (dueño del recurso) probando los shapes comunes:
 *
 *  1. Response con `user_id` explícito (Invoice, Service, BillingProfile,
 *     Conversation, etc.).
 *  2. Response con `owner_id` (caso futuro genérico).
 *  3. Response con `id` cuando el resource_type identifica al usuario
 *     directamente (Client, User) → el dueño ES el recurso mismo. En ese
 *     caso `id` del response y `resourceId` del path coinciden.
 *  4. Fallback: `resourceId` del path cuando el resource_type es
 *     usuario-equivalente y el shape del response no expone `id`.
 */
function extractOwnerId(
  response: unknown,
  resourceType: string,
  resourceId: string | undefined,
): string | null {
  if (response && typeof response === 'object') {
    const obj = response as Record<string, unknown>;
    if (typeof obj.user_id === 'string') return obj.user_id;
    if (typeof obj.owner_id === 'string') return obj.owner_id;
    // Recursos cuyo "dueño" es el propio recurso: Client (User con
    // role=client), User. El campo `id` del response identifica al user.
    if (
      (resourceType === 'Client' || resourceType === 'User') &&
      typeof obj.id === 'string'
    ) {
      return obj.id;
    }
  }
  // Último fallback: si el resource_type es usuario-equivalente, usar el
  // path param directamente (caso edge: response sin shape esperado).
  if ((resourceType === 'Client' || resourceType === 'User') && resourceId) {
    return resourceId;
  }
  return null;
}
