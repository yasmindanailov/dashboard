/**
 * Tests de `permissions.ts` — visibilidad de UI por rol (NO es seguridad:
 * el enforcement real vive en el backend CASL; esto controla sidebar +
 * navegación). Foco en la lógica no trivial de `canAccessRoute`
 * (selección de la ruta MÁS específica + permisividad en rutas no mapeadas).
 */
import { canAccess, canAccessRoute } from './permissions';

describe('canAccess', () => {
  it('permite el módulo cuando el rol lo tiene en su matriz', () => {
    expect(canAccess('superadmin', 'Setting')).toBe(true);
    expect(canAccess('client', 'Service')).toBe(true);
    expect(canAccess('agent_support', 'Conversation')).toBe(true);
  });

  it('niega el módulo cuando el rol no lo tiene', () => {
    expect(canAccess('client', 'Setting')).toBe(false);
    // agent_billing no gestiona conversaciones de soporte.
    expect(canAccess('agent_billing', 'Conversation')).toBe(false);
  });

  it('niega para un rol desconocido (sin entrada en la matriz)', () => {
    expect(canAccess('rol_inventado', 'Dashboard')).toBe(false);
  });
});

describe('canAccessRoute', () => {
  it('resuelve por coincidencia exacta de ruta', () => {
    expect(canAccessRoute('superadmin', '/admin/settings')).toBe(true);
    expect(canAccessRoute('client', '/admin/settings')).toBe(false);
  });

  it('resuelve por prefijo (sub-rutas heredan el módulo del padre)', () => {
    // /dashboard/domains → Service; el detalle /:id comparte el permiso.
    expect(canAccessRoute('client', '/dashboard/domains/abc-123')).toBe(true);
  });

  it('elige la ruta MÁS específica cuando varios prefijos casan', () => {
    // /dashboard → Dashboard (partner_pending SÍ lo tiene),
    // /dashboard/billing → Invoice (partner_pending NO lo tiene).
    // Si eligiera el prefijo corto devolvería true; debe devolver false
    // → prueba que gana la ruta más específica (/dashboard/billing).
    expect(canAccessRoute('partner_pending', '/dashboard')).toBe(true);
    expect(canAccessRoute('partner_pending', '/dashboard/billing')).toBe(false);
  });

  it('elige el Subject específico de /admin/settings/plugins (Plugin, no Setting)', () => {
    expect(canAccessRoute('superadmin', '/admin/settings/plugins')).toBe(true);
    // agent_full no tiene ni Setting ni Plugin → negado en ambos niveles.
    expect(canAccessRoute('agent_full', '/admin/settings/plugins')).toBe(false);
  });

  it('es permisivo (true) en rutas sin mapeo de permiso', () => {
    expect(canAccessRoute('client', '/dashboard/ruta-no-mapeada')).toBe(true);
  });
});
