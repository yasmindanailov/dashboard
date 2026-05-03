# Tabs (+ StatusTabs) — Spec

> Estado: **listo**
> Fuente: `frontend/app/components/ui/Tabs/` + `frontend/app/components/ui/StatusTabs/`
> Maqueta: `mockup/components/tabs.html`

---

## 1. Anatomía

```
┌─Resumen──┬─Servicios──┬─Facturas──┬─Notas─────┐
│ ─────── │            │           │           │  ← border-bottom brand en activo
│         │            │           │           │
```

Dos componentes hermanos:

- **Tabs**: navegación entre vistas dentro de una página. Sin lógica de filtro, separa contenido.
- **StatusTabs**: tabs como filtros de estado en list pages, con count + variant semántico per tab.

| Parte | Token / detalle |
|---|---|
| `.tabs` | Flex horizontal, `border-bottom` del wrapper en `--border`. |
| `.tab` | Botón con `border-bottom: 2px solid transparent`, color secondary, font-medium. |
| `.tab.active` | `border-bottom: 2px solid var(--brand)` + color `--brand`. |
| `.tab-count` | Pill con bg `--surface-secondary`, color secondary. Activo → `--brand-subtle` + `--brand`. |
| `.tab-count.{semantic}` (StatusTabs) | Cuando active, count usa `--{state}-light` + `--{state}-strong`. |

---

## 2. Variantes

### Tabs (navegación)

```html
<div class="tabs" role="tablist">
  <button class="tab active" role="tab">Resumen</button>
  <button class="tab" role="tab">Servicios <span class="tab-count">5</span></button>
  <button class="tab" role="tab">Notas <span class="tab-count">3</span></button>
</div>
```

### StatusTabs (filtros con count semántico)

```html
<div class="tabs" role="tablist">
  <button class="tab active" role="tab">Todas <span class="tab-count">142</span></button>
  <button class="tab" role="tab">Pendientes <span class="tab-count warning">5</span></button>
  <button class="tab" role="tab">Pagadas <span class="tab-count success">130</span></button>
  <button class="tab" role="tab">Vencidas <span class="tab-count danger">7</span></button>
</div>
```

---

## 3. Estados

| Estado | Comportamiento |
|---|---|
| **default** | color secondary, sin border. |
| **hover** | color primary (border sigue transparente). |
| **focus-visible** | `--focus-ring`. |
| **active** | color brand, border-bottom brand, count en variante. |

---

## 4. Tokens

```
Layout    --space-1/2/3/4 · --radius-full · --radius-xs
Tipografía --font-size-xs/sm · --font-weight-medium · --font-feature-numeric
Color     --brand · --brand-subtle · --border
          --surface-secondary · --text-primary/secondary/tertiary
          --{state}-light/-strong para StatusTabs
Estado    --focus-ring
Motion    --transition-fast · --ease-out
```

---

## 5. Validación con documento de marca

- **Riguroso y consecuente** (rasgo 2): mismo patrón visual en cada página de detalle. El usuario no se reorienta cada vez.
- **Voz**: labels en castellano corto, sustantivos: "Resumen", "Servicios", "Facturas", "Notas". NO "Tab1/Tab2", NO "Información general".

### Ejemplos producto

| Página | Tabs |
|---|---|
| `/admin/clients/[id]` | Resumen · Servicios · Facturación · Notas · Soporte |
| `/dashboard/services/[id]` | Resumen · Detalles · Logs |
| `/admin/products/[id]/edit` | General · Pricing · Drivers · Soporte |
| `/admin/tasks/[id]` | Detalle · Notas internas · Historial |

### Ejemplos producto · StatusTabs

| Listado | Tabs |
|---|---|
| `/admin/billing` | Todas (142) · Pendientes (5) warning · Pagadas (130) success · Vencidas (7) danger |
| `/admin/clients` | Todos (147) · Activos (139) success · Suspendidos (5) warning · Cancelados (3) |
| `/admin/support` | Todos · Abiertos (12) warning · Sin asignar (3) danger · Cerrados |
| `/dashboard/billing` (cliente) | Todas · Pendientes · Pagadas |

---

## 6. Reglas de uso

- **Máximo 5–6 tabs por fila**. Si necesitas más, replantear (sub-página, dropdown).
- **Tab activo único** — siempre uno seleccionado.
- **Count en StatusTabs solo cuando aporta valor**. "Todas" siempre lleva count; el resto solo si es relevante.
- **No mezclar Tabs y StatusTabs en la misma página** — el primero indica navegación, el segundo filtro.
- **Tabs scrollable horizontal** cuando no caben en mobile (deuda — implementación).
- **Border-bottom brand siempre** en activo (NO usar accent-stripe vertical, ese es para sidebar).

---

## 7. Accesibilidad

- `role="tablist"` en wrapper, `role="tab"` en cada botón.
- `aria-selected="true"` en activo.
- **Keyboard nav**: Arrow Left/Right entre tabs, Home/End para primero/último, Enter/Space activa. **Falta hoy** (D2D-7) — añadir en implementación.
- Focus ring visible.

---

## 8. Drift vs implementación actual

| ID | Drift | Resolución |
|---|---|---|
| **D2D-6** | Patrón border-bottom vs accent-stripe | Mantener border-bottom (horizontal). |
| **D2D-7** | Sin keyboard nav | Añadir Arrow keys, Home/End. |
| D2D-8 | Sin easing token | Migrar a `--ease-out`. |
| Tab count tabular nums | No aplicado | Añadir `--font-feature-numeric`. |
