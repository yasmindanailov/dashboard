# ADR-020 — Categorías y sistema de extras de producto

> **Status:** Active
> **Date:** 2026-04 (origen) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §19
> **Domain:** products

---

## Contexto

Catálogo dinámico (ADR-018) con docenas de productos potenciales necesita organización para:

1. **Navegabilidad para el cliente:** que el cliente encuentre el producto que quiere sin scroll infinito.
2. **Gestión para el admin:** que el superadmin organice el catálogo a su gusto sin código.
3. **Upsell/crossell en el momento de compra:** ofrecer extras vinculados al producto que el cliente está viendo.

Decisiones que cubre este ADR: estructura de **categorías** + sistema de **extras** vinculados a productos.

---

## Opciones consideradas

### Categorías
1. **Categorías fijas hardcoded** (Hosting / Dominios / Otros).
   - Pros: simple.
   - Contras: cualquier reorganización = redeploy.

2. **(Elegida)** **Categorías y subcategorías libres** creadas por el superadmin desde el dashboard.

### Extras
1. **Extras como productos separados** que el cliente compra aparte.
   - Pros: simple modelo.
   - Contras: pierde el vínculo "este extra solo aplica a este producto" + UX peor (cliente tiene que buscarlo).

2. **(Elegida)** **Extras como entidad vinculada al producto**, definidos al crearlo, mostrados en el momento de compra.

---

## Decisión

### Categorías

- **Tabla** `product_categories` con `parent_id` para jerarquía (categoría / subcategoría).
- **Creación libre por el superadmin** desde dashboard.
- **Asignación de productos a categorías es opcional.** Un producto puede no tener categoría.
- **Orden configurable** dentro de cada categoría (campo `order` en `products`) y entre categorías (campo `order` en `product_categories`).
- Cuando hay landing pública, las categorías estructuran la navegación pública del catálogo.

### Sistema de extras

**Tabla** `product_extras` vinculada a `products` (FK). Cada producto puede tener N extras.

Tipos de extra:

1. **Obligatorio** (`type: 'mandatory'`): siempre incluido. Ejemplo: dominio gratis con hosting anual.
2. **Opcional** (`type: 'optional'`): el cliente acepta o rechaza con checkbox en el checkout.

Configuración por extra:

| Campo | Descripción |
|-------|-------------|
| `name` | Nombre visible al cliente |
| `description` | Texto explicativo |
| `extra_type` | `mandatory` / `optional` |
| `pricing_strategy` | `free` (gratis), `discount_on_other_product` (descuento en otro), `fixed_price` (precio adicional fijo) |
| `linked_product_id` | Si el extra es "X gratis con este producto" — el producto X aplicado |
| `discount_percentage` | Si pricing_strategy = discount |
| `fixed_price` | Si pricing_strategy = fixed_price |
| `duration_months` | Duración de la gratuidad / descuento (`null` = permanente) |
| `condition_billing_cycle` | Solo se aplica con cierto ciclo (ej: `annual`) o `null` (siempre) |
| `max_value_eur` | Valor máximo del extra (para limitar el coste de "dominio gratis") |
| `eligible_tlds_or_skus` | Lista de TLDs / SKUs aceptables (para "dominio gratis", limitar a `.com`, `.es`, etc.) |

### Caso paradigmático: dominio gratis primer año con hosting anual

Configuración del extra:
```
name: "Dominio gratis primer año"
extra_type: optional (cliente decide si activar)
pricing_strategy: free
linked_product_id: <ID del producto domain>
duration_months: 12
condition_billing_cycle: annual
max_value_eur: 15
eligible_tlds_or_skus: [".com", ".es", ".net"]
```

A partir del año 2 → el dominio se renueva al precio normal. **Sin letra pequeña.** El cliente lo sabe desde el primer momento.

### Activación

- **Al contratar** el producto principal: extras `mandatory` se aplican automáticamente, `optional` se ofrecen.
- **Nunca después** del checkout. Si el cliente quiere añadir un extra fuera del flow de compra inicial, contrata el producto vinculado normalmente.

---

## Consecuencias

- ✅ **Ganamos:**
  - El admin organiza catálogo libremente.
  - Upsell/crossell estructurados en el flow de compra.
  - "Dominio gratis con hosting anual" es configurable, no hardcoded.
- ⚠️ **Aceptamos:**
  - El sistema de extras requiere lógica de aplicación en checkout.
  - Limitaciones: extras no se aplican fuera del checkout inicial. Si el cliente "olvida" pedir el dominio gratis, no puede activarlo después al precio cero. Decisión consciente para evitar abuso.
- 🚪 **Cierra:**
  - **No "cupones de extras" intercambiables después.** Si quieres dominio gratis, lo eliges en el checkout del hosting anual.
  - **No upsell agresivo.** Una sola sugerencia opcional por producto en checkout (ADR-023 limita esto).

---

## Cuándo revisar

- Si surge necesidad de "extras post-compra" recurrentes (ej: "añade backup mensual a tu hosting"): considerar nuevo flow de "modificar contratación".
- Si el sistema de extras se vuelve confuso para clientes (métricas de abandono en checkout): simplificar.

---

## Referencias

- **Módulos afectados:** products, billing (aplica extras en checkout).
- **ADRs relacionados:** ADR-018 (catálogo dinámico), ADR-019 (configuración tipos), ADR-023 (promociones — distintas de extras), ADR-032 (flujo de compra).
- **Glosario:** [Producto](../00-foundations/glossary.md).
- **Implementación:** Prisma models `ProductCategory`, `ProductExtra`, `Product.category_id`, `BillingCheckoutService`.
