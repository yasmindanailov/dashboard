# NOTES.md — Fase 2.E · Contenedores

> Deudas y decisiones que pasan a fases siguientes o al modo implementación.

---

## Para modo implementación · refactor crítico

### N2E-1 · Avatar paleta brand-coherent (D2E-1) — refactor obligatorio
La versión actual usa 8 colores random incluyendo pink (`#EC4899`),
orange (`#F97316`), cyan (`#06B6D4`) que **no son brand**. Migrar a
paleta de 5 colores derivados de tokens semánticos:

```ts
const colors = [
  'var(--brand)',         // color-1 · #3B82F6
  'var(--brand-active)',  // color-2 · #1D4ED8
  'var(--success)',       // color-3 · #10B981
  'var(--info)',          // color-4 · #1F8EFA
  'var(--pending)',       // color-5 · #8B5CF6
];
```

Excluir `--warning` y `--danger` deliberadamente (Avatar no debe
sugerir alerta).

### N2E-2 · Avatar tamaños · reconciliación drift TS vs CSS (D2E-Avatar-px)
El TS antiguo decía `SIZE_PX 28/40/56`, CSS decía `24/32/40`.
Spec definitiva: **xs 20 · sm 28 · md 36 · lg 44 · xl 64**. Reconciliar
en TS y CSS al promocionar.

### N2E-3 · Avatar variantes nuevas
Añadir:
- `with-status` con prop `status: 'online' | 'active' | 'busy' | 'away' | 'offline'`. Pulse en `active`.
- `group` como composición separada `<AvatarGroup max={4}>`. Avatar children + rest "+N".

### N2E-4 · Card variantes (D2E-Card-var, D2E-Card-act)
Refactor de `Card.tsx`:
```ts
interface CardProps {
  variant?: 'static' | 'action' | 'selectable' | 'featured' | 'mesh'
  selected?: boolean      // solo selectable
  featuredTag?: string    // solo featured
  loading?: boolean
  disabled?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
}
```
- `action` reemplaza `interactive` y se alinea con DD-023 (border + bg brand-subtle + shadow-xs).
- `selectable` con check-circle brand top-right cuando seleccionada.
- `featured` con tag rombo "Más popular" / "Recomendado" via prop.
- `mesh` con pseudo-element `::before` aplicando `--mesh-opacity-product`.

### N2E-5 · Modal variantes (D2E-Modal-var)
Refactor de `Modal.tsx`:
```ts
interface ModalProps {
  variant?: 'standard' | 'drawer' | 'confirm' | 'full-screen' | 'bottom-sheet'
  size?: 'sm' | 'md' | 'lg' | 'xl'    // solo standard
  destructive?: boolean                // solo confirm
  drawerSide?: 'left' | 'right'        // solo drawer
  eyebrow?: string                     // optional, brand context
  title?: string
  open: boolean
  onClose: () => void
}
```

### N2E-6 · Modal animaciones a tokens (D2E-Modal-anim)
- `slideUp 200ms ease` → `--motion-modal-in`
- `fadeIn 150ms ease` → `--transition-fast var(--ease-out)`
- Drawer slide-in lateral: keyframe nuevo con `--motion-modal-in`
- Bottom-sheet slide-up: keyframe nuevo

### N2E-7 · Modal focus trap (D2E-Modal-trap)
**Crítico a11y.** Implementar focus trap dentro del modal abierto.
Tab no puede salir del dialog. Esc cierra (excepto destructive).
Focus al primer interactivo al abrir; al trigger al cerrar.

### N2E-8 · Modal backdrop a token de marca
`rgba(0, 0, 0, 0.4)` → `rgba(15, 23, 42, 0.4)` (slate-900 marca · DD-021).

### N2E-9 · EmptyState 4 variantes (D2E-Empty)
Refactor de `EmptyState.tsx`:
```ts
interface EmptyStateProps {
  variant?: 'inline' | 'page' | 'search' | 'first-time'
  eyebrow?: string         // first-time
  icon?: ReactNode         // search típicamente
  title: string
  description?: string
  action?: ReactNode        // page, first-time
  rombos?: boolean          // inline, page (decoración firma)
}
```

Aplicar matriz de voz Aelium documentada en spec en cada uso.

### N2E-10 · Voz de marca · refactor copy en empty states actuales
Aplica a TODOS los usos de EmptyState en código:
- Tablas vacías
- Búsquedas sin resultados
- Listings vacíos
- Onboarding flows

Cada caso requiere refactor de copy según variante. Trabajo de copy +
refactor mecánico.

---

## Decisiones cerradas

### Card mesh-strong solo en hero
`mesh-strong` (opacity 0.08) reservado para card hero del cliente
Overview. Mesh estándar (0.04) para el resto.

### Avatar excluye warning/danger en paleta
Decisión consciente: ámbar = alerta, rojo = problema. Avatar nunca
debe sugerir esto del usuario.

### Modal confirm-destructive con accent-stripe-left danger
3px solid `--danger` lateral izquierdo. Refuerza la criticidad sin
saturar.

### Bottom-sheet con drag handle 4px
Convención mobile estándar (Apple, Google). Visual cue para arrastrar.

### EmptyState first-time con eyebrow brand
Consistente con StatsCard, modal-eyebrow, Card mesh hero. La firma
visual se hereda.

---

## Para fase 2.F (refresh variantes pendientes)

### N2E-11 · Card y Modal pasan a tener prop `loading` consumida por components que los usan
StatsCard ya tiene loading. Card .loading-v y Modal con loading state
serán útiles cuando hay async data.

---

## Para fase 3 (patrones)

### N2E-12 · DetailPage compone Modal drawer
El drawer es un caso de "vista rápida desde listado" que el patrón
DetailPage puede ofrecer como atajo.

### N2E-13 · ListPage incorpora EmptyState inline
Cuando filtros vacían el listado, inline empty con voz Aelium.

### N2E-14 · FormPage compone Modal full-screen
Wizards de onboarding y checkout son full-screen con stepper en header.

---

## Para fase 4 (shells)

### N2E-15 · ClientShell · Avatar with-status en topbar
Mostrar el agente de soporte que está online ahora — Avatar with-status
data-status="active" + pulse.

### N2E-16 · AdminShell · Avatar group en team picker
Cuando el admin asigna agente a un cliente/ticket — picker con
AvatarGroup.

---

## Lo que esta fase NO entregó

- Sub-pattern de "card with header section + body section + footer" — patrón compuesto, fase 3.
- Avatar con cover image + initials fallback (cubierto: si hay src usa img, si no initials).
- Modal con tabs internas (combinación Modal filled + Tabs filled de DD-028) — composición, no variant.
