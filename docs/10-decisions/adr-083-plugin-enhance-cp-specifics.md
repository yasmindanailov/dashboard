# ADR-083 — Plugin Enhance CP specifics: auth bearerAuth Super Admin, lazy customer mapping, provision 6-step idempotente, SSO 2-call OTP, capabilities frozen, reconcile 3 capas, mock testing y DH-INV-6 operational doctrine

> **Status:** Active (consume [ADR-077](./adr-077-contrato-provisioner-plugin-v2.md) Amendment A1 + [ADR-080](./adr-080-plugin-framework.md) + [ADR-082](./adr-082-modelo-domain-hosting-dns-doctrine.md))
> **Date:** 2026-05-07
> **Domain:** provisioning, plugins, dns, sso, auth, security
> **Sprint:** Sprint 15C Fase 15C.A (congelación de decisiones específicas del primer plugin real antes de la Fase 15C.B cliente HTTP)

---

## Contexto

[ADR-077](./adr-077-contrato-provisioner-plugin-v2.md) Amendment A1 (2026-05-07) añadió `has_dns_management` al contrato. [ADR-080](./adr-080-plugin-framework.md) (2026-05-05) cerró el Plugin Framework. [ADR-082](./adr-082-modelo-domain-hosting-dns-doctrine.md) (2026-05-07) congeló el modelo Domain ↔ Hosting + DNS doctrine transversal. Sprint 15A (P2.2, master `bee90d8`) materializó el framework con plugins triviales.

Sprint 15C (P2.3) implementa **Enhance CP** como primer plugin real. Enhance es el control panel que Aelium opera en server propio (PowerDNS como autoridad DNS real, ns1/ns2.aelium.net apuntando al servidor dedicado). Es la pieza que desbloquea Sprint 15D ResellerClub (los dominios registrados con NS=Aelium necesitan zonas DNS reales en algún cluster — Enhance es ese cluster).

El chat Yasmin ↔ Claude del 2026-05-07 (commit master `80492ad`) produjo **35 decisiones técnicas frozen** que son específicas del plugin Enhance, no extrapolables a otros plugins. Todas están validadas contra el spec literal `docs/_research/sprint-15c/orchd-oas3-api.yaml` (orchd v12.21.3, 588 KB / 20.848 líneas / ~280 paths). Vienen del dossier `docs/60-roadmap/completed/sprint-15c-plugin-enhance-cp.md` §6.

> **¿Qué pasaría si NO tomáramos esta decisión?** Sprint 15C arranca y reabre cada decisión durante la implementación: ¿bearerAuth o sessionCookie? ¿Owner token o Super Admin token? ¿lazy create customer en alta del Client o en primer hosting? ¿qué endpoint para SSO? ¿qué columnas en `enhance_customers`? ¿cron cada hora o cada 6h? Cada respuesta consumiría decisiones reabiertas en el chat de implementación, y algunas se documentarían inline solo en código. Para cuando el plugin Enhance esté operativo, las razones detrás de "¿por qué Super Admin y no Owner?" o "¿por qué `enhance_customers` con PK natural client_id y no UUID?" vivirán en commits dispersos sin findability. El próximo plugin (Sprint 15D RC) las redescubrirá. Mismo antipatrón que ADR-077/080 evitan a nivel transversal — pero ahora a nivel de plugin específico.

ADR-082 cerró las decisiones cross-plugin. Falta cerrar las decisiones intra-plugin Enhance: las que el dossier §6 enumera y que no tienen sentido fuera del contexto Enhance.

---

## Opciones consideradas

### A. Diferir las 35 decisiones — el código las revela

- **Pros**: rapidez de arranque Fase B cliente HTTP.
- **Contras**: las decisiones quedan dispersas en commits + comentarios inline. Las razones (ej. "Super Admin token porque Owner no es revocable") solo viven en chat ya cerrado. Cuando llegue Sprint 15D RC, el ingeniero (Yasmin o futuro contributor) tendrá que reabrir cada decisión preguntándose si aplica también a RC. Mismo antipatrón "interface emerges from implementation".

### B. Documentar en `docs/features/provisioning/admin-plugins-enhance.md` operativo

- **Pros**: la doc operativa cubre cómo se usa el plugin (Sprint 15C Fase I cierre).
- **Contras**: la doc operativa cubre **qué hace**, no **por qué se decidió así**. R0 (decisiones arquitectónicas requieren ADR) se rompe — algunas de las 35 decisiones SÍ son arquitectónicas (modelo de tenancy, schema nuevo `enhance_customers`, eventos canónicos nuevos `service.admin_sso_impersonation` + `service.reconciled_external_change`).

### C. (elegida) Congelar las 35 decisiones como ADR específico del plugin antes del primer commit de código del plugin

- ADR-083 declara: auth flow + multi-tenancy mapping + tabla nueva `enhance_customers` + provision 6-step idempotente + SSO 2-call OTP + DNS specifics + reconcile 3 capas + mock testing + plan upgrade admin-only + capability flags refinement + DH-INV-6 operational doctrine.
- Sprint 15C Fase 15C.B-I implementa exactamente lo declarado aquí.
- Cualquier desviación durante la implementación requiere amendment (compatible) o ADR-NNN específico (breaking).

- **Pros**:
  - Decisiones congeladas con razón explícita → próximo plugin (RC, Docker, Plesk) cita §X.Y para validar si la decisión aplica también allí.
  - Cualquier reabrir de decisión durante la implementación queda documentado como amendment con fecha + sprint específico.
  - El test contract genérico (ADR-077 Amendment A1) + tests específicos del plugin (`enhance.plugin.spec.ts`) tienen ADR como source of truth.
- **Contras**:
  - Sprint 15C Fase A se retrasa ~0.3 sesión adicional (ya estaba presupuestada en el dossier §7 — "0.5-1 sesión 15C.A").

---

## Decisión

**Opción C — congelar las 35 decisiones específicas del plugin Enhance CP en este ADR antes del primer commit funcional del plugin.**

A continuación se enumera cada decisión con su razón canónica + referencia de spec literal cuando aplique. Numeración 1-35 alineada con el dossier §6.

---

### 1. Auth & test connection (decisiones 1-6)

**Decisión 1 — Scheme**: `bearerAuth` exclusivamente. `sessionCookie` (declarado en `securitySchemes` del spec) se ignora — Aelium NO hace login interactivo; solo machine-to-machine API calls.

**Decisión 2 — Token scope**: **Super Admin** (no Owner). Razón: el rol Owner en Enhance NO se puede borrar (constraint de la plataforma — un org siempre tiene exactamente un Owner). Si filtración del Owner token ocurriera, Aelium no podría revocarlo sin transferir ownership a otro Owner antes (operativa cara). Super Admin tiene permisos completos cluster-wide pero es **revocable** (admin Enhance lo puede borrar desde panel cuando quiera). Mayor blast radius mitigado por revocabilidad.

**Decisión 3 — Storage**: `SecretVaultService` AES-256-GCM heredado [ADR-080](./adr-080-plugin-framework.md) §3. La `apiToken` se cifra con la `ENCRYPTION_KEY` del backend al persistir en `plugin_installs.secrets`. El plugin recibe el token descifrado en memoria via `manifest.secretsSchema` resolution durante la invocación de cada método.

**Decisión 4 — Manifest declarativo**: el plugin Enhance declara explícitamente su shape:

```typescript
readonly manifest: PluginManifest = {
  slug: 'enhance_cp',
  version: '1.0.0',
  manifestVersion: 'v1',
  label: 'plugin.enhance_cp.label',
  description: 'plugin.enhance_cp.description',
  docsUrl: 'docs/features/provisioning/admin-plugins-enhance.md',
  settingsCategory: 'provisioner',
  configSchema: {
    type: 'object',
    properties: {
      baseUrl: { type: 'string', format: 'uri', description: 'plugin.enhance_cp.config.baseUrl' },
      masterOrgId: { type: 'string', format: 'uuid', description: 'plugin.enhance_cp.config.masterOrgId' },
      reconciliationIntervalHours: { type: 'integer', default: 6, minimum: 1, maximum: 168, description: 'plugin.enhance_cp.config.reconciliationIntervalHours' },
    },
    required: ['baseUrl', 'masterOrgId'],
    additionalProperties: false,
  },
  secretsSchema: {
    type: 'object',
    properties: {
      apiToken: { type: 'string', format: 'password', minLength: 16, description: 'plugin.enhance_cp.secrets.apiToken' },
    },
    required: ['apiToken'],
    additionalProperties: false,
  },
  testConnectionMethod: 'getStatus',
};
```

**Decisión 5 — Test-connection**: `GET /version` (idempotente, sin auth, devuelve SemVer string — spec línea 59-73) seguido de `GET /orgs/{masterOrgId}` (con auth, valida que `masterOrgId` resuelve y que el token tiene permisos sobre él). Si ambos 200, OK. Si `/version` falla → `PROVIDER_TIMEOUT` o `NETWORK_ERROR` (retriable). Si `/orgs/{masterOrgId}` falla con 401/403 → `PROVIDER_AUTH_FAILED` (NO retriable, alerta admin).

**Decisión 6 — Headers en todas las llamadas**: `Authorization: Bearer <apiToken>` + `Accept: application/json` + `Content-Type: application/json` (en POST/PATCH/PUT). User-Agent: `Aelium-Dashboard/1.0 EnhanceProvisionerPlugin/1.0.0`.

---

### 2. Multi-tenancy mapping (decisiones 7-9)

**Decisión 7 — Tabla nueva `enhance_customers`**:

> ⚠ **Naming SQL del campo PK actualizado por [Amendment A2](#amendments)** (Sprint 15C Fase C, 2026-05-08): el campo SQL real es `user_id` con FK a `users.id`, no `client_id` con FK a `Client`. El schema Aelium NO tiene modelo `Client` separado — `User` es la identidad canónica del cliente. La doctrina conceptual ("Client Aelium ↔ Customer Org Enhance") permanece intacta. El bloque Prisma de abajo refleja la propuesta original; ver Amendment A2 para el shape canónico vigente.

```prisma
model EnhanceCustomer {
  /// Sprint 15C — ADR-083 §2 — mapping Client Aelium ↔ Customer Org Enhance.
  ///
  /// PK natural `client_id` (NO UUID extra) — el Client Aelium ES la identidad
  /// del customer Enhance, NO necesita identificador artificial encima. Misma
  /// doctrina que `plugin_installs.slug` PK natural (ADR-080 §2). Cardinalidad
  /// acotada por el número de clientes Aelium con hosting Enhance.
  ///
  /// Lazy create al primer hosting Enhance del cliente (decisión 8).
  ///
  /// `enhance_owner_login_id` y `enhance_owner_member_id` se necesitan para SSO
  /// 2-call OTP (decisión 13). Sin ellos, cada SSO requeriría resolver Org →
  /// ownerId desde la API → 2 calls + 1 resolve = 3 calls. Persistirlos: 2 calls.
  client_id                      String   @id @db.Uuid    // ← Amendment A2: ahora es `user_id`
  enhance_org_id                 String   @unique @db.Uuid
  enhance_owner_login_id         String   @db.Uuid
  enhance_owner_member_id        String   @db.Uuid
  created_at                     DateTime @default(now()) @db.Timestamptz()
  updated_at                     DateTime @default(now()) @updatedAt @db.Timestamptz()

  client Client @relation(fields: [client_id], references: [id], onDelete: Cascade)
  // ↑ Amendment A2: `user User @relation("UserEnhanceCustomer", fields: [user_id], references: [id], onDelete: Cascade)`

  @@map("enhance_customers")
}
```

Migración Prisma: `sprint15c_enhance_customers`. **NO** se añade FK reverse en `Service` — el linkage Service ↔ enhance_customers es por `Service.user_id → User.id → EnhanceCustomer.user_id` (Amendment A2 alinea el naming con la convención del schema). Schema canónico vigente: [`docs/30-data/enhance-customers.md`](../30-data/enhance-customers.md).

**Decisión 8 — Lazy create + idempotencia 3-step**:

> ⚠ **Pseudocódigo actualizado por [Amendment A2](#amendments)**: `client_id` → `user_id`, `Client` → `User`, `hashFnv32` → `userAdvisoryLockKey` (con namespace dedicado `ADVISORY_LOCK_NAMESPACE_ENHANCE_CUSTOMERS`). Ver Amendment A2 §A2.4 para el shape vigente. El bloque de abajo refleja la propuesta original.

El customer se crea en Enhance al primer hosting Aelium provisionado del cliente (NO en el alta del Client — la mayoría de Clients pueden no tener hosting Enhance nunca). Idempotencia robusta vía advisory lock por `client_id` (Amendment A2: `user_id`):

```typescript
async function ensureEnhanceCustomer(client: Client, tx: PrismaTx): Promise<EnhanceCustomer> {
  // Step 0: advisory lock para evitar race condition cross-process
  // (dos provisioning jobs concurrentes para el mismo cliente).
  const lockKey = hashFnv32(client.id);
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

  // Step 1: SELECT FROM enhance_customers WHERE client_id = ?
  const existing = await tx.enhanceCustomer.findUnique({ where: { client_id: client.id } });
  if (existing) return existing;

  // Step 2: defensivo cross-restart — search Enhance por email (puede haberse
  // creado desde fuera, ej. ops manual, restore parcial). Si existe, INSERT
  // mapping y return.
  const found = await enhanceClient.searchCustomersByEmail(client.email);
  if (found.length > 0) {
    return tx.enhanceCustomer.create({
      data: {
        client_id: client.id,
        enhance_org_id: found[0].id,
        enhance_owner_login_id: found[0].ownerLoginId,
        enhance_owner_member_id: found[0].ownerId,
      },
    });
  }

  // Step 3: ejecutar provision flow 6-step (decisión 10) y persistir mapping.
  const result = await runProvisionFlow6Step(client);
  return tx.enhanceCustomer.create({
    data: {
      client_id: client.id,
      enhance_org_id: result.customerOrgId,
      enhance_owner_login_id: result.loginId,
      enhance_owner_member_id: result.memberId,
    },
  });
}
```

**Decisión 9 — Mapping Service Aelium ↔ Subscription/Website Enhance**:

- `services.provider_reference = enhance_subscription_id` (string, serializado de integer Enhance).
- `services.metadata = { enhance_website_id, enhance_org_id, enhance_subscription_id, enhance_plan_id, primary_domain }` — todo string/number/boolean por R12 + ADR-077 §2.2 (metadata plana, sin secretos).

---

### 3. Provision flow 6-step (decisiones 10-12)

**Decisión 10 — Flujo canónico**:

```
1. POST /orgs/{master_org_id}/customers
   body: { name: <client.company_name || `${client.first_name} ${client.last_name}`> }
   → { id: customer_org_id }

2. POST /logins?orgId={customer_org_id}
   body: { email: client.email, password: <crypto.randomUUID()>, name: <same as step 1> }
   → { id: login_id }

3. POST /orgs/{customer_org_id}/members
   body: { loginId: login_id, roles: ["Owner"] }
   → { id: member_id }

4. PUT /orgs/{customer_org_id}/owner
   body: { memberId: member_id }
   → 200 OK (sin body relevante)

5. POST /orgs/{master_org_id}/customers/{customer_org_id}/subscriptions
   body: { planId: <product.provisioner_config.enhance_plan_id> }
   → { id: subscription_id (integer) }

6. POST /orgs/{customer_org_id}/websites
   body: { domain: service.domain, subscriptionId: subscription_id }
   → { id: website_id }
```

Schemas literales del spec:
- Step 1: `NewCustomer` (línea 15455 spec).
- Step 2: `LoginInfo` (línea 16072).
- Step 3: `NewMember` (línea 16238) + `Role` enum (línea 16149).
- Step 4: `OrgOwnerUpdate` (línea 18444).
- Step 5: `NewSubscription` (línea 15923).
- Step 6: `NewWebsite` (línea 16392).

**Decisión 11 — Atomicidad por paso**: cada paso es idempotente individualmente. Si paso 4 falla tras pasos 1-3 OK → el job BullMQ reintenta tras 30s con la retry policy ADR-063 `[30s, 90s, 270s]`. En el reintento, paso 1 (`POST customers`) si ya existió devuelve 409 conflict → el plugin lo trata como éxito (idempotencia sintética: GET por email recupera el ID). Steps 2-3-4 idem. Tras 3 fallos del job → DLQ + emit `service.provisioning_failed` + alerta admin.

**Decisión 12 — Reverso compensatorio mid-flight**: NO hay rollback automático. Razón canónica: si el plugin falla en step 5 con steps 1-4 OK, un rollback automático borraría customer + login + member que el admin podría haber tocado manualmente entre el paso 4 y el reintento. Doctrina: **se delega al cron `reconcile-enhance-services`**. Servicios en estado `pending` >24h se marcan `failed` + alerta admin → admin decide manualmente si limpiar el customer huérfano en Enhance o reintentar el provision.

---

### 4. SSO 2-call OTP flow (decisiones 13-15)

**Decisión 13 — Flujo cliente "Abrir mi panel"** (`getSsoUrl()` invocación):

```
1. GET /orgs/{customer_org_id}
   → returns Org { ..., ownerId, ownerLoginId, ... } (spec schema línea 15504)

2. GET /orgs/{customer_org_id}/members/{ownerId}/sso
   → returns string (OTP URL: "https://<panel>/login/sessions/sso?otp=<uuid>")

3. Aelium emite audit event service.sso_opened + redirect 302 → OTP URL.

4. Browser sigue redirect → Enhance verifica OTP → crea session cookie scopada
   al customer org → cliente entra al panel.
```

**Optimización**: `enhance_customers.enhance_owner_member_id` se persiste (decisión 7) → step 1 se elimina cuando hay mapping cacheado. Resultado real cliente recurrente: 1 call (step 2) + redirect.

**Decisión 14 — Flujo admin Aelium "Abrir panel cliente" (impersonation)**:

Mismo patrón de 2 calls, pero ANTES emite evento canónico nuevo `service.admin_sso_impersonation` (decisión 22) con flag `gdpr_visible_to_data_subject=true` → audit log inmutable + portal RGPD `/dashboard/transparency` lo expone al cliente:

> *"Aelium agente <X> abrió el panel de tu servicio <Y> el <fecha> desde IP <Z>."*

Esto cierra una potencial brecha de GDPR transparency: el cliente sabe cuándo un agente Aelium ha hecho impersonation real en el panel del proveedor. La doctrina general ADR-070 + ADR-017 (audit log inmutable) la materializa aquí con un evento específico.

**Decisión 15 — TTL del OTP**: el OTP es **single-use + corto TTL** gestionado por Enhance (no por Aelium — el spec no expone el TTL exacto). Aelium NUNCA cachea la URL OTP — se regenera en cada apertura. Persistir el OTP sería seguridad débil (si filtración del audit log → URL OTP reusable hasta TTL).

---

### 5. DNS authority + records doctrine (decisiones 16-21)

**Decisión 16 — Capability flag canónico nuevo `has_dns_management`**: ADR-082 §3 + ADR-077 Amendment A1. `enhance_cp` declara `true`. Se materializa en código (Sprint 15C Fase C):

```typescript
// backend/src/plugins/provisioners/enhance_cp/enhance.plugin.ts
readonly capabilities: PluginCapabilities = {
  has_sso_panel: true,
  panel_label: 'plugin.enhance_cp.panel_label',
  has_metrics: true,
  has_metrics_history: false,
  requires_server: false,
  provision_mode: 'sync',
  completes_via_task: false,
  supports_reconciliation: true,
  has_dns_management: true,  // ADR-082 §3 + ADR-077 Amendment A1
};
```

**Decisión 17 — Record kinds expuestos v1**: `[A, AAAA, CNAME, MX, TXT, SRV, CAA]` (7 de los 11 disponibles en Enhance — spec línea 18256 `DnsRecordKind` enum).

Diferidos a v1.x con razón:
- `SPF` — deprecated por RFC 7208 (use TXT con `v=spf1`). Confunde al cliente; NUNCA.
- `NS` (zone-level CRUD) — editar NS-as-record en zona = romper delegación. NUNCA cliente. Admin v1.1 diagnostic-only.
- `PTR` — reverse DNS, requiere PTR delegation que cliente típico no tiene. DC.NEW-15C-2 v1.1.
- `DS` — DNSSEC, requiere flag `enableDnsSec` separado. DC.NEW-15C-DNSSEC v1.1.

**Decisión 18 — Helper canónico `core/provisioning/dns-authority-resolver.ts`**: ADR-082 §6. El plugin Enhance NO implementa el resolver — vive en core. El plugin solo soporta las 4 inline actions DNS canónicas (decisión 19) que el resolver invoca via `executeAction`.

**Decisión 19 — Endpoint nuevo orquestador**: ADR-082 §6. El plugin Enhance lo sirve a través de inline actions:

```typescript
readonly inlineActions: readonly ServiceAction[] = [
  // ... actions §9 ...
  { slug: 'list_dns_records', label: 'plugin.enhance_cp.actions.list_dns_records', confirmRequired: false, destructive: false },
  { slug: 'add_dns_record', label: 'plugin.enhance_cp.actions.add_dns_record', confirmRequired: false, destructive: false, payloadSchema: NEW_DNS_RECORD_SCHEMA },
  { slug: 'update_dns_record', label: 'plugin.enhance_cp.actions.update_dns_record', confirmRequired: false, destructive: false, payloadSchema: UPDATE_DNS_RECORD_SCHEMA },
  { slug: 'delete_dns_record', label: 'plugin.enhance_cp.actions.delete_dns_record', confirmRequired: true, destructive: true },
];
```

Implementación de `executeAction` para cada slug:
- `list_dns_records` → `GET /orgs/{org}/websites/{ws}/domains/{dom}/dns-zone` (spec línea 7487 path / `DnsZone` schema línea 18088) → mapea `DnsZone.records[]` a shape canónico Aelium.
- `add_dns_record` → `POST .../dns-zone/records` body `NewDnsRecord` (spec línea 18185).
- `update_dns_record` → `PATCH .../dns-zone/records/{recordId}` body `UpdateDnsRecord`.
- `delete_dns_record` → `DELETE .../dns-zone/records/{recordId}`.

**Decisión 20 — Default DNS records cluster Enhance (bootstrap del plugin)**: ADR-082 §4. El plugin Enhance, al pasar a `enabled=true` en `plugin_installs`, ejecuta hook `onActivated()` que llama:

```typescript
POST /v2/settings/dns/default-records
[
  { kind: 'A',  name: '@',   value: '<server_ip>' },
  { kind: 'A',  name: 'www', value: '<server_ip>' },
  { kind: 'NS', name: '@',   value: 'ns1.aelium.net' },
  { kind: 'NS', name: '@',   value: 'ns2.aelium.net' },
  { kind: 'MX', name: '@',   value: 'mail.<server_ip_reverse>' },  // opcional, si email role activo en config
]
```

Idempotente: si los records ya existen, Enhance los mantiene (404/409 absorbed). El plugin re-ejecuta este hook cuando el setting `provisioning.default_nameservers` cambia (listener `provisioning.default_nameservers_changed` propaga a este hook).

**Decisión 21 — Listener `auto-config-dns-on-hosting-provisioned` redefinido**: ADR-082 §5. El plugin Enhance contribuye el listener (vive en `plugins/provisioners/enhance_cp/listeners/`):

```typescript
@OnEvent('service.activated')
async reconcileDnsDefaults(payload: { serviceId: string; pluginSlug: string }) {
  if (payload.pluginSlug !== 'enhance_cp') return;
  const service = await loadServiceWithMetadata(payload.serviceId);
  const zone = await enhanceClient.getZone(service.metadata.enhance_org_id, service.metadata.enhance_website_id, service.domain);
  const expected = await loadExpectedDefaults();  // desde setting + plugin config
  const missing = computeMissingRecords(zone.records, expected);
  if (missing.length > 0) {
    for (const record of missing) {
      await enhanceClient.addDnsRecord(zone.id, record);
    }
    audit.logChange({ event: 'dns.defaults_reconciled', service_id: payload.serviceId, added: missing });
  }
}
```

Reconcile defensivo: solo añade records faltantes; NO borra inesperados (cliente o operator pueden haber añadido CNAME/MX/TXT custom).

---

### 6. Reconciliation 3 capas (decisiones 22-24)

**Decisión 22 — L1 Cache `service_info` Redis TTL 60s**: heredado [ADR-080](./adr-080-plugin-framework.md) wrapper `getServiceInfoWithCache`. Cubre status + métricas + display. Invalidación tras cualquier `executeAction` Aelium del mismo service (también heredado).

**Decisión 23 — L2 Reads on-demand sin cache**: para DNS records (cada apertura de pestaña DNS), list emails count, list databases count. Cada vez que la UI renderiza esa sección, golpe directo a Enhance. Siempre fresh (DH-INV-6: Enhance es fuente de verdad operacional). Caching local sería antipatrón.

**Decisión 24 — L3 Reconcile cron**: `reconcile-enhance-services` BullMQ cada 6h (configurable via `manifest.configSchema.reconciliationIntervalHours`). Para cada service con `provisioner_slug='enhance_cp'` y `status IN ('active','suspended')`:

1. `GET /orgs/{org}/subscriptions/{sub_id}` → si 404 → emit `service.reconciled_external_change` (decisión 28) con `change_type='subscription_missing'`. Aelium marca `Service.status='unknown'` (NO `'cancelled'` automático — DH-INV-6 + dossier 15C §6.10).
2. Comparar `Subscription.status` Aelium vs Enhance (`active`, `suspended`, etc.) → si divergente → emit `service.reconciled_external_change` con `change_type='status_divergence'` + Aelium adopta el estado Enhance.
3. Comparar `Subscription.planId` vs `Product.provisioner_config.enhance_plan_id` → si divergente → emit con `change_type='plan_divergence'` (NO auto-corregir Aelium — billing implication; admin decide).

**Setting nuevo** `provisioning.enhance_cp.reconciliation_alert_threshold` (default 5 / día): si supera, alerta superadmin vía notification.

---

### 7. Mock testing strategy (decisiones 25-28)

**Decisión 25 — `MockEnhanceServer`**: Express stub local en `tests/mocks/enhance-server/` que responde con fixtures JSON capturados durante 15C.B contra Enhance live.

**Decisión 26 — Fixtures captura plan**: durante 15C.B Yasmin ejecuta ~10 curls contra su Enhance live (sub-customer `qa-aelium` creado ad-hoc) → JSON responses dump en `tests/fixtures/enhance/` (gitignored si contienen datos sensibles; se versiona solo shape).

**Decisión 27 — CI E2E**: usa MockServer al 100%. NUNCA golpea Enhance live desde CI. El mock cubre los 6 endpoints del provision flow + `/orgs/{org}` + `/orgs/{org}/members/{m}/sso` + `/v2/settings/dns/default-records` + DNS zone CRUD.

**Decisión 28 — Smoke E2E manual** (15C.I): Yasmin ejecuta suite ad-hoc contra Enhance live para validar shapes reales (1-2 horas). Documenta drift contra fixtures si lo hay. Resultado: lista de "fixtures válidos al 2026-XX-XX" en cierre del Sprint 15C.

---

### 8. Plan upgrade admin-only v1 (decisiones 29-30)

**Decisión 29 — Cliente UI**: botón "Cambiar plan" en `/dashboard/services/[id]` → muestra "Contacta soporte" inline + CTA crear ticket. Bloqueado hasta cierre sub-sprint billing prorrateo cross-plan (DC.NEW-15C-1). Razón: cambio de plan implica diferencia de precio + posible reembolso o cargo prorrateado — billing engine de Aelium aún no soporta prorrateo cross-plan automáticamente (sub-sprint pendiente).

**Decisión 30 — Admin UI**: acción curada `change_package` en `/admin/services/[id]` → modal confirm con texto explícito sobre billing manual + dropdown de planes Enhance disponibles (cargados via `GET /orgs/{master}/plans` en `getServiceInfo` admin variant). Admin asume responsabilidad de generar invoice ajuste o nota de crédito manualmente. Audit pesado.

---

### 9. Capability flags refinement + inlineActions canónicos (decisiones 31-32)

**Decisión 31 — Capabilities estáticas frozen**: ver decisión 16 (con `has_dns_management: true`).

**Decisión 32 — `inlineActions` literal**:

```typescript
readonly inlineActions: readonly ServiceAction[] = [
  // Acciones cliente
  { slug: 'reset_account_password', label: 'plugin.enhance_cp.actions.reset_password', confirmRequired: true, destructive: false },
  { slug: 'view_disk_usage', label: 'plugin.enhance_cp.actions.view_disk', confirmRequired: false, destructive: false },
  { slug: 'view_bandwidth_usage', label: 'plugin.enhance_cp.actions.view_bandwidth', confirmRequired: false, destructive: false },

  // DNS records (decisión 19, ADR-082 §6, ADR-077 Amendment A1)
  { slug: 'list_dns_records', label: 'plugin.enhance_cp.actions.list_dns_records', confirmRequired: false, destructive: false },
  { slug: 'add_dns_record', label: 'plugin.enhance_cp.actions.add_dns_record', confirmRequired: false, destructive: false, payloadSchema: NEW_DNS_RECORD_SCHEMA },
  { slug: 'update_dns_record', label: 'plugin.enhance_cp.actions.update_dns_record', confirmRequired: false, destructive: false, payloadSchema: UPDATE_DNS_RECORD_SCHEMA },
  { slug: 'delete_dns_record', label: 'plugin.enhance_cp.actions.delete_dns_record', confirmRequired: true, destructive: true },

  // Acciones admin (autorización CASL Subject.Service + scope admin se verifica en wrapper, no en plugin)
  { slug: 'change_package', label: 'plugin.enhance_cp.actions.change_package', confirmRequired: true, destructive: false, payloadSchema: { type: 'object', properties: { planId: { type: 'integer' } }, required: ['planId'], additionalProperties: false } },
  { slug: 'force_resync', label: 'plugin.enhance_cp.actions.force_resync', confirmRequired: false, destructive: false },
];
```

Total: 9 inline actions. 3 cliente operativas + 4 DNS canónicas (decisión 19) + 2 admin.

---

### 10. Operational doctrine — DH-INV-6 specifics (decisiones 33-35)

**Decisión 33 — Aelium NO es fuente de verdad operacional para Enhance**: ADR-082 DH-INV-6. Aelium es:

- Fuente de verdad **billing** (qué se cobró cuándo, qué products tiene el cliente, invoices/credit notes).
- Fuente de verdad **identidad** cross-portal (Client + roles + audit trail Aelium-side).
- **Gateway curado** sobre Enhance para acciones de alta frecuencia + UX unificada (ADR-070).

**Decisión 34 — En conflicto operacional, Enhance gana**: reconcile cron actualiza Aelium, no al revés. Excepción: provision/deprovision donde Aelium dispara la acción + persiste resultado tras éxito en Enhance.

**Decisión 35 — Aplicación práctica**: ver tabla en ADR-082 §1 "Aplicación práctica de DH-INV-6" — esta decisión confirma que el plugin Enhance la materializa literalmente. Cualquier desviación operativa requiere ADR-NNN específico.

---

### Eventos canónicos NUEVOS introducidos por este ADR

Dos eventos nuevos en el dominio `service.*` (a registrar en `docs/20-modules/_events.md` en cierre Fase 15C.I):

| Evento | Payload | Productor | Consumidor |
|---|---|---|---|
| `service.admin_sso_impersonation` | `{ service_id, user_id, agent_user_id, agent_ip, agent_user_agent, panel_label, opened_at, gdpr_visible_to_data_subject: true }` ([Amendment A2](#amendments) cambió `client_id` → `user_id` por coherencia con resto de eventos `service.*`) | `getSsoUrlWithAudit` cuando `request.actor.role === 'admin'` y service del cliente | `audit-on-service-events` (futuro) → `audit_change_log`; portal RGPD `/dashboard/transparency` lo lista |
| `service.reconciled_external_change` | `{ service_id, plugin_slug, change_type: 'subscription_missing'\|'status_divergence'\|'plan_divergence', expected, actual, detected_at }` | Cron `reconcile-enhance-services` | `audit-on-service-reconciled-external-change` (Sprint 15C Fase H, listener nuevo, flag GDPR opcional según `change_type`); `notifications-on-reconciliation-threshold-exceeded` cuenta divergencias / día contra setting threshold |

Ambos eventos **NO requieren Outbox** v1 — son alertas operativas, no transacciones. Reservar Outbox para eventos billing (heredado ADR-033 doctrina).

---

### Settings canónicos NUEVOS introducidos por este ADR

| Setting | Categoría | Default | Editable | Descripción |
|---|---|---|---|---|
| `provisioning.default_nameservers` | provisioning | `["ns1.aelium.net","ns2.aelium.net"]` | superadmin | NS-sync C3 (ADR-082 §4). Listener `provisioning.default_nameservers_changed` propaga a Enhance C2. |
| `provisioning.enhance_cp.reconciliation_alert_threshold` | provisioning | `5` | superadmin | Decisión 24. Si nº divergencias / día > threshold → alerta superadmin. |

---

## Consecuencias

- ✅ **Ganamos:**
  - **35 decisiones congeladas con razón** → próximos plugins citan `ADR-083 §X.Y` para validar si la decisión aplica también allí (RC tendrá su análogo ADR-081; Docker tendrá ADR-084; etc.).
  - **Tabla `enhance_customers` con PK natural `client_id`** ([Amendment A2](#amendments): naming SQL real es `user_id`, doctrina conceptual intacta) → coherente con `plugin_installs.slug` PK natural (ADR-080 §2). Joins más rápidos que UUID extra.
  - **Provision flow 6-step idempotente con advisory lock** → robustez ante reintentos BullMQ + race conditions cross-process.
  - **SSO 2-call OTP cacheable** vía persistir `enhance_owner_member_id` → 1 call por SSO recurrente (vs 3 sin caching).
  - **DH-INV-6 doctrine materializada** → reconcile cron nunca pisa cambios operator/cliente legítimos en panel Enhance; alerta superadmin para divergencias críticas con threshold.
  - **MockEnhanceServer para CI** + smoke manual → CI determinista + validación shape contra live al cierre.
  - **2 eventos nuevos** + **2 settings nuevos** documentados aquí en lugar de descubrirse en `_events.md`/`settings-reference.md` post-cierre.
- ⚠️ **Aceptamos:**
  - **Sprint 15C Fase A se retrasa ~0.3 sesión adicional** redactando este ADR (presupuestado en dossier §7).
  - **Eventos `service.admin_sso_impersonation` + `service.reconciled_external_change` quedan sin listener consumidor en Fase 15C** — el listener de audit + portal RGPD vive en Sprint 12.5 Portal Transparencia. Aceptado: el evento se emite desde Sprint 15C; el listener llega después. Mismo patrón que `service.metrics_fetched`/`service.action_executed`/`service.sso_opened` (Sprint 11) cuyo listener aún no existe.
  - **MockEnhanceServer requiere mantenimiento** cuando Enhance v12.21.3 evolucione. Cada upgrade de Enhance que Yasmin haga en su servidor implica: smoke E2E manual + actualización de fixtures + posible bump de `version` campo del manifest. Aceptado: trade-off vs golpear live en CI.
  - **`enhance_customers` puede acumular registros huérfanos** si cron no se ejecuta correctamente (ej. backend caído >24h). Aceptado: el cron `reconcile-enhance-services` los detecta y genera alerta.
- 🚪 **Cierra:**
  - **NO se usa `sessionCookie` auth** — solo `bearerAuth`.
  - **NO se usa Owner token** — solo Super Admin (revocable).
  - **NO se cachea OTP URL** — single-use + corto TTL gestionado por Enhance.
  - **NO hay rollback automático mid-flight** — DLQ + alerta admin manual.
  - **NO hay auto-mirror de zone state** — L2 reads on-demand sin cache para DNS records.
  - **NO hay UI cliente para `change_package`** — bloqueado hasta cierre billing prorrateo cross-plan (DC.NEW-15C-1).

---

## Cuándo revisar

- **Si Enhance v13+ rompe el spec actual** (ej. cambio breaking en `/orgs/{org}/members/{m}/sso` shape, eliminación de `/v2/settings/dns/default-records`). Mitigación: smoke E2E manual detecta drift → amendment a este ADR documentando shape nuevo + bump `manifest.version`.
- **Si el provision flow 6-step necesita un séptimo paso** (ej. attach a managed cluster Enhance, asignar IPv6 dedicada). Amendment a §3 con paso adicional + tests actualizados.
- **Si el TTL del OTP cambia** (Enhance lo decide, no Aelium). Si TTL < 30s rompe UX (cliente cliquea botón → panel "OTP expirado"). Mitigación: caching de OTP por <TTL Enhance documentado en spec — requiere amendment.
- **Si el `MockEnhanceServer` fixture se queda obsoleto** sistemáticamente (ej. shapes cambian cada 3 meses). Considerar generar fixtures automáticamente desde live (con flag `--update-fixtures` en suite).
- **Si DH-INV-6 genera fricción operativa real** (ej. operator se queja "Aelium no aplicó mi cambio en plan"). Hoy DH-INV-6 dice "Enhance gana" + reconcile detecta. Si la fricción es real, ADR específico con sincronía bidireccional limitada (solo plan changes manuales triggerean update Aelium).
- **Si `enhance_customers.enhance_owner_member_id` cambia en Enhance** (ej. admin promueve a otro Owner). Reconcile cron debe detectar ownership change → actualizar mapping. Si esto se vuelve frecuente, amendment con check explícito en cron.
- **Si Aelium decide ofrecer reseller hosting** (clientes que son resellers con sub-customers). Hoy Aelium = Master org directo. Reseller hierarchy requiere ADR específico — DC.NEW-15C-RESELLER en backlog.

---

## Referencias

- **Módulos afectados:**
  - `plugins/provisioners/enhance_cp/` (NUEVO Sprint 15C Fase C):
    - `enhance.plugin.ts` — implementa los 6 métodos del contrato + manifest decisión 4.
    - `enhance-api-client.ts` — cliente HTTP (Fase B), reusable por listeners + cron.
    - `listeners/reconcile-dns-defaults-on-service-activated.listener.ts` — decisión 21 (ADR-082 §5).
    - `listeners/sync-default-nameservers-to-enhance.listener.ts` — decisión 20 (ADR-082 §4).
    - `crons/reconcile-enhance-services.cron.ts` — decisión 24.
  - `core/provisioning/dns-authority-resolver.ts` (NUEVO ADR-082 §6) — el plugin lo invoca via `executeAction`, NO lo importa.
  - `modules/provisioning/services/dns-records.controller.ts` (NUEVO ADR-082 §6) — endpoints orquestador.
  - `prisma/schema.prisma` — nueva tabla `enhance_customers` + migración `sprint15c_enhance_customers`.
  - `tests/mocks/enhance-server/` (NUEVO Sprint 15C Fase B) — Express stub.
  - `tests/fixtures/enhance/` (NUEVO Sprint 15C Fase B) — JSON capturados.
- **Reglas relacionadas:**
  - [R3](../00-foundations/rules.md) — audit log inmutable: `service.admin_sso_impersonation` + `service.reconciled_external_change` se persisten en `audit_change_log`.
  - [R4](../00-foundations/rules.md) — el plugin NO importa `core/provisioning/dns-authority-resolver`; el orquestador lo invoca.
  - [R7](../00-foundations/rules.md) — errores semánticos: `ProvisionerPluginError` con códigos canónicos (PROVIDER_AUTH_FAILED, INVALID_PAYLOAD, etc.).
  - [R10](../00-foundations/rules.md) — rate limiting: el plugin Enhance no implementa rate limiting propio — confía en circuit breaker ADR-080.
  - [R11](../00-foundations/rules.md) — circuit breaker ADR-080 en `getServiceInfoWithCache` + `executeActionWithCacheInvalidation`.
  - [R12](../00-foundations/rules.md) — `apiToken` en `plugin_installs.secrets` cifrado, no en metadata cliente.
  - [R13](../00-foundations/rules.md) — fallos no desaparecen: BullMQ retries + DLQ + `service.provisioning_failed`.
- **ADRs relacionados:**
  - [ADR-009](./adr-009-estrategia-plugins.md) — patrón plugin general.
  - [ADR-021](./adr-021-provisioners.md) — interfaz mínima v1.
  - [ADR-070](./adr-070-service-info-sso-acciones-curadas.md) — doctrina dashboard como puerta unificada.
  - **[ADR-077](./adr-077-contrato-provisioner-plugin-v2.md) Amendment A1** — `has_dns_management` capability (decisión 16).
  - [ADR-080](./adr-080-plugin-framework.md) — Plugin Framework (manifest decisión 4, vault decisión 3, circuit breaker decisión 22).
  - **[ADR-082](./adr-082-modelo-domain-hosting-dns-doctrine.md)** — modelo Domain↔Hosting + DNS doctrine transversal. Decisiones 16, 18, 19, 20, 21, 33, 34, 35 lo materializan.
  - [ADR-017](./adr-017-audit-log-inmutable.md) — audit log de eventos `service.*` nuevos.
  - [ADR-055](./adr-055-resiliencia-circuit-breaker.md) — circuit breaker (heredado vía ADR-080).
  - [ADR-063](./adr-063-bullmq-canonico-dlq-retries.md) — cola `provisioning-dispatch` + cron `reconcile-enhance-services`.
  - [ADR-066](./adr-066-tres-portales-raiz-portalbadge.md) — endpoints cliente vs admin.
  - [ADR-067](./adr-067-granularidad-casl-rol-staff.md) — `change_package` admin-only via CASL `Subject.Service` + scope admin.
- **Glosario:** *Enhance Customer* (a añadir), *Master Org Aelium* (a añadir), *Customer Org Enhance* (a añadir), *OTP SSO URL* (a añadir), *Default DNS records platform-level* (cubierto en ADR-082), *Reconcile drift detection* (a añadir).
- **Sprint:** 15C Fase A (este ADR) → 15C.B-I (implementación literal de §1-§10).
- **Spec literal Enhance**: [`docs/_research/sprint-15c/orchd-oas3-api.yaml`](../_research/sprint-15c/orchd-oas3-api.yaml) (orchd v12.21.3, OpenAPI 3.0.3, 588 KB / 20.848 líneas / ~280 paths). Cada decisión cita líneas exactas del YAML.
- **Dossier de origen:** [`docs/60-roadmap/completed/sprint-15c-plugin-enhance-cp.md`](../60-roadmap/completed/sprint-15c-plugin-enhance-cp.md) §6 (35 decisiones técnicas frozen). Este ADR es la materialización canónica de §6 con razones expandidas.

---

## Amendments

> Reservado para cambios compatibles hacia atrás post-cierre del ADR. Cada amendment con fecha + sprint específico que lo justifica.

### Amendment A1 (2026-05-08) — ubicación canónica del MockEnhanceServer

> **Justificado por:** Sprint 15C Fase 15C.B (PR #37). Implementación detectó incompatibilidad entre el path declarado en §7 decisión 25 (`tests/mocks/enhance-server/`) y la configuración de jest del backend.
> **Sprint:** 15C Fase 15C.B (review pre-merge).
> **Compatibilidad:** Hacia atrás. NO toca el comportamiento del mock — solo formaliza su ubicación física en el filesystem. La API pública (`startMockEnhanceServer`, `MockEnhanceServerInstance`, `MockEnhanceState`) es idéntica a la declarada en §7.

#### A1.1. Cambio canónico

La decisión 25 original declara:

> *"`MockEnhanceServer`: Express stub local que responde con fixtures JSON capturados durante 15C.B contra Enhance live. **Ubicación: `tests/mocks/enhance-server/`.**"*

Se actualiza a:

> *"`MockEnhanceServer`: Express stub local que responde con shapes canónicos del spec orchd v12.21.3. **Ubicación canónica: `backend/test/mocks/enhance-server/`.** Cada plugin de provisioning con SaaS externo que necesite un mock debe ubicarlo bajo `backend/test/mocks/<plugin-slug>-server/` siguiendo el mismo patrón."*

#### A1.2. Razón técnica

El runtime jest del backend tiene `rootDir: src` y resuelve módulos relativos sin `tsconfig paths` cross-package. Un mock en `tests/mocks/enhance-server/` (raíz del repo) requeriría:

1. Configurar `tsconfig paths` en `backend/tsconfig.json` con un alias `@aelium-mocks/enhance-server` apuntando a `../tests/mocks/enhance-server/`.
2. Configurar `jest.moduleNameMapper` para resolver el mismo alias.
3. Configurar `eslint-plugin-import` para reconocer el alias y no marcar el import como `unresolved`.

Este overhead de configuración (~30 minutos por plugin × N plugins) se evita con la ubicación bajo `backend/test/mocks/`. Trade-off: el path canónico declarativo (raíz del repo, "mocks viven en `tests/mocks`") es ligeramente menos descubrible para alguien navegando el repo desde fuera de `backend/`. Aceptado: jest del backend es el único consumidor real de los mocks de plugins SaaS (los mocks de servicios infraestructurales — Postgres, Redis, MinIO, Mailpit — viven en `docker-compose.dev.yml`, no en `tests/mocks/`).

#### A1.3. Patrón canónico para futuros plugins

| Plugin (Sprint) | Ubicación del mock |
|---|---|
| `enhance_cp` (Sprint 15C) | `backend/test/mocks/enhance-server/` (este Amendment) |
| `resellerclub` (Sprint 15D) | `backend/test/mocks/resellerclub-server/` (futuro ADR-081) |
| `docker_engine` (Sprint 15E) | `backend/test/mocks/docker-engine-server/` (futuro ADR-084 o N/A si Docker SDK ya tiene mocks oficiales) |
| `plesk_obsidian` (Sprint 15G) | `backend/test/mocks/plesk-server/` (futuro) |
| `stripe` (Sprint 15B) | usar `stripe-mock` oficial via docker-compose.test.yml — NO mock custom |

**Doctrina canónica**: *"Cada mock de SaaS externo vive bajo `backend/test/mocks/<plugin-slug>-server/` con API pública uniforme: `start{Plugin}MockServer({port?, seed?}) → Promise<{ baseUrl, port, state, reset, stop }>`."*

#### A1.4. Validación

- Implementación PR #37 cumple el patrón ya canonizado por este Amendment.
- 22 tests integration `client.integration.spec.ts` consumen el mock correctamente vía import relativo `../../../../../test/mocks/enhance-server`.
- Suite total backend `329/329` verde.

---

### Amendment A2 (2026-05-08) — naming SQL del campo PK: `user_id` en lugar de `client_id`

> **Justificado por:** Sprint 15C Fase 15C.C (PR #38). Implementación de la migración `sprint15c_enhance_customers` detectó que el modelo Aelium NO tiene una entidad `Client` separada — `User` es la identidad canónica del cliente final, y todo el schema usa `user_id` con FK a `users.id` consistentemente.
> **Sprint:** 15C Fase 15C.C (review pre-merge).
> **Compatibilidad:** Hacia atrás. NO toca el comportamiento del plugin — solo formaliza el naming SQL del campo PK. La doctrina conceptual ("Client Aelium ↔ Customer Org Enhance") permanece intacta. NO bumpea ninguna versión.

#### A2.1. Cambio canónico en §2 decisión 7

La decisión 7 original declara el modelo Prisma con campo PK `client_id` y relación `client Client @relation(...)`:

```prisma
model EnhanceCustomer {
  client_id String @id @db.Uuid
  // ...
  client Client @relation(fields: [client_id], references: [id], onDelete: Cascade)
}
```

Se actualiza a:

```prisma
model EnhanceCustomer {
  user_id String @id @db.Uuid
  // ...
  user User @relation("UserEnhanceCustomer", fields: [user_id], references: [id], onDelete: Cascade)
}
```

#### A2.2. Razón doctrinal — schema Aelium no tiene modelo `Client`

La decisión 7 original asumió implícitamente la existencia de un modelo `Client` separado siguiendo la nomenclatura conceptual del proyecto ("Client Aelium ↔ Customer Org Enhance"). Verificación contra el schema real al implementar la migración:

1. **No existe modelo `Client` en `schema.prisma`.** Lo que se llama "Client Aelium" en la doctrina es el modelo `User` con rol cliente. Existe `ClientProfile` ([schema.prisma:171](../../backend/prisma/schema.prisma#L171)) como tabla de perfil 1-a-1 con `User.id`, pero NO un modelo `Client` con PK propia. La identidad del cliente es `users.id`.
2. **Convención del schema: `user_id` para FK a `users.id`** (verificado en 15+ tablas: `Session`, `EmailVerification`, `PasswordReset`, `ClientProfile.user_id`, `BillingProfile.user_id`, `Service.user_id`, `Setting.user_id`, `AuditAccessLog.user_id`, etc.). NO existe ninguna tabla en el schema que use `client_id` como FK column name.
3. **El propio ADR-083 §2 decisión 7 reconoce el linkage**: "el linkage Service ↔ enhance_customers es por `Service.user_id → Client.id → EnhanceCustomer.client_id` (ya existe vía `services.user_id`)". El path real del join en SQL es `services.user_id = enhance_customers.user_id` (sin pasar por una entidad intermedia).
4. **Consecuencia operativa de respetar el ADR original**: habría requerido un alias artificial `client_id → users.id` o un modelo `Client` adelantado a Sprint X que aún no existe. Ambos rompen la convención del schema sin ganancia funcional.

#### A2.3. Doctrina conceptual intacta

El concepto canónico **"Client Aelium ↔ Customer Org Enhance"** se mantiene inalterado:

- 1 fila en `enhance_customers` por cada cliente Aelium (un `User` con rol `client`) que tiene al menos un hosting Enhance contratado.
- El docstring del modelo Prisma documenta explícitamente la divergencia naming vs doctrina conceptual ([schema.prisma:290-293](../../backend/prisma/schema.prisma#L290-L293)).
- El glossary §"Enhance Customer" (añadido en este mismo PR) documenta el término conceptual y enlaza al campo SQL real.
- El cliente HTTP `EnhanceApiClient` y `EnhanceCustomersService` siguen hablando de "customer org Enhance" en sus signatures + docstrings.

#### A2.4. Cambio canónico en §2 decisión 8 (lazy create + 3-step idempotency)

El pseudocódigo original usa `client.id` como argumento + `client_id` como columna. Se actualiza a `user.id` + `user_id`:

```typescript
async function ensureEnhanceCustomer(user: UserForEnhance, tx: PrismaTx): Promise<EnhanceCustomer> {
  // Step 0: advisory lock per-user (cross-process race condition guard).
  const lockKey = userAdvisoryLockKey(user.id);
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(
    ${ADVISORY_LOCK_NAMESPACE_ENHANCE_CUSTOMERS}, ${lockKey}
  )`;

  // Step 1: SELECT FROM enhance_customers WHERE user_id = ?
  const existing = await tx.enhanceCustomer.findUnique({ where: { user_id: user.id } });
  if (existing) return existing;

  // Step 2: defensive cross-restart — search Enhance por email.
  const found = await enhanceClient.searchCustomersByEmail(user.email);
  if (found.length > 0 && found[0].ownerId && found[0].ownerLoginId) {
    return tx.enhanceCustomer.create({
      data: {
        user_id: user.id,
        enhance_org_id: found[0].id,
        enhance_owner_login_id: found[0].ownerLoginId,
        enhance_owner_member_id: found[0].ownerId,
      },
    });
  }

  // Step 3: ejecutar provision flow steps 1-4 + persistir mapping.
  const result = await runProvisionFlowCustomerSteps(user);
  return tx.enhanceCustomer.create({ data: { user_id: user.id, ...result } });
}
```

#### A2.5. Cambio canónico en §4 decisión 14 (eventos `service.*`)

El payload del evento `service.admin_sso_impersonation` (decisión 14) declaraba campo `client_id`. Se actualiza a `user_id`:

| Antes | Después |
|---|---|
| `{ service_id, client_id, agent_user_id, ... }` | `{ service_id, user_id, agent_user_id, ... }` |

Coherente con [_events.md `service.cancelled`](../20-modules/_events.md), `service.activated`, etc. que usan `user_id`. El catálogo `_events.md` se sincroniza al emitir el evento por primera vez en Fase 15C.F.

#### A2.6. Validación

- Migración `20260508140000_sprint15c_enhance_customers/migration.sql` aplicada con `user_id` UUID NOT NULL PRIMARY KEY + FK CASCADE a `users(id)` ([migration.sql:26-44](../../backend/prisma/migrations/20260508140000_sprint15c_enhance_customers/migration.sql#L26-L44)).
- Modelo Prisma `EnhanceCustomer` con docstring que cita este Amendment y aclara la divergencia naming SQL ↔ doctrina conceptual ([schema.prisma:276-304](../../backend/prisma/schema.prisma#L276-L304)).
- `EnhanceCustomersService.ensureCustomer(user)` recibe `UserForEnhance` (subset de `User`) — naming coherente.
- 8 tests unit `enhance-customers.service.spec.ts` cubren los 3 steps de idempotency + advisory lock con la API real (`user_id`).
- Suite total backend `395/400` verde + 5 skipped (mode='static-only' del contract test para `enhance_cp`).

---

### Amendment A3 (2026-05-09) — 10ª inline action `list_available_plans` + flag `adminOnly` en `change_package` y `force_resync`

> **Justificado por:** Sprint 15C Fase 15C.E (PR pendiente). La implementación detectó dos gaps críticos en la decisión 32 original (`inlineActions`):
>
>   1. **Vulnerabilidad de privilegio**: la decisión 32 declaró `change_package` y `force_resync` como *"acciones admin (CASL `Subject.Service` + scope admin se verifica en wrapper, no en plugin)"* pero NO existía un mecanismo canónico de scope adminOnly en el contrato `ProvisionerPlugin` v2 — el rol cliente tiene `Action.Update` sobre `Subject.Service` (cf. [`backend/src/core/casl/permissions.ts:299-303`](../../backend/src/core/casl/permissions.ts#L299-L303)), por lo que cualquier cliente podía invocar `POST /services/:id/actions/change_package` y subirse de plan en Enhance sin que admin aprobara. La materialización exige formalizar el flag `adminOnly?: boolean` en `ServiceAction` (cf. [ADR-077 Amendment A3](./adr-077-contrato-provisioner-plugin-v2.md#amendments)).
>   2. **Falta de endpoint para listar planes Enhance disponibles**: la decisión 30 declaró que el modal admin `change_package` debe cargar el dropdown de planes via `GET /orgs/{master}/plans` *"en `getServiceInfo` admin variant"*. Cambiar la firma de `getServiceInfo` (single-method del contrato canónico ADR-077) supondría breaking change. Solución canónica: una **10ª inline action read-only** `list_available_plans`, marcada `adminOnly`, que invoca el endpoint Enhance y devuelve la lista en `data.plans` reutilizando el pipeline `executeActionWithCacheInvalidation` (audit + circuit breaker + cache invalidation).
>
> **Sprint:** 15C Fase 15C.E (PR pendiente).
> **Compatibilidad:** Hacia atrás. NO toca shape del contrato (`adminOnly` se introduce como campo opcional en ADR-077 Amendment A3). NO requiere migración de datos. La 10ª action añade slug nuevo — no rompe los 9 existentes ni sus tests.

#### A3.1. Cambio canónico en §9 decisión 32 (`inlineActions` literal)

Se añade una 10ª action y se marcan dos como adminOnly:

```typescript
readonly inlineActions: readonly ServiceAction[] = [
  // 3 cliente operativas — intactas:
  { slug: 'reset_account_password', /* ... */ },
  { slug: 'view_disk_usage',        /* ... */ },
  { slug: 'view_bandwidth_usage',   /* ... */ },

  // 4 DNS canónicas (ADR-082 §6 + ADR-077 Amendment A1.3) — intactas:
  { slug: 'list_dns_records',   /* ... */ },
  { slug: 'add_dns_record',     /* ... */ },
  { slug: 'update_dns_record',  /* ... */ },
  { slug: 'delete_dns_record',  /* ... */ },

  // 8ª: change_package — NOW con adminOnly: true (Amendment A3).
  {
    slug: 'change_package',
    label: 'plugin.enhance_cp.actions.change_package',
    confirmRequired: true,
    confirmationText: 'plugin.enhance_cp.actions.change_package.confirm',
    destructive: false,
    adminOnly: true,  // ← Amendment A3
    payloadSchema: { type: 'object', properties: { planId: { type: 'integer', minimum: 1 } }, required: ['planId'], additionalProperties: false },
  },

  // 9ª: force_resync — NOW con adminOnly: true (Amendment A3).
  {
    slug: 'force_resync',
    label: 'plugin.enhance_cp.actions.force_resync',
    confirmRequired: false,
    destructive: false,
    adminOnly: true,  // ← Amendment A3
  },

  // 10ª: list_available_plans (NUEVA Amendment A3) — adminOnly read-only,
  // alimenta el dropdown del modal change_package.
  {
    slug: 'list_available_plans',
    label: 'plugin.enhance_cp.actions.list_available_plans',
    confirmRequired: false,
    destructive: false,
    adminOnly: true,
  },
];
```

Total: **10 inline actions**. 3 cliente operativas + 4 DNS canónicas + 3 admin-only (`change_package`, `force_resync`, `list_available_plans`).

#### A3.2. Cambio canónico en §8 decisión 30 (plan upgrade admin-only)

La decisión 30 declaró el dropdown cargado *"via `GET /orgs/{master}/plans` en `getServiceInfo` admin variant"*. Se actualiza:

| Antes | Después |
|---|---|
| Frontend admin invoca `GET /admin/services/:id` → `info.adminContext.availablePlans` (rama no implementada) | Frontend admin invoca **`POST /services/:id/actions/list_available_plans`** (action 10ª, adminOnly — **mismo endpoint cliente, NO hay endpoint admin de actions hoy**: `AdminProvisioningController` solo expone reprovision/deprovision/list/detail/DNS records). El controller cliente `ProvisioningController.executeAction` deriva `isAdmin = ADMIN_ROLES.includes(req.user.role.slug)` y propaga `actorIsAdmin: true` al wrapper, que enforce `adminOnly` + audit + cache invalidation + breaker. `data.plans: EnhancePlan[]` alimenta el dropdown del modal `change_package`. **Nota**: la página `/admin/services/[id]` aún NO existe en frontend (solo `/admin/services/page.tsx` lista admin) — el modal `change_package` admin se materializa cuando se cree esa página detalle (fase frontend posterior, no programada en el roadmap actual del Sprint 15C). |

Razón: respeta el contrato canónico (sin extender `getServiceInfo`), reutiliza el pipeline `executeActionWithCacheInvalidation` ya cableado, y no obliga a tipar admin variants en el shape `ServiceInfo` (que es client-facing por diseño ADR-070).

#### A3.3. Cliente HTTP — método nuevo `EnhanceApiClient.listPlans`

```typescript
// backend/src/plugins/provisioners/enhance_cp/api/client.ts
async listPlans(orgId: CustomerOrgId): Promise<readonly EnhancePlan[]> {
  return this.http.get<EnhancePlan[]>(`/orgs/${orgId}/plans`);
}

// types.ts
export interface EnhancePlan {
  readonly id: number;
  readonly name: string;
  readonly resources: readonly { name: string; total: number; unit: string }[];
  readonly trialDays?: number;
  readonly isVisible: boolean;
}
```

El `MockEnhanceServer` añade handler `GET /orgs/:org/plans` con fixture canónico (3 plans `Web Starter` / `Web Pro` / `Web Premium` para integration tests deterministas).

#### A3.4. Plugin `executeAction` — case `list_available_plans`

```typescript
case 'list_available_plans': {
  const { client: api, config } = await this.getApiClient();
  const plans = await api.listPlans(config.masterOrgId);
  return { success: true, data: { plans } };
}
```

Read-only, sin side effects. El wrapper hace audit (`service.action_executed:list_available_plans`) + invalidate cache + circuit breaker uniformemente.

#### A3.5. Validación

- Suite total backend pre-Fase E: `445/450` verde + 5 skipped.
- Tests nuevos esperados (Fase 15C.E):
  - Contract test verifica 10 actions canónicas + invariante `adminOnly` boolean | undefined.
  - Plugin spec cubre `list_available_plans` (happy path + error 404 desde Enhance).
  - Cliente HTTP spec cubre `listPlans` (happy path + error 401/403/500).
  - Cliente HTTP integration spec contra mock cubre fixture poblado.
  - Wrapper spec cubre enforcement adminOnly: cliente NO admin → ForbiddenException + audit + evento `service.action_admin_only_violation`; admin OK → action ejecuta.
- Smoke test (mismo endpoint `POST /services/:id/actions/:slug`, controller diferencia por rol): cliente con role `client` invoca `POST /services/:id/actions/change_package` → HTTP 403 + audit `service.action_admin_only_violation`. Admin con role `superadmin` invoca `POST /services/:id/actions/list_available_plans` → 200 + `data.plans` poblado desde mock. Admin atraviesa el bypass de ownership del controller cliente (`isAdmin=true` derivado del `req.user.role.slug`) — NO hay endpoint específico admin para actions.

---

### Amendment A4 (2026-05-10) — Hardening UX post smoke real Yasmin (Sprint 15C.II)

> **Justificado por:** smoke real Yasmin 2026-05-10 contra mock Enhance reveló 18 issues categorizados + 8 gaps técnicos no documentados (descubiertos en audit técnico paralelo de 4 agentes). Las 4 decisiones doctrinales A1-A4 del dossier `sprint-15c-ii-hardening-enhance-dossier.md` quedaron congeladas tras consulta literal con Yasmin (AskUserQuestion 2026-05-10) — todas seleccionando la recomendación canónica industria (Stripe / Vercel / WCAG 2.1).
> **Compatibilidad:** Hacia atrás. NO bumpea contractVersion. Eliminación de inline actions (A4.1) reduce surface del manifest (compatible — el wrapper rechaza slugs no declarados con `INVALID_PAYLOAD`). Endpoint REST nuevo (A4.2) es additivo. Renames de labels son cosmetic (ADR-077 §3 los considera display-only).
> **Materialización:** Sprint 15C.II Fases A→G en rama `sprint15c-ii-enhance-hardening` desde master post merge PR #52 (`ef7f488`).
> **Doctrina:** este Amendment es **heredable** a futuros plugins SaaS (15D RC, 15E Docker, 15G Plesk). Cualquier plugin que retorne métricas en `getServiceInfo`, soporte reconciliación L3, retorne secretos one-time, o muestre estado externo, aplica los patrones de A4.1-A4.5.

#### A4.1. Refresh metrics pattern (decisión doctrinal A1 frozen)

> **Pregunta literal Yasmin (2026-05-10):** "Para refrescar los stats, simplemente poner un spinner pequeño en un lateral de los stats, para refrescarlos todos. O hacerlo más robusto y profesional."
> **Respuesta canónica AskUserQuestion (option Recommended seleccionada):** Eliminar 2 actions + ↻ en MetricsBar.

- **Eliminar** las inline actions `view_disk_usage` y `view_bandwidth_usage` del manifest. Razón: violan UI_SPEC §1.2 P4 "acción no contemplación" — son botones que no llevan a una acción del usuario, solo invalidan cache que se invalidaría sola en 60s (TTL wrapper).
- **Añadir** botón "↻ Refrescar" pequeño en `MetricsBar.tsx` (esquina superior-derecha de la Card), tanto para cliente como admin. Click → server action `refreshServiceInfoAction(serviceId)` → invalida cache wrapper + re-fetch + actualiza render.
- **NO autorrefresh polling** — el cliente puede irse de la página y volver para refrescar; el admin tiene el botón explícito. Polling consume ancho de banda + complica WS architecture.
- **Patrón industria:** Stripe Dashboard, Vercel Metrics, Linear (botón ↻ explícito + countdown opcional autorrefresh — el countdown es deuda v2 si demanda).
- **Aplicación contractual ADR-077:** §2 ServiceAction NO requiere las 2 actions view_metrics — son opcionales. Eliminarlas NO rompe contrato. **Heredable:** ningún plugin SaaS futuro necesita action "view metrics" si el plugin ya expone `metrics` en `getServiceInfo()`.

#### A4.2. Reconcile dual entry point + naming honesto (decisión doctrinal A2 frozen + gap G1)

> **Pregunta literal Yasmin (2026-05-10):** "El 'reconcile' qué es? Si es eso, realmente no debería ser 'forzar reconcile' en el servicio del cliente, sino algo general del plugin."
> **Respuesta canónica AskUserQuestion:** Dual entry point + rename "Reconciliar contra Enhance".

- **Endpoint REST nuevo:** `POST /api/v1/admin/plugins/:slug/reconcile-all` (controller `AdminPluginsController`). Invoca el método público existente `EnhanceReconciliationCron.runOnce()` (que el cron @Cron(EVERY_6_HOURS) ya invoca cada 6h). Cumple DOBLE rol:
  - **A2 reconcile general:** botón UI desde `/admin/settings/plugins/enhance-cp` "↻ Reconciliar todos los servicios contra Enhance ahora".
  - **G1 trigger manual cron:** desbloquea el smoke checklist `admin-plugins-enhance.md §6.2 paso 13` que afirmaba `POST /api/v1/admin/cron/enhance-reconciliation` (vaporware — endpoint nunca existió). Sin esto, smoke real no podía validar reconcile sin esperar 6h.
- **Action local renombrada:** `force_resync` mantiene el slug (compat) pero el `label` i18n cambia "Forzar resincronización" → "Reconciliar contra Enhance". Tooltip canónico explicando que compara cache local vs Enhance (truth) y emite eventos drift.
- **Cliente NUNCA ve botón reconcile** — operación admin pura (mantiene `adminOnly: true` Amendment A3).
- **Patrón heredable:** todo plugin con `supports_reconciliation: true` (ADR-077 §3) DEBE exponer endpoint `POST /admin/plugins/:slug/reconcile-all` consumible desde la página settings del plugin. Convención canónica.

#### A4.3. Drift UX discriminada por rol (decisión doctrinal A3 frozen)

> **Estado observado smoke 2026-05-10:** cliente y admin ven `info.statusReason` crudo tipo "subscription not found in Enhance (drift detected)" mientras `Estado canónico: active`. Mensaje técnico crudo confunde al cliente.
> **Respuesta canónica AskUserQuestion:** Discriminada por rol — cliente generic + admin AlertBanner.

Patrón doctrinal congelado (heredable, materializado como UI_SPEC §4.13 nuevo):

- **Cliente:** `info.statusReason` técnicos NO se renderizan. Si `status` ∈ {`unknown`, `failed`} con drift → mensaje genérico "Tu servicio está temporalmente no disponible. Hemos avisado al equipo técnico." + ocultar acciones que requieran metadata técnica corrupta (SSO, DNS).
- **Admin:** `<AlertBanner variant="warning">` arriba de MetricsBar mostrando `statusReason` técnico crudo + CTA "Investigar en Enhance UI" (link SSO admin impersonation).
- **Service status canónico se mantiene `active`** (DH-INV-6 ADR-082: Enhance gana en conflicto operacional, NO auto-modificar status).
- **Pattern replicable:** cualquier plugin que retorne status `unknown` con `statusReason` aplica la misma UX. Documentado en UI_SPEC §4.13 como patrón heredable.

#### A4.4. Admin overview operativo del plugin (decisión doctrinal A4 frozen)

> **Estado actual:** `/admin/settings/plugins/enhance-cp` solo permite habilitar/configurar (form rjsf + secrets). Sin estadísticas operativas.
> **Respuesta canónica AskUserQuestion:** Incluir overview en Sprint 15C.II como Fase F nueva (NO diferir a Sprint 12).

Composición canónica del overview (UI_SPEC §2.3 Overview type):

1. **Stats grid 4 cards:** Services activos | Services suspendidos | Drifts últimas 24h | Estado circuit breaker.
2. **Tabla recent drifts** (últimos 10 emit `service.reconciled_external_change`) con columnas timestamp + service_id + change_type + CTA "Investigar".
3. **Botón "↻ Reconciliar todos ahora"** (A4.2 endpoint reconcile-all).
4. **Botón "Test conexión"** (existe — preservar).
5. **Form config + secrets** (existe — preservar).

Heredable: cada plugin con `supports_reconciliation: true` puede materializar el mismo overview. Componente reusable `<PluginOperationalOverview slug={...} />` en `frontend/app/_shared/plugins/`.

#### A4.5. Sanitización `data.password` en wrapper auditor (gap G2 — riesgo compliance)

> **Riesgo identificado en audit técnico 2026-05-10:** la action `reset_account_password` retorna la nueva password en `data.password` plaintext (one-time visibility intencional para que admin la comparta con el cliente — ahora vía email listener Sprint 15C.II Fase D). Pero el wrapper auditor canónico (`core/provisioning/plugin-utils.ts executeActionWithCacheInvalidation`) persiste el `result.data` íntegro en `audit_change_log` SIN sanitización. **Riesgo compliance R12:** secrets nunca audit (regla canónica) violada.

Patrón doctrinal congelado (heredable a futuros plugins que retornen secretos one-time):

- **Convención de campos sensibles:** todo `ActionResult.data.<field>` cuyo nombre contenga `password`, `secret`, `token`, `apiKey`, `privateKey` (case-insensitive, regex canónico) DEBE redactarse antes de persistir audit.
- **Wrapper sanitizer:** `core/provisioning/audit-sanitizer.ts` (helper nuevo Sprint 15C.II Fase D) aplica `redactSensitiveFields(data, allowList?)` antes de cualquier `audit_change_log` emit. El admin sigue viendo el campo en la UI (toast/modal) durante la sesión inmediata; solo el log persistido lo enmascara.
- **Test contract genérico nuevo (ADR-077 §7):** todo plugin que retorne campo cuyo nombre matchea el regex sensible DEBE pasar el test "wrapper auditor redacta sensitive en audit_change_log".
- **Excepción declarativa:** un plugin puede declarar `ServiceAction.allowsSensitiveDataInAudit?: string[]` (default `[]`) si tiene razón legítima para auditar plain (uncommon — requiere ADR específico justificando). NO aplica a `reset_account_password` ni equivalentes.

#### A4.6. Validación

- Suite total backend pre Fase A Sprint 15C.II: 488/493 verde + 5 skipped (post merge PR #52).
- Tests nuevos esperados (Sprint 15C.II.D + 15C.II.G):
  - `audit-sanitizer.spec.ts` cubre redact de `password|secret|token|apiKey|privateKey` con allowList opcional.
  - `enhance.plugin.spec.ts` verifica que tras `reset_account_password`, el wrapper sanitiza antes de audit emit.
  - Contract test genérico verifica patrón sensitive redaction para todos los plugins.
  - Test integración endpoint `POST /admin/plugins/enhance_cp/reconcile-all` con admin authenticated → 200 + invoca `cron.runOnce()`.
  - Test integración action `force_resync` con label/tooltip i18n nuevo.
  - E2E spec extendido cubriendo refresh metrics ↻ + drift UX role discrimination + admin overview render.
