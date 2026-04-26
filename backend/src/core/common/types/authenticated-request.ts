import type { Request } from 'express';
import type { Role, UserStatus } from '@prisma/client';

/**
 * Forma del `req.user` que pone el JwtAuthGuard tras validar el access_token.
 * Coincide 1:1 con el retorno de `JwtStrategy.validate()` (auth/strategies/jwt.strategy.ts).
 *
 * No importes `User` de Prisma directamente: el guard NO devuelve todos los
 * campos (omite `password_hash`, `two_factor_secret`, etc.) — sería tipar de
 * más y el lint marcaría accesos inexistentes.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: UserStatus;
  role: Role;
  partner_id: string | null;
  email_verified_at: Date | null;
}

/**
 * `Request` de Express con `req.user` ya tipado. Úsalo en cualquier controller
 * protegido por `JwtAuthGuard`:
 *
 *   @Get('me')
 *   me(@Req() req: AuthenticatedRequest) {
 *     return req.user;       // ← AuthenticatedUser, sin `as any`
 *   }
 *
 * Cumple R5/R14: no hay coerción a `any`, los accesos a `req.user.role.slug`,
 * `req.user.id`, etc. son type-safe.
 */
export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
