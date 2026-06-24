import { RoleSlug } from '@prisma/client';

/**
 * Roles con 2FA **obligatorio** (ADR-013). El reto 2FA en login se dispara si el
 * rol está en esta lista **o** si el usuario activó 2FA opt-in
 * (`two_factor_enabled`, ADR-013 Amendment A1).
 *
 * Para estos roles, el 2FA es **inmutable desde la cuenta**: no pueden
 * desactivarlo (`AuthAccountService.disable2fa` lo rechaza).
 *
 * Fuente única — importado por `auth-login.service.ts` (trigger de login) y
 * `auth-account.service.ts` (guarda de desactivación).
 */
export const ROLES_REQUIRING_2FA: RoleSlug[] = [
  RoleSlug.superadmin,
  RoleSlug.agent_full,
  RoleSlug.agent_billing,
  RoleSlug.agent_support,
];
