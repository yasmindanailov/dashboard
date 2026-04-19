import { SetMetadata } from '@nestjs/common';
import { RoleSlug } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: RoleSlug[]) => SetMetadata(ROLES_KEY, roles);
