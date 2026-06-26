/**
 * Tests de `portal.ts` — resolución de portal canónico por rol (ADR-066).
 *
 * Cubre el invariante de seguridad clave: ante un rol desconocido o
 * `undefined`, el default es la audiencia MÁS restringida ('client'),
 * para no exponer superficie staff por accidente.
 */
import {
  portalForRole,
  portalLabelForRole,
  portalRootForRole,
  isStaffRole,
  isAdminRole,
} from './portal';

describe('portalForRole', () => {
  it.each(['superadmin', 'agent_full', 'agent_billing', 'agent_support'])(
    'mapea el rol staff "%s" → admin',
    (role) => {
      expect(portalForRole(role)).toBe('admin');
    },
  );

  it.each(['partner', 'partner_pending'])('mapea el rol "%s" → partner', (role) => {
    expect(portalForRole(role)).toBe('partner');
  });

  it('mapea el rol cliente → client', () => {
    expect(portalForRole('client')).toBe('client');
  });

  it('default seguro: rol desconocido → client (audiencia más restringida)', () => {
    expect(portalForRole('rol_inventado')).toBe('client');
  });

  it('default seguro: rol undefined → client', () => {
    expect(portalForRole(undefined)).toBe('client');
  });
});

describe('portalLabelForRole', () => {
  it('devuelve la etiqueta del portal de cada audiencia', () => {
    expect(portalLabelForRole('superadmin')).toBe('Portal de Administración');
    expect(portalLabelForRole('client')).toBe('Portal de Cliente');
    expect(portalLabelForRole('partner')).toBe('Portal de Partner');
    expect(portalLabelForRole(undefined)).toBe('Portal de Cliente');
  });
});

describe('portalRootForRole', () => {
  it('devuelve la URL raíz de cada portal', () => {
    expect(portalRootForRole('superadmin')).toBe('/admin');
    expect(portalRootForRole('client')).toBe('/dashboard');
  });

  it('partner aún apunta a /dashboard hasta Sprint 19', () => {
    expect(portalRootForRole('partner')).toBe('/dashboard');
  });
});

describe('isStaffRole', () => {
  it('true solo para los 4 roles staff', () => {
    expect(isStaffRole('superadmin')).toBe(true);
    expect(isStaffRole('agent_support')).toBe(true);
    expect(isStaffRole('client')).toBe(false);
    expect(isStaffRole('partner')).toBe(false);
    expect(isStaffRole(undefined)).toBe(false);
  });
});

describe('isAdminRole', () => {
  it('true solo para superadmin y agent_full (subset de admin pleno UI)', () => {
    expect(isAdminRole('superadmin')).toBe(true);
    expect(isAdminRole('agent_full')).toBe(true);
    expect(isAdminRole('agent_billing')).toBe(false);
    expect(isAdminRole('agent_support')).toBe(false);
    expect(isAdminRole('client')).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
  });
});
