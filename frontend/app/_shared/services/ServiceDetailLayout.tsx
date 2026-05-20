/**
 * ServiceDetailLayout — Sprint 15C.II Fase F.12 (layout canónico, R2 frozen).
 *
 * Plantilla ÚNICA del detalle de servicio, compartida por
 * `/dashboard/services/[id]` (cliente) y `/admin/services/[id]` (admin). Las
 * páginas son wrappers finos que componen el `ServiceDetailContext` y delegan
 * aquí (ADR-070 separación admin/cliente como capability del layout, no como
 * duplicación · UI_SPEC §1.2 P6).
 *
 * Itera el registry declarativo (R3): base `SERVICE_DETAIL_SECTIONS` +
 * `extraSections` (extensión admin inyectada por el wrapper admin — Amendment I).
 * Filtra por `matchesScope` (route-scope) + `shouldRender(ctx)` y ordena por
 * `priority` descendente. Cero condiciones inline — cada sección encapsula su
 * lógica en su descriptor.
 *
 * Server-component compatible (sin `'use client'`): los descriptores son datos
 * puros; los componentes interactivos (SsoButton, ActionsBar, modales admin)
 * son CC que gestionan su propia interactividad.
 */
import type { SectionDescriptor, ServiceDetailContext } from './service-detail-context';
import { matchesScope } from './service-detail-context';
import { SERVICE_DETAIL_SECTIONS } from './service-detail-sections';

interface ServiceDetailLayoutProps {
  ctx: ServiceDetailContext;
  /**
   * Descriptores adicionales concatenados al registry base (R3 regla 6). El
   * wrapper admin pasa `ADMIN_SERVICE_DETAIL_SECTIONS`; el cliente no pasa
   * nada. Evita que `_shared/` dependa de `app/admin/` (Amendment I).
   */
  extraSections?: readonly SectionDescriptor[];
}

export function ServiceDetailLayout({
  ctx,
  extraSections = [],
}: ServiceDetailLayoutProps) {
  const sections = [...SERVICE_DETAIL_SECTIONS, ...extraSections]
    .filter((s) => matchesScope(s.scope, ctx) && s.shouldRender(ctx))
    .sort((a, b) => b.priority - a.priority);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {sections.map((section) => {
        const SectionComponent = section.component;
        return <SectionComponent key={section.id} ctx={ctx} />;
      })}
    </div>
  );
}
