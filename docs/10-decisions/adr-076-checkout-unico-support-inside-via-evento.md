# ADR-076 — Checkout único por dominio billing: Support Inside como consumidor de eventos `service.*`

> **Status:** Active (refina [ADR-061](./adr-061-support-inside-tier-cuenta-ux.md), no toca [ADR-034](./adr-034-support-inside-modelo.md))
> **Date:** 2026-05-01
> **Domain:** billing, support-inside
> **Sprint:** Sprint 8 Fase D.12

---

## Contexto

[ADR-061](./adr-061-support-inside-tier-cuenta-ux.md) (2026-04-26) decidió que Support Inside reutiliza el motor de billing canónico (`BillingCheckoutService.checkout()`). Sprint 8 Fase D backend (2026-05-01) lo implementó: `SupportInsideService.subscribe()` invoca internamente `BillingCheckoutService.checkout()` y luego crea la `SupportInsideSubscription` apuntando al `service_id` resultante.

A nivel de **motor de cobro** la decisión funciona. Pero Sprint 8 Fase D **frontend** (2026-05-01) materializó el `subscribe` cliente como **modal in-page** dentro de `/dashboard/support-inside`, NO como navegación a la página canónica de checkout `/dashboard/billing/checkout`. Esto introduce dos puntos de entrada visibles para el cliente:

1. `/dashboard/billing/checkout` para hosting / dominio / Docker / Cloud Office (cualquier producto técnico).
2. Modal dentro de `/dashboard/support-inside` para Support Inside.

Ambos llaman al mismo backend `BillingCheckoutService.checkout()`, pero la asimetría tiene consecuencias visibles:

- **Selector de `billing_profile_id`**: la página `/dashboard/billing/checkout` permite al cliente elegir entre sus perfiles fiscales. El modal del comparador SI no — asume el default. Cliente con dos NIFs (autónomo + sociedad) NO puede facturar Support Inside Pro a la sociedad sin pasar por backend support manualmente.
- **Stripe / Redsys post-Sprint 14**: cuando se integre la pasarela real, el flujo 3D Secure (3DS2 redirect, SCA challenge, fallback a iDEAL/SEPA, etc.) NO encaja en un modal — necesita página completa con contexto de retorno y manejo de errores. Si mantenemos dos UX, hay que integrar Stripe en dos sitios. **Duplicación garantizada**.
- **Auditoría / analítica**: cada sitio reporta sus propios eventos a Plausible/PostHog. Funnel de conversión "comparador → confirmación → factura pagada" se fragmenta en dos rutas distintas.
- **Mantenibilidad**: cualquier cambio futuro en el flujo checkout (cupón de descuento, prorrateo en upgrade, validación de billing_profile activo, opt-in legal) hay que aplicarlo en dos sitios.

> **¿Qué pasaría si NO tomáramos esta decisión?** El día que entre Stripe, alguien hará un PR copiando la integración del modal SI al checkout principal (o viceversa) con un `// TODO: unificar después`. Ese TODO se queda 6 meses y la primera factura fallida en producción aparecerá por una validación que solo se aplicó en uno de los dos lados.

---

## Opciones consideradas

### Opción A — (descartada) Mantener modal SI + checkout principal

- **Pros**: cero refactor inmediato, modal ya implementado en 8.D.5.
- **Contras**: todo lo del contexto. Asimetría perdurable.

### Opción B — (descartada) Migrar todo a modal in-page

- Hacer que `/dashboard/billing/checkout` también sea modal cuando se llegue desde una card de producto.
- **Pros**: UX in-page consistente.
- **Contras**: incompatible con Stripe 3DS, con prorrateo (necesita preview con desglose), con cupones (input + validación). El modal sería tan complejo que dejaría de ser modal.

### Opción C — (elegida) Eliminar modal SI, todos los flujos pasan por `/dashboard/billing/checkout`

- El comparador SI redirige a `/dashboard/billing/checkout?product_pricing_id={pricingId}` cuando el cliente click "Suscribirme".
- `/dashboard/billing/checkout` ya soporta el query param (es lo que usa cualquier card del catálogo).
- Backend: cuando `BillingCheckoutService.checkout()` resuelve un producto `type='support_inside'`, emite evento `service.provisioned` (ya existe en el catálogo de eventos como hook aspiracional). Listener nuevo `support-inside-on-service-provisioned.listener.ts` consume ese evento y crea/reactiva la `SupportInsideSubscription` apuntando al `service.id` recién creado.
- Endpoint `POST /dashboard/support-inside/subscribe` queda como **API alternativa interna** (no expuesta en frontend) para tests E2E + scripts de seed. Documentado como tal en `support-inside/contract.md`.

---

## Decisión

**Opción C — un único motor de checkout cliente: `/dashboard/billing/checkout`. Support Inside es consumidor de eventos `service.provisioned`, no caso especial UX.**

### Frontend

1. `/dashboard/support-inside` (cliente comparador):
   - Click "Suscribirme" en una card → `router.push('/dashboard/billing/checkout?product_pricing_id=' + plan.pricing[cycle].product_pricing_id)`.
   - Modal de confirmación + `subscribe()` directo eliminados.
   - Vista de gestión (cliente con SI activo) sigue igual: gestiona slots + cancela.

2. `/dashboard/billing/checkout`:
   - Acepta `product_pricing_id` por query string.
   - Detecta el `product.type` de la respuesta `productsApi.get()`.
   - Si `type='support_inside'`, ajusta el copy ("Activar Support Inside {Plan}") + tras éxito redirige a `/dashboard/support-inside` (vista de gestión) en lugar de `/dashboard/billing` (default productos técnicos).

### Backend

1. `BillingCheckoutService.checkout()`:
   - Tras crear `Service + Invoice` en transacción, **emite evento `service.provisioned`** con payload `{ service_id, user_id, product_id, product_type, product_pricing_id, invoice_id }`.
   - El emit va dentro de la transacción (R8 Outbox cuando se extienda en P-DEPLOY.4).

2. **Nuevo listener `support-inside-on-service-provisioned.listener.ts`**:
   - `@OnEvent('service.provisioned')`.
   - Filtra: `if (payload.product_type !== 'support_inside') return;` (defense in depth — el listener convive con futuros listeners de hosting/Docker/etc).
   - Si existe `SupportInsideSubscription` cancelada del mismo `client_id` → reactivar (update status='active', service_id=payload.service_id, started_at=now, cancelled_at=null).
   - Si no existe → create.
   - Emit `support_inside.subscribed` (evento existente, sin cambios).

3. **`SupportInsideService.subscribe()` legacy**:
   - Queda como método interno usado por scripts/tests/seed.
   - El controller `/dashboard/support-inside/subscribe` se documenta en Swagger como "API interna — la UX cliente usa /dashboard/billing/checkout".
   - Tests E2E existentes siguen funcionando porque el endpoint sigue activo.

### CASL / autorización

- `Read.Product` (cliente lo tiene) sigue cubriendo lectura del catálogo Support Inside vía `/products?type=support_inside`. **No** se cambia.
- `Update.SupportInside` (cliente lo tiene) sigue cubriendo el endpoint `subscribe` interno + cancel + addSlot + releaseSlot.
- El listener de `service.provisioned` corre con permisos del sistema (no aplica CASL — es lógica server-side post-billing).

---

## Consecuencias

- ✅ **Ganamos:**
  - **Un solo motor de checkout** para integrar Stripe/Redsys post-Sprint 14. Cero duplicación.
  - **Selector `billing_profile_id`** disponible para Support Inside (cliente con varios NIFs puede elegir).
  - **Funnel de analítica unificado**: comparador → checkout → factura, una sola ruta.
  - **R1 (módulos por eventos)** cumplido por construcción: Support Inside escucha el bus, no acopla con billing.
  - **Coherencia futura**: el día que llegue prorrateo upgrade (DC.18 / ADR-077), la lógica vive en `BillingCheckoutService`; SI la consume gratis vía evento.
- ⚠️ **Aceptamos:**
  - **Más navegaciones** para el cliente: comparador → checkout → vuelta a gestión (3 páginas vs 1 modal). Mitigación: cada paso tiene contexto claro y el flujo coincide con cómo se contrata cualquier otro producto del dashboard.
  - **Listener nuevo a mantener**. Incidencias futuras (race conditions con `support_inside.slot_assigned` previo, etc.) hay que cubrirlas con tests. Mitigación: 8.D.12.11 incluye tests del listener.
  - **Endpoint `/dashboard/support-inside/subscribe` queda no-expuesto en UX** pero accesible por API. Si alguien lo llama directo se salta el flujo de pago real (cuando llegue Stripe). Mitigación: cuando se integre Stripe, el endpoint pasa a requerir un `internal_token` de servicio (mismo patrón `X-Aelium-Source` de ADR-075).
- 🚪 **Cierra:**
  - **No volver a tener flujos de checkout duplicados** por dominio funcional.
  - **No integrar pasarela de pago en dos sitios**.
  - **No modal de checkout** — los modales son para confirmaciones, no para flujos de pago con SCA.

---

## Cuándo revisar

- **Si Stripe Subscriptions Manager lo requiere de otro modo**: cuando se integre Stripe Subscriptions API (auto-billing recurrente), revisar si la lógica del listener compite con el webhook de Stripe `customer.subscription.created`. Probablemente se mantenga el listener para subscriptions internas y se delegue a Stripe para el ciclo de facturación recurrente.
- **Si el comparador SI necesita ser modal por motivos de UX A/B test**: descartado — confluir UX vence sobre micro-optimización.
- **Si entran bundles producto+SI** (DC.23): los bundles podrían entrar como un solo `product_pricing_id` con post-procesamiento (crear N services), y el listener seguiría funcionando porque cada service del bundle emite su propio `service.provisioned`.

---

## Referencias

- **Refina:** [ADR-061](./adr-061-support-inside-tier-cuenta-ux.md) (UX dedicada — sigue vigente, este ADR concreta cómo se materializa el subscribe).
- **No toca:** [ADR-034](./adr-034-support-inside-modelo.md) (modelo de datos sin cambios).
- **Eventos:**
  - `service.provisioned` (existente como hook aspiracional, ahora con productor real `BillingCheckoutService.checkout()` y consumidor `support-inside-on-service-provisioned.listener.ts`).
  - `support_inside.subscribed` (ya existía, ahora emitido desde el listener en lugar de desde `subscribe()` directo).
- **Reglas relacionadas:**
  - [R1](../00-foundations/rules.md) — módulos por eventos.
  - [R5](../00-foundations/rules.md) — cálculos en backend (preview de prorrateo en `/dashboard/billing/checkout`).
  - [R8](../00-foundations/rules.md) — Outbox para `service.*` cuando se cierre P-DEPLOY.4.
- **ADRs relacionados:**
  - [ADR-061](./adr-061-support-inside-tier-cuenta-ux.md) — refinado.
  - [ADR-034](./adr-034-support-inside-modelo.md) — modelo de datos sin cambios.
  - [ADR-075](./adr-075-support-inside-ux-lista-y-aislamiento-productos.md) — patrón comparable de header interno (`X-Aelium-Source`) que se aplicará al endpoint `subscribe` cuando se internalice.
  - [ADR-070](./adr-070-service-info-sso-acciones-curadas.md) — interfaz `ProvisionerPlugin.getServiceInfo()` consume el mismo evento `service.provisioned`.
- **Glosario:** *Checkout*, *Service provisioned*, *Listener canónico*.
- **Sprint que lo implementa:** Sprint 8 Fase D.12 (sub-pasos 8.D.12.9 + 8.D.12.10).

---

## Notas de revisión

> **2026-05-01:** ADR creado durante la planificación de Sprint 8 Fase D.12 (visibilidad transversal). Yasmin detectó la asimetría entre el modal SI y `/dashboard/billing/checkout` y planteó: "no deberíamos usar el flujo de billing? que es donde integraremos la pasarela de pago? si no, tendríamos que integrar la pasarela de pago en dos sitios diferentes". La pregunta es correcta. Este ADR formaliza el cambio para evitar el `// TODO: unificar después` que generaría dos integraciones Stripe en producción.
