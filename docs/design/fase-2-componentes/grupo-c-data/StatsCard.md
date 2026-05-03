# StatsCard — Spec

> Estado: **listo**
> Fuente: `frontend/app/components/ui/StatsCard/StatsCard.{tsx,module.css}`
> Maqueta: `docs/design/mockup/components/stats-card.html`

---

## 1. Anatomía

```
┌─────────────────────────────┐
│ Ingresos                [€] │  ← label + icon
│                             │
│ 12.450 €                    │  ← value (display-sm 40px, tabular nums)
│ ↑ 12% vs. mes anterior      │  ← trend
└─────────────────────────────┘
```

| Parte | Token / detalle |
|---|---|
| `stats-card` | Card con `--surface-primary` + border + radius-md. Hover sube `--shadow-sm`. |
| `stats-card-label` | font-sm, weight-medium, color secondary. |
| `stats-card-icon` | 36×36, radius-sm, default `--brand-subtle` bg + `--brand` color. Variantes per type. |
| `stats-card-value` | **`--font-size-3xl` (40px display-sm)** en métricas primarias. **Tabular nums obligatorio.** Tracking -0.02em. |
| `stats-card-trend` | font-xs, weight-medium. ↑ success-strong, ↓ danger-strong. |
| `stats-card-subtext` | font-xs, color tertiary, contexto del trend. |

## 2. Variantes

### Por tamaño

| Variante | Value size | Uso |
|---|---|---|
| **default** | `--font-size-3xl` (40px) | Métricas primarias del dashboard. Overview. |
| **compact** | `--font-size-xl` (24px) | Métricas secundarias, listados densos, sidebar. |

### Por accent border-left (semántico · D2C-3)

| Accent | Color | Uso |
|---|---|---|
| _(none)_ | sin border extra | Métrica neutra. |
| `accent-brand` | `--brand` | Métrica destacada. |
| `accent-success` | `--success` | Métrica positiva (ingresos crecen, churn baja). |
| `accent-warning` | `--warning` | Atención (próxima vencimiento, vence pronto). |
| `accent-danger` | `--danger` | Crítica (caídas, vencidas, urgencias). |
| `accent-pending` | `--pending` | En revisión, pendiente acción. |

### Por icon-color

Mismo set: `icon-success/warning/danger/pending` — fondos `-light` y color `-strong` correspondientes.

## 3. Estados

| Estado | Comportamiento |
|---|---|
| **default** | Card visible. |
| **hover** (si navegable) | border-hover + shadow-sm. Aplicar `.card-action` si tiene onClick. |
| **loading** | Reemplazar value por skeleton de altura `--font-size-3xl`. |

## 4. Tokens consumidos

```
Layout    --space-1/2/5 · --radius-md · --radius-sm
Tipografía --font-size-xs/sm/xl/3xl · --font-weight-medium/semibold
          --font-feature-numeric · --line-height-tight
Color     --surface-primary · --border · --border-hover
          --brand · --brand-subtle
          --{state} y --{state}-light/-strong (semánticos)
          --text-primary/secondary/tertiary
Sombras   --shadow-sm
Motion    --transition-fast · --ease-out
```

## 5. Voz de marca aplicada

- **Label corto y concreto.** "Ingresos", "Clientes activos", "Tickets abiertos". No "Total de ingresos del mes" (verboso).
- **Subtext con contexto humano**: "vs. mes anterior", "esta semana", "últimos 30 días".
- **Trend con explicación cuando importa**: "+12% vs. mes anterior" mejor que solo "+12%".

### Ejemplos producto

| KPI | Label | Value | Subtext | Accent |
|---|---|---|---|---|
| Ingresos del mes | "Ingresos" | "12.450 €" | "vs. mes anterior" | success (si crece) |
| MRR | "MRR" | "8.230 €" | "+5% este mes" | success |
| Churn | "Churn" | "1,8%" | "vs. 2,3% trimestre anterior" | success (si baja) |
| Clientes activos | "Clientes activos" | "147" | "este mes" | brand |
| Tickets abiertos | "Tickets abiertos" | "12" | "3 sin asignar" | warning (si > umbral) |
| Pagos pendientes | "Pagos pendientes" | "4 · 1.230 €" | "más antiguo: 12 días" | danger |
| Próximas renovaciones | "Renuevan en 30 días" | "23" | "8 sin contacto previo" | pending |
| Cliente · Uptime | "Uptime mes" | "99,98%" | "4 min caído" | success |

## 6. Reglas de uso

- **Display-sm 40px** para métricas que el ojo debe captar de un vistazo (Overview).
- **Compact 24px** cuando aparecen muchas en grid denso o aside.
- **Mismo grid de StatsCards** en una pantalla = mismo tamaño. No mezclar default y compact en la misma fila.
- **Trend solo si tiene sentido**. Comparar % "vs mes anterior" implica que la métrica es comparable temporalmente. "Clientes activos" sí; "Plan actual" no.
- **Accent border-left** úsalo con criterio. Si todas las cards tienen accent, ninguna destaca.
- **Icon coloreado** (success/warning/etc) solo cuando el tipo de métrica lo justifica. Default brand-subtle.

## 7. Accesibilidad

- Si la card es navegable, usar `<button>` o `<a>` con `aria-label` descriptivo ("Ver detalle de ingresos del mes").
- Trend debería tener texto adicional para lectores de pantalla: `<span class="sr-only">aumento del</span> 12%`.

## 8. Drift vs implementación actual

| ID | Drift | Resolución |
|---|---|---|
| **D2C-2** | Value 24px pequeño | Default `--font-size-3xl` (40px). Variante compact mantiene 24px. |
| **D2C-3** | accentColor sin semántica | Variantes nombradas (brand/success/warning/danger/pending). |
| **D2C-K** | Trend icon hardcoded 12px | Documentar excepción (es un micro-icono inline). |
| Tabular nums | No aplicado al value | Aplicar `--font-feature-numeric` siempre. |

## 9. Materialización

`mockup/components/stats-card.html`
