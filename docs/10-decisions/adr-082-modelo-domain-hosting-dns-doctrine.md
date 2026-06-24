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

> **Nota (Amendment A1, Sprint 15C.II Fase F.4):** la fila "Subscription suspended en Enhance" es la dirección *proveedor→Aelium* del reconcile cron (write-time). La dimensión de **suspensión/cancelación de `services.status`** es además el *lifecycle administrativo autoritativo* — distinto del estado *operacional* (plan/refs/métricas/zone) donde DH-INV-6 manda sin matices. En read-time, `ProvisioningService.getInfoForUser` confía en `services.status` para esa dimensión y expone `provider_state_desync` cuando el proveedor no la refleja, ofreciendo realinear el proveedor con Aelium (NO al revés — eso desharía la decisión administrativa). Detalle en §Amendments → A1.

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
- **Dossier de origen:** [`docs/60-roadmap/completed/sprint-15c-plugin-enhance-cp.md`](../60-roadmap/completed/sprint-15c-plugin-enhance-cp.md) — §3 (modelo Domain↔Hosting), §6.5 (DNS doctrine), §6.10 (DH-INV-6 operational doctrine). Este ADR es la materialización canónica de esas secciones.

---

## Amendments

> Reservado para cambios compatibles hacia atrás post-cierre del ADR. Cada amendment con fecha + ADR/sprint específico que lo justifica.

### Amendment A1 — Lifecycle *administrativo* vs estado *operacional*: alcance de DH-INV-6 (Sprint 15C.II Fase F.4, 2026-05-12)

**Contexto.** El testing de la Fase F.1 (suspend/unsuspend admin) destapó un agujero: `getServiceInfo` deriva `info.status` — y por tanto `availableActions` (el botón "Reanudar servicio"), el badge del header, y para el cliente el banner de suspensión — **solo del proveedor** (`mapSubscriptionStatus(subscription)`), mientras `services.status`, el banner amarillo admin y el guard de `unsuspendAsAdmin` van **solo de la BD**. Cuando discrepan (flujo F.1 a medio terminar, `MockEnhanceServer` in-memory reiniciado perdiendo el `patchSubscription`, el cron de billing, o un cambio directo en el panel del proveedor) la UI mostraba el banner de suspensión pero **sin forma de deshacerlo**; el desync inverso (BD `active`, proveedor `suspended`) daba `409 SERVICE_NOT_SUSPENDED` en un botón visible. Esto no es "feature pendiente" — es un estado roto sin salida.

**Aclaración.** `services.status` tiene **dos dimensiones con autoridades distintas**:

- **Dimensión administrativa del lifecycle** (`suspended` / `cancelled` / `terminated` — y la transición a/desde `active`): **`services.status` es autoritativo**. Refleja una *decisión de Aelium* (un admin suspendió desde el dashboard, el cron de billing suspendió por impago, un admin canceló) — el proveedor debe obedecer esa decisión. Si el proveedor drifta y deja de reflejarla (p.ej. alguien la des-suspende en el panel del proveedor), Aelium **no** adopta ese cambio (sería deshacer la decisión administrativa): lo expone como desincronización y ofrece la remediación de **realinear el proveedor con `services.status`**.
- **Dimensión operacional** (plan/refs/métricas/zone DNS/estado de website): **el proveedor gana** — esto es DH-INV-6 sin matices. Aelium no es fuente de verdad operacional; el reconcile cron adopta lo que el proveedor reporta.

Estas dos cosas no se contradicen: el reconcile cron sigue actualizando `services.status='suspended'` cuando *detecta* una suspensión hecha en el proveedor (write-time — fila "Subscription suspended en Enhance" de la tabla de §"Aplicación práctica de DH-INV-6"); F.4 añade el complemento de **read-time**: `ProvisioningService.getInfoForUser` confía en `services.status` para la dimensión de suspensión, fuerza `info.status='suspended'` cuando Aelium lo tiene suspendido, re-deriva `availableActions` desde el estado administrativo (para que los botones coincidan con lo que aceptan los guards), y expone `summary.provider_state_desync` cuando proveedor y BD discrepan en esta dimensión. El flag vive en el summary del orquestador (contrato frontend), **NO** en `ServiceInfo` (contrato de plugin — el plugin no puede conocer este desfase, solo ve su lado): por eso F.4 **no toca el contrato `ProvisionerPlugin`** (ADR-077), solo la capa del orquestador, heredable a todos los plugins.

**Materialización.**
- `ProvisioningService.getInfoForUser` (capa orquestador): override de `info.status` + re-derivación de `availableActions` vía `filterActionsByStatus` (promovido de `enhance.plugin.ts` a `core/provisioning/plugin-utils.ts`) + `summary.provider_state_desync`. Condición: plugin con `supports_suspend`, `services.status ∈ {active, suspended}`, proveedor *accesible* (`info.status ∉ {unknown, failed}`) y `info.status !== services.status` — cubre el desfase en cualquier dirección, incluido el proveedor reportando un estado **terminal** (`cancelled`/`expired`) mientras Aelium lo tiene `suspended` (caso real: `MockEnhanceServer` in-memory reiniciado tras una suspensión; en producción el equivalente sería alguien eliminando la suscripción directamente en el panel del proveedor). Cuando Aelium lo tiene `suspended` ⇒ `info.status='suspended'` (header/banner/badge coherentes); cuando lo tiene `active` y el proveedor reporta algo más restrictivo ⇒ se conserva el estado del proveedor (no se baja severidad — el cliente no puede usarlo) y el admin lo resuelve. Si el proveedor está caído (`unknown`/`failed`) no se afirma desync y el admin ve el `AdminDriftBanner` normal de "proveedor inaccesible".
- `ProvisioningService.resyncProviderStateAsAdmin` + `POST /admin/services/:id/resync-provider-state`: re-aplica la inline action canónica `suspend_service`/`unsuspend_service` para que el proveedor coincida con `services.status` — **sin transición de lifecycle** (no escribe la BD, no emite `service.suspended`/`unsuspended`, no crea notas), idempotente, audit de acceso `service_provider_state_resync_admin`. (Antes la única vía era "Reanudar y volver a suspender", que generaba dos transiciones de lifecycle falsas.)
- Frontend: banner de suspensión cliente en `/dashboard/services/[id]` (motivo cliente-seguro del enum `SuspensionReason` — nunca la nota interna — + CTA: impago→`/dashboard/billing`, resto→`/dashboard/support`; oculta SSO + ActionsBar + DNS mientras suspendido) + `<AdminProviderStateDesyncBanner>` en `/admin/services/[id]` con el botón "Realinear estado del proveedor".

**Cross-refs.** Complementa la tabla de §"Aplicación práctica de DH-INV-6" (esa tabla sigue vigente para la dirección proveedor→Aelium del reconcile cron). Ver también ADR-070 (gateway curado — el cliente nunca opera "como si nada" sobre un servicio suspendido) y el dossier Sprint 15C.II §A.11.10.1. No requiere bump de contrato (ADR-077 sin cambios — F.4 es capa orquestador + UI).

---

### Amendment A2 (2026-05-21) — flujo F5 "register domain only" + creación de zona DNS post-register vía orquestador + lifecycle de expiración del dominio con `expires_at` first-class (Sprint 15D Fase 15D.A)

**Contexto.** Sprint 15D implementa el primer registrar (ResellerClub, [ADR-081](./adr-081-plugin-resellerclub-specifics.md)). Al cotejar el dossier 15D contra esta doctrina (sesión 2026-05-21) emergieron tres huecos del modelo original:

1. **Los cuatro flujos canónicos F1–F4 (§2) TODOS incluyen "+ buy hosting".** No existe flujo para **"comprar solo un dominio"** (sin hosting) — pese a que DH-INV-3 lo permite explícitamente ("domain service puede vivir solo"). Es un caso real (defensa de marca, dominio aparcado, futuro proyecto) y frecuente.
2. **La zona DNS de un dominio-solo no se crea.** El listener `reconcile-dns-defaults-on-service-activated` (§5) filtra `provisioner_slug='enhance_cp'` → se dispara solo para hosting Enhance. Un dominio registrado por RC con `NS=ns1/ns2.aelium.net` pero **sin hosting** queda apuntando a un PowerDNS sin zona → **SERVFAIL / dominio caído** (justo el problema que §2 del dossier 15D pretendía evitar). El dossier 15D pre-fijó un *handshake pre-register* (`domain.zone_pre_create`) que esta doctrina (§5) reemplazó por "default records + reconcile post-`service.activated`" — pero ese reemplazo solo cubre el caso hosting.
3. **No hay lifecycle de expiración del dominio.** El enum `ServiceStatus` (Prisma) no tiene `expired`/`redemption`, y `services` no tiene columna de expiración real del proveedor (solo `next_due_date`, que es facturación). Un dominio expirado se trataría con el dunning genérico de impago (suspend→cancel en 30d), ignorando el ciclo ICANN (RGP/redemption ~30-45d donde el rescate cuesta un fee alto, luego pending-delete).

> **Justificado por:** cotejo de planificación Sprint 15D (sesión 2026-05-21) + [ADR-084](./adr-084-comercio-dominios-registrar.md) (comercio de dominios) + [ADR-081](./adr-081-plugin-resellerclub-specifics.md) (RC). Decisión D1 de la sesión: "zona post-register vía orquestador (recomendada)".
> **Sprint:** 15D Fase 15D.A (doctrina). Implementación: F5 + zona post-register en 15D core (Fase F); lifecycle de expiración + `expires_at` + avisos en 15D core (Fase B/C según [ADR-084](./adr-084-comercio-dominios-registrar.md)).
> **Compatibilidad:** Hacia atrás. Additivo: F5 extiende §2 sin tocar F1–F4. La creación de zona reusa el `dns-authority-resolver` (§6) y los default records (§5) — cero contrato nuevo de plugin (ADR-077 sin cambios por esto). `services.expires_at` es columna **nullable** nueva (migración additiva). El lifecycle de expiración NO toca el enum `ServiceStatus` (se modela como estado **operacional** del proveedor — DH-INV-6 —, no administrativo).

#### A2.1. Quinto flujo canónico — F5 "register domain only"

Se añade a la tabla de §2:

| Flujo | Caso | Línea(s) factura | Provisioning |
|---|---|---|---|
| **F5** Register domain only (sin hosting) | Cliente compra solo un dominio (defensa de marca, aparcado, futuro proyecto). DH-INV-3. | 1 line item (solo dominio). | Registrar el dominio (síncrono vía registrar — Sprint 15D) con `NS=provisioning.default_nameservers`. **El orquestador crea la zona DNS vacía en el DNS authority (A2.2)** para que el dominio resuelva desde el minuto uno. NO hay hosting asociado; `services.domain` apunta al propio FQDN registrado. Renewal cycle propio (DH-INV-5). |

`transfer-in domain only` (sin hosting) es la variante asíncrona de F5 — mismo manejo de zona al completar el transfer (evento `domain.transfer_completed`, Sprint 15D.II).

#### A2.2. Creación de zona DNS post-register vía orquestador (decisión D1)

**Regla canónica.** Cuando un service de `product.type === 'domain'` se activa (`service.activated`) con `nameservers === provisioning.default_nameservers` (NS-sync C3, §4), el **orquestador** (`core/provisioning/`, NO el plugin registrar) garantiza que la zona existe en el DNS authority:

1. Resuelve la autoridad vía `resolveDnsAuthority(service, productType, registry, settings)` (§6) → `authority='aelium'`, `plugin=enhance_cp`.
2. Pide a ese plugin **crear la zona vacía idempotente** con los default records platform-level (§5): apex/www A + NS + MX si aplica. Idempotente: si la zona ya existe (caso F1, donde el hosting Enhance la creará/usará después), **no la recrea** — reusa la existente.
3. **Fail-soft (DH-INV-6 + "Aelium dispara acción, reconcile actualiza"):** el `domains/register` en el registrar **es irreversible** (cuesta dinero). Si la creación de zona en Enhance falla, **NO se aborta ni revierte el registro** — se emite `system.error` (alerta superadmin) + se deja marca para que el reconcile/avisos reintenten. El dominio queda registrado y el operador/reconcile completa la zona. (Esto **descarta** explícitamente el *handshake pre-register* `domain.zone_pre_create` que pre-fijaba el dossier 15D §6.11/T10: añadía un paso bloqueante y podía dejar zona huérfana si el register fallaba después.)

**R4 intacto:** el plugin registrar (RC) **NO importa** el plugin Enhance. El routing lo hace el orquestador por capability (`has_dns_management=true`), nunca por slug — coherente con §6 y ADR-070. Implementación canónica: listener nuevo `ensure-dns-zone-on-domain-activated` en `core/provisioning/` (paralelo a `reconcile-dns-defaults-on-service-activated` §5, pero filtrando `product.type='domain'` con NS=Aelium en lugar de `provisioner_slug='enhance_cp'`).

Esto cierra el hueco: **un dominio nunca apunta a Enhance sin zona**, ni siquiera sin hosting (F5).

#### A2.3. Lifecycle de expiración del dominio + `expires_at` first-class

**Schema (migración additiva):** `services.expires_at: DateTime?` — fecha **real de expiración reportada por el proveedor** (registrar para dominios; distinta de `next_due_date`, que es la fecha de facturación de Aelium). Nullable; la puebla el reconcile cron para servicios de dominio. Permite que el cron de avisos haga query eficiente (`WHERE expires_at BETWEEN now AND now+Nd`) en lugar de parsear `metadata` JSON.

**Estados del dominio (operacionales, NO administrativos).** El ciclo ICANN del dominio se modela como **estado operacional dictado por el registrar** (DH-INV-6), no como nuevo valor del enum `ServiceStatus` (que sigue gobernando el lifecycle administrativo de billing: `active/suspended/cancelled/terminated`):

| Fase del dominio | Cómo se refleja | Quién la fija |
|---|---|---|
| `active` | `getServiceInfo().status='active'` + `expires_at` futura | reconcile (registrar) |
| `expired` | `getServiceInfo().status='expired'` (`ServiceInfoStatus` ya lo soporta — ADR-077 §2.3) + `statusReason`/`recoveryHint='renew'` | reconcile (registrar) |
| `redemption` (RGP) | `status='expired'` + `recoveryHint='restore'` + sub-fase en `metadata.domain_lifecycle` | reconcile; renovar normal lanza `DOMAIN_IN_REDEMPTION` (ADR-077 A10) → restore con fee distinto (ADR-084) |
| `pending_delete` | `status='expired'` + `metadata.domain_lifecycle='pending_delete'` (no recuperable) | reconcile |

El `services.status` administrativo permanece `active` mientras Aelium no lo suspenda/cancele por billing — la expiración del **dominio** es ortogonal y vive en el snapshot operacional (`getServiceInfo` + `metadata.domain_lifecycle`). Los **avisos** proactivos ("tu dominio vence en 30/14/7/1 días") los dispara un cron leyendo `expires_at` (eventos `domain.expiring_soon`/`domain.expired`/`domain.entered_redemption`, catálogo en ADR-084). Coherente con DH-INV-6: Aelium adopta lo que el registrar reporta, no al revés.

**Cross-refs.** F5 (A2.1) consume el resolver §6 + default records §5. La zona post-register (A2.2) materializa la decisión D1 y descarta el handshake pre-register del dossier 15D. El lifecycle (A2.3) se apoya en `ServiceInfoStatus='expired'` (ADR-077 §2.3) + `DOMAIN_IN_REDEMPTION` (ADR-077 Amendment A10) + los fees de redemption/restore de la tabla TLD pricing (ADR-084). No requiere bump de contrato de plugin.

---

### Amendment A3 (2026-05-23) — La autoridad DNS es un rol conmutable y configurable (DH-INV-7): sub-contrato DNS authority capability-routed + setting `provisioning.dns_authority_plugin` + runbook de transición (Sprint 15D, refinamiento doctrinal pre-Fase D)

**Contexto.** §6 cerró el *lado lectura* del rol de autoridad DNS de forma plugin-agnóstica: el `dns-authority-resolver` enruta por capability (`PluginRegistryService.getByCapability('has_dns_management')`, `dns-authority-resolver.ts:157`) y el frontend nunca ramifica por slug (ADR-070). Pero el *lado escritura/plumbing* (bootstrap de default records C2, propagación C3→C2 §4, reconcile defensivo de zona §5 y la futura creación de zona post-register A2.2) está hoy **acoplado a Enhance por nombre**: los listeners centrales (`sync-default-nameservers-to-enhance.listener.ts`, `bootstrap-enhance-defaults-on-plugin-installed.listener.ts`, `reconcile-dns-defaults-on-service-activated.listener.ts`) **importan directamente** `EnhanceDnsDefaultsService` y/o filtran `provisioner_slug='enhance_cp'`. Consecuencia: cambiar la autoridad DNS (p. ej. `enhance_cp` → `plesk_cp`) hoy obligaría a reescribir ese plumbing, y los dominios ya registrados (apuntan a `ns1/ns2.aelium.net`, servidos por el PowerDNS de Enhance) dejarían de resolver hasta portarlo. El propio `getByCapability` ya **anticipa** esta carencia (`plugin-registry.ts:274-278`: *"si en el futuro hay varios … la resolución necesitará routing adicional vía settings"*).

> **Requisito de negocio (Yasmin 2026-05-23):** cambiar el plugin de hosting/autoridad DNS (`enhance_cp` → `plesk_cp` u otro) debe **no afectar al sistema de dominios** y ser una **transición organizada y configurable**, a estándar profesional. El rol de **registrar** (ResellerClub, [ADR-081](./adr-081-plugin-resellerclub-specifics.md)) ya está desacoplado por R4; A3 cierra la misma garantía para el rol de **autoridad DNS**.
> **Justificado por:** revaloración doctrinal pre-Fase 15D.D (sesión 2026-05-23) + el gap empírico verificado en el código (write-path Enhance-coupled).
> **Sprint:** 15D refinamiento doctrinal (doc-only). Implementación faseada: la doctrina la **consume Fase 15D.F** (la zona post-register A2.2 nace capability-routed por construcción); el **refactor del plumbing 15C existente** se traza como deuda ([DC.NEW-65](../60-roadmap/backlog.md)) — abordable antes de instalar una 2ª autoridad DNS real (15G Plesk / cualquier swap).
> **Compatibilidad:** Hacia atrás. Additivo. El setting nuevo es nullable (autoselección si ausente → comportamiento actual). La extensión del sub-contrato DNS authority al *plano de escritura* se materializará como **Amendment a [ADR-077](./adr-077-contrato-provisioner-plugin-v2.md)** cuando se implemente (métodos opcionales capability-driven, mismo molde A6/A8/A10 — NO bumpea `contractVersion`).

#### A3.1. DH-INV-7 (nueva invariante — extiende la tabla de §1)

| # | Invariante | Justificación |
|---|---|---|
| **DH-INV-7** ⭐ | **La autoridad DNS es un rol conmutable y configurable, NUNCA acoplado por slug.** Tanto el plano de *lectura* (resolver §6) como el de *escritura* (defaults C2 §4, reconcile de zona §5, ensure-zone A2.2) se enrutan por la capability `has_dns_management=true` + el setting `provisioning.dns_authority_plugin` (A3.2). Ningún código central importa un plugin de autoridad DNS concreto ni filtra por `provisioner_slug='enhance_cp'`. | Permite sustituir la autoridad DNS (`enhance_cp` → `plesk_cp` → futuro `cloudflare_dns`) como **transición de configuración**, no como reescritura. El sistema de dominios (registrar RC + zonas) sobrevive intacto al cambio de hosting: solo cambia *quién sirve* los nameservers, no *que el dominio tenga* nameservers. Cierra, para el rol DNS, la misma garantía que R4 da al rol registrar. |

DH-INV-7 es a la **autoridad DNS** lo que el sub-contrato de registrar ([ADR-077 A10](./adr-077-contrato-provisioner-plugin-v2.md)) es al **registrar**: un rol abstracto que cualquier plugin cumple por capability, intercambiable sin tocar el core ni el frontend.

#### A3.2. Setting canónico nuevo — `provisioning.dns_authority_plugin`

```yaml
category: provisioning
key: dns_authority_plugin
value: null                 # slug del plugin con el rol de autoridad DNS activo; null = autoselección
description_i18n: setting.provisioning.dns_authority_plugin.description
type: string (plugin slug) | null
edit_role: superadmin
```

- **Resolución canónica:** si el setting está **set** → ese slug es la autoridad (debe tener `has_dns_management=true`, validado al guardar; si no, **422**). Si es **null** → autoselección del único plugin activo con `has_dns_management=true` (comportamiento actual — un solo proveedor). Si hay **varios** activos y el setting es null → `system.error` (alerta superadmin) y el resolver degrada a `'external'` (no adivina).
- `PluginRegistryService.getByCapability` y el `dns-authority-resolver` (§6) **honran el setting** antes de la regla "primer plugin con la capability". El cambio del setting es el **interruptor de cut-over** (A3.4).

#### A3.3. Sub-contrato DNS authority — plano de escritura capability-routed

§3 (lectura) ya exige a todo plugin con `has_dns_management=true` las 4 inline actions DNS ([ADR-077 A1.3](./adr-077-contrato-provisioner-plugin-v2.md)). A3 cierra el **plano de escritura**: los tres servicios de zona que hoy viven Enhance-específicos en `EnhanceDnsDefaultsService` se elevan a **responsabilidades del rol** que cualquier autoridad DNS implementa, invocadas por el orquestador **por capability+setting**, nunca por import directo:

| Responsabilidad | Hoy (Enhance-coupled) | Doctrina A3 (capability-routed) |
|---|---|---|
| Bootstrap de default records platform-level (NS C2) | `EnhanceDnsDefaultsService.applyClusterNameservers` | método del sub-contrato DNS authority |
| Reconcile defensivo de zona (§5) | `EnhanceDnsDefaultsService.reconcileZoneDefaults` | método del sub-contrato DNS authority |
| Ensure-zone post-register (A2.2, F5) | (no implementado aún) | método del sub-contrato DNS authority — **nace capability-routed en 15D.F** |

Las firmas exactas se congelan en el Amendment a ADR-077 que acompañe la implementación (métodos opcionales en `ProvisionerPlugin`, **required cuando `has_dns_management=true`**, enforzados por el contract test genérico — mismo patrón que A10.4 para registrar). Los listeners centrales dejan de importar `EnhanceDnsDefaultsService` y resuelven el plugin vía `resolveDnsAuthority`/`getByCapability` honrando el setting A3.2.

#### A3.4. Runbook de transición organizada (`enhance_cp` → `plesk_cp`)

Cero downtime de resolución si se sigue el orden (capas C1/C2/C3 de §4):

1. **Instalar** el nuevo plugin (`plesk_cp`, `has_dns_management=true`) con credenciales en vault — **sin** marcarlo autoridad (el setting sigue en `enhance_cp`/null).
2. **Bootstrap** de default records (NS) en el nuevo proveedor vía el sub-contrato (idempotente).
3. **Migrar/recrear** las zonas existentes en el nuevo proveedor + **verificar paridad** de records (comparación por API / `dig` contra ambos). C1 (glue de `ns1/ns2.aelium.net`) sigue apuntando al PowerDNS viejo durante este paso.
4. **Cut-over:** poner `provisioning.dns_authority_plugin = 'plesk_cp'` (lectura y escritura pasan a enrutar al nuevo) **+** repuntar la infraestructura de nameservers al nuevo PowerDNS — preferentemente **manteniendo `ns1/ns2.aelium.net` como NS abstractos estables** y repuntando solo su IP (C1 manual), de modo que **los dominios ya registrados NO necesiten `modify_ns`** en el registrar. Si el nuevo proveedor impone hostnames de NS distintos, se actualiza C3 (`default_nameservers`) y se propaga a los dominios vía la acción curada `modify_nameservers` del registrar (RC).
5. **Solape + verificación:** monitorizar SERVFAIL; ejecutar reconcile defensivo de zona; mantener el proveedor viejo como autoridad de respaldo hasta confirmar paridad.
6. **Retirar** `enhance_cp` del rol de autoridad DNS (puede seguir como plugin de *hosting* si aplica — los dos roles son independientes, §3).

El **registrar (RC) no se toca** en ningún paso salvo el `modify_nameservers` opcional del paso 4: el dominio siempre tiene nameservers; solo cambia quién los sirve.

#### A3.5. Implicación para Fase 15D.F + deuda trazada

- **15D.F (nace conforme):** el listener `ensure-dns-zone-on-domain-activated` (A2.2) se implementa **capability-routed desde el día uno** (resuelve la autoridad vía `resolveDnsAuthority` + setting; cero import de Enhance). No añade deuda.
- **Refactor del plumbing 15C (deuda):** generalizar los tres listeners 15C + extraer el sub-contrato desde `EnhanceDnsDefaultsService` → **[DC.NEW-65](../60-roadmap/backlog.md)**. No urge mientras `enhance_cp` sea la única autoridad; **prerequisito antes de instalar una 2ª autoridad real** (15G Plesk / cualquier swap), ejecutando el runbook A3.4.

**Cross-refs.** Extiende §1 (DH-INV-7), §3 (plano de escritura del sub-contrato), §4 (el setting es C3-adyacente), §6 (el resolver honra el setting), A2.2 (ensure-zone nace conforme). Cierra la entrada de §"Cuándo revisar" *"Si llega un plugin que es a la vez registrar + DNS authority"* en su vertiente de conmutabilidad. Materialización del contrato: futuro Amendment ADR-077 (sub-contrato DNS authority de escritura). Deuda: DC.NEW-65. Coherente con ADR-070 (cero `if (slug)`), R4 (core no importa plugins), ADR-081 (registrar desacoplado).

---

### Amendment A4 (2026-06-24) — Dominio-solo **aparca en el registrar** (revisa A2.1/A2.2 a la luz de la verificación empírica del gate Enhance) (Sprint 15D Fase 15D.F.3)

**Contexto.** Al implementar F.3 ("zona DNS post-register") se ejecutó la verificación que el roadmap exigía *"⚠️ verificar la primitiva de zona standalone de Enhance antes de prometer"*. La verificación empírica (lectura de la OAS3 real de orchd + el cliente HTTP + el mock de alta fidelidad + ADR-083) devolvió **dos hechos** que invalidan la asunción implícita de A2.2:

1. **Enhance NO tiene primitiva de zona DNS sin website.** Toda operación de zona va por `/orgs/{org}/websites/{ws}/domains/{dom}/dns-zone` (requiere `websiteId`); lo único que acuña una zona es `createWebsite`. El mock lo espeja (zona auto-creada solo dentro de `POST /orgs/{org}/websites`). ADR-083 no decide nada sobre zona standalone. → A2.2 ("el orquestador pide al DNS authority crear la zona vacía idempotente") **no es realizable** para un dominio-solo (F5) sin crear un website Enhance (artefacto de hosting con consumo de subscription → contradice el espíritu de DH-INV-3).
2. **ResellerClub valida que los NS del `register` resuelvan** en DNS y rechaza `ns1/ns2.aelium.net` en pre-producción (sin registro A) con `"NameServer … is not a valid Nameserver"` (`docs/_research/sprint-15d/resellerclub-ote-findings.md` §4.8).

> **Decisión del owner (Yasmin, 2026-06-24):** un dominio registrado **sin hosting** (F5) **aparca en los NS de parking del registrar** (que sí resuelven), no en los de Aelium. El dominio entra en la órbita de Aelium (NS Aelium + zona del website Enhance) **solo cuando se le añade hosting**.
> **Compatibilidad:** Hacia atrás. Additivo. NO contradice la *letra* de A2.2 (que solo crea zona *cuando* `nameservers === default_nameservers`: un dominio en NS de parking nunca cumple la precondición). **Supersede** la cláusula NS de **A2.1** (que decía F5 registra con `NS=default_nameservers`) y el alcance dominio-solo de **A2.2** (ya no se promete zona Aelium para un dominio-solo). El `ensure-zone post-register` de A2.2/A3.3 queda **sin materializar** (innecesario bajo este modelo); su hueco lo cubre la zona del website en F1/F2.

#### A4.1. Modelo de ciclo de NS (regla operativa)

**Un dominio apunta a NS de Aelium (+ zona del website) ⟺ tiene hosting.** Sin hosting, aparca en el registrar.

| Flujo | NS al registrar | Origen de la zona | Switch al activar hosting |
|---|---|---|---|
| F1 dominio + hosting | Aelium | website Enhance | no-op (ya Aelium) |
| F2 dominio Aelium + hosting | ya Aelium | zona existente | no-op |
| F3 BYOD externo + hosting | Aelium no lo registra | website Enhance | no-op (no hay service `type=domain`) |
| F4 transfer-in + hosting | NS entrantes hasta fijar | website Enhance | switch (gated por `provider_reference`) |
| **F5 dominio-solo** | **parking del registrar** | ninguna (resuelve en parking) | n/a; al añadir hosting → switch |

#### A4.2. Materialización (15D.F.3)

- **Selección de NS al registrar (Alternative A — decisión en el core, R4):** el orquestador, al construir el `ProvisionContext` de un `register` de registrar, consulta si existe un service hermano de hosting (`hosting_web`/`docker_service`, mismo cliente, FQDN normalizado, no cancelado) y fija `ProvisionContext.dnsTargetHint = 'aelium' | 'parking'` (default `parking` si no hay hermano). El plugin RC honra el hint: `aelium`→`provisioning.default_nameservers`, `parking`→`provisioning.registrar_parking_nameservers`. La fila hermana existe porque el checkout crea todos los services en una tx antes de provisionar (F1).
- **Switch al añadir hosting:** listener `switch-domain-ns-on-hosting-activated` (`@OnEvent('service.activated')`) + `DomainNsLifecycleService.switchToAeliumIfParked` — capability-routed (registrar por `is_domain_registrar`, nunca por slug), idempotente, **no-clobber** (no toca NS custom del cliente), **fail-soft** (post-activación: no tumba el hosting; el reconcile 6h es red de seguridad). Ejecuta `modify_nameservers` vía el wrapper canónico (breaker + cache + audit `actor=system:provisioning-ns-switch`). **NO emite `domain.nameservers_changed`** (ese evento dispara la alerta de seguridad "verifica que fuiste tú" de F.1, engañosa para un cambio de sistema esperado).
- **`metadata.nameservers` pasa a ser load-bearing (fix de bug latente):** el `dns-authority-resolver` (§6) lee `service.metadata.nameservers`, pero el `register` de RC lo persistía bajo `rc_nameservers` (clave que nadie leía) → **todo dominio RC resolvía `external`**. F.3 persiste `nameservers` (array) en el `register` y en el reconcile cron (DH-INV-6: adopta los NS reales). `ProvisionResult.metadata` se ensancha aditivamente para admitir `string[]`.
- **Setting nuevo** `provisioning.registrar_parking_nameservers` (array, superadmin). **PROVISIONAL** (los NS de parking de RC son incertidumbre empírica — cuenta OT&E vacía): confirmar en el smoke de Fase G.

#### A4.3. Diferido (riesgo trazado)

- **⚠️ Hosting cancelado con dominio retenido → SERVFAIL** (al deprovisionar el hosting se borra el website Enhance y su zona; el dominio queda con NS Aelium apuntando a un PowerDNS sin zona). Manejo simétrico (revertir NS a parking al cancelar el último hosting del dominio) → follow-up con DC.
- **Durabilidad:** el switch cuelga de `service.activated` (emit directo, no Outbox — mismo modelo que el reconcile DNS existente, MEDIUM-1/P-DEPLOY.4). Red de seguridad: el reconcile cron mantiene `metadata.nameservers` fresco. Refactor service.*→Outbox = P-DEPLOY.4.
- **Setting `provisioning.dns_authority_plugin` (A3.2):** NO se implementa en F.3 — por A3.5 es parte del refactor de plumbing **DC.NEW-65**, prerequisito de una 2ª autoridad DNS, no de F.3. El código nuevo de F.3 ya es capability-routed (nace conforme).

**Cross-refs.** Revisa A2.1 (NS de F5) + A2.2 (alcance dominio-solo del ensure-zone). Consume §4 (settings de NS) + §6 (resolver). Honra DH-INV-3 (dominio vive solo, ahora sin forzar artefacto de hosting), DH-INV-6 (registrar gana → reconcile adopta NS), DH-INV-7 (capability-routed), R4 (core no importa plugins). Materialización: `provisioning-orchestrator.service.ts` (dnsTargetHint), `domain-ns-lifecycle.service.ts` + `listeners/switch-domain-ns-on-hosting-activated.listener.ts`, `resellerclub.plugin.ts` (selección NS + fix `nameservers`), `resellerclub-reconciliation.cron.ts` (NS fresco), `core/provisioning/fqdn.util.ts`.

### Amendment A5 (2026-06-24) — La zona DNS al **completar un transfer-in** sigue el modelo de parking de A4 (crea-vs-migra resuelto; sin migración de records BYOD en v1) (Sprint 15D.II Fase 15D.II.A)

**Contexto.** [ADR-084 §4 línea 156](./adr-084-comercio-dominios-registrar.md) decía que al `transfer_completed` "la zona DNS se crea/migra ([A2.2](#amendments))". Pero **A2.2 quedó superseded por A4** (no hay zona Aelium standalone para un dominio-solo; aparca en el registrar). Al abrir 15D.II hay que reconciliar el cierre del transfer con el modelo de NS de A4 y resolver el "crea-vs-migra" que §4 dejó ambiguo.

> **Decisión (Yasmin, 2026-06-24):** un dominio recién **transferido** sigue **exactamente el mismo modelo de NS/zona que un `register`** (A4): apunta a NS de Aelium (+ zona del website Enhance) **⟺ tiene hosting**; sin hosting, aparca en los NS de parking del registrar. **No hay migración de los records DNS preexistentes** del dominio (BYOD) en v1.

- **`transfer_completed` con hosting (F4).** El dominio recibe NS de Aelium + zona del website Enhance, vía el mismo switch de A4 (`switch-domain-ns-on-hosting-activated`, gated por `provider_reference`; fila **F4** de la tabla A4.1). Durante `submitted`/`awaiting_auth` el dominio conserva sus **NS entrantes** (no los tocamos hasta completar).
- **`transfer_completed` sin hosting.** Aparca en `provisioning.registrar_parking_nameservers` (igual que **F5**). Al añadir hosting → switch.
- **Crea, no migra.** La zona se **crea fresca** (la del website Enhance) si hay hosting; no se importan los records que el dominio tuviera en su registrar de origen. La **migración de records BYOD** (leer la zona de origen e importarla) se **difiere a v1.1** (follow-up con DC) — exige lectura de la zona externa, fuera del alcance de transfer-in v1.
- **Evento.** `domain.transfer_completed` lo emite la FSM (Outbox, R8); su listener de zona DNS es **capability-routed** por `dns-authority-resolver` (R4/DH-INV-7), nunca por slug — reutiliza el plano de A4/A3.3.

> **Compatibilidad:** additivo/aclaratorio. **Supersede** la cláusula "se crea/migra → A2.2" de [ADR-084 §4 línea 156](./adr-084-comercio-dominios-registrar.md) (se reemplaza por "sigue el modelo de A4"). Coherente con A4 (NS de Aelium ⟺ hosting) y DH-INV-6 (no espejamos; el registrar es la fuente de verdad). El riesgo simétrico de A4.3 (hosting cancelado → SERVFAIL) aplica igual a un dominio transferido.
