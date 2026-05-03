# NOTES.md — Fase 2.D · Navegación

> Deudas y decisiones que pasan a fases siguientes o al modo implementación.

---

## Para modo implementación · refactor crítico

### N2D-1 · NotificationBell · drift Stripe legacy (D2D-1, D2D-10, D2D-11)

**Refactor obligatorio** — el componente actual usa hex Stripe heredados.

```diff
- color: var(--text-link, #635BFF);     // .linkBtn
+ color: var(--brand);

- background: rgba(99, 91, 255, 0.04);  // .itemUnread
+ background: var(--brand-subtle);

- background: #635BFF;                   // .dot
+ background: var(--brand);

- background: #EF4444;                   // .badge
+ background: var(--danger);

- color: #fff;                           // badge color
+ color: var(--text-on-brand);

- box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12);
+ box-shadow: var(--shadow-xl);

- background: #FEF2F2; color: #991B1B; border-bottom: 1px solid #FECACA;  // .error
+ background: var(--danger-light); color: var(--danger-strong); border-bottom: 1px solid var(--danger-border);
```

Y sustituir `font-size: 12/13/14` por `var(--font-size-xs/sm)`.

### N2D-2 · NotificationBell · pulse animation cuando hay nuevas (D2D-2)

Añadir `.bell-badge.pulse` cuando `unreadCount > 0` y la cuenta acaba de
incrementar (no permanente). Refuerza el rasgo "proactivo" de marca.

### N2D-3 · CommandPalette · `--surface-hover` no existe (D2D-3)

Bug actual: `var(--surface-hover)` en `.item:hover` y `.itemActive` no
resuelve a nada. Migrar a `var(--brand-subtle)` (mismo tratamiento que
`.dropdown-item:hover`).

### N2D-4 · CommandPalette · empty voz Aelium (D2D-9)

```diff
- No se encontraron resultados para "{query}"
+ No encontramos nada para «{query}». Prueba con otra cosa.
```

### N2D-5 · CommandPalette · animaciones a tokens

```diff
- animation: overlayIn 120ms ease;
+ animation: cmd-overlay-in var(--transition-fast) var(--ease-out);

- animation: paletteIn 150ms ease;
+ animation: cmd-palette-in var(--motion-modal-in);
```

### N2D-6 · CommandPalette · activación visible

Mostrar atajo `⌘K` en topbar como hint para descubrimiento. UX pequeña
con gran impacto en adopción.

### N2D-7 · Tabs · keyboard navigation (D2D-7)

Añadir handlers Arrow Left/Right entre tabs, Home/End para
primer/último. Estándar a11y.

### N2D-8 · Breadcrumb · ajustes menores

- `--text-tertiary` → `--text-secondary` en links (legibilidad).
- aria-label "Breadcrumb" → "Ruta de navegación".
- Icon hardcoded 14px → `var(--icon-size-sm)`.

### N2D-9 · PortalBadge · variant agent + logo SVG

- Documentar en spec: agent reusa shell admin (mismo subtitle).
- Cuando `aelium_logo_blue.svg` está disponible, usar SVG en lugar de texto "Aelium".

### N2D-10 · Voz de marca · refactor copy

Aplica a:
- Tabs: labels en castellano corto ("Resumen" no "Overview").
- Breadcrumb: nombres reales del recurso.
- CommandPalette: descripciones de items, empty, footer hints.
- NotificationBell: title + body de cada notificación. **Backend genera
  el copy** — documentar reglas para que el equipo backend respete voz
  Aelium en plantillas de notificación.
- PortalBadge: subtitles canónicos en `lib/portal.ts`.

---

## Decisiones cerradas aquí

### D2D-1: BulkActionBar y NotificationBell — patrones comparados
Ambos son flotantes. BulkActionBar permanece light (DD ya tomada en
2.C). NotificationBell panel también light pero badge danger. Coherencia.

### D2D-4: PortalBadge `agent` reusa admin
Documentado. Same shell, distintos permisos.

### D2D-5: Diferenciación por portal sutil (texto, no color)
Coherente con marca "construido para durar". Si en fase 4 (DD-014) se
decide override de accent por portal, PortalBadge consume esos tokens.

### D2D-6: Tabs activo border-bottom (no accent-stripe)
Border-bottom es el patrón horizontal correcto. Accent-stripe es para
elementos verticales (sidebar, filtros aplicados).

---

## Para fase 2.E (contenedores)

### N2D-11 · CommandPalette y NotificationBell consumen Modal pattern
Ambos abren overlay. Cuando se cierre Modal en fase 2.E, revisar si
comparten más tokens (z-index, backdrop, animación).

### N2D-12 · EmptyState con voz para Notificaciones y Search
Cuando se diseñe EmptyState en 2.E, las cards de "no hay notificaciones"
y "no hay resultados" pueden compartir patrón.

---

## Para fase 4 (shells)

### N2D-13 · Sidebar header consume PortalBadge
El shell admin/cliente/partner monta PortalBadge en su header. Spec
de fase 4 referenciará este componente.

### N2D-14 · Topbar consume NotificationBell + CommandPalette trigger
Layout fijo: search trigger izquierda + bell + avatar derecha. Spec en
fase 4.

### N2D-15 · Sidebar items con accent-stripe (DD-023 ya planificó)
Pattern del sidebar item activo coincide con `.accent-stripe-left`.
Confirmar al diseñar shells.

### N2D-16 · Acento por portal definitivo (DD-014)
Cuando se decida si los portales tienen accent distinto, PortalBadge,
NotificationBell, Tabs, etc. consumen `--accent` en lugar de `--brand`
directo. Refactor mecánico cuando se cierre.

---

## Lo que esta fase NO entregó

- Sidebar componente completo — fase 4.
- Topbar componente completo — fase 4.
- Mobile drawer / responsive nav — fase 4.
- Submenús anidados — defendido como anti-patrón (Dropdown spec ya lo dice).
- Pagination tipo "infinite scroll" — sin caso real.
- Tabs verticales — sin caso real (sidebar items reemplazan).
