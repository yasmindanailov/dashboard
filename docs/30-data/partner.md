# Partner — Schema (Fase 2)

> **Dominio:** módulo partner — agencias revendedoras con dashboard propio, comisiones recurrentes, comunicación bidireccional limitada.
> **Módulo:** [`docs/20-modules/partner/contract.md`](../20-modules/partner/contract.md).
> **Sprint origen:** Fase 2 (post-Fase 1). Campos nullable en tablas existentes se añaden desde el inicio para evitar migration ruptora.
> **Estado:** ⬜ no implementado. Stubs y campos preparados.
> **ADRs:** [048](../10-decisions/adr-048-partner-modelo-negocio.md) (modelo) · [049](../10-decisions/adr-049-partner-roles-onboarding.md) (roles + onboarding) · [050](../10-decisions/adr-050-partner-permisos.md) (permisos) · [051](../10-decisions/adr-051-partner-comisiones-liquidaciones.md) (comisiones) · [052](../10-decisions/adr-052-partner-desvinculacion-cliente.md) (desvinculación) · [053](../10-decisions/adr-053-partner-vinculacion-cuenta-cliente.md) (vinculación cuenta cliente).
> **Documentación legacy paralela:** `PARTNER_ARCHITECTURE.md`, `PARTNER_DECISIONS.md`, `PARTNER_SCHEMA.md` (en raíz de `docs/`).

---

## Resumen de tablas

### Extensiones a tablas existentes (Fase 1 — añadidas como nullable)

| Tabla | Campo añadido | Tipo | Notas |
|-------|---------------|------|-------|
| `users` | `partner_id` | uuid NULLABLE FK → `partners(id)` | `null` = cliente directo de Aelium |
| `users` | `linked_partner_account_id` | uuid NULLABLE FK → `partners(id)` | Vinculación cuenta cliente ↔ cuenta partner ([ADR-053](../10-decisions/adr-053-partner-vinculacion-cuenta-cliente.md)) |
| `services` | `partner_id` | uuid NULLABLE FK → `partners(id)` | `null` = servicio de cliente directo |
| `invoices` | `partner_id` | uuid NULLABLE FK → `partners(id)` | `null` = factura de cliente directo |
| `invoices` | `partner_label` | varchar(200) NULLABLE | "Aelium · Partner con Agencia X" en la factura |
| `products` | `partner_commission_pct` | decimal(5,2) NULLABLE | % comisión partner. `null` = sin comisión |
| `roles` | seed: `partner_pending`, `partner` | enum `RoleSlug` | Onboarding de aprobación manual ([ADR-049](../10-decisions/adr-049-partner-roles-onboarding.md)) |

### Tablas nuevas (Fase 2)

| Tabla | Estado | Propósito |
|-------|--------|-----------|
| `partners` | ⬜ | Datos de la agencia partner |
| `partner_client_notes` | ⬜ | Notas inmutables del partner sobre sus clientes (solo INSERT) |
| `partner_tickets` | ⬜ | Tickets bidireccionales partner ↔ cliente final |
| `partner_ticket_messages` | ⬜ | Mensajes dentro de tickets partner-cliente |
| `partner_commissions` | ⬜ | Comisión generada por cada factura cobrada (snapshot del %) |
| `partner_payouts` | ⬜ | Liquidaciones automáticas mensuales |
| `partner_notifications` | ⬜ | Notificaciones unidireccionales del partner a clientes |
| `partner_client_links` | ⬜ | Vinculación cuenta partner ↔ cuenta cliente del mismo usuario |
| `partner_unlink_requests` | ⬜ | Solicitudes de desvinculación cliente-partner |

---

## Tabla: `partners` ⬜

Datos de cada agencia partner. Se crea al **aprobar** la solicitud (manual por admin — [ADR-049](../10-decisions/adr-049-partner-roles-onboarding.md)).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK, DEFAULT `gen_random_uuid()` | |
| `user_id` | uuid | NOT NULL, FK → `users(id)`, UQ | Usuario propietario de la cuenta partner |
| `agency_name` | varchar(200) | NOT NULL | |
| `cif` | varchar(20) | NOT NULL | |
| `website` | varchar(500) | NULLABLE | |
| `estimated_clients` | integer | NULLABLE | Informativo · del formulario de registro |
| `status` | enum | NOT NULL, DEFAULT `'pending'` | `pending` · `active` · `rejected` · `suspended` |
| `referral_code` | varchar(100) | NULLABLE, UQ | Generado al aprobar. `null` mientras `pending` |
| `referral_link` | varchar(500) | NULLABLE | URL completa generada al aprobar |
| `approved_by` | uuid | NULLABLE, FK → `users(id)` | Admin que aprobó |
| `approved_at` | timestamptz | NULLABLE | |
| `rejected_at` | timestamptz | NULLABLE | |
| `rejection_reason` | text | NULLABLE | Visible para el partner en email de rechazo |
| `payout_method` | enum | NULLABLE | `sepa` · `stripe_connect` · `both` |
| `payout_iban` | varchar(50) | NULLABLE | **Encriptado en reposo** ([ADR-015](../10-decisions/adr-015-encriptacion-credenciales.md)) |
| `payout_stripe_account_id` | varchar(200) | NULLABLE | ID de cuenta Stripe Connect |
| `payout_cycle` | enum | NOT NULL, DEFAULT `'monthly'` | `monthly` |
| `client_discount_pct` | decimal(5,2) | NULLABLE | Descuento si vincula cuenta de cliente · configurable por admin ([ADR-053](../10-decisions/adr-053-partner-vinculacion-cuenta-cliente.md)) |
| `notes_internal` | text | NULLABLE | Notas del admin sobre el partner · no visibles para el partner |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_partners_user_id` — UNIQUE en `user_id`
- `idx_partners_status` — en `status`
- `idx_partners_referral_code` — UNIQUE en `referral_code` WHERE `referral_code IS NOT NULL`

---

## Tabla: `partner_client_notes` ⬜

Notas del partner sobre sus clientes. **Inmutables (solo INSERT)** — análogo al schema `audit`.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK, DEFAULT `gen_random_uuid()` | |
| `partner_id` | uuid | NOT NULL, FK → `partners(id)` | |
| `client_id` | uuid | NOT NULL, FK → `users(id)` | Cliente final sobre el que se añade la nota |
| `content` | text | NOT NULL | Texto libre |
| `created_by` | uuid | NOT NULL, FK → `users(id)` | Usuario del partner que añadió la nota |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_partner_notes_partner` — en `partner_id`
- `idx_partner_notes_client` — en `client_id`

**Notas de decisión:**
- Solo INSERT. Nunca UPDATE ni DELETE.
- El cliente final **ve en su portal de transparencia que existe una nota pero no su contenido** ([ADR-010](../10-decisions/adr-010-rgpd-retencion-datos.md)).
- El agente de Aelium ve el contenido completo en la ficha del cliente.

---

## Tabla: `partner_tickets` ⬜

Tickets del partner a sus clientes finales. **Bidireccional** (cliente puede responder). Aelium siempre tiene visibilidad ([ADR-050](../10-decisions/adr-050-partner-permisos.md)).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK, DEFAULT `gen_random_uuid()` | |
| `partner_id` | uuid | NOT NULL, FK → `partners(id)` | |
| `client_id` | uuid | NOT NULL, FK → `users(id)` | Cliente destinatario |
| `subject` | varchar(300) | NOT NULL | |
| `status` | enum | NOT NULL, DEFAULT `'open'` | `open` · `replied` · `closed` |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_partner_tickets_partner` — en `partner_id`
- `idx_partner_tickets_client` — en `client_id`
- `idx_partner_tickets_status` — en `status`

---

## Tabla: `partner_ticket_messages` ⬜

Mensajes dentro de un ticket partner-cliente.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK, DEFAULT `gen_random_uuid()` | |
| `ticket_id` | uuid | NOT NULL, FK → `partner_tickets(id)` ON DELETE CASCADE | |
| `sender_id` | uuid | NOT NULL, FK → `users(id)` | |
| `sender_type` | enum | NOT NULL | `partner` · `client` |
| `content` | text | NOT NULL | |
| `read_at` | timestamptz | NULLABLE | |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_partner_ticket_messages_ticket` — en `ticket_id`

---

## Tabla: `partner_commissions` ⬜

Comisión generada por cada factura pagada de un cliente del partner. **Se genera automáticamente al cobrar una factura de un cliente vinculado** ([ADR-051](../10-decisions/adr-051-partner-comisiones-liquidaciones.md)).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK, DEFAULT `gen_random_uuid()` | |
| `partner_id` | uuid | NOT NULL, FK → `partners(id)` | |
| `client_id` | uuid | NOT NULL, FK → `users(id)` | Cliente final que generó la comisión |
| `invoice_id` | uuid | NOT NULL, FK → `invoices(id)` | Factura que originó la comisión |
| `service_id` | uuid | NULLABLE, FK → `services(id)` | |
| `product_id` | uuid | NOT NULL, FK → `products(id)` | |
| `invoice_total` | decimal(10,2) | NOT NULL | Total de la factura en el momento del cobro |
| `commission_pct` | decimal(5,2) | NOT NULL | ⚠️ desnormalizado · % en el momento del cobro |
| `commission_amount` | decimal(10,2) | NOT NULL | Importe exacto de la comisión |
| `currency` | varchar(3) | NOT NULL, DEFAULT `'EUR'` | |
| `status` | enum | NOT NULL, DEFAULT `'pending'` | `pending` · `included_in_payout` · `paid` |
| `payout_id` | uuid | NULLABLE, FK → `partner_payouts(id)` | En qué liquidación se incluyó |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_partner_commissions_partner` — en `partner_id`
- `idx_partner_commissions_status` — en `status`
- `idx_partner_commissions_payout` — en `payout_id`
- `idx_partner_commissions_invoice` — en `invoice_id`

**Notas de decisión:**
- `commission_pct` se desnormaliza intencionalmente. Si el `products.partner_commission_pct` cambia, el histórico preserva el % aplicable en ese momento.
- **Cálculo sobre `subtotal` (base imponible), no `total`** — el IVA es del Estado, no del partner.
- **Outbox obligatorio** ([ADR-051](../10-decisions/adr-051-partner-comisiones-liquidaciones.md), R8) — eventos `partner.commission.accrued`, `partner.payout.created`, `partner.payout.completed`, `partner.payout.failed`. **Bloqueado** hasta resolver deuda Outbox ([ADR-033](../10-decisions/adr-033-outbox-pattern-pendiente.md)).

---

## Tabla: `partner_payouts` ⬜

Liquidaciones al partner. **Completamente automáticas a fin de mes** — sin aprobación manual ([ADR-051](../10-decisions/adr-051-partner-comisiones-liquidaciones.md)).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK, DEFAULT `gen_random_uuid()` | |
| `partner_id` | uuid | NOT NULL, FK → `partners(id)` | |
| `period_start` | timestamptz | NOT NULL | Inicio del período liquidado |
| `period_end` | timestamptz | NOT NULL | Fin del período liquidado |
| `total_commissions` | decimal(10,2) | NOT NULL | Suma de comisiones incluidas |
| `currency` | varchar(3) | NOT NULL, DEFAULT `'EUR'` | |
| `payout_method` | enum | NOT NULL | `sepa` · `stripe_connect` |
| `status` | enum | NOT NULL, DEFAULT `'pending'` | `pending` · `processing` · `completed` · `failed` |
| `external_transfer_id` | varchar(500) | NULLABLE | ID en Stripe o referencia SEPA |
| `failure_reason` | text | NULLABLE | |
| `processed_at` | timestamptz | NULLABLE | |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_partner_payouts_partner` — en `partner_id`
- `idx_partner_payouts_status` — en `status`
- UNIQUE `(partner_id, period_start, period_end)`

**Notas de decisión:**
- Cron mensual (1 del mes a las 03:00 UTC) — agrupar `partner_commissions` accrued, generar payout, transferir, marcar `included_in_payout` → `paid`.
- Si total < umbral configurable (`partner.payout.min_amount_eur`, default 50€) → no se crea payout, comisiones quedan accrued para el mes siguiente.
- Pendiente — ver [jobs-reference](../50-operations/jobs-reference.md).

---

## Tabla: `partner_notifications` ⬜

Notificaciones **unidireccionales** del partner a sus clientes finales. No esperan respuesta. Comunicados o avisos ([ADR-050](../10-decisions/adr-050-partner-permisos.md)).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK, DEFAULT `gen_random_uuid()` | |
| `partner_id` | uuid | NOT NULL, FK → `partners(id)` | |
| `client_id` | uuid | NOT NULL, FK → `users(id)` | Cliente destinatario |
| `title` | varchar(300) | NOT NULL | |
| `body` | text | NOT NULL | |
| `read_at` | timestamptz | NULLABLE | Cuando el cliente la leyó |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_partner_notif_partner` — en `partner_id`
- `idx_partner_notif_client` — en `client_id`

---

## Tabla: `partner_client_links` ⬜

Vinculación entre cuenta partner y cuenta de cliente del mismo usuario ([ADR-053](../10-decisions/adr-053-partner-vinculacion-cuenta-cliente.md)).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK, DEFAULT `gen_random_uuid()` | |
| `partner_id` | uuid | NOT NULL, FK → `partners(id)`, UQ | Una cuenta partner se vincula con una sola cuenta cliente |
| `client_user_id` | uuid | NOT NULL, FK → `users(id)`, UQ | La cuenta de cliente normal |
| `partner_email` | varchar(255) | NOT NULL | Email de la cuenta partner |
| `client_email` | varchar(255) | NOT NULL | Email de la cuenta cliente |
| `status` | enum | NOT NULL, DEFAULT `'pending'` | `pending` · `active` · `rejected` |
| `requested_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `approved_by` | uuid | NULLABLE, FK → `users(id)` | Admin que aprobó |
| `approved_at` | timestamptz | NULLABLE | |
| `rejected_at` | timestamptz | NULLABLE | |
| `discount_pct` | decimal(5,2) | NULLABLE | ⚠️ desnormalizado · descuento en el momento de la vinculación |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Notas de decisión:**
- Aprobación manual del admin (puede ajustar `discount_pct` por partner).
- Switch entre cuentas en frontend genera JWT nuevo sin pedir contraseña — auditado en `audit.access_log`.

---

## Tabla: `partner_unlink_requests` ⬜

Solicitudes de desvinculación cliente-partner ([ADR-052](../10-decisions/adr-052-partner-desvinculacion-cliente.md)).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK, DEFAULT `gen_random_uuid()` | |
| `partner_id` | uuid | NOT NULL, FK → `partners(id)` | |
| `client_id` | uuid | NOT NULL, FK → `users(id)` | Cliente afectado |
| `requested_by` | enum | NOT NULL | `client` · `partner` |
| `client_reason` | text | NULLABLE | Motivo del cliente |
| `partner_response` | enum | NULLABLE | `accepted` · `rejected` |
| `partner_rejection_reason` | text | NULLABLE | |
| `status` | enum | NOT NULL, DEFAULT `'pending'` | `pending` · `accepted` · `rejected` · `forced` · `escalated` |
| `escalated_to_agent` | uuid | NULLABLE, FK → `users(id)` | Agente asignado si se escala (cuando partner rechaza) |
| `resolved_by` | uuid | NULLABLE, FK → `users(id)` | Admin/agente que resolvió |
| `resolved_at` | timestamptz | NULLABLE | |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_unlink_partner` — en `partner_id`
- `idx_unlink_client` — en `client_id`
- `idx_unlink_status` — en `status`

**Notas de decisión:**
- Si el partner rechaza → escalación automática a agente Aelium (ticket creado en [support.md](./support.md)).
- El cliente **siempre puede salir** con razones válidas (el agente es árbitro final).
- Comisiones pasadas se **respetan** (no se revierten).

---

## Diagrama de relaciones (partner)

```
partners
  ├── partner_client_notes (1:N)              ← inmutables
  ├── partner_tickets (1:N)
  │     └── partner_ticket_messages (1:N)
  ├── partner_notifications (1:N)             ← unidireccionales
  ├── partner_commissions (1:N)               ← snapshot del % en el momento
  │     └── payout_id → partner_payouts
  ├── partner_payouts (1:N)
  ├── partner_client_links (1:1)              ← vinculación cuenta cliente
  └── partner_unlink_requests (1:N)

users (cliente del partner)
  ├── partner_id (nullable) → partners
  └── linked_partner_account_id (nullable) → partners

services (del cliente del partner)
  └── partner_id (nullable) → partners

invoices (del cliente del partner)
  ├── partner_id (nullable) → partners
  └── partner_label (nullable) → texto visible en factura

products
  └── partner_commission_pct (nullable) → driver de partner_commissions
```

---

## Cross-references

- **ADRs:** [048](../10-decisions/adr-048-partner-modelo-negocio.md), [049](../10-decisions/adr-049-partner-roles-onboarding.md), [050](../10-decisions/adr-050-partner-permisos.md), [051](../10-decisions/adr-051-partner-comisiones-liquidaciones.md), [052](../10-decisions/adr-052-partner-desvinculacion-cliente.md), [053](../10-decisions/adr-053-partner-vinculacion-cuenta-cliente.md), [054](../10-decisions/adr-054-sistema-referidos-clientes.md) (referidos — sistema **separado**, ver [referrals.md](./referrals.md)).
- **Roles añadidos:** `partner_pending`, `partner` en `roles` ([auth.md](./auth.md)) — guardados con CASL ([ADR-012](../10-decisions/adr-012-pbac-casl.md)).
- **Settings consumidos:** `partner.payout.min_amount_eur`, `partner.client_inactive_suspend_days` — ver [settings-reference](../50-operations/settings-reference.md).
- **Eventos críticos (deben usar Outbox):** `partner.commission.accrued`, `partner.payout.created`, `partner.payout.completed`, `partner.payout.failed`, `partner.unlink_request.*`. Bloqueados por [ADR-033](../10-decisions/adr-033-outbox-pattern-pendiente.md).
- **Plantillas email pendientes:** onboarding aprobado/rechazado, payout completed/failed, unlink request — ver [email-templates](../50-operations/email-templates.md).
- **Errores API futuros:** `PARTNER_ACCESS_DENIED` (defense in depth), `PARTNER_COMMISSION_ALREADY_PAID`, etc.
- **NO confundir con referidos** ([referrals.md](./referrals.md)) — el partner tiene comisión recurrente sobre productos; los referidos clientes normales tienen crédito mensual fijo. Sistemas separados.
