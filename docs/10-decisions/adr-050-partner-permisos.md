# ADR-050 — Permisos del partner (puede / no puede)

> **Status:** Active (planificada — Fase 2)
> **Date:** 2026-04 · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §35 (permisos)
> **Domain:** partner, auth

---

## Contexto

El partner (ADR-048) tiene una posición delicada en el sistema: **ve datos de sus clientes finales** (servicios, facturas, soporte) pero **no debe poder operar nada sensible** que afecte la relación cliente↔Aelium. Si el partner pudiera suspender un servicio, modificar precios, o intervenir en el chat de soporte, surgirían:

- Conflictos de interés (partner suspende servicio para forzar venta de uno propio).
- Confusión para el cliente (¿con quién hablo?).
- Riesgos operativos (un partner accidentalmente cancela el servicio de un cliente).
- Brechas de privacidad (un partner ve clientes de otro partner).

Hace falta una **lista explícita de qué puede y qué no puede hacer el partner**, modelada como permisos PBAC (ADR-012) en CASL.

---

## Decisión

### Lista canónica de permisos

```
PUEDE:
  ✓ Ver sus clientes y sus servicios (solo lectura)
  ✓ Ver facturas de sus clientes (solo lectura)
  ✓ Ver su comisión acumulada por producto y cliente
  ✓ Ver historial de soporte de sus clientes (solo lectura)
  ✓ Enviar notificaciones unidireccionales a sus clientes
  ✓ Abrir tickets a sus clientes (el cliente puede responder)
  ✓ Añadir notas sobre sus clientes (inmutables, solo INSERT)
  ✓ Desvincular clientes desde su dashboard (ADR-052)
  ✓ Registrar clientes via su enlace personalizado
  ✓ Ver y gestionar su propia facturación con Aelium
  ✓ Ver el historial de liquidaciones recibidas (ADR-051)
  ✓ Ver métricas de su panel de inicio

NO PUEDE:
  ✗ Ver clientes de otros partners
  ✗ Cambiar precios de productos
  ✗ Suspender o cancelar servicios de sus clientes
  ✗ Crear facturas manuales
  ✗ Intervenir en conversaciones de soporte cliente-Aelium
  ✗ Tocar configuración del sistema
  ✗ Ver márgenes internos de Aelium
  ✗ Chatear en tiempo real con sus clientes (solo tickets — ADR-037)
  ✗ Aprobar o rechazar liquidaciones (son automáticas — ADR-051)
```

### Modelo de permisos en CASL

Permisos definidos en `backend/src/modules/auth/abilities/partner.abilities.ts`:

```typescript
// Permitido
can('read', 'Service', { partner_id: user.partner_id });
can('read', 'Invoice', { partner_id: user.partner_id });
can('create', 'PartnerNote', { partner_id: user.partner_id });
can('create', 'PartnerNotification', { partner_id: user.partner_id });
can('create', 'PartnerTicket', { partner_id: user.partner_id });
can('manage', 'Partner', { id: user.partner_id });  // su propio perfil
can('read', 'Commission', { partner_id: user.partner_id });
can('read', 'Payout', { partner_id: user.partner_id });

// Prohibido explícitamente
cannot('update', 'Service');     // no puede suspender / cambiar
cannot('delete', 'Service');
cannot('update', 'Product');     // no puede cambiar precios
cannot('create', 'Invoice', { type: 'manual' });
cannot('update', 'PartnerNote'); // notas inmutables (R3)
cannot('delete', 'PartnerNote');
cannot('manage', 'Setting');     // no toca configuración global
cannot('read', 'Conversation', { type: 'chat' });  // no chats en vivo
```

Los guards NestJS aplican estas abilities en cada endpoint (PBAC isomórfico, ADR-012).

### Comunicación del partner con sus clientes (3 canales)

| Canal | Tipo | Bidireccional | Persistencia |
|-------|------|---------------|--------------|
| **Tickets** | Asíncrono (tipo email) | Sí — el cliente puede responder | `partner_tickets` + `partner_ticket_messages` |
| **Notificaciones** | Unidireccional (avisos / comunicados) | No — no esperan respuesta | `partner_notifications` |
| **Notas** | Solo internas del partner | N/A | `partner_client_notes` (solo INSERT, R3) |

**Observación clave:** Aelium siempre tiene **visibilidad** de tickets y notificaciones del partner — cualquier agente de Aelium puede verlos en la ficha del cliente (ADR-045 / ADR-048). Las notas son visibles al agente pero **no al cliente** (el cliente ve en su portal de transparencia que existe la nota, pero no su contenido — ADR-010).

### Aislamiento entre partners

- **Cada query parametrizada por `partner_id`** — un partner nunca ve datos de otro.
- Validación a **dos niveles**:
  1. Ability CASL filtra a nivel de objeto (ej: `can('read', 'Service', { partner_id: user.partner_id })`).
  2. Query Prisma siempre incluye `WHERE partner_id = $partnerId` defensivamente (defense in depth — Regla R7).

### Restricciones específicas justificadas

#### "No chat en tiempo real con sus clientes"

El partner solo abre tickets, no chats. Razones:
- **Cadencia:** un partner gestiona muchos clientes; el chat tiempo real obliga a presencia. Tickets son asíncronos.
- **Trazabilidad:** los tickets quedan documentados. Los chats son volátiles.
- **No solapar con Aelium:** Aelium da el chat de soporte directo. Si el partner también tuviera chat, el cliente no sabría a quién acudir.

#### "No intervenir en conversaciones cliente-Aelium"

El partner ve el historial (read-only), pero no puede escribir mensajes en conversaciones donde Aelium atiende al cliente. Razones:
- Un partner respondiendo en chat de soporte podría dar información incorrecta.
- El cliente espera atención de Aelium, no de su agencia.
- El audit log y la responsabilidad de la respuesta deben quedar claros.

#### "No aprobar liquidaciones"

Las liquidaciones son **automáticas a fin de mes** (ADR-051). El partner las recibe; no las dispara.

---

## Consecuencias

- ✅ **Ganamos:**
  - Lista canónica explícita facilita auditoría (¿el partner puede X?) y conversación con partners (¿por qué no puedo?).
  - PBAC con CASL centralizado → cambios de permisos en un solo lugar.
  - Aislamiento real entre partners — no hay bug en una query que exponga datos de otro partner.
  - Modelo de comunicación claro: tickets, notificaciones, notas — sin chats que confundan.
- ⚠️ **Aceptamos:**
  - **Lista cerrada** → cuando un partner pida algo nuevo (ej: "quiero poder pausar el servicio de mi cliente bajo demanda") hay que hacer ADR para añadir el permiso.
  - El partner puede **percibir limitación** (no puede chatear en vivo, no aprueba liquidaciones). Mitigación: claridad en el material de onboarding.
  - **Notas inmutables** — si un partner se equivoca al escribir una nota, debe escribir otra rectificando. No se borra. Aceptable: trazabilidad > comodidad.
- 🚪 **Cierra:**
  - **No permisos por defecto al crear el rol** — partner empieza con la lista mínima. Cualquier ampliación requiere ADR.
  - **No queries cross-partner** — query sin `partner_id` filter es bug.

---

## Cuándo revisar

- Si los partners piden recurrentemente un permiso bloqueado (chat en vivo, cambio de precios) → reevaluar ADR específico — no concedérselo silenciosamente.
- Si surge regulación que exija al partner tener acceso a ciertos datos del cliente (RGPD avanzado) → revisar.
- Si la lista de "no puede" crece >20 ítems → considerar invertir el modelo (lista de "puede" exhaustiva).

---

## Referencias

- **Módulos afectados:** partner, auth (CASL abilities), todos los módulos donde el partner consume datos (services, invoices, support read-only).
- **Reglas relacionadas:** R3 (audit log + notas inmutables), R7 (defense in depth — query + ability), R12 (PBAC).
- **ADRs relacionados:** ADR-048 (modelo partner), ADR-049 (roles), ADR-012 (PBAC con CASL), ADR-037 (chat vs ticket — partner solo tickets), ADR-051 (comisiones / liquidaciones — automáticas), ADR-052 (desvinculación — uno de los permisos), ADR-010 (RGPD — visibilidad de notas al cliente).
- **Glosario:** [Permiso](../00-foundations/glossary.md), [PBAC](../00-foundations/glossary.md), [Partner](../00-foundations/glossary.md).
