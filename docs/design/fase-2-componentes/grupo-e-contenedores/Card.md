# Card · sistema de 5 variantes (DD-029)

> Estado: **listo**
> Fuente: `frontend/app/components/ui/Card/Card.{tsx,module.css}`
> Maqueta: `mockup/components/card.html`

---

## 1. Filosofía

Card es el contenedor más usado del producto (30+ contextos). DD-029
exige variantes nativas, no una sola forma genérica que se "adapta como
sea". 5 variantes cubren los casos reales:

| Variante | Caso de uso |
|---|---|
| `static` (default) | Información sin interacción. Detalle de cliente, factura preview, sección informativa. |
| `action` (DD-023 formalizada) | Card que lleva a detalle. Hover brand-tinted, focus-ring, navegable. |
| `selectable` | Plan selector, multi-select visual. Checkbox interno, selected con bg brand-subtle. |
| `featured` | Plan destacado ("Más popular"), recomendado. Border 2px brand + tag pill brand (DD-030 · sin marker rombo en la tag). |
| `mesh` | Hero del cliente, Overview destacado. `--mesh-opacity-product` aplicado. |

## 2. Anatomía

```html
<div class="card-base [variante]">
  contenido libre
</div>
```

Padding modificadores: `pad-none / pad-sm / pad-md / pad-lg`. Default = sm.

| Token | Uso |
|---|---|
| `--surface-primary` | Background base. |
| `--border` / `--border-hover` | Border default / hover (no action). |
| `--brand` / `--brand-subtle` | Border + bg en estados action/selected/featured. |
| `--radius-md` | Radius universal (excepción: featured con borde 2px puede sentir radius-lg). |
| `--shadow-xs` | Hover de action (sutil). |

## 3. Variantes en detalle

### 3.1 Static

Sin transición, sin hover, sin focus. Información pura.

### 3.2 Action

Hereda DD-023. Hover: border `--brand` + bg `--brand-subtle` + `--shadow-xs`. Focus-visible: `--focus-ring` doble. Cursor pointer.

**Cuándo**: cards en listings que llevan a detalle (factura preview, servicio, ticket).

### 3.3 Selectable

Estado `.selected` con bg `--brand-subtle` + check-circle brand top-right. Click toggle. Focus-ring doble.

**Cuándo**: plan selector cliente, multi-select visual, opciones excluyentes con vista de tarjeta.

### 3.4 Featured

`border: 2px solid var(--brand)`. Tag flotante en top-center: pill `--brand` con texto blanco ("Más popular", "Recomendado", "Premium"). **Sin marker rombo** (DD-030) — la pill brand + texto blanco ya destaca por sí misma.

**Cuándo**: pricing pages, destacar una opción dentro de un grid de planes, plan recomendado.

### 3.5 Mesh

`--mesh-opacity-product` (0.04) o `mesh-strong` (0.08) si hero. Mesh con tres radial gradients: brand + accent-secondary + brand-active. Imperceptible aislado, reconocible al lado de otras cards.

**Cuándo**: hero de cliente Overview, card destacada del estado del negocio digital, empty states grandes (cuando llevan voz Aelium fuerte).

## 4. Estados (transversales)

- **default** / **hover** (per variante) / **focus-visible** (action+selectable) / **disabled** (`.disabled` opacity 0.5) / **loading** (`.loading-v` skeleton interno).

## 5. Voz de marca aplicada

Card es contenedor — el copy lo proporciona el contenido. **Sí aplica**:
- Featured tag: "Más popular", "Recomendado", "Premium". Una palabra o frase corta. NO "Best value!" anglicismo.
- Selectable cards en plan selector: misma estructura que `Web Inicio · El que empieza` (mantener subtítulo descriptivo).

## 6. Reglas de uso

- **Card nunca usa sombra por defecto** (regla DD-021). Solo en hover de action.
- **Mesh solo en superficies destacadas** — no en cards de listings (sería ruido).
- **Featured solo si hay opción real** que destacar. No featured en listings genéricos.
- **Selectable + Action son excluyentes**: una card es seleccionable O es navegable, no las dos.

## 7. Accesibilidad

- Action: `role="button"` o `<a>`. Tabbable. Enter/Space activa.
- Selectable: `role="checkbox"` + `aria-checked`. Space toggle.
- Featured: tag con `aria-label="Plan más popular"`.
- Disabled: `aria-disabled="true"`.

## 8. Drift vs implementación actual

| ID | Drift | Resolución |
|---|---|---|
| **D2E-Card-act** | `interactive` no usa `--brand-subtle` bg | Alinear con DD-023 (border + bg brand-subtle + shadow-xs). |
| **D2E-Card-var** | Solo 2 variantes | Añadir selectable, featured, mesh. |
| Sin disabled | No existe | Añadir `.disabled`. |
| Sin loading | No existe | Añadir `.loading-v` con skeleton interno. |
