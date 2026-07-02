# Dropdown — Spec

> Estado: **listo**
> Fuente actual: `frontend/app/components/ui/Dropdown/Dropdown.{tsx,module.css}`
> Maqueta: `docs/design/mockup/components/dropdown.html`

---

## 1. Anatomía

```
[ trigger ]   ← botón visible: ⋯ icon-only por defecto, o trigger custom
              ↓ click / enter / space
┌──────────────────────┐
│  ✓  Editar           │  ← items
│  ⊞  Duplicar         │
│  ─────────           │  ← divider
│  ✕  Eliminar         │  ← danger variant
└──────────────────────┘
```

| Parte | Token / detalle |
|---|---|
| `dropdown` | Wrapper relative. |
| `dropdown-trigger` | Botón visible. Variantes: `icon-only` (32×32, ⋯), `with-text`, `custom`. |
| `dropdown-menu` | Posición absolute, `--shadow-md`, `--radius-md`, `--z-dropdown`. Animación `--motion-stack-in`. |
| `dropdown-item` | Botón fila. Hover `--surface-secondary`. Variantes: default, danger, disabled. |
| `dropdown-divider` | Línea `1px --border` con margin vertical. |
| Item icon | Opcional. `--text-tertiary` por defecto, `--danger` en danger. |

---

## 2. Variantes del trigger

| Variante | Uso |
|---|---|
| **icon-only (⋯)** | Default. Junto a una row de tabla, en una card. |
| **with-text** | "Acciones ▾" en headers de página o toolbars. |
| **custom** | Profile menu en topbar (avatar + nombre + ▾). |

## 3. Variantes del item

| Variante | Apariencia |
|---|---|
| `default` | `--text-primary`. Hover `--surface-secondary`. |
| `danger` | `--danger`. Hover bg `--danger-light`. |
| `disabled` | `opacity: 0.5`, sin hover, sin click. |
| `with-icon` | Icono prefijo en `--text-tertiary` (default) o `--danger` (danger). |
| `with-shortcut` | Atajo a la derecha del label en `--text-tertiary` `--font-mono`. |
| `divider` | Separador. No interactivo. |

---

## 4. Estados

| Estado | Comportamiento |
|---|---|
| **trigger default** | Como botón ghost (icon-only) o secondary (with-text). |
| **trigger hover** | Background `--surface-secondary`. |
| **trigger focus-visible** | `--focus-ring`. |
| **menu cerrado** | DOM no renderizado. |
| **menu abierto** | `--motion-stack-in` (180ms ease-out). Click outside o `Esc` cierra con `--motion-stack-out`. |
| **item hover** | Background `--surface-secondary`. |
| **item focus** | Idem hover + `box-shadow: inset 0 0 0 2px --brand` para diferenciar de hover. |
| **item disabled** | Opacity 0.5, click no funciona. |

---

## 5. Tokens consumidos

```
Layout       --space-1/2/3 · --radius-sm · --radius-md · --radius-xs
             --z-dropdown
Tipografía   --font-size-sm · --font-mono (shortcuts)
Color        --surface-primary/secondary
             --text-primary/secondary/tertiary
             --border · --brand · --danger · --danger-light
Estado       --focus-ring
Sombras      --shadow-md
Motion       --motion-stack-in · --motion-stack-out (DD-017)
             --transition-fast · --ease-out
```

---

## 6. Voz de marca aplicada (DD-022)

### Reglas en items

- **Verbo concreto** (igual que en Button).
- **Trato individualizado** cuando el contexto es ambiguo
  ("Eliminar cliente" vs "Eliminar" — depende del contexto del trigger:
  si vives dentro de la fila del cliente, "Eliminar" basta).
- **Items sin object** son aceptables en menús contextuales donde el
  scope ya está claro.

### Atajos de teclado

Si un item tiene atajo, se muestra a la derecha en `--font-mono`:
- ⌘E · Editar
- ⌘D · Duplicar
- ⌫  · Eliminar

Aelium usa `⌘` en Mac y `Ctrl` en Windows según user agent — pero el
copy del documento de marca no especifica. **Decisión simple:** mostrar
ambos como `⌘/Ctrl` o detectar UA en JS. Para el spec inicial: usar `⌘`
y documentar como deuda.

### Ejemplos producto

| Trigger | Items |
|---|---|
| Row de cliente (⋯) | Editar · Añadir nota · Duplicar · ─ · Eliminar cliente |
| Row de factura (⋯) | Ver factura · Descargar PDF · Reenviar al cliente · ─ · Anular |
| Row de tarea (⋯) | Marcar como hecha · Reasignar · Aplazar 24h · ─ · Eliminar |
| Profile menu (avatar + ▾) | Mi perfil · Configuración · ─ · Cambiar de portal · ─ · Cerrar sesión |

---

## 7. Reglas de uso

- **Action máxima 5 items por menú.** Más = navegación, no acción.
- Acciones destructivas siempre al final, separadas por divider.
- Si una acción requiere confirmación, abrir Modal después del click —
  no inline en el dropdown.
- Trigger icon-only obligatorio `aria-label`.
- **No anidar dropdowns** (sin submenús). Si la jerarquía lo requiere,
  pensar en una página de detalle, no en un menú colgante.

### Anti-patrones

- ❌ Más de 5 items.
- ❌ Items sin verbo: "Información", "Detalles" (debe ser "Ver detalles").
- ❌ Mezclar acciones y navegación: si un item es "Ir a configuración",
  es un link, no una acción del dropdown.

---

## 8. Accesibilidad (D2A-7)

### Estado actual

El componente actual **carece de keyboard navigation**. La spec lo
exige.

### Spec keyboard

| Tecla en trigger | Acción |
|---|---|
| `Enter` / `Space` | Abrir menú, focus en primer item. |
| `Arrow Down` | Abrir menú, focus en primer item. |
| `Arrow Up` | Abrir menú, focus en último item. |

| Tecla en menú | Acción |
|---|---|
| `Arrow Down` | Foco al siguiente item. |
| `Arrow Up` | Foco al anterior item. |
| `Home` | Foco al primer item. |
| `End` | Foco al último item. |
| `Enter` | Ejecutar item, cerrar menú. |
| `Esc` | Cerrar menú, focus al trigger. |
| `Tab` | Cerrar menú, foco al siguiente elemento del documento. |

### ARIA

- Trigger: `aria-haspopup="menu"`, `aria-expanded="true|false"`.
- Menu: `role="menu"`.
- Items: `role="menuitem"`. Disabled: `aria-disabled="true"`.

### Click outside y Esc

Implementado con `useEffect` listener sobre `mousedown` y `keydown`.

---

## 9. Drift vs implementación actual

> Detalle en `audit-existing.md` § Componente 6.

| ID | Drift | Resolución |
|---|---|---|
| **D2A-6** | Animación `fadeIn 100ms ease` hardcoded | Migrar a `--motion-stack-in` (180ms ease-out). |
| **D2A-7** | Sin keyboard nav | Añadir según spec § 8. **Trabajo de implementación**, no diseño. |
| Trigger custom sin tamaño | OK, intencional | Mantener. |
| Sin item disabled state | Añadir si emerge caso real | Documentar como deuda. |

---

## 10. Materialización

`docs/design/mockup/components/dropdown.html`

---

## 11. Variantes adicionales · DD-029 (fase 2.F refresh)

### 11.1 Multi-select (checkboxes en items)

Para filtros multi-valor (asignar a varios agentes, etiquetar con
varios tags). Cada item con check 16×16 que se rellena brand cuando
checked. Footer con count + "Aplicar".

```html
<div class="dropdown-menu dropdown-multi" role="menu">
  <button class="dropdown-item checked" aria-checked="true">
    <span class="multi-check"></span>Yasmin · soporte
  </button>
  <button class="dropdown-item" aria-checked="false">
    <span class="multi-check"></span>Marcos · billing
  </button>
  <div class="dropdown-footer">
    <span class="selected-count">1 seleccionado</span>
    <button class="bell-link">Aplicar</button>
  </div>
</div>
```

**Cuándo**: filtrar tickets por asignado(s), etiquetar cliente con tags,
multi-select genérico.

### 11.2 Searchable / combobox

Para listas ≥ 10 items. Search input arriba filtra por substring. Empty
con voz Aelium.

```html
<div class="dropdown-menu dropdown-search">
  <div class="dropdown-search-input">
    <svg>…</svg>
    <input placeholder="Buscar cliente…" aria-label="Buscar">
  </div>
  <button class="dropdown-item">Floristería Pérez</button>
  <button class="dropdown-item">Hotel Mar Azul</button>
</div>
```

**Cuándo**: "Asignar a cliente" entre 147 · seleccionar producto del
catálogo · cualquier select que supere 10 items.

### Matriz

| Caso | Variante |
|---|---|
| Acciones contextuales en row | Action (default) |
| Filtros multi-valor | Multi-select |
| Listas largas con búsqueda | Searchable |
