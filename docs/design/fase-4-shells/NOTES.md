# NOTES.md — Fase 4 · Shells por portal

> Deudas de implementación TS/CSS module a ejecutar en sprints
> propios cuando esta fase de diseño quede aprobada.

---

## Resumen

Fase 4 entrega 4 shells especificados con anatomía, densidad y voz.
Cada drift listado en `audit-existing.md` (D4-1..D4-19) tiene aquí su
plan de implementación. Cero cambios en `frontend/` durante esta fase.

---

## Deudas de implementación

### N4-1 · AuthShell variante `centered-status`
Caso · Pequeño/Mediano (4h)

```ts
// frontend/app/AuthLayout.tsx
interface AuthLayoutProps {
  children: ReactNode;
  variant?: 'split-aurora' | 'centered-status';  // default 'split-aurora'
}
```

CSS class `centered-status` ya implementada en mockup. Aplicable a
`/verify-email`, `/welcome`, link expirado, cuenta suspendida.

### N4-2 · Migrar logo a `aelium_logo_blue.svg`
Caso · Pequeño (1h)

`AuthLayout.tsx` referencia `/brand/logo-blue-black.svg`. Migrar al
asset oficial v1.6 ya disponible.

### N4-3 · Rombo SVG inline en sidebar (Cliente + Admin)
Caso · Pequeño (1h)

Reemplazar `<div className={styles.logoIcon}>A</div>` por SVG inline
del rombo Aelium en `Sidebar.tsx` y `AdminSidebar.tsx`.

```tsx
const AeliumMark = () => (
  <svg viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <rect x="6" y="2" width="11" height="11" rx="2"
          transform="rotate(45 11.5 7.5)" fill="var(--brand)"/>
    <rect x="11" y="15" width="8" height="8" rx="1.5"
          transform="rotate(45 15 19)" fill="var(--brand)" opacity="0.55"/>
  </svg>
);
```

### N4-4 · CSS variable `--sidebar-width` en grid
Caso · Pequeño (1h)

Migrar `style={{ marginLeft: sidebarCollapsed ? '72px' : '260px' }}`
inline en `dashboard/layout.tsx` a CSS Grid + var.

### N4-5 · Atributo `data-density` en cada shell root
Caso · Pequeño (30 min cada uno)

```tsx
// dashboard/layout.tsx
<div className={styles.shell} data-density="comfortable">

// admin/layout.tsx
<div className={styles.shell} data-density="compact">

// partner/layout.tsx (futuro · N4-9)
<div className={styles.shell} data-density="standard">
```

Tokens resueltos por densidad ya definidos en `mockup/styles.css` —
replicar al CSS module global o al `globals.css`.

### N4-6 · Eliminar `<kbd>⌘K</kbd>` del search trigger
Caso · Pequeño (15 min)

`_shared/shell/Topbar.tsx` línea ~125. Eliminar el `<kbd>` visible.
Mantener atajo Cmd+K funcional. **DD-025 reafirmado**.

### N4-7 · Topbar variants (cliente/admin/partner)
Caso · Mediano (4h)

```ts
interface TopbarProps {
  variant: 'cliente' | 'admin' | 'partner';
  // resto props…
}
```

- `cliente`: sin search trigger, con SupportButton.
- `admin`: con search trigger (sin kbd), sin SupportButton.
- `partner`: sin search trigger, sin SupportButton.

### N4-8 · Migrar Avatar manual a `<Avatar>` DS
Caso · Pequeño (30 min)

Topbar profile usa iniciales en `<div className={styles.avatar}>`. Sustituir
por `<Avatar size="sm" name={user.name} />` (ya existe componente DS,
fase 2.E).

### N4-9 · PartnerShell propio (Sprint 19)
Caso · Mediano (sprint completo)

Crear estructura paralela a `dashboard/`:
- `frontend/app/partner/layout.tsx`
- `frontend/app/partner/PartnerSidebar.tsx`
- `frontend/app/partner/{clients,commissions,link,resources,support}/`

Mover items partner del Sidebar cliente. Verificar permisos en
`lib/permissions.ts` para roles `partner` y `partner_pending`.

### N4-10 · PartnerShell · 2 secciones de sidebar
Cubierto por N4-9. Secciones:
- "Tu cartera" — Inicio, Mis clientes, Comisiones.
- "Herramientas" — Mi enlace, Recursos, Soporte partner.

### N4-11 · Collapse en AdminSidebar
Caso · Mediano (3h)

`admin/AdminSidebar.tsx` no soporta collapsed. Replicar el pattern de
`dashboard/Sidebar.tsx` (state collapsed + clase + ancho dinámico).

### N4-12 · Skeleton del topbar avatar (loading)
Caso · Pequeño (30 min)

Mientras `useAuth` resuelve, el avatar parpadea. Usar `<Skeleton
shape="circle" size={32} />` (ya existe componente).

### N4-13 · PortalBadge variant `partner`
Caso · Pequeño (30 min)

Añadir variant `partner` al componente `PortalBadge` con color `--info`
para diferenciar de admin (`--brand`) y cliente (`--text-tertiary`).

### N4-14 · Skip link en cada shell root
Caso · Pequeño (15 min cada shell)

```tsx
<a className={styles.skipLink} href="#main">Saltar al contenido</a>
<aside>...</aside>
<header>...</header>
<main id="main">{children}</main>
```

CSS implementado (`.shell-skip`).

---

## Decisiones cerradas en esta fase

### El Topbar es responsable de su variante
Topbar acepta `variant: 'cliente' | 'admin' | 'partner'`. La página
NUNCA decide qué iconos pone. Coherencia entre roles del mismo rol
y diferenciación entre roles.

### AuthShell NO comparte shell con el producto
Sin sidebar, sin topbar. El usuario aún no está dentro. Esta separación
permite que AuthShell tenga su anatomía (split-aurora) sin compromisos.

### PartnerShell separado del ClientShell
Aunque hoy comparten layout por pragmatismo histórico, fase 4
establece que **no es lo correcto**. PartnerShell tiene voz propia
("Tu cartera", "Mis clientes"), color diferencial (eyebrow `--info`),
densidad propia (`standard`) y secciones de sidebar propias. Sprint 19
ya planificado.

### Densidad por portal materializada (DD-032)
Las 3 densidades (`comfortable`, `standard`, `compact`) se aplican
vía `data-density` en el shell root. Variables CSS resueltas se
ajustan automáticamente.

### Sidebar logo = SVG rombo Aelium real
La "A" cuadrada hardcoded actual no es la marca. El rombo SVG inline
es identidad correcta — colapsado o expandido.

### Active item del sidebar mantiene border-left brand 3px
DD-030 explícitamente lo permite en navegación funcional.
Confirmado para los 3 shells de portal.

---

## Para fase 5 (mockups cliente)

### N4-15 · Páginas reales del cliente componiendo ClientShell + patterns
Validar que listings densos del cliente (transparency, billing) entran
en `comfortable` sin sentirse vacíos. Si emerge necesidad, el cliente
podría tener override por preferencia (`data-density-override`) en su
perfil — decisión propia para fase 5.

### N4-16 · ClientShell sin nav-section-title cuando hay 1 sección
Confirmado en spec: cliente puro NO renderiza titulares de sección.
Si en fase 5 hay 6+ items y se justifica agrupar, decisión propia.

---

## Para fases 6-8 (admin / partner)

### N4-17 · AdminShell con ContextBackLink coexistiendo con Breadcrumb
Cuando el admin entra a una entidad cliente desde otro contexto, el
ContextBackLink (componente ya existente) coexiste con el Breadcrumb
del DetailPage sin doblar. Verificar visualmente en fase 7.

### N4-18 · PartnerShell con KPIs en `/partner` (overview)
Confirmar en fase 8 que los KPIs (clientes activos, comisión pendiente,
MRR generado) caben sin sentirse vacíos en densidad `standard`.

---

## Lo que esta fase NO entregó

- Implementación TS de los 4 shells en `frontend/` (registrado arriba).
- Pattern Workspace puro (chats) — fase propia.
- Mockups de páginas reales del producto compuestas con shell + patterns
  (fases 5-9).
- Settings de configuración profundos (perfil, preferencias, dark mode)
  — fase 11+.
- Override de densidad por preferencia de usuario — futuro, si emerge.
