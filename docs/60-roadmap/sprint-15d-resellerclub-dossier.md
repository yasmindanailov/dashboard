# Sprint 15D — Plugin ResellerClub · Dossier de pre-sprint

> **Tipo:** Pre-sprint research dossier (no es plan de sprint activo).
> **Estado:** 🚀 **PROMOVIDO A SPRINT ACTIVO (2026-05-21).** Fase 15D.A (doctrina) ✅ mergeada (PR #100) + Fase 15D.B0 (research) ✅ documental (PR #101). Estado vivo en [`current.md` §Sprint 15D](./current.md). Siguiente paso: **Fase 15D.B** (código).
> **Origen:** Sesión Yasmin ↔ Claude del 2026-05-07 (post merge Sprint 15A `bee90d8`).
>
> ⚠️ **DOCTRINA VIGENTE = los ADRs, NO este dossier.** Esto es *research de pre-sprint* (2026-05-07). El **cotejo de planificación 2026-05-21** refinó varias decisiones; los ADRs **[077 A10](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md) · [082 A2](../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md) · [084](../10-decisions/adr-084-comercio-dominios-registrar.md) · [081](../10-decisions/adr-081-plugin-resellerclub-specifics.md)** ganan sobre lo apuntado aquí (Lección L18). **Correcciones clave** (el dossier NO se reescribe; se anotan):
> - **Pre-register handshake `domain.zone_pre_create` (dec. 11, T10, fase 15D.E) → DESCARTADO.** La zona DNS se crea **post-register vía orquestador** (decisión D1, [ADR-082 §A2.2](../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md)).
> - **"Cinco invariantes DH-INV-1..5" (§3.1) → SON SEIS** (DH-INV-6 "Enhance gana en conflicto", ADR-082) + nuevo flujo **F5** "solo dominio".
> - **Mapping de estado (dec. 13) → `ServiceInfoStatus`** (no el enum `ServiceStatus`; valores `…|unknown`) — [ADR-081 §6](../10-decisions/adr-081-plugin-resellerclub-specifics.md).
> - **Tablas `resellerclub_*` → PK natural `user_id`** + lazy create con advisory lock — [ADR-081 §3/§4](../10-decisions/adr-081-plugin-resellerclub-specifics.md).
> - **Empaquetado → 2 sprints por madurez**: 15D core (register+renew+gestión, **+ DOM-INV-1..5** incl. margin guard y renovación verificada tras [ADR-084 A1](../10-decisions/adr-084-comercio-dominios-registrar.md)) → 15D.II (transfer-in FSM + premium); robustez **DOM-INV-1..5** y contrato de registrar canónico `is_domain_registrar` ([ADR-077 A10](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md), [ADR-084](../10-decisions/adr-084-comercio-dominios-registrar.md)).
> - **Hallazgo B0**: la API está tras **Cloudflare WAF** (IP whitelist obligatoria) — ver [`docs/_research/sprint-15d/`](../_research/sprint-15d/).
>
> **Para retomar:** lee los 4 ADRs de arriba + [`current.md` §Sprint 15D](./current.md) (plan de fases) + [`docs/_research/sprint-15d/`](../_research/sprint-15d/). El research empírico OT&E queda pendiente de IP estable (DC.NEW-62).

---

## 1. Por qué este dossier existe

El sprint 15D arrancó como conversación de planning el 2026-05-07. Antes del primer commit de código, la iteración con Yasmin descubrió:

1. **El modelo dominio↔hosting** del proyecto no estaba escrito (era doctrina implícita en código).
2. **La capa DNS** se había modelado como capability del plugin RC, pero la realidad técnica del stack Aelium (servidor dedicado con Enhance CP corriendo PowerDNS) la ubica en el plugin Enhance.
3. **El orden de sprints** (15D antes de 15C) era operativamente roto — registrar dominios apuntando a NS de un Enhance sin plugin equivale a dominios técnicamente caídos.

La conversación produjo decisiones **arquitectónicamente densas** que se perderían si se pierde el contexto de chat. Este dossier las captura. Sirve a tres propósitos:

- **Memoria institucional**: cuando dentro de N semanas se abra Sprint 15D, no se reabre el debate.
- **Input formal de ADRs futuros**: ADR-077 Amendment A1 + ADR-082 + ADR-081 toman su contenido literal de aquí.
- **Inventario de deuda consciente**: lo que se difiere queda con razón.

---

## 2. Decisión de inversión: Sprint 15C antes de Sprint 15D

### Motivo técnico

Aelium tiene un servidor dedicado con **Enhance CP** que incluye PowerDNS como autoridad DNS. Las hostnames `ns1.aelium.net` y `ns2.aelium.net` están configuradas en Cloudflare apuntando (A record) al IP del servidor dedicado.

Cuando un dominio se registra con NS = `ns1/ns2.aelium.net`, las queries DNS del mundo llegan a esa IP. **PowerDNS de Enhance solo responde si tiene la zona creada para ese dominio**. Si no la tiene → `SERVFAIL` / `REFUSED` → dominio técnicamente caído.

Sprint 15D solo (sin Enhance plugin) registraría dominios apuntando a un Enhance que el dashboard no sabe configurar. La zona DNS no se crearía automáticamente. Resultado: dominios "muertos" desde el momento del registro hasta que Sprint 15C cierre (potencialmente días o semanas), con TTL de propagación NS de 24-48h alargando la cola del problema.

### Alternativas consideradas y rechazadas

| Alternativa | Por qué NO |
|---|---|
| Mantener orden 15D → 15C, registrar con NS RC default, migrar después | Refactor doloroso: cambiar NS de TODOS los dominios + recrear records en Enhance + coordinar corte. Riesgo de romper email (TXT SPF/DKIM) en migración. |
| Sprint 15D incluye creación manual de zona en Enhance vía SSH | Rompe Regla R4 (no acoplar plugins entre sí). Doble trabajo + doble testing en 15C. |
| Cloudflare DNS gestionado por Aelium con vanity NS | Requiere Cloudflare Enterprise plan. Coste prohibitivo v1. |
| BIND/PowerDNS standalone como puente | Añade infra propia + mantenimiento. Enhance ya lo hace. |
| Dominio en RC con NS RC, hosting separado | Modelo dos zonas → records duplicados, configuración fragmentada. UX rota. |

### Decisión

**Sprint 15C Enhance CP arranca primero.** Cuando cierre, Sprint 15D RC se construye sobre el ecosistema ya funcional:

- `has_dns_management` capability ya añadido a `PluginCapabilities` (ADR-077 Amendment A1, en 15C).
- ADR-082 Domain↔Hosting + DNS doctrine escrito (en 15C).
- Listener `auto-config-dns-on-hosting-provisioned` implementado (en 15C).
- Setting `provisioning.default_nameservers` poblado (`ns1.aelium.net` / `ns2.aelium.net`).
- `EnhanceProvisionerPlugin` registrado y operativo, sirviendo zonas DNS.

Sprint 15D entonces se reduce a **registrar puro** sin solapar con DNS management.

### Cambio en backlog

- **P2.3** = ~~Sprint 15D~~ → **Sprint 15C — Plugin Enhance CP** (era P2.4).
- **P2.4** = ~~Sprint 15C~~ → **Sprint 15D — Plugin ResellerClub** (era P2.3).

ADR-070 §"Doctrina de orden" lo permite: dice "Plugin Framework antes de plugins concretos" + "Plugins SaaS antes que Sprint 10", sin prescribir RC antes de Enhance.

---

## 3. Modelo canónico Domain ↔ Hosting (input para ADR-082)

> **Doctrina transversal** que aplica a todos los registrar plugins futuros (RC, Hexonet, OpenSRS) y a todos los hosting plugins (Enhance, Docker, futuro cPanel).

### 3.1. Cinco invariantes

| # | Invariante | Justificación |
|---|---|---|
| **DH-INV-1** | **Hosting service SIEMPRE tiene un FQDN** asociado (`service.domain` no nulo). | Requerimiento técnico de cada control panel (cPanel/Plesk/Enhance/DirectAdmin/Docker+Traefik). Sin dominio no hay routing posible. |
| **DH-INV-2** | **Hosting plugin rechaza `provision()` si `service.domain` es null o malformed.** | Defensa en profundidad. `INVALID_PAYLOAD` con mensaje claro. |
| **DH-INV-3** | **Domain service puede vivir solo** (sin hosting asociado obligatorio). | Casos: defensa de marca, futuro proyecto, redirect, dominio aparcado. |
| **DH-INV-4** | **Domain ↔ hosting linkage = string `services.domain`, NO foreign key.** | Permite "bring your own domain" (dominio externo válido como puntero del hosting). WHMCS lo modela igual desde 2007. Aelium ya está modelado así (`schema.prisma:456`). |
| **DH-INV-5** | **Renewal cycles independientes.** Cancelar uno NO cancela el otro. | Dominio anual, hosting variable. Invoices separadas por cada uno. Si dominio expira, hosting queda inalcanzable pero técnicamente activo (Aelium debe notificar al cliente). |

### 3.2. Cuatro flujos canónicos de checkout

| Flujo | Caso | Provisioning |
|---|---|---|
| **F1** Register new domain + buy hosting (60-70% industria) | 2 line items en misma factura. | Registrar primero (síncrono RC), hosting después (Enhance/Docker). Listener auto-config DNS añade A records al hosting. 2 services con renewal cycles independientes desde día 1. |
| **F2** Use existing Aelium-managed domain + buy hosting | 1 line item (solo hosting). | Hosting service se crea con `domain=<FQDN existente>`. Listener auto-config DNS añade records. Dominio existente no se re-toca. |
| **F3** BYOD (Bring Your Own Domain externo) + buy hosting | 1 line item (solo hosting). | Hosting service con `domain=<FQDN externo>`. NO existe service Aelium para ese dominio. NO hay auto-config DNS posible. Aelium presenta instrucciones al cliente para configurar A records en su registrar externo (o cambiar NS a Aelium). NO hay renewal alerts del dominio (no es responsable). |
| **F4** Transfer-in domain + buy hosting | 2 line items. | Hosting se provisiona inmediatamente con dominio externo (estado F3). Transfer-in arranca asíncrono (5-7 días). Cuando completa → evento `domain.transfer_completed` → listener bridge auto-config DNS dispara → email "Tu dominio ya está gestionado por Aelium, DNS configurado". |

### 3.3. DNS como capability del registrar plugin (NO producto separado)

**Doctrina canónica industria estándar (WHMCS / Blesta / HostBill desde 2007):**

> DNS records management = capability del plugin del registrar, NO un producto separado.

**Razones:**

1. **Cliente no paga aparte por DNS** — 99% registrars incluyen DNS gratuito al registrar.
2. **API del proveedor lo trata así** — endpoints DNS scopados al `order-id` del dominio.
3. **Modelo mental cliente** — "mi dominio incluye gestión DNS" es la expectativa universal.
4. **UX coherente** — cliente abre `/dashboard/services/[id]` del dominio y gestiona allí NS + records.

**Excepción Aelium**: con `ns1/ns2.aelium.net` como default, **la autoridad DNS NO es RC sino Enhance**. Por tanto el flag `has_dns_management` queda:

| Plugin | `has_dns_management` |
|---|---|
| `internal` / `manual` | `false` |
| `resellerclub` | **`false`** (NS por defecto van a Aelium, no a RC) |
| `enhance_cp` | **`true`** (la autoridad DNS real) |
| `docker_engine` (Sprint 15E) | `false` (los hostings Docker no son autoridad DNS de los dominios cliente) |
| Futuro `cloudflare_dns` (hipotético) | `true` |

**UI condicional al servir DNS records management** (en `/dashboard/services/[id]` del dominio):

```
plugin_que_sirve_dns(domain) === 'enhance_cp' if domain.nameservers === provisioning.default_nameservers
                                === 'externo' otherwise
```

- Si NS apuntan a Aelium → la UI de DNS records se renderiza con acciones via Enhance plugin.
- Si NS apuntan a externos → banner "Este dominio usa DNS externo en `<external_ns>`. Gestiona allí." + botón curado `modify_ns` (con `confirm_required: true` + texto explicando impacto: rompe email + records).

### 3.4. NS configuration en 3 capas (sincronización requerida)

La configuración de `ns1/ns2.aelium.net` vive físicamente en **3 lugares** que deben coincidir:

| Capa | Dónde vive | Quién lo gestiona | Cómo |
|---|---|---|---|
| **C1** Glue records de `aelium.net` | Cloudflare (zona `aelium.net`) + WHOIS del registrar de `aelium.net` | Yasmin manualmente (ops) | A records `ns1` / `ns2` apuntando al IP del servidor dedicado |
| **C2** Default NS de zonas Enhance | Panel Enhance del servidor dedicado | Yasmin manualmente al setup | `Settings → DNS → Default nameservers for new zones: ns1.aelium.net + ns2.aelium.net` |
| **C3** Setting Aelium dashboard | DB tabla `Setting` categoría `provisioning` key `default_nameservers` | Superadmin via `/admin/settings/provisioning` (Sprint 12 expone UI; bootstrap via seed mientras tanto) | `value = ['ns1.aelium.net', 'ns2.aelium.net']` |

**Por qué setting global y NO config del plugin Enhance:**

- Múltiples consumidores (RC + Enhance + futuros email/SSL plugins) — vivir en plugin = acoplamiento + violación R4.
- No es propiedad de un plugin — es decisión operativa del operador del dashboard.
- Permite cambio sin redeploy + auditable (`audit_change_log`).

**Estrategia de sync v1**: manual. Documentación operativa explícita: si cambias C2, cambia C3 (y viceversa). C1 solo cambia si migras IP del servidor.

**Estrategia de sync v2** (deuda DC.NEW-1): bootcheck automatizado en backend startup que verifica las 3 capas con `dig +short NS <test_domain>` y compara con setting. Alerta superadmin si discrepa. NO bloquea boot.

---

## 4. Catálogo exhaustivo ResellerClub API — 61 endpoints

> **Fuentes citadas:**
> - [phillipsdata/logicboxes commands/](https://github.com/phillipsdata/logicboxes/tree/master/commands) — wrappers PHP open-source que mapean 1:1 cada `LogicboxesXxx::method()` → endpoint API.
> - [docs.blesta.com/integrations/modules/logicboxes/](https://docs.blesta.com/integrations/modules/logicboxes/) — features oficiales del módulo Blesta.
> - [hostbillapp.com/.../resellerclub/](https://hostbillapp.com/hostbill/domainmanagement/registrars/resellerclub/) — features HostBill registrar.
> - [resellerclub-mods.com/.../resellerclub-tools-docs.php](https://www.resellerclub-mods.com/whmcs/resellerclub-tools-docs.php) — extras WHMCS que indican gaps del módulo oficial (gold standard de "qué pediría un cliente WHMCS-experimentado").
> - [docs.whmcs.com/ResellerClub](https://docs.whmcs.com/ResellerClub) — módulo benchmark oficial WHMCS.
>
> **Caveat:** el KB oficial de ResellerClub (`manage.resellerclub.com/kb`) bloquea fetches automatizados con Cloudflare. El catálogo se construyó cross-referenciando wrappers PHP en producción + 3 plataformas billing (WHMCS / Blesta / HostBill) + búsquedas dirigidas. Cobertura estimada: **~95%**. Endpoints recientes (2025-2026) podrían faltar y se descubren al implementar.

### 4.1. Endpoints agrupados por bloque funcional

> Marcado de audiencia: 🧑 cliente · 🛠️ admin · ⚙️ interno (no expuesto)

**A. Pre-venta — buscador y catálogo** (6)

| # | Feature | Endpoint | Audiencia |
|---|---|---|---|
| A1 | Comprobar disponibilidad single+bulk | `domains/available` | 🧑 dashboard + landing |
| A2 | IDN check (dominios internacionalizados, `münchen.de`) | `domains/idn-available` | 🧑 |
| A3 | Sugerencias de nombres | `domains/suggest-names` | 🧑 |
| A4 | Premium domain check (precio dinámico) | `domains/premium-check` | 🧑 |
| A5 | Lista de TLDs soportados + categorías | `products/category-keys` | ⚙️ + 🛠️ |
| A6 | Precio mayorista (cost) por TLD/años | `products/customer-price` | ⚙️ + 🛠️ |

**B. Provisioning — registro, transfer-in, renewal, restore** (8)

| # | Feature | Endpoint | Audiencia |
|---|---|---|---|
| B1 | Registrar dominio nuevo | `domains/register` | ⚙️ via `invoice.paid` |
| B2 | Iniciar transfer-in | `domains/transfer` | ⚙️ |
| B3 | Validar transfer-in pre-flight | `domains/validate-transfer` | ⚙️ |
| B4 | Reenviar email aprobación transfer | `domains/resend-rfa` | 🛠️ |
| B5 | Cancelar transfer pendiente | `domains/cancel-transfer` | 🛠️ |
| B6 | Renovar dominio | `domains/renew` | ⚙️ via `invoice.paid` (idempotente) |
| B7 | Eliminar orden (grace ≤5 días post-registración) | `domains/delete` | 🛠️ |
| B8 | Restaurar dominio en redemption | `domains/restore` | 🛠️ |

**C. Gestión post-venta — lifecycle del dominio** (8)

| # | Feature | Endpoint | Audiencia |
|---|---|---|---|
| C1 | Detalles completos (estado, expiración, NS, locks, contactos) | `domains/details` / `details-by-name` | ⚙️ via `getServiceInfo` |
| C2 | Buscar/listar órdenes (sync + reconciliación) | `domains/search` | ⚙️ cron 6h |
| C3 | Cambiar nameservers principales | `domains/modify-ns` | 🧑 acción curada (peligrosa, confirm) |
| C4 | Cambiar contactos (registrant/admin/tech/billing) | `domains/modify-contact` | 🧑 form |
| C5 | Toggle whois privacy ON/OFF | `domains/modify-privacy-protection` | 🧑 acción curada |
| C6 | Toggle theft protection (registrar lock) ON/OFF | `domains/enable/disable-theft-protection` | 🧑 acción curada |
| C7 | Get/reset auth code (EPP) — necesario para transfer-out | `domains/modify-auth-code` | 🧑 acción curada |
| C8 | Listar locks aplicados al dominio | `domains/locks` | 🛠️ diagnóstico |

**D. Child nameservers (CNS)** (4) — propios NS del cliente

| # | Feature | Endpoint | Audiencia |
|---|---|---|---|
| D1 | Añadir child NS | `domains/add-cns` | 🧑 power-user |
| D2 | Renombrar CNS | `domains/modify-cns-name` | 🧑 |
| D3 | Cambiar IP de CNS | `domains/modify-cns-ip` | 🧑 |
| D4 | Eliminar IP de CNS | `domains/delete-cns-ip` | 🧑 |

**E. DNS records — servicio DNS de RC** (24) — fuera scope v1 (vive en Enhance plugin tras inversión, ver §5)

| # | Feature | Endpoint | Audiencia |
|---|---|---|---|
| E1 | Activar servicio DNS para el dominio | `dns/activate` | n/a |
| E2-E8 | Añadir record (A, AAAA, CNAME, MX, NS, TXT, SRV) | `dns/manage/add-{type}-record` | n/a |
| E9-E16 | Modificar record (8 tipos + SOA) | `dns/manage/update-{type}-record` | n/a |
| E17-E23 | Eliminar record (7 tipos) | `dns/manage/delete-{type}-record` | n/a |
| E24 | Buscar/listar records | `dns/manage/search-records` | n/a |

**F. Domain forwarding — URL forwarding service** (2)

| # | Feature | Endpoint | Audiencia |
|---|---|---|---|
| F1 | Activar servicio | `domainforward/activate` | 🧑 |
| F2 | Gestionar reglas (`foo.com → https://bar.com/path`) | `domainforward/manage` | 🧑 |

**G. Suspension / cancelación administrativa** (2)

| # | Feature | Endpoint | Audiencia |
|---|---|---|---|
| G1 | Suspender orden | `orders/suspend` | 🛠️ |
| G2 | Reactivar orden | `orders/unsuspend` | 🛠️ |

**H. Customer model en ResellerClub** (8)

| # | Feature | Endpoint | Audiencia |
|---|---|---|---|
| H1 | Crear customer (sign-up) | `customers/signup` | ⚙️ lazy on first domain |
| H2 | Modificar datos customer | `customers/modify` | ⚙️ sync con `Client` |
| H3 | Get customer by username | `customers/details` | ⚙️ |
| H4 | Get customer by ID | `customers/details-by-id` | ⚙️ |
| H5 | Buscar customers | `customers/search` | ⚙️ reconciliación |
| H6 | Generar temp password (3-day) — base SSO al panel RC | `customers/temp-password` | 🛠️ debug |
| H7 | Generar auth token | `customers/generate-token` | 🛠️ |
| H8 | Eliminar customer | `customers/delete` | 🛠️ |

**I. Contact handles — registrant, admin, tech, billing** (9)

| # | Feature | Endpoint | Audiencia |
|---|---|---|---|
| I1 | Crear contact handle | `contacts/add` | ⚙️ lazy |
| I2 | Modificar contact | `contacts/modify` | ⚙️ |
| I3 | Get contact details | `contacts/details` | ⚙️ |
| I4 | Buscar contactos | `contacts/search` | ⚙️ |
| I5 | Get default contacts del customer | `contacts/default` | ⚙️ |
| I6 | Set extension-specific details (.es NIC handle, .uk Reg type, .ca CIRA) | `contacts/set-details` | ⚙️ |
| I7 | Eliminar contact | `contacts/delete` | 🛠️ |
| I8 | Validar contact eligibility para TLD pre-flight | `contacts/validate-registrant` | ⚙️ defensive |
| I9 | Listar coop sponsors (.coop) | `contacts/sponsors` | n/a (no vendemos .coop v1) |

---

## 5. Scope v1 ResellerClub plugin — post inversión 15C primero

> **Total post-inversión: 30 features in / 31 out.** El bloque E (DNS records) sale completo de RC (vive en Enhance plugin). El bloque C3 (modify_ns) entra en RC como acción curada peligrosa. Resto se mantiene del análisis original.

### 5.1. ✅ ENTRA en v1 (30 features)

**Bloque A — Pre-venta + buscador dashboard (5)**: A1, A2, A3, A5, A6.

**Bloque B — Provisioning (8)**: B1-B8 todo (lifecycle indivisible).

**Bloque C — Lifecycle post-venta (8)**: C1-C8 todo. Modify_ns con `confirm_required: true` + texto de impacto explícito.

**Bloque G — Suspension admin (2)**: G1, G2.

**Bloque H — Customer model (5)**: H1, H2, H3, H4, H5.

**Bloque I — Contact handles (8)**: I1-I8.

**Transversales no-API que entran v1:**

| # | Feature | Tipo |
|---|---|---|
| T1 | Buscador `/dashboard/domains/search` con carrito → genera invoice → activa B1 al pago | Frontend + backend |
| T2 | Cron diario `sync-resellerclub-pricing` que importa `products/customer-price`, aplica margen, actualiza tabla `pricing` | BullMQ cron |
| T3 | Cron 6h `sync-resellerclub-orders` que llama `domains/search` para órdenes activas + actualiza `service.expires_at` + detecta cambios externos | BullMQ cron |
| T4 | Setting plugin `markup_percent` (ej. 25%) + `tlds_offered[]` (.com, .net, .org, .es, .eu) + `default_currency=EUR` + `environment` (sandbox/production) | Plugin manifest |
| T5 | Mapeo `Client` Aelium ↔ Customer ResellerClub via `services.metadata.resellerclub_customer_id` (lazy) o tabla `resellerclub_customers` (decisión Sprint 15D) | Plugin internal |
| T6 | Tabla nueva `resellerclub_contact_handles` mapping `Client` ↔ 4 contact handles (registrant/admin/tech/billing) | Tabla nueva |
| T7 | Audit completo de cada llamada API en `audit_change_log` + `audit_access_log` | Hooks `getServiceInfoWithCache` + `executeActionWithCacheInvalidation` |
| T8 | Circuit breaker via framework Sprint 15A | Heredado |
| T9 | Tests E2E con `MockResellerClubServer` (Express stub local) | E2E |
| T10 | Pre-register handshake: emitir evento `domain.zone_pre_create` que listener Enhance consume → crea zona DNS vacía ANTES de `domains/register` con NS=Aelium | Cross-plugin |

### 5.2. ❌ FUERA de v1 — diferido con razón (31 features)

| Feature | Por qué fuera | Cuándo vuelve |
|---|---|---|
| A4 Premium domains | Precio dinámico rompe `pricing` table; flujo checkout distinto | v1.1 si demanda real |
| D1-D4 Child Nameservers | Solo power-users; cliente típico no los usa | v1.1 sub-sprint 0.5 sesión |
| **E1-E24 TODO el bloque DNS de RC** | **Capability vive en Enhance plugin tras inversión** (15C). RC declara `has_dns_management: false`. | Ya cubierto por Enhance plugin desde Sprint 15C |
| F1-F2 Domain Forwarding | Servicio separable, no core registrar | v1.1 sub-sprint 1 sesión |
| H6 SSO temp-password al panel RC | Rompe ADR-070 ("Aelium puerta unificada") — cliente no debería usar el panel RC | NUNCA cliente; quizá admin v1.1 |
| H7 Generate auth token | Mismo problema SSO | v1.1 admin |
| H8 Delete customer | Destructive raro; admin lo hace via panel RC en directo si necesita | v1.1 admin |
| I9 Coop sponsors | Solo aplica a `.coop`, NO está en TLDs v1 | Cuando se añada `.coop` |

---

## 6. Decisiones técnicas frozen para Sprint 15D

> Estas decisiones se tomaron en el chat 2026-05-07 y entran a ADR-081 cuando se redacte. **No se reabren** salvo razón nueva documentada.

### 6.1. Decisiones de scope

1. **TLDs v1**: `.com`, `.net`, `.org`, `.es`, `.eu`. Configurable via setting `plugin.resellerclub.tlds_offered[]` para añadir más sin cambio de código.
2. **Solo registration + transfer-in v1**. NO premium domains (A4 fuera).
3. **Whois privacy ON por defecto siempre**, gratuito. Estándar industria 2024+, GDPR-friendly. Cliente puede desactivarla via acción curada `toggle_privacy_protection` (C5) si lo pide.

### 6.2. Decisiones técnicas

4. **Auth flow**: `auth-userid + api-key` (NO `auth-userid + auth-password`, más débil).
5. **Customer model**: lazy create. Primera vez que `Client` Aelium contrata dominio → plugin crea customer en RC con datos del `Client`. Mapping en `resellerclub_customers` tabla nueva (mejor que `services.metadata` para consultas cross-service).
6. **Contact handles**: 4 handles (registrant/admin/tech/billing) creados lazy al primer dominio del cliente. Reutilizados para todos sus dominios. Mapping en `resellerclub_contact_handles` tabla nueva.
7. **Renewal flow**: `provision()` idempotente. Si `service.provider_reference` ya existe → llama a `domains/renew` en lugar de `domains/register`. Documentado en ADR-081 como patrón canónico para todos los plugins recurring.
8. **Sandbox vs production**: configurable en manifest (`environment: 'sandbox' | 'production'` enum). Dev local + CI E2E → sandbox. Producción → production. Credenciales independientes en `secrets` schema.
9. **Default NS al registrar**: `provisioning.default_nameservers` setting global = `['ns1.aelium.net', 'ns2.aelium.net']`. Plugin RC lee este setting al hacer `domains/register?ns=...`.

### 6.3. Decisiones DNS (post-inversión)

10. **Plugin RC declara `has_dns_management: false`**. La autoridad DNS es Enhance, no RC.
11. **Pre-register handshake**: ANTES de llamar `domains/register` con NS=Aelium, plugin RC emite evento `domain.zone_pre_create { domain, plannedNameservers }`. Listener (vive en `provisioning` core) lo consume y llama a Enhance plugin para crear zona DNS vacía con SOA + NS records correctos. Si Enhance falla → register se aborta con `PROVISIONING_PRECONDITION_FAILED`. Garantiza que el dominio nunca queda apuntando a Enhance sin zona.
12. **NO se llama a `dns/activate` ni a ningún endpoint de E1-E24** — Aelium no usa DNS de RC.

### 6.4. Decisiones lifecycle multi-axis

13. **Mapping status RC → Aelium canónico** (`ServiceStatus`):
    - `entityStatus=Active && currentstatus=ok` → `active`
    - `entityStatus=Suspended` → `suspended`
    - `expires_at < now` → `expired`
    - `actionstatus=pending verification` (ICANN RAA) → `pending`
    - `entityStatus=Deleted` → `cancelled`
    - Otros → `failed`
14. **Webhook vs polling**: polling cron 6h v1. Webhook (`domains/search`) llega en v1.1 si encontramos casos donde 6h de delay duele.

### 6.5. Decisiones operativas

15. **Pricing markup**: setting `plugin.resellerclub.markup_percent` (default 25%). Cron diario importa `products/customer-price`, aplica margen, actualiza tabla `pricing`. Admin puede sobreescribir manualmente cualquier `pricing` row si quiere precio fijo distinto al markup.
16. **Suspend/unsuspend admin**: G1/G2 expuestos como acciones admin en `/admin/services/[id]` para casos de impago, fraude o ICANN takedown.

---

## 7. Estimación de esfuerzo Sprint 15D (post-inversión)

| Fase | Contenido | Estimación |
|---|---|---|
| 15D.A | ADR-081 ResellerClub specific (auth flow, customer/contact mapping, renewal idempotente, mapping multi-axis status, sandbox switching, pricing markup, scope frozen) | 0.5 sesión |
| 15D.B | Cliente HTTP a ResellerClub + types + MockResellerClubServer para tests | 0.5 sesión |
| 15D.C | Plugin core 6 métodos contrato + manifest + DI registration + bootstrap row plugin_installs + tabla `resellerclub_customers` + tabla `resellerclub_contact_handles` | 1 sesión |
| 15D.D | Acciones curadas (modify NS con peligrosity, modify contacts, privacy, lock, auth code, suspend/unsuspend admin) + audit | 0.5-1 sesión |
| 15D.E | Buscador dashboard `/dashboard/domains/search` + endpoint backend + carrito → invoice + integración con cross-plugin handshake `domain.zone_pre_create` | 1 sesión |
| 15D.F | Crons sync (pricing daily + orders 6h) + tests | 0.5 sesión |
| 15D.G | E2E + cierre documental (admin-plugins.md ResellerClub-specific + retrospectiva) | 0.5-1 sesión |

**Total: 3-4.5 sesiones** (reducido vs estimación pre-inversión 4-5 sesiones, gracias a salir DNS records management de scope).

---

## 8. Deuda explícita generada por este dossier

> Items conscientemente diferidos. Se añaden a `backlog.md` cuando Sprint 15D se promueva a sprint activo.

| Ref | Item | Cuándo abordar |
|---|---|---|
| **DC.NEW-1** | Bootcheck consistency C1↔C2↔C3 (Cloudflare ↔ Enhance default NS ↔ Aelium setting `provisioning.default_nameservers`). Backend startup hace `dig +short NS <test_domain> @ns1.aelium.net` y compara con setting. Alerta superadmin si discrepa, NO bloquea boot. | v2 post-producción |
| **DC.NEW-2** | Premium domains support — checkout flow distinto + price dinámico fuera de `pricing` table | v1.1 si demanda real |
| **DC.NEW-3** | IDN domains (`münchen.de`) — puny-encoding + UI input handling | v1.1 si demanda |
| **DC.NEW-4** | Child Nameservers (D1-D4) — power-user feature | v1.1 sub-sprint 0.5 sesión |
| **DC.NEW-5** | Domain Forwarding (F1-F2) — servicio separable, UI propia en `/dashboard/services/[id]/forwarding` | v1.1 sub-sprint 1 sesión |
| **DC.NEW-6** | SRV records DNS (E8/E15/E23) — XMPP/SIP/M365 specifics | v1.1 cuando entre cliente con M365 |
| **DC.NEW-7** | Webhook ResellerClub Order Notifications — alternativa al polling 6h | v1.1 si delay 6h duele |
| **DC.NEW-8** | Bulk import existing domains — solo si Aelium migra clientes con dominios ya en RC | v2 si migración real |
| **DC.NEW-9** | RAA verification reports cron — específico WHMCS, necesario solo si volumen alto | v1.1 |
| **DC.NEW-10** | SSO al panel RC para admin (H6/H7 temp-password / token) — útil para diagnóstico avanzado | v1.1 admin |
| **DC.NEW-11** | Premium DNS plugin separado (Cloudflare DNS / Route53) — para clientes que registran fuera y quieren DNS Aelium con features avanzadas | post Sprint 18 minimum |

---

## 9. ADRs futuros que materializan este dossier

| ADR | Sprint | Contenido |
|---|---|---|
| **ADR-077 Amendment A1** | 15C | Añadir `has_dns_management: boolean` a `PluginCapabilities`. Plugins existentes (`internal`, `manual`) declaran `false`. |
| **ADR-082** Modelo Domain↔Hosting (transversal) | 15C | Las 5 invariantes DH-INV-1..5 (§3.1) + 4 flujos canónicos checkout (§3.2) + DNS-as-capability (§3.3) + 3 capas NS sync (§3.4) + diseño del listener `auto-config-dns-on-hosting-provisioned` (implementación en 15C; otros consumidores como RC + email plugins en sprints futuros). |
| **ADR-081** Plugin ResellerClub specifics | 15D | Decisiones §6 frozen: auth flow, customer/contact lazy create, renewal idempotente, mapping multi-axis status, sandbox switching, pricing markup, scope v1 (30 in / 31 out), pre-register handshake con Enhance, tablas nuevas `resellerclub_customers` + `resellerclub_contact_handles`. |

---

## 10. Cómo reactivar Sprint 15D cuando llegue su turno

Pre-condición: Sprint 15C cerrado y mergeado a master con:
- ADR-077 Amendment A1 mergeado.
- ADR-082 mergeado.
- `EnhanceProvisionerPlugin` operativo en producción local.
- Listener `auto-config-dns-on-hosting-provisioned` registrado y testeado.
- Setting `provisioning.default_nameservers` seedeado.

Pasos:

1. Re-leer este dossier completo.
2. Verificar pre-condiciones contra master actual (`git log` + lectura ADRs).
3. Ajustar §5 (scope) y §6 (decisiones) si algo de Sprint 15C invalidó alguna decisión (poco probable, pero verificar).
4. Crear rama `sprint15d-plugin-resellerclub` desde master sincronizado.
5. Empezar Fase 15D.A: redactar ADR-081 con el contenido frozen de §6 + §5 actualizado.
6. Ejecutar fases 15D.B → 15D.G según §7.

---

## 11. Referencias canónicas

- **ADRs vigentes consumidos**: [ADR-009](../10-decisions/adr-009-estrategia-plugins.md), [ADR-021](../10-decisions/adr-021-provisioners.md), [ADR-070](../10-decisions/adr-070-service-info-sso-acciones-curadas.md), [ADR-077](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md), [ADR-080](../10-decisions/adr-080-plugin-framework.md).
- **Conversación origen**: sesión Yasmin ↔ Claude del 2026-05-07 (post merge Sprint 15A).
- **Schema actual relevante**: `Service.domain` (`String? @db.VarChar(300)`, schema.prisma:456), `ProductType` enum incluye `domain` y `hosting_web` (schema.prisma:293+).
