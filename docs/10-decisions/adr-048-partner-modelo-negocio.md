# ADR-048 — Modelo de negocio partner (canal de venta indirecta)

> **Status:** Active (planificada — Fase 2 del proyecto)
> **Date:** 2026-04 (Fase 2 plan) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §35 (intro + modelo de negocio)
> **Domain:** partner

---

## Contexto

Aelium quiere ampliar su base de clientes vía **agencias revendedoras** (diseñadores, desarrolladores web, consultoras digitales) que ya tienen relación con clientes finales. La agencia recomienda Aelium, vende sus productos como parte de su propuesta y se queda con un margen.

Las opciones eran:

- **Programa de afiliados simple** (tracking link + pago único por conversión) → muy limitado, no fideliza al partner.
- **Reseller con licencia técnica** (la agencia revende y opera el producto bajo su marca) → complejo, requiere multitenancy en infra y soporte para el cliente final lo da la agencia, no Aelium.
- **Canal indirecto con dashboard propio** (la agencia tiene su panel, ve sus clientes, recibe comisión recurrente automática, Aelium da el soporte directo al cliente final) → middle ground: fideliza al partner sin renunciar al control de la operativa ni del cliente final.

El partner **no es un cliente normal** (no tiene servicios contratados en su cuenta de partner) **ni un agente** (no opera el sistema de Aelium). Es una **capa intermedia** con su propio dashboard, sus propios clientes finales, su sistema de comisiones y sus reglas de comunicación.

Este ADR define el **foundation** del módulo. Las sub-decisiones (roles, permisos, comisiones, desvinculación, vinculación cuenta cliente) viven en ADRs siguientes (ADR-049..053).

---

## Decisión

### Definición de partner

**Una agencia que revende productos de Aelium a sus clientes finales.** Específicamente:

- **No es cliente:** no tiene servicios contratados en su cuenta de partner.
- **No es agente:** no atiende a clientes de Aelium ni opera el sistema.
- **Es revendedor con dashboard propio:** ve sus clientes, sus comisiones, su facturación con Aelium, y se comunica con sus clientes via tickets + notificaciones (no chat tiempo real).

### Flujo de dinero

```
Cliente final del partner paga a Aelium (factura emitida por Aelium)
     │
     ▼
Aelium retiene su parte
     │
     ▼
Aelium liquida la comisión al partner a fin de mes (automática, ADR-051)
```

### Margen

- Definido **por producto al crearlo** (`products.partner_commission_pct`, decimal nullable).
- El partner recibe comisión sobre **TODOS los productos del cliente** incluyendo Support Inside y slots.
- El partner **no puede cambiar los precios** al cliente final (por ahora — abierto al futuro si se identifica caso de uso real).

### Factura al cliente final del partner

- **Emitida por Aelium** (R3 — invariante de billing, ADR-025/026).
- Formato: `"Aelium · Partner con [Nombre de la agencia]"` — el cliente sabe que contrata con Aelium como proveedor, pero ve a la agencia como su intermediario.
- Campos en `invoices`: `partner_id` (FK), `partner_label` (string snapshot del nombre).

### Campos añadidos en tablas existentes (Fase 1, nullable)

```
users.partner_id                    → FK a partners (cliente del partner)
users.linked_partner_account_id     → FK a partners (vinculación cuenta cliente, ADR-053)
services.partner_id                 → FK a partners
invoices.partner_id                 → FK a partners
invoices.partner_label              → varchar "Aelium · Partner con Agencia X"
products.partner_commission_pct     → decimal nullable · margen por producto
```

Se añaden como **nullable** en Fase 1 (compatible con clientes directos sin partner). El módulo `partner` se construye en Fase 2.

### Tablas nuevas (Fase 2)

```
partners                → datos de la agencia · estado · enlace único · método de payout · descuento cliente vinculado
partner_client_notes    → notas inmutables del partner sobre sus clientes (solo INSERT)
partner_tickets         → tickets del partner a sus clientes (bidireccional)
partner_ticket_messages → mensajes dentro de tickets partner-cliente
partner_notifications   → notificaciones unidireccionales del partner a clientes
partner_commissions     → comisión generada por factura cobrada
partner_payouts         → liquidaciones automáticas mensuales
partner_client_links    → vinculación cuenta partner + cuenta cliente del mismo usuario
partner_unlink_requests → solicitudes de desvinculación cliente-partner
```

Detalle por tabla en `docs/20-modules/partner/contract.md` y los ADRs siguientes.

### Soporte al cliente final del partner

**Aelium da soporte directamente al cliente final del partner.** El cliente final paga el Support Inside si lo quiere (la comisión va al partner).

El agente, en la ficha del cliente, ve:
- Nombre del partner al que pertenece.
- Notas del partner sobre ese cliente.
- Historial de tickets entre el partner y ese cliente.
- Historial de notificaciones del partner al cliente.

Esto da contexto al agente sin romper la relación cliente↔Aelium directa.

### Cliente del partner sin servicios

- Si cancela todos sus servicios → la cuenta queda activa sin servicios.
- Después de X tiempo sin servicios → cuenta suspendida. **X configurable en settings** (ADR-044).

---

## Consecuencias

- ✅ **Ganamos:**
  - Canal de crecimiento sin renunciar al control operativo (Aelium da el soporte, no la agencia).
  - Cliente final sigue siendo cliente de Aelium → consistencia de calidad.
  - Modelo monetariamente claro: comisión por producto, recurrente mientras el cliente esté activo.
  - Reutiliza la mayoría del sistema (auth, billing, services, support) sin cambios estructurales — solo añade `partner_id` en pocas tablas y un módulo dedicado.
- ⚠️ **Aceptamos:**
  - Fase 2 es **trabajo significativo** (módulo nuevo, dashboard, tickets, notificaciones, comisiones, payouts, desvinculación). Mitigación: Fase 1 prepara los `partner_id` nullable; Fase 2 construye encima sin migration ruptora.
  - La agencia no opera la calidad del soporte ni del producto → si Aelium falla, la agencia queda mal por extensión. Mitigación: Aelium debe mantener calidad alta — el partner es palanca de crecimiento, no escudo.
  - Conflicto potencial cliente↔partner si la agencia y el cliente discrepan → necesidad de desvinculación documentada (ADR-052).
- 🚪 **Cierra:**
  - **No multitenancy real** — todos los partners conviven en la misma instancia, mismo schema. Aislados por `partner_id` y permisos (ADR-050), no por DB separada.
  - **No partner como reseller con licencia técnica** — Aelium siempre opera y soporta.
  - **No partner cambia precios** al cliente final (abierto al futuro, no ahora).

---

## Cuándo revisar

- Tras los primeros 5-10 partners reales: validar que la propuesta económica les funciona (¿retienen clientes? ¿el % de comisión es competitivo?).
- Si surge demanda de white-label real (cliente final no ve a Aelium, solo a la agencia) → reevaluar — sería un modelo distinto.
- Si los partners piden poder ajustar precios → diseñar mecanismo de margen variable (hoy fijo).
- Si la cantidad de partners hace inviable la aprobación manual del onboarding (ADR-049) → automatizar parcialmente con scoring + revisión solo de casos dudosos.

---

## Referencias

- **Módulos afectados:** partner (nuevo módulo, stub hoy), users (`partner_id`), invoices (`partner_id`, `partner_label`), services (`partner_id`), products (`partner_commission_pct`).
- **Reglas relacionadas:** R1 (módulos por eventos), R3 (audit log), R8 (Outbox para `commission.*` — crítico financiero), R12 (permisos).
- **ADRs relacionados:** ADR-049 (roles y onboarding), ADR-050 (permisos), ADR-051 (comisiones y liquidaciones), ADR-052 (desvinculación), ADR-053 (vinculación cuenta cliente), ADR-054 (referidos — separado del modelo partner), ADR-011 (roles del sistema), ADR-025 (numeración facturas — partner facturas siguen mismas reglas), ADR-045 (ficha del cliente — agente ve relación con partner).
- **Glosario:** [Partner](../00-foundations/glossary.md), [Comisión](../00-foundations/glossary.md), [Cliente final](../00-foundations/glossary.md).
- **Implementación:** `docs/20-modules/partner/contract.md` (especificación detallada).
- **Documentación legacy:** `PARTNER_ARCHITECTURE.md`, `PARTNER_DECISIONS.md`, `PARTNER_SCHEMA.md` (cuando existan).
