# audit-existing.md — 4 componentes contenedores

---

## 1. Card (`Card.tsx` 13L · `Card.module.css` 19L)

```ts
variant?: 'default' | 'interactive'
padding?: 'none' | 'sm' | 'md' | 'lg'
```

**Hallazgos:**
- ⚠ Solo 2 variants. Falta selectable, featured, mesh para cubrir casos producto reales (plan selector, hero cliente, multi-select).
- ⚠ `interactive` (= action) no usa `--brand-subtle` bg como hace nuestro `.card-action` de DD-023. Hover solo cambia border + sombra. Actualizar.
- ⚠ Padding scale es `none/sm/md/lg`. Coherente, ok. Spec mantiene + añade props específicos por variante.
- ⚠ Sin estado disabled. Si una card es seleccionable, debe poder estar disabled.
- ⚠ Sin loading state. Para skeleton interno cuando carga.

## 2. Modal (`Modal.tsx` 58L · `Modal.module.css` 82L)

```ts
size?: 'sm' | 'md' | 'lg'
title?, footer?
```

**Hallazgos:**
- ✓ Portal-based, ESC handler, scroll lock — bien implementado.
- ⚠ Solo variant overlay centrado. Falta drawer (lateral), confirm (destructiva), full-screen (multi-paso), bottom-sheet (mobile).
- ⚠ Animaciones `slideUp 200ms ease` y `fadeIn 150ms ease` sin tokens. Migrar a `--motion-modal-in` y easings tokens.
- ⚠ Background overlay `rgba(0, 0, 0, 0.4)` — alineado con `--surface-dark` rgba? Migrar a token brand-aware: `rgba(15, 23, 42, 0.4)` (alineado a `--surface-dark` post-DD-021).
- ⚠ Sin focus trap (a11y crítico para modales).
- ⚠ Close icon hardcoded 20×20 — `--icon-size-lg`.
- ⚠ Title en `--font-size-md`. OK.

## 3. Avatar (`Avatar.tsx` 67L · `Avatar.module.css` 25L)

```ts
name: string
src?: string
size?: 'sm' | 'md' | 'lg'
```

**Hallazgos:**
- ⚠ **D2E-1**: paleta de 8 colores random (`#3B82F6`, `#10B981`, `#F59E0B`, `#EF4444`, `#8B5CF6`, `#EC4899`, `#06B6D4`, `#F97316`). Pink, orange, cyan **no son brand**. Viola coherencia (rasgo "Riguroso y consecuente"). Migrar a paleta brand-coherent.
- ⚠ Tamaños inconsistentes: `SIZE_PX` en TS dice 28/40/56, pero CSS dice 24/32/40. **Drift severo**.
- ⚠ Spec sm/md/lg solamente. Falta xs (16px para inline en chips/celdas) y xl (64-80px para profile pages).
- ⚠ Sin variant `with-status` (avatar + StatusDot inline).
- ⚠ Sin variant `group` (overlapping para teams).
- ✓ Hash determinístico OK (mismo nombre = mismo color siempre).
- ✓ getInitials toma 2 primeras palabras. Bien.
- ⚠ Color text en initials = `--text-on-brand` siempre. Sobre púrpura/cyan no contrasta bien. Verificar AA con paleta nueva.

## 4. EmptyState (`EmptyState.tsx` 21L · `EmptyState.module.css` 32L)

```ts
icon?, title, description?, action?
```

**Hallazgos:**
- ⚠ Forma única. No diferencia entre inline (tabla vacía), page (full empty), search (sin resultados), first-time (onboarding). Cada uno tiene UX distinta.
- ⚠ Title en `--font-size-md` weight medium. Para variante page debería ser más grande (display-sm o lg).
- ⚠ Description max-width 360px hardcoded. OK para page, no para inline.
- ⚠ Sin firma visual. Candidato fuerte a `.aelium-dot` agrupados como "ilustración mínima" (DD-023).
- ⚠ Sin variante con loading (`.aelium-loader.lg` mientras carga, antes de saber si está vacío).

---

## Resumen de drifts

| ID | Componente | Drift | Resolución |
|---|---|---|---|
| **D2E-1** | Avatar | 8 colores random no brand | Migrar a paleta brand-coherent (5 colores). |
| **D2E-Avatar-px** | Avatar | TS dice 28/40/56, CSS 24/32/40 | Reconciliar con tamaños spec definitivos. |
| **D2E-Card-act** | Card | `interactive` no usa --brand-subtle | Alinear con `.card-action` de DD-023. |
| **D2E-Card-var** | Card | 2 variants, falta selectable/featured/mesh | Añadir 3 nuevas. |
| **D2E-Modal-var** | Modal | 1 variant, falta drawer/confirm/full/bottom | Añadir 4 nuevas. |
| **D2E-Modal-anim** | Modal | Anim sin tokens | Migrar a `--motion-modal-in`. |
| **D2E-Modal-trap** | Modal | Sin focus trap | Añadir en implementación. |
| **D2E-Empty** | EmptyState | Forma única | Añadir 4 variantes contextuales. |
