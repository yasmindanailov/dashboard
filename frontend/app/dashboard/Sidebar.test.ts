/**
 * Matriz de navegación del sidebar cliente (F2).
 *
 * Invariantes que protege:
 *  - Decisión F2 (Yasmin): el cliente ve exactamente 6 items (sin "Dominios"
 *    ni "Mi perfil", reubicados fuera del sidebar).
 *  - Riesgo nº1 del plan F2: quitar esos dos items NO debe romper la rama
 *    `partner` (Sprint 19) — se comprueba sobre la config cruda, sin depender
 *    de los grants CASL de partner.
 *  - Defensa DC.7: el portal cliente nunca renderiza items `admin`.
 */
import { getNavItemsForRole, ALL_NAV_ITEMS } from './nav-items';

describe('sidebar cliente — matriz de navegación (F2)', () => {
  it('el cliente ve exactamente los 6 items del mockup', () => {
    const labels = getNavItemsForRole('client').map((i) => i.label);
    expect(labels).toEqual([
      'Inicio',
      'Tienda',
      'Mis servicios',
      'Mis facturas',
      'Soporte',
      'Support Inside',
    ]);
  });

  it('no incluye "Dominios" ni "Mi perfil" (reubicados fuera del sidebar)', () => {
    const labels = getNavItemsForRole('client').map((i) => i.label);
    expect(labels).not.toContain('Dominios');
    expect(labels).not.toContain('Mi perfil');
  });

  it('conserva la rama partner intacta en la config (3 items)', () => {
    const partnerItems = ALL_NAV_ITEMS.filter((i) => i.section === 'partner');
    expect(partnerItems.map((i) => i.label)).toEqual(['Mis clientes', 'Comisiones', 'Mi enlace']);
  });

  it('ningún rol del portal cliente ve items admin', () => {
    for (const role of ['client', 'partner', 'partner_pending']) {
      expect(getNavItemsForRole(role).some((i) => i.section === 'admin')).toBe(false);
    }
  });
});
