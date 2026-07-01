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
  SupportInsideManagedBlock,
  SuspensionReason,
} from '../../lib/api';

/** El sub-objeto `service` de `GET /services/:id` / `GET /admin/services/:id`. */
export type ServiceData = ServiceDetailResponse['service'];

/** Quién puede ver una sección (route-scope, no role-scope — ver Amendment I). */
export type SectionScope = 'admin' | 'client' | 'both';

/**
 * Zona de la página donde se monta la sección (Sprint 15C.II Fase F.12.3 →
 * F.12.5). La identidad + metadata + menú de acciones NO son secciones del
 * registry: viven en el `headerCard` del `<DetailPage>` (`<ServiceHeaderCard>`
 * + `<ServiceActionsMenu>`). El registry cubre:
 *   - `banner`: alertas/estado siempre visibles BAJO el headerCard y SOBRE las
 *     tabs (terminal, suspendido, drift, desync).
 *   - `footer`: meta siempre visible bajo las tabs (última lectura).
 *   - `summary` / `notes` / `audit`: contenido de las tabs. F.12.5 (Amendment
 *     VII): "Gestión" se eliminó (operaciones → menú del header); "Actividad" se
 *     dividió en "Notas" (admin) + "Auditoría" (preview + enlace). Una tab vacía
 *     se oculta; si solo sobrevive una, sin barra de tabs (§2.5).
 */
export type SectionGroup =
  | 'banner'
  | 'summary'
  | 'notes'
  | 'audit'
  | 'footer';

/**
 * Columna del layout `main + aside` (Sprint 15C.II Fase F.12.5, Amendment VI).
 * Solo se aplica al grupo `summary` (overview); el resto de grupos lo ignoran.
 * `main` = columna 2fr (recursos/SSL/apps); `aside` = rail 1fr (facturación,
 * datos técnicos, ayuda). Si una columna queda vacía, la otra fluye a ancho
 * completo (ver `<ServiceDetailLayout>`). Default `main`.
 */
export type SectionColumn = 'main' | 'aside';

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
  /**
   * F3·E8 — bloque gestionado de Support Inside (técnico + presencia +
   * progreso de mantenimiento + SLA). Solo lo puebla el wrapper admin cuando
   * el servicio es una suscripción SI (`product_type === 'support_inside'`);
   * `null` en cualquier otro caso (incl. la ruta cliente). Capability-driven
   * por presencia: la sección "Plan de soporte" se renderiza sii no es null.
   */
  supportInside: SupportInsideManagedBlock | null;
  /**
   * F4·U24 (feature C, §11.3 admin.md) — etiqueta del badge de cobertura Support
   * Inside en el header cuando ESTE servicio técnico (hosting/docker) está
   * cubierto por un slot SI activo: "Mantenimiento" o "Mantenimiento + gestión"
   * según `slot_type`. `null`/undefined si no hay cobertura (o ruta cliente).
   * Capability-driven por presencia del slot (SI-INV-8 single-query), NUNCA por
   * slug (R4). Opcional: solo lo puebla el wrapper admin.
   */
  siCoverageBadge?: string | null;
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
   * Columna del layout `main + aside` del grupo `summary` (F.12.5, Amendment
   * VI). Ignorado fuera de `summary`. Default `main`.
   */
  column?: SectionColumn;
  /**
   * Si `true`, la sección ocupa toda la fila del grid de su tab. Ignorado en
   * `summary` (que usa main+aside). Default `false`. (F.12.5, Amendment VI.)
   */
  fullWidth?: boolean;
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
