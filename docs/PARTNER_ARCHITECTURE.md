# PARTNER_ARCHITECTURE.md — Módulo Partner · Guía para Antigravity
> Documento técnico del módulo partner para el agente de Antigravity.
> Lee primero ARCHITECTURE.md para las reglas globales del proyecto.
> Las reglas de ARCHITECTURE.md prevalecen siempre sobre este documento.
> Versión 1.0 | Abril 2026

---

## QUÉ ES ESTE MÓDULO

El módulo partner gestiona la relación entre Aelium y las agencias revendedoras.
Es una capa intermedia entre Aelium y los clientes finales de las agencias.
Se construye en Fase 2 — después de que el core del dashboard esté funcional.

---

## LO QUE ESTE MÓDULO HACE

```
1. Onboarding de partners (registro · aprobación · activación)
2. Vinculación de clientes a partners via enlace personalizado
3. Generación automática de comisiones al cobrar facturas
4. Liquidaciones automáticas mensuales al partner
5. Comunicación partner → cliente (tickets + notificaciones)
6. Gestión de desvinculaciones cliente-partner
7. Vinculación de cuentas partner + cliente del mismo usuario
```

---

## LO QUE ESTE MÓDULO NO HACE

```
No gestiona el soporte al cliente final (eso es el módulo support)
No provisiona servicios (eso es el módulo provisioning)
No genera facturas (eso es el módulo billing)
No autentica usuarios (eso es el módulo auth)
El módulo partner solo escucha eventos de los otros módulos
y actúa sobre los datos de su dominio
```

---

## REGLAS ESPECÍFICAS DE ESTE MÓDULO

Además de las 7 reglas globales de ARCHITECTURE.md:

**R1 — Las comisiones son inmutables**
Una vez generada una comisión, nunca se modifica.
Si hay un error, se genera una comisión correctora (positiva o negativa).
Nunca UPDATE en `partner_commissions`.

**R2 — Las liquidaciones son automáticas**
Ninguna liquidación requiere aprobación manual.
El job `generate-monthly-payouts` corre a fin de mes sin intervención humana.
Si falla → alerta al superadmin y reintento automático.

**R3 — Las notas son inmutables**
`partner_client_notes` es de solo INSERT. Nunca UPDATE ni DELETE.
Misma restricción que las tablas de audit.

**R4 — El partner nunca accede a datos de otros partners**
Todos los endpoints del módulo partner filtran siempre por `partner_id`
del usuario autenticado. Nunca se devuelven datos de otros partners.

**R5 — La comisión se calcula al cobrar, no al facturar**
El evento que dispara la generación de comisión es `invoice.paid`,
no `invoice.created`. Si una factura no se cobra, no hay comisión.

---

## ESTRUCTURA DE CARPETAS

```
/backend/src/modules/partner/
  ├── partner.module.ts
  ├── partner.controller.ts       ← endpoints del dashboard del partner
  ├── partner.service.ts          ← lógica de negocio
  ├── commission.service.ts       ← lógica de comisiones
  ├── payout.service.ts           ← lógica de liquidaciones
  ├── partner-auth.guard.ts       ← guard específico para rol partner
  └── dto/                        ← Data Transfer Objects

/backend/src/modules/partner/workers/
  ├── generate-payouts.worker.ts  ← job mensual de liquidaciones
  ├── generate-commission.worker.ts
  ├── payout-sepa.worker.ts
  └── payout-stripe.worker.ts
```

---

## MÓDULO — RESPONSABILIDADES Y EVENTOS

### Responsabilidad
Orquestar el ciclo de vida de la relación partner-cliente.
Gestionar comisiones, liquidaciones, comunicación, y desvinculaciones.

### Emite
```typescript
'partner.approved'              // { partnerId, agencyName }
'partner.commission_generated'  // { partnerId, clientId, invoiceId, amount }
'partner.payout_completed'      // { partnerId, payoutId, amount }
'partner.payout_failed'         // { partnerId, payoutId, reason }
'partner.client_unlinked'       // { partnerId, clientId }
'partner.unlink_escalated'      // { partnerId, clientId, requestId }
```

### Escucha (via BullMQ)
```typescript
'invoice.paid'      // → genera comisión si el cliente tiene partner_id
'service.cancelled' // → verifica si el cliente del partner se queda sin servicios
```

---

## ENDPOINTS DE LA API

### Onboarding y gestión del partner (superadmin)
```
GET    /admin/partners                     → lista de partners con filtros
GET    /admin/partners/:id                 → detalle del partner
PATCH  /admin/partners/:id/approve         → aprobar partner
PATCH  /admin/partners/:id/reject          → rechazar partner con motivo
PATCH  /admin/partners/:id/suspend         → suspender partner
```

### Dashboard del partner (rol: partner)
```
GET    /partner/me                         → datos del partner autenticado
GET    /partner/dashboard                  → métricas del inicio

GET    /partner/clients                    → lista de clientes
GET    /partner/clients/:clientId          → ficha del cliente (solo lectura)
GET    /partner/clients/:clientId/services → servicios del cliente
GET    /partner/clients/:clientId/invoices → facturas del cliente
GET    /partner/clients/:clientId/support  → historial de soporte (solo lectura)

POST   /partner/clients/:clientId/notes    → añadir nota (inmutable)
GET    /partner/clients/:clientId/notes    → ver notas del cliente

POST   /partner/clients/:clientId/tickets  → abrir ticket al cliente
GET    /partner/clients/:clientId/tickets  → historial de tickets
POST   /partner/tickets/:ticketId/messages → responder en un ticket

POST   /partner/clients/:clientId/notifications → enviar notificación
GET    /partner/clients/:clientId/notifications → historial de notificaciones

DELETE /partner/clients/:clientId/link     → iniciar desvinculación

GET    /partner/commissions                → comisiones con filtros
GET    /partner/payouts                    → historial de liquidaciones

GET    /partner/referral                   → enlace y estadísticas
```

### Desvinculaciones
```
POST   /partner/unlink-requests            → el partner inicia desvinculación
PATCH  /partner/unlink-requests/:id/accept → el partner acepta solicitud del cliente
PATCH  /partner/unlink-requests/:id/reject → el partner rechaza (escala a Aelium)
PATCH  /admin/unlink-requests/:id/force    → el admin fuerza la desvinculación
```

### Vinculación de cuentas partner + cliente
```
POST   /partner/link-client-account        → solicita vincular su cuenta de cliente
GET    /partner/link-client-account        → estado de la vinculación
GET    /admin/partner-client-links         → lista de solicitudes pendientes
PATCH  /admin/partner-client-links/:id/approve → aprobar vinculación
PATCH  /admin/partner-client-links/:id/reject  → rechazar vinculación
```

---

## GUARDS

### `PartnerGuard`
```typescript
// Verifica que el usuario autenticado tiene rol 'partner' (no partner_pending)
// Si el partner está suspendido → 403 Forbidden
// Siempre filtra queries por partner_id del usuario autenticado
```

### `PartnerClientGuard`
```typescript
// Verifica que el clientId del request pertenece al partner autenticado
// Un partner nunca puede acceder a datos de clientes de otros partners
```

---

## LÓGICA DE COMISIONES

```typescript
// Al recibir el evento invoice.paid:

1. Buscar en la factura si tiene partner_id
   Si no tiene partner_id → no hay comisión · fin

2. Para cada línea de la factura (invoice_items):
   a. Buscar el producto de esa línea
   b. Verificar si tiene partner_commission_pct definido
   c. Si tiene:
      commission_amount = invoice_item.subtotal * (product.partner_commission_pct / 100)
      Crear registro en partner_commissions con status = 'pending'

3. Emitir evento partner.commission_generated
```

---

## LÓGICA DE LIQUIDACIONES

```typescript
// Job generate-monthly-payouts (corre el último día del mes a las 23:00):

1. Buscar todos los partners con status = 'active'

2. Para cada partner:
   a. Buscar todas las comisiones con status = 'pending' del período
   b. Calcular el total
   c. Si total > 0:
      - Crear registro en partner_payouts con status = 'pending'
      - Marcar las comisiones como included_in_payout
      - Encolar job de transferencia según payout_method del partner

3. Job process-payout-sepa:
   Ejecuta transferencia SEPA via proveedor bancario
   Al completar → status = 'completed' · marcar comisiones como 'paid'
   Al fallar → status = 'failed' · notificación al superadmin · reintento

4. Job process-payout-stripe:
   Ejecuta transferencia via Stripe Connect
   Mismo flujo que SEPA
```

---

## LÓGICA DE DESVINCULACIÓN

```typescript
// El cliente solicita desvincularse:

1. Crear registro en partner_unlink_requests
   { requested_by: 'client', status: 'pending' }

2. Notificar al partner (notificación interna)

3. El partner responde:
   ACEPTA:
     status = 'accepted'
     users.partner_id = null para ese cliente
     Emitir partner.client_unlinked

   RECHAZA:
     status = 'escalated'
     Crear ticket interno para agente de Aelium
     Emitir partner.unlink_escalated

4. Si el agente interviene:
   Puede forzar la desvinculación → status = 'forced'
   users.partner_id = null · el cliente queda como directo
```

---

## SCHEMA — TABLAS QUE USA ESTE MÓDULO

Ver PARTNER_SCHEMA.md para el detalle completo de cada tabla.

```
TABLAS PROPIAS DEL MÓDULO
  partners
  partner_client_notes
  partner_tickets
  partner_ticket_messages
  partner_notifications
  partner_commissions
  partner_payouts
  partner_client_links
  partner_unlink_requests

TABLAS DE OTROS MÓDULOS QUE LEE (solo lectura)
  users              → datos del cliente · partner_id
  services           → servicios del cliente del partner
  invoices           → facturas del cliente del partner
  products           → partner_commission_pct
  conversations      → historial de soporte (solo lectura)

TABLAS DE OTROS MÓDULOS QUE ESCRIBE
  users.partner_id   → lo pone a null al desvincular
```

---

## CÓMO TRABAJAR CON ESTE MÓDULO EN ANTIGRAVITY

### Al inicio de la sesión del módulo partner
1. Leer ARCHITECTURE.md (reglas globales)
2. Leer PARTNER_ARCHITECTURE.md (este archivo)
3. Leer PARTNER_SCHEMA.md (schema del módulo)
4. Leer PARTNER_DECISIONS.md (lógica de negocio)

### Una sesión = una parte del módulo
```
Sesión 1: tablas y migraciones (PARTNER_SCHEMA.md)
Sesión 2: onboarding y auth del partner
Sesión 3: dashboard del partner (endpoints de lectura)
Sesión 4: comisiones y liquidaciones
Sesión 5: tickets, notas, notificaciones
Sesión 6: desvinculaciones
Sesión 7: vinculación de cuentas
```

### Lo que el agente puede decidir solo
- Estructura interna de los servicios y DTOs.
- Nombres de variables y funciones.
- Cómo hacer las queries SQL con los filtros correctos.
- Tests unitarios.

### Lo que el agente nunca decide solo
- Modificar la lógica de comisiones sin consultar PARTNER_DECISIONS.md.
- Hacer UPDATE o DELETE en `partner_client_notes` o `partner_commissions`.
- Devolver datos de un partner a otro partner.
- Modificar tablas del schema audit.

---

*La fuente de verdad de producto es PARTNER_DECISIONS.md*
*La fuente de verdad técnica es PARTNER_ARCHITECTURE.md*
*El schema completo es PARTNER_SCHEMA.md*
