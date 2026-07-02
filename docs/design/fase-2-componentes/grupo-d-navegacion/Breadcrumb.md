# Breadcrumb — Spec

> Estado: **listo**
> Fuente: `frontend/app/components/ui/Breadcrumb/Breadcrumb.{tsx,module.css}`
> Maqueta: `mockup/components/breadcrumb.html`

---

## 1. Anatomía

```
Admin  ›  Clientes  ›  Floristería Pérez  ›  Notas
─────                                          ────
link                                           current (semibold)
       ────
       chevron separator (--text-tertiary 0.5)
```

| Parte | Token / detalle |
|---|---|
| `.breadcrumb` | Flex align-center gap `--space-1_5`. |
| Link items | `<a>` con color `--text-secondary` (corregido desde `--text-tertiary`), font-medium, hover brand. |
| Separator | SVG chevron 14×14, `--text-tertiary` con `opacity: 0.5`. |
| Current | `--text-primary` font-semibold, ellipsis si excede 320px. |

---

## 2. Estados

| Estado | Comportamiento |
|---|---|
| **link default** | color secondary, weight medium. |
| **link hover** | color brand. |
| **link focus-visible** | `--focus-ring` + radius xs. |
| **current** | color primary, weight semibold, no clickable. |
| **truncated** | Ellipsis con max-width 320px (current y links largos). |

---

## 3. Tokens

```
Layout    --space-1_5 · --radius-xs
Tipografía --font-size-sm · --font-weight-medium/semibold
Color     --text-primary/secondary/tertiary · --brand
Estado    --focus-ring
Motion    --transition-fast · --ease-out
Iconografía --icon-size-sm (chevron 14px)
```

---

## 4. Validación con documento de marca

- **Experto que empodera**: el usuario sabe siempre dónde está y cómo volver. La marca facilita orientación.
- **Trato individualizado**: usar nombres reales (`Floristería Pérez`, `INV-00042`), no IDs técnicos.
- **Voz**: niveles en castellano corto. "Admin > Clientes > Floristería Pérez > Notas".

### Ejemplos producto

| Página | Breadcrumb |
|---|---|
| `/admin/clients/123/notes` | Admin › Clientes › **Floristería Pérez** › Notas |
| `/admin/billing/INV-00042` | Admin › Facturación › **INV-00042** |
| `/admin/products/web-pro/edit` | Admin › Productos › Web Pro › **Editar** |
| `/dashboard/services/hosting-01` | Mis servicios › **hosting-pro-01.aelium.es** |
| `/dashboard/billing/INV-2026-04` | Mis facturas › **abril 2026** |

---

## 5. Reglas de uso

- **Aparece en páginas de profundidad ≥ 2 desde el sidebar root**. Páginas top-level (Overview, Listings) NO necesitan breadcrumb.
- **Truncado en items intermedios** cuando el nombre es muy largo. El current se trunca a 320px.
- **Nombre real del recurso**, no slug ni ID. "Floristería Pérez" ✓, "client_42_xyz" ✗.
- **Sin "Inicio"** redundante — el logo del sidebar ya lleva al overview.
- **Sin breadcrumb en listings** (`/admin/clients`) — la navegación lateral lo sustituye.

---

## 6. Accesibilidad

- `<nav aria-label="Ruta de navegación">` (más natural que "Breadcrumb").
- Separator con `aria-hidden="true"`.
- Current con `aria-current="page"`.

---

## 7. Drift vs implementación actual

| ID | Drift | Resolución |
|---|---|---|
| **D2D-12** | Link color tertiary muy claro | Subir a secondary para legibilidad. |
| Icon size hardcoded | 14×14 inline | Migrar a `--icon-size-sm`. |
| aria-label "Breadcrumb" | Inglés | "Ruta de navegación" español. |
| Link transición sin easing | sin token | Migrar a `--ease-out`. |
