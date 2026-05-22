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
