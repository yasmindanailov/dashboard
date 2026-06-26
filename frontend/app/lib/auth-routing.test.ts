/**
 * Tests de `auth-routing.ts` — landing post-login por rol (ADR-066 / DC.7).
 * Staff → /admin, cliente/partner → /dashboard.
 */
import { landingForRole } from './auth-routing';

describe('landingForRole', () => {
  it.each(['superadmin', 'agent_full', 'agent_billing', 'agent_support'])(
    'staff "%s" aterriza en /admin',
    (role) => {
      expect(landingForRole(role)).toBe('/admin');
    },
  );

  it.each(['client', 'partner', 'partner_pending'])(
    'no-staff "%s" aterriza en /dashboard',
    (role) => {
      expect(landingForRole(role)).toBe('/dashboard');
    },
  );

  it('default a /dashboard ante rol ausente (null/undefined/desconocido)', () => {
    expect(landingForRole(null)).toBe('/dashboard');
    expect(landingForRole(undefined)).toBe('/dashboard');
    expect(landingForRole('rol_inventado')).toBe('/dashboard');
  });
});
