# PARTNER_SCHEMA.md — Schema de Base de Datos · Módulo Partner
> Schema completo del módulo partner en formato Markdown.
> El SQL y las migraciones se generan en Antigravity a partir de este documento.
> Lee también DATABASE_SCHEMA.md para el schema global del proyecto.
> Versión 1.0 | Abril 2026

---

## CAMPOS AÑADIDOS EN TABLAS EXISTENTES

Estos campos se añaden desde el Sprint 1 como nullable.
No rompen ninguna funcionalidad existente.
Permiten que el módulo partner se construya en fase 2 sin rediseño.

---

### `users` — campos nuevos
| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| partner_id | uuid | NULLABLE, FK → partners(id) | null = cliente directo de Aelium |
| linked_partner_account_id | uuid | NULLABLE, FK → partners(id) | Si el usuario tiene cuenta de cliente vinculada a su cuenta partner |

---

### `services` — campo nuevo
| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| partner_id | uuid | NULLABLE, FK → partners(id) | null = servicio de cliente directo de Aelium |

---

### `invoices` — campos nuevos
| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| partner_id | uuid | NULLABLE, FK → partners(id) | null = factura de cliente directo |
| partner_label | varchar(200) | NULLABLE | "Aelium · Partner con Agencia X" · aparece en la factura |

---

### `products` — campo nuevo
| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| partner_commission_pct | decimal(5,2) | NULLABLE | % de comisión para el partner. null = sin comisión para este producto |

---

### `roles` — registros nuevos en el seed
```
partner_pending → Registrado y email verificado · pendiente de aprobación manual
partner         → Aprobado · acceso completo al dashboard partner
```

---

## TABLAS NUEVAS — MÓDULO PARTNER

---

### `partners`
Datos de cada agencia partner. Se crea al aprobar la solicitud.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK, DEFAULT gen_random_uuid() | |
| user_id | uuid | NOT NULL, FK → users(id), UQ | Usuario propietario de la cuenta partner |
| agency_name | varchar(200) | NOT NULL | |
| cif | varchar(20) | NOT NULL | |
| website | varchar(500) | NULLABLE | |
| estimated_clients | integer | NULLABLE | Informativo · del formulario de registro |
| status | enum | NOT NULL, DEFAULT 'pending' | pending · active · rejected · suspended |
| referral_code | varchar(100) | NULLABLE, UQ | Generado al aprobar · null mientras está pending |
| referral_link | varchar(500) | NULLABLE | URL completa · generada al aprobar |
| approved_by | uuid | NULLABLE, FK → users(id) | Admin que aprobó |
| approved_at | timestamptz | NULLABLE | |
| rejected_at | timestamptz | NULLABLE | |
| rejection_reason | text | NULLABLE | Visible para el partner en el email de rechazo |
| payout_method | enum | NULLABLE | sepa · stripe_connect · both |
| payout_iban | varchar(50) | NULLABLE | Encriptado en reposo |
| payout_stripe_account_id | varchar(200) | NULLABLE | ID de cuenta Stripe Connect |
| payout_cycle | enum | NOT NULL, DEFAULT 'monthly' | monthly |
| client_discount_pct | decimal(5,2) | NULLABLE | Descuento si vincula cuenta de cliente · configurable por admin |
| notes_internal | text | NULLABLE | Notas del admin sobre el partner · no visibles para el partner |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_partners_user_id` — UNIQUE en user_id
- `idx_partners_status` — en status
- `idx_partners_referral_code` — UNIQUE en referral_code WHERE referral_code IS NOT NULL

---

### `partner_client_notes`
Notas del partner sobre sus clientes. Inmutables.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK, DEFAULT gen_random_uuid() | |
| partner_id | uuid | NOT NULL, FK → partners(id) | |
| client_id | uuid | NOT NULL, FK → users(id) | Cliente final sobre el que se añade la nota |
| content | text | NOT NULL | Texto libre |
| created_by | uuid | NOT NULL, FK → users(id) | Usuario del partner que añadió la nota |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_partner_notes_partner` — en partner_id
- `idx_partner_notes_client` — en client_id
- `idx_partner_notes_created` — en created_at

**Notas de decisión:**
- Tabla de solo INSERT. Nunca UPDATE ni DELETE.
- El cliente final ve en su portal de transparencia que existe una nota
  pero no ve su contenido.
- El agente de Aelium ve el contenido completo en la ficha del cliente.
- El partner es informado al añadir la nota de que el cliente sabe que existe.
- En el futuro: campo `category_id` nullable para categorías personalizables.

---

### `partner_tickets`
Tickets del partner a sus clientes finales.
El cliente puede responder. Aelium siempre tiene visibilidad.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK, DEFAULT gen_random_uuid() | |
| partner_id | uuid | NOT NULL, FK → partners(id) | |
| client_id | uuid | NOT NULL, FK → users(id) | Cliente destinatario |
| subject | varchar(300) | NOT NULL | |
| status | enum | NOT NULL, DEFAULT 'open' | open · replied · closed |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_partner_tickets_partner` — en partner_id
- `idx_partner_tickets_client` — en client_id
- `idx_partner_tickets_status` — en status

**Notas de decisión:**
- El cliente puede responder al ticket. Solo en este canal · no en el chat.
- Cualquier agente de Aelium puede ver estos tickets.
- Los tickets aparecen en la ficha del cliente como contexto adicional.
- El partner NO puede chatear en tiempo real con sus clientes.

---

### `partner_ticket_messages`
Mensajes dentro de un ticket partner-cliente.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK, DEFAULT gen_random_uuid() | |
| ticket_id | uuid | NOT NULL, FK → partner_tickets(id) ON DELETE CASCADE | |
| sender_id | uuid | NOT NULL, FK → users(id) | |
| sender_type | enum | NOT NULL | partner · client |
| content | text | NOT NULL | |
| read_at | timestamptz | NULLABLE | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_partner_ticket_messages_ticket` — en ticket_id

---

### `partner_notifications`
Notificaciones unidireccionales del partner a sus clientes.
No son tickets. No esperan respuesta.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK, DEFAULT gen_random_uuid() | |
| partner_id | uuid | NOT NULL, FK → partners(id) | |
| client_id | uuid | NOT NULL, FK → users(id) | |
| title | varchar(300) | NOT NULL | |
| body | text | NOT NULL | |
| read_at | timestamptz | NULLABLE | Cuando el cliente la leyó |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_partner_notif_partner` — en partner_id
- `idx_partner_notif_client` — en client_id

**Notas de decisión:**
- El partner no puede eliminar notificaciones ya enviadas.
- El agente de Aelium las ve en la ficha del cliente.
- Son comunicados o avisos — no generan respuesta.

---

### `partner_commissions`
Comisión generada por cada factura pagada de un cliente del partner.
Se genera automáticamente al cobrar una factura de un cliente vinculado.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK, DEFAULT gen_random_uuid() | |
| partner_id | uuid | NOT NULL, FK → partners(id) | |
| client_id | uuid | NOT NULL, FK → users(id) | Cliente final que generó la comisión |
| invoice_id | uuid | NOT NULL, FK → invoices(id) | Factura que originó la comisión |
| service_id | uuid | NULLABLE, FK → services(id) | |
| product_id | uuid | NOT NULL, FK → products(id) | |
| invoice_total | decimal(10,2) | NOT NULL | Total de la factura en el momento del cobro |
| commission_pct | decimal(5,2) | NOT NULL | ⚠️ desnormalizado · % en el momento del cobro |
| commission_amount | decimal(10,2) | NOT NULL | Importe exacto de la comisión |
| currency | varchar(3) | NOT NULL, DEFAULT 'EUR' | |
| status | enum | NOT NULL, DEFAULT 'pending' | pending · included_in_payout · paid |
| payout_id | uuid | NULLABLE, FK → partner_payouts(id) | En qué liquidación se incluyó |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_partner_commissions_partner` — en partner_id
- `idx_partner_commissions_status` — en status
- `idx_partner_commissions_payout` — en payout_id
- `idx_partner_commissions_invoice` — en invoice_id

**Notas de decisión:**
- `commission_pct` se desnormaliza intencionalmente.
  Si el margen del producto cambia, el historial preserva el % que aplicaba en ese momento.
- Se genera una comisión por cada línea de factura que corresponda a un producto
  con `partner_commission_pct` definido.
- Incluye comisiones de Support Inside y slots adicionales.

---

### `partner_payouts`
Liquidaciones al partner. Completamente automáticas a fin de mes.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK, DEFAULT gen_random_uuid() | |
| partner_id | uuid | NOT NULL, FK → partners(id) | |
| period_start | timestamptz | NOT NULL | Inicio del período liquidado |
| period_end | timestamptz | NOT NULL | Fin del período liquidado |
| total_commissions | decimal(10,2) | NOT NULL | Suma de comisiones incluidas |
| currency | varchar(3) | NOT NULL, DEFAULT 'EUR' | |
| payout_method | enum | NOT NULL | sepa · stripe_connect |
| status | enum | NOT NULL, DEFAULT 'pending' | pending · processing · completed · failed |
| external_transfer_id | varchar(500) | NULLABLE | ID en Stripe o referencia SEPA |
| failure_reason | text | NULLABLE | |
| processed_at | timestamptz | NULLABLE | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_partner_payouts_partner` — en partner_id
- `idx_partner_payouts_status` — en status
- UNIQUE(partner_id, period_start, period_end)

**Notas de decisión:**
- Sin aprobación manual. Completamente automáticas.
- El admin puede ver el historial pero no interviene en el proceso.
- Si falla → `status = failed` + notificación al superadmin + reintento en X horas.

---

### `partner_client_links`
Vinculación entre cuenta partner y cuenta de cliente del mismo usuario.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK, DEFAULT gen_random_uuid() | |
| partner_id | uuid | NOT NULL, FK → partners(id), UQ | |
| client_user_id | uuid | NOT NULL, FK → users(id), UQ | La cuenta de cliente normal |
| partner_email | varchar(255) | NOT NULL | Email de la cuenta partner |
| client_email | varchar(255) | NOT NULL | Email de la cuenta cliente |
| status | enum | NOT NULL, DEFAULT 'pending' | pending · active · rejected |
| requested_at | timestamptz | NOT NULL, DEFAULT now() | |
| approved_by | uuid | NULLABLE, FK → users(id) | Admin que aprobó |
| approved_at | timestamptz | NULLABLE | |
| rejected_at | timestamptz | NULLABLE | |
| discount_pct | decimal(5,2) | NULLABLE | ⚠️ desnormalizado · descuento en el momento de la vinculación |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Notas de decisión:**
- El proceso: el partner introduce ambos emails → se envía confirmación a ambas cuentas
  → queda pendiente de aprobación manual por un admin.
- El descuento se aplica desde la siguiente factura a la aprobación.
- La desvinculación es un proceso manual revisado por un agente.
- `discount_pct` se desnormaliza para preservar el descuento histórico si cambia la config.

---

### `partner_unlink_requests`
Solicitudes de desvinculación cliente-partner.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK, DEFAULT gen_random_uuid() | |
| partner_id | uuid | NOT NULL, FK → partners(id) | |
| client_id | uuid | NOT NULL, FK → users(id) | Cliente que solicita la desvinculación |
| requested_by | enum | NOT NULL | client · partner | Quién inició la desvinculación |
| client_reason | text | NULLABLE | Motivo del cliente |
| partner_response | enum | NULLABLE | accepted · rejected |
| partner_rejection_reason | text | NULLABLE | |
| status | enum | NOT NULL, DEFAULT 'pending' | pending · accepted · rejected · forced · escalated |
| escalated_to_agent | uuid | NULLABLE, FK → users(id) | Agente asignado si se escala |
| resolved_by | uuid | NULLABLE, FK → users(id) | Admin/agente que resolvió |
| resolved_at | timestamptz | NULLABLE | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_unlink_partner` — en partner_id
- `idx_unlink_client` — en client_id
- `idx_unlink_status` — en status

**Notas de decisión:**
- Si el partner acepta → status = accepted → desvinculación efectiva inmediata.
- Si el partner rechaza → status = escalated → ticket a agente de Aelium.
- El agente puede forzar la desvinculación (status = forced).
  El cliente siempre puede desvincularse si tiene razones válidas.
- Si el partner inicia la desvinculación → status = accepted directamente.
  El cliente recibe notificación.

---

## RELACIONES COMPLETAS DEL MÓDULO PARTNER

```
partners
  ├── partner_client_notes (1:N)      ← notas sobre clientes
  ├── partner_tickets (1:N)           ← tickets a clientes
  │     └── partner_ticket_messages (1:N)
  ├── partner_notifications (1:N)     ← avisos a clientes
  ├── partner_commissions (1:N)       ← comisiones generadas
  ├── partner_payouts (1:N)           ← liquidaciones
  ├── partner_client_links (1:1)      ← vinculación cuenta cliente
  └── partner_unlink_requests (1:N)   ← solicitudes de desvinculación

users (cliente del partner)
  └── partner_id (nullable) → partners

services (del cliente del partner)
  └── partner_id (nullable) → partners

invoices (del cliente del partner)
  ├── partner_id (nullable) → partners
  └── partner_label (nullable) → texto visible en la factura

products
  └── partner_commission_pct (nullable) → % de comisión
```

---

## COLA DE TRABAJOS — PARTNER

```
COLA: partner
  jobs:
    generate-monthly-payouts     ← fin de mes · calcula y ejecuta liquidaciones
    process-payout-sepa          ← ejecuta transferencia SEPA
    process-payout-stripe        ← ejecuta pago via Stripe Connect
    retry-failed-payout          ← reintento si una liquidación falla
    generate-commission          ← al cobrar factura de cliente del partner
    check-partner-client-status  ← detecta clientes sin servicios · suspende si corresponde
```

---

## EVENTOS DEL MÓDULO PARTNER

```
EMITE
  partner.approved              → se aprueba un partner
  partner.commission_generated  → se genera una comisión al cobrar factura
  partner.payout_completed      → liquidación completada
  partner.payout_failed         → liquidación fallida · alerta al superadmin
  partner.client_unlinked       → desvinculación efectiva
  partner.unlink_escalated      → desvinculación rechazada · escala a agente

ESCUCHA
  invoice.paid                  → genera comisión si el cliente tiene partner_id
  service.cancelled             → verifica si el cliente del partner se queda sin servicios
```
