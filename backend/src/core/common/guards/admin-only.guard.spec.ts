/**
 * Sprint 15C.II Fase G.1.c — §A.2 área 7 (parte unit): AdminOnlyGuard.
 *
 * Gap cerrado: el guard `admin-only.guard.ts` (primera línea de defensa de
 * `/api/v1/admin/*`) NO tenía spec directo — solo se ejercitaba indirecto vía
 * el wrapper `action_admin_only_violation`. Aquí cubrimos `canActivate`:
 * staff → true; cliente/partner/sin-user/sin-rol → ForbiddenException 403.
 *
 * El flujo E2E (cliente hace POST /admin/... real → 403 + audit en el wire)
 * vive en G.2 (Playwright) — ver matriz §A.11.10.10.1 área 7e.
 */

import { ExecutionContext, ForbiddenException } from '@nestjs/common';

import { AdminOnlyGuard } from './admin-only.guard';

describe('AdminOnlyGuard — Sprint 15C.II G.1.c (§A.2 área 7)', () => {
  const guard = new AdminOnlyGuard();

  function contextWithUser(user: unknown): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
  }

  const STAFF_SLUGS = [
    'superadmin',
    'agent_full',
    'agent_billing',
    'agent_support',
  ];

  it.each(STAFF_SLUGS)('permite el acceso a rol staff "%s"', (slug) => {
    const ctx = contextWithUser({ id: 'u1', role: { slug } });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it.each(['client', 'partner', 'partner_pending', 'unknown_role'])(
    'rechaza con 403 al rol no-staff "%s"',
    (slug) => {
      const ctx = contextWithUser({ id: 'u1', role: { slug } });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    },
  );

  it('rechaza con 403 si no hay user en la request', () => {
    expect(() => guard.canActivate(contextWithUser(undefined))).toThrow(
      ForbiddenException,
    );
  });

  it('rechaza con 403 si el user no tiene role', () => {
    expect(() => guard.canActivate(contextWithUser({ id: 'u1' }))).toThrow(
      ForbiddenException,
    );
  });

  it('rechaza con 403 si el role no tiene slug', () => {
    const ctx = contextWithUser({ id: 'u1', role: {} });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
