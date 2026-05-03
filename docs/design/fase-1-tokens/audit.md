# audit.md — Fase 1 vs globals.css actual

> Diff exhaustivo entre `frontend/app/globals.css` (estado actual) y
> `tokens.css` (entregable de fase 1). Incluye plan de migración y
> riesgos detectados. Esta auditoría se ejecuta en **modo diseño** y
> no modifica el código — la promoción a `globals.css` es paso aparte
> en modo implementación.

---

## Resumen ejecutivo

| Categoría | Conteo |
|-----------|--------|
| Tokens existentes mantenidos sin cambio | 51 |
| **Tokens nuevos añadidos** | **42** |
| Tokens existentes modificados | **0** |
| Tokens existentes eliminados | **4** (warning extra · ver §3) |
| Selectores CSS nuevos | 1 (`[data-density="comfortable"]`) |
| Riesgo de regresión | **Bajo** — migración aditiva |

---

## 1. Tokens mantenidos sin cambio (51)

Brand (5), surfaces (4), text (5), borders (3), radii (6), shadows (6),
spacing (14), font-family (1), font sizes xs–2xl (7), font weights (3),
line-heights tight/normal/relaxed (3), durations (3), layout chrome (3),
z-index (6).

**Acción:** ninguna. Los componentes que consumen estos tokens hoy siguen
funcionando idéntico.

---

## 2. Tokens nuevos (42)

### 2.1 Color · -strong (4 nuevos)

```
--success-strong  · #047857
--warning-strong  · #92400E
--danger-strong   · #B91C1C
--info-strong     · #1E40AF
```

**Por qué.** Texto sobre fondos `-light` con contraste WCAG AA. Antes los
componentes que renderizaban texto sobre `-light` hardcodeaban el color
(ver `Badge.tsx`, `AlertBanner.tsx`).

**Verificación de contraste** (en preview.html):
- success-strong sobre success-light opaco: AA · 5.9:1
- warning-strong sobre warning-light opaco: AA · 7.1:1
- danger-strong sobre danger-light opaco: AA · 6.4:1
- info-strong sobre info-light opaco: AA · 8.6:1

### 2.2 Color · pending — set completo (6 nuevos)

```
--pending          · #8B5CF6
--pending-hover    · #7C3AED
--pending-active   · #6D28D9
--pending-light    · rgba(139,92,246,0.08)
--pending-border   · rgba(139,92,246,0.18)
--pending-strong   · #6D28D9
```

**Por qué.** `StatusDot` ya usa `#8B5CF6` literal para el estado pending.
Formalizarlo como semántico evita inconsistencias y permite usarlo en
Badge, AlertBanner, etc.

### 2.3 Color · -hover semánticos (3 nuevos)

```
--success-hover  · #059669
--danger-hover   · #DC2626
--info-hover     · #2563EB
```

**Por qué.** Coherencia con `--brand-hover`. `--warning-hover` ya existía.

### 2.4 Tipografía (4 nuevos)

```
--font-size-3xl  · 40px      (display-sm)
--font-size-4xl  · 56px      (display-lg)
--font-mono      · JetBrains Mono fallback
--line-height-snug · 1.35    (entre tight y normal)
```

**Por qué.** Display para empty states, hero cliente, números prominentes.
Mono para IDs técnicos (error-log, jobs/failed). Snug para h2/h3 sin
quedarse demasiado apretados.

### 2.5 Motion · easings (4 nuevos)

```
--ease-out      · cubic-bezier(0.16, 1, 0.3, 1)
--ease-in       · cubic-bezier(0.7, 0, 0.84, 0)
--ease-in-out   · cubic-bezier(0.65, 0, 0.35, 1)
--ease-spring   · cubic-bezier(0.34, 1.56, 0.64, 1)
```

**Por qué.** Antes solo el `ease` nativo de CSS. Sin easings nombrados,
cada componente inventaba su curva. Necesario para Framer Motion coherente.

### 2.6 Layout · containers (3 nuevos)

```
--container-form    · 720px
--container-detail  · 1040px
--container-list    · 1280px
```

**Por qué.** UI_SPEC §2 define anchos máximos de contenido por tipo de
página. Los formaliza como tokens consumibles desde `ListPage`,
`DetailPage`, `FormPage`.

### 2.7 Iconografía (4 nuevos)

```
--icon-size-sm       · 14px
--icon-size-md       · 16px
--icon-size-lg       · 20px
--icon-stroke-width  · 1.5
```

**Por qué.** Sin tokens base de tamaño/stroke, cada SVG inline decidía por
su cuenta. El set concreto (Lucide / Phosphor / custom) se decide en
fase 2.

### 2.8 Firma visual · accent (4 nuevos)

```
--accent          · var(--brand)
--accent-hover    · var(--brand-hover)
--accent-light    · var(--brand-light)
--accent-subtle   · var(--brand-subtle)
```

**Por qué.** Variable indirecta. Componentes consumen `--accent` en vez
de `--brand` directo, preparando override por portal sin tocar
componentes. **Override por portal diferido a fase 4** — actualmente
`--accent` ≡ `--brand` en toda la app.

### 2.9 Firma visual · mesh (2 nuevos)

```
--mesh-opacity-auth     · 1
--mesh-opacity-product  · 0.04
```

### 2.10 Firma visual · densidad raw + resuelta (12 nuevos)

```
Raw:
--row-height-compact / -comfortable
--cell-padding-compact / -comfortable
--card-padding-compact / -comfortable
--body-size-compact / -comfortable

Resueltos (consumidos por componentes):
--row-height
--cell-padding
--card-padding
--body-size
```

**Por qué.** Densidad como dialecto del mismo design system (DD-010).
Componentes consumen las resueltas; el switch ocurre en el shell del
portal vía `[data-density]`. Asignación por portal se cierra en fase 4.

### 2.11 Firma visual · focus ring (2 nuevos)

```
--focus-ring          · 0 0 0 2px surface-primary, 0 0 0 4px brand
--focus-ring-on-dark  · 0 0 0 2px surface-dark, 0 0 0 4px brand-light
```

### 2.12 Firma visual · numerals (1 nuevo)

```
--font-feature-numeric  · "tnum" 1, "lnum" 1
```

### 2.13 Firma visual · motion choreography (7 nuevos)

```
--motion-stagger-fast   · 30ms
--motion-stagger-base   · 60ms
--motion-route          · 220ms ease-out
--motion-stack-in       · 180ms ease-out
--motion-stack-out      · 140ms ease-in
--motion-modal-in       · 240ms ease-out
--motion-modal-out      · 180ms ease-in
```

---

## 3. Tokens existentes que cambian de forma

### 3.1 Eliminaciones controladas (4 tokens)

`globals.css` actual incluye 4 tokens warning extra (`--warning-dark`,
`--warning-darker`, `--warning-subtle`) y un alias (`--transition-base`)
que **no se mantienen** en el nuevo set:

| Token actual | Estado | Reemplazo / razón |
|--------------|--------|-------------------|
| `--warning-dark` (#92400E) | **Reemplazado por** `--warning-strong` | Mismo valor, nombre semántico coherente con el resto. |
| `--warning-darker` (#78350F) | **Eliminado** | No aparece consumido en la auditoría — verificar en migración antes de borrar. |
| `--warning-subtle` (#FDE68A) | **Eliminado** | Color pleno (no alpha) sin equivalente en otros semánticos. Verificar uso antes de borrar. |
| `--transition-base` (200ms ease) | **Reemplazado por** `--transition-normal` | Alias redundante. Si está siendo consumido, refactor mecánico. |

**Acción de migración (modo implementación):**
1. `grep -r "warning-dark\|warning-darker\|warning-subtle\|transition-base" frontend/`
2. Para cada uso de `--warning-dark` → renombrar a `--warning-strong`.
3. Para `--warning-darker` y `--warning-subtle`: si hay usos, decidir
   entre reintroducir el token o ajustar el componente. Si no hay usos,
   borrar.
4. Para `--transition-base` → renombrar a `--transition-normal`.

### 3.2 Refinamientos de transparencia en `-border` semánticos

| Token | Antes | Después | Diferencia |
|-------|-------|---------|------------|
| `--success-border` | `rgba(16,185,129,0.15)` | `rgba(16,185,129,0.18)` | +0.03 alpha |
| `--warning-border` | `rgba(245,158,11,0.15)` | `rgba(245,158,11,0.18)` | +0.03 alpha |
| `--danger-border` | `rgba(239,68,68,0.15)` | `rgba(239,68,68,0.18)` | +0.03 alpha |
| `--info-border` | `rgba(59,130,246,0.15)` | `rgba(59,130,246,0.18)` | +0.03 alpha |

**Razón.** Coherencia con escala visual (border ligeramente más visible
sobre `-light` para que AlertBanner se distinga del fondo). Diferencia
imperceptible aislada — registrada para trazabilidad.

**Riesgo:** ninguno conocido. Cambio óptico mínimo.

---

## 4. Selectores CSS nuevos (1)

```css
[data-density="comfortable"] {
  --row-height:   var(--row-height-comfortable);
  --cell-padding: var(--cell-padding-comfortable);
  --card-padding: var(--card-padding-comfortable);
  --body-size:    var(--body-size-comfortable);
}
```

El default (`compact`) vive en `:root`. El `comfortable` se activa
poniendo `data-density="comfortable"` en el shell del portal o un
contenedor padre.

---

## 5. Plan de migración (modo implementación, NO ejecutar aquí)

### Paso 1 — Promoción de tokens.css a globals.css

Reemplazo del bloque `:root` de `frontend/app/globals.css` por el
contenido de `tokens.css`, **preservando** las reglas base (`body`,
`*:focus-visible`, `::selection`, scrollbar, `.noise-texture`) que viven
fuera del bloque `:root` actual.

### Paso 2 — Resolución de tokens warning eliminados

Antes de borrar `--warning-dark`, `--warning-darker`, `--warning-subtle`,
`--transition-base`, ejecutar:

```bash
cd frontend
grep -rEn "warning-dark|warning-darker|warning-subtle|transition-base" \
  --include="*.tsx" --include="*.css" --include="*.module.css" .
```

Por cada match: refactor mecánico al nuevo token o decisión documentada.
**No promocionar tokens.css sin completar este paso.**

### Paso 3 — Refactor de hardcoded text colors en componentes -light

Componentes que pintan texto sobre fondo `-light` y hoy hardcodean:
candidatos a refactor en fase 2 (no en fase 1):

```bash
grep -rEn "color:\s*#047857|color:\s*#92400E|color:\s*#B91C1C|color:\s*#1E40AF" \
  --include="*.tsx" --include="*.css" --include="*.module.css" frontend/
```

Cada uno → reemplazar por la variable `--{state}-strong` correspondiente.

### Paso 4 — Verificación

1. `pnpm run dev` desde `frontend/`.
2. Abrir `/dashboard/ds-preview` — todos los componentes deben renderizar
   sin regresión visual.
3. Smoke test: `/dashboard`, `/dashboard/services`, `/admin/clients`.

### Paso 5 — Registrar en `implementation-log/`

Crear `docs/design/implementation-log/fase-1-impl.md` con:
- Hash del commit que aplicó los cambios.
- Lista de archivos tocados.
- Resultados del paso 2 (refactor de tokens warning).
- Drift detectado (si lo hay).

---

## 6. Riesgos y mitigaciones

| Riesgo | Probabilidad | Mitigación |
|--------|--------------|------------|
| Componente consumiendo `--warning-dark` sin refactor → color blanco | Baja | Paso 2 obligatorio antes de promocionar. |
| Componente consumiendo `--transition-base` → animación rota | Muy baja | Mismo paso 2 + alias temporal en globals.css si se quiere transición suave. |
| Refactor de `-strong` no completado → texto hardcoded subsiste | Media | Lista de matches en paso 3. Tarea explícita de fase 2 cuando se actualicen specs de Badge/AlertBanner/Toast. |
| Selector `[data-density]` sin set en ningún shell → sin efecto | Cero | Por diseño. Hasta fase 4 no se aplica; default compact funciona como hoy. |
| Override `[data-portal]` sin set → cero diferenciación visual | Cero | Por diseño. Decisión cerrada en DD-014. |

---

## 7. Compatibilidad con dark mode (fase 11)

Toda la arquitectura de nombres es **rol-based**, no literal. La fase 11
solo cambiará valores dentro de `[data-theme="dark"]`, sin renombrar
tokens ni tocar componentes:

```css
[data-theme="dark"] {
  --surface-primary: #0A0A0B;
  --surface-secondary: #18181B;
  --text-primary: rgba(255, 255, 255, 0.92);
  /* ... etc */
  --focus-ring: var(--focus-ring-on-dark);
}
```

Pendiente fase 11: revisar contraste de los `-strong` sobre los `-light`
en dark; posible ajuste de `-shadow-*` (más sutil o sustituido por
borde activo).
