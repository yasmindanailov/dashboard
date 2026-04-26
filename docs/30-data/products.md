# Products — Schema

> **Dominio:** catálogo de productos, planes de precio, extras, checklists, plantillas Docker, configuración Support Inside.
> **Módulo:** [`docs/20-modules/products/contract.md`](../20-modules/products/contract.md).
> **Sprint origen:** Sprint 5.
> **Estado:** ⬜ tablas como stub en Prisma, expansión completa pendiente.
> **ADRs:** [018](../10-decisions/adr-018-catalogo-dinamico-productos.md) (catálogo dinámico) · [019](../10-decisions/adr-019-configuracion-tipos-producto.md) (config por tipo) · [020](../10-decisions/adr-020-categorias-extras-producto.md) (categorías + extras) · [021](../10-decisions/adr-021-provisioners.md) (provisioners) · [022](../10-decisions/adr-022-wdify-deprecado-proyectos.md) (WDIFY deprecado) · [034](../10-decisions/adr-034-support-inside-modelo.md) (Support Inside).

---

## Resumen de tablas

| Tabla | Estado | Propósito |
|-------|--------|-----------|
| `product_categories` | ⬜ | Categorías y subcategorías opcionales del catálogo |
| `products` | ⬜ | Catálogo dinámico (cero hardcoding) |
| `product_pricing` | ⬜ | Planes de precio por producto y ciclo (mensual/anual) |
| `product_extras` | ⬜ | Extras vinculados a un producto (mandatory u opcionales) |
| `product_checklist_items` | ⬜ | Checklist base de mantenimiento por producto |
| `docker_templates` | ⬜ | Plantillas `.yaml` para provisioning de productos Docker |
| `support_inside_config` | ⬜ | Configuración específica de productos Support Inside |

---

## Tabla: `product_categories` ⬜

Categorías y subcategorías del catálogo. Opcionales y configurables.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `name` | varchar(100) | NOT NULL | |
| `slug` | varchar(100) | NOT NULL, UQ | |
| `parent_id` | uuid | NULLABLE, FK → `product_categories(id)` | `null` = categoría raíz |
| `order_index` | integer | NOT NULL, DEFAULT `0` | |
| `active` | boolean | NOT NULL, DEFAULT `true` | |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_product_categories_parent` — en `parent_id`
- `idx_product_categories_slug` — UNIQUE en `slug`

---

## Tabla: `products` ⬜

Catálogo de productos. **100% dinámico.** Ningún producto hardcodeado ([ADR-018](../10-decisions/adr-018-catalogo-dinamico-productos.md)).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `category_id` | uuid | NULLABLE, FK → `product_categories(id)` | |
| `name` | varchar(200) | NOT NULL | |
| `slug` | varchar(200) | NOT NULL, UQ | |
| `description` | text | NULLABLE | |
| `short_description` | varchar(500) | NULLABLE | |
| `type` | enum | NOT NULL | `hosting_web` · `domain` · `docker_service` · `support_addon` · `support_service` · `custom_service` (~~`hosting_agency`~~ eliminado, [ADR-024](../10-decisions/adr-024-eliminacion-hosting-agency.md); ~~`we_do_it`~~ deprecado, [ADR-022](../10-decisions/adr-022-wdify-deprecado-proyectos.md)) |
| `provisioner` | enum | NOT NULL | `enhance_cp` · `resellerclub` · `docker_engine` · `internal` · `manual` |
| `image_url` | varchar(500) | NULLABLE | |
| `badge_text` | varchar(50) | NULLABLE | "Más popular", "Nuevo", etc. |
| `order_index` | integer | NOT NULL, DEFAULT `0` | |
| `active` | boolean | NOT NULL, DEFAULT `true` | |
| `is_addon` | boolean | NOT NULL, DEFAULT `false` | |
| `is_global_addon` | boolean | NOT NULL, DEFAULT `false` | Support Inside es global de cuenta |
| `requires_existing_product` | boolean | NOT NULL, DEFAULT `false` | |
| `required_product_type` | varchar(50) | NULLABLE | Qué tipo de producto debe tener el cliente para contratar este addon |
| `max_quantity_per_client` | integer | NULLABLE | `null` = sin límite |
| `grace_period_days` | integer | NOT NULL, DEFAULT `0` | Días de gracia tras vencimiento |
| `suspension_days` | integer | NOT NULL, DEFAULT `7` | Días antes de suspender por impago |
| `cancellation_days` | integer | NOT NULL, DEFAULT `30` | Días hasta cancelar tras suspensión |
| `data_retention_days` | integer | NOT NULL, DEFAULT `30` | Retención de datos del servicio |
| `client_can_pause` | boolean | NOT NULL, DEFAULT `false` | |
| `pause_max_days` | integer | NULLABLE | |
| `provisioner_config` | jsonb | NULLABLE | Config del provisioner. Específico por plugin (ADR-021). |
| `audit_event_types` | jsonb | NULLABLE | Definición de eventos del audit log del servicio y sus campos (ADR-019) |
| `docker_template_id` | uuid | NULLABLE, FK → `docker_templates(id)` | Solo para `type = 'docker_service'` |
| `docker_custom_api_blocks` | jsonb | NULLABLE | Bloques custom de API para métricas del cliente |
| `partner_commission_pct` | decimal(5,2) | NULLABLE | % comisión partner ([partner.md](./partner.md)). `null` = sin comisión |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_products_slug` — UNIQUE en `slug`
- `idx_products_type` — en `type`
- `idx_products_active` — en `active`
- `idx_products_category` — en `category_id`

**Notas de decisión:**
- `audit_event_types` formato: `[{"type": "container_updated", "label": "Tu servicio fue actualizado", "fields": [{"key": "version_new", "label": "Nueva versión"}]}]`. Renderizado en cliente vía `audit.service_log.metadata` ([audit.md](./audit.md)).
- `docker_custom_api_blocks` define endpoints internos del contenedor para métricas del cliente.
- `provisioner_config` se define al desarrollar cada plugin. No se generaliza ([ADR-021](../10-decisions/adr-021-provisioners.md)).
- `partner_commission_pct` añadido para Fase 2 — comisión calculada sobre subtotal en `partner_commissions` ([partner.md](./partner.md)).

---

## Tabla: `product_pricing` ⬜

Planes de precio por producto y ciclo de facturación.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `product_id` | uuid | NOT NULL, FK → `products(id)` ON DELETE CASCADE | |
| `billing_cycle` | enum | NOT NULL | `monthly` · `annual` |
| `price` | decimal(10,2) | NOT NULL | |
| `currency` | varchar(3) | NOT NULL, DEFAULT `'EUR'` | ISO 4217 |
| `discount_percentage` | decimal(5,2) | NULLABLE | Descuento por pagar anual |
| `active` | boolean | NOT NULL, DEFAULT `true` | |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- UNIQUE `(product_id, billing_cycle, currency)`

**Invariante PROD-INV-5:** No se puede desactivar el último `ProductPricing` activo de un producto.

---

## Tabla: `product_extras` ⬜

Extras vinculados a un producto. Pueden ser obligatorios u opcionales.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `product_id` | uuid | NOT NULL, FK → `products(id)` ON DELETE CASCADE | El producto al que pertenece el extra |
| `extra_product_id` | uuid | NULLABLE, FK → `products(id)` | El producto que se ofrece como extra |
| `type` | enum | NOT NULL | `free_period` · `discount` · `included_product` |
| `is_mandatory` | boolean | NOT NULL, DEFAULT `false` | Si `true`, siempre incluido. Si `false`, el cliente elige. |
| `label` | varchar(200) | NOT NULL | Descripción visible al cliente |
| `discount_percentage` | decimal(5,2) | NULLABLE | |
| `free_months` | integer | NULLABLE | |
| `max_value_eur` | decimal(10,2) | NULLABLE | Límite de valor (ej: dominio regalo) |
| `applicable_cycles` | enum | NOT NULL, DEFAULT `'annual'` | `monthly` · `annual` · `both` |
| `tld_restrictions` | jsonb | NULLABLE | Para dominios regalo: qué TLDs aplican |
| `valid_until` | timestamptz | NULLABLE | |
| `max_uses` | integer | NULLABLE | `null` = sin límite |
| `uses_count` | integer | NOT NULL, DEFAULT `0` | Incremento atómico (ADR-055) |
| `active` | boolean | NOT NULL, DEFAULT `true` | |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Notas de decisión:**
- Dominio regalo con hosting anual = `type = 'free_period'` + `is_mandatory = false` + `applicable_cycles = 'annual'` + `tld_restrictions` configurado.
- `uses_count` se actualiza con SQL atómico para evitar race conditions ([ADR-055](../10-decisions/adr-055-resiliencia-circuit-breaker.md)).

---

## Tabla: `product_checklist_items` ⬜

Checklist base de mantenimiento definido al crear el producto.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `product_id` | uuid | NOT NULL, FK → `products(id)` ON DELETE CASCADE | |
| `label` | varchar(200) | NOT NULL | |
| `order_index` | integer | NOT NULL, DEFAULT `0` | |
| `is_required` | boolean | NOT NULL, DEFAULT `true` | |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Notas de decisión:**
- Este checklist se hereda al crear `service_checklist_items` para cada servicio nuevo ([billing.md](./billing.md)).
- Se puede personalizar por servicio concreto.

---

## Tabla: `docker_templates` ⬜

Plantillas `.yaml` para provisioning de productos Docker. Viven en el dashboard, no en los servidores.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `name` | varchar(200) | NOT NULL | |
| `slug` | varchar(200) | NOT NULL, UQ | |
| `yaml_content` | text | NOT NULL | Contenido con variables como `{{SUBDOMAIN}}`, `{{RAM_MB}}` |
| `variables` | jsonb | NOT NULL | Lista de variables inyectables con descripción y si son obligatorias |
| `version` | varchar(20) | NOT NULL, DEFAULT `'1.0.0'` | |
| `created_by` | uuid | NOT NULL, FK → `users(id)` | Solo superadmin |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Notas de decisión:**
- Solo el superadmin puede crear/editar plantillas.
- Al provisionar: el sistema inyecta variables y envía el `docker-compose.yml` generado al servidor seleccionado del pool ([infrastructure.md](./infrastructure.md), [ADR-043](../10-decisions/adr-043-infraestructura-self-hosted.md)).

---

## Tabla: `support_inside_config` ⬜

Configuración específica de productos tipo Support Inside ([ADR-034](../10-decisions/adr-034-support-inside-modelo.md)).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `product_id` | uuid | NOT NULL, FK → `products(id)` ON DELETE CASCADE, UQ | |
| `level_name` | varchar(100) | NOT NULL | Básico, Medium, Pro — definido por el admin |
| `has_real_agent_first` | boolean | NOT NULL, DEFAULT `false` | |
| `can_access_client_product` | boolean | NOT NULL, DEFAULT `false` | |
| `has_proactive_maintenance` | boolean | NOT NULL, DEFAULT `false` | |
| `available_channels` | jsonb | NOT NULL | Array: `["webchat", "async", "email", "phone", "whatsapp"]` |
| `response_sla_minutes` | integer | NULLABLE | Tiempo de respuesta garantizado |
| `slots_included_free` | integer | NOT NULL, DEFAULT `0` | |
| `slot_type_available` | enum | NOT NULL, DEFAULT `'maintenance'` | `maintenance` · `maintenance_and_management` · `both` |
| `slot_price_monthly` | decimal(10,2) | NULLABLE | Precio por slot adicional mensual |
| `slot_price_annual` | decimal(10,2) | NULLABLE | Precio por slot adicional anual |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

---

## Diagrama de relaciones (products)

```
product_categories
  └── products (1:N)
        ├── product_pricing (1:N)
        ├── product_extras (1:N)              ← extra_product_id (N:1) → products
        ├── product_checklist_items (1:N)
        ├── support_inside_config (1:1)        ← solo si type=support_service
        ├── docker_templates (N:1)             ← solo si type=docker_service
        └── server_pools (1:N)                 ← infrastructure.md
```

---

## Cross-references

- **Apuntan aquí:**
  - `services.product_id` → `products` ([billing.md](./billing.md))
  - `subscriptions.product_pricing_id` → `product_pricing` ([billing.md](./billing.md))
  - `server_pools.product_id` → `products` ([infrastructure.md](./infrastructure.md))
  - `partner_commissions.product_id` → `products` ([partner.md](./partner.md))
  - `project_items.product_id` → `products` (snapshot, [projects.md](./projects.md))
  - `knowledge_base_articles.product_id` → `products` ([system.md](./system.md))
- **ADRs principales:** [018](../10-decisions/adr-018-catalogo-dinamico-productos.md), [019](../10-decisions/adr-019-configuracion-tipos-producto.md), [020](../10-decisions/adr-020-categorias-extras-producto.md), [021](../10-decisions/adr-021-provisioners.md), [022](../10-decisions/adr-022-wdify-deprecado-proyectos.md), [024](../10-decisions/adr-024-eliminacion-hosting-agency.md), [034](../10-decisions/adr-034-support-inside-modelo.md).
- **Settings consumidos:** ninguno directo (los relacionados son de billing y infrastructure).
- **Errores API:** `PRODUCT_NOT_FOUND`, `PRICING_NOT_FOUND`, `LAST_PRICING_ACTIVE`, `INVALID_PROFILE_CATEGORY`, `SKU_DUPLICATE` — ver [api-errors](../50-operations/api-errors.md).
