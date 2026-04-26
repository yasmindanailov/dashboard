import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleSlug } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthenticatedRequest } from '../../../core/common/types/authenticated-request';

/**
 * Guard that checks if the authenticated user has one of the required roles.
 * Must be used AFTER JwtAuthGuard (needs req.user populated).
 *
 * If no @Roles() decorator is present, the guard allows access (auth-only).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<RoleSlug[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @Roles() decorator → allow (only auth required)
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user || !user.role) {
      throw new ForbiddenException(
        'No tienes permisos para acceder a este recurso.',
      );
    }

    const userRole: RoleSlug = user.role.slug;
    if (!requiredRoles.includes(userRole)) {
      throw new ForbiddenException(
        'No tienes permisos para acceder a este recurso.',
      );
    }

    return true;
  }
}
