/**
 * service-detail-context — Sprint 15C.II Fase F.12 (layout canónico).
 *
 * Tipos del registry declarativo de secciones del detalle de servicio
 * (R3 frozen §A.11.10.9.2). Archivo de tipos puros (+ helper `matchesScope`)
 * para que los componentes de sección, la extensión admin
 * (`app/admin/services/[id]/_sections.tsx`) y el `<ServiceDetailLayout>`
 * compartan el contrato sin ciclos de import.
 *
 * Amendment I (F.12.2): `matchesScope` se basa en `ctx.forceAdminRoute`
 * (qué RUTA renderiza), NO en `ctx.isAdmin` (rol del viewer). Razón: un
 * staff puede abrir `/dashboard/services/[id]` (cliente) y debe ver la
 * experiencia CLIENTE — el page cliente actual NO ramifica su composición
 * por rol, solo pasa `isAdmin` a los componentes (tooltips + acciones
 * admin-no-blacklisted). `isAdmin` se conserva en el contexto para ese uso
 * dentro de los componentes y dentro de `shouldRender` cuando aplique.
 */
import type { ReactNode } from 'react';
import type {
  PluginHealthSummary,
  ServiceBillingCrossLink,
  ServiceDetailResponse,
  SuspensionReason,
} from '../../lib/api';

/** El sub-objeto `service` de `GET /services/:id` / `GET /admin/services/:id`. */
export type ServiceData = ServiceDetailResponse['service'];

/** Quién puede ver una sección (route-scope, no role-scope — ver Amendment I). */
export type SectionScope = 'admin' | 'client' | 'both';

/**
 * Zona de la página donde se monta la sección (Sprint 15C.II Fase F.12.3 —
 * tabs adaptativas, Amendment III):
 *   - `header` / `footer`: SIEMPRE visibles (fuera de las tabs). Identidad,
 *     banners críticos (header) · meta (footer).
 *   - `summary` / `management` / `activity`: contenido de las 3 tabs. Una tab
 *     que quede vacía (todas sus secciones filtradas) se oculta; si solo
 *     sobrevive una tab, el layout NO muestra tabs (§2.5 — si solo hay una
 *     sección no hacen falta tabs).
 */
export type SectionGroup =
  | 'header'
  | 'summary'
  | 'management'
  | 'activity'
  | 'footer';

/**
 * Contexto inmutable que el wrapper page compone y pasa al layout. Los
 * descriptores leen de aquí en `shouldRender` (predicado puro) y los
 * componentes lo reciben completo.
 */
export interface ServiceDetailContext {
  /** Respuesta cruda del backend (necesaria para componentes admin que usan el shape completo). */
  data: ServiceDetailResponse;
  /** Atajo a `data.service`. */
  service: ServiceData;
  /** Atajo a `data.info`. */
  info: ServiceDetailResponse['info'];
  /** Side-data fetched en paralelo en el wrapper (cross-link billing). `null` si no aplica / fail-soft. */
  billingCrossLink: ServiceBillingCrossLink | null;
  /** Rol efectivo del viewer (staff). Se usa DENTRO de componentes/shouldRender, NO en matchesScope. */
  isAdmin: boolean;
  /** `true` si la RUTA es `/admin/services/[id]`. Determina scope (matchesScope) + gating route-divergente. */
  forceAdminRoute: boolean;
  /** Estados derivados canónicos (heredados del page actual). */
  isTerminal: boolean;
  isDrift: boolean;
  isSuspended: boolean;
  suspensionReasonCode: SuspensionReason | null;
  /**
   * Datos admin-only fetched por el wrapper admin (fail-soft). El wrapper
   * cliente los deja en `null`/`false`. Los consumen los descriptores de la
   * extensión admin (`app/admin/services/[id]/_sections.tsx`).
   */
  pluginHealth: PluginHealthSummary | null;
  supportsReconcileOne: boolean;
}

export interface SectionDescriptor {
  /** Identificador estable y único — clave React + tests + analytics futuro. */
  id: string;
  /** Etiqueta humana (devtools/analytics). NO se renderiza. */
  label: string;
  /** Route-scope. `both` = visible en ambas rutas (con o sin variación interna por `isAdmin`). */
  scope: SectionScope;
  /** Zona/tab donde se monta la sección (F.12.3). */
  group: SectionGroup;
  /**
   * Prioridad de render. Descendente: 1000+ = arriba, 1 = abajo.
   * Rangos canónicos R3: 1000..1999 banners críticos · 500..999 identidad ·
   * 100..499 métricas/estado · 50..99 operativas · 1..49 histórico/meta.
   */
  priority: number;
  /** Predicado de visibilidad puro (sin side-effects, sin hooks). */
  shouldRender: (ctx: ServiceDetailContext) => boolean;
  /**
   * Componente que monta la sección. Recibe `ctx` completo. Acepta tanto SC
   * síncronos como **async Server Components** (ej. `ServiceNotesCard` que
   * fetcha sus notas) — por eso el retorno admite `Promise<ReactNode>`.
   */
  component: (props: { ctx: ServiceDetailContext }) => ReactNode | Promise<ReactNode>;
}

/**
 * Helper canónico de filtrado por scope (Amendment I — basado en
 * `forceAdminRoute`, la RUTA, no el rol). Documentado + reusado por el
 * `<ServiceDetailLayout>`.
 */
export function matchesScope(
  scope: SectionScope,
  ctx: ServiceDetailContext,
): boolean {
  return (
    scope === 'both' ||
    (scope === 'admin' && ctx.forceAdminRoute) ||
    (scope === 'client' && !ctx.forceAdminRoute)
  );
}
