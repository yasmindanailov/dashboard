# Promotions — Schema

> **Dominio:** promociones (upsell/crossell) y códigos de descuento.
> **Módulo:** promotions (stub hoy — sprint dedicado futuro).
> **Sprint origen:** Sprint dedicado (post-Sprint 14).
> **Estado:** ⬜ no implementado.
> **ADRs:** [023](../10-decisions/adr-023-promociones-codigos-descuento.md) (promociones + descuentos).

---

## Resumen de tablas

| Tabla | Estado | Propósito |
|-------|--------|-----------|
| `promotions` | ⬜ | Reglas de promoción (upsell/crossell) con incentivo y trigger |
| `promotion_conditions` | ⬜ | Condiciones que deben cumplirse para aplicar la promoción (AND lógico) |
| `promotion_messages` | ⬜ | Mensajes de la promoción por ubicación (checkout, dashboard…) |
| `promotion_views` | ⬜ | Registro de visualizaciones por cliente (para max_views_before_hide) |
| `discount_codes` | ⬜ | Códigos de descuento configurables (porcentaje o importe fijo) |
| `discount_code_uses` | ⬜ | Registro de usos de códigos (para validar max_uses_per_client) |

---

## Tabla: `promotions` ⬜

Reglas de promoción. Upsell (al mismo cliente) y crossell (productos relacionados).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `name` | varchar(200) | NOT NULL | Nombre interno del admin |
| `type` | enum | NOT NULL | `upsell` · `crossell` |
| `status` | enum | NOT NULL, DEFAULT `'active'` | `active` · `inactive` · `expired` |
| `trigger_type` | enum | NOT NULL | `checkout` · `post_checkout` · `dashboard_event` |
| `trigger_event` | varchar(100) | NULLABLE | Nombre del evento si `trigger_type = dashboard_event` |
| `trigger_conditions` | jsonb | NULLABLE | Condiciones adicionales del trigger |
| `target_product_id` | uuid | NULLABLE, FK → `products(id)` | Producto que se ofrece |
| `incentive_type` | enum | NULLABLE | `none` · `discount_percentage` · `free_months` |
| `incentive_value` | decimal(10,2) | NULLABLE | |
| `incentive_duration_months` | integer | NULLABLE | |
| `incentive_max_value_eur` | decimal(10,2) | NULLABLE | |
| `max_uses` | integer | NULLABLE | `null` = sin límite |
| `uses_count` | integer | NOT NULL, DEFAULT `0` | Incremento atómico ([ADR-055](../10-decisions/adr-055-resiliencia-circuit-breaker.md)) |
| `max_views_before_hide` | integer | NOT NULL, DEFAULT `3` | Por cliente. Configurable. |
| `valid_until` | timestamptz | NULLABLE | Se desactiva automáticamente al cumplirse |
| `created_by` | uuid | NOT NULL, FK → `users(id)` | |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

---

## Tabla: `promotion_conditions` ⬜

Condiciones que deben cumplirse para que una promoción aplique a un cliente. **Múltiples condiciones por promoción → AND lógico**.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `promotion_id` | uuid | NOT NULL, FK → `promotions(id)` ON DELETE CASCADE | |
| `condition_type` | enum | NOT NULL | `has_product` · `not_has_product` · `plan_is` · `cycle_is` · `client_age_days_min` |
| `condition_value` | varchar(200) | NOT NULL | |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

---

## Tabla: `promotion_messages` ⬜

Mensajes de una promoción. Uno por ubicación (UQ).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `promotion_id` | uuid | NOT NULL, FK → `promotions(id)` ON DELETE CASCADE | |
| `location` | enum | NOT NULL | `checkout` · `post_checkout` · `notification` · `service_banner` |
| `title` | varchar(300) | NOT NULL | Puede contener variables: `{{client.name}}` |
| `body` | text | NOT NULL | |
| `cta_label` | varchar(100) | NOT NULL, DEFAULT `'Ver oferta'` | |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- UNIQUE `(promotion_id, location)`

---

## Tabla: `promotion_views` ⬜

Registro de visualizaciones por cliente. Permite respetar `max_views_before_hide`.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `promotion_id` | uuid | NOT NULL, FK → `promotions(id)` ON DELETE CASCADE | |
| `user_id` | uuid | NOT NULL, FK → `users(id)` ON DELETE CASCADE | |
| `views_count` | integer | NOT NULL, DEFAULT `1` | Se incrementa en cada visualización |
| `dismissed_at` | timestamptz | NULLABLE | Cuando el cliente hace clic en "No mostrar más" |
| `accepted_at` | timestamptz | NULLABLE | Cuando el cliente acepta la oferta |
| `last_viewed_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- UNIQUE `(promotion_id, user_id)`

---

## Tabla: `discount_codes` ⬜

Códigos de descuento configurables (porcentaje o importe fijo).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `code` | varchar(100) | NOT NULL, UQ | Texto libre o auto-generado |
| `type` | enum | NOT NULL | `percentage` · `fixed_amount` |
| `value` | decimal(10,2) | NOT NULL | Porcentaje (`< 100`) o importe fijo |
| `applicable_product_ids` | jsonb | NULLABLE | Array de `product_id`s. `null` = aplica a todos los productos |
| `applicable_cycles` | enum | NOT NULL, DEFAULT `'both'` | `monthly` · `annual` · `both` |
| `only_new_clients` | boolean | NOT NULL, DEFAULT `false` | |
| `max_uses_total` | integer | NULLABLE | `null` = sin límite |
| `max_uses_per_client` | integer | NOT NULL, DEFAULT `1` | |
| `uses_count` | integer | NOT NULL, DEFAULT `0` | Incremento atómico ([ADR-055](../10-decisions/adr-055-resiliencia-circuit-breaker.md)) |
| `valid_from` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `valid_until` | timestamptz | NULLABLE | |
| `active` | boolean | NOT NULL, DEFAULT `true` | |
| `created_by` | uuid | NOT NULL, FK → `users(id)` | |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Notas de decisión:**
- `uses_count` con SQL atómico anti race-condition:
  ```sql
  UPDATE discount_codes
  SET uses_count = uses_count + 1
  WHERE id = $1 AND (max_uses_total IS NULL OR uses_count < max_uses_total)
  RETURNING *;
  -- Si no devuelve filas → límite alcanzado
  ```
  Ver [ADR-055](../10-decisions/adr-055-resiliencia-circuit-breaker.md).

---

## Tabla: `discount_code_uses` ⬜

Registro de usos de códigos de descuento. Audit-friendly + permite validar `max_uses_per_client`.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `discount_code_id` | uuid | NOT NULL, FK → `discount_codes(id)` | |
| `user_id` | uuid | NOT NULL, FK → `users(id)` | |
| `invoice_id` | uuid | NULLABLE, FK → `invoices(id)` | |
| `amount_saved` | decimal(10,2) | NOT NULL | |
| `used_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_discount_uses_code_user` — en `(discount_code_id, user_id)` (validar usos por cliente)

---

## Diagrama de relaciones (promotions)

```
promotions
  ├── promotion_conditions (1:N)    ← AND lógico
  ├── promotion_messages (1:N UQ por location)
  ├── promotion_views (1:N por user)
  └── target_product_id → products

discount_codes
  ├── discount_code_uses (1:N)
  ├── applicable_product_ids (jsonb) ↪ products (no FK)
  └── subscriptions.discount_code_id (1:N) → billing.md
```

---

## Cross-references

- **Apuntan aquí:**
  - `subscriptions.discount_code_id` → `discount_codes` ([billing.md](./billing.md))
  - `subscriptions.promotion_discount_amount` / `promotion_discount_until` → derivado de `promotions` ([billing.md](./billing.md))
- **ADR principal:** [023](../10-decisions/adr-023-promociones-codigos-descuento.md).
- **Sistemas separados pero parecidos:** este dominio no se mezcla con `referrals` ([referrals.md](./referrals.md)) ni con `partner_commissions` ([partner.md](./partner.md)) — cada uno tiene tablas propias.
- **Settings consumidos:** ninguno directo todavía (módulo no implementado).
- **Errores API:** ninguno específico documentado todavía.
