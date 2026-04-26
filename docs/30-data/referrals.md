# Referrals — Schema (clientes normales)

> **Dominio:** sistema de referidos para clientes normales (≠ partner). Crédito mensual recurrente al referidor + descuento puntual al referido.
> **Módulo:** referrals (no existe aún — sprint dedicado).
> **Sprint origen:** Sprint dedicado (post-Fase 2).
> **Estado:** ⬜ no implementado.
> **ADRs:** [054](../10-decisions/adr-054-sistema-referidos-clientes.md) (sistema referidos).

---

## ⚠️ Sistema **separado** del partner

**Los partners NO tienen sistema de referidos.** Ya tienen comisión por cada producto de sus clientes ([partner.md](./partner.md), [ADR-051](../10-decisions/adr-051-partner-comisiones-liquidaciones.md)).

**Sistemas independientes:**
- Un cliente con `referrer_id != null` (fue referido) → genera créditos para el referidor.
- Un cliente con `partner_id != null` (es del partner X) → genera comisión para el partner.
- **Ambos pueden coexistir** en el mismo cliente — independientes.

---

## Resumen de tablas

| Tabla | Estado | Propósito |
|-------|--------|-----------|
| `referral_codes` | ⬜ | Enlace de referido único por cliente (1:1 con `users`) |
| `referrals` | ⬜ | Historial de referidos: quién refirió a quién, estado, primera compra |
| `referral_credits` | ⬜ | Créditos mensuales generados (aplicados en próxima factura del referidor) |

---

## Tabla: `referral_codes` ⬜

Enlace de referido único por cliente. Se genera automáticamente al crear cualquier cuenta de cliente. **No** se genera para partners ni agentes.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `user_id` | uuid | NOT NULL, FK → `users(id)` ON DELETE CASCADE, UQ | |
| `code` | varchar(100) | NOT NULL, UQ | Código único. Genera URL: `aelium.es/r/CODIGO` |
| `active` | boolean | NOT NULL, DEFAULT `true` | El admin puede desactivarlo |
| `total_referrals` | integer | NOT NULL, DEFAULT `0` | ⚠️ desnormalizado · contador para mostrar rápido |
| `total_credits_earned` | decimal(10,2) | NOT NULL, DEFAULT `0` | ⚠️ desnormalizado · total histórico de créditos generados |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_referral_codes_user` — UNIQUE en `user_id`
- `idx_referral_codes_code` — UNIQUE en `code`

**Notas de decisión:**
- Generación: trigger en `users` o cron de bootstrap al crear cuenta cliente.
- El cliente lo ve en su perfil con su URL personalizada.
- Los counters desnormalizados son recomputables desde `referrals` y `referral_credits` si hace falta.

---

## Tabla: `referrals` ⬜

Historial de referidos. Un registro por cada persona que se registró usando el enlace.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `referral_code_id` | uuid | NOT NULL, FK → `referral_codes(id)` | |
| `referrer_id` | uuid | NOT NULL, FK → `users(id)` | Cliente que compartió el enlace |
| `referred_id` | uuid | NOT NULL, FK → `users(id)`, UQ | Cliente que se registró con el enlace |
| `status` | enum | NOT NULL, DEFAULT `'pending'` | `pending` · `active` · `inactive` (`blocked` añadido por ADR-054 si excede límite) |
| `first_purchase_at` | timestamptz | NULLABLE | Cuando el referido hizo su primera compra |
| `first_invoice_id` | uuid | NULLABLE, FK → `invoices(id)` | Primera factura del referido |
| `discount_applied_pct` | decimal(5,2) | NULLABLE | ⚠️ desnormalizado · % aplicado en el primer pedido |
| `discount_applied_amount` | decimal(10,2) | NULLABLE | Importe exacto del descuento aplicado |
| `last_credit_generated_at` | timestamptz | NULLABLE | Último mes en que se generó crédito mensual |
| `deactivated_at` | timestamptz | NULLABLE | Cuando el referido canceló todos sus servicios |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_referrals_referrer` — en `referrer_id`
- `idx_referrals_referred` — UNIQUE en `referred_id` (un usuario solo puede ser referido una vez)
- `idx_referrals_status` — en `status` (cron mensual de créditos)

**Estados:**

| Status | Significado | Transición |
|--------|-------------|------------|
| `pending` | Referido se registró, aún no compró | → `active` al primera compra |
| `active` | Referido tiene al menos un servicio activo. **Genera crédito mensual.** | → `inactive` si cancela todos |
| `inactive` | Referido canceló todos sus servicios. Crédito mensual detenido. | → `active` si vuelve a contratar |
| `blocked` | Excedió `referrals.max_active_per_client` (configurable, [ADR-054](../10-decisions/adr-054-sistema-referidos-clientes.md)) | (manual) |

**Notas de decisión:**
- El crédito **acumulado** existente **no se pierde** al pasar a `inactive` — se sigue aplicando en facturas futuras hasta agotarse o expirar.
- Sin límite por defecto. Configurable: `referrals.max_active_per_client` (`0 = sin límite`).

---

## Tabla: `referral_credits` ⬜

Créditos mensuales generados por cada referido activo. **Un registro por mes por cada referido activo** (UQ).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `referral_id` | uuid | NOT NULL, FK → `referrals(id)` | |
| `referrer_id` | uuid | NOT NULL, FK → `users(id)` | |
| `amount` | decimal(10,2) | NOT NULL | Crédito generado este mes |
| `currency` | varchar(3) | NOT NULL, DEFAULT `'EUR'` | |
| `billing_month` | varchar(7) | NOT NULL | YYYY-MM · mes al que corresponde |
| `status` | enum | NOT NULL, DEFAULT `'pending'` | `pending` (= accrued) · `applied` · `expired` |
| `applied_to_invoice_id` | uuid | NULLABLE, FK → `invoices(id)` | En qué factura se aplicó |
| `applied_at` | timestamptz | NULLABLE | |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_referral_credits_referrer` — en `referrer_id`
- `idx_referral_credits_status` — en `status`
- `idx_referral_credits_month` — en `billing_month`
- UNIQUE `(referral_id, billing_month)` — un crédito por referido por mes (idempotencia del cron)

**Notas de decisión:**
- Generación: cron mensual (1 del mes, 04:00 UTC) busca todos los `referrals` con `status = active` y crea `referral_credit` para cada uno.
- Importe: configurable en `referrals.monthly_credit_amount`.
- Aplicación: al **generar una factura** del referidor, se buscan créditos `pending` y se aplican como descuento (status pasa a `applied`, `applied_to_invoice_id` se rellena).
- **Expiración:** créditos sin aplicar pueden expirar tras `referrals.credit_expiry_months` (default 12, `0 = nunca expiran`). Cron diario marca `expired`.
- **Outbox obligatorio** para `referral.credit.accrued` y `referral.credit.applied` ([ADR-054](../10-decisions/adr-054-sistema-referidos-clientes.md), R8). **Bloqueado** por deuda Outbox ([ADR-033](../10-decisions/adr-033-outbox-pattern-pendiente.md)).

---

## Diagrama de relaciones (referrals)

```
users (cliente normal)
  └── referral_codes (1:1)            ← su enlace personalizado
        └── referrals (1:N)            ← cada persona referida
              └── referral_credits (1:N por mes activos)
                    └── applied_to_invoice_id → invoices (billing.md)
```

---

## Cron jobs (aspiracionales — Sprint dedicado)

| Cron | Schedule | Función |
|------|----------|---------|
| `generate-monthly-credits` | 1 del mes · 04:00 UTC | Por cada `referral` con `status=active`, crear `referral_credit` |
| `apply-referral-discount` | (al generar factura) | Si el referidor tiene créditos `pending`, aplicar como descuento |
| `check-referral-status` | Diario | Detectar referidos que cancelaron todo → `status=inactive` |
| `expire-credits` | Diario | Marcar como `expired` los créditos > `credit_expiry_months` |

Ver [jobs-reference](../50-operations/jobs-reference.md).

---

## Cross-references

- **Apuntan aquí:**
  - `users.referrer_id` → `users` (no FK directa hacia `referrals` — la relación pasa por `referrals.referred_id`)
  - `invoices.id` ← `referral_credits.applied_to_invoice_id` ([billing.md](./billing.md))
- **Sistemas relacionados pero **independientes**:**
  - **Partner ([partner.md](./partner.md)):** comisión por cada factura cobrada. Recurrente. Pagada al partner via SEPA/Stripe.
  - **Promociones ([promotions.md](./promotions.md)):** descuentos puntuales con códigos. No recurrentes.
  - **Billing credits ([billing.md](./billing.md)):** créditos por prorrateo al cambiar de plan. Distintos de referidos.
- **ADR principal:** [054](../10-decisions/adr-054-sistema-referidos-clientes.md).
- **Settings consumidos:** `referrals.system_active`, `referrals.monthly_credit_amount`, `referrals.first_purchase_discount_pct`, `referrals.max_active_per_client`, `referrals.credit_expiry_months` — ver [settings-reference](../50-operations/settings-reference.md).
- **Plantillas email pendientes:** `referrals.registered`, `referrals.activated`, `referrals.credit_applied` — ver [email-templates](../50-operations/email-templates.md).
- **Errores API futuros:** ninguno específico todavía documentado.
