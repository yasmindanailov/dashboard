# Sprint 15C — Plugin Enhance CP · Dossier de pre-sprint

> **Tipo:** Pre-sprint research dossier (no es plan de sprint activo).
> **Estado:** ⏸ **En cola P2.3, primer plugin real post Sprint 15A.** Cabeza de cola activa P2 — desbloquea Sprint 15D ResellerClub (cuyo dossier ya cuelga aquí en [`sprint-15d-resellerclub-dossier.md`](./sprint-15d-resellerclub-dossier.md)).
> **Origen:** Sesión Yasmin ↔ Claude del 2026-05-07 (post merge Sprint 15A `bee90d8` + post commit dossier 15D `542d589`).
> **Cuándo se promueve a sprint activo:** decisión consciente de Yasmin. Pre-condición técnica: Sprint 15A mergeado en master (✅ cumplido).
> **Frase canónica de arranque (futuro):** *"Lee `docs/60-roadmap/sprint-15c-enhance-cp-dossier.md` + `docs/_research/sprint-15c/orchd-oas3-api.yaml` + `docs/10-decisions/adr-080-plugin-framework.md` + `docs/20-modules/provisioning/contract.md`. Vamos con Sprint 15C — Plugin Enhance CP. Crea rama `sprint15c-plugin-enhance-cp` desde master."*

---

## 1. Por qué este dossier existe

El sprint 15C arrancó como conversación de planning el 2026-05-07, en cadena directa con el dossier 15D ResellerClub que se mergeó horas antes (commit `542d589`). Antes del primer commit de código, la iteración con Yasmin produjo decisiones arquitectónicamente densas que se perderían si se pierde el contexto de chat:

1. **Modelo de tenancy real Enhance**: customer = sub-org en Enhance (no entidad aparte), descubrimiento que simplifica el mapping `Client` Aelium ↔ Enhance y elimina ambigüedad de varios diseños previos.
2. **Mecanismo SSO real**: OTP via `/orgs/{org}/members/{m}/sso` (no impersonate endpoint hipotético) → diseño de 2 calls + redirect 302 para el flujo "abrir mi panel" del cliente.
3. **DNS records management completo confirmado**: 11 record kinds soportados (`A, AAAA, CNAME, TXT, SPF, SRV, NS, MX, PTR, DS, CAA`); per-zone CRUD existe + DNSSEC + Cloudflare proxy flag.
4. **Default DNS records platform-level** (`/v2/settings/dns/default-records`) **reemplazan** el listener inline `auto-config-dns-on-hosting-provisioned` que el dossier 15D pre-fijó: se aplican automáticamente a TODA zona nueva — diseño más limpio, menos código.
5. **Sin webhooks v1**: orchd v12.21.3 no expone webhooks push hacia integraciones (solo `slackNotificationWebhookUrl` que es push DE Enhance HACIA Slack — irrelevante). Reconciliation pull-based confirmado como única vía → 3 capas (60s cache / on-demand / 6h cron).
6. **Doctrina canónica de bidirectionality**: Aelium → Enhance síncrono inmediato; Enhance → Aelium eventual consistency con drift detection. Operacionalmente Enhance gana en conflicto (DH-INV-6 nuevo).
7. **Spec capturado en repo**: el OpenAPI 3.0.3 literal vive en [`docs/_research/sprint-15c/orchd-oas3-api.yaml`](../_research/sprint-15c/orchd-oas3-api.yaml) (588 KB, 20.848 líneas, ~280 paths), con README de research describiendo provenance.

Este dossier sirve a **tres propósitos canónicos** (mismo patrón que el dossier 15D):

- **Memoria institucional**: cuando se abra Sprint 15C, no se reabre el debate. Cada decisión §6 cita línea exacta del spec.
- **Input formal de ADRs futuros**: ADR-077 Amendment A1 + ADR-082 + ADR-083 toman su contenido literal de aquí.
- **Inventario de deuda consciente**: lo que se difiere queda con razón.

---

## 2. Posición canónica en la cola P2 + relación con Sprint 15D

### Recap inversión P2.3 ↔ P2.4 (ya formalizada en dossier 15D §2)

El dossier 15D documentó la inversión: Sprint 15C Enhance CP **antes** que Sprint 15D ResellerClub. Razón técnica: Aelium opera Enhance en server propio con PowerDNS como autoridad DNS real; las hostnames `ns1.aelium.net` / `ns2.aelium.net` apuntan al servidor dedicado. Registrar dominios con NS=Aelium antes de tener Enhance plugin = dominios técnicamente caídos.

**No se reabre la decisión.** Este dossier asume la inversión vigente.

### Posición Sprint 15C en cola activa P2

| Prioridad | Sprint | Estado |
|---|---|---|
| ✅ P2.1 | Sprint 11 — Provisioning (chasis canónico) | Cerrado 2026-05-02 |
| ✅ P2.2 | Sprint 15A — Plugin Framework | Cerrado 2026-05-06, mergeado `bee90d8` |
| **▶ P2.3** | **Sprint 15C — Plugin Enhance CP** | **Cabeza de cola activa — primer plugin real, este dossier** |
| ⏸ P2.4 | Sprint 15D — Plugin ResellerClub | Diferido hasta cierre 15C — dossier completo |
| ⏸ P2.5 | Sprint 10 — Infrastructure | Independiente |
| ⏸ P2.6 | Sprint 15E — Plugin Docker Engine | Emparejado con 10 |
| ⏸ P2.7 | Sprint 12 — Settings + Knowledge Base | Tras plugins reales |

### Relación bidireccional con Sprint 15D

Sprint 15C **produce** la infraestructura transversal que Sprint 15D consume:

| Producción 15C | Consumo 15D |
|---|---|
| ADR-082 mergeado (modelo Domain↔Hosting) | RC plugin lee invariantes DH-INV-1..6 |
| ADR-077 Amendment A1 (`has_dns_management` flag) | RC declara `has_dns_management: false`; Enhance `true` |
| `EnhanceProvisionerPlugin` operativo | RC handshake `domain.zone_pre_create` consume zona Enhance |
| Default DNS records seedeados en Enhance | RC registra dominios sabiendo que zona se autocrea |
| Setting `provisioning.default_nameservers` | RC lee setting al ejecutar `domains/register?ns=...` |

Sin 15C cerrado, 15D registraría dominios sin destino DNS válido. Por eso 15C es **bloqueante operacional** para 15D.

---

## 3. Modelo canónico Domain ↔ Hosting (input para ADR-082) — extiende dossier 15D §3

> **Doctrina transversal**. Aplica a todos los registrar plugins futuros (RC, Hexonet, OpenSRS) y a todos los hosting plugins (Enhance, Docker, futuro cPanel/Plesk).
>
> Este dossier **extiende** lo pre-fijado en [`sprint-15d-resellerclub-dossier.md` §3](./sprint-15d-resellerclub-dossier.md#3-modelo-canónico-domain--hosting-input-para-adr-082) con la sexta invariante (§3.1), revisión doctrinal del listener (§3.5) y el resolver cross-plugin (§3.6).

### 3.1. Seis invariantes (DH-INV-1..6)

| # | Invariante | Justificación |
|---|---|---|
| **DH-INV-1** | **Hosting service SIEMPRE tiene un FQDN** (`service.domain` no nulo). | Requerimiento técnico de cada control panel. Sin dominio no hay routing posible. |
| **DH-INV-2** | **Hosting plugin rechaza `provision()` si `service.domain` null o malformed.** | Defensa en profundidad. `INVALID_PAYLOAD` con mensaje claro. |
| **DH-INV-3** | **Domain service puede vivir solo** (sin hosting asociado obligatorio). | Defensa de marca, futuro proyecto, redirect, dominio aparcado. |
| **DH-INV-4** | **Domain ↔ hosting linkage = string `services.domain`, NO foreign key.** | Permite "bring your own domain" externo. WHMCS lo modela igual desde 2007. Aelium ya está modelado así (`schema.prisma:456`). |
| **DH-INV-5** | **Renewal cycles independientes.** Cancelar uno NO cancela el otro. | Dominio anual, hosting variable. Invoices separadas. |
| **DH-INV-6** ⭐ | **En conflicto operacional, Enhance / panel del proveedor gana sobre Aelium.** Aelium NO es fuente de verdad operacional — es gateway curado de billing + identidad. | Si admin/cliente cambia algo en panel Enhance directamente, reconcile cron actualiza Aelium, no al revés. Excepción: provision/deprovision donde Aelium dispara la acción y persiste el resultado tras éxito en Enhance. |

DH-INV-6 es **nueva en 15C**, no estaba en el dossier 15D. Aclara la doctrina de bidirectionality + simplifica decisiones de race condition (siempre que hay conflicto entre estado Aelium y estado proveedor: gana proveedor).

### 3.2. Cuatro flujos canónicos de checkout (idéntico dossier 15D §3.2)

| Flujo | Caso | Provisioning |
|---|---|---|
| **F1** Register new domain + buy hosting (60-70% industria) | 2 line items en misma factura. | Registrar primero (síncrono RC), hosting después (Enhance). Default DNS records globales del cluster Enhance se aplican a la zona automáticamente. 2 services con renewal cycles independientes desde día 1. |
| **F2** Use existing Aelium-managed domain + buy hosting | 1 line item (solo hosting). | Hosting service se crea con `domain=<FQDN existente>`. La zona DNS del dominio ya existe en Enhance (se creó al registrar/transferir vía RC); el website se mapea a ella. |
| **F3** BYOD (Bring Your Own Domain externo) + buy hosting | 1 line item (solo hosting). | Hosting service con `domain=<FQDN externo>`. NO existe service Aelium para ese dominio. Aelium presenta instrucciones al cliente para configurar A records en su registrar externo (o cambiar NS a Aelium). NO renewal alerts del dominio. |
| **F4** Transfer-in domain + buy hosting | 2 line items. | Hosting se provisiona inmediatamente con dominio externo (estado F3 transitorio). Transfer-in arranca asíncrono (5-7 días). Cuando completa → evento `domain.transfer_completed` → email "Tu dominio ya está gestionado por Aelium, DNS configurado". |

### 3.3. DNS-as-capability (idéntico dossier 15D §3.3, refinado contra spec literal)

| Plugin | `has_dns_management` |
|---|---|
| `internal` / `manual` | `false` (Amendment A1 update obligatorio) |
| `resellerclub` | **`false`** (NS por defecto van a Aelium, no a RC) |
| `enhance_cp` | **`true`** (la autoridad DNS real — PowerDNS via API confirmada en spec) |
| `docker_engine` (Sprint 15E) | `false` |
| Futuro `cloudflare_dns` (hipotético) | `true` |

UI condicional al servir DNS records management (en `/dashboard/services/[id]` del dominio): si `domain.nameservers === setting.default_nameservers` → routea al plugin Enhance. Si NS apuntan a externos → banner "DNS externo en `<ns>`. Gestiona allí." + acción curada `modify_ns` (con `confirm_required: true` + texto explicando impacto).

### 3.4. Tres capas NS sync (revisado vs dossier 15D §3.4)

La configuración `ns1/ns2.aelium.net` debe coincidir en 3 lugares:

| Capa | Dónde vive | Cómo se aplica en 15C |
|---|---|---|
| **C1** Glue records de `aelium.net` | Cloudflare zone + WHOIS del registrar de `aelium.net` | Manual ops Yasmin. **No automático.** |
| **C2** Default NS de zonas Enhance | API Enhance: `POST /v2/settings/dns/default-records` con records `{ kind: 'NS', name: '@', value: 'ns1.aelium.net' }` y `'ns2.aelium.net'` | **Bootstrap automático del plugin** al instalarse + cuando admin cambia setting C3 |
| **C3** Setting Aelium | `Setting` tabla, categoría `provisioning`, key `default_nameservers`, value `["ns1.aelium.net","ns2.aelium.net"]` | Fuente de verdad. Listener `provisioning.default_nameservers_changed` propaga a C2 vía API. |

**Mejora respecto a dossier 15D**: la propagación C3 → C2 ahora es automática vía API (no manual). C1 sigue manual porque vive fuera del cluster Enhance (en Cloudflare/registrar).

### 3.5. Listener `auto-config-dns-on-hosting-provisioned` — REVISADO post-spec

El dossier 15D pre-fijó este listener para "tras provisioning de hosting, añadir A records iniciales (apex + www) a la zona DNS del dominio". **El descubrimiento del endpoint `/v2/settings/dns/default-records` lo hace innecesario** como mecanismo primario:

- Enhance aplica los default records a **TODA zona nueva** automáticamente. No hay race condition: el momento de creación de la zona es atómico con la aplicación de defaults.
- Aelium configura los defaults una sola vez en bootstrap del plugin: `{ kind: 'A', name: '@', value: '<server_ip>' }`, `{ kind: 'A', name: 'www', value: '<server_ip>' }`, `{ kind: 'NS', name: '@', value: 'ns1.aelium.net' }`, etc.
- Cualquier zona creada después hereda esos records. Cero código en runtime de provision.

**Decisión canónica**: el listener queda como **reconciliation defensivo**, NO como creación inline:
- Tras `service.activated` con plugin enhance, listener verifica que la zona tiene los records esperados (defensivo: por si admin cambió defaults después de zona ya creada).
- Si faltan, los añade.
- Si hay records inesperados extra, NO los borra (operador puede haber añadido cosas custom).

Esto es una **mejora arquitectónica** sobre el dossier 15D: menos código activo + lógica más declarativa + cero race condition. ADR-082 documenta el patrón "default records + reconcile defensivo" como canónico para hosting plugins con DNS authority.

### 3.6. Cross-plugin DNS authority resolver (NUEVO en 15C)

El cliente abre `/dashboard/services/[id]` de su **dominio** (provisioner=resellerclub). RC declara `has_dns_management: false`. Para mostrar DNS records, el orquestador `provisioning` debe resolver: "¿quién es la autoridad DNS de este dominio?".

**Diseño canónico**:

```
core/provisioning/dns-authority-resolver.ts

resolveDnsAuthority(service: Service): {
  authority: 'aelium' | 'external',
  plugin: ProvisionerPlugin | null
}
  - Si service.product_type !== 'domain' → authority='aelium', plugin=enhance_cp
    (el hosting tiene su propia zona en Enhance siempre)
  - Si service.product_type === 'domain':
    - Compara service.metadata.nameservers vs Setting.provisioning.default_nameservers
    - Match → authority='aelium', plugin=enhance_cp (la zona vive en cluster Aelium)
    - No match → authority='external', plugin=null (cliente debe gestionar fuera)
```

**Endpoint canónico nuevo**: `GET /api/v1/services/{id}/dns/records` que internamente:
1. Resuelve authority via helper.
2. Si `aelium` → routea al plugin Enhance: `enhancePlugin.executeAction(service, 'list_dns_records', {})`.
3. Si `external` → devuelve 404 + `{ message: 'DNS gestionado externamente', nameservers: [...] }` para que UI muestre banner.

R4 intacto: el plugin RC NO importa el plugin Enhance. El orquestador (no plugin) hace el routing.

ADR-082 documenta este resolver como pieza canónica del core/provisioning, NO del plugin individual.

---

## 4. Catálogo Enhance API — orchd v12.21.3

> **Fuente literal**: [`docs/_research/sprint-15c/orchd-oas3-api.yaml`](../_research/sprint-15c/orchd-oas3-api.yaml). 25 tags / ~280 paths. OpenAPI 3.0.3.
> **Auth canónico** (`securitySchemes`): `bearerAuth` (HTTP Bearer, token Super Admin) + `sessionCookie` (HTTP cookie, login interactivo — no usado). Aelium usa `bearerAuth` exclusivamente.

### 4.1. Bloques funcionales relevantes para Aelium

> Marcado audiencia: 🧑 cliente · 🛠️ admin Aelium · ⚙️ interno (no expuesto)

**A. Auth & test connection**

| # | Path | Método | Uso Aelium |
|---|---|---|---|
| A1 | `/version` | GET | ⚙️ test-connection (idempotente, no requiere auth, devuelve SemVer string) |
| A2 | `/status` | GET | ⚙️ readiness check |
| A3 | `/licence` | GET/PUT | 🛠️ admin: verificar licencia Enhance activa |
| A4 | `/orgs/{master_org_id}/access_tokens` | GET/POST | 🛠️ admin: rotar token Aelium si filtración |

**B. Multi-tenancy — orgs / customers / members / owner / login**

| # | Path | Método | Uso Aelium |
|---|---|---|---|
| B1 | `/orgs` | GET/POST | ⚙️ POST solo en bootstrap (Master org ya existe) |
| B2 | `/orgs/{org_id}` | GET/PATCH/DELETE | ⚙️ GET para resolver `ownerId/ownerLoginId` (fundamental para SSO) |
| B3 | `/orgs/{master}/customers` | GET/POST | ⚙️ POST = lazy create customer al primer hosting |
| B4 | `/orgs/{org_id}/owner` | PUT/DELETE | ⚙️ PUT promueve member a Owner tras crearlo |
| B5 | `/orgs/{org_id}/members` | GET/POST | ⚙️ POST añade login como member con rol |
| B6 | `/orgs/{org_id}/members/{m}` | GET/PATCH/DELETE | ⚙️ admin: gestión miembros |
| B7 | `/orgs/{org_id}/members/{m}/sso` ⭐ | GET | 🧑🛠️ **CRÍTICO** — devuelve OTP URL para SSO impersonation |
| B8 | `/logins` | POST | ⚙️ POST con `?orgId=` crea login del cliente en realm |
| B9 | `/v2/orgs/{org_id}/customers/logins` | GET | 🛠️ admin: listar logins de customers |
| B10 | `/v2/logins/{login_id}/password` | PUT | 🛠️ admin: reset password (cliente olvida password Enhance) |
| B11 | `/login/sessions/sso?otp=<uuid>` | GET | ⚙️ endpoint que el OTP URL llama internamente — Aelium NO llama directamente, solo redirige browser ahí |

**C. Provisioning lifecycle — subscriptions / websites**

| # | Path | Método | Uso Aelium |
|---|---|---|---|
| C1 | `/orgs/{master}/customers/{customer_org_id}/subscriptions` | GET/POST | ⚙️ POST = paso 5 del provision flow (`{ planId }`) |
| C2 | `/orgs/{org_id}/subscriptions/{sub_id}` | GET/PATCH/DELETE | ⚙️ PATCH `{ isSuspended, planId }` = suspend/upgrade. DELETE = deprovision. |
| C3 | `/orgs/{org_id}/subscriptions/{sub_id}/bandwidth` | GET | ⚙️ métrica para `getServiceInfo.metrics.bandwidth` (cache 12h interno Enhance, override `?refreshCache=true`) |
| C4 | `/orgs/{org_id}/subscriptions/{sub_id}/calculate-resource-usage` | PUT | 🛠️ force resync resources (E.ADM.3) |
| C5 | `/orgs/{org_id}/websites` | GET/POST | ⚙️ POST = paso 6 del provision flow (`{ domain, subscriptionId }`) |
| C6 | `/orgs/{org_id}/websites/{ws_id}` | GET/PATCH/DELETE | ⚙️ PATCH `{ isSuspended }` para suspend a nivel website. DELETE para remove individual. |
| C7 | `/orgs/{org_id}/websites/{ws_id}/php-version` | GET/PUT | métrica + (DC.NEW v1.x si demanda inline) |

**D. SSO sub-recursos** (todos diferidos v1, registrar para v1.x)

| # | Path | Uso |
|---|---|---|
| D1 | `/orgs/{org}/websites/{ws}/emails/{email}/sso` | DC.NEW-15C-6 webmail directo |
| D2 | `/orgs/{org}/websites/{ws}/mysql-dbs/{db}/sso` | DC.NEW-15C-7 phpMyAdmin directo |
| D3 | `/orgs/{org}/websites/{ws}/apps/{app}/wordpress/users/{u}/sso` | DC.NEW-15C-8 wp-admin directo |
| D4 | `/orgs/{org}/websites/{ws}/mysql-dbs/{db}/sso` | (idem D2) |

**E. DNS zone & records — autoridad DNS real**

| # | Path | Método | Uso Aelium |
|---|---|---|---|
| E1 | `/orgs/{org}/websites/{ws}/domains/{dom}/dns-zone` | GET/PATCH | 🧑🛠️ GET zone+SOA+records. PATCH SOA (admin only). |
| E2 | `.../dns-zone/records` | POST | 🧑🛠️ create record (manifest action `add_dns_record`) |
| E3 | `.../dns-zone/records/{rec_id}` | PATCH/DELETE | 🧑🛠️ update / delete record |
| E4 | `.../dns-zone/dnssec` | POST/DELETE | DC.NEW-15C-DNSSEC v1.1 |
| E5 | `.../dns-status` | GET | 🛠️ admin diagnose DNS health |
| E6 | `.../dns-query` | GET | 🛠️ admin live query |
| E7 | `/v2/settings/dns/default-records` | GET/POST/PATCH/DELETE | ⚙️ **CRÍTICO** — Aelium configura aquí los defaults A apex/www + NS + MX → toda zona nueva los hereda |
| E8 | `/orgs/{org}/domains/{dom}/auth-ns` | GET | 🛠️ verifica NS authority |

**Record kinds confirmados** (línea 18258 spec): `[A, AAAA, CNAME, TXT, SPF, SRV, NS, MX, PTR, DS, CAA]` — 11 kinds. Aelium v1 expone 7: `A, AAAA, CNAME, MX, TXT, SRV, CAA`.

**F. Métricas & resource usage**

| # | Path | Métrica expuesta en Aelium |
|---|---|---|
| F1 | `/orgs/{org}/subscriptions/{sub}/bandwidth` | `metrics.bandwidthUsedMb` |
| F2 | `/orgs/{org}/subscriptions/{sub}/calculate-resource-usage` | `metrics.diskUsedMb`, `emailAccountsUsed`, `databasesUsed` (response = UsedResourcesFullListing) |
| F3 | `/orgs/{org}/websites/{ws}/metrics` | website-level metrics (línea 9285) |

**G. Acciones admin** (suspend / cancel / upgrade / reset password)

| Acción Aelium curada | Llamada Enhance |
|---|---|
| Suspend subscription completa (impago) | `PATCH /orgs/{org}/subscriptions/{sub}` body `{ isSuspended: true }` |
| Unsuspend | mismo path body `{ isSuspended: false }` |
| Cancel/deprovision | `DELETE /orgs/{org}/subscriptions/{sub_id}` |
| Force cancel (wipe completo) | `DELETE /orgs/{org}/subscriptions/{sub_id}?force=true` (admin only, audit pesado) |
| Change plan (admin only v1) | `PATCH /orgs/{org}/subscriptions/{sub}` body `{ planId: <new> }` |
| Reset hosting password | `PUT /v2/logins/{login_id}/password` body `NewPassword` |

**H. Email accounts & forwards** — diferido v1.x (delegado a Customer Panel via SSO)

`/orgs/{org}/websites/{ws}/emails`, `.../emails/{email}` (CRUD), `.../emails/{email}/password`, `.../emails/{email}/forwards` (CRUD), `.../emails/{email}/autoresponder`, `.../emails/{email}/sso` (D1 arriba).

**I. MySQL databases & users** — diferido v1.x

`/orgs/{org}/websites/{ws}/mysql-dbs`, `.../mysql-dbs/{db}` (CRUD), `.../mysql-dbs/{db}/sql`, `.../mysql-dbs/{db}/sso` (phpMyAdmin), `/orgs/{org}/websites/{ws}/mysql-users` (CRUD).

**J. SSL certificates** — diferido v1.x

`/orgs/{org}/websites/{ws}/ssl/*`, `/v2/domains/{dom}/letsencrypt`, `/v2/domains/{dom}/ssl`. Enhance auto-provisiona Let's Encrypt; CRUD custom cert via Customer Panel.

**K. Backups** — diferido v1.x

`/orgs/{org}/websites/{ws}/backups` (CRUD + restore + directory tree).

**L. Apps & WordPress** — diferido v1.x

`/orgs/{org}/websites/{ws}/apps` (instalación), `.../wordpress/*` (gestión WP completa), `.../joomla/*` (Joomla gestión).

**M. Branding** — NO Aelium scope

`/orgs/{org}/branding/*`. Branding Aelium se configura una vez vía panel Enhance manualmente. Cluster-wide (Aelium = Master org → cascade).

**N. Cluster admin** — NO plugin scope

`/servers/*` (gestión cluster), `/settings/orchd/*` (settings plataforma). Vive en `/admin/infrastructure` (Sprint 10 + ADR-071), no en plugin.

**O. Importers** — para futura migración

`/v2/orgs/{org}/import/*`. Aelium NO migra clientes existentes v1 (sin clientes legacy hosting).

**P. Default DNS records platform** — pieza clave de §3.5

`/v2/settings/dns/default-records` GET/POST + `.../{record_id}` PATCH/DELETE. Plugin Enhance los configura en bootstrap + propaga al cluster.

### 4.2. Schemas críticos (refs literales)

| Schema | Línea spec | Uso Aelium |
|---|---|---|
| `Org` | 15504 | Resolver `ownerId/ownerLoginId` para SSO |
| `NewCustomer` | 15455 | `{ name }` — minimal |
| `LoginInfo` | 16072 | `{ email, password, name }` para crear login |
| `NewMember` | 16238 | `{ loginId, roles }` para promover login a member |
| `OrgOwnerUpdate` | 18444 | `{ memberId }` para promover member a Owner |
| `Role` enum | 16149 | `[Owner, SuperAdmin, Business, SiteAccess, Support, Sysadmin]` |
| `NewSubscription` | 15923 | `{ planId, dedicatedServers?, friendlyName? }` |
| `Subscription` | 15934 | Status, resources, allowances, suspendedBy |
| `UpdateSubscription` | 16013 | `{ status?, isSuspended?, planId?, ... }` (planId updatable = plan change) |
| `NewWebsite` | 16392 | `{ domain, subscriptionId, ...serverIds? }` |
| `Website` | 16448 | id, domain, status, suspendedBy, plan, php, server IPs |
| `DnsRecordKind` enum | 18258 | `[A, AAAA, CNAME, TXT, SPF, SRV, NS, MX, PTR, DS, CAA]` |
| `DnsRecord` | 18130 | `{ id, kind, name, value, ttl, proxy }` |
| `DnsZone` | 18088 | `{ origin, soa, records[], dnssecDsRecords?, dnssecDnskeyRecords? }` |
| `NewDnsRecord` | 18185 | `{ kind, name, value, ttl?, proxy? }` |

---

## 5. Scope v1 Plugin Enhance CP — frozen contra spec literal

**Total: 28 features in / 17+ features out.**

### 5.1. ✅ ENTRA en v1 (28 features)

**Auth & bootstrap (3)**

| # | Feature | Endpoint(s) Enhance |
|---|---|---|
| E.AUTH.1 | Bearer token + Org ID en `manifest.secretsSchema` (apiToken) + `configSchema` (baseUrl, masterOrgId) | — |
| E.AUTH.2 | Test-connection idempotente | `GET /version` (sin auth) o `GET /orgs/{master_org_id}` (auth check) |
| E.AUTH.3 | Lazy create Customer + tabla nueva `enhance_customers (client_id PK, enhance_org_id, enhance_owner_login_id, enhance_owner_member_id)` | `POST /orgs/{master}/customers` |

**Provisioning lifecycle (5)**

| # | Feature | Endpoint(s) Enhance |
|---|---|---|
| E.PROV.1 | `provision()` flujo 6 pasos idempotente (search-by-email + create customer + create login + create member + promote owner + create subscription + create website) | `POST /orgs/{master}/customers`, `POST /logins?orgId=`, `POST /orgs/{cust}/members`, `PUT /orgs/{cust}/owner`, `POST /orgs/{master}/customers/{cust}/subscriptions`, `POST /orgs/{cust}/websites` |
| E.PROV.2 | `deprovision()` cancel subscription | `DELETE /orgs/{org}/subscriptions/{sub_id}` |
| E.PROV.3 | `getStatus()` para reconcile cron | `GET /orgs/{org}/subscriptions/{sub_id}` + `GET /orgs/{org}/websites/{ws_id}` |
| E.PROV.4 | Listener `auto-config-dns-on-hosting-provisioned` como **reconciliation defensivo** (no creación inline — los defaults globales lo hacen automático) | (lectura zone + verificación) |
| E.PROV.5 | Suspend/unsuspend admin (`/admin/services/[id]`) | `PATCH /orgs/{org}/subscriptions/{sub_id}` body `{ isSuspended }` |

**Service info + métricas (1)**

| # | Feature | Endpoint(s) |
|---|---|---|
| E.INFO.1 | `getServiceInfo()` con `display.primary`, `metrics.{disk, bandwidth, emailAccounts, databases}`, `status` mapeado | `GET /orgs/{org}/subscriptions/{sub_id}` + `GET .../bandwidth` + `GET .../calculate-resource-usage` (cache 60s Redis) |

**Acciones inline cliente (3)** — heredan `inlineActions` ADR-077 §4

| # | Feature | Endpoint Enhance |
|---|---|---|
| E.ACT.1 | `reset_account_password` | `PUT /v2/logins/{customer_owner_login_id}/password` |
| E.ACT.2 | `view_disk_usage` (drill-down) | (read de `getServiceInfo.metrics`, sin endpoint nuevo) |
| E.ACT.3 | `view_bandwidth_usage` (drill-down) | (idem) |

**SSO (2 + 1 evento)**

| # | Feature | Endpoint Enhance |
|---|---|---|
| E.SSO.1 | Cliente "Abrir mi panel" → 2 calls + redirect 302 | `GET /orgs/{cust}` (resolve ownerId) + `GET /orgs/{cust}/members/{ownerId}/sso` (OTP URL) |
| E.SSO.2 | Admin Aelium "Abrir panel cliente" (impersonation) | mismo patrón + audit `service.admin_sso_impersonation` |
| E.SSO.3 | Evento canónico `service.admin_sso_impersonation` con flag `gdpr_visible_to_data_subject=true` (visible en `/dashboard/transparency`) | — |

**DNS records management (8)** — pieza pesada del sprint

| # | Feature | Endpoint Enhance |
|---|---|---|
| E.DNS.1 | Endpoint orquestador `GET /api/v1/services/{id}/dns/records` con resolver cross-plugin | `GET /orgs/{org}/websites/{ws}/domains/{dom}/dns-zone` (vía plugin si authority='aelium') |
| E.DNS.2 | Add record (7 tipos: A, AAAA, CNAME, MX, TXT, SRV, CAA) | `POST .../dns-zone/records` body `NewDnsRecord` |
| E.DNS.3 | Update record | `PATCH .../dns-zone/records/{rec_id}` body `UpdateDnsRecord` |
| E.DNS.4 | Delete record | `DELETE .../dns-zone/records/{rec_id}` |
| E.DNS.5 | List records (paginado client-side, zone API devuelve todos) | (parte de E.DNS.1) |
| E.DNS.6 | Listener `domain.zone_pre_create` (handshake con plugin RC futuro 15D) — verifica zona existe antes de RC register | (lectura zone defensiva) |
| E.DNS.7 | Bootstrap default DNS records globales del cluster (A apex, A www, NS) en plugin install + propagación setting `provisioning.default_nameservers` → Enhance | `POST /v2/settings/dns/default-records` |
| E.DNS.8 | Helper `core/provisioning/dns-authority-resolver.ts` (cross-plugin routing por NS comparison) | (no toca Enhance) |

**Acciones admin (2)**

| # | Feature | Endpoint Enhance |
|---|---|---|
| E.ADM.1 | `change_package` admin-only v1 (cliente bloqueado hasta billing prorrateo cross-plan) — DC.NEW-15C-1 | `PATCH /orgs/{org}/subscriptions/{sub_id}` body `{ planId }` |
| E.ADM.2 | `force_resync` admin (recalcular resources tras cambio externo) | `PUT /orgs/{org}/subscriptions/{sub_id}/calculate-resource-usage` |
| E.ADM.3 | Endpoint `POST /api/v1/admin/services/{id}/force-reconcile` para forzar reconcile de un service tras cambio manual conocido | (orquestador, no toca Enhance) |

**Transversales (4)**

| # | Feature | Detalle |
|---|---|---|
| E.X.1 | Cron `reconcile-enhance-services` cada 6h (BullMQ) | Detecta drift: subscription/website missing, status divergence, plan divergence |
| E.X.2 | Audit completo de cada llamada API (heredado wrappers ADR-080) | `audit_change_log` + `audit_access_log` |
| E.X.3 | Circuit breaker (heredado ADR-080) en `getServiceInfoWithCache` + `executeActionWithCacheInvalidation` | — |
| E.X.4 | `MockEnhanceServer` Express stub para CI E2E + fixtures capturados de live durante 15C.B | — |
| E.X.5 | Setting global `provisioning.default_nameservers` (no per-plugin) — fuente de verdad. Listener `provisioning.default_nameservers_changed` propaga a Enhance via E.DNS.7. | — |
| E.X.6 | Evento canónico nuevo `service.reconciled_external_change` con payload `{ service_id, plugin_slug, change_type, expected, actual, detected_at }` + listener `audit-on-service-reconciled-external-change` con flag GDPR | — |
| E.X.7 | Setting `provisioning.enhance_cp.reconciliation_alert_threshold` (default 5 divergencias/día) → si superado, alerta superadmin | — |

> **Nota**: la cuenta dice "transversales (4)" pero realmente son 7 con E.X.5/E.X.6/E.X.7 que se fijaron en el chat 2026-05-07. Total scope v1 final: **28 features in** (3 auth + 5 prov + 1 info + 3 act + 3 sso + 8 dns + 3 adm + 7 transversales — ajuste menor sobre estimación inicial 27).

### 5.2. ❌ FUERA de v1 — diferido con razón (17+ features)

| Feature | Razón fuera v1 | Cuándo vuelve |
|---|---|---|
| **CRUD email accounts** (5+ endpoints) | Customer Panel es el experto: forwarding rules, autoresponders, filters, password policy, quotas. ADR-070 doctrina explícita. | NUNCA dashboard cliente. v1.1 admin si demanda fuerte. |
| **CRUD database accounts + users** (8+ endpoints) | phpMyAdmin embebido en Customer Panel. | NUNCA dashboard cliente. |
| **Backup CRUD + restore** (5 endpoints) | Backup role Enhance gestiona; cliente lo ve via Customer Panel. | DC.NEW-15C-9 v1.1 si demanda |
| **File Manager** | Customer Panel + cliente usa SFTP/Git. | NUNCA dashboard. |
| **Cron jobs (website cron)** | Customer Panel. | NUNCA. |
| **SSL CRUD (LE + custom)** | Auto-LE Enhance. Custom cert via panel. | DC.NEW-15C-10 v1.1 |
| **WordPress staging/clone/install** | Enhance app templates + Customer Panel. | DC.NEW-15C-11 v1.1 (feature comercial fuerte) |
| **`change_package` UI cliente** | Bloqueado hasta billing prorrateo cross-plan implementado en Aelium | DC.NEW-15C-1 cuando cierre sub-sprint billing |
| **`SPF` records** | Deprecated RFC 7208 (use TXT con `v=spf1`). | NUNCA — confunde al cliente |
| **`NS` records de zona (CRUD)** | Setting global gestiona NS. Editar NS-as-record en zona = romper delegación. | NUNCA cliente. v1.1 admin diagnostic-only |
| **`PTR` records** | Reverse DNS, requiere PTR delegation que cliente típico no tiene | DC.NEW-15C-2 v1.1 |
| **`DS` records (DNSSEC)** | Va con flag `enableDnsSec` separado. | DC.NEW-15C-DNSSEC v1.1 |
| **DNSSEC enable/disable** | Power-user feature | DC.NEW-15C-DNSSEC v1.1 |
| **SSO sub-recursos** (webmail D1, phpMyAdmin D2, wp-admin D3) | UX brillante pero v1 prioriza el flujo principal (panel Enhance scopado) | DC.NEW-15C-6/7/8 v1.x |
| **Webhook receiver Aelium** (`POST /api/v1/webhooks/enhance`) | orchd v12.21.3 NO emite webhooks → código muerto v1 | DC.NEW-15C-WEBHOOKS si Enhance los añade |
| **Cluster admin (servers, packages CRUD, branding)** | Vive en `/admin/infrastructure` (Sprint 10 + ADR-071) — fuera plugin scope | Sprint 10 + 15E |
| **Importers (cPanel/Plesk migrate)** | Sin clientes legacy hosting que migrar | DC.NEW-15C-12 v2 si migración real |
| **Reseller sub-customers** (recursive customer hierarchy) | Aelium = Master directo, sin sub-resellers v1 | NUNCA primer cliente real |

### 5.3. Comparativa Aelium v1 vs WHMCS / Blesta / WiseCP / Upmind

| Feature | WHMCS oficial | Blesta | WiseCP | Upmind | **Aelium v1** |
|---|---|---|---|---|---|
| Provision/suspend/terminate | ✅ | ✅ | ✅ | ✅ | ✅ |
| Change package | ❌ | ❌ | ✅ | ❌ | ✅ admin only |
| Reset password | ❌ | ❌ | ✅ | ❌ | ✅ |
| One-click panel login | ❌ | ❌ | ✅ | ❌ | ✅ cliente + admin (separados) |
| DNS records CRUD | ❌ | ❌ | ❌ | ❌ | ✅ **7 tipos** |
| Métricas inline (disk/bandwidth/email/db) | ❌ | ❌ | ❌ | ❌ | ✅ snapshot 60s |
| Acciones curadas auditables | ❌ | ❌ | parcial | ❌ | ✅ ADR-070 doctrina |
| Default DNS records globales bootstrap | ❌ | ❌ | ❌ | ❌ | ✅ E.DNS.7 |
| Reconcile drift detection (cron 6h) | parcial | parcial | parcial | parcial | ✅ + alerta superadmin si threshold superado |
| Audit completo (R3 inmutable) | ❌ | ❌ | parcial | parcial | ✅ ADR-080 wrappers |
| Circuit breaker | ❌ | ❌ | ❌ | ❌ | ✅ ADR-080 |
| Cross-plugin DNS authority routing | ❌ | ❌ | ❌ | ❌ | ✅ E.DNS.8 |
| Customer Panel SSO scopado (no admin global) | ❌ | ❌ | parcial (no scoping confirmado) | ❌ | ✅ via OTP `/orgs/{cust}/members/{owner}/sso` |

Aelium v1 supera a WiseCP (el más capaz) en DNS + métricas + audit + cross-plugin + reconcile drift + circuit breaker. Razón: doctrina "dashboard puerta unificada profesional" (ADR-070) + framework Sprint 15A ya construido.

---

## 6. Decisiones técnicas frozen para Sprint 15C

> Estas decisiones se tomaron en el chat Yasmin ↔ Claude del 2026-05-07 + se validaron contra spec literal (`docs/_research/sprint-15c/orchd-oas3-api.yaml`). Entran a ADR-083 cuando se redacte. **No se reabren** salvo razón nueva documentada.

### 6.1. Auth & test connection

1. **Scheme**: `bearerAuth` exclusivamente (`sessionCookie` ignorado — Aelium no hace login interactivo).
2. **Token scope**: **Super Admin** (no Owner). Razón: Owner no se puede borrar — mayor blast radius si filtración. Super Admin tiene permisos completos cluster-wide pero es revocable.
3. **Storage**: `SecretVaultService` AES-256-GCM (heredado ADR-080).
4. **Manifest**:
   - `configSchema`: `{ baseUrl: string format=uri required, masterOrgId: string format=uuid required, reconciliationIntervalHours: integer default=6 }`
   - `secretsSchema`: `{ apiToken: string format=password required }`
5. **Test-connection**: `GET /version` (idempotente, sin auth) seguido de `GET /orgs/{masterOrgId}` (con auth) → si ambos 200, OK.
6. **Header en todas las llamadas**: `Authorization: Bearer <apiToken>` + `Accept: application/json`.

### 6.2. Multi-tenancy mapping (Client Aelium ↔ Customer Org Enhance)

7. **Tabla nueva** `enhance_customers (client_id PK uuid → clients.id, enhance_org_id uuid unique, enhance_owner_login_id uuid, enhance_owner_member_id uuid, created_at timestamptz, updated_at timestamptz)`. Migración Prisma `sprint15c_enhance_customers`.
8. **Lazy create**: el customer se crea en Enhance al primer hosting Aelium provisionado (no en el alta de Client). Idempotencia robusta:
   - Step 0: `prisma.$transaction` con advisory lock por `client_id`.
   - Step 1: `SELECT FROM enhance_customers WHERE client_id = ?` → si existe, return.
   - Step 2: `GET /orgs/{master}/customers?search=<client.email>` (defensivo cross-restart): si existe pero no en tabla, INSERT mapping y return.
   - Step 3: si no, ejecutar provision flow (§6.3).
9. **Mapping Service Aelium**:
   - `services.provider_reference = enhance_subscription_id` (integer serializado a string).
   - `services.metadata = { enhance_website_id, enhance_org_id, enhance_subscription_id, enhance_plan_id, primary_domain }` (todo string, R12 ADR-077 §2.2).

### 6.3. Provision flow 6-step idempotent

10. **Flujo canónico** (todos los IDs en respuesta):

```
1. POST /orgs/{master}/customers
   body: { name: client.organisation_name }
   → { id: customer_org_id }

2. POST /logins?orgId={customer_org_id}
   body: { email: client.email, password: <random uuid>, name: client.organisation_name }
   → { id: login_id }

3. POST /orgs/{customer_org_id}/members
   body: { loginId: login_id, roles: ["Owner"] }
   → { id: member_id }

4. PUT /orgs/{customer_org_id}/owner
   body: { memberId: member_id }
   → 200 OK

5. POST /orgs/{master}/customers/{customer_org_id}/subscriptions
   body: { planId: <product.config.enhance_plan_id> }
   → { id: subscription_id (integer) }

6. POST /orgs/{customer_org_id}/websites
   body: { domain: service.domain, subscriptionId: subscription_id }
   → { id: website_id }
```

11. **Atomicidad**: cada paso idempotente individualmente. Si paso 4 falla tras pasos 1-3 OK → reintento 5 minutos después (BullMQ retry policy `[30s, 90s, 270s]`). Tras 3 fallos → DLQ + alerta.
12. **Reverso compensatorio si falla mid-flight**: se delega al cron `reconcile-enhance-services` (servicios en estado 'pending' >24h se marcan 'failed' + alerta admin). NO hay rollback automático (riesgoso si admin ya tocó algo manualmente).

### 6.4. SSO 2-call OTP flow

13. **Flujo cliente "Abrir mi panel"**:

```
1. GET /orgs/{customer_org_id}
   → returns Org { ..., ownerId, ownerLoginId, ... }

2. GET /orgs/{customer_org_id}/members/{ownerId}/sso
   → returns string (OTP URL: "https://<panel>/login/sessions/sso?otp=<uuid>")

3. Aelium emite audit event service.sso_opened + redirect 302 → OTP URL

4. Browser sigue redirect → Enhance verifica OTP → crea sesión cookie scopada al customer org → cliente entra
```

14. **Flujo admin Aelium "Abrir panel cliente"**: idéntico paso 1+2, pero antes emite `service.admin_sso_impersonation` con flag `gdpr_visible_to_data_subject=true` → audit log + portal RGPD `/dashboard/transparency` lo expone al cliente ("Aelium agente <X> abrió tu panel el <fecha> desde IP <Y>").
15. **TTL del OTP**: corto (Enhance lo gestiona). Aelium NO cachea la URL — se regenera en cada apertura.

### 6.5. DNS authority + records doctrine

16. **Capability flag canónico nuevo** `has_dns_management: boolean` añadido a `PluginCapabilities` (ADR-077 Amendment A1):
    - `enhance_cp` declara `true`.
    - Plugins existentes (`internal`, `manual`) declaran `false` (Amendment A1 también los actualiza).
    - Plugins futuros (`resellerclub`, `docker_engine`, `plesk_obsidian`) declaran `false` por defecto; `cloudflare_dns` hipotético declararía `true`.
17. **Record kinds expuestos v1**: `[A, AAAA, CNAME, MX, TXT, SRV, CAA]` (7 de 11 disponibles). SPF/NS/PTR/DS fuera v1 (§5.2 razones).
18. **Helper canónico** `core/provisioning/dns-authority-resolver.ts`:
    ```typescript
    export function resolveDnsAuthority(
      service: Service,
      registry: PluginRegistryService,
      settings: SettingsService
    ): { authority: 'aelium' | 'external'; plugin: ProvisionerPlugin | null }
    ```
19. **Endpoint nuevo orquestador**: `GET /api/v1/services/{id}/dns/records` + `POST/PATCH/DELETE` análogos. Resolver routea al plugin con `has_dns_management=true`.
20. **Default records cluster Enhance**: bootstrap del plugin instala defaults vía `POST /v2/settings/dns/default-records`:
    - `{ kind: 'A', name: '@', value: '<server_ip>' }`
    - `{ kind: 'A', name: 'www', value: '<server_ip>' }`
    - `{ kind: 'NS', name: '@', value: 'ns1.aelium.net' }`
    - `{ kind: 'NS', name: '@', value: 'ns2.aelium.net' }`
    - `{ kind: 'MX', name: '@', value: 'mail.<server_ip_reverse>' }` (opcional, si email role activo)
21. **Listener `auto-config-dns-on-hosting-provisioned` redefinido**: NO crea records inline. Reconcile defensivo (verifica que la zona tiene los defaults, los re-aplica si faltan). Cero race condition.

### 6.6. Reconciliation 3 capas (60s / on-demand / 6h)

22. **L1 — Cache `service_info` Redis TTL 60s** + invalidación tras cualquier acción Aelium (heredado ADR-080 wrappers). Cubre status + métricas + display.
23. **L2 — Reads on-demand sin cache** para DNS records / list emails / list databases. Cada vez que la UI renderiza esa pestaña, golpe directo a Enhance. Siempre fresh.
24. **L3 — Reconcile cron** `reconcile-enhance-services` BullMQ cada 6h:
    - Para cada service con `provisioner_slug='enhance_cp'` y `status IN ('active','suspended')`:
      - `GET /orgs/{org}/subscriptions/{sub_id}` → si 404 → emit `service.reconciled_external_change` con `change_type='subscription_missing'`.
      - Comparar `Subscription.status` Aelium vs Enhance → si divergente → emit `service.reconciled_external_change` con `change_type='status_divergence'`.
      - Comparar `Subscription.planId` vs `Product.config.enhance_plan_id` → si divergente → emit `change_type='plan_divergence'` (NO auto-corregir — billing implication).
    - Setting `provisioning.enhance_cp.reconciliation_alert_threshold` (default 5 / día) → si supera, alerta superadmin.

### 6.7. Mock testing strategy

25. **`MockEnhanceServer`**: Express stub local que responde con fixtures JSON capturados durante 15C.B contra Enhance live.
26. **Fixtures captura plan**: durante 15C.B Yasmin ejecuta ~10 curls contra su Enhance live (sub-customer `qa-aelium` creado ad-hoc) → JSON responses dump en `tests/fixtures/enhance/`.
27. **CI E2E**: usa MockServer al 100%. NO golpea Enhance live.
28. **Smoke E2E manual** (15C.I): Yasmin ejecuta suite ad-hoc contra Enhance live para validar shapes reales (1-2 horas).

### 6.8. Plan upgrade admin-only v1

29. **Cliente UI**: botón "Cambiar plan" en `/dashboard/services/[id]` → "Contacta soporte" inline + CTA crear ticket. Bloqueado hasta cierre billing prorrateo cross-plan (DC.NEW-15C-1).
30. **Admin UI**: acción curada `change_package` en `/admin/services/[id]` → modal confirm con texto explícito sobre billing manual + dropdown de planes Enhance disponibles. Admin asume responsabilidad de generar invoice ajuste o nota de crédito.

### 6.9. Capability flags refinement (`enhance_cp`)

31. **Capabilities estáticas frozen**:

```typescript
{
  has_sso_panel: true,
  panel_label: 'plugin.enhance_cp.panel_label',  // i18n key → "Panel Enhance"
  has_metrics: true,
  has_metrics_history: false,
  requires_server: false,
  provision_mode: 'sync',
  completes_via_task: false,
  supports_reconciliation: true,
  has_dns_management: true,  // ⭐ NUEVO via ADR-077 Amendment A1
}
```

32. **`inlineActions` literal**:

```typescript
[
  { slug: 'reset_account_password', label: 'plugin.enhance_cp.actions.reset_password', confirmRequired: true, destructive: false },
  { slug: 'view_disk_usage', label: 'plugin.enhance_cp.actions.view_disk', confirmRequired: false, destructive: false },
  { slug: 'view_bandwidth_usage', label: 'plugin.enhance_cp.actions.view_bandwidth', confirmRequired: false, destructive: false },
  { slug: 'add_dns_record', label: 'plugin.enhance_cp.actions.add_dns_record', confirmRequired: false, destructive: false, payloadSchema: <NewDnsRecord JSON-Schema> },
  { slug: 'update_dns_record', label: 'plugin.enhance_cp.actions.update_dns_record', confirmRequired: false, destructive: false, payloadSchema: <UpdateDnsRecord> },
  { slug: 'delete_dns_record', label: 'plugin.enhance_cp.actions.delete_dns_record', confirmRequired: true, destructive: true },
  { slug: 'change_package', label: 'plugin.enhance_cp.actions.change_package', confirmRequired: true, destructive: false, payloadSchema: { planId: integer } },  // admin only
  { slug: 'force_resync', label: 'plugin.enhance_cp.actions.force_resync', confirmRequired: false, destructive: false },  // admin only
]
```

### 6.10. Operational doctrine — Enhance gana en conflicto (DH-INV-6)

33. **Aelium NO es fuente de verdad operacional**. Es:
    - Fuente de verdad **billing** (qué se cobró cuándo, qué products tiene el cliente).
    - Fuente de verdad **identidad cross-portal** (Client + roles + audit trail).
    - **Gateway curado** sobre Enhance para acciones de alta frecuencia + UX unificada.
34. **Si conflicto operacional**: gana Enhance. Reconcile cron actualiza Aelium, no al revés. Excepción: provision/deprovision donde Aelium dispara la acción + persiste resultado tras éxito.
35. **Aplicación práctica**:
    - Admin borra website manualmente desde panel Enhance → reconcile detecta missing → marca `Service.status='unknown'` (no 'cancelled' automático — podría ser error humano recuperable) + alerta superadmin + audit.
    - Admin suspende subscription manualmente → reconcile detecta + actualiza `Service.status='suspended'`.
    - Admin cambia planId manualmente → reconcile detecta divergence + alerta (NO auto-corrige Aelium — billing implication, decisión consciente requerida).

---

## 7. Estimación esfuerzo Sprint 15C — 11 fases

> **Reformulación 2026-05-09**: el alcance original de 9 fases asumía implícitamente que el frontend admin operativo "se resolvería en otro sprint", pero ningún sprint posterior (Sprint 12 Settings + KB no cubre productos UI ni service detail admin) absorbía el gap. Tras review riguroso de Fase 15C.E (PR #44) Yasmin decidió añadir 2 fases nuevas que cierran el sprint con un plugin Enhance **operable end-to-end** (no solo backend correcto). Total pasa de 7-10.5 sesiones a **9-12.5 sesiones**.

| Fase | Contenido | Estimación | Estado |
|---|---|---|---|
| 15C.A | ADR-082 transversal + ADR-077 Amendment A1 + ADR-083 specifics | 0.5–1 sesión | ✅ cerrada (PR #36, master `0bb83b3`) |
| 15C.B | Cliente HTTP Enhance (`EnhanceApiClient`) + types TypeScript del spec + `MockEnhanceServer` Express + capturar fixtures contra live | 0.5–1 sesión | ✅ cerrada (PR #37, master `156ea35`) |
| 15C.C | Plugin core (6 métodos contrato + manifest + DI registration + tabla `enhance_customers` + lazy-create idempotente con search-by-email) | 1–1.5 sesión | ✅ cerrada (PR #38, master `69fed47`) |
| 15C.D | Listener `auto-config-dns-on-hosting-provisioned` reconcile defensivo + setting `provisioning.default_nameservers` + propagación cluster + helper `dns-authority-resolver.ts` + endpoints orquestador `/dns/*` | 1–1.5 sesión | ✅ cerrada (PR #41, master `a319063`) |
| 15C.E | **Acciones curadas backend**: reset_password + view_disk + view_bandwidth + change_package admin + force_resync admin + audit completo + flag canónico `ServiceAction.adminOnly` (ADR-077 A3) + 10ª action `list_available_plans` (ADR-083 A3) + enforcement HTTP 403 backend + evento `service.action_admin_only_violation`. Solo backend canónico — el frontend operativo se aborda en Fase 15C.E.2. | 0.5–1 sesión | 🔄 PR [#44](https://github.com/yasmindanailov/dashboard/pull/44) — 7 commits + suite 454/459 + 5 skipped + lint:check + build verde |
| **15C.E.2** ⭐ NUEVO | **Frontend acciones curadas (gap descubierto Fase 15C.E review)**: (1) Form admin productos (`new/page.tsx` + `ProductEditForm.tsx`) extendido con sub-form dinámico `provisioner_config` por provisioner, vía `@rjsf/core` JSON-Schema 7 (patrón heredado Sprint 15A plugin install UI). Para `enhance_cp`: campo `enhance_plan_id: integer` required. **Sin esto, ningún producto Enhance es contratable operativamente**. (2) Filter `adminOnly` en `frontend/app/_shared/services/ActionsBar.tsx` — `actions.filter(a => !a.adminOnly \|\| isAdmin)` con prop `isAdmin` derivado de AuthContext. Frontend filter materializa el patrón aspiracional ADR-077 A3.5 (defense-in-depth backend del wrapper sigue activo). | 1 sesión | ⏳ pendiente |
| 15C.F | SSO endpoints (cliente Customer Panel + admin impersonation + evento `service.admin_sso_impersonation` + listener GDPR) | 0.5–1 sesión | ⏳ pendiente |
| 15C.G | DNS records management UI (7 tipos via `@rjsf/core` heredado Sprint 15A) — pieza pesada, frontend `/dashboard/services/[id]/dns` | 1.5–2 sesiones | ⏳ pendiente |
| 15C.H | Cron `reconcile-enhance-services` 6h + setting threshold + evento `service.reconciled_external_change` + listener audit con flag GDPR + tests | 0.5 sesión | ⏳ pendiente |
| 15C.I | E2E completo flujo Enhance: producto admin con `provisioner_config.enhance_plan_id` → cliente checkout → `invoice.paid` → orchestrator `provision()` 6-step contra mock → `service.activated` → frontend cliente render N botones (filtrados por `adminOnly`) → click `view_disk_usage` → 200 + métricas; click cliente `change_package` → 403 + audit `service.action_admin_only_violation`; click admin → 200 + plan changed via `list_available_plans` dropdown. Spec incluye E2E Playwright + smoke manual contra Enhance live (1-2h Yasmin) + cierre documental (`docs/features/provisioning/admin-plugins-enhance.md` + retrospectiva `completed/sprint-15c-plugin-enhance-cp.md` + actualización `_events.md` con eventos nuevos + `_matrix.md` con dependencias plugin → orquestador → DNS) + i18n strings finales. | 1–1.5 sesión | ⏳ pendiente |
| **15C.J** ⭐ NUEVO | **Cierre real operativo (gap descubierto Fase 15C.E review)**: (1) Página admin `/admin/services/[id]` SC nativo paralelo al detalle cliente con `info` enriquecido + 3 botones admin (`change_package`/`force_resync`/`list_available_plans`) operables + modal `change_package` que invoca primero `list_available_plans` para poblar dropdown + luego `change_package` con `planId` elegido + audit pesado en cada operación. (2) Plugin install seed condicional `NODE_ENV !== 'production'` — pre-crea `plugin_installs` row con baseUrl + masterOrgId desde env + apiToken desde env var dedicada → DX para QA/staging/dev (admin no necesita configurar manualmente cada `pnpm seed`). | 1 sesión | ⏳ pendiente |

**Total: 9–12.5 sesiones.** Mayor que Sprint 15D RC (3-4.5) por: DNS UI completa + listener cross-plugin + lazy customer model con flujo 6 pasos + reconcile drift detection + Frontend admin productos provisioner_config UI dinámica + página admin services detalle. Hereda TODO el framework Sprint 15A. **Las 2 fases nuevas (E.2 + J) cierran el gap operativo descubierto en review** — sin ellas el sprint entrega backend correcto pero un primer cliente real es imposible de contratar end-to-end.

---

## 8. Deuda explícita generada por este dossier

> Items conscientemente diferidos. Se añaden a `backlog.md` cuando Sprint 15C se promueva a sprint activo (incrementan los DC.NEW-1..11 del dossier 15D).

| Ref | Item | Cuándo abordar |
|---|---|---|
| **DC.NEW-15C-1** | UI cliente `change_package` bloqueada hasta cierre sub-sprint billing prorrateo cross-plan | Cuando cierre sub-sprint billing |
| **DC.NEW-15C-2** | DNS records `PTR` (reverse DNS) — power-user | v1.1 si demanda |
| **DC.NEW-15C-3** | Métricas time-series Enhance — Prometheus + recharts | v2 si demanda |
| **DC.NEW-15C-4** | Webhook receiver Aelium — solo si Enhance añade webhooks push en futura versión orchd | Cuando Enhance los exponga |
| **DC.NEW-15C-5** | WordPress install/staging/clone inline — feature comercial fuerte | v1.x si decisión comercial |
| **DC.NEW-15C-6** | SSO webmail directo (`/orgs/.../emails/{e}/sso`) | v1.x UX brillante |
| **DC.NEW-15C-7** | SSO phpMyAdmin directo (`/orgs/.../mysql-dbs/{db}/sso`) | v1.x UX brillante |
| **DC.NEW-15C-8** | SSO wp-admin directo (`/orgs/.../wordpress/users/{u}/sso`) | v1.x UX brillante |
| **DC.NEW-15C-9** | Backup CRUD + restore inline | v1.1 si demanda real |
| **DC.NEW-15C-10** | SSL CRUD inline (LE auto + custom cert upload) | v1.1 |
| **DC.NEW-15C-11** | App templates / WordPress instalación inline | v1.x — feature comercial |
| **DC.NEW-15C-12** | Importers cPanel/Plesk → Enhance | v2 si migración real de clientes legacy |
| **DC.NEW-15C-DNSSEC** | DNSSEC enable/disable + DS records | v1.1 |
| **DC.NEW-15C-EMAIL** | CRUD email accounts + forwards + autoresponders | NUNCA cliente. Admin v1.1 si demanda. |
| **DC.NEW-15C-DB** | CRUD MySQL databases + users | NUNCA cliente. Admin v1.1 si demanda. |
| **DC.NEW-15C-RESELLER** | Sub-resellers (customers que son resellers) | NUNCA primer cliente real. Solo si Aelium ofrece "reseller hosting". |

> **Nota review 2026-05-09 (Fase 15C.E PR #44)**: review riguroso destapó 5 gaps estructurales del flujo end-to-end (form admin productos sin `provisioner_config` UI ⚠ bloqueante, plugin install no seeded, frontend `ActionsBar` sin filter `adminOnly`, página `/admin/services/[id]` no existe, E2E completo sin spec). **No se añaden como deudas nuevas — se absorben como fases** del Sprint 15C tras decisión doctrinal Yasmin de reformular §7 (era 9 fases, pasa a 11): los 4 gaps estructurales se cubren en las 2 fases nuevas **15C.E.2** (form productos `provisioner_config` UI + filter `ActionsBar`) y **15C.J** (página admin/services/[id] + plugin-seed dev) declaradas en §7 arriba. El gap E2E se absorbe al alcance ampliado de **15C.I** (que ahora declara explícitamente el flujo end-to-end con asserts concretos). Trazabilidad histórica del descubrimiento: commits `22fd093` (5 DCs registradas) → `<commit reformulación>` (absorción en fases). El listado de DCs originales arriba (1..16 + DNSSEC/EMAIL/DB/RESELLER) son **features diferidas conscientemente** en el dossier original — no gaps estructurales como los 5 descubiertos en review.

---

## 9. ADRs futuros que materializan este dossier

| ADR | Sprint | Contenido literal de este dossier |
|---|---|---|
| **ADR-077 Amendment A1** | 15C.A | Añadir `has_dns_management: boolean` (required) a `PluginCapabilities`. Update plugins existentes (`internal`, `manual`) con `false`. Test contract genérico actualizado para validar el flag. **§3.3 + §6.5** del dossier son input. |
| **ADR-082** Modelo Domain↔Hosting + DNS doctrine (transversal) | 15C.A | Las 6 invariantes DH-INV-1..6 (§3.1) + 4 flujos canónicos checkout F1-F4 (§3.2) + DNS-as-capability (§3.3) + 3 capas NS sync (§3.4) + listener reconcile defensivo (§3.5) + cross-plugin DNS authority resolver (§3.6) + doctrina DH-INV-6 (Enhance gana en conflicto). Implementación en 15C; otros consumidores futuros (RC + email plugins + futuros hosting). |
| **ADR-083** Plugin Enhance CP specifics | 15C.A | Decisiones §6 frozen (35 items): auth flow, multi-tenancy mapping, provision 6-step idempotente, SSO 2-call OTP, DNS authority + records doctrine, reconcile 3 capas, mock testing, plan upgrade admin-only, capability flags refinement, operational doctrine DH-INV-6. Tabla nueva `enhance_customers`. Setting `provisioning.default_nameservers`. Eventos nuevos `service.admin_sso_impersonation` + `service.reconciled_external_change`. |

---

## 10. Cómo arrancar Sprint 15C cuando llegue su turno

Pre-condición: Sprint 15A mergeado en master (✅ cumplido — `bee90d8`).

Pasos:

1. Re-leer este dossier completo + spec literal en `docs/_research/sprint-15c/orchd-oas3-api.yaml`.
2. Crear rama `sprint15c-plugin-enhance-cp` desde master sincronizado.
3. Empezar Fase 15C.A: redactar 3 ADRs (082 transversal + 077 Amendment A1 + 083 specifics) con contenido literal de §3 + §6 de este dossier.
4. Validar shapes contra spec en cada decisión (líneas exactas del YAML).
5. Ejecutar fases 15C.B → 15C.J según §7 (11 fases tras reformulación 2026-05-09 — añadidas E.2 + J para cerrar gaps frontend operativos descubiertos en review Fase E).
6. PR doc-only de ADRs primero (15C.A) → review Yasmin → merge.
7. PRs siguientes por fase (15C.B → 15C.J), encadenados o en paralelo según dependencia.
8. Cierre Sprint 15C: actualizar `provisioning/contract.md` §2 con nueva fase, crear retrospectiva `completed/sprint-15c-plugin-enhance-cp.md`, mover sprint a `completed/`.
9. **Tras merge a master** → desbloquea Sprint 15D RC. Frase de arranque al re-abrir 15D:
   > *"Lee `docs/60-roadmap/sprint-15d-resellerclub-dossier.md` + `docs/10-decisions/adr-082-*.md` + `docs/10-decisions/adr-083-*.md`. Vamos con Sprint 15D — Plugin ResellerClub. Crea rama `sprint15d-plugin-resellerclub` desde master."*

---

## 11. Referencias canónicas

- **Spec API literal**: [`docs/_research/sprint-15c/orchd-oas3-api.yaml`](../_research/sprint-15c/orchd-oas3-api.yaml) (orchd 12.21.3, OpenAPI 3.0.3, 588 KB / 20.848 líneas / ~280 paths).
- **README research**: [`docs/_research/sprint-15c/README.md`](../_research/sprint-15c/README.md).
- **Doctrina industria** (cruzada): WHMCS oficial Enhance integration ([quickhost.uk KB](https://help.quickhost.uk/index.php/knowledge-base/whmcs-integration/)), Blesta module ([docs.blesta.com](https://docs.blesta.com/integrations/modules/enhance/)), WiseCP ([docs.wisecp.com](https://docs.wisecp.com/en/kb/enhance)), Upmind ([docs.upmind.com](https://docs.upmind.com/docs/how-to-add-enhance-web-server)).
- **ADRs vigentes consumidos**: [ADR-009](../10-decisions/adr-009-estrategia-plugins.md), [ADR-021](../10-decisions/adr-021-provisioners.md), [ADR-070](../10-decisions/adr-070-service-info-sso-acciones-curadas.md), [ADR-077](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md), [ADR-080](../10-decisions/adr-080-plugin-framework.md).
- **Dossier hermano**: [`sprint-15d-resellerclub-dossier.md`](./sprint-15d-resellerclub-dossier.md) — 11 secciones, 3 ADRs futuros (077 Amendment A1 que ahora produce 15C, 082 transversal que ahora produce 15C, 081 RC specifics).
- **Conversación origen**: sesión Yasmin ↔ Claude del 2026-05-07 (post merge dossier 15D `542d589`).
- **Schema Aelium relevante**: `Service.domain` (`String? @db.VarChar(300)`, schema.prisma:456), `ProductType` enum incluye `domain` y `hosting_web` (schema.prisma:293+).
- **Rules consumidas**: R0 (ADR para arquitectura), R3 (audit inmutable), R4 (plugins no se importan desde core), R7 (errores semánticos), R10 (rate limiting), R11 (circuit breaker), R12 (secretos no en metadata cliente), R13 (fallos no desaparecen), R14 (manejo errores frontend).
