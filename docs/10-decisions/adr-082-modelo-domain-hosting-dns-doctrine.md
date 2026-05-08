# ADR-082 — Modelo canónico Domain ↔ Hosting + DNS doctrine: invariantes, flujos de checkout, capability `has_dns_management`, NS-sync 3 capas, listener reconcile defensivo y cross-plugin DNS authority resolver

> **Status:** Active (transversal — consumido por ADR-083 Enhance CP, ADR-081 ResellerClub futuro, ADR-021/077 vigentes)
> **Date:** 2026-05-07
> **Domain:** provisioning, plugins, dns, products, cross-cutting
> **Sprint:** Sprint 15C Fase 15C.A (congelación doctrinal antes del primer commit del plugin Enhance CP)

---

## Contexto

[ADR-021](./adr-021-provisioners.md) (2025-11) declaró la interfaz mínima del `ProvisionerPlugin`. [ADR-070](./adr-070-service-info-sso-acciones-curadas.md) (2026-04-29) cerró la doctrina UX "dashboard como puerta unificada". [ADR-077](./adr-077-contrato-provisioner-plugin-v2.md) (2026-05-01) congeló la firma del contrato v2. [ADR-080](./adr-080-plugin-framework.md) (2026-05-05) cerró el Plugin Framework (manifest + vault + loader + circuit breaker). Sprint 15A (P2.2, cerrado 2026-05-06, master `bee90d8`) materializó el framework operativo con dos plugins triviales (`internal`, `manual`).

Sprint 15C (P2.3) llega como **primer plugin real** del proyecto: Enhance CP. En el chat de pre-sprint del 2026-05-07 (mergeado en master `80492ad`) se descubrieron seis decisiones doctrinales que **NO son específicas de Enhance** y que afectarán a todos los hosting/registrar plugins futuros (ResellerClub Sprint 15D, Docker Engine Sprint 15E, futuros cPanel/Plesk):

1. **El modelo Domain ↔ Hosting** — qué es bueno asumir (FQDN siempre presente en hosting), qué es bueno permitir (dominio sin hosting, hosting con dominio externo), qué es la **fuente de verdad operacional** (Aelium o el panel del proveedor).
2. **Los flujos canónicos de checkout** que la industria conoce desde hace 15 años — F1 (register + buy hosting), F2 (existing domain + buy hosting), F3 (BYOD externo + buy hosting), F4 (transfer-in + buy hosting). Cada uno con shape distinto de provisioning.
3. **Cómo se modela "DNS authority"** — qué plugin gestiona la zona DNS de un dominio, sabiendo que el plugin del registrar NO es necesariamente el mismo que el del DNS authoritative. ResellerClub registra; Enhance es PowerDNS.
4. **Cómo se sincronizan los nameservers `ns1/ns2.aelium.net`** entre las tres capas que los necesitan (glue records WHOIS, default NS de zonas Enhance, setting Aelium fuente de verdad).
5. **Cómo se aplican los DNS records iniciales** a una zona recién creada (apex A, www A, MX). El descubrimiento del endpoint Enhance `/v2/settings/dns/default-records` cambia el patrón canónico previsto en el dossier 15D: defaults globales platform-level **reemplazan** la creación inline tras `service.activated`.
6. **Cómo el orquestador resuelve "¿quién gestiona los DNS de este dominio?"** cuando el cliente abre `/dashboard/services/[id]` de un dominio cuyo plugin (registrar) declara `has_dns_management=false` pero la zona vive en otro plugin (DNS authority).

Cada uno de estos seis temas tiene **dos formas de ser resuelto**: ad-hoc dentro del plugin Enhance CP (Sprint 15C lo vive, ResellerClub lo redescubre, Docker lo redescubre, drift garantizado), o congelado como doctrina transversal antes del primer commit del primer plugin real.

> **¿Qué pasaría si NO tomáramos esta decisión?** Sprint 15C escribe un `EnhanceProvisionerPlugin` con sus propias asunciones implícitas sobre dominios y zonas DNS. Sprint 15D ResellerClub aterriza con el problema "el cliente abre la card del dominio y Aelium debe mostrarle DNS records — pero ese dominio NO tiene hosting Enhance, ¿de dónde leemos?": resuelve ad-hoc en RC. Sprint 15E Docker descubre que su plugin necesita hostnames con A records pero no sabe quién es la autoridad. Para cuando llegue el cuarto plugin (futuro cPanel o Plesk), cada sprint habrá reinterpretado las invariantes. El frontend `/dashboard/services/[id]` se llenará de condicionales por slug. **Es exactamente el antipatrón "interface emerges from implementation" que ADR-077 §Contexto advierte contra el contrato del plugin** — pero a nivel de modelo de dominio en lugar de a nivel de firma TypeScript. La diferencia es que aquí el dominio es **inter-plugin**, no intra-plugin.

ADR-077 cerró el contrato funcional. ADR-080 cerró el contrato operativo del framework. Falta cerrar el **contrato semántico cross-plugin** sobre el dominio de negocio compartido entre todos los registrars y todos los hostings: la pareja Domain ↔ Hosting + la zona DNS que los une.

---

## Opciones consideradas

### A. Diferir la doctrina — cada plugin se auto-define

- Sprint 15C escribe Enhance CP con asunciones propias. Sprint 15D RC redescubre. Sprint 15E Docker redescubre. La doctrina emerge tras 3-4 plugins reales con un refactor inevitable.
- **Pros**: Sprint 15C arranca antes; el primer plugin real sirve como "descubrimiento honesto" del dominio.
- **Contras**: el dossier 15D ya documentó (en su §3) las 5 invariantes DH-INV-1..5 y los 4 flujos F1-F4 — **ya está descubierto, lo único que falta es congelarlo en ADR**. Diferir significa rehacer el dossier en código de tres plugins distintos. Mismo antipatrón que ADR-077 evitó para el contrato del plugin: la diferencia entre interfaz curada e interfaz emergente.

### B. Doctrina dispersa — un comentario inline en `EnhanceProvisionerPlugin` + un README en `plugins/provisioners/`

- **Pros**: rapidez.
- **Contras**: la doctrina no se cita. Los próximos plugins (RC, Docker) la redescubren porque no es findable. R0 (ADR para decisiones arquitectónicas que son *cross-cutting*) se rompe — y este caso lo es por definición: las 6 invariantes son **inter-plugin**, no responsabilidad de un plugin.

### C. (elegida) Congelar la doctrina como ADR transversal antes del primer commit del primer plugin real

- ADR-082 declara las 6 invariantes (DH-INV-1..6), los 4 flujos (F1-F4), DNS-as-capability como `has_dns_management` (cuya ramificación TypeScript se materializa en ADR-077 Amendment A1), las 3 capas de NS sync (C1/C2/C3), el listener `auto-config-dns-on-hosting-provisioned` redefinido como reconciliation defensivo, el helper `core/provisioning/dns-authority-resolver.ts` y la doctrina DH-INV-6 (Enhance gana en conflicto).
- Sprint 15C consume ADR-082 al implementar Enhance (que es el primer plugin que declara `has_dns_management=true`). Sprints 15D/E/G consumen ADR-082 sin tocarlo.
- Cualquier evolución (séptima invariante, quinto flujo de checkout, segunda autoridad DNS) requiere amendment a este ADR o ADR específico.

- **Pros**:
  - Doctrina cross-plugin cerrada antes del primer plugin real → cero refactor inter-sprint.
  - Helper `dns-authority-resolver.ts` queda en `core/provisioning/` (NO en plugin) → R4 reforzado: el plugin RC NO importa el plugin Enhance; el orquestador hace el routing.
  - El frontend `/dashboard/services/[id]` consulta una sola fuente (`GET /api/v1/services/{id}/dns/records`) sin saber qué plugin la sirve. La capability flag `has_dns_management` (ADR-077 Amendment A1) cierra la ramificación correctamente.
  - DH-INV-6 ("Enhance gana en conflicto") simplifica drásticamente las decisiones de race condition en reconcile crons: no hay diálogo bidireccional síncrono — Aelium dispara acciones y reconcile actualiza estado.
- **Contras**:
  - Sprint 15C Fase A se retrasa ~0.5 sesión por la redacción de este ADR + ADR-077 Amendment A1 + ADR-083. Inversión que paga >5x cuando llegan 15D/15E/15G.
  - Riesgo: una invariante errónea bloquea evoluciones futuras. Mitigación: §"Cuándo revisar" + amendments para cambios compatibles + ADR específico para cambios breaking.

---

## Decisión

**Opción C — congelar el modelo canónico Domain ↔ Hosting + DNS doctrine como ADR transversal antes del primer commit del plugin Enhance CP.**

Las seis secciones siguientes son **doctrina vinculante** para todo plugin de provisioning futuro que toque dominios, hosting o DNS. Cualquier desviación requiere amendment o ADR específico citado inline en el código.

---

### 1. Seis invariantes Domain ↔ Hosting (DH-INV-1..6)

| # | Invariante | Justificación |
|---|---|---|
| **DH-INV-1** | **Hosting service SIEMPRE tiene un FQDN.** `services.domain` no nulo cuando `product.type ∈ {hosting_web, docker_service}`. | Requerimiento técnico de cada control panel y de cada container Docker con admin interface. Sin dominio no hay routing posible — virtualhost Apache/nginx, certificado SSL, subdomain de cliente Docker. La industria entera (cPanel desde 1996, Plesk desde 2000, Docker self-hosted desde 2014) trabaja sobre FQDN. |
| **DH-INV-2** | **Hosting plugin rechaza `provision()` si `service.domain` es null o malformed.** Lanza `ProvisionerPluginError('INVALID_PAYLOAD', retriable=false)` con mensaje explícito. | Defensa en profundidad: si el orquestador deja pasar un service sin dominio (bug del checkout o de la migración), el plugin lo detecta y falla rápido en lugar de crear estado parcial en el proveedor. R7 + R13. |
| **DH-INV-3** | **Domain service puede vivir solo** (sin hosting asociado obligatorio). | Defensa de marca, futuro proyecto, redirect 301, dominio aparcado, política B2B legítima. Forzar hosting con cada dominio sería antipatrón comercial — la industria lo ha resuelto así desde los 90s. |
| **DH-INV-4** | **Domain ↔ hosting linkage = string `services.domain`, NO foreign key.** No existe `services.linked_domain_id`. | Permite "bring your own domain" externo (F3) sin tener que modelar dominios externos como `services` huérfanos. WHMCS lo modela igual desde 2007; el campo `services.domain` en Aelium ya está modelado como `String? @db.VarChar(300)` desde Sprint 5 (ver `backend/prisma/schema.prisma:456`). |
| **DH-INV-5** | **Renewal cycles independientes.** Cancelar un dominio NO cancela el hosting asociado. Cancelar un hosting NO cancela el dominio. Las suscripciones evolucionan en líneas paralelas. | Dominio típico anual; hosting variable (mensual/anual). Invoices separadas. La excepción "free domain first year with annual hosting" es un `ProductExtra` (ADR-020) que aplica un descuento, NO un linkage de ciclos. |
| **DH-INV-6** ⭐ | **En conflicto operacional, el panel del proveedor (Enhance / cPanel / Plesk) gana sobre Aelium.** Aelium NO es fuente de verdad operacional — es **gateway curado** de billing + identidad + audit trail. | Si admin/cliente cambia algo directamente en el panel del proveedor (suspende un site, modifica un DNS record fuera de Aelium, cambia plan), el reconcile cron actualiza Aelium, no al revés. Excepción: provision/deprovision donde Aelium dispara la acción y persiste el resultado tras éxito en el proveedor. Doctrina en §6.10 del dossier 15C; consume DC.NEW-15C que registra la deuda asociada al alerting. |

**DH-INV-6 es la invariante doctrinal más fuerte de este ADR.** Define qué tipo de sistema es Aelium: no un mirror del panel del proveedor (antipatrón B de ADR-070), no un sustituto del panel (antipatrón pretendido de Sprint 12 que se descartó), sino una **puerta auditada con autoridad de billing y de identidad**, sobre operativa que vive en sistemas externos especializados.

**Aplicación práctica de DH-INV-6** — referencia para reconcile crons de plugins futuros:

| Cambio detectado en el proveedor | Acción Aelium |
|---|---|
| Subscription missing en Enhance (admin la borró) | `Service.status='unknown'` (NO `'cancelled'` automático — podría ser error humano recuperable) + alerta superadmin + audit |
| Subscription suspended en Enhance (admin la suspendió) | `Service.status='suspended'` automático + audit |
| Subscription planId cambiado en Enhance | NO auto-corregir Aelium (billing implication); emite `service.reconciled_external_change` con `change_type='plan_divergence'` + alerta |
| DNS record creado/modificado/borrado fuera de Aelium | NO auto-mirror en Aelium (Aelium no espeja zone state); UI lee siempre fresh del proveedor (§4 capa L2 reads on-demand) |
| Website status divergence (active vs suspended) | Aelium adopta el estado del proveedor + audit |

---

### 2. Cuatro flujos canónicos de checkout (F1-F4)

La industria registrar+hosting tiene cuatro flujos de compra desde hace 15 años. Aelium los soporta **literalmente como están** en lugar de inventar variantes:

| Flujo | Caso | Línea(s) factura | Provisioning |
|---|---|---|---|
| **F1** Register new domain + buy hosting (60-70% industria) | Cliente compra dominio nuevo + hosting nuevo en el mismo checkout. | 2 line items (1 dominio + 1 hosting). | Registrar dominio primero (síncrono via plugin registrar — Sprint 15D); hosting después (Sprint 15C plugin Enhance). Default DNS records globales del cluster (§5) se aplican automáticamente a la zona recién creada. **2 services Aelium con renewal cycles independientes desde día 1** (DH-INV-5). |
| **F2** Use existing Aelium-managed domain + buy hosting | Cliente ya tiene un dominio gestionado por Aelium; añade hosting al mismo. | 1 line item (solo hosting). | Hosting service se crea con `domain=<FQDN existente del dominio Aelium>`. La zona DNS del dominio ya existe en Enhance (se creó al registrar/transferir vía RC en su día); el website Enhance se mapea a esa zona existente sin crearla. |
| **F3** BYOD (Bring Your Own Domain externo) + buy hosting | Cliente ya tiene un dominio en otro registrar/proveedor (GoDaddy, Namecheap, etc.); compra solo hosting en Aelium. | 1 line item (solo hosting). | Hosting service Aelium con `domain=<FQDN externo>`. NO existe service Aelium para ese dominio. Aelium presenta al cliente instrucciones para configurar A records en su registrar externo (apuntando al server IP) o cambiar NS a `ns1/ns2.aelium.net`. NO renewal alerts del dominio (no es nuestro). |
| **F4** Transfer-in domain + buy hosting | Cliente compra hosting + inicia transfer-in del dominio desde otro registrar. | 2 line items. | Hosting se provisiona inmediatamente con dominio externo (estado F3 transitorio durante 5-7 días). Transfer-in arranca asíncrono via plugin RC. Cuando completa → evento `domain.transfer_completed` (Sprint 15D) → email cliente "Tu dominio ya está gestionado por Aelium, DNS configurado". |

**Doctrina canónica**: el orquestador `provisioning` NO conoce los flujos F1-F4 explícitamente. Los flujos viven en el `BillingCheckoutService` (Sprint 11.B) que decide qué services crear con qué `domain` field. El orquestador procesa cada service de forma independiente — F1 produce 2 invocaciones a `provision()` distintas (RC + Enhance); F2/F3 producen 1; F4 produce 2 (con la del dominio resolviendo asíncrono).

---

### 3. DNS-as-capability — capability flag canónico nuevo `has_dns_management`

**Decisión:** se añade a `PluginCapabilities` (ADR-077 §3) un flag booleano nuevo:

```typescript
/** Si el plugin gestiona zonas DNS authoritative (puede listar/CRUD records). */
has_dns_management: boolean;
```

La firma exacta + actualización de plugins existentes + test contract genérico ampliado se materializan en **ADR-077 Amendment A1** (paralelo a este ADR, mismo PR).

**Mapping canónico inicial:**

| Plugin | `has_dns_management` | Justificación |
|---|---|---|
| `internal` | `false` | Plugin trivial; no toca DNS. |
| `manual` | `false` | Plugin trivial; no toca DNS. |
| `enhance_cp` (Sprint 15C) | **`true`** | Enhance corre PowerDNS como autoridad real (confirmado en `docs/_research/sprint-15c/orchd-oas3-api.yaml` línea 18258: 11 record kinds soportados + DNSSEC + per-zone CRUD). |
| `resellerclub` (Sprint 15D) | **`false`** | RC registra dominios pero los NS por defecto van a Aelium (ns1/ns2.aelium.net), no a RC. RC NO es autoridad DNS de los dominios Aelium. |
| `docker_engine` (Sprint 15E) | `false` | Docker auto-hosteado; el A record del subdomain se crea en Enhance (el plugin DNS authority del cluster). |
| `plesk_obsidian` (Sprint 15G futuro) | `true` (si Aelium opera Plesk con DNS authority) | Por configuración: Plesk puede o no ser DNS authority — el flag se decide al instalar. |
| `cloudflare_dns` (hipotético futuro) | `true` | Caso límite de DNS authority sin hosting. Reservado. |

**Implicación frontend**: la página de servicio de un *dominio* pide DNS records al orquestador, no al plugin del dominio. La página de servicio de un *hosting* pide DNS records al plugin del hosting (que típicamente coincide con el DNS authority — Enhance). El orquestador decide vía `dns-authority-resolver` (§6).

---

### 4. NS-sync 3 capas (C1, C2, C3)

La configuración `ns1/ns2.aelium.net` debe coincidir en tres lugares físicos. Aelium tiene **una sola fuente de verdad** (C3, setting Aelium); las otras dos se propagan desde ahí:

| Capa | Dónde vive físicamente | Cómo se aplica | Frecuencia de cambio |
|---|---|---|---|
| **C1** Glue records de `aelium.net` | Cloudflare zone de `aelium.net` + WHOIS del registrar de `aelium.net` (externo) | **Manual ops Yasmin.** Vive fuera del cluster Enhance — no se automatiza desde Aelium. Si se renombran ns1/ns2, Yasmin actualiza Cloudflare + WHOIS antes de cambiar C3. | ~nunca (cambio de IP de los NS = ops planificada) |
| **C2** Default NS de zonas Enhance | API Enhance `POST /v2/settings/dns/default-records` con records `{ kind: 'NS', name: '@', value: 'ns1.aelium.net' }` y `'ns2.aelium.net'` | **Bootstrap automático del plugin Enhance** al instalarse (idempotente — si ya están, no-op). Recargado cuando el setting C3 cambia (listener `provisioning.default_nameservers_changed` propaga a C2 vía API). | Raro — solo si Aelium decide cambiar la pareja de NS o añadir un tercero. |
| **C3** Setting Aelium fuente de verdad | Tabla `Setting` (categoría `provisioning`, key `default_nameservers`, value `["ns1.aelium.net","ns2.aelium.net"]` JSON array) | **Editado por superadmin desde `/admin/settings`** (Sprint 12 — categoría `provisioning`). Fuente de verdad. Cualquier consumidor lee desde aquí: plugin RC al registrar dominios, plugin Enhance al exponer `getServiceInfo`, helper `dns-authority-resolver` al comparar nameservers. | Raro — solo si Aelium cambia el modelo (ej. usar Cloudflare para clientes premium). |

**Mejora respecto al dossier 15D §3.4**: la propagación C3 → C2 es automática vía API (no manual). C1 sigue manual porque vive fuera del cluster Enhance (en Cloudflare/registrar externo).

**Setting canónico**:

```yaml
category: provisioning
key: default_nameservers
value: ["ns1.aelium.net", "ns2.aelium.net"]
description_i18n: setting.provisioning.default_nameservers.description
type: array<string>
edit_role: superadmin
```

Listener canónico nuevo (Sprint 15C Fase D):

```typescript
@OnEvent('provisioning.default_nameservers_changed')
async syncEnhanceDefaults(payload: { newValue: string[]; oldValue: string[] }) {
  // Llama a EnhanceApiClient.upsertDefaultNsRecords(payload.newValue)
  // Idempotente: si los records ya existen con el mismo valor, no-op.
}
```

---

### 5. Listener `auto-config-dns-on-hosting-provisioned` redefinido — reconciliation defensivo

El dossier 15D pre-fijó este listener con la responsabilidad de "tras provisioning de hosting, añadir A records iniciales (apex + www) a la zona DNS del dominio". El descubrimiento del endpoint `/v2/settings/dns/default-records` cambia el patrón canónico:

- Enhance aplica los **default records platform-level** a TODA zona nueva automáticamente (atomicidad: el momento de creación de la zona es el mismo que la aplicación de defaults — sin race condition).
- Aelium configura los defaults una sola vez en bootstrap del plugin Enhance (y cuando el setting C3 cambia):
  - `{ kind: 'A', name: '@', value: '<server_ip>' }`
  - `{ kind: 'A', name: 'www', value: '<server_ip>' }`
  - `{ kind: 'NS', name: '@', value: 'ns1.aelium.net' }`
  - `{ kind: 'NS', name: '@', value: 'ns2.aelium.net' }`
  - `{ kind: 'MX', name: '@', value: 'mail.<server_ip_reverse>' }` (opcional, si email role activo)
- Cualquier zona creada después hereda esos records. **Cero código en runtime de provision.**

**Decisión canónica**: el listener `auto-config-dns-on-hosting-provisioned` queda como **reconciliation defensivo**, NO como creación inline:

- Tras `service.activated` con `provisioner_slug='enhance_cp'`, listener verifica que la zona del dominio tiene los records esperados (defensivo: por si admin cambió defaults *después* de que la zona ya estuviera creada).
- Si **faltan** records esperados → el listener los añade (idempotente).
- Si hay records inesperados extra (MX custom, TXT custom, CNAME custom que el operador o el cliente añadieron) → **NO los borra**. Aelium NO espeja zone state — aplica defaults faltantes solamente.

Esto es una **mejora arquitectónica** sobre el dossier 15D: menos código activo, lógica más declarativa, cero race condition. **El patrón "default records globales + reconcile defensivo"** queda como canónico para todo hosting plugin con DNS authority (también aplicará a Plesk Obsidian Sprint 15G si se confirma con DNS authority).

---

### 6. Cross-plugin DNS authority resolver — `core/provisioning/dns-authority-resolver.ts`

**Problema concreto**: el cliente abre `/dashboard/services/[id]` de su **dominio** (provisioner `resellerclub`). RC declara `has_dns_management=false`. Para mostrar DNS records en la página, el orquestador `provisioning` debe resolver: *"¿quién es la autoridad DNS de este dominio?"*

**Diseño canónico**:

```typescript
// backend/src/core/provisioning/dns-authority-resolver.ts (Sprint 15C Fase D)

import type { Service } from '@prisma/client';
import type { ProvisionerPlugin } from './types';

export interface DnsAuthorityResolution {
  /** 'aelium' = la zona vive en un plugin Aelium con has_dns_management=true.
   *  'external' = el cliente debe gestionar DNS fuera de Aelium. */
  readonly authority: 'aelium' | 'external';

  /** Plugin que sirve los records si authority='aelium'. NULL si 'external'. */
  readonly plugin: ProvisionerPlugin | null;

  /** Razón legible de la resolución — para debug + audit. */
  readonly reason: string;
}

/**
 * Resuelve qué plugin (si alguno) sirve la zona DNS de un service.
 *
 * Reglas canónicas (ADR-082 §6):
 *
 *   1. Si product.type ∈ {hosting_web, docker_service}:
 *      authority='aelium', plugin = el primer plugin registrado con
 *      has_dns_management=true (canónico: enhance_cp; el hosting tiene
 *      su propia zona en Enhance siempre — invariante DH-INV-1).
 *
 *   2. Si product.type === 'domain':
 *      Comparar service.metadata.nameservers vs setting
 *      provisioning.default_nameservers (NS-sync C3, ADR-082 §4).
 *        - Match → authority='aelium', plugin = enhance_cp.
 *          (la zona del dominio vive en cluster Aelium).
 *        - No match → authority='external', plugin=null.
 *          (cliente debe gestionar DNS en su registrar/proveedor externo).
 *
 *   3. Cualquier otro product.type: authority='external', plugin=null
 *      (productos sin dominio asociado — futuro Cloud Office, etc.).
 *
 * R4 intacto: este helper vive en core, NO en plugin. El plugin RC NO
 * importa el plugin Enhance — el orquestador hace el routing.
 */
export function resolveDnsAuthority(
  service: Service,
  productType: string,
  registry: PluginRegistryService,
  settings: SettingsService,
): DnsAuthorityResolution { /* ... */ }
```

**Endpoint canónico nuevo (Sprint 15C Fase D)**: `GET /api/v1/services/{id}/dns/records` que internamente:

1. Resuelve authority via `resolveDnsAuthority`.
2. Si `authority='aelium'` → routea al plugin: `plugin.executeAction(service, 'list_dns_records', {})` con wrapper canónico.
3. Si `authority='external'` → devuelve **HTTP 404** con body `{ message: 'DNS gestionado externamente', nameservers: <service.metadata.nameservers>, hint: 'modify_ns_to_aelium_to_enable_dns_management' }`. El frontend lo interpreta como "mostrar banner externo + acción curada `modify_ns`".

**Endpoints análogos** (Sprint 15C Fase D — F.E.E.G):

- `POST /api/v1/services/{id}/dns/records` — crea record. Routea a `executeAction(service, 'add_dns_record', payload)`.
- `PATCH /api/v1/services/{id}/dns/records/{recordId}` — `executeAction(service, 'update_dns_record', { recordId, ...payload })`.
- `DELETE /api/v1/services/{id}/dns/records/{recordId}` — `executeAction(service, 'delete_dns_record', { recordId })`.

**R4 intacto**: el plugin RC NO importa el plugin Enhance. El orquestador (vive en `core/provisioning/`, no en plugin) hace el routing por capability flag, NO por slug. Esto materializa la doctrina ADR-070 §"Cero `if (provisioner === 'X')` en frontend ni en orquestador".

---

## Consecuencias

- ✅ **Ganamos:**
  - **Modelo de dominio congelado** antes del primer plugin real → cero refactor inter-sprint cuando lleguen RC, Docker, Plesk.
  - **DH-INV-6** simplifica drásticamente las decisiones de race condition: la pregunta "¿qué pasa si el admin tocó X en el panel?" tiene respuesta canónica (Aelium adopta + audit + alerta si threshold).
  - **`has_dns_management`** abre la puerta a DNS-as-feature comercial diferenciado: Aelium puede ofrecer "DNS gestionado" como añadido a clientes BYOD (F3 → F2 si cambian NS).
  - **Helper `dns-authority-resolver`** vive en core → R4 reforzado, frontend se mantiene sin condicionales por slug, plugin RC no acopla a plugin Enhance.
  - **Listener reconcile defensivo** (§5) elimina el race condition que el dossier 15D pre-fijó como riesgo, con menos código activo y lógica más declarativa.
  - **NS-sync 3 capas** documenta operativamente cómo cambiar `ns1/ns2.aelium.net` (orden: C1 manual → C3 setting → C2 propagación automática).
  - **4 flujos F1-F4** documentados como referencia para `BillingCheckoutService` y para QA de E2E.
- ⚠️ **Aceptamos:**
  - **Sprint 15C Fase A se retrasa ~0.5 sesión** redactando este ADR + ADR-077 Amendment A1 + ADR-083. Inversión que paga >5x cuando llegan 15D/15E/15G.
  - **DH-INV-6 implica que Aelium NUNCA es fuente de verdad operacional**. Esto cierra la puerta a UX que requeriría sincronía bidireccional (ej. "edita aquí en Aelium y se propaga a Enhance" sin reconcile). Aceptado: el patrón canónico es "Aelium dispara acciones síncronas; reconcile actualiza estado". UX bidireccional síncrona requeriría ADR específico.
  - **El helper `dns-authority-resolver` vive en core/provisioning/**. Plugins importan el contrato (`types.ts`) pero NO el resolver — el orquestador lo invoca. Si un plugin futuro necesitara resolver DNS authority desde dentro (caso límite), requeriría ADR específico que justifique la excepción a R4.
  - **El listener defensivo §5 puede no detectar drift sutil** (ej. operator añadió un MX con TTL distinto al default). Aceptado: el objetivo no es full-mirror de zone state — es defensa contra "defaults faltantes". El cliente puede gestionar TTL custom desde Aelium o desde panel Enhance.
- 🚪 **Cierra:**
  - **NO hay foreign key `services.linked_domain_id`** — el linkage es por string `services.domain` (DH-INV-4). Cualquier propuesta de FK requiere ADR específico.
  - **NO se permite `has_dns_management=true` en un plugin sin que `executeAction` soporte los slugs canónicos** `list_dns_records`, `add_dns_record`, `update_dns_record`, `delete_dns_record`. Test contract genérico (ADR-077 Amendment A1) lo enforza.
  - **NO se persiste zone state local en Aelium** — la UI lee siempre fresh del proveedor (cache 60s Redis L1, lecturas on-demand L2 sin cache para DNS records). Cualquier propuesta de cache de records local requiere ADR específico justificando latencia/coste/concurrencia.
  - **NO se mezclan registrar plugin + DNS authority plugin** en una misma instancia salvo que ambos roles los cubra el mismo proveedor (caso teórico — ningún plugin actual). Aelium asume separación: registrar = identidad del dominio (RC); DNS authority = cluster de zonas (Enhance).
  - **NO se aplica auto-mirror de DNS records cambiados manualmente fuera de Aelium**. DH-INV-6 + decisión §6.10 dossier 15C.

---

## Cuándo revisar

- **Si llega un plugin que es a la vez registrar + DNS authority** (ej. Cloudflare Registrar + Cloudflare DNS — caso real). Hoy ningún plugin Aelium lo es. Revisión: el helper `dns-authority-resolver` necesita una rama "el mismo plugin sirve dominios y DNS" — relativamente trivial pero requiere amendment a §6.
- **Si Aelium decide ofrecer DNS gestionado para clientes BYOD** (F3 → ofrecer "te gestionamos DNS sin que cambies de registrar" como producto). Hoy F3 termina en `authority='external'`. Caso de uso futuro requeriría: alta de zona en Enhance sin que el dominio sea Aelium (registrado en otro lado), lo cual requiere validación en alta + flujo NS-change asistido. Amendment a §3 o ADR específico.
- **Si DH-INV-6 se vuelve restrictiva** — caso real: cliente cambia DNS record desde panel Enhance, Aelium tarda 6h en reconcile, cliente pregunta "por qué Aelium muestra estado viejo". Hoy la doctrina es L2 reads on-demand sin cache para DNS records → no aplica el problema. Pero si llegara a serlo (ej. cliente quiere ver "última actualización detectada" en cada record), requiere amendment a DH-INV-6 con timestamp de freshness explícito.
- **Si llega un quinto flujo de checkout** (ej. "domain transfer-out + cancel hosting" — cliente se va). Hoy F1-F4 cubren entrada al sistema; salida del sistema vive en `services.cancellation` (ADR-028). Si la salida adquiere flujo propio con efectos en DNS/billing complejos, ADR específico.
- **Si un plugin futuro propone `has_dns_management='partial'`** — caso teórico: un proveedor que soporta read-only DNS records pero no CRUD. Hoy el flag es booleano. Una tercera opción `'read_only'` requiere amendment a §3 + adaptación frontend (ocultar botones add/edit/delete sin desactivar la sección entera).
- **Si DC.30 (DNS records inline UI)** llega antes de que el plugin Enhance esté operativo → bloqueante. Sprint 15C es la única ruta para desbloquear DC.30.

---

## Referencias

- **Módulos afectados:**
  - `core/provisioning/dns-authority-resolver.ts` (NUEVO Sprint 15C Fase D) — implementa §6.
  - `core/provisioning/types.ts` — extendido por ADR-077 Amendment A1 con `has_dns_management`.
  - `modules/provisioning/services/dns-records.controller.ts` (NUEVO Sprint 15C Fase D) — endpoints `GET/POST/PATCH/DELETE /api/v1/services/{id}/dns/records`.
  - `plugins/provisioners/internal/internal.plugin.ts` — declara `has_dns_management: false` (Amendment A1).
  - `plugins/provisioners/manual/manual.plugin.ts` — declara `has_dns_management: false` (Amendment A1).
  - `plugins/provisioners/enhance_cp/enhance.plugin.ts` (NUEVO Sprint 15C Fase C) — declara `has_dns_management: true` + soporta inline actions DNS canónicas.
  - `plugins/provisioners/resellerclub/rc.plugin.ts` (FUTURO Sprint 15D) — declara `has_dns_management: false`.
  - `modules/settings/listeners/sync-default-nameservers-to-enhance.listener.ts` (NUEVO Sprint 15C Fase D) — propaga C3 → C2.
  - `modules/provisioning/listeners/reconcile-dns-defaults-on-service-activated.listener.ts` (NUEVO Sprint 15C Fase D) — implementa §5 reconcile defensivo.
- **Reglas relacionadas:**
  - [R0](../00-foundations/rules.md) — decisiones arquitectónicas requieren ADR (este es el ADR transversal correspondiente).
  - [R3](../00-foundations/rules.md) — audit log inmutable: cada record CRUD se persiste en `audit_change_log` vía wrapper `executeActionWithCacheInvalidation`.
  - [R4](../00-foundations/rules.md) — plugins no se importan desde core. El resolver vive en core, NO en plugin RC.
  - [R7](../00-foundations/rules.md) — errores semánticos: `ProvisionerPluginError('INVALID_PAYLOAD')` para DH-INV-2.
  - [R12](../00-foundations/rules.md) — credenciales no en metadata cliente.
- **ADRs relacionados:**
  - [ADR-009](./adr-009-estrategia-plugins.md) — patrón plugin general.
  - [ADR-021](./adr-021-provisioners.md) — interfaz mínima v1.
  - [ADR-070](./adr-070-service-info-sso-acciones-curadas.md) — doctrina "dashboard puerta unificada" — este ADR la **especializa** para DNS + dominios.
  - **[ADR-077](./adr-077-contrato-provisioner-plugin-v2.md) Amendment A1** — añade `has_dns_management` al contrato + actualiza plugins existentes + amplía test contract genérico. Materializa §3 de este ADR a nivel de código TypeScript.
  - [ADR-080](./adr-080-plugin-framework.md) — manifest declarativo (los plugins reales declaran sus shapes de config para DNS-related settings).
  - **[ADR-083](./adr-083-plugin-enhance-cp-specifics.md)** — Plugin Enhance CP specifics. Materializa §4 (default records bootstrap), §5 (listener defensivo), §6 (resolver con plugin enhance_cp como aelium authority) y DH-INV-6 (operational doctrine).
  - [ADR-018](./adr-018-catalogo-dinamico-productos.md) / [ADR-020](./adr-020-categorias-extras-producto.md) — `ProductExtra` "free domain first year" (excepción a DH-INV-5 a nivel billing, no a nivel renewal).
  - [ADR-066](./adr-066-tres-portales-raiz-portalbadge.md) — endpoints `/api/v1/services/{id}/dns/*` viven en portal cliente; admin tiene espejo `/api/v1/admin/services/{id}/dns/*`.
- **Glosario:** *DH-INV-N* (a añadir: 6 invariantes), *NS-sync 3 capas* (a añadir: C1/C2/C3), *DNS authority resolver* (a añadir), *Default DNS records platform-level* (a añadir), *F1/F2/F3/F4 checkout flows* (a añadir).
- **Sprint:** 15C Fase 15C.A (este ADR) → 15C.D (implementación §4/§5/§6 en código).
- **Dossier de origen:** [`docs/60-roadmap/sprint-15c-enhance-cp-dossier.md`](../60-roadmap/sprint-15c-enhance-cp-dossier.md) — §3 (modelo Domain↔Hosting), §6.5 (DNS doctrine), §6.10 (DH-INV-6 operational doctrine). Este ADR es la materialización canónica de esas secciones.

---

## Amendments

> Reservado para cambios compatibles hacia atrás post-cierre del ADR. Cada amendment con fecha + ADR/sprint específico que lo justifica.

(ninguno todavía)
