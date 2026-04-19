# Productos — Documentación Admin

> Módulo de catálogo de productos y pricing del sistema Aelium.
> Última actualización: Sprint 5 (hardening).

## Acceso

| Rol | Acceso |
|-----|--------|
| `superadmin` | CRUD completo |
| `agent_full` | CRUD completo |
| `agent_billing` | ❌ Sin acceso |
| `agent_support` | ❌ Sin acceso |
| `client` | ❌ Sin acceso (ve productos a través del checkout) |
| `partner` | ❌ Sin acceso (ve planes con descuento a través de su dashboard) |

## Modelo de datos

### Product

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | Identificador único |
| `name` | VarChar(200) | Nombre visible |
| `slug` | VarChar(200) | URL-friendly, único |
| `type` | Enum | `hosting_web`, `domain`, `docker_service`, `support_inside`, `we_do_it`, `custom_service` |
| `provisioner` | VarChar(100) | String libre — se resolverá dinámicamente via plugins (Sprint 8). Valores conocidos: `enhance_cp`, `resellerclub`, `docker_engine`, `internal`, `manual` |
| `status` | Enum | `active`, `inactive`, `deprecated` |
| `is_addon` | Boolean | Si es un addon vinculable a otros productos. **Inmutable** — se auto-configura según el tipo al crear |
| `is_global_addon` | Boolean | Addon disponible a nivel de cuenta (no de producto). **Inmutable** |
| `requires_existing_product` | Boolean | Si requiere que el cliente tenga un servicio activo previo. **Inmutable** |
| `category_id` | UUID? | Referencia a `ProductCategory` |
| `grace_period_days` | Int | Días de gracia antes de suspensión (default: 0) |
| `suspension_days` | Int | Días hasta suspensión tras impago (default: 7) |
| `cancellation_days` | Int | Días hasta cancelación definitiva (default: 30) |
| `client_can_pause` | Boolean | El cliente puede pausar el servicio voluntariamente |
| `partner_commission_pct` | Decimal? | % comisión para partners (0–100). Aplica a todos los tipos |
| `features` | JSON? | Características del producto (pendiente UI — Sprint 8) |
| `provisioner_config` | JSON? | Configuración específica del provisioner (pendiente — Sprint 8) |
| `audit_event_types` | JSON? | Tipos de evento para el audit log del servicio |

### ProductPricing

Un producto puede tener múltiples planes de precio, uno por cada combinación `billing_cycle` + `currency`.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `billing_cycle` | Enum | `monthly`, `quarterly`, `semiannual`, `annual`, `one_time` |
| `price` | Decimal(10,2) | Precio del plan |
| `setup_fee` | Decimal(10,2) | Coste de configuración inicial (default: 0) |
| `currency` | VarChar(3) | Default `EUR` |
| `discount_percentage` | Decimal? | Descuento aplicable |

Constraint: `UNIQUE(product_id, billing_cycle, currency)`.

### ProductExtra

Extras opcionales/obligatorios vinculados a un producto.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `type` | Enum | `free_period`, `discount`, `included_product` |
| `is_mandatory` | Boolean | Si el cliente debe aceptarlo |
| `label` | VarChar(200) | Texto visible al cliente |
| `applicable_cycles` | Enum | `monthly`, `annual`, `both` |

### ProductCategory

Categorías jerárquicas con soporte de árbol (`parent_id`).

### ProductChecklistItem

Elementos de checklist para mantenimiento interno. Heredan los slots de mantenimiento de Support Inside.

## Tipos de producto

| Tipo | Descripción | Provisioner | Auto-set |
|------|-------------|-------------|----------|
| `hosting_web` | Planes de hosting web (Starter, Pro, Business) | `enhance_cp` | — |
| `domain` | Registro/transferencia de dominios | `resellerclub` | — |
| `docker_service` | Contenedores Docker (Nextcloud, OpenClaw, etc.) | `docker_engine` | — |
| `support_inside` | Support Inside — addon global de cuenta (Básico, Medium, Pro). Ref: DECISIONS.md §7 | `internal` | `is_addon=true`, `is_global_addon=true`, `requires_existing_product=true` |
| `we_do_it` | We Do It For You — addon por producto. Solo aplica a `hosting_web` y `docker_service`. Ref: DECISIONS.md §8 | `manual` | `is_addon=true`, `requires_existing_product=true` |
| `custom_service` | Proyectos manuales a escala (ERP, CRM). El agente recibe tarea al activarse | `manual` | — |

> **Nota:** `support_addon` y `support_service` fueron unificados en `support_inside` durante el hardening de Sprint 5. Support Inside es siempre un addon global de cuenta — no existen dos variantes separadas.

## Decisiones de negocio

1. **`hosting_agency` eliminado** — Los partners son agencias que venden los mismos planes `hosting_web` con descuento (definido en `partner_commission_pct`).
2. **`we_do_it` es un addon** — Se vincula a productos de tipo `hosting_web` y `docker_service`. NO aplica a `support_inside` ni `custom_service`. Validación pendiente en Sprint 8 (EC-5.4).
3. **`custom_service` es manual** — Se crea caso a caso para proyectos que engloban múltiples servicios.
4. **Tipo inmutable** — El `type` de un producto no se puede cambiar después de la creación. Esto protege la integridad de `is_addon`, `is_global_addon` y `requires_existing_product` que se auto-configuran según el tipo.
5. **Provisioner flexible** — El campo `provisioner` es un string libre (no enum) para soportar el sistema de plugins dinámicos planificado en Sprint 8. Los valores actuales son convenciones, no restricciones.

## Endpoints API

```
GET    /products               — Listado paginado (status, type, search)
GET    /products/:id           — Detalle completo
POST   /products               — Crear producto (con pricing, extras, checklist nested)
PATCH  /products/:id           — Actualizar producto (type, is_addon, is_global_addon, requires_existing_product excluidos)
PATCH  /products/:id/status    — Toggle activo/inactivo
DELETE /products/:id           — Eliminar (solo si sin servicios)

POST   /products/:id/pricing   — Añadir plan de precio
PATCH  /products/pricing/:id   — Actualizar precio
DELETE /products/pricing/:id   — Eliminar precio (no el último de un producto activo)

GET    /products/categories/all — Listar categorías
POST   /products/categories     — Crear categoría
PATCH  /products/categories/:id — Actualizar categoría
DELETE /products/categories/:id — Eliminar categoría
```

## UI — Flujo de trabajo

### Crear producto (`/dashboard/products/new`)

**Paso 1 — Selección de tipo:**
El formulario presenta cards visuales con los 6 tipos de producto. Cada card muestra nombre, icono, descripción y badge "Addon" si aplica. Al seleccionar un tipo, se configura automáticamente:
- El provisioner por defecto del tipo
- Los flags `is_addon`, `is_global_addon`, `requires_existing_product`
- Las secciones visibles del formulario

**Paso 2 — Formulario adaptado:**
| Sección | Productos | Addons |
|---------|-----------|--------|
| Identidad (nombre, slug, badge, comisión partner) | ✅ | ✅ |
| Descripción | ✅ | ✅ |
| Pricing (ciclos + setup fee) | ✅ | ✅ |
| Provisioning (campo provisioner) | ✅ | ❌ (auto-set) |
| Ciclo de vida (gracia, suspensión, cancelación, pausar) | ✅ | ❌ |

### Catálogo (`/dashboard/products`)

Tabla paginada con:
- Filtros: búsqueda por nombre/slug, filtro por estado, filtro por tipo
- Columnas: nombre + badge + addon indicator, tipo, precio (mensual o primer plan), servicios activos, estado
- Acciones: toggle status, enlace a detalle

### Detalle (`/dashboard/products/:id`)

Vista de lectura con:
- Header: nombre, estado, badge addon, botones Editar / Activar-Desactivar / Eliminar
- Cards: detalles, pricing, extras, configuración (lifecycle), metadatos, checklist

### Editar (`/dashboard/products/:id/edit`)

Formulario con los mismos campos que el de creación, adaptado al tipo del producto (que es de solo lectura). La gestión de pricing se hace inline: lista de planes existentes con opción de eliminar + formulario para añadir nuevo plan.

## Validaciones y edge cases resueltos

| EC | Descripción | Protección |
|----|-------------|------------|
| EC-1 | Slug duplicado en edición | `ConflictException` con mensaje claro (no auto-increment silencioso) |
| EC-2 | Cambio de tipo post-creación | `type` excluido de `UpdateProductDto` |
| EC-3 | Eliminar último pricing de producto activo | `BadRequestException` — producto activo necesita al menos 1 plan |
| EC-4 | Modificar flags de addon via API | `is_addon`, `is_global_addon`, `requires_existing_product` excluidos de `UpdateProductDto` |
| EC-5 | Pricing duplicado por ciclo | `ConflictException` antes de insertar duplicado `(billing_cycle, currency)` |
| EC-6 | Comisión partner fuera de rango | `@Min(0) @Max(100)` en ambos DTOs |

## Pendiente para sprints futuros

- **Sprint 8:** Conexión del campo `provisioner` con el registro dinámico de plugins
- **Sprint 8:** UI para el campo `features` (JSON) — necesario para mostrar features en checkout
- **Sprint 8:** Vinculación addon↔producto (qué addons están disponibles para qué productos)
- **Sprint 8:** Configuración específica de Support Inside (canales, SLA, slots)
- **Sprint 8:** Plantillas .yaml para Docker services
