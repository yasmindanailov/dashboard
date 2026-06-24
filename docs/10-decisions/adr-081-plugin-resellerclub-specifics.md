# ADR-081 — Plugin ResellerClub: specifics de la integración (auth, customer/contact lazy, renewal idempotente, mapping de estado y errores, sandbox, scope v1)

> **Status:** Active (implementación concreta de [ADR-077 A10](./adr-077-contrato-provisioner-plugin-v2.md) contrato de registrar + [ADR-082](./adr-082-modelo-domain-hosting-dns-doctrine.md) Domain↔Hosting + [ADR-084](./adr-084-comercio-dominios-registrar.md) comercio de dominios)
> **Date:** 2026-05-21
> **Domain:** provisioning, plugins, products
> **Sprint:** Sprint 15D Fase 15D.A (congelación de specifics antes del primer commit del plugin)

---

## Contexto

Sprint 15D implementa **ResellerClub** (LogicBoxes API) como primer plugin de registro de dominios. Las decisiones transversales ya están congeladas: el **contrato del registrar** ([ADR-077 Amendment A10](./adr-077-contrato-provisioner-plugin-v2.md)), el **modelo Domain↔Hosting + DNS** ([ADR-082](./adr-082-modelo-domain-hosting-dns-doctrine.md)) y la **fundación de comercio de dominios** ([ADR-084](./adr-084-comercio-dominios-registrar.md)). Este ADR recoge **solo lo específico de ResellerClub** — lo que depende del proveedor y no es heredable tal cual a otros registrars.

El origen es el [dossier de pre-sprint 15D](../60-roadmap/sprint-15d-resellerclub-dossier.md) (sesión 2026-05-07), cuyas 16 decisiones técnicas (§6) se materializan aquí **con las correcciones del cotejo de planificación 2026-05-21** (sesión Yasmin ↔ Claude):

- El *pre-register handshake* `domain.zone_pre_create` (dossier §6.11) se **descarta**: la zona se crea **post-register vía orquestador** ([ADR-082 A2.2](./adr-082-modelo-domain-hosting-dns-doctrine.md), decisión D1).
- El mapping de estado va a `ServiceInfoStatus` (no al enum `ServiceStatus` Prisma, que no tiene `expired`/`failed`).
- Las tablas siguen el patrón heredable de [ADR-083](./adr-083-plugin-enhance-cp-specifics.md) (`enhance_customers` PK natural `user_id`): `resellerclub_customers` PK `user_id` + lazy-create con advisory lock.
- El plugin declara `is_domain_registrar=true` ([ADR-077 A10](./adr-077-contrato-provisioner-plugin-v2.md)).

> **¿Qué pasaría si NO tomáramos esta decisión?** Las particularidades de RC (auth `userid+api-key`, customer/contact lazy con advisory lock, mapeo de su estado multi-eje a `ServiceInfoStatus`, mapeo de sus errores nativos a los códigos canónicos, sandbox OT&E) quedarían como conocimiento implícito en el código del plugin, irreproducible cuando se depure un fallo de registro en producción o cuando un segundo registrar (Hexonet) quiera ver "cómo se resolvió esto en RC". [ADR-083](./adr-083-plugin-enhance-cp-specifics.md) ya estableció que un plugin real merece su ADR de specifics.

---

## Opciones consideradas

La mayoría de alternativas (TLD pricing, checkout, zona DNS, contrato) se resolvieron en los ADRs transversales. Quedan las específicas de RC:

1. **Auth `auth-userid + auth-password`** vs **`auth-userid + api-key`**.
   - Elegida: **api-key** (la password permite operaciones de cuenta más amplias; la api-key es de menor alcance y revocable — principio de mínimo privilegio).
2. **Mapping `Client` ↔ customer RC en `services.metadata`** vs **tabla dedicada**.
   - Elegida: **tabla `resellerclub_customers`** (consultas cross-service, mismo patrón que `enhance_customers` — [ADR-083](./adr-083-plugin-enhance-cp-specifics.md)).
3. **Crear customer/contactos eager (al alta del cliente)** vs **lazy (al primer dominio)**.
   - Elegida: **lazy** con advisory lock (no todos los clientes compran dominios; evita basura en RC).

---

## Decisión

### 1. Identidad y capabilities del plugin

```typescript
slug: 'resellerclub';
contractVersion: 'v2';
capabilities: {
  has_sso_panel: false,            // ADR-070: el cliente NO va al panel RC (puerta unificada)
  has_metrics: false,
  has_metrics_history: false,
  requires_server: false,
  provision_mode: 'sync',
  completes_via_task: false,
  supports_reconciliation: true,   // cron de reconcile (domains/search)
  supports_suspend: true,          // G1/G2 orders suspend/unsuspend (admin)
  has_dns_management: false,       // ADR-082 A1: la autoridad DNS es Enhance, NO RC
  is_domain_registrar: true,       // ADR-077 A10: cumple el sub-contrato de registrar
}
```

`inlineActions` (plano C de [ADR-077 A10](./adr-077-contrato-provisioner-plugin-v2.md)): `modify_nameservers`, `modify_contacts`, `toggle_privacy`, `toggle_registrar_lock`, `get_auth_code` (+ `toggle_auto_renew` recomendada). **Cero slugs DNS** (`view_dns_records`/etc. del mapping §4 original de ADR-077 — superseded por A10: viven en Enhance).

### 2. Autenticación y entornos

- Auth: **`auth-userid` + `api-key`** en cada llamada (decisión §6.4 dossier). Las credenciales viven en el `secrets` schema del manifest ([ADR-080](./adr-080-plugin-framework.md) `SecretVaultService` AES-256-GCM), nunca en `metadata` ni en logs (R12).
- `environment: 'sandbox' | 'production'` en el `configSchema` del manifest. Dev local + CI E2E → **sandbox (OT&E)** de ResellerClub; producción → production. Credenciales independientes por entorno.

### 3. Customer model — tabla `resellerclub_customers` (lazy, advisory lock)

Patrón heredado de [ADR-083 A2](./adr-083-plugin-enhance-cp-specifics.md) (`enhance_customers`):

```prisma
model ResellerclubCustomer {
  user_id                  String   @id @db.Uuid                 // PK natural (1 customer RC por usuario Aelium)
  resellerclub_customer_id String   @unique @db.VarChar(50)
  email                    String   @db.VarChar(320)
  created_at               DateTime @default(now())
  updated_at               DateTime @updatedAt
  @@map("resellerclub_customers")
}
```

- **Lazy create**: la primera vez que un usuario contrata un dominio, el plugin crea el customer en RC (`customers/signup`) con los datos del `Client` y persiste el mapping. Bajo **advisory lock** por `user_id` (patrón [ADR-083](./adr-083-plugin-enhance-cp-specifics.md): evita doble creación en checkouts concurrentes) + **cross-search defensivo** por email (`customers/search`) antes de crear (recupera el customer si ya existe en RC pero falta el mapping local — coherente con DOM-INV-1 a nivel customer).
- `customers/modify` sincroniza datos cuando el `Client` cambia.

### 4. Contact handles — tabla `resellerclub_contact_handles` (4 por usuario, lazy)

```prisma
enum ResellerclubContactType { registrant  admin  tech  billing }

model ResellerclubContactHandle {
  id                      String                  @id @default(uuid()) @db.Uuid
  user_id                 String                  @db.Uuid
  contact_type            ResellerclubContactType
  resellerclub_contact_id String                  @db.VarChar(50)
  created_at              DateTime                @default(now())
  updated_at              DateTime                @updatedAt
  @@unique([user_id, contact_type])
  @@map("resellerclub_contact_handles")
}
```

- 4 handles (registrant/admin/tech/billing) creados lazy al primer dominio (`contacts/add`), **reutilizados** para todos los dominios del cliente. Mismo advisory lock que customer.
- **Extension-specific details** (`contacts/set-details`) para TLDs regulados: `.es` (NIF/NIE), `.eu` (residencia UE), etc. — invocado en el flujo de DOM-INV-5 (elegibilidad pre-checkout, [ADR-084](./adr-084-comercio-dominios-registrar.md)).

### 5. Ciclo de vida — provision idempotente por `operation`

El plugin implementa `provision(ctx)` ramificando por `ctx.operation` ([ADR-077 A10](./adr-077-contrato-provisioner-plugin-v2.md)):

| `operation` | Endpoint RC | Idempotencia |
|---|---|---|
| `register` | `domains/register` (NS = `provisioning.default_nameservers` = `ns1/ns2.aelium.net`) | DOM-INV-1: pre-flight `domains/available`; si ya registrado bajo nuestra cuenta → adoptar (no re-registrar). DOM-INV-2: advisory lock por FQDN. |
| `renew` | `domains/renew` | Idempotente por período; **DOM-INV-4 — v1 ([ADR-084 A1](./adr-084-comercio-dominios-registrar.md)):** tras `renew`, verificar vía `domains/details` que `expires_at` avanzó al período esperado **antes** de marcar éxito y emitir `domain.renewed`; si no avanzó → `PROVIDER_INTERNAL_ERROR` retriable (DLQ + alerta, R13). |
| `transfer_in` | `domains/transfer` (+ `validate-transfer`, `resend-rfa`, `cancel-transfer`) | FSM de transfer ([ADR-084 §4](./adr-084-comercio-dominios-registrar.md)) — **Sprint 15D.II**. |

`provider_reference` = el `order-id`/`entityid` de RC. `deprovision()` → `domains/delete` (grace ≤5 días post-registro) o cancelación según estado. **NO se llama `dns/activate` ni ningún endpoint del bloque DNS de RC** (E1-E24) — la autoridad DNS es Enhance ([ADR-082](./adr-082-modelo-domain-hosting-dns-doctrine.md)).

Tras un `register` OK, la **zona DNS la crea el orquestador** en Enhance ([ADR-082 A2.2](./adr-082-modelo-domain-hosting-dns-doctrine.md)) — el plugin RC **no** toca Enhance (R4).

### 6. Mapping de estado RC → `ServiceInfoStatus`

`getServiceInfo()` mapea el estado multi-eje de RC (`domains/details`) a `ServiceInfoStatus` ([ADR-077 §2.3](./adr-077-contrato-provisioner-plugin-v2.md) — **no** al enum `ServiceStatus` Prisma):

| Estado RC | `ServiceInfoStatus` | Nota |
|---|---|---|
| `entityStatus=Active` && `currentstatus=ok` | `active` | |
| `entityStatus=Suspended` | `suspended` | |
| `expires_at < now` (sin redemption) | `expired` | + `recoveryHint='renew'` |
| RGP / redemption | `expired` | + `recoveryHint='restore'` + `metadata.domain_lifecycle='redemption'` ([ADR-082 A2.3](./adr-082-modelo-domain-hosting-dns-doctrine.md)) |
| `actionstatus=pending verification` (ICANN RAA) | `pending` | |
| `entityStatus=Deleted` | `cancelled` | |
| proveedor caído / timeout | `unknown` | |
| otros / inconsistente | `failed` | |

`expires_at` real se persiste en `services.expires_at` ([ADR-082 A2.3](./adr-082-modelo-domain-hosting-dns-doctrine.md)) por el reconcile cron (`domains/search`, cada 6h).

**Poblar `ServiceInfo.domain` ([ADR-077 A11](./adr-077-contrato-provisioner-plugin-v2.md)).** Además del `status`, `getServiceInfo()` mapea `domains/details` al shape `DomainInfo`: `nameservers` (campo `ns1..nsN`), `expiresAt` (`endtime`), `lifecycle` (de la sub-fase RGP/redemption — coherente con la tabla §6), `whoisPrivacy` (estado de privacy protection), `registrarLock` (theft/registrar lock), `authCodeAvailable` (false si `registrarLock` activo o dominio <60 días), `autoRenew`, y `contacts` como **resumen** (nombre del registrant + presencia de admin/tech/billing desde los handles de §4 — **sin PII completa**, R12/RGPD). Una sola llamada `domains/details` alimenta status + `DomainInfo`.

### 7. Mapping de errores RC → `ProvisionerErrorCode`

El plugin traduce errores nativos de RC a los códigos canónicos ([ADR-077 §2.6 + A10](./adr-077-contrato-provisioner-plugin-v2.md)) — el cliente ve un mensaje accionable, no "error del proveedor":

| Error RC nativo | `ProvisionerErrorCode` | retriable |
|---|---|---|
| dominio no disponible / ya registrado | `DOMAIN_UNAVAILABLE` | ❌ |
| premium (en availability) | `DOMAIN_PREMIUM` | ❌ |
| requisitos de registrant no cumplidos (.es/.eu) | `REGISTRANT_INELIGIBLE` | ❌ |
| transfer rechazado / lock / <60 días / NACK | `TRANSFER_REJECTED` | ❌ |
| auth/EPP code inválido | `INVALID_AUTH_CODE` | ❌ |
| dominio en redemption (renovar) | `DOMAIN_IN_REDEMPTION` | ❌ |
| registrar lock activo | `REGISTRAR_LOCKED` | ❌ |
| api-key inválida | `PROVIDER_AUTH_FAILED` | ❌ |
| rate limit LogicBoxes | `PROVIDER_RATE_LIMITED` | ✅ |
| timeout / red | `PROVIDER_TIMEOUT` / `NETWORK_ERROR` | ✅ |
| 5xx / inesperado | `PROVIDER_INTERNAL_ERROR` | ✅ |

### 8. Pricing y crons

- `getTldPricing()` ([ADR-077 A10](./adr-077-contrato-provisioner-plugin-v2.md)) lee `products/customer-price` (coste mayorista por TLD/años). El cron diario `sync-resellerclub-pricing` aplica `markup_percent` (setting `plugin.resellerclub.markup_percent`, default **25 %**) y puebla `domain_tld_pricing` ([ADR-084 §1](./adr-084-comercio-dominios-registrar.md)).
- **Moneda ([ADR-084 A1.2](./adr-084-comercio-dominios-registrar.md) — moneda única v1).** `products/customer-price` devuelve el coste en la **moneda de la cuenta reseller RC**. v1 exige que sea la de venta (`plugin.resellerclub.default_currency`, default **EUR**). El cron es **fail-safe**: si la respuesta viene en una moneda distinta, **no escribe** la fila → la omite + emite `system.error` (alerta superadmin), nunca un precio mal-tarifado. Sin esta paridad, ni el `markup_percent` ni el margin guard (DOM-INV-3) tienen sentido. **La moneda real de la cuenta OT&E/producción se confirma en la verificación OT&E** (hoy diferida — DC.NEW-62); la doctrina es defensiva e independiente de ese dato.
- Cron 6h `sync-resellerclub-orders` (`domains/search`) reconcilia `services.expires_at`, estado y cambios externos (DH-INV-6).
- `checkDomainAvailability()` ([ADR-077 A10](./adr-077-contrato-provisioner-plugin-v2.md)) → `domains/available` (+ `idn-available` para IDN en v1.1).

### 9. Scope v1 por madurez (empaquetado en dos sprints — sesión 2026-05-21)

| Bloque | Sprint 15D core | Sprint 15D.II |
|---|---|---|
| Registro nuevo (`register`) + NS=Aelium + zona post-register | ✅ | |
| Renovación (`renew`) + avisos de expiración | ✅ | |
| Gestión: modify NS / contactos / privacy / lock / auth code | ✅ | |
| Suspend/unsuspend admin (G1/G2) | ✅ | |
| Customer/contact lazy + advisory lock | ✅ | |
| Pricing sync + buscador/availability básico | ✅ | |
| DOM-INV-1/2/3/4/5 (exactly-once, lock, margin guard, renovación verificada, elegibilidad) | ✅ | |
| **Transfer-in (FSM + EPP + validate/resend/cancel)** | | ✅ |
| **Buscador rico (suggest-names, bulk, IDN)** | | ✅ |
| **Premium domains (venta)** | | ✅ |
| **Child nameservers (D1-D4) · domain forwarding (F1-F2)** | | ✅ |
| ~~DOM-INV-3/4 (margin guard, renovación verificada)~~ → **movidas a 15D core** ([ADR-084 A1](./adr-084-comercio-dominios-registrar.md)) | ✅ | |

Fuera de v1/v1.1 (diferido con razón, dossier §5.2): SSO al panel RC (H6/H7 — rompe ADR-070), delete customer (H8), coop sponsors (I9).

### 10. WHOIS privacy y mock

- **WHOIS privacy ON por defecto** siempre (gratuito, GDPR-friendly, estándar 2024+); el cliente puede desactivarla vía `toggle_privacy` (decisión §6.3 dossier).
- **`MockResellerClubServer`** (Express stub) en `backend/test/mocks/resellerclub-server/` (patrón [ADR-083 A1](./adr-083-plugin-enhance-cp-specifics.md)), **arrancado fresco por corrida** (L22) + endpoint `POST /__test__/seed` (L23). De **alta fidelidad**: modela los errores reales (no disponible, premium, inelegible, rate-limit, timeout) y la asincronía del transfer, no solo el happy path (lección L20: profundidad sobre superficie).

---

### 11. Estrategia de testing y verificación OT&E (sub-fase 15D.B0)

Heredada del patrón Enhance ([ADR-083](./adr-083-plugin-enhance-cp-specifics.md) decisión 27: *"CI usa el mock al 100 %; NUNCA golpea el proveedor live desde CI"*). OT&E se toca de forma **controlada y manual**, nunca en bucle de CI. Tres capas:

1. **Verificación OT&E inicial (sub-fase 15D.B0, ANTES del código de fundación)** — script `backend/scripts/research-resellerclub-ote.ts` recorre los ~30 endpoints del scope v1 contra OT&E real, captura request/response/códigos de error reales y los documenta en `docs/_research/sprint-15d/resellerclub-ote-findings.md`. **Valida el catálogo ~95 %** del [dossier §4](../60-roadmap/sprint-15d-resellerclub-dossier.md); si hay divergencias se ajusta este ADR / el dossier (L18) **antes** de comprometer el diseño del cliente y el mock. Razón de hacerlo antes: el catálogo RC es ~95 % por cross-referencia (no hay OAS literal como Enhance — el KB de RC bloquea fetches con Cloudflare), así que la robustez viene de verificar contra la API en vivo, no de un documento.
2. **Desarrollo + CI contra `MockResellerClubServer`** (§10) — construido a partir de las respuestas reales capturadas en (1). Determinista, rápido, sin dependencia externa.
3. **Smoke OT&E manual pre-cierre (Fase G)** — una pasada contra OT&E real antes de cerrar (igual que el smoke real de Enhance, 15C.II G.3), para confirmar que el mock no divergió de la API en vivo.

**Entornos y conectividad:**
- URLs: OT&E (sandbox) `https://test.httpapi.com/api/` · producción `https://httpapi.com/api/` (**a confirmar en 15D.B0**). Seleccionadas por el setting `environment` del manifest (§2); credenciales independientes por entorno en el vault (R12).
- **Localhost es válido**: las llamadas son **salientes** (backend → RC); no requieren que RC alcance la máquina. v1 usa **polling** (decisión 14 del dossier), no webhooks — los webhooks (entrantes, requerirían URL pública / túnel) son v1.1.
- **IP whitelist**: la API de LogicBoxes/ResellerClub exige registrar la(s) IP(s) desde las que se llama (panel RC → sección API). Desde localhost = IP pública del ISP (posiblemente dinámica) → whitelistar la IP actual en OT&E; en producción, la IP del servidor desplegado (P-DEPLOY). Es la única configuración no obvia para testear desde local.
- OT&E es **sandbox**: `register`/`renew`/`transfer` no registran dominios reales ni tienen coste — seguro para pruebas.

---

## Consecuencias

- ✅ **Ganamos:**
  - RC implementa el contrato de registrar sin inventar nada — encaja en la fundación transversal.
  - Customer/contact lazy con advisory lock + cross-search defensivo → cero duplicados en RC ante concurrencia/crash.
  - Errores accionables (mapeo a códigos canónicos) → UX profesional.
  - Mock de alta fidelidad → tests que reflejan producción (no verde falso).
- ⚠️ **Aceptamos:**
  - El catálogo RC se construyó cross-referenciando wrappers PHP + 3 plataformas billing (~95 % cobertura, dossier §4) — endpoints recientes podrían faltar y se descubren al implementar contra OT&E.
  - Transfer-in y features avanzadas quedan para 15D.II.
- 🚪 **Cierra:**
  - **No SSO al panel RC para el cliente** (ADR-070 puerta unificada).
  - **No DNS de RC** (E1-E24) — autoridad DNS es Enhance.
  - **No pre-register handshake** — zona post-register vía orquestador ([ADR-082 A2.2](./adr-082-modelo-domain-hosting-dns-doctrine.md)).
  - **No credenciales RC en `metadata` ni logs** (R12 — viven en el vault).

---

## Cuándo revisar

- **Si RC cambia su API de auth o de pricing** (LogicBoxes evoluciona): revisar §2 y §8.
- **Si se añade un segundo registrar** (Hexonet/OpenSRS): este ADR es la referencia de "cómo se resolvió en RC"; el nuevo crea su propio ADR de specifics sobre la misma fundación ([ADR-084](./adr-084-comercio-dominios-registrar.md)).
- **Si OT&E (sandbox) diverge de producción** en algún flujo: documentar la divergencia y ajustar el mock.
- **Si se decide vender `.coop` u otros TLDs con sponsors/requisitos especiales**: ampliar §4 (contact set-details) y los TLDs ofrecidos.

---

## Amendments

### Amendment A1 (2026-05-22) — correcciones de la verificación empírica OT&E

La verificación empírica contra OT&E (§11 capa 1) se ejecutó parcialmente el 2026-05-22 con **IP fija whitelisteada** (detalle y shapes en [`resellerclub-ote-findings.md` §4](../_research/sprint-15d/resellerclub-ote-findings.md)). Materializa estas correcciones sobre el cuerpo del ADR (**L18**: el hallazgo empírico se materializa como Amendment, no como edición silenciosa):

- **A1.1 — `getTldPricing()` lee `products/reseller-price` (COSTE), no `customer-price` (supersede §8).** El empírico confirma que `reseller-price` es el **coste mayorista** (precios *string*, anidados bajo el slab `"0"`, con bloque `category`) y `customer-price` es el **precio sugerido al cliente por RC** (precios *number*, por años `1..10`). El margin guard **DOM-INV-3** y el `markup_percent` ([ADR-084 A1](./adr-084-comercio-dominios-registrar.md)) operan sobre el **coste** ⇒ la fuente canónica de `getTldPricing()` es `reseller-price`. `customer-price` no se usa en v1 (RC no fija nuestro precio de venta).
- **A1.2 — la clave de producto RC es el `classkey` de `domains/available`.** El precio de cada TLD se localiza por el `classkey` (`.com`→`domcno`, `.net`→`dotnet`, `.org`→`domorg`, `.es`→`dotes`, `.eu`→`doteu`), no por el TLD literal. Es la clave de unión `available` ↔ pricing ↔ `domain_tld_pricing`.
- **A1.3 — DOS envoltorios de error de negocio (refina §7).** RC responde con `{status:"ERROR", message}` (mayúscula, la mayoría de comandos) **y** `{status:"error", error}` (minúscula, p. ej. `domains/register`), y pueden llegar con HTTP 200 **o** 500. El http-client (15D.C) detecta ambos por `String(status).toLowerCase() === 'error'` y extrae el detalle de `message || error` **antes** del mapeo por status HTTP. "Customer not found" llega como **HTTP 500** (no 404) ⇒ el cross-search defensivo lo trata como "crear", no como fallo duro.
- **A1.4 — ids escalares.** `customers/signup` y `contacts/add` devuelven el id como **número plano** en el body (no `{id}`); el cliente parsea escalar.
- **A1.5 — `register` valida nameservers por resolución DNS — prerequisito de infra (refina §5 y §11).** OT&E rechaza el `register` si los nameservers no resuelven en DNS (`ns1/ns2.aelium.net` no tienen registro A en pre-producción — verificado con `Resolve-DnsName`; los públicos de IANA tampoco se aceptan). ⇒ los shapes de `register`/`details`/gestión/`renew`/suspend quedan **diferidos al smoke de Fase G** (tras levantar la infra de nameservers de Aelium; **prerequisito P-DEPLOY**) y el `MockResellerClubServer` los modela **conservadoramente** hasta entonces (coherente con §11). `domains/suggest-names` está **deprecado** (→ `/domains/v5/suggest-names`), lo que solo afecta al buscador rico de **15D.II**.

### Amendment A2 (2026-05-23) — fuente de datos de registrante + 1 contacto reutilizado en los 4 roles + doctrina de elegibilidad (Sprint 15D Fase 15D.D)

Al implementar el `ResellerclubCustomersService` (Fase 15D.D, Commit 2) se materializaron tres decisiones que §3/§4 dejaron implícitas. Sesión Yasmin ↔ Claude 2026-05-23 (**L18**: se registran como Amendment, no como desvío silencioso).

- **A2.1 — fuente de datos de registrante = `ClientPublicData` enriquecido (refina §3).** §3 decía "con los datos del `Client`" sin precisar la fuente. El `customers/signup` + `contacts/add` de RC exigen dirección postal completa (`address-line-1`, `city`, `state`, `country`, `zipcode`, `phone-cc`, `phone`), que en Aelium vive en `ClientProfile` (1:1 con `User`; `BillingProfile` se descartó — sin `phone`/`state`, N por user). **Decisión Yasmin: Opción A** — el orquestador puebla `ClientPublicData` con esos campos desde `ClientProfile` ([ADR-077 Amendment A12](./adr-077-contrato-provisioner-plugin-v2.md#amendments)) y el plugin los lee de `ctx.client`, en vez de que el plugin consulte `client_profiles` vía Prisma. Razón: mantiene **R4** limpio (el plugin no alcanza el schema de otro módulo — coherente con Enhance) y es reutilizable por cualquier registrar futuro.

- **A2.2 — 1 contacto RC reutilizado en los 4 role-handles (refina §4).** §4 modela 4 handles (`registrant/admin/tech/billing`). **Decisión Yasmin: 1 contacto RC** (`type='Contact'`, 1 sola llamada `contacts/add`) cuyo `contact-id` se escribe en las 4 filas de `resellerclub_contact_handles` y se referencia en los 4 campos de `domains/register`. Razón: datos idénticos del mismo `ClientProfile`, estándar industria (WHMCS/Blesta) para individuos, mínimo coste API. El schema de 4 filas (`@@unique [user_id, contact_type]`) se conserva: permite diferenciar por rol/TLD en el futuro (registrant `.es` con NIF → DOM-INV-5, Fase F) sin migración.

- **A2.3 — doctrina de elegibilidad de registrante + `phone-cc` (refina §3/§7).** Datos de registrante requeridos por RC que falten en `ClientProfile` (sus campos son nullable) ⇒ el plugin aborta con `REGISTRANT_INELIGIBLE` (familia DOM-INV-5, no retriable) + mensaje accionable ("completa tu perfil"); **NUNCA** se envían placeholders al WHOIS. La validación rica **pre-checkout** es Fase 15D.F; en 15D.D el plugin defiende (R7). El `phone-cc` se **deriva del `country_code`** (ISO-2 → prefijo E.164 vía mapa; país sin entrada ⇒ `REGISTRANT_INELIGIBLE`, nunca prefijo erróneo) — `ClientProfile.phone` es un solo campo. El `passwd` del customer RC se genera aleatorio en memoria y **no se persiste** (R12; sin SSO al panel RC — ADR-070); su política exacta de complejidad se confirma en el smoke OT&E (Fase G, A1.5).

### Amendment A3 (2026-05-23) — refinamientos de la implementación de la Fase 15D.D

Decisiones tomadas al implementar el plugin core (Fase 15D.D), registradas como Amendment (**L18**: no desvío silencioso).

- **A3.1 — `deprovision` de lifecycle de un dominio es no-op (refina §5).** §5 fijaba `deprovision() → domains/delete (grace) o cancelación según estado`. Al implementar se constató que usar `domains/delete` como deprovision **de lifecycle** (disparado al cancelar el servicio) borraría un dominio que el cliente **pagó** — el peor fallo posible de un registrar. **Decisión:** el `deprovision` de lifecycle es **no-op idempotente**; el dominio persiste hasta su expiración y RC gestiona el ciclo (sin auto-renew → expira → redemption → delete). El `domains/delete` en período de gracia (reembolso de registros accidentales/fraude) es una **operación admin EXPLÍCITA y destructiva**, diferida a Fase 15D.F — NO es el deprovision de lifecycle (el cliente RC aún no expone `deleteDomain`).
- **A3.2 — `recoveryHint` conservador en v1; `renew`/`restore` diferidos a Fase F (refina §6).** §6 mapea `expired → recoveryHint='renew'` y `redemption → recoveryHint='restore'`, pero el tipo `ServiceRecoveryHint` ([ADR-077](./adr-077-contrato-provisioner-plugin-v2.md), frozen en 15C) solo admite `reprovision`/`reconcile`/`contact_support`. En vez de extender el contrato a mitad de fase, v1 usa `contact_support` para redemption/pending_delete y deja que **`DomainInfo.lifecycle`** ([ADR-077 A11](./adr-077-contrato-provisioner-plugin-v2.md) — ya transporta `active/expired/redemption/pending_delete`) lleve el estado preciso del ciclo ICANN. La extensión de `ServiceRecoveryHint` con `renew`/`restore` + el CTA dedicado se materializan en **Fase 15D.F** junto al frontend de gestión (Amendment a ADR-077 entonces).
- **A3.3 — `testConnection` `'custom'` (probe `reseller-price`).** El plugin implementa `testConnection()` ([ADR-077 A6](./adr-077-contrato-provisioner-plugin-v2.md)) con un probe de **solo lectura** (`products/reseller-price`) que valida auth (userid+api-key) + atraviesa el WAF de Cloudflare sin registrar nada — para el botón "probar conexión" del admin al configurar credenciales.
- **A3.4 — `tlds_offered` como CSV en el manifest.** El subset `JsonSchema7` del manifest ([ADR-080](./adr-080-plugin-framework.md)) solo admite escalares (no `array`); `plugin.resellerclub.tlds_offered` se modela como string CSV (`".com,.net,.org,.es,.eu"`), parseado a array en runtime. Sin impacto funcional.
- **A3.5 — `domain.registered` emitido por el orquestador vía Outbox (materializa §5 + [ADR-084 §5](./adr-084-comercio-dominios-registrar.md)).** Gated por `is_domain_registrar` + `operation='register'` + register **fresco** (`!provider_reference`) → se emite una sola vez (no re-emite en reintento puro / adopción DOM-INV-1). `expires_at` viaja `null` en register (lo puebla el reconcile, Fase 15D.E). La fuente de NS es el setting `provisioning.default_nameservers` (`SettingsService`, R4-limpio); los datos de registrante, `ClientPublicData` enriquecido ([ADR-077 A12](./adr-077-contrato-provisioner-plugin-v2.md)).

### Amendment A4 (2026-06-22) — decisiones de la implementación de la Fase 15D.E (renovación + lifecycle + crons)

Decisiones tomadas al implementar la renovación, el lifecycle de expiración y los 3 crons (Fase 15D.E), registradas como Amendment (**L18**: no desvío silencioso).

- **A4.1 — años de renovación derivados de `billing_cycle`, no de `domain_years` (refina §5).** El `provision(renew)` renueva por el período del ciclo de facturación del servicio (`service.billing_cycle`), NO por los años del registro inicial (`metadata.domain_years`). Los dominios se facturan `annual` (checkout 15D.B) y el registrar renueva en años enteros ≥1 ⇒ v1 renueva **1 año/período** (`renewYearsForCycle`, único punto de extensión si se añaden ciclos multi-año a `BillingCycle`). Alinea la renovación del registrar con el período que cobra la factura de renovación.

- **A4.2 — idempotencia por período anclada en `services.expires_at` + reconcile per-servicio vía `domains/details` (refina §5/§8).** **(a)** DOM-INV-4: tras `domains/renew` se relee `domains/details` y se exige que `endtime` avanzara ≥ una cota conservadora (300 días/año, absorbe el desfase calendario) antes de marcar éxito/emitir `domain.renewed`; si no → `PROVIDER_INTERNAL_ERROR` retriable (DLQ + alerta). **(b)** La idempotencia "por período" se **define** anclando en `services.expires_at` (lo puebla el reconcile, presente mucho antes de la 1ª renovación ~1 año tras el alta): si el `endtime` del registrar ya está ~1 período por delante del ancla → re-run/recovery → éxito sin re-llamar a RC (cierra el doble-renew ante crash entre el `renew` en RC y la persistencia). **(c)** El reconcile cron (§8 decía `domains/search` batch) se implementa **per-servicio vía `getServiceInfo`/`domains/details`** — reutiliza el mapeo de estado + `DomainInfo` del plugin (status + `lifecycle` + `expiresAt` en una lectura), sin acoplar a internals; el `domains/search` batch queda como optimización diferida.

- **A4.3 — emisión `domain.*` + disparo de renovación (materializa [ADR-084 §5](./adr-084-comercio-dominios-registrar.md)).** El **orquestador** detecta la renovación (`invoice.paid` sobre un servicio de dominio ya `active` con `provider_reference` — única causa) y enruta a `provision(renew)` forzando `operation='renew'`; un fallo no-retriable de renovación (p.ej. `DOMAIN_IN_REDEMPTION`) **NO** cancela el dominio activo (sigue registrado). `domain.expired`/`domain.entered_redemption` los emite el reconcile cron **edge-triggered** (flag `services.metadata.domain_lifecycle`, vía Outbox); `domain.expiring_soon` lo emite un cron diario transversal (30/14/7/1d, edge-trigger por ventana, alerta sin Outbox). El **`recoveryHint` `renew`/`restore` se mantiene diferido a Fase F** (consistente con A3.2): el estado preciso del ciclo ya viaja en `DomainInfo.lifecycle` + los eventos `domain.*`.

- **A4.4 — `domain_tld_pricing` writer + DC.NEW-67 cerrado.** El cron `sync-resellerclub-pricing` (diario) es el **writer** de `domain_tld_pricing`: `getTldPricing()` (coste) × `markup_percent` → precio (`source='sync'`, no sobreescribe `manual`). **Fail-safe de moneda** (A1.2): coste en moneda ≠ `default_currency` → omite la fila + `system.error` (vía `EventEmitter2` global — el plugin **NO** importa `ErrorLogModule` porque arrastra `AuthModule`, rompería R4). **DC.NEW-67 cerrado**: `getApiClient` lee un override test-only de `baseUrl` (`config.__base_url_override`, fuera del `configSchema` con `additionalProperties:false` → Ajv lo rechaza en producción) para que los IT de crons golpeen el `MockResellerClubServer` sin tocar OT&E.

- **A4.5 — DOM-INV-5 plugin-side en v1; validación rica pre-checkout a Fase F.** La elegibilidad de registrante (`.es`/`.eu`) la defiende el plugin al `register` (`REGISTRANT_INELIGIBLE`, A2.3). La validación rica **pre-checkout** + `contacts/set-details` (NIF `.es` / residencia `.eu`) se materializan en **15D.F** con el frontend de checkout. La fila de `current.md` que listaba DOM-INV-5 "completa" en 15D.E se corrige a este alcance.

### Amendment A5 (2026-06-22) — gestión curada backend (Fase 15D.F.1: handlers `executeAction` + eventos)

15D.F se **parte en sub-fases** (F.1 gestión backend → F.2 buscador/checkout/DOM-INV-5 rico → F.3 zona DNS post-register capability-routed → F.4 frontend). Decisiones de la **Fase 15D.F.1** (handlers de `executeAction`), registradas como Amendment (**L18**).

- **A5.1 — handlers de gestión implementados; `modify_contacts` diferido a F.2.** `executeAction` deja de ser stub: dispatch por slug a `modify_nameservers` (verify-after-write: relee `details`), `toggle_privacy`, `toggle_registrar_lock` (enable/disable theft-protection), `get_auth_code`, y `suspend_service`/`unsuspend_service` (adminOnly). El plugin SOLO devuelve `ActionResult` — el wrapper `executeActionWithCacheInvalidation` centraliza cache/audit/evento/`adminOnly`/R12; el orquestador transiciona `services.status` en suspend (A4 de ADR-077). **`modify_contacts` se difiere a F.2**: requiere los datos de registrante enriquecidos (`ctx.client`/perfil + `.es`/`.eu`) que `executeAction` no recibe — pertenece al flujo de checkout/perfil. Los shapes RC de gestión siguen **CONSERVADORES hasta el smoke OT&E Fase G** (A1.5); validados contra `MockResellerClubServer` (read-after-write: `theftprotection`→`currentstatus:transferlock`, `domsecret`, 4 contact-handles).

- **A5.2 — `get_auth_code` lee `domsecret` de `details` (no regenera) + R12 amplía el regex canónico.** El handler relee `domains/details`, gatea por `authCodeAvailable` (activo && sin lock → si no, `REGISTRAR_LOCKED`) y devuelve `details.domsecret` como `ActionResult.data.authCode`. El EPP/auth code es **secreto** → se amplía el regex canónico de `audit-sanitizer` (`core/provisioning/`) a `/(password|secret|token|apiKey|privateKey|auth.?code)/i` (heredable a futuros registrars): el wrapper redacta `data.authCode` del `audit_change_log`; el evento in-memory conserva el plaintext para entregarlo al titular legítimo (mismo patrón que `reset_account_password`).

- **A5.3 — eventos `domain.*_changed` vía Outbox; seam en el orquestador (no en el wrapper ni el plugin).** Tras una inline action de gestión exitosa, `ProvisioningService.executeActionForUser` emite el evento (`domain.nameservers_changed`/`privacy_changed`/`lock_changed`; `contacts_changed` con F.2) vía Outbox (R8 + [ADR-084 §5](./adr-084-comercio-dominios-registrar.md)), gated por capability `is_domain_registrar` + un **mapa estático slug→evento** (R4: nunca por el slug del plugin). La emisión vive en `orchestrator.emitDomainManagementEvent` (que ya tiene `OutboxService`); no hay estado local que mutar (el cambio vive en el registrar) → la `$transaction` solo persiste el evento para dispatch exactly-once. **Corrige el drift de `_events.md`** (marcaba estos eventos "no (post-action)") contra ADR-084 §5 (todos los `domain.*` vía Outbox) — L18.

- **A5.4 — alerta de seguridad NS/lock; privacy/contacts sin notif v1.** `NotificationsOnDomainManagementListener` consume `domain.nameservers_changed` + `domain.lock_changed` → email + campana "verifica que fuiste tú" (patrón estándar de registrar). `domain.privacy_changed` **no** se notifica (cambio benigno de WHOIS privacy); `domain.contacts_changed` llega con su handler en F.2.

- **A5.5 — diferidos explícitos a F.2/F.4.** `modify_contacts` enriquecido + `contacts/set-details` `.es`/`.eu` → **F.2**. La extensión de `ServiceRecoveryHint` con `renew`/`restore` + su CTA (A3.2/A4.3) y `deleteDomain` admin en período de gracia (A3.1) → **F.4** (frontend de gestión) / sub-fase admin.

### Amendment A6 (2026-06-24) — cierre core 15D.G: precios admin · perfil de titular · recovery hints · borrado en gracia

Decisiones de la **Fase 15D.G** (cierre del 15D core), registradas como Amendment (**L18**). Materializan los diferidos de A5.5 + el plano de gestión admin de precios. Contrato additivo en [ADR-077 Amendment A13](./adr-077-contrato-provisioner-plugin-v2.md#amendments).

- **A6.1 — gestión de precios admin capability-routed.** `domain_tld_pricing` gana superficie admin: `AdminDomainsController` (`/admin/domains/pricing`) lista la matriz (coste·markup·precio·margen·fuente), fija/revierte **overrides manuales** (`source='manual'`, que el cron de sync nunca pisa; guard de margen DOM-INV-3) y fuerza una sincronización ahora. El "sync ahora" se resuelve por capability vía un registry leaf nuevo (`DomainPricingSyncRegistryService`, espejo de `ReconcileRegistryService`): el cron de pricing del registrar registra su `runOnce` en `onModuleInit`; el admin lo invoca por slug resuelto desde capability (R4 — nunca acopla a `resellerclub`). El form de producto oculta la card "Ciclo de vida" para `type='domain'` (lo gobierna el registrar).

- **A6.2 — perfil de titular self-service + propagación (`updateRegistrantContact`).** Modelo **1 titular/cliente** (refina A2): el cliente edita sus datos WHOIS en su perfil (`PUT /domains/registrant`, self-scoped); se persisten en `User`+`ClientProfile` (tx corta) y se propagan al contacto compartido del registrar (`contacts/modify` → todos sus dominios). La llamada HTTP va **fuera de la transacción** (avanza **DC.NEW-66** para este camino: lee el contact-id con query corta, modifica fuera de tx) + **verify-after-write** (relee `contacts/details`, confirma el nombre → si no, `PROVIDER_INTERNAL_ERROR` retriable). Devuelve `nameChanged` para que la UI avise del lock ICANN de 60d. Propagación **best-effort**: si falla (`REGISTRANT_INELIGIBLE`/proveedor caído), el perfil queda guardado y el resultado lo refleja. **La inline action per-dominio `modify_contacts` queda como vestigio del contrato** (no se renderiza): editar contactos es por-cliente, no por-dominio. Nuevos métodos de cliente RC: `modifyContactDetails`/`getContactDetails` (`contacts/modify`/`details`) + fidelidad del mock.

- **A6.3 — recovery hints `renew`/`restore`.** `mapRcDomainStatus` mapea `expired→recoveryHint:'renew'` y `redemption→'restore'` (antes `contact_support`); el detalle de dominio cliente muestra el CTA (renovar = invoice-driven; restaurar = soporte en v1). `pending_delete` mantiene `contact_support`.

- **A6.4 — `deleteDomain` admin (borrado en gracia).** Acción **destructiva** (≠ `deprovision` no-op): `domains/delete` en RC (reembolso si está en gracia) + cancelación del `service` por el lifecycle canónico (`deprovisionAsAdmin` → audit + `service.cancelled`). Capability-routed (`AdminDomainsService.deleteDomain` resuelve el registrar; el plugin implementa `deleteDomain?`). Si el registrar rechaza (fuera de gracia), el servicio NO se cancela. Frontend: menú admin del servicio (gated `product_type='domain'`) con doble confirmación (typing + motivo).

- **A6.5 — red de tests + serie e2e.** Specs nuevos: `resellerclub.plugin.integration.spec.ts` (vertical de gestión `executeAction↔getServiceInfo` @ mock), `resellerclub-ns-switch`/`resellerclub-registrant.e2e-spec.ts` (Postgres real), `admin-domains`/`domain-registrant`/`domain-pricing-sync-registry.service.spec.ts`. Fix de un hallazgo: la aserción `rc_nameservers` del `resellerclub-register.e2e-spec.ts` quedó stale tras F.3 (la clave de metadata pasó a `nameservers`) → corregida. `jest-e2e.json` → `maxWorkers:1` (los `*.e2e-spec.ts` comparten el Postgres de dev; las secuencias de id del mock colisionan en paralelo). i18n: añadidas las 48 claves `plugin.resellerclub.*` que faltaban en `translations-es.ts` (se mostraban crudas en `/admin/plugins` + form de producto).

### Amendment A7 (2026-06-24) — Sprint 15D.II: endpoints RC de transfer-in / restore / suggest-v5, shapes conservadores hasta B0-bis + smoke G, y alcance v1 (Fase 15D.II.A)

Doctrina-only de apertura de **Sprint 15D.II** (comercio avanzado de dominios): mapea los endpoints ResellerClub que las fases de implementación consumirán y fija su estado de verificación empírica (coherente con A1.5: los shapes register-dependientes quedaron diferidos al smoke por la infra de nameservers).

- **A7.1 — Endpoints de transfer-in (Fases T1–T3).** Cliente high-level nuevo: `validateTransfer`→`domains/validate-transfer`, `transferDomain`→`domains/transfer`, `resendRfa`→`domains/resend-rfa` (reenvío del correo de autorización al titular de origen), `cancelTransfer`→`domains/cancel-transfer`. El pricing de transfer **ya es consultable** (`RcPriceOperation='addtransferdomain'`, mapeado a la operación `transfer` de `domain_tld_pricing`). El estado del transfer se lee en el reconcile vía `domains/details` (mismo seam que renew/lifecycle, A4.2).
- **A7.2 — Restore RGP (Fase R).** `restoreDomain`→`domains/restore` (recuperación en redemption con tarifa especial). El pricing `restoredomain` ya existe (mock/tabla). Engancha desde `recoveryHint='restore'` (A6.3) y desde el gate de `renew` que rechaza redemption (`DOMAIN_IN_REDEMPTION`).
- **A7.3 — Buscador rico (Fase S).** `suggestNames`→`/domains/v5/suggest-names` (**la v4 está deprecada/muerta**, HTTP 500 — A1.5). El bulk multi-nombre reutiliza el `checkDomainAvailability` multi-TLD existente, extendido a varios SLDs. IDN (punycode) es opcional/diferible a v1.1.
- **A7.4 — Shapes CONSERVADORES hasta B0-bis + smoke G.** Los shapes reales de `validate-transfer`/`transfer`/`resend-rfa`/`cancel-transfer`/`restore`/`v5-suggest-names` **no se capturaron** en B0 (cero steps OT&E de transfer). La sub-fase **15D.II.B0-bis** los captura contra OT&E sandbox (IP whitelisteada) **antes de codear**; el `MockResellerClubServer` los modela conservadoramente **con FSM simulable** (asincronía del transfer); el smoke de **Fase 15D.II.G** los refina (mismo patrón que register en core, A1.5/A5.1). El catálogo de errores de transfer en `errors.ts` se marca **[REFINAR smoke G]**. Los códigos `TRANSFER_REJECTED`/`INVALID_AUTH_CODE` ya existen en el enum canónico ([ADR-077 A10](./adr-077-contrato-provisioner-plugin-v2.md#amendments)) y `errors.ts` ya los mapea.
- **A7.5 — Alcance v1 (decisión Yasmin, ver [ADR-084 A2.6](./adr-084-comercio-dominios-registrar.md#amendments)).** 15D.II **v1** = transfer-in + restore + buscador rico. **Premium** (venta) + **child-NS** + **forwarding** → **v1.1**. El `checkDomainAvailability` mantiene `premium:false` hasta que v1.1 lea la señal premium real de RC.

> **Justificado por:** apertura de Sprint 15D.II (sesión 2026-06-24). **Compatibilidad:** additivo (métodos nuevos del cliente RC + rutas del mock); cero cambio de contrato core salvo `ProvisionContext.transferAuthCode?` ([ADR-077 A14](./adr-077-contrato-provisioner-plugin-v2.md#amendments)). La mecánica de la FSM (transiciones, timeout, cobro al completar, DOM-INV-6, retry) la fija [ADR-084 A2](./adr-084-comercio-dominios-registrar.md#amendments); la zona DNS al completar, [ADR-082 A5](./adr-082-modelo-domain-hosting-dns-doctrine.md#amendments).

---

## Referencias

- **Módulos afectados:**
  - `plugins/provisioners/resellerclub/` (NUEVO Sprint 15D) — plugin + cliente HTTP + manifest.
  - `backend/test/mocks/resellerclub-server/` (NUEVO) — mock de alta fidelidad.
  - `provisioning` — reconcile cron RC; orquestador crea zona post-register.
  - `products`/`billing` — `sync-resellerclub-pricing` puebla `domain_tld_pricing`.
- **Reglas relacionadas:** [R4](../00-foundations/rules.md) (RC no importa Enhance), [R12](../00-foundations/rules.md) (credenciales en vault), [R7/R13](../00-foundations/rules.md) (errores semánticos + DLQ), [R3](../00-foundations/rules.md) (audit por operación).
- **ADRs relacionados:**
  - [ADR-077 Amendment A10](./adr-077-contrato-provisioner-plugin-v2.md) — contrato de registrar que RC cumple.
  - [ADR-082](./adr-082-modelo-domain-hosting-dns-doctrine.md) (+ A2) — Domain↔Hosting, zona post-register, lifecycle de expiración.
  - [ADR-084](./adr-084-comercio-dominios-registrar.md) — comercio de dominios (TLD pricing, checkout, DOM-INV, FSM transfer) que RC consume.
  - [ADR-083](./adr-083-plugin-enhance-cp-specifics.md) — Enhance specifics; patrón heredado (tabla customers PK `user_id`, lazy + advisory lock, mock, ubicación).
  - [ADR-080](./adr-080-plugin-framework.md) — manifest + `SecretVaultService` (credenciales RC) + circuit breaker.
  - [ADR-070](./adr-070-service-info-sso-acciones-curadas.md) — puerta unificada (cero SSO al panel RC).
- **Glosario:** *Registrar*, *EPP / auth code*, *OT&E (sandbox)*, *Contact handle*, *WHOIS privacy* (a añadir en `glossary.md`).
- **Dossier de origen:** [`docs/60-roadmap/sprint-15d-resellerclub-dossier.md`](../60-roadmap/sprint-15d-resellerclub-dossier.md) — catálogo de 61 endpoints (§4), scope (§5), 16 decisiones técnicas (§6). Este ADR las materializa con las correcciones del cotejo 2026-05-21.
- **Sprint:** 15D Fase 15D.A (este ADR) → 15D core (implementación register/renew/gestión) → 15D.II (transfer + avanzado).
- **Inspiración industrial:** módulos WHMCS/Blesta/HostBill de LogicBoxes/ResellerClub (wrappers `phillipsdata/logicboxes` en producción desde ~2014).
