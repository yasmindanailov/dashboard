# NOTES.md — Fase 2.B · Feedback

> Deudas que pasan a fases siguientes o al modo implementación.

---

## Para modo implementación

### N2B-1 · Migrar text colors hardcoded a `--{state}-strong`
Aplica a Badge (4), AlertBanner (4). Sustitución mecánica.

### N2B-2 · Añadir variant `pending` (D2B-1, D2B-4)
Aplica a Badge, StatusDot, AlertBanner. Hay que extender:
- `BadgeVariant` enum
- `StatusDotColor` enum
- `AlertBannerVariant` enum
- Y los CSS modules correspondientes con tokens `--pending-*` ya existentes.

### N2B-3 · Tamaños sm/md en Badge (D2B-2)
Añadir clases `.badge-sm` y `.badge-md`.

### N2B-4 · Rename Toast variant `error` → `danger` (D2B-8)
Rename + audit usages en código. Probablemente impacta en cada `useToast().toast('error', ...)`.

### N2B-5 · Toast animations a tokens (D2B-6)
`slideIn 200ms ease` → `--motion-stack-in`. `fadeIn 100ms ease` (Tooltip) → `--transition-fast` + `--ease-out`. `Dropdown fadeIn` (D2A-6) ya estaba en NOTES de 2.A.

### N2B-6 · Border alphas AlertBanner DD-018
0.15 → 0.18 alpha en los borders semánticos. Migrar de rgba inline a `--{state}-border`.

### N2B-7 · Skeleton variantes morfológicas (D2B-3)
Añadir variantes line, line-lg, title, avatar, paragraph, row, rombo a `Skeleton.tsx`. Clases CSS ya en `mockup/styles.css`.

### N2B-8 · Tooltip focus trigger (D2B-9)
**Importante a11y.** Tooltip actual solo aparece on hover. Añadir focus listener y Esc para cerrar.

### N2B-9 · Reduced-motion en Skeleton y otros
Añadir media query `prefers-reduced-motion: reduce` que desactive `skeleton-shimmer` y `status-pulse-ring`.

### N2B-10 · HelpTip icon a token (D2B-10)
14×14 hardcoded → `--icon-size-sm`.

### N2B-11 · Voz de marca · refactor de copy
Aplica a TODOS los usages de Toast (mensajes), AlertBanner (titles + body), Tooltip (content), HelpTip (text). Recorrer cada `.tsx` que llama a estos componentes y reescribir el copy según las reglas de cada spec.

---

## Decisiones cerradas aquí (no escalan)

### Toast mantiene fondo dark (D2B-5)
Decisión final tras debate. Los dark backgrounds funcionan: el toast destaca sin invadir el layout. Es la "única excepción al light-first" que comparte con Tooltip y BulkActionBar — pattern consistente.

### Toast/AlertBanner icons a 18px
Excepción documentada. Está entre `--icon-size-md` (16) y `-lg` (20). Para feedback, 18 funciona mejor visualmente. Si emerge un patrón, considerar `--icon-size-md-plus` o ajustar 16 → 18 (pero es cambio fundacional, no aquí).

### StatusDot sin tamaños
8px hardcoded justificado: es el tamaño signature de marca (mismo que `.aelium-dot`). No tiene sentido un dot grande.

### Skeleton-rombo separado del .aelium-loader
Rombo skeleton es estático con pulse de opacity. `.aelium-loader` es dinámico (dos rombos pulsando alternativamente). Diferentes momentos de uso: skeleton acompaña al contenido placeholder, loader es el momento "cargando".

---

## Para fase 2.C (data)

### N2B-12 · Skeleton-row aplicado a Table loading
La spec de Table en fase 2.C debe consumir `.skeleton-row` para loading state. Documentado como pattern compartido.

### N2B-13 · StatsCard valor con `.num` + skeleton de número grande
Cuando StatsCard carga, mostrar skeleton de tamaño `display-sm` (40px) en lugar del valor. Con `.num` aplicado.

---

## Para fase 2.D (navegación)

### N2B-14 · NotificationBell consume StatusDot pulse
Para indicar notificaciones nuevas.

### N2B-15 · Tabs activo con accent-stripe
Ya en DD-023. Confirmar al diseñar Tabs.

---

## Para fase 3 (patrones)

### N2B-16 · EmptyState compone Skeleton-rombo + voz Aelium
Empty states son momento de marca. Combinan ilustración mínima (rombo o triple-rombo) + texto en voz Aelium + posible CTA.

---

## Lo que esta fase NO entregó

- Combobox / autocomplete (no en código actual).
- Date picker / Time picker.
- Progress bar (lineal). Solo aparece en Toast undo.
- Spinner separado del button (sí está `.aelium-loader` cubriendo este caso).
