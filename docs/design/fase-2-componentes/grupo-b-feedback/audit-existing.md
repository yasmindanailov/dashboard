# audit-existing.md — 7 componentes feedback

> Auditoría just-in-time. Drift y observaciones por componente.

---

## 1. Badge (`Badge.tsx` 19L · `Badge.module.css` 20L)

```ts
variant?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand'
children: ReactNode
```

**Hallazgos:**
- ⚠ **D2B-A**: text colors hardcoded `#047857`, `#B45309`, `#B91C1C`, `#1D4ED8`. Ahora hay `--{state}-strong`. Migrar.
- ⚠ **D2B-1**: NO incluye `pending` (púrpura). DD-004 ya lo formalizó.
- ⚠ Sin tamaños sm/md. Solo un tamaño implícito.
- ⚠ No soporta icono prefijo (común en badges con StatusDot inline o icono).
- ✓ Variante `brand` distinta a `info` — bien (acción brand vs aviso neutro).
- ✓ Padding 2px / `--space-2` razonable para badge.

## 2. StatusDot (`StatusDot.tsx` 19L · `StatusDot.module.css` 27L)

```ts
color?: 'success' | 'warning' | 'danger' | 'info' | 'neutral'
pulse?: boolean
```

**Hallazgos:**
- ⚠ **D2B-1**: falta `pending`. Mismo problema que Badge.
- ✓ Pulse animation correcta.
- ⚠ Color `info` mapea a `--brand` (no `--info`). Inconsistencia menor.
- ⚠ Tamaño 8px hardcoded sin token. Convertir a `--icon-size-sm` (=14px) sería romper la identidad visual del dot. **Mantener 8px** y documentar como excepción justificada (es el tamaño del `.aelium-dot`).
- ⚠ Sin variantes de tamaño (sm/md). El uso lo justifica probablemente — un dot grande no tiene sentido.

## 3. Toast (`Toast.tsx` 219L · `Toast.module.css` 120L)

```ts
ToastVariant: 'success' | 'error' | 'warning' | 'info'
ToastMessage { id, variant, message, duration, onUndo? }
```

Provider con context. Soporta toastUndo (botón Deshacer + countdown bar).

**Hallazgos:**
- ⚠ **D2B-A**: backgrounds dark hardcoded `#065F46`, `#7F1D1D`, etc. Mapear a tokens.
- ⚠ **D2B-5**: filosofía dark vs light. Toast actual es dark sobre el viewport — coherente con marca minimalista (raised oscuro). Mantener pero formalizar tokens.
- ⚠ Animación `slideIn 200ms ease` sin easing token. Migrar a `--motion-stack-in` o `--ease-spring` para entrada con énfasis.
- ⚠ Iconos hardcoded a 18×18. Token `--icon-size-md` es 16, `--icon-size-lg` es 20. 18 está entre dos. Decidir: 18 como excepción o mover a 16/20.
- ⚠ Variant naming: usa `error` (no `danger`). Inconsistencia con resto del sistema (`--danger`). **Renombrar** a `danger` en spec.
- ✓ Undo + countdown bar — feature pulida. Mantener.
- ✓ Position fixed, container con flex column-reverse — newest on top visualmente.

## 4. AlertBanner (`AlertBanner.tsx` 81L · `AlertBanner.module.css` 70L)

```ts
variant?: 'info' | 'success' | 'warning' | 'danger'
title?, children, onClose?
```

**Hallazgos:**
- ⚠ **D2B-A**: text colors hardcoded (`#1E40AF`, `#065F46`, `#92400E`, `#991B1B`). Mapear a `--{state}-strong`.
- ⚠ Border alpha 0.15 — DD-018 lo subió a 0.18. Drift.
- ⚠ **D2B-4**: falta variant `pending`. Caso real: "Tarea en revisión", "Pendiente de validación".
- ⚠ Icon hardcoded a 18px (igual que Toast). Decidir.
- ⚠ Sin firma visual. Candidato a `.accent-stripe-left` cuando es informativo persistente.
- ✓ Estructura icon + content (title + body) + close limpia.

## 5. Tooltip (`Tooltip.tsx` 35L · `Tooltip.module.css` 33L)

```ts
content: string
position?: 'top' | 'bottom' | 'left' | 'right'
multiline?: boolean
```

**Hallazgos:**
- ⚠ Background `--text-primary` (negro) — tras DD-021 es `#0F172A` (azul muy oscuro). OK, bien.
- ⚠ Animación `fadeIn 100ms ease` sin token. Migrar a `--motion-stack-in` o más rápido.
- ⚠ Estado actual: solo aparece on hover. Sin focus support — accesibilidad incompleta. Implementación debe añadir trigger por focus también.
- ✓ Posicionamiento via `top/bottom/left/right` clases.
- ✓ Multiline para texto largo (HelpTip).

## 6. HelpTip (`HelpTip.tsx` 49L)

Compose de Tooltip + icono ⓘ. Specifico para cliente.

**Hallazgos:**
- ✓ Bien diseñado conceptualmente.
- ⚠ Icon hardcoded 14×14. Token: `--icon-size-sm` (14). Migrar a token.
- ⚠ Regla "max 2-3 por página" documentada en JSDoc. Llevarla a spec.
- ⚠ Regla "solo cliente" en JSDoc. Confirmar y documentar.

## 7. Skeleton (`Skeleton.tsx` 21L · `Skeleton.module.css` 17L)

```ts
width?, height?, circle?
```

**Hallazgos:**
- ⚠ Gradient con `--surface-secondary` y `--surface-tertiary` — tras DD-021, esos tokens cambiaron. El shimmer queda azulado-tintado. Bien, alineado con marca.
- ⚠ **D2B-3**: variante morfológica. Skeleton actual es genérico (rectángulo o círculo). Spec puede añadir patterns: line (texto), paragraph (3 lines), card-row, avatar. Y opcionalmente: rombo skeleton para identidad.
- ✓ Animation 1.5s ease-in-out — razonable. Podría migrar a `--ease-in-out` token.

---

## Resumen de drifts y decisiones

| ID | Aplica a | Drift | Resolución |
|----|----------|-------|------------|
| **D2B-A** | Badge · Toast · AlertBanner | Hex hardcoded en text/bg colors | Migrar a `--{state}-strong` y nuevos tokens donde haga falta. |
| **D2B-1** | Badge · StatusDot | Falta `pending` semántico | Añadir variant pending. |
| **D2B-2** | Badge | Sin tamaños sm/md | Añadir sm/md. |
| **D2B-3** | Skeleton | Solo block/circle | Añadir variantes morfológicas (line, paragraph, avatar, card-skeleton). |
| **D2B-4** | AlertBanner | Falta variant pending | Añadir. |
| **D2B-5** | Toast | Dark vs light filosofía | Mantener dark, pero formalizar con tokens. |
| D2B-6 | Toast · Tooltip | Animaciones sin tokens | Migrar a `--motion-*`. |
| D2B-7 | Toast | Icon 18px sin token | Decidir entre 16 y 20 (`--icon-size-md` o `-lg`). |
| D2B-8 | Toast | Variant naming `error` ≠ `danger` | Renombrar a `danger`. |
| D2B-9 | Tooltip | Sin focus trigger | Añadir en spec, implementar en modo implementación. |
| D2B-10 | HelpTip | Icon 14px hardcoded | Migrar a `--icon-size-sm`. |
