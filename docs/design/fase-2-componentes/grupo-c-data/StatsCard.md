# StatsCard — Spec (DD-024)

> Estado: **listo · refactor tras iteración**
> Versión inicial sustituida tras decisión DD-024 (combinación D+B+C).
> Iteración completa documentada en `mockup/components/stats-card-iteraciones.html`.
> Maqueta: `mockup/components/stats-card.html`.

---

## 1. Anatomía canónica

```
┌─────────────────────────────────┐
│ ◇ ESTE MES                      │  ← eyebrow + marker rombo
│                                 │
│ 12.450 €                        │  ← value display-sm (40px) tabular nums
│                                 │
│ Cobraste 1.380 € más que en     │  ← closing en voz Aelium
│ abril.                          │
│                                 │
│ ─────────────────────────────── │
│ Ver detalle              →      │  ← CTA opcional (variante action)
└─────────────────────────────────┘
```

| Parte | Token / detalle |
|---|---|
| `stats-card` | Card surface-primary, border, radius-md. Padding 24/20. Min-height 180px. |
| `stats-card-eyebrow` | font-xs uppercase letter-spacing 0.08em, color brand, weight medium. **Marker rombo 8×8 girado 45°** como pseudo-element ::before. |
| `stats-card-value` | **font-3xl (40px)** default · weight semibold · letter-spacing -0.02em · line-height 1.05 · **tabular-nums lining-nums obligatorio**. |
| `stats-card-closing` | font-sm, color secondary, line-height relaxed. `<strong>` resalta el dato relevante en text-primary weight-medium. |
| `stats-card-cta` (opcional) | Margin-top auto + border-top + flex space-between. Color brand, flecha "→" anima translateX(4px) en hover. |

---

## 2. Variantes

### 2.1 Default (informativa)

`<div class="stats-card">` — eyebrow + value + closing. Sin CTA. La métrica habla por sí misma.

### 2.2 Action (navegable)

`<div class="stats-card action" tabindex="0" role="button">` — añade hover brand-tinted (`--brand-subtle` bg + `--brand` border + `--shadow-xs`), focus-ring, CTA con flecha que avanza. **Cuando la métrica lleva a una siguiente acción concreta** (ver lista filtrada, atender pendiente).

### 2.3 Health (estado de salud · DD-023)

`<div class="stats-card health" data-health="ok|warn|alert|pending">` — el marker rombo simple se reemplaza por **dual-rombo de salud** (8px × 2 con gap 3px). Estados:

| `data-health` | Rombos | Color eyebrow | Animación |
|---|---|---|---|
| `ok` | Ambos verdes | `--success-strong` | — |
| `warn` | Uno warning + uno apagado (surface-tertiary) | `--warning-strong` | — |
| `alert` | Uno danger + uno apagado, **primero pulsa** 1.4s | `--danger-strong` | pulse |
| `pending` | Uno pending + uno apagado | `--pending-strong` | — |

**Reservada a métricas con estado real**: uptime, servicios, backups, alertas. NO usar en métricas neutras (MRR, churn — usar default).

### 2.4 Compact (sidebars / dashboards densos)

`<div class="stats-card compact">` — padding 16, value en `--font-size-xl` (24px), gap reducido. Para barras laterales del cliente o donde StatsCard convive con tablas densas.

### 2.5 Large (hero del cliente)

`<div class="stats-card large">` — value en `--font-size-4xl` (56px) display-lg, min-height 220px. **Una sola por pantalla** (regla D1 — si todo es hero, nada es hero). Para el momento de bienvenida del cliente.

### Combinables

`large action`, `large health`, `compact health`, `action health` — todas válidas. La única restricción: `compact` no combina con `large`.

---

## 3. Estados

| Estado | Comportamiento |
|---|---|
| **default** | Card visible. |
| **hover (action)** | border + bg brand-subtle + shadow-xs + flecha avanza. |
| **focus-visible (action)** | `--focus-ring` + border brand. |
| **loading** | Skeleton interno con shimmer. Mantiene altura. |
| **health · alert** | Primer rombo pulsa con `stats-health-pulse` (1.4s ease-in-out infinite). |

---

## 4. Tokens consumidos

```
Layout    --space-2/3/4/5/6 · --radius-md · --radius-sm
Tipografía --font-size-xs/sm/xl/3xl/4xl
          --font-weight-medium/semibold
          --font-feature-numeric
          --line-height-relaxed
Color     --surface-primary · --surface-secondary · --surface-tertiary
          --border · --border-hover · --brand · --brand-light · --brand-subtle
          --text-primary/secondary/tertiary
          --{state} y --{state}-strong (success/warning/danger/pending)
Estado    --focus-ring
Sombras   --shadow-xs
Motion    --transition-fast · --ease-out · --ease-in-out (health pulse)
```

---

## 5. Voz de marca aplicada (DD-022 · obligatorio)

### Reglas en eyebrow

- **Contexto temporal o conceptual corto**, no etiqueta de la métrica.
  - ✓ "Este mes" / "Hoy" / "En tu cartera" / "Trimestre" / "Próximos 30 días"
  - ✗ "Ingresos" / "Métricas" / "Total"
- 1–3 palabras. Uppercase con letter-spacing.

### Reglas en value

- **Cifras con tabular-nums siempre.** Formato europeo: `12.450&nbsp;€`, `1,8%`, `4 · 1.230&nbsp;€`.
- Texto cuando aplica: `Funcionando`, `2 fallidos` — solo si comunica más que un número.

### Reglas en closing

- **Frase corta, contextual, humana.** Aelium acompaña, no informa.
- **`<strong>` envuelve el dato relevante** dentro de la frase.
- **Sin "vs. mes anterior"** genérico → mejor "1.380&nbsp;€ más que en abril" (mes con nombre).
- **Cierra con criterio cuando aplica**: "Vas mejor.", "Toca llamar.", "Échales un ojo cuando puedas."

### Reglas en CTA (action)

- Verbo concreto: "Ver lista", "Atender ahora", "Ver vencidas", "Ver detalle".
- 1–3 palabras. Coherente con voz Button (DD-022).

### Ejemplos producto

| KPI | Eyebrow | Value | Closing |
|---|---|---|---|
| Ingresos mes | "Este mes" | "12.450 €" | "Cobraste **1.380 € más** que en abril." |
| Clientes activos | "En tu cartera" | "147" | "Clientes activos. **8 nuevos** este mes." |
| Churn trimestre | "Trimestre" | "1,8%" | "Churn — **baja** desde el 2,3% del trimestre anterior." |
| MRR | "MRR" | "8.230 €" | "**+5%** este mes." |
| Renuevan 30d (action) | "Próximos 30 días" | "23" | "Renuevan. **8 sin contacto** previo — toca llamar." → "Ver lista" |
| Pagos pendientes (action) | "Pendientes" | "4 · 1.230 €" | "**12 días** el más antiguo. Conviene revisar hoy." → "Ver vencidas" |
| Tickets (action) | "Hoy" | "12" | "Tickets abiertos. **3 sin asignar.**" → "Atender ahora" |
| Uptime cliente (health ok) | rombos verdes "Tu uptime mes" | "99,98%" | "Tu web ha estado caída **4 minutos**. Te avisamos cada vez." |
| Backups (health warn) | rombos warn "Backups" | "2 fallidos" | "**marina-store** y **baresquina**. Reintentamos en 15 min." |
| Caídas (health alert) | rombos pulsando "Caídas detectadas" | "1" | "**marina-store** caído desde hace 12 min. Yasmin lo está mirando." |
| Próxima factura cliente (large action) | "Tu próxima factura" | "49,90 €" | "Vence el **15 de mayo**. La cargamos automáticamente — sin sorpresas." → "Ver detalle" |

---

## 6. Reglas de uso

- **Closing siempre con voz humana**. Si el closing es genérico ("vs. mes anterior", "this month"), no es Aelium.
- **Action solo cuando lleva a algo concreto**. La flecha promete navegación — no la pongas si no cumple.
- **Health solo con estado real** (uptime, backups, alertas). En métricas neutras usa default.
- **Mismo grid = mismo tamaño**. No mezcles default y compact en la misma fila.
- **Una `large` por pantalla** (regla D1).
- **Tabular-nums obligatorio** en cifras — evita salto visual al cambiar valores.

---

## 7. Accesibilidad

- Variante action: `tabindex="0"` + `role="button"` + handler keyboard (Enter/Space).
- `aria-label` descriptivo: "Ver vencidas — 4 facturas, 1.230 €".
- Health alert pulse respeta `prefers-reduced-motion: reduce`.
- Closing es texto narrativo accesible — lectores de pantalla lo leen entero.

---

## 8. Drift vs implementación actual

> Refactor completo respecto a la versión inicial.

| Cambio | Detalle |
|---|---|
| Estructura nueva | label + icon + value + trend + subtext **eliminados**. Reemplazados por eyebrow + value + closing + cta opcional. |
| Tipografía | Value 24px → 40px display-sm default. 56px display-lg en variante large. 24px en compact. |
| Iconografía | Icon container 36×36 con bg eliminado. Marker rombo 8×8 en eyebrow lo reemplaza. |
| Trend componente | `↑ 12% vs. mes anterior` eliminado. Incorporado al closing como frase humana. |
| Accent border-left | Eliminado. Eyebrow brand + marker hace de identificador semántico. Variante health usa dual-rombo. |
| Tabular-nums | Aplicado al value siempre (antes opcional). |
| Action variant | **Nueva**. Card navegable con CTA. |
| Health variant | **Nueva**. Dual-rombo como indicador de salud. |

**Implementación:** refactor completo del componente `StatsCard.tsx`. Props nuevas:

```ts
interface StatsCardProps {
  eyebrow: string                    // antes label
  value: string | number
  closing: ReactNode                 // antes subtext + trend
  cta?: { label: string; onClick: () => void }   // nuevo
  variant?: 'default' | 'compact' | 'large'      // antes accentColor
  health?: 'ok' | 'warn' | 'alert' | 'pending'   // nuevo
  loading?: boolean                  // nuevo
}
```

Refactor de **cada uso de StatsCard** en el código con la voz nueva — trabajo de copy + reestructuración. Documentado en NOTES.md.

---

## 9. Materialización

- `mockup/components/stats-card.html` — todas las variantes con ejemplos producto reales.
- `mockup/components/stats-card-iteraciones.html` — proceso de iteración (alt A/B/C/D + comparativa).
- `mockup/pages/admin-clientes.html` — uso en composición real (admin Overview).
