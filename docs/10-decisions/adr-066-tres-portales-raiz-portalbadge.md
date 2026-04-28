# ADR-066 — Tres portales raíz por audiencia (`/admin`, `/dashboard`, `/partner`) + componente `PortalBadge`

> **Status:** Active
> **Date:** 2026-04-28
> **Domain:** frontend, identidad de marca, IA / multi-tenancy
> **Sprint:** 9.6 — split admin/cliente retroactivo (P1.1.6, DC.7)

---

## Contexto

El proyecto tiene **tres audiencias** con contratos legales, UX y permisos distintos:

1. **Staff interno** — superadmin + agentes (`agent_full`, `agent_billing`, `agent_support`). Operan el negocio (gestionan clientes, facturación, soporte, infraestructura, jobs).
2. **Cliente final** — usuario directo de Aelium que contrata servicios. Consume el dashboard para ver sus servicios, pagar facturas, abrir tickets, ver su transparencia RGPD.
3. **Partner** — agencia/colaborador externo que vende Aelium a sus propios clientes finales (Sprint 19, P3.17). Ve sus clientes, comisiones, payouts.

Sprint 9 Fase F (2026-04-27) introdujo el árbol staff `/admin/*` con `AdminLayout` + `AdminSidebar`. Las páginas heredadas siguen en `/dashboard/*` mezclando UX cliente y staff via condicionales `isAdmin` inline. Sprint 19 incorporará `/partner/*` replicando el mismo patrón.

DC.7 (registrado 2026-04-27) exige formalizar la decisión arquitectónica antes de migrar las páginas. La auditoría iterativa con Yasmin (2026-04-28) cerró:

- **Tres portales raíz fijos** en lugar de N portales por rol staff. La granularidad fina entre `agent_full`/`agent_billing`/`agent_support` se resuelve **dentro** del Portal de Administración con CASL + Sidebar filtering (ADR-067), no creando un portal por rol.
- **Layouts separados** (`/admin/layout.tsx`, `/dashboard/layout.tsx`, `/partner/layout.tsx`) para que cada portal evolucione su propia UX sin condicionales `isAdmin` esparcidos.
- **Design System compartido** (`frontend/app/components/ui/`) para garantizar coherencia visual (R16 + D11). Los layouts comparten Button, Card, Modal, etc.; sólo divergen en Sidebar y header.
- **Subtítulo de portal bajo el logo** ("Portal de Administración" / "Portal de Cliente" / "Portal de Partner") para que un staff que entra a `/admin` y un cliente que entra a `/dashboard` distingan visualmente en qué portal están — útil cuando un partner que es también cliente alterna entre `/dashboard` y `/partner` (caso futuro Sprint 19).

> **¿Qué pasaría si NO tomáramos esta decisión?** Las 3 audiencias compartirían `/dashboard/*` con condicionales `isAdmin` / `isPartner` / `isClient` esparcidos por cada `page.tsx`. Cuando Sprint 19 añada Partner, se duplica la complejidad por cada página. Los specs E2E pierden aislamiento (cada test debe asegurarse de no interferir con otros roles). Las reglas WAF de Sprint 14 Deploy se vuelven imposibles de declarar (no hay un prefijo de URL identificable por audiencia). El frontend acumula una matriz de condicionales que sólo cabe en la cabeza del autor original.

---

## Opciones consideradas

### A. Estrategia de portales

#### A.1 Un único portal `/dashboard/*` con condicionales por rol

- **Pros**: cero migración de URLs.
- **Contras**: ya documentados arriba. Mezcla 3 audiencias en un solo árbol; UX divergente vive como `if (isAdmin) <X> else <Y>`. Sprint 19 lo empeora.
- **Descartado**.

#### A.2 N portales por rol (`/superadmin`, `/agent`, `/dashboard`, `/partner`)

- **Pros**: granularidad máxima.
- **Contras**: cuatro layouts staff casi idénticos (los 4 roles staff comparten el tipo de operación: gestionan, no consumen). Antipatrón. La granularidad por rol DENTRO de admin se resuelve mejor con CASL + Sidebar filtering — no necesita un portal por rol.
- **Descartado**.

#### A.3 Tres portales por audiencia: `/admin/*`, `/dashboard/*`, `/partner/*` ✅ elegido

- **Pros**:
  - Una audiencia = un árbol = un layout = un Sidebar = un contrato legal.
  - Granularidad intra-portal vía CASL (ADR-067) — un agent_billing en `/admin` ve menos items que un superadmin sin necesidad de portal aparte.
  - Reglas WAF declarativas en Sprint 14: `location /api/v1/admin/*` con rate limit más restrictivo; `location /admin/*` con headers de seguridad estrictos.
  - Escalable: si mañana hay un rol "auditor externo", se introduce `/auditor/*` sin tocar los otros tres.
  - Specs E2E aislados: un test que navega a `/admin/X` no necesita preocuparse de no romper rutas cliente.
- **Contras**: migración retroactiva (DC.7) — el coste se paga en Sprint 9.6 y luego no más.
- **Elegido**.

### B. Visualización del portal al usuario

#### B.1 Sólo URL diferenciada (sin badge)

- Pros: cero cambios visuales.
- Contras: usuarios que alternan portales (partner que es cliente en Sprint 19) no tienen feedback visual claro. La URL no siempre es visible (móvil, embeds futuros).
- **Descartado**.

#### B.2 Subtítulo bajo el logo: "Portal de Administración" / "Portal de Cliente" / "Portal de Partner" ✅ elegido

- **Pros**: feedback visual permanente en el chrome del Sidebar header. Mínimo (~12-16px de altura). Coherente con D11 (voz de marca cercana).
- **Contras**: ninguno relevante.
- **Elegido**.

#### B.3 Banner superior con color por portal

- Demasiado intrusivo. Aelium busca densidad de información; un banner permanente roba espacio.
- **Descartado**.

### C. Implementación del subtítulo

#### C.1 Texto inline en cada layout

- Pros: trivial.
- Contras: viola R16 (todo componente visual va en `components/ui/`). Cada layout repetiría la lógica de elegir el texto según rol.
- **Descartado**.

#### C.2 Componente `PortalBadge` en Design System ✅ elegido

- **Pros**: cumple R16. Centraliza el texto canónico (`portalLabelForRole(roleSlug)`). Los layouts solo lo invocan.
- **Elegido**.

---

## Decisión

### 1. Tres portales raíz canónicos

| Portal | URL raíz | Audiencia (roles) | Layout | Subtítulo |
|--------|----------|-------------------|--------|-----------|
| **Administración** | `/admin/*` | `superadmin`, `agent_full`, `agent_billing`, `agent_support` | `app/admin/layout.tsx` | "Portal de Administración" |
| **Cliente** | `/dashboard/*` | `client` | `app/dashboard/layout.tsx` | "Portal de Cliente" |
| **Partner** | `/partner/*` (Sprint 19) | `partner`, `partner_pending` | `app/partner/layout.tsx` (futuro) | "Portal de Partner" |

Cada portal:
- Tiene su propio `layout.tsx` con guard de rol (redirige a `/dashboard` si rol no coincide — patrón ya implementado en Sprint 9 Fase F para `/admin`).
- Tiene su propio Sidebar (`AdminSidebar.tsx` / `Sidebar.tsx` / `PartnerSidebar.tsx` futuro).
- Comparte el Topbar y los componentes UI del Design System.

### 2. Login redirect post-2FA

`landingForRole(roleSlug)` ya existe en `frontend/app/page.tsx` (Sprint 9 Fase F). Tras Sprint 9.6:
- staff (`superadmin`/`agent_*`) → `/admin`
- cliente → `/dashboard`
- partner → `/dashboard` (hasta Sprint 19; tras Sprint 19 → `/partner`)

### 3. Componente `PortalBadge`

Ubicación: `frontend/app/components/ui/PortalBadge/`. Estructura:

```
PortalBadge/
  PortalBadge.tsx        # componente
  PortalBadge.module.css # tokens del Design System
  index.ts               # re-export
```

Props:

```typescript
interface PortalBadgeProps {
  variant: 'admin' | 'client' | 'partner';
  /** Texto bajo el logo. Si se omite, se resuelve desde variant. */
  subtitle?: string;
  /** Si true, el subtítulo se muestra en una línea más pequeña debajo del logo
   *  (default true). En estados colapsados del Sidebar se puede ocultar
   *  con prop `compact`. */
  compact?: boolean;
}
```

Render:
```
[ Logo Aelium ]
   Aelium                       ← font-weight: 600, brand color
   Portal de Administración     ← font-size: 12px, text-secondary
```

Tokens: `--font-size-xs` (12px), `--color-text-secondary`, `--space-1` (4px) entre logo y subtítulo. Cumple D6 (escala 4px).

### 4. Helper `portalLabelForRole(roleSlug)`

Ubicación: `frontend/app/lib/portal.ts`. Resuelve:

```typescript
type PortalVariant = 'admin' | 'client' | 'partner';

const STAFF_ROLES = new Set([
  'superadmin', 'agent_full', 'agent_billing', 'agent_support',
]);
const PARTNER_ROLES = new Set(['partner', 'partner_pending']);

export function portalForRole(roleSlug?: string): PortalVariant {
  if (!roleSlug) return 'client';
  if (STAFF_ROLES.has(roleSlug)) return 'admin';
  if (PARTNER_ROLES.has(roleSlug)) return 'partner';
  return 'client';
}

export function portalLabelForRole(roleSlug?: string): string {
  const variant = portalForRole(roleSlug);
  return PORTAL_LABELS[variant];
}

const PORTAL_LABELS: Record<PortalVariant, string> = {
  admin: 'Portal de Administración',
  client: 'Portal de Cliente',
  partner: 'Portal de Partner',
};
```

### 5. Integración en layouts

```tsx
// app/admin/layout.tsx
<PortalBadge variant="admin" />

// app/dashboard/layout.tsx (resuelto por rol — cliente ve "Cliente", partner futuro verá "Partner")
<PortalBadge variant={portalForRole(user?.role?.slug)} />
```

---

## Implicaciones

### Migración

Sprint 9.6 Fase D ejecuta la migración retroactiva:
- `/dashboard/clients/*` → `/admin/clients/*`
- `/dashboard/products/*` → `/admin/products/*`
- `/dashboard/support/chats` → `/admin/support/chats`
- `/dashboard/tasks/*` → `/admin/tasks/*` (sin equivalente cliente — el cliente ve sus tasks embebidas en services/support-inside cuando se implementen)

Sprint 9.6 Fase E hace **split UX** de:
- `/dashboard/billing/*` (cliente simplificado) + `/admin/billing/*` (full)
- `/dashboard/support/*` tickets (cliente reducido) + `/admin/support/*` (full workflow)

### Sprint 19 Partner

Replica el patrón:
- `app/partner/layout.tsx` con guard `PARTNER_ROLES`.
- `<PortalBadge variant="partner" />`.
- `PartnerSidebar` con items partner-specific (Mis clientes, Comisiones, Mi enlace, Tickets bidireccionales).
- `landingForRole()` actualizado para que `partner`/`partner_pending` redirijan a `/partner`.

### Frontend `lib/permissions.ts`

`ROUTE_PERMISSIONS` se actualiza en Sprint 9.6 Fase D para mapear las nuevas rutas `/admin/*`. El layout `AdminLayout` ya valida via `STAFF_ROLES.has(user.role?.slug)` antes de renderizar el shell — el guard CASL es la segunda capa.

### Backend reglas WAF (Sprint 14)

Cuando Sprint 14 introduzca Traefik en producción, se podrán declarar reglas distintas por prefix:
- `location /api/v1/admin/*` — rate limit estricto, IP allowlist opcional, headers `X-Frame-Options: DENY`.
- `location /api/v1/*` — rate limit estándar.
- `location /admin/*` (frontend) — `Cache-Control: no-store` agresivo.

---

## Tests requeridos

### Tests unit del helper

Archivo: `frontend/app/lib/__tests__/portal.test.ts` (futuro). Cubre:
- `portalForRole('superadmin')` === 'admin'
- `portalForRole('agent_billing')` === 'admin'
- `portalForRole('client')` === 'client'
- `portalForRole('partner')` === 'partner'
- `portalForRole('partner_pending')` === 'partner'
- `portalForRole(undefined)` === 'client' (default seguro)
- `portalLabelForRole(...)` resuelve el texto correcto.

### Tests E2E

Cubierto en Sprint 9.6 Fase F (`admin-tree-migration.spec.ts` + `admin-granular-roles.spec.ts`):
- Smoke: cada rol ve el `PortalBadge` correcto en su landing.
- Cliente entrando a `/admin` recibe redirect a `/dashboard` (guard del layout).
- Staff entrando a `/dashboard` recibe redirect a `/admin` (login redirect post-2FA).

---

## Referencias

- [ADR-067](./adr-067-granularidad-casl-rol-staff.md) — granularidad CASL por rol staff (Fase A).
- [ADR-068](./adr-068-multi-path-deprecation-headers.md) — multi-path con Deprecation headers (Fase B).
- [ADR-022](./adr-022-wdify-deprecado-proyectos.md) — proyectos como reemplazo de WDIFY (refuerza separación cliente/staff/partner).
- [ADR-061](./adr-061-support-inside-tier-cuenta-ux.md) — Support Inside como UX cliente diferenciada del soporte staff.
- `docs/00-foundations/rules.md` §R16 — Design System único compartido entre portales.
- `docs/00-foundations/rules.md` §D11 — voz de marca aplicada al subtítulo del badge.
- `docs/60-roadmap/current.md` Sprint 9.6 §F.C — pasos de aplicación.
- `docs/60-roadmap/backlog.md` DC.7 — deuda cerrada por este sprint.
- `docs/60-roadmap/backlog.md` P3.17 (Sprint 19) — Partner Module replicará el patrón.
