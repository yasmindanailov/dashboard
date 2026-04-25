# ADR-024 — Eliminación de `hosting_agency` como tipo de producto

> **Status:** Active
> **Date:** 2026-04 (Sprint 5) · 2026-04-26 (migración a ADR)
> **Original:** ROADMAP.md Sprint 5 — "Decisiones de producto" sección
> **Domain:** products

---

## Contexto

Originalmente el catálogo planeaba un tipo `hosting_agency` (B2B) separado del `hosting_web` (B2C). La idea era que las agencias partner contrataran planes específicos diseñados para revender hosting con white-label.

Tras razonar el modelo Partner (ADR-048..054), se identificó:

1. **El producto es el mismo (hosting compartido sobre Enhance CP).** La diferencia agency vs B2C era solo precio + descuentos.
2. **Tener dos tipos** (`hosting_web` y `hosting_agency`) duplicaba esfuerzo:
   - Dos veces los planes en el catálogo.
   - Doble UI de gestión.
   - Confusión sobre cuál ofrecer al cliente.
3. **El descuento del partner ya se gestiona** vía `partner_commission_pct` (campo en producto) + descuentos partner-scoped en checkout.

Si Aelium agency vende hosting a la agencia con descuento, **debe ser el mismo producto** que cualquier cliente, con descuento aplicado.

---

## Decisión

**`hosting_agency` queda eliminado del catálogo.**

### Modelo unificado

- Hay UN solo tipo `hosting_web` con sus planes (Web Inicio, Web Pro, Web Business).
- Los partners pueden vender estos planes a sus clientes con **descuento configurado por partner** (ADR-051) o el `partner_commission_pct` del producto.
- Cuando un cliente del partner contrata `hosting_web`, el sistema:
  - Aplica las reglas normales de `hosting_web`.
  - Calcula la comisión del partner según `partner_commission_pct` del producto.
  - Etiqueta la factura con `Aelium · Partner with [agencia]`.

### Migración

- Si el seed contenía productos `hosting_agency`: eliminar del seed.
- Si en BD había productos creados con tipo `hosting_agency`: desactivarlos (`is_active: false`). NO eliminarlos (datos históricos en facturas pasadas — invariante R3 + facturas no se borran).
- El enum `ProductType` puede mantener `hosting_agency` como opción legada (si Prisma fuerza inmutabilidad de enums en migrations) o eliminarse en migración limpia. **Estado actual:** verificar el schema antes de Sprint Partner.

---

## Consecuencias

- ✅ **Ganamos:**
  - Un solo catálogo de hosting. Menos duplicación.
  - El partner vende el mismo producto que cualquiera, con su descuento aplicado.
  - Factura del cliente final del partner clara: producto + descuento + identificación del partner.
- ⚠️ **Aceptamos:**
  - Si en algún momento Aelium quisiera ofrecer un hosting **funcionalmente distinto** a agencias (ej: white-label de Enhance CP en subdominio del partner), habría que reintroducir un tipo separado o usar `resource_config` JSONB para variantes. Hoy no se necesita.
- 🚪 **Cierra:**
  - **No ofrecer `hosting_agency` como tipo en la UI de creación de productos.**
  - **No prometer en marketing un producto B2B distinto** — el producto es el mismo, lo que cambia es la relación comercial.

---

## Cuándo revisar

- Si Aelium decide ofrecer un white-label técnico real a agencias (URL del CP en subdominio del partner, branding completo) → reintroducir tipo separado o usar config en `hosting_web` para variantes.
- Si surge un partner que negocia condiciones técnicas distintas (recursos diferentes, SLA distintos) → evaluar si eso justifica nuevo tipo o se cubre con campos en `resource_config`.

---

## Referencias

- **Módulos afectados:** products, partner (modelo de comisiones).
- **ADRs relacionados:** ADR-018 (catálogo dinámico), ADR-019 (configuración tipos), ADR-048..054 (módulo Partner), ADR-051 (comisiones).
- **Glosario:** [Partner](../00-foundations/glossary.md), [Comisión](../00-foundations/glossary.md), [Producto](../00-foundations/glossary.md).
- **Histórico:** ROADMAP.md Sprint 5 sección "Decisiones de producto".
