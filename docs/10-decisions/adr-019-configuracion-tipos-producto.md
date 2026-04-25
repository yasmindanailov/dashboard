# ADR-019 — Configuración por tipo de producto (bloques estructurados)

> **Status:** Active
> **Date:** 2026-04 (origen) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §27
> **Domain:** products

---

## Contexto

Con catálogo dinámico (ADR-018), cada tipo de producto necesita configuración distinta:

- **Hosting web:** plan Enhance CP, recursos asignables.
- **Docker service:** plantilla `.yaml`, puertos, volúmenes, recursos.
- **Domain:** TLD soportados, registrar.
- **Support Inside:** canales, SLA, slots.
- **Manual:** configuración mínima, genera tarea al agente.

Si la UI de creación de producto fuera **un único formulario gigante con todos los campos posibles**, sería confuso y lleno de "no aplica si tipo X".

Si fuera **un formulario por tipo, totalmente distinto**, se pierden patrones comunes (precio, ciclos, audit events).

Hace falta una **estructura común** + **bloques específicos por tipo**.

---

## Opciones consideradas

1. **Schema único con muchos campos opcionales nullable.**
   - Pros: simple a nivel BD.
   - Contras: el modelo se llena de campos que aplican solo a algunos tipos. UI difícil de mantener.

2. **Tabla por tipo de producto.**
   - Pros: cada tipo con sus campos exactos.
   - Contras: cada tipo nuevo = nueva tabla + migración. Joins complejos para listar el catálogo.

3. **(Elegida)** **Bloques comunes en la tabla `products` + bloques específicos en JSONB** (`resource_config`, `audit_event_types`, etc.).
   - Pros: balance. Bloques comunes son consultables/indexables. Bloques específicos son flexibles sin migrations.
   - Contras: el JSONB no se valida a nivel BD. Validación recae en DTOs (class-validator).

---

## Decisión

### Bloques comunes a todos los productos

Vivien en columnas tipadas de la tabla `products`:

**Bloque IDENTIDAD**
- `name`, `description`, `category_id` / `subcategory_id`, `slug`, `image_url`, `badge`, `order`, `is_active`.

**Bloque PRICING**
- `price` base + tabla relacionada `product_pricing` con un row por ciclo (mensual, anual, etc.) con descuentos.

**Bloque REGLAS DE NEGOCIO**
- `requires_existing_product`, `is_addon`, `is_global_addon`.
- `grace_period_days` (período de gracia antes del primer cobro).
- `suspension_days_after_due` (días tras vencimiento para suspender).
- `cancellation_days_after_suspension`.
- `data_retention_days_after_cancel`.
- `client_can_pause` (boolean).

**Bloque EXTRAS**
- Tabla relacionada `product_extras` (ADR-020).

**Bloque CHECKLIST DE MANTENIMIENTO** (cuando aplica — productos con `support_inside` slots)
- Tabla relacionada `product_checklist_items`. Items que heredan los slots de mantenimiento del producto.

**Bloque AUDIT LOG DEL SERVICIO**
- Campo JSONB `audit_event_types` que define los tipos de evento que el producto genera + sus campos esperados. Ver ADR-017.

### Bloques específicos por tipo

Vivienn en JSONB `resource_config` o columnas específicas según tipo:

| Tipo | Configuración específica |
|------|--------------------------|
| `hosting_web` | Plan Enhance, recursos por plan |
| `docker_service` | Plantilla `.yaml`, puertos expuestos, volúmenes, recursos |
| `domain` | TLDs soportados, registrar config |
| `support_inside` | Canales (webchat, email, WhatsApp, teléfono), SLA en minutos, agente real de primeras (bool), acceso al producto del cliente (bool), mantenimiento proactivo disponible (bool) |
| `support_addon` (slot) | Tipo de slot (mantenimiento / mantenimiento+gestión), incluidos gratis (N), precio adicional |
| `manual_service` | Plantilla de tarea generada al pagar, tiempo estimado, descripción visible al cliente, nota cliente opcional/obligatoria |

### Bloque provisioner — pendiente por plugin

El bloque de configuración del provisioner se define **al trabajar el plugin correspondiente** (ADR-021). No se generaliza entre plugins. Cada plugin documenta sus campos.

### Validación

- Backend: DTOs con class-validator validan cada tipo según su shape esperado.
- BD: estructura general en columnas, detalles en JSONB sin validación a nivel BD.

---

## Consecuencias

- ✅ **Ganamos:**
  - Bloques comunes reutilizables (precio, ciclos, audit events).
  - Bloques específicos sin requerir migration por tipo nuevo.
  - UI de creación divisible en steps por bloque.
- ⚠️ **Aceptamos:**
  - JSONB no es validado por la BD. Si un programador escribe basura en `resource_config`, la BD lo acepta. Mitigación: DTOs estrictos.
  - Listar el catálogo con filtros sobre `resource_config` requiere queries JSONB que pueden ser más lentos. Solución cuando aplique: índices GIN.
- 🚪 **Cierra:**
  - **No tabla por tipo de producto.** Mantener la flexibilidad del JSONB.
  - **No campos hardcoded** en `products` para casos edge — usar JSONB.

---

## Cuándo revisar

- Si surge un tipo de producto cuya configuración es tan distinta que no encaja en los bloques actuales: añadir bloque o evaluar tabla separada.
- Si el rendimiento de queries sobre JSONB se vuelve cuello de botella: índices GIN o promoción a columnas.

---

## Referencias

- **Módulos afectados:** products, billing (lee config para checkout).
- **ADRs relacionados:** ADR-018 (catálogo dinámico), ADR-020 (extras), ADR-021 (provisioners), ADR-017 (audit_event_types).
- **Glosario:** [Producto](../00-foundations/glossary.md), [Plan / Pricing](../00-foundations/glossary.md).
- **Implementación:** `backend/prisma/schema.prisma` modelo `Product`, DTOs en `backend/src/modules/products/dto/product.dto.ts`.
