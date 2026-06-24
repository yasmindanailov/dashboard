# Plugin ResellerClub — registrar de dominios (admin)

> **Estado:** **15D core CERRADO** (Fase 15D.G mergeada) — registro + renovación +
> lifecycle + crons + gestión curada + switch de NS + gestión de precios admin +
> perfil de titular (WHOIS) self-service + recovery hints + borrado en gracia.
> **Sprint 15D.II (transfer-in) — flujo cliente COMPLETO (backend EN CURSO):** FSM +
> iniciación síncrona + motor de reconcile + **cobro al completar** + **carrito único**
> (T2c.3) + **cierre de la FSM** (T3: eventos `transfer_initiated/failed` + notifs +
> zona DNS al completar + reintento A2.5); pendiente **R** (restore) / **S** (buscador
> rico) / **G** (smoke OT&E) — ver §transfer-in abajo. Pendiente del cierre de 15D core:
> **smoke OT&E real** (Yasmin, refina los shapes conservadores) ·
> retrospectiva. Doctrina:
> [ADR-081](../../10-decisions/adr-081-plugin-resellerclub-specifics.md) (specifics RC) ·
> [ADR-077 A10/A11/A12](../../10-decisions/adr-077-contrato-provisioner-plugin-v2.md) (sub-contrato registrar) ·
> [ADR-084](../../10-decisions/adr-084-comercio-dominios-registrar.md) (comercio de dominios) ·
> [ADR-082](../../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md) (Domain↔Hosting+DNS).

## Qué es

`resellerclub` es el primer **registrar de dominios** del proyecto (LogicBoxes
API). Registra, renueva y gestiona dominios; **no** es autoridad DNS (esa es
Enhance — ADR-082, DH-INV-7). El cliente nunca accede al panel RC: Aelium es la
puerta unificada (ADR-070, `has_sso_panel=false`).

Capabilities: `is_domain_registrar=true`, `has_dns_management=false`,
`has_sso_panel=false`, `supports_suspend=true`, `supports_reconciliation=true`,
`provision_mode='sync'`.

## Configuración (`/admin/settings/plugins/resellerclub`)

**Config** (`plugin.resellerclub.*`):

| Campo | Default | Descripción |
|-------|---------|-------------|
| `environment` | `sandbox` | `sandbox` (OT&E `test.httpapi.com`) o `production` (`httpapi.com`). |
| `markup_percent` | `25` | Margen sobre el coste mayorista al poblar `domain_tld_pricing` (cron, Fase E). |
| `tlds_offered` | `.com,.net,.org,.es,.eu` | TLDs ofertados (CSV — el manifest solo admite escalares). |
| `default_currency` | `EUR` | Moneda única v1 (coste y venta deben coincidir — ADR-084 A1.2). |

**Secrets** (vault AES-256-GCM, ADR-080 — nunca en logs, R12):

| Campo | Descripción |
|-------|-------------|
| `authUserId` | Reseller Id (`auth-userid`). |
| `apiKey` | API key (`api-key`). Principio de mínimo privilegio sobre la password. |

> **IP whitelist (P-DEPLOY):** `httpapi.com` está tras Cloudflare; la IP del
> servidor debe estar whitelisteada en el panel RC (Settings → API), o las
> llamadas reciben un challenge del WAF → `PROVIDER_AUTH_FAILED` (DC.NEW-63).

**Probar conexión:** el botón usa `testConnection()` — un probe de solo lectura
(`products/reseller-price`) que valida credenciales + atraviesa el WAF sin
registrar nada.

## Qué hace hoy (Fase 15D.D)

- **Registro** (`provision(register)`): pre-flight de disponibilidad + **DOM-INV-1**
  (exactly-once por nombre; adopta el registro existente bajo nuestra cuenta tras
  un crash, no re-registra) + alta lazy de customer + 4 contact handles WHOIS
  (1 contacto reutilizado en los 4 roles) + `domains/register` con WHOIS privacy ON.
  **NS según hosting (15D.F.3, [ADR-082 A4](../../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md#amendments)):** si el dominio se compra **con hosting** → NS = `provisioning.default_nameservers` (Aelium; la zona la acuña el website Enhance); si es **dominio-solo** (sin hosting) → NS = `provisioning.registrar_parking_nameservers` (parking del registrar — Enhance no puede crear zona sin website). Al añadir hosting después, los NS conmutan a Aelium automáticamente.
- **Estado** (`getServiceInfo`/`getStatus`): mapea `domains/details` → estado +
  `DomainInfo` (nameservers, expiración, lifecycle ICANN, privacy, lock, resumen
  de contactos sin PII).
- **Pre-venta** (`checkDomainAvailability`, `getTldPricing`) para buscador + cron
  de pricing (Fase E).
- El orquestador emite **`domain.registered`** (Outbox) tras un registro nuevo.

## Qué hace hoy (Fase 15D.E — renovación + lifecycle)

- **Renovación** (`provision(renew)` + **DOM-INV-4**): el orquestador detecta la
  factura de renovación pagada de un dominio activo y la enruta a `renew`. El
  plugin relee `domains/details`, confirma que `expires_at` **avanzó** antes de
  marcar éxito (si no → reintento + DLQ), y es **idempotente por período** (ancla
  en `services.expires_at` → no doble-cobra ante crash-retry). Emite
  **`domain.renewed`** (Outbox). Un fallo no-retriable (p.ej. redención) NO cancela
  el dominio activo. Años renovados = ciclo de facturación (annual → 1).
- **3 crons** (in-process, `@Cron`):
  - **Reconcile** (6h): por dominio, relee el estado del registrar → puebla
    `services.expires_at` + adopta `active`/`suspended` (DH-INV-6) + emite
    `domain.expired`/`domain.entered_redemption` en la transición de lifecycle
    (edge-triggered, Outbox). Registra el executor "reconciliar ahora" del admin.
  - **Pricing-sync** (diario 04:00 UTC): **writer de `domain_tld_pricing`** —
    `getTldPricing()` × `markup_percent` → precio (`source='sync'`, no pisa
    `manual`); fail-safe de moneda (omite + alerta si ≠ `default_currency`).
  - **Avisos** (diario 09:00 UTC): `domain.expiring_soon` a 30/14/7/1 días
    (edge-trigger por ventana).
- **Notificaciones:** `NotificationsOnDomainLifecycleListener` consume los 4
  eventos → email + campana al cliente (plantillas seedeadas).

## Qué hace hoy (Fase 15D.F.1 — gestión curada backend)

Acciones curadas vía `executeAction` (el cliente/admin las invoca por el endpoint
genérico `POST /services/:id/actions/:slug`; el wrapper canónico hace cache+audit+
`adminOnly`+R12, el plugin solo ejecuta en RC):

- **`modify_nameservers`** (peligrosa, `confirmRequired`): cambia la delegación de
  NS del registro (NO la zona DNS, que es Enhance) + verify-after-write.
- **`toggle_privacy`**: WHOIS privacy ON/OFF.
- **`toggle_registrar_lock`**: theft/registrar lock ON/OFF.
- **`get_auth_code`**: devuelve el EPP/auth code para transfer-OUT (cliente
  self-service); gateado por activo+sin-lock; **secreto** → el audit lo redacta (R12).
- **`suspend_service`/`unsuspend_service`** (adminOnly): vía el endpoint dedicado
  `POST /admin/services/:id/suspend|unsuspend` → `orders/suspend|unsuspend` en RC;
  el orquestador transiciona `services.status` + emite `service.suspended/unsuspended`.

Tras una acción de gestión exitosa se emite el evento `domain.*_changed`
correspondiente (Outbox, ADR-084 §5). **Alerta de seguridad:** un cambio de
nameservers o de lock dispara email + campana al cliente ("verifica que fuiste tú").
Shapes RC de gestión CONSERVADORES hasta el smoke OT&E (Fase G, A1.5).

## Qué hace hoy (Fase 15D.G — cierre core)

- **Gestión de precios admin** (`/admin/domains/pricing`, en la ficha del producto
  de tipo `domain`): el admin **ve** la matriz `domain_tld_pricing` (coste·markup·
  precio·margen·fuente), **fuerza** una sincronización con el registrar (botón
  "Sincronizar precios ahora", capability-routed vía `DomainPricingSyncRegistryService`
  — NUNCA por slug, R4), y fija/revierte **overrides manuales** por TLD (`source='manual'`,
  que el cron de sync nunca pisa; guard de margen DOM-INV-3: precio ≥ coste). La card
  "Ciclo de vida" se oculta para productos de dominio (lo gobierna el registrar).
- **Perfil de titular (WHOIS) self-service** (`/dashboard/profile` · `GET`/`PUT
  /domains/registrant`): el cliente edita sus datos de titular (1 por cliente —
  ADR-081 A2); al guardar se persisten en `User`+`ClientProfile` (tx corta) y se
  **propagan al registrar** (`contacts/modify` → todos sus dominios, capability-routed)
  fuera de tx (DC.NEW-66) + verify-after-write. **Aviso ICANN** si cambia el nombre
  (verificación + lock de transferencia 60d). Si la propagación falla (perfil
  incompleto → `REGISTRANT_INELIGIBLE`, o proveedor caído), el perfil se guarda
  igualmente y el resultado lo refleja. *(La inline action per-dominio `modify_contacts`
  queda como vestigio del contrato — editar el titular es por-cliente, vía el perfil.)*
- **Recovery hints `renew`/`restore`** (`ServiceRecoveryHint` ext., ADR-077 A5): el
  plugin mapea **expirado→`renew`** y **redención→`restore`**; el detalle de dominio
  cliente muestra el CTA correspondiente (renovar = invoice-driven; restaurar = soporte).
- **Borrado en gracia admin** (`deleteDomain`, ADR-081 A3.1; `POST /admin/domains/services/:id/delete`):
  acción **destructiva** (≠ `deprovision` no-op) que borra el dominio en el registrar
  (`domains/delete`, con reembolso si está en gracia) y luego cancela el `service` por
  el lifecycle canónico (`deprovisionAsAdmin` → audit + `service.cancelled`). Fuera de
  la ventana de gracia el registrar rechaza y el servicio NO se cancela. En la UI: menú
  admin del servicio → "Eliminar dominio (gracia)…" con doble confirmación (typing + motivo).

## Qué hace hoy (Sprint 15D.II — transfer-in, **backend en curso**)

> Doctrina congelada en 15D.II.A: [ADR-084 A2](../../10-decisions/adr-084-comercio-dominios-registrar.md#amendments) (mecánica FSM + cobro al completar + DOM-INV-6) · [ADR-077 A14](../../10-decisions/adr-077-contrato-provisioner-plugin-v2.md#amendments) (`ProvisionContext.transferAuthCode`) · [ADR-081 A7](../../10-decisions/adr-081-plugin-resellerclub-specifics.md#amendments) (endpoints RC) · [ADR-082 A5](../../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md#amendments) (zona al completar).

El **transfer-in** (traer un dominio de otro registrar) es **asíncrono** (5-7 días) y se modela como una FSM en `services.metadata.transfer_state`:

```
pending → awaiting_auth → submitted → {completed | failed} | cancelled
```

> **Cobro AL COMPLETAR (decisión Yasmin):** a diferencia de un registro (que se factura en el checkout), un transfer **no se cobra al pedirlo** — la factura se genera cuando el transfer **completa**. Un fallo/cancelación no cobra; el reintento no re-cobra.

> **Entrada = CARRITO ÚNICO (T2c.3):** el transfer se pide como cualquier compra. El checkout flagea los ítems `transfer_in` como **`deferBilling`** → se crea el `service` `pending` (`transfer_state='pending'`) **excluido de la factura** (la factura es **nullable** si el carrito es solo-transfers). El **EPP auth-code** se aporta **después** del checkout (fuera del carrito: es secreto R12 y no debe bloquear el checkout en la API del registrar).

Construido (backend + entrada, verde + boot smoke 4/4 en cada fase):

- **Transporte** (T1): cliente RC `validateTransfer`/`transferDomain`/`resendTransferRfa`/`cancelTransfer`; el `MockResellerClubServer` simula la FSM (endpoint test-only `/__test__/advance-transfer`).
- **Plugin FSM-init** (T2a): `provision('transfer_in')` valida transferibilidad e inicia el transfer; sin auth-code → `awaiting_auth`. **DOM-INV-6** (exactly-once de iniciación, espejo de DOM-INV-1): reintento puro por `provider_reference` + adopción de un transfer ya en curso bajo nuestra cuenta (recovery tras crash). Arranca **asíncrono** (no activa el servicio).
- **Motor de la FSM** (T2b): el reconcile cron avanza los transfers en curso — `getTransferStatus` (lee `domains/details`→`actionstatus`) + `advanceTransfer`: `completed` → activa el servicio + puebla `expires_at` + emite `domain.transfer_completed` (Outbox); `failed`/`cancelled` → cierra la FSM (fail-soft si RC caído).
- **Iniciación síncrona** (T2c.1): `ProvisioningOrchestratorService.initiateTransferIn(serviceId, authCode)` — el **EPP auth-code** viaja **en memoria** (R12: NUNCA por la cola Redis ni por `metadata`); `INVALID_AUTH_CODE` → `awaiting_auth` (el cliente reenvía un código corregido).
- **Cobro al completar** (T2c.2): `GenerateInvoiceOnDomainTransferCompletedListener` (billing) consume `domain.transfer_completed` → genera la factura del transfer con el precio snapshotado en `services.amount` (idempotente + best-effort; **R4**: billing consume el evento, el reconcile no conoce billing).
- **Entrada — carrito único** (T2c.3): el checkout (`POST /billing/checkout/items`) acepta ítems `domain` con `operation:'transfer_in'` y los crea como **`deferBilling`** (service `pending`, `transfer_state='pending'`, **fuera de la factura**; factura nullable si el carrito es solo-transfers). El cliente aporta el auth-code después vía **`POST /domains/:id/transfer/submit-auth`** (owner/admin + guarda de estado FSM; R12: el código viaja en memoria a `initiateTransferIn`). **`POST /domains/transfer-quote`** devuelve el precio de transfer (server-side R5) para el carrito. **Frontend:** pestaña *Transferir* en `/dashboard/store/domains` (misma cesta única que *Registrar*) + panel del código EPP en `/dashboard/domains/:id` (gated por `service.transfer_state`).
- **Cierre de la FSM** (T3): **eventos** `domain.transfer_initiated` (orquestador, al llegar a `submitted`) + `domain.transfer_failed` (reconcile `advanceTransfer`, con `reason`) vía **Outbox** (R8). **Notificaciones** (`NotificationsOnDomainTransferListener` → email + campana al cliente en iniciada/completada/fallida; CTA al detalle del dominio). **Zona DNS al completar** ([ADR-082 A5](../../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md#amendments)): `ReconcileDomainNsOnTransferCompletedListener` sobre `domain.transfer_completed` → si hay **hosting hermano** activo, conmuta los NS a Aelium (`switchToAeliumIfParked`, capability-routed R4, idempotente, fail-soft); **sin hosting → aparca** (mismo modelo que register A4); **crea, no migra** (los records BYOD del registrar de origen no se importan en v1). **Reintento** (A2.5): `submit-auth` también acepta `failed`/`cancelled` → limpia `provider_reference` + reabre a `pending` + reinicia con un nuevo código (no re-cobra); el panel del detalle muestra el formulario de reintento.

**Pendiente de 15D.II** (próximas fases): **R** restore (RGP) — `restoreDomain`→`domains/restore`, cierra el CTA `recoveryHint='restore'` · **S** buscador rico (suggest v5/bulk) · **G** smoke OT&E real + cierre. Shapes de transfer **CONSERVADORES** hasta el smoke (A7.4). **Nota operativa:** las 6 plantillas de notificación de transfer requieren re-seedear (`prisma/seeds/notification-templates.ts`).

## Cobertura de tests (red de seguridad L20)

CI usa **siempre** el `MockResellerClubServer` (Express, alta fidelidad — modela los
shapes y errores reales de RC), nunca OT&E live (ADR-081 §11). El flujo de dominios
está cubierto en cuatro niveles complementarios:

| Suite | Nivel | Qué ejercita |
|-------|-------|--------------|
| `api/client.integration.spec.ts` | cliente ↔ mock (unit) | Cada método HTTP del cliente aislado: availability, pricing, register/renew/details, gestión, suspend + errores (auth inválida, premium, `.es` sin NIF). |
| `resellerclub.plugin.spec.ts` | plugin (cliente mockeado) | Lógica de los handlers con el cliente mockeado: DOM-INV-1 (adopción), DOM-INV-4 (renovación verificada), mapeo de errores RC→canónicos, guardas de `executeAction`. |
| `resellerclub.plugin.integration.spec.ts` | plugin ↔ mock (unit) | **Vertical de gestión:** `executeAction` (write) → `getServiceInfo` (read `DomainInfo`) contra shapes reales — NS verify-after-write, privacy round-trip, registrar-lock ⇒ auth-code bloqueado, suspend ⇒ `availableActions` reordenadas. |
| `test/integration/resellerclub-{register,renew,ns-switch,registrant}.e2e-spec.ts` | wrapper + Postgres + mock (e2e) | End-to-end contra Postgres real: advisory lock + persistencia de customer/handles, `expires_at` que avanza (DOM-INV-4), el switch **parking→Aelium** (idempotente + no-clobber), y `updateRegistrantContact` (propaga el WHOIS + `nameChanged` + `domainsAffected`). |
| `admin-domains.service.spec.ts` · `domain-registrant.service.spec.ts` · `domain-pricing-sync-registry.service.spec.ts` | servicios admin (unit) | Pricing (listar/sync/override con guard de margen) · perfil de titular (persistencia + auto-push best-effort) · `deleteDomain` (borra + cancela) · registry de sync de precios. |

Los `*.e2e-spec.ts` requieren Postgres (`docker compose -f docker/docker-compose.dev.yml up -d postgres`)
y corren con `pnpm --dir backend test:e2e` **en serie** (`maxWorkers:1` en `jest-e2e.json`):
comparten el Postgres de dev (quirúrgicos por fila, no truncan tablas) y las secuencias de
id del mock colisionan en paralelo. El resto corre en la suite unit (`pnpm --dir backend test`).

## Pendiente (fases siguientes)

- ~~**15D.F.2:** buscador + `POST /domains/check-availability` (REST) + DOM-INV-5 rico
  pre-checkout (`.es` NIF / `.eu` residencia)~~ ✅ (PR #113). El checkout de registro se
  materializó en F.4; `modify_contacts` enriquecido se difirió a 15D.G.
- ~~**15D.F.3:** zona DNS post-register~~ ✅ — gate Enhance verificado (sin primitiva de
  zona sin website) → **dominio-solo aparca en NS del registrar** ([ADR-082 A4](../../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md#amendments)); conmuta a Aelium al añadir hosting. Diferido: cancel→SERVFAIL (DC.NEW-71).
- ~~**15D.F.4:** frontend de dominios~~ ✅ (PR #114) — buscador + gestión + Tienda + carrito único.
- **15D.G (cierre):** ~~red E2E/integración (sandbox/mock)~~ ✅ · ~~gestión de precios admin~~ ✅ ·
  ~~perfil de titular + propagación (`modify_contacts`)~~ ✅ · ~~recovery hints renew/restore~~ ✅ ·
  ~~`deleteDomain` admin en gracia~~ ✅ · doc operativa ✅. **Falta: smoke OT&E real** (Yasmin
  — refina los shapes `register`/`details`/gestión conservadores, ADR-081 A1.5) · retrospectiva.

## Notas operativas

- **Cancelar un servicio de dominio NO borra el dominio en RC** (deprovision =
  no-op): el dominio está pagado y persiste hasta su expiración (ADR-081 A3.1).
  El borrado en período de gracia (reembolso) es una **acción admin explícita**
  (`deleteDomain` — menú admin del servicio, doble confirmación; 15D.G).
- Testing: CI usa siempre el `MockResellerClubServer`, nunca OT&E live
  (ADR-081 §11).
