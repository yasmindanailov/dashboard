import { SetMetadata } from '@nestjs/common';
import { RoleSlug } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Decorator to restrict endpoint access to specific roles.
 * Usage: @Roles(RoleSlug.superadmin, RoleSlug.agent_full)
 *
 * Must be used together with JwtAuthGuard and RolesGuard:
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @Roles(RoleSlug.superadmin)
 */
export const Roles = (...roles: RoleSlug[]) => SetMetadata(ROLES_KEY, roles);
