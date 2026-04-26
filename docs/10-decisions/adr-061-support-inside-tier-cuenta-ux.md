# ADR-061 — Support Inside como tier de cuenta (UX dedicada, schema reutilizado)

> **Status:** Active (refina ADR-034)
> **Date:** 2026-04-26
> **Domain:** support, ui

---

## Contexto

El [ADR-034](./adr-034-support-inside-modelo.md) definió Support Inside como **producto del catálogo** (`products` con `type='support_inside'` + `is_global_addon=true` + `requires_existing_product=true`) con configuración específica en la tabla `support_inside_config`. Esta decisión sigue siendo correcta a nivel de **schema y billing** (Support Inside genera facturas, tiene precio, ciclos de facturación, comisión partner — es un servicio comercial).

Sin embargo, durante la auditoría 2026-04-26 surgió una crítica arquitectónica de Yasmin (decisión de producto):

> "Support Inside no se siente como otro producto técnico (hosting, dominio, Cloud Office). Es algo **tan dentro del dashboard** que conceptualmente es **un tier de cuenta**, una **opción premium configurable**, no un producto del catálogo público."

La crítica es válida a nivel de **UX y presentación**: hoy Support Inside aparece (o aparecería al implementarlo) en el catálogo de admin junto a hosting/dominios/Cloud Office, y potencialmente en el catálogo público que vería el cliente. Eso confunde el modelo mental: Support Inside no es "otro producto" — es **un upgrade de la relación con Aelium**.

---

## Opciones consideradas

1. **Mantener UX actual** (Support Inside aparece en catálogo de productos junto a otros).
   - Pros: cero cambios, sigue ADR-034 al pie de la letra.
   - Contras: confunde al admin (parece un producto técnico más); confunde al cliente si se expone públicamente.

2. **(Elegida) UX dedicada con schema reutilizado.**
   - Mantener `products` con `type='support_inside'` + `support_inside_config` exactamente como están en ADR-034.
   - **Cambiar la presentación:** sacar Support Inside del catálogo público de productos; crear página dedicada para clientes (`/dashboard/support-inside`) y admin (`/admin/support-inside-plans`).
   - Pros: cero refactor de billing; el cliente percibe "tier de cuenta", no "producto"; el admin gestiona en zona dedicada con UX adaptada (planes Básico/Medium/Pro lado a lado, no en lista plana de productos).
   - Contras: añade rutas de UI específicas (no es solo CRUD genérico de productos).

3. **Refactor completo de schema** (sacar Support Inside de `products` y crear `support_tiers` + `support_subscriptions` dedicadas).
   - Pros: separación conceptual total.
   - Contras: **duplica toda la lógica de billing** (factura, ciclos, cancelación, prorrateo, comisión partner, suspension/reactivation) que ya hace `BillingService`. Trabajo enorme con beneficio escaso. Rompe la coherencia con ADR-018 (catálogo dinámico).

---

## Decisión

**Opción 2 — UX dedicada con schema reutilizado.** El schema actual ([ADR-034](./adr-034-support-inside-modelo.md)) **NO se modifica**. La diferencia está en la presentación.

### Schema (sin cambios)

- **Producto Support Inside** sigue siendo fila en `products` con:
  - `type='support_inside'`
  - `is_global_addon=true`
  - `requires_existing_product=true`
  - `is_active=true`
- **Configuración del plan** sigue en `support_inside_config` (1:1 con el producto).
- **Suscripción del cliente** sigue en `support_inside_subscriptions` + slots en `support_inside_slots`.
- **Facturación** sigue por `BillingService` estándar (factura recurrente).
- **Comisión partner** sigue por `partner_commission_pct` del producto.

### UX para el cliente

#### Página dedicada `/dashboard/support-inside`

- **Si el cliente NO tiene Support Inside activo:**
  - Muestra los 3 planes (Básico / Medium / Pro) **lado a lado** con sus features comparadas (canales, slots incluidos, soporte reactivo).
  - CTA "Activar [Plan]" → flujo de checkout reusando `BillingService.checkout()`.
  - **NO aparece en `/dashboard/catalog`** (catálogo de productos técnicos).
- **Si el cliente TIENE Support Inside activo:**
  - Muestra plan actual + canales activos + slots con servicios asignados + historial de valor (consultas resueltas, mantenimientos realizados).
  - Botón "Mejorar a [Plan superior]" → cambio de plan (prorrateo via [ADR-029](./adr-029-prorrateo-cambio-plan.md)).
  - Botón "Añadir slot" si el plan permite slots adicionales.
  - Botón "Cancelar Support Inside" → cancelación cascada de slots ([ADR-034](./adr-034-support-inside-modelo.md) §reglas).

#### En el catálogo público (`/dashboard/catalog` o landing)

- Support Inside **no aparece como producto contratable** en la lista plana.
- Si aparece, es como **banner/CTA** dirigiendo a la página dedicada (ej: "¿Quieres que cuidemos tu hosting? → Conoce Support Inside").

### UX para el admin

#### Página dedicada `/admin/support-inside-plans`

- Listado de los 3 planes (Básico / Medium / Pro) con:
  - Nombre, precio mensual/anual, canales activos, slots incluidos, descripción visible al cliente.
  - Botones "Editar plan", "Activar/desactivar plan".
- Editor de plan con campos de `support_inside_config` (response_sla, slot_type_available, slot_price_*).
- **NO aparece en `/admin/products`** (CRUD genérico de productos técnicos) — o aparece marcado claramente como "Tier de cuenta" con link a la página dedicada.

#### Settings globales (`/admin/settings/support-inside`)

- Threshold de tarea crítica (`support.maintenance_critical_threshold_days`).
- Configuración de horario de soporte (Sprint 7.6 ops).
- Plantillas de respuesta automática para fuera de horario.

### Implementación

Esta decisión **se materializa en Sprint 8 Fase D** ([Sprint 8](../60-roadmap/current.md)) que ya implementaba Support Inside. La diferencia con ADR-034 es solo la organización de las páginas y rutas:

- Sprint 8.4 (schema + service) → sin cambios respecto a ADR-034.
- Sprint 8.5 (página cliente) → **se llama `/dashboard/support-inside`** y vive en `frontend/app/dashboard/support-inside/page.tsx`, NO mezclada con el catálogo.
- **Sprint 8.4b (NUEVO)** — admin `/admin/support-inside-plans` (página dedicada en lugar de aparecer en CRUD genérico de productos).

---

## Consecuencias

- ✅ **Ganamos:**
  - **Modelo mental claro** para cliente y admin: Support Inside es "tier de cuenta", no "otro producto".
  - **Cero refactor de schema o billing** — toda la maquinaria existente se reutiliza.
  - **Coherencia con [ADR-018](./adr-018-catalogo-dinamico-productos.md)** (catálogo dinámico) preservada — Support Inside sigue siendo producto del catálogo a nivel de datos.
  - **Comisión partner ([ADR-051](./adr-051-partner-comisiones-liquidaciones.md)) sigue funcionando** sin cambios — `partner_commission_pct` aplica igual.
  - **UX dedicada permite features futuras** (comparador visual de planes, historial de valor enriquecido) sin contaminar la página de productos genérica.
- ⚠️ **Aceptamos:**
  - **Más rutas de frontend** (3 páginas dedicadas: cliente, admin planes, admin settings). Aceptable: cada una tiene UX claramente distinta.
  - **El admin necesita saber dónde está cada cosa** — si edita el precio del plan Pro, va a `/admin/support-inside-plans/pro`, no a `/admin/products`. Mitigación: si llega a `/admin/products` y ve el producto support_inside, hay redirect/link a la página dedicada.
  - **Riesgo de divergencia futura** entre el CRUD genérico de productos y el editor dedicado de planes — si el admin quiere bulk-edit (cambiar precio de varios planes), tendría que ir uno por uno. Mitigación: aceptable, no es flujo frecuente.
- 🚪 **Cierra:**
  - **No incluir Support Inside en el catálogo público** de productos técnicos.
  - **No mezclar la edición de Support Inside** con el CRUD genérico de productos.
  - **No refactorizar el schema** — ADR-034 sigue vigente.

---

## Cuándo revisar

- **Tras los primeros 5-10 clientes con Support Inside:** validar que la UX dedicada funciona y los clientes entienden "tier de cuenta".
- **Si surge demanda de empaquetado** (ej: "Hosting Web Pro + Support Inside Pro" como bundle único) → diseñar lógica de bundles, posiblemente otro ADR.
- **Si el admin pide poder gestionar Support Inside igual que otros productos** → reconsiderar (probablemente mantener UX dedicada, pero permitir fallback al CRUD genérico).

---

## Referencias

- **Refina:** [ADR-034](./adr-034-support-inside-modelo.md) (modelo Support Inside — sigue vigente, este ADR solo cambia presentación).
- **Módulos afectados:** support (UX dedicada), products (excluye support_inside del catálogo público), billing (sin cambios — reutiliza checkout/cancelación).
- **ADRs relacionados:** [ADR-018](./adr-018-catalogo-dinamico-productos.md) (catálogo dinámico), [ADR-019](./adr-019-configuracion-tipos-producto.md) (configuración tipos producto), [ADR-029](./adr-029-prorrateo-cambio-plan.md) (prorrateo cambio plan), [ADR-051](./adr-051-partner-comisiones-liquidaciones.md) (comisión partner).
- **Glosario:** [Support Inside](../00-foundations/glossary.md), [Tier de cuenta](../00-foundations/glossary.md), [Slot](../00-foundations/glossary.md).
- **Sprint que lo implementa:** Sprint 8 Fase D (con paso 8.4b nuevo añadido por este ADR).

---

## Notas de revisión

> **2026-04-26:** ADR creado tras crítica arquitectónica de Yasmin durante la auditoría 2026-04-26. La decisión refina (no reemplaza) [ADR-034](./adr-034-support-inside-modelo.md) — el schema sigue igual, solo la presentación de la UI cambia.
