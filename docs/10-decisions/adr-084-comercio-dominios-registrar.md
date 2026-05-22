# ADR-084 — Comercio de dominios: modelo TLD pricing, checkout multi-ítem, invariantes de robustez DOM-INV y FSM de transferencia

> **Status:** Active (transversal — consumido por [ADR-081](./adr-081-plugin-resellerclub-specifics.md) ResellerClub y por cualquier registrar futuro; extiende [ADR-018](./adr-018-catalogo-dinamico-productos.md) catálogo y [ADR-032](./adr-032-flujo-compra-checkout.md) checkout)
> **Date:** 2026-05-21
> **Domain:** products, billing, provisioning, cross-cutting
> **Sprint:** Sprint 15D Fase 15D.A (congelación doctrinal antes del primer commit de la fundación de comercio de dominios)

---

## Contexto

[ADR-018](./adr-018-catalogo-dinamico-productos.md) congeló el catálogo dinámico (un `Product` por SKU, pricing en `ProductPricing` por `(producto, ciclo, moneda)`). [ADR-032](./adr-032-flujo-compra-checkout.md) congeló el flujo de compra. [ADR-077](./adr-077-contrato-provisioner-plugin-v2.md) (Amendment A10) acaba de definir el **contrato del registrar** (capability `is_domain_registrar`, operaciones, códigos de error de dominio). [ADR-082](./adr-082-modelo-domain-hosting-dns-doctrine.md) (Amendment A2) añadió el flujo F5 "solo dominio", la zona post-register y el lifecycle de expiración.

Sprint 15D introduce el **comercio de dominios** como primer caso real. Al cotejar el dossier 15D contra el código actual (sesión 2026-05-21) emergieron cuatro diferencias estructurales entre **vender dominios** y **vender hosting**, ninguna cubierta por el modelo actual:

1. **Pricing.** El hosting tiene un precio por `(producto, ciclo, moneda)`. Un dominio tiene precio por **TLD × operación (register/renew/transfer/restore) × años**: un `.com` cuesta ~10 €/año, un `.io` ~40 €, un `.ai` ~70 €, y *register ≠ renew ≠ restore*. El esquema actual (`ProductPricing` con `UNIQUE [product_id, billing_cycle, currency]`) no tiene granularidad por TLD. El dossier 15D proponía "un precio único + markup global 25 %" — **incorrecto** en cuanto se vende más de un TLD. La industria entera (WHMCS Domain Pricing, Blesta, HostBill desde 2007) usa una tabla de TLD pricing.

2. **Checkout.** El estándar (60-70 % de las ventas según [ADR-082 §2](./adr-082-modelo-domain-hosting-dns-doctrine.md)) es comprar **dominio + hosting en un solo carrito** (flujo F1). El `BillingCheckoutService` actual crea **1 service + 1 línea** por llamada — no soporta F1/F4.

3. **Robustez transaccional.** Registrar un dominio es una operación con **dinero real**, **irreversible** (no hay "des-registrar" sin coste), **concurrente** (dos clientes pueden pedir el mismo nombre) y **regulada** (requisitos por TLD). El framework de provisioning (Outbox + BullMQ + circuit breaker + `provision()` idempotente por `provider_reference`) cubre la resiliencia genérica, pero **no** las garantías específicas del registro: exactly-once a prueba de crash, lock por nombre, guardia de margen, renovación verificada, elegibilidad pre-cobro.

4. **Transferencias.** El transfer-in es **asíncrono** (5-7 días), con estados intermedios y EPP auth code — necesita una máquina de estados explícita, no un `provision()` síncrono.

> **¿Qué pasaría si NO tomáramos esta decisión?** El plugin ResellerClub resolvería cada punto ad-hoc: pricing como JSON enterrado en `products.config`, checkout duplicado para el caso dominio+hosting, registro sin protección de concurrencia ni de margen (vendiendo a pérdida o doble-cobrando ante un crash), transfer modelado como un `provision()` que "tarda". Cuando llegue el segundo registrar (Hexonet/OpenSRS), redescubriría todo. Es el mismo antipatrón "interface emerges from implementation" que [ADR-077](./adr-077-contrato-provisioner-plugin-v2.md) y [ADR-082](./adr-082-modelo-domain-hosting-dns-doctrine.md) evitan — pero a nivel del **modelo de comercio**, transversal a todos los registrars.

ADR-077 A10 cerró el **contrato del plugin** registrar. Falta cerrar la **fundación de comercio** que ese plugin consume: cómo se modela el precio, cómo se compra, qué garantías se exigen y cómo se transfiere. Esta doctrina es transversal — RC es la primera implementación, no la dueña.

---

## Opciones consideradas

### Modelo de pricing de dominios

1. **Mantener `ProductPricing` + markup global** (lo que proponía el dossier 15D).
   - Pros: cero schema nuevo.
   - Contras: un único precio por producto no representa TLDs heterogéneos ni operaciones distintas → precios incorrectos. No es el patrón de la industria.
2. **JSON de pricing en `products.config`** del producto domain.
   - Pros: sin migración.
   - Contras: malo para queries/reporting, obliga a parsear JSON en cada cálculo del checkout, frágil.
3. **(elegida) Tabla dedicada `domain_tld_pricing`** (TLD × operación × años, coste + markup → precio).
   - Pros: el patrón WHMCS/Blesta. Queryable, sincronizable por cron, sobreescribible por admin, heredable a cualquier registrar.
   - Contras: migración + lógica de resolución de precio en checkout. Inversión que paga desde el segundo TLD.

### Checkout

1. **Compras separadas** (cliente compra dominio y luego hosting).
   - Pros: reusa el checkout 1-ítem actual.
   - Contras: UX rota para el flujo dominante (F1).
2. **(elegida) Checkout multi-ítem** (N ítems → N services + 1 factura).
   - Pros: UX estándar; soporta F1/F4/F5 y mantiene F2/F3. Renewal cycles independientes desde día 1 (DH-INV-5).
   - Contras: refactor de `BillingCheckoutService`.

### Garantías de robustez

1. **Buenas prácticas no vinculantes** (confiar en idempotencia genérica).
   - Contras: deja ventanas de doble-cobro/pérdida ante crash o concurrencia. No es grado producción para dinero real.
2. **(elegida) Invariantes vinculantes (DOM-INV), implementación faseada.**
   - Las cinco DOM-INV se congelan como doctrina vinculante ahora; las críticas (exactly-once + lock) se implementan en v1; guardia de margen + renovación verificada se difieren a v1.1 (Sprint 15D.II) con deuda consciente. El contrato nace preparado.

---

## Decisión

Se congela la **fundación de comercio de dominios** en cuatro piezas. Es doctrina vinculante para todo plugin de registrar (RC primero; Hexonet/OpenSRS/Namecheap futuros).

### 1. Modelo de pricing por TLD — tabla `domain_tld_pricing`

```prisma
enum DomainPriceOperation {
  register
  renew
  transfer
  restore        // rescate desde RGP/redemption (fee alto)
}

enum DomainPriceSource {
  sync           // poblado por el cron desde el registrar (getTldPricing)
  manual         // override del admin
}

model DomainTldPricing {
  id              String               @id @default(uuid()) @db.Uuid
  registrar_slug  String               @db.VarChar(50)   // qué plugin provee este TLD ('resellerclub')
  tld             String               @db.VarChar(63)   // lowercase, SIN punto ('com', 'es', 'eu')
  operation       DomainPriceOperation
  years           Int                                    // 1..10
  cost_amount     Decimal              @db.Decimal(12, 2) // coste mayorista del registrar (guardia de margen)
  cost_currency   String               @db.VarChar(3)
  price_amount    Decimal              @db.Decimal(12, 2) // precio de venta al cliente
  price_currency  String               @db.VarChar(3)
  markup_percent  Decimal?             @db.Decimal(5, 2)  // null si price es override manual
  source          DomainPriceSource    @default(sync)
  active          Boolean              @default(true)
  synced_at       DateTime?
  created_at      DateTime             @default(now())
  updated_at      DateTime             @updatedAt

  @@unique([registrar_slug, tld, operation, years, price_currency])
  @@index([tld, operation, active])
  @@map("domain_tld_pricing")
}
```

**Doctrina:**
- El `Product` de `type='domain'` ([ADR-018](./adr-018-catalogo-dinamico-productos.md)) define el **registrar** (`product.provisioner`) y el catálogo de TLDs ofrecidos (setting `plugin.<registrar>.tlds_offered[]`). El **precio** NO sale de `ProductPricing` (que sigue para hosting), sino de `domain_tld_pricing` resuelto en runtime por `(registrar_slug, tld, operation, years, currency)`. R5 intacto: el precio se calcula **siempre en backend**, nunca en el frontend.
- El cron `sync-<registrar>-pricing` (diario) llama `plugin.getTldPricing()` (coste mayorista, [ADR-077 A10](./adr-077-contrato-provisioner-plugin-v2.md)), aplica `markup_percent` (setting `plugin.<registrar>.markup_percent`, default 25 %) y hace **upsert** de las filas `source='sync'`. Las filas `source='manual'` (override del admin) **no se sobreescriben**.
- Premium domains: fuera de la tabla (precio dinámico). v1 los **bloquea** (`DOMAIN_PREMIUM`, [ADR-077 A10](./adr-077-contrato-provisioner-plugin-v2.md)); venta en v1.1.

### 2. Checkout multi-ítem

`BillingCheckoutService.checkout()` pasa de 1 ítem a **N ítems** discriminados por tipo:

```typescript
type CheckoutItem =
  | { kind: 'product'; productPricingId: string; domain?: string }          // hosting/otros (F2/F3 actuales)
  | { kind: 'domain'; productId: string; domainName: string;               // dominio (F1/F4/F5)
      operation: 'register' | 'transfer_in'; years: number };

// checkout(userId, { items: CheckoutItem[]; billingProfileId?: string })
//   → crea N services (status='pending') + 1 invoice con N líneas (createInvoice ya acepta items[])
//   → cada service con su next_due_date independiente (DH-INV-5)
//   → al pagar (invoice.paid), el orquestador procesa cada service por separado (su plugin)
```

- Ítem `domain`: el precio se resuelve vía `domain_tld_pricing` (operación + TLD del `domainName` + años). El service se crea con `domain=domainName`, `provisioner_slug` del producto, y `ProvisionContext.operation` derivado ([ADR-077 A10](./adr-077-contrato-provisioner-plugin-v2.md)).
- Cubre **F1** (1 domain + 1 product), **F4** (transfer_in + product), **F5** (1 domain solo); mantiene **F2/F3** (1 product con `domain` existente/externo). Flujos en [ADR-082 §2 + A2](./adr-082-modelo-domain-hosting-dns-doctrine.md).
- Compatibilidad: el checkout 1-ítem actual es el caso `items.length === 1`. El refactor preserva el comportamiento existente.

### 3. Invariantes de robustez del dominio (DOM-INV-1..5)

Vinculantes para todo registrar. Verificadas por test de contrato donde aplique.

| # | Invariante | Riesgo que cubre | Implementación |
|---|---|---|---|
| **DOM-INV-1** | **Exactly-once por nombre.** Antes de `register`, pre-flight `checkDomainAvailability(fqdn)`; si el registrar lo reporta ya registrado **bajo nuestra cuenta** (reintento tras crash que no persistió `provider_reference`), se **adopta** el registro existente como éxito (recovery por FQDN), NO se re-registra. | Doble cobro al registrar / registro duplicado ante crash entre el `register` y la persistencia. | **v1 (15D core)** |
| **DOM-INV-2** | **Lock de concurrencia por FQDN.** Advisory lock (`pg_advisory_xact_lock` sobre hash del FQDN normalizado) durante orden+provision del dominio. | Dos checkouts simultáneos del mismo nombre → doble intento de registro. | **v1 (15D core)** |
| **DOM-INV-3** | **Guardia de margen.** Snapshot de `cost` y `price` en la orden; si `cost > price` (pricing dessincronizado) → bloquear el checkout + alertar superadmin (`system.error`). | Vender a pérdida por pricing cacheado obsoleto. | Doctrina ahora; **impl v1.1 (15D.II)** — DC.NEW |
| **DOM-INV-4** | **Renovación verificada.** Tras `renew`, confirmar contra el registrar que `expires_at` avanzó al período esperado antes de marcar la renovación como exitosa. | `renew` "exitoso" que no extendió → cliente pierde el dominio creyéndolo renovado. | Doctrina ahora; **impl v1.1 (15D.II)** — DC.NEW |
| **DOM-INV-5** | **Elegibilidad pre-checkout.** Validar los requisitos del TLD (`.es`→NIF/NIE, `.eu`→residencia UE, ...) **antes de cobrar** (`REGISTRANT_INELIGIBLE` si falla). | Registro que falla o se suspende **después** del cobro. | **v1 (15D core)** para los TLDs regulados que se vendan (`.es`, `.eu`) |

`provision()` con `operation='register'` es idempotente por `provider_reference` (reintento puro: no recrea) **y** por nombre (DOM-INV-1); `operation='renew'` es idempotente **por período** (no renueva dos veces el mismo año) y verificado (DOM-INV-4). El orquestador fija `operation` según el origen ([ADR-077 A10](./adr-077-contrato-provisioner-plugin-v2.md)).

### 4. FSM de transfer-in (doctrina ahora, implementación Sprint 15D.II)

El transfer-in es asíncrono. Se modela como máquina de estados explícita en `services.metadata.transfer_state`, actualizada por el reconcile cron (el registrar es la fuente de verdad — DH-INV-6):

```
pending  →  awaiting_auth  →  submitted  →  ┬─ ack  → completed
   │             │                          └─ nack → failed
   └─────────────┴── cancelled (admin / timeout)
```

- `pending`: orden pagada, transfer aún no iniciado en el registrar.
- `awaiting_auth`: falta EPP auth code válido del cliente (`INVALID_AUTH_CODE` si erróneo).
- `submitted`: transfer enviado al registrar; esperando aprobación (5-7 días).
- `completed`: el dominio pasa a estado `active` normal; se emite `domain.transfer_completed` → la zona DNS se crea/migra ([ADR-082 A2.2](./adr-082-modelo-domain-hosting-dns-doctrine.md)).
- `failed` (`TRANSFER_REJECTED`) / `cancelled`: notificación + opción de reintento.

La **doctrina** (estados, transiciones, eventos, códigos de error) se congela ahora; la **implementación** vive en Sprint 15D.II.

### 5. Catálogo de eventos `domain.*` (vía Outbox)

Eventos canónicos del dominio del comercio, emitidos transaccionalmente vía Outbox ([ADR-033](./adr-033-outbox-pattern-pendiente.md)/[ADR-064](./adr-064-outbox-dispatcher-bullmq.md), R8) y consumidos por notifications + audit + reconcile:

| Evento | Emisor | Consumidores |
|---|---|---|
| `domain.registered` | orquestador tras `register` OK | notifs (confirmación), audit, zona DNS ([ADR-082 A2.2](./adr-082-modelo-domain-hosting-dns-doctrine.md)) |
| `domain.renewed` | orquestador tras `renew` verificado | notifs, audit |
| `domain.transfer_initiated` / `domain.transfer_completed` / `domain.transfer_failed` | FSM transfer (15D.II) | notifs, audit, zona DNS |
| `domain.expiring_soon` (payload `{ daysLeft }`) | cron de avisos (lee `expires_at`) | notifs (email 30/14/7/1 días) |
| `domain.expired` / `domain.entered_redemption` | reconcile cron | notifs, audit |
| `domain.nameservers_changed` / `domain.contacts_changed` / `domain.privacy_changed` / `domain.lock_changed` | `executeAction` (inline gestión) | audit; notifs si aplica |

Se registran en `docs/20-modules/provisioning/_events.md` (o el `_events.md` del módulo dueño) antes de emitirse (regla del playbook). Auto-renew con **cobro automático** se difiere por dependencia de método de pago guardado (Stripe, P3); en v1 la renovación es factura + avisos.

---

## Consecuencias

- ✅ **Ganamos:**
  - **Pricing correcto por TLD** desde el primer TLD — sin la deuda silenciosa del "markup global".
  - **Checkout estándar** (dominio + hosting en un carrito) — el flujo F1 dominante funciona.
  - **Garantías de grado producción** sobre operaciones con dinero real e irreversibles (DOM-INV) — el sistema no doble-cobra ni pierde dominios ante crash/concurrencia.
  - **Fundación heredable**: cualquier registrar futuro reusa tabla, checkout, DOM-INV y FSM — cero reescritura.
  - **Doctrina completa, implementación faseada**: el modelo nace preparado; lo no-crítico (margin guard, renovación verificada, transfers, premium) se implementa por madurez sin refactor.
- ⚠️ **Aceptamos:**
  - **Migración nueva** (`domain_tld_pricing` + `services.expires_at` de [ADR-082 A2](./adr-082-modelo-domain-hosting-dns-doctrine.md)) y **refactor del checkout** — el grueso del trabajo de la Fase B del sprint.
  - **DOM-INV-3/4 quedan como doctrina sin implementar en v1** — riesgo residual de margen negativo / renovación no verificada hasta v1.1. Mitigación: el pricing lo sincroniza un cron diario (margen raramente se invierte) y la renovación v1 es manual con factura visible.
- 🚪 **Cierra:**
  - **No "markup global" sobre un precio único de dominio** — el pricing es por TLD × operación × años (tabla).
  - **No registro sin pre-flight ni lock** — DOM-INV-1/2 son vinculantes.
  - **No checkout que calcule precio de dominio en el frontend** — R5; el precio se resuelve server-side desde `domain_tld_pricing`.
  - **No transfer modelado como `provision()` síncrono** — tiene FSM propia.
  - **No `if (registrar === 'X')` en checkout, buscador ni sync** — todo pasa por el contrato de registrar ([ADR-077 A10](./adr-077-contrato-provisioner-plugin-v2.md)) y esta fundación.

---

## Cuándo revisar

- **Si se decide vender premium domains**: hoy se bloquean (`DOMAIN_PREMIUM`). Vender requiere flujo de precio dinámico fuera de `domain_tld_pricing` (precio confirmado en checkout) — amendment a §1.
- **Si llega el cobro automático real** (Stripe, P3): el "auto-renew" pasa de factura+avisos a cobro con método guardado — revisar §5 y el ciclo de renovación.
- **Si un registrar factura en moneda distinta a la de venta**: hoy `cost_currency` y `price_currency` son independientes pero no se modela conversión FX automática — añadir tasa/markup FX si el caso aparece.
- **Si el volumen de TLDs/operaciones/años hace pesada la tabla** (miles de filas): hoy es trivial (decenas de TLDs × 4 ops × 10 años). Si crece, considerar pricing por fórmula.
- **Si un segundo registrar comparte TLDs con RC** (mismo `.com` desde dos proveedores): la `@@unique` incluye `registrar_slug`, así que coexisten; falta doctrina de "qué registrar gana" en el catálogo — amendment cuando ocurra.

---

## Referencias

- **Módulos afectados:**
  - `billing` — `BillingCheckoutService` (refactor multi-ítem), cron de avisos de expiración.
  - `products` — `Product` de `type='domain'` consume `domain_tld_pricing`; cron `sync-<registrar>-pricing`.
  - `provisioning` — orquestador aplica DOM-INV-1/2, fija `ProvisionContext.operation`, gestiona FSM de transfer; `_events.md` registra `domain.*`.
  - `core/provisioning` — DOM-INV en la capa de orquestador (lock, exactly-once).
- **Reglas relacionadas:**
  - [R5](../00-foundations/rules.md) — el precio se calcula en backend (resolución desde `domain_tld_pricing`), nunca en frontend.
  - [R8](../00-foundations/rules.md) — eventos `domain.*` vía Outbox.
  - [R13](../00-foundations/rules.md) — fallos no desaparecen: registro fallido va a DLQ + alerta; DOM-INV-1 garantiza recuperación.
  - [R3](../00-foundations/rules.md) — cada operación de dominio se audita (wrappers del contrato).
- **ADRs relacionados:**
  - [ADR-018](./adr-018-catalogo-dinamico-productos.md) — catálogo dinámico. Este ADR **especializa** el pricing para `type='domain'` (no usa `ProductPricing`, usa `domain_tld_pricing`).
  - [ADR-020](./adr-020-categorias-extras-producto.md) — `ProductExtra` "dominio gratis primer año" (`eligible_tlds_or_skus`) sigue vigente; el precio del dominio gratis se valida contra `domain_tld_pricing` + `max_value_eur`.
  - [ADR-032](./adr-032-flujo-compra-checkout.md) — flujo de compra. Este ADR **extiende** el checkout a multi-ítem.
  - [ADR-028](./adr-028-suscripciones-ciclo-vida.md) / [ADR-030](./adr-030-periodo-gracia-reintentos.md) — ciclo de vida y dunning; el lifecycle de **expiración del dominio** ([ADR-082 A2.3](./adr-082-modelo-domain-hosting-dns-doctrine.md)) es ortogonal al dunning de impago.
  - [ADR-077 Amendment A10](./adr-077-contrato-provisioner-plugin-v2.md) — contrato del registrar (`is_domain_registrar`, `checkDomainAvailability`, `getTldPricing`, `ProvisionContext.operation`, códigos de error de dominio). Esta fundación lo **consume**.
  - [ADR-082 Amendment A2](./adr-082-modelo-domain-hosting-dns-doctrine.md) — F5, zona post-register, lifecycle de expiración + `services.expires_at`.
  - [ADR-081](./adr-081-plugin-resellerclub-specifics.md) — ResellerClub como primera implementación de esta fundación.
  - [ADR-033](./adr-033-outbox-pattern-pendiente.md) / [ADR-064](./adr-064-outbox-dispatcher-bullmq.md) — Outbox para `domain.*`.
  - [ADR-055](./adr-055-resiliencia-circuit-breaker.md) / [ADR-063](./adr-063-bullmq-canonico-dlq-retries.md) — resiliencia y cola con DLQ.
- **Glosario:** *TLD pricing*, *DOM-INV*, *Registrar*, *Redemption / RGP*, *Checkout multi-ítem*, *Guardia de margen (margin guard)* (a añadir en `glossary.md`).
- **Sprint:** 15D Fase 15D.A (este ADR) → 15D core Fase B (tabla + checkout + DOM-INV-1/2/5) → 15D.II (DOM-INV-3/4 + FSM transfer + premium).
- **Inspiración industrial:** WHMCS Domain Pricing + registrar modules (desde 2007), Blesta domain pricing, HostBill registrar management — convergen en TLD pricing por operación/años + registrar module con set canónico de funciones.
