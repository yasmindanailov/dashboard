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

---

### Amendment A5 (2026-05-11) — Sprint 15C.II Fase E: `recoveryHint` populate + `force_resync` → `recalculate_provider_metrics` (corrige A4.2) + DNSSEC read-only en `list_dns_records`

> **Justificado por:** smoke real Yasmin Fase D 2026-05-10 (gaps BUG-15CII-I + GAP-15CII-K) + decisión "cada punto al más alto estándar" (2026-05-11). Tres cambios al plugin `enhance_cp`, todos heredables a 15D RC / 15E Docker / 15G Plesk.
> **Compatibilidad:** Hacia atrás a nivel de contrato (`contractVersion` sigue `'v2'`). A5.1 renombra un **slug de inline action** (`force_resync` → `recalculate_provider_metrics`) — los slugs de inline action son **plugin-internos**, no contrato externo estable (ADR-077 §4 + §6: solo `ProvisionerPlugin.slug` es inmutable; los slugs de `inlineActions` son catálogo cerrado por plugin que el wrapper enforce por matching exacto). El rename es seguro porque hoy NO hay UI ni código externo que dependa del literal `'force_resync'` salvo `INTERNAL_HELPER_SLUGS` (frontend) + specs del propio plugin — todo se actualiza en el mismo PR. A5.2 (`recoveryHint`) consume el campo opcional añadido en [ADR-077 Amendment A5](./adr-077-contrato-provisioner-plugin-v2.md#amendments). A5.3 (DNSSEC) es additivo al `result.data.zone` que `list_dns_records` ya devuelve.
> **Materialización:** Sprint 15C.II Fase E en rama `sprint15c-ii-fase-e-admin-dns-operations`.

#### A5.1. `force_resync` → `recalculate_provider_metrics` — naming honesto + reubicación (corrige A4.2)

**Corrección a A4.2 (2026-05-10):** A4.2 renombró el `label` i18n de `force_resync` a *"Reconciliar contra Enhance"* con un tooltip que decía *"compara cache local vs Enhance (truth) y emite eventos drift"*. **Esto es incorrecto.** La implementación real (`EnhanceProvisionerPlugin.actionForceResync`) hace:

```typescript
const usage = await api.calculateResourceUsage(refs.orgId, refs.subscriptionId);
return { success: true, message: '...', data: { resources: usage },
         sideEffects: ['service.metrics_invalidated'] };
```

`api.calculateResourceUsage` es un `PUT /orgs/{org}/subscriptions/{sub}/calculate-resource-usage` que **pide a Enhance que recalcule activamente disco/ancho-de-banda en su lado** — NO compara nada contra Aelium, NO emite eventos drift, NO toca metadata local. Es una operación de "fuerza al proveedor a refrescar sus propias métricas antes de que las leamos". La reconciliación real (comparar Aelium vs Enhance, emitir `service.reconciled_external_change`) es el **cron L3** (`EnhanceReconciliationCron.runOnce()`) — operación distinta, ya expuesta vía `POST /admin/plugins/:slug/reconcile-all` (A4.2 endpoint, que se mantiene).

**Decisión canónica (más alto estándar — opción 3 del dossier §A.9.4 + progressive disclosure):**

| | Antes (A4.2) | Ahora (A5.1) |
|---|---|---|
| slug | `force_resync` | `recalculate_provider_metrics` |
| label i18n | `plugin.enhance_cp.actions.force_resync` = "Reconciliar contra Enhance" ❌ | `plugin.enhance_cp.actions.recalculate_provider_metrics` = "Recalcular métricas en el proveedor" ✅ |
| description i18n | (sugería reconcile) | "Pide a Enhance que recalcule disco y ancho de banda en su lado y refresca la lectura. Distinto de ↻ Refrescar (que solo re-lee lo último ya calculado) y de la reconciliación periódica (cron L3 que detecta drift)." |
| `adminOnly` | `true` | `true` (sin cambio) |
| `confirmRequired` / `destructive` | `false` / `false` | `false` / `false` (sin cambio — no destructiva) |
| Dónde se renderiza | `ActionsBar` genérico ("Acciones rápidas") | `AdminServiceOperationsCard` (junto a "Cambiar plan…" y "Cancelar servicio…") — se añade el nuevo slug a `INTERNAL_HELPER_SLUGS` del frontend |

**Por qué reubicar (no borrar):** la operación es legítima pero del ~5% de casos (el proveedor no ha recalculado en mucho tiempo). El estándar profesional para una operación que funciona pero es de power-user es *progressive disclosure* (vive en la sección de operaciones avanzadas, etiquetada con precisión) — NO eliminarla del UI ni dejarla solo-API. El `AdminServiceOperationsCard` es el contenedor canónico de operaciones admin del service detail; ahí va, con tooltip que la distingue inequívocamente de las otras dos formas de "refresco".

**Heredable:** cualquier plugin futuro con una operación "pide al proveedor que recalcule sus métricas internas" usa el slug canónico `recalculate_provider_metrics` con esta semántica exacta. Si un plugin no la soporta, simplemente no la declara.

#### A5.2. `getServiceInfo()` puebla `recoveryHint` (consume ADR-077 Amendment A5)

`EnhanceProvisionerPlugin.getServiceInfo()` clasifica su drift al campo `ServiceInfo.recoveryHint` (ADR-077 Amendment A5). Mapping canónico:

| Situación detectada por el plugin | `status` reportado | `statusReason` (i18n key) | `recoveryHint` |
|---|---|---|---|
| Service sin `enhance_subscription_id` en metadata (nunca se provisionó realmente, o seed manual incompleto) | `unknown` | `plugin.enhance_cp.status_reason.not_yet_provisioned` | `'reprovision'` |
| `enhance_subscription_id` presente pero `GET /subscriptions/:id` → 404 (recurso borrado externamente del proveedor) | `unknown` | `plugin.enhance_cp.status_reason.subscription_missing` | `'reprovision'` |
| Subscription existe pero su `planId` ≠ `service.metadata.enhance_plan_id` (divergencia de plan) | `active` (DH-INV-6: Enhance gana, status canónico no cambia) | `plugin.enhance_cp.status_reason.plan_divergence` | `'reconcile'` |
| Circuit breaker open / proveedor timeout / error de red al leer | `unknown` | (el wrapper inyecta su statusReason de fallback) | `'contact_support'` (lo inyecta el wrapper — el plugin ni respondió) |
| Cualquier otro estado incoherente del proveedor no auto-remediable | `unknown` / `failed` | (i18n key específica) | `'contact_support'` |
| Todo correcto | `active` | — (undefined) | — (undefined) |

El frontend `admin/services/[id]/page.tsx` gatea el CTA "Re-aprovisionar ahora" por `info.recoveryHint === 'reprovision'` (NO por `statusReason.endsWith(...)`). **BUG-15CII-I queda cerrado por construcción** — `subscription_missing` ahora ofrece el CTA correcto sin heurísticas de string. (Nota: `plan_divergence` con `recoveryHint: 'reconcile'` deja el `AdminDriftBanner` preparado para ofrecer en el futuro un botón "Reconciliar" que invoque el cron L3 manual — no se cablea en Fase E, solo se documenta el contrato.)

#### A5.3. `list_dns_records` expone estado DNSSEC (read-only)

El backend `EnhanceDnsZone` ya trae `dnssecDsRecords?: string` y `dnssecDnskeyRecords?: string` (Enhance corre PowerDNS con DNSSEC, decisión §5 + DC.NEW-15C-DNSSEC). `EnhanceProvisionerPlugin.actionListDnsRecords` mapea esos campos al `result.data.zone` que devuelve, bajo un sub-objeto opcional:

```typescript
// shape canónico de result.data.zone tras Amendment A5.3:
{
  origin: string;
  soa: { ... };
  records: DnsRecord[];
  dnssec?: { dsRecords: string; dnskeyRecords: string };  // ← NUEVO, presente solo si la zona tiene DNSSEC activo
}
```

El frontend (`DnsRecordsManager`, compartido cliente+admin) renderiza un `Badge` "DNSSEC activo" / "DNSSEC inactivo" en la cabecera de la zona. **Gestión** de DNSSEC (activar/desactivar/rotar keys) sigue siendo el panel Enhance (DC.NEW-15C-DNSSEC apuntado como deuda v1.x) — aquí solo visibilidad. Heredable: cualquier plugin DNS-authority que exponga estado DNSSEC lo añade al mismo sub-objeto `dnssec` del shape de la zona.

#### A5.4. Validación

- Specs del plugin actualizados: `enhance.plugin.spec.ts` — `getServiceInfo` retorna `recoveryHint` correcto por cada caso de drift; `executeAction('recalculate_provider_metrics')` (slug nuevo) sigue invocando `calculateResourceUsage`; `actionListDnsRecords` mapea `dnssec` cuando la zona lo trae.
- Contract test genérico (ADR-077 §7 Amendment A5.3): `recoveryHint` ∈ enum | undefined; consistencia con `status` de drift.
- `INTERNAL_HELPER_SLUGS` (frontend `ActionsBar.tsx`) incluye `recalculate_provider_metrics` (ya no `force_resync` — el slug viejo desaparece).
- E2E spec extendido (Fase E): admin DNS CRUD nativo + cancelar servicio (con email mailpit) + recalcular métricas desde `AdminServiceOperationsCard`.
- i18n: `plugin.enhance_cp.actions.recalculate_provider_metrics` (+ `.description`, `.success`) reemplazan `plugin.enhance_cp.actions.force_resync*`.

---

### Amendment A6 (2026-05-12) — Sprint 15C.II Fase F.2: materialización del admin overview operativo (A4.4) + evento rollup `plugin.reconcile_completed`

> **Contexto:** Fase F del dossier se partió en F.1/F.2/F.3 (decisión Yasmin 2026-05-12). F.1 cerró suspend/unsuspend (ADR-077 Amendment A4.5). **F.2 materializa A4.4** (admin overview operativo). Este Amendment documenta las decisiones de materialización + un evento nuevo necesario para que el overview muestre estado **observado** (no inferido).
>
> **Compatibilidad:** Hacia atrás. NO bumpea contractVersion. Evento nuevo `plugin.reconcile_completed` es additivo (extiende los eventos `plugin.*` de ADR-080 / el catálogo §6). Endpoint REST nuevo `GET /admin/plugins/:slug/operational-overview` es additivo. Sin migración de datos.

#### A6.1. Evento rollup `plugin.reconcile_completed` (nuevo)

`§6` (decisión 24) ya define `service.reconciled_external_change` — un evento **por drift individual** a nivel `Service`. Para el overview operativo se necesitaba además un rollup **por pasada de reconciliación** a nivel `Plugin`: "el plugin X corrió, procesó N servicios, detectó M drifts, K errores, en D ms, gatillada por cron|manual". El cron L3 solo logueaba a stderr → no había fuente persistida de "última reconciliación".

- **Evento canónico nuevo:** `plugin.reconcile_completed` con shape genérico (plugin-agnóstico): `{ plugin_slug, trigger: 'cron' | 'manual', services_processed, drifts_detected, errors, duration_ms, completed_at /* ISO */ }`.
- **Emisor:** el cron reconciliation del plugin lo emite tras cada pasada — tanto el `@Cron(EVERY_6_HOURS)` (`trigger: 'cron'`) como el executor invocado por `reconcile-all` manual (`trigger: 'manual'`). En `enhance_cp`: `EnhanceReconciliationCron.emitReconcileCompleted()`. Heredable: cualquier plugin con `supports_reconciliation: true` emite el mismo evento.
- **Listener canónico:** `AuditOnPluginReconcileCompletedListener` (`modules/audit/`) → 1 fila `audit_change_log` con `user_id=null` (sistema), `entity_type='Plugin'`, `entity_id=deriveAuditEntityId(slug)` (mismo UUID v5 determinístico que `plugin.config_changed` / `plugin.reconcile_triggered_manually` — extraído a `core/provisioning/plugin-audit-id.util.ts`), `action='reconcile_completed'`, `changes_after` = el rollup. R7: si el audit falla, el listener NO relanza (el cron sigue vivo). No toca `audit_access_log` ni flags GDPR — un rollup operativo es admin-only por naturaleza; los drifts individuales visibles al cliente ya los maneja `AuditOnServiceReconciledExternalChangeListener`.
- **Coexistencia con `plugin.reconcile_triggered_manually`:** el path manual produce ambos audit rows — `plugin.reconcile_triggered_manually` (escrito por `AdminPluginsService.reconcileAll`, con el actor humano real) registra "quién gatilló"; `reconcile_completed` (escrito por el listener) registra "qué resultado y cuándo terminó". El overview consulta `reconcile_completed` porque cubre cron + manual uniformemente.

#### A6.2. Endpoint + shape del overview

- **Endpoint REST nuevo:** `GET /api/v1/admin/plugins/:slug/operational-overview` (controller `AdminPluginsController`, mismo guard triple + `@CheckPolicies(Manage Plugin)`). Backed por `AdminPluginsService.getOperationalOverview(slug)`.
- **Shape `PluginOperationalOverview`** (`modules/admin-plugins/dto/plugin-operational-overview.dto.ts`) — **plugin-agnóstico**, heredable 15D/15E/15G: `{ slug, label, enabled, health: { status, reasons[] }, circuit: { getServiceInfo, executeAction }, secrets: { required, configured, missing[] }, services: { active, suspended }, reconciliation: { supported, last | null, next_scheduled_at | null, drifts_24h }, recent_drifts: [{ service_id, change_type, detected_at }], generated_at }`.
- **Derivación de `health.status`** (∈ `operational | degraded | down | disabled`):
  - `disabled` si el plugin no está habilitado.
  - `down` si algún circuit breaker está `open`, **o** falta algún secret requerido por el manifest.
  - `degraded` si algún circuit está `half-open`, **o** la última reconciliación terminó con `errors > 0`.
  - `operational` en otro caso. `reasons[]` lleva ≥1 clave i18n explicativa siempre (`admin.plugins.overview.health_reason.*`).
- **`reconciliation.last`:** se lee del audit `reconcile_completed` más reciente (`findFirst` por `entity_type='Plugin'` + `entity_id` + `action`, índice `[entity_type, entity_id]`). `null` si nunca corrió desde que existe el evento (F.2 en adelante). Estado **observado**, no inferido.
- **`reconciliation.next_scheduled_at`:** se deriva del intervalo que el plugin declara al registrar su executor — `ReconcileRegistryService.register(slug, executor, { intervalSeconds })` (campo opcional nuevo; `EnhanceReconciliationCron` declara `21600` = 6 h). Cálculo: siguiente múltiplo del intervalo desde epoch UTC (coincide con los ticks de `CronExpression.EVERY_*`). `null` si el plugin no soporta reconciliación o no declaró intervalo. NO se acopla al cron concreto.
- **`recent_drifts` / `drifts_24h`:** query `audit_change_log WHERE entity_type='Service' AND action='reconciled_external_change' AND created_at > now()-24h` (ventana acotada por el índice `created_at`), filtrado por `changes_after._meta.plugin_slug` en memoria (un único plugin SaaS hoy; aun con varios, 24 h de drifts es un conjunto pequeño; `take: 500` como tope duro defensivo). `change_type` y `detected_at` salen de `changes_after._meta`. Hasta 20 filas en `recent_drifts`.
  > **Corrección del apuntado del dossier (§A.11):** el dossier §A.11.1/§A.11.3 escribió el query como `action LIKE 'service.reconciled%'`. Eso es incorrecto: `service.reconciled_external_change` es el nombre del **evento** (`EventEmitter2`), no el `action` persistido. El `AuditOnServiceReconciledExternalChangeListener` escribe `action='reconciled_external_change'` (sin prefijo `service.`) con `entity_type='Service'`. Esta ADR es la fuente de verdad: A4.4 ya decía "emit `service.reconciled_external_change`" (refiriéndose al evento) — el query SQL correcto filtra por `action='reconciled_external_change'`. (Lección L18 §A.11.5: gana el código real / el ADR sobre el apuntado exploratorio del dossier.)

#### A6.3. Componente frontend

`<PluginOperationalOverview slug={...} />` — Server Component **reusable** en `frontend/app/_shared/plugins/PluginOperationalOverview.tsx` (ubicación canónica que A4.4 ya fijaba). Hace su propio `serverFetch` (autocontenido) y degrada con aviso inline si la llamada falla — no rompe el config form / reconcile-all / test-conexión que ya viven en la página. Montado en `/admin/settings/plugins/[slug]/page.tsx` entre el header y la sección de reconcile-all. Los estados de circuit breaker se etiquetan como "estado en esta instancia" (in-process). Cada fila de la tabla de drifts enlaza a `/admin/services/[id]` (la página de detalle que ya existe); en **F.3**, cuando llegue el timeline `/admin/services/[id]/audit` (GAP-15CII-M), basta repuntar el helper `serviceDetailHref` — una línea. (Decisión Yasmin 2026-05-12: estándar profesional = cero enlaces muertos en estados intermedios; enlazar a destino existente y repuntar después.)

#### A6.4. Validación

- Backend: `admin-plugins.service.spec` (`getOperationalOverview` — operational / disabled / down-por-secret-faltante / down-por-circuit-open / degraded-por-reconcile-errors / filtrado de `recent_drifts` por `_meta.plugin_slug` / NotFound); `audit-on-plugin-reconcile-completed.listener.spec` (persiste Plugin/`reconcile_completed` con `user_id=null` + R7 no-relanza); `enhance-reconciliation.cron.spec` (`handleScheduled` emite `plugin.reconcile_completed` `trigger='cron'`; executor manual emite `trigger='manual'`; `getScheduleMeta('enhance_cp')` = `{ intervalSeconds: 21600 }`). Suite total `pnpm ci:check` verde (637 passed + 5 skipped, 48 suites).
- Frontend: `tsc --noEmit` + `eslint --max-warnings=0` verdes. i18n `admin.plugins.overview.*` añadidas a `translations-es.ts`.

---

### Amendment A7 (2026-05-12) — Sprint 15C.II Fase F.3: cierre Fase F — audit timeline per-servicio (GAP-M) + módulo real en `error_log` (GAP-N) + test-connection canónico (G8) + TTL del cache desde manifest (G4) + timeout fail-fast (G5) + CTA "Reconciliar contra el proveedor" + cooldown server-side del force-refresh

> **Contexto:** F.3 cierra la Fase F (F.1 suspend/unsuspend → [ADR-077 Amendment A4.5](./adr-077-contrato-provisioner-plugin-v2.md#amendments); F.2 admin overview operativo → [Amendment A6](#amendments); F.3 = el resto del hardening que F.1/F.2 difirieron + los GAPs M/N abiertos desde la revaloración pre-código de F.1). Las decisiones de abajo se tomaron en la revaloración 2026-05-12 con Yasmin y NO se re-litigan (recogidas también en el dossier §A.11.9.3).
>
> **Compatibilidad:** Hacia atrás. NO bumpea `contractVersion`. Las extensiones de superficie son **additivas opcionales** y se reflejan en su ADR canónico: método `testConnection?()` en `ProvisionerPlugin` + campo `module?` en `ProvisionerPluginError` → [ADR-077 Amendment A6](./adr-077-contrato-provisioner-plugin-v2.md#amendments); campo `serviceInfoCacheTtlSeconds?` en `PluginManifest` → [ADR-080 Amendment C](./adr-080-plugin-framework.md#amendments); evento `plugin.reconcile_completed` añadido al catálogo §6 de [ADR-080](./adr-080-plugin-framework.md) (A7.7). 1 migración (índice de expresión sobre `audit_access_log`). Sin breaking change, sin migración de datos destructiva.

#### A7.1. Audit timeline per-servicio (GAP-15CII-M)

Páginas nuevas `/admin/services/[id]/audit` (admin — sin filtro de acciones) y `/dashboard/services/[id]/audit` (cliente — whitelist explícita de acciones).

- **Backend:** `AuditService.getServiceTimeline(serviceId, { isAdmin, cursor, limit })` — `UNION ALL` (`$queryRaw`) de `audit_change_log` (`entity_type='Service'` + `entity_id`) y `audit_access_log` (`metadata ? 'resource_id' AND metadata->>'resource_id' = :id`), keyset cursor `(created_at, id)` DESC con `limit+1` para `has_more`, enrich del actor en batch (`user.findMany`), actor desconocido/borrado → `{ user_id, name: null, role: null }`. `ProvisioningService.getServiceTimelineForUser(serviceId, userId, isAdmin, opts)` aplica ownership (`NotFoundException` si no existe; cliente `ForbiddenException` si no es dueño; admin bypass). Endpoints `GET /api/v1/admin/services/:id/audit` (con `@AuditAccess('Service')` — el acceso del admin al timeline se audita a su vez) y `GET /api/v1/services/:id/audit` (`?cursor=&limit=`). DTO `modules/audit/dto/service-timeline.dto.ts`.
- **Migración:** `prisma/migrations/20260512090000_*_audit_resource_id_index` — índice de expresión **parcial** `audit_access_log ((metadata->>'resource_id')) WHERE metadata ? 'resource_id'`. La mitad access-log del `UNION` filtra por path JSONB; sin el índice sería seq-scan. **NO se modela en `schema.prisma`** (Prisma 7 no expresa índices de expresión) → la migración es la fuente de verdad. `audit_change_log` ya estaba cubierto por el índice `[entity_type, entity_id]`.
- **Recorte GDPR (cliente, `!isAdmin`):** whitelist `CLIENT_VISIBLE_TIMELINE_ACTIONS` = `read` · `admin_sso_impersonation` (**con detalle** — decisión Yasmin 2026-05-12: el titular tiene derecho a saber cuándo staff entró en su servicio, GDPR Art. 15) · `service.suspended` · `service.unsuspended` · `service.deprovisioned_admin` · `reconciled_external_change` **solo si** `changes_after._meta.gdpr_visible_to_data_subject === true`. Para el cliente se eliminan `changes_before`/`changes_after`/`correlation_id`/IP de staff; `metadata` se recorta por acción (lo mínimo que justifica la entrada). El admin ve todo.
- **Frontend:** `frontend/app/_shared/services/_components/ServiceAuditTimeline.tsx` — Server Component **reusable** (paginación por URL `?cursor=`, discrimina `isAdmin`). Páginas `/admin|/dashboard/services/[id]/audit` lo montan. Tipos `ServiceTimelinePage` / `ServiceTimelineEntry` / `ServiceTimelineActor` en `api.ts`. i18n `service.audit.*` + `role.*`. Link "Ver historial de auditoría →" en ambos detalles. **`serviceDetailHref` de `<PluginOperationalOverview>` (F.2, A6.3) repuntado** de `/admin/services/[id]` a `/admin/services/[id]/audit` — cierra el "repuntar después" que A6.3 dejó apuntado.

#### A7.2. Módulo real en `error_log`, no `'http'` (GAP-15CII-N)

`ProvisionerPluginError` gana `module?: string` (mutable — los plugins lo lanzan sin conocer su contexto; los wrappers cross-cutting, que sí saben el slug, lo setean). `GlobalExceptionFilter.resolveErrorModule(exception)` recorre el error y su cadena `cause` (máx. 5 niveles, defensivo contra ciclos) buscando el primer `module` string — **duck-typed**: el filtro NO importa `ProvisionerPluginError`, sigue genérico — y lo registra en `error_log.module`. El wrapper `getServiceInfoWithCache` marca `err.module ??= 'provisioning.<slug>'` antes de re-lanzar. Scope: solo el path HTTP (`getServiceInfo` re-lanza al filtro; `executeAction`/`getSsoUrl` swallow; los jobs BullMQ del orquestador no pasan por el filtro HTTP). Contrato en [ADR-077 Amendment A6.2](./adr-077-contrato-provisioner-plugin-v2.md#amendments). Tests: `plugin-utils.spec` (+2) + `global-exception.filter.spec` (NUEVO, 4).

#### A7.3. test-connection canónico — método opcional `testConnection?()` + modo `'custom'` (GAP-15CII-G8)

El `testConnectionMethod` del manifest (§3, valores `'getStatus' | 'custom' | null`) ya existía, pero `'getStatus'` invoca `plugin.getStatus(servicioSintético)` — y el `getStatus()` de Enhance exige `provider_reference` real (`§1` — el `getStatus` mapea contra `subscription.id`/`websites`) → un servicio sintético siempre reporta "sin metadata" (falso negativo). La solución correcta es un **probe dedicado contra el proveedor**, lo que requiere un método de contrato.

- **Contrato (genérico):** `ProvisionerPlugin` gana `testConnection?(): Promise<{ ok, message }>` — **obligatorio si `manifest.testConnectionMethod === 'custom'`**; probe ligero con las credenciales configuradas, **sin servicio, sin side-effects, captura sus propios errores** (nunca lanza). `AdminPluginsService.testConnection`: rama `'custom'` (invoca `plugin.testConnection()`; `400` si declarado pero no implementado) + rama `'getStatus'` (servicio sintético, ahora con `metadata: {}` defensivo) + `null` ⇒ `400`. Detalle en [ADR-077 Amendment A6.1](./adr-077-contrato-provisioner-plugin-v2.md#amendments).
- **Enhance:** `testConnectionMethod` `'getStatus'` → `'custom'` + `testConnection()` = el probe canónico que la spec frozen de **§1 (decisión 5)** ya describía: `GET /version` (orchd vivo) + `GET /orgs/{masterOrgId}` (token válido + RBAC del master org). Los docstrings de `getVersion()` / `getOrg()` ya lo anticipaban.
- **Contract test (§7):** `manifest.testConnectionMethod === 'custom'` ⇒ `typeof plugin.testConnection === 'function'` (corre ×N plugins). Tests: `enhance.plugin.spec`, `admin-plugins.service.spec` (+4 rama `'custom'`), `plugin-contract.spec`.

#### A7.4. TTL del cache `service_info` desde manifest (GAP-15CII-G4) + timeout fail-fast del HTTP client Enhance, sin breaker anidado (GAP-15CII-G5)

- **G4:** `PluginManifest` gana `serviceInfoCacheTtlSeconds?: number` ([ADR-080 Amendment C](./adr-080-plugin-framework.md#amendments)) — recomendación del autor del plugin; el setting global `provisioning.service_info_ttl_seconds` es el override del operador. `ProvisioningService.resolveServiceInfoTtl(plugin)` — precedencia **manifest > setting > 60s**, *sanity floor* 5s en runtime (`Math.max(...,5)`). Enhance **no lo declara** → usa el global. Tests: `provisioning.service.spec` (TTL desde manifest / floor 5s / fallback al setting), `plugin-contract.spec` (invariante).
- **G5:** `EnhanceHttpClient` baja su timeout por defecto **30s → 15s** (`AbortController`) — fail-fast para los workers BullMQ (orchd responde típicamente <5s; un timeout de 30s mantenía un worker bloqueado el doble de lo necesario ante un orchd colgado). **NO** se añade un circuit breaker dentro del HTTP client: el breaker del wrapper (`getServiceInfoWithCache` / `executeActionWithCacheInvalidation`, [ADR-080 §5](./adr-080-plugin-framework.md)) ya cubre fallos repetidos; un segundo breaker envolviendo el client sería *blanket protection* (anti-patrón explícito de ADR-080 §5). Mover el breaker único a envolver el HTTP client (en vez de `getServiceInfo`/`executeAction`) es un refactor con blast-radius → **diferido v1.1**. Documentado en el docstring del client.

#### A7.5. CTA "Reconciliar contra el proveedor" en el drift banner admin

`AdminDriftBanner` gana props `showReconcile?: boolean` + `pluginSlug?: string`. Cuando `info.recoveryHint === 'reconcile'` ([ADR-077 Amendment A5](./adr-077-contrato-provisioner-plugin-v2.md#amendments) — `getServiceInfo` mapea `plan_divergence` → `'reconcile'`, [Amendment A5](#amendments)) ofrece "Reconciliar contra el proveedor" → `router.push('/admin/settings/plugins/${pluginSlug}')` (la página donde viven el `reconcile-all` y el overview F.2 — **consistente con el patrón Fase E** para `invalid_state`, que ya llevaba a "Reconciliar todos los servicios ahora" en settings). `admin/services/[id]/page.tsx` computa los props (`isDrift && recoveryHint === 'reconcile'` + `provisioner_slug ?? product_provisioner`). i18n `service.drift.admin_banner.reconcile_cta` / `.reconcile_help`.

> **Decisión (NO re-litigar):** el CTA enlaza a la página de settings del plugin (reconcile-all), **no** llama `reconcileAllPluginAction` desde el banner ni introduce un endpoint per-servicio nuevo. Llamar al reconcile-all desde el banner de *un* servicio sería un *sledgehammer* ("clico 'reconciliar este servicio' y reconcilia todos"). Una **reconciliación per-servicio single-shot** queda en backlog (`DC.NEW-15CII-RECONCILE-SINGLE`, A7.8) — requiere tocar el contrato `ProvisionerPlugin` (hoy no hay método "reconcile one service", solo el `reconcile-all` del `ReconcileRegistryService` que invoca el cron L3 completo); materializarla probablemente como método opcional `reconcileOne(service)?`.

#### A7.6. Cooldown server-side del force-refresh per-servicio (B.1)

El botón "↻ Refrescar" de `MetricsBar` (`MetricsRefreshButton`) impone 10s de cooldown **solo en el cliente**; `POST /api/v1/services/:id/refresh` y su espejo admin son martilleables directamente, y el TTL del cache `service_info` mitiga el *coste* de un re-fetch (sirve cacheado) pero no el *abuso* — N clientes distintos forzando refresh del mismo servicio dispararían N llamadas al proveedor.

- **`ProvisioningCacheService.tryAcquireRefreshCooldown(serviceId, ttlSeconds)`** — `SET refresh_cooldown:<id> 1 EX ttl NX` (Redis DB 2, prefijo `aelium-provisioning:`). `true` = ventana adquirida (procede el re-fetch fresco); `false` = ventana ya activa. **Fail-OPEN** si Redis falla (coherente con `get`/`set`/`invalidate`; además si esa conexión Redis está caída, `get` también falla → cache miss → el wrapper consulta al proveedor igualmente → el cooldown no empeora nada).
- **`ProvisioningService.getInfoForUser`** — cuando `options.forceRevalidate`, intenta adquirir la ventana (`REFRESH_COOLDOWN_SECONDS = 15`, constante; ligeramente más conservadora que el cooldown del cliente). Si está activa → degrada a una **lectura cacheada normal** (*coalescing* — el usuario recibe el valor actual, ≤15s de antigüedad con el cache caliente, **sin tocar al proveedor y sin error**; la respuesta sigue siendo un `ServiceDetailResponse` válido → **sin cambios en el frontend**). Cache frío → el wrapper hace fetch igualmente (cache miss → fetch — correcto: quieres datos cuando no hay ninguno). **Cliente y admin comparten la misma ventana** ("cuántas veces se re-consulta al proveedor por servicio", no "por usuario") — un admin depurando tampoco gana martilleando (orchd <5s, el cache retiene su TTL). Ambos endpoints `refresh` ya pasan por `getInfoForUser` → cubiertos sin tocar los controllers (solo docstrings). Tests: `provisioning.service.spec` (+3: ventana adquirida → re-fetch salta cache · ventana activa → coalescing a cache sin error · GET normal no consume el cooldown).

> **Decisión (NO re-litigar) — cooldown per-`serviceId` en Redis (coalescing), no `@Throttle` por IP:** el handoff §A.11.9.2 dejaba abierto "@Throttle de `@nestjs/throttler` o check de timestamp en Redis por serviceId". Se eligió el segundo: `@Throttle` trackea por **IP** — clave equivocada para un endpoint autenticado: no acota lo que de verdad cuesta (1 llamada a orchd por servicio, no por IP), se rompe bajo NAT corporativo/CGNAT, y `forceRevalidate` además **bypasea el cache** → dos force-refresh concurrentes del mismo servicio hacen *cache stampede* sobre el write — el `SET NX` per-servicio lo resuelve gratis. Y en *cooldown-hit* no se devuelve `429` sino el valor cacheado: cero estado de error nuevo, cero `Retry-After` que el cliente deba reconciliar contra su cooldown de 10s, y un atacante que martillea simplemente recibe cache sin tocar orchd (menos *information leak*). Es *menos* código total que `@Throttle` + manejo de error en el cliente. Heredable: cualquier endpoint "refresh-through-cache" futuro (15D/15E/15G) aplica el mismo patrón. (Valoración pre-código con Yasmin 2026-05-12 — R10.)

#### A7.7. `plugin.reconcile_completed` en el catálogo §6 de ADR-080 (B.2)

El evento se materializó y documentó en [Amendment A6.1](#amendments) (F.2) pero faltaba en la tabla "Eventos canónicos del framework" (§6) de ADR-080 junto a los otros 5 `plugin.*`. **Doc-only:** fila nueva en [ADR-080 §6](./adr-080-plugin-framework.md) con el payload cross-chequeado contra el emisor real (`EnhanceReconciliationCron.emitReconcileCompleted`), el tipo que consume el listener (`AuditOnPluginReconcileCompletedListener`) y A6.1. Nota explícita en ADR-080 de que `plugin.reconcile_triggered_manually` **no** está en esa tabla — no es un evento del bus, es un `action` de `audit_change_log` que `AdminPluginsService.reconcileAll` escribe síncronamente (verificado: no hay `events.emit('plugin.reconcile_triggered_manually')` en el código).

#### A7.8. Backlog nuevo

- **`DC.NEW-15CII-RECONCILE-SINGLE`** — endpoint `POST /admin/services/:id/reconcile` que reconcilie un único servicio (single-shot, no todos los del plugin). Hoy no hay método de contrato "reconcile one service" — solo el `reconcile-all` del `ReconcileRegistryService` (que invoca el cron L3 completo). Materializar al tocar el contrato `ProvisionerPlugin` (probablemente método opcional `reconcileOne(service)?`). Mientras tanto, el CTA del `AdminDriftBanner` (A7.5) lleva a la página de settings del plugin (reconcile-all).
- (Vigente de F.1) **`DC.NEW-15CII-BILLING-SUSPEND-UNIFY`** — migrar `ServiceLifecycleWorker.autoSuspendServices` (impago vencido — Sprint 6.5) para que llame a `ProvisioningService.suspendAsAdmin` con `reason: 'overdue_payment'` + actor "sistema", en vez de emitir `service.suspended` con forma reducida. Tocar al hacer el siguiente trabajo de billing.

#### A7.9. Validación

- `pnpm ci:check:full` verde: backend **49 suites, 664 passed + 5 skipped** (prisma generate + typecheck + `eslint --max-warnings=0` + test + `nest build`); frontend `tsc --noEmit` + `eslint --max-warnings=0` + `next build` verdes (rutas `/admin|/dashboard/services/[id]/audit` presentes en el build).
- **Boot real** verificado (`node dist/src/main.js`): `Nest application successfully started`, sin errores de DI; rutas mapeadas — `GET /api/v1/services/:id/audit`, `POST /api/v1/services/:id/refresh`, `GET /api/v1/admin/services/:id/audit`, `POST /api/v1/admin/services/:id/refresh`.
- `migrate deploy` aplicado contra la BD dev (índice de expresión `audit_access_log`).
- Tests nuevos/ampliados: `audit.service.spec` (timeline — admin full / cliente whitelist / cursor parse `BadRequestException` / next_cursor / actor desconocido) · `provisioning.service.spec` (timeline ownership ×4 + TTL ×3 + cooldown del force-refresh ×3) · `global-exception.filter.spec` (NUEVO, 4) · `plugin-utils.spec` (+2) · `enhance.plugin.spec` (testConnection) · `admin-plugins.service.spec` (+4 rama `'custom'`) · `plugin-contract.spec` (invariantes G4/G8).

---

### Amendment A8 (2026-05-13) — probe SSL de Enhance (Sprint 15C.II Fase F.7)

> **Justificado por:** Sprint 15C.II Fase F.7 + [ADR-077 Amendment A7](./adr-077-contrato-provisioner-plugin-v2.md#amendments). El campo opcional `ServiceInfo.ssl?` (A7) se materializa en `enhance_cp` leyendo el cert del **primary domain** del website vía el endpoint `GET /v2/domains/{domain_id}/ssl` de orchd v12.21.3.
> **Sprint:** 15C.II Fase F.7 (PR pendiente).
> **Compatibilidad:** Hacia atrás. El campo es opcional — clientes que no lo lean no se ven afectados. NO toca ningún otro shape ni endpoint del plugin. NO requiere migración.

#### A8.1. Endpoint OAS + shape de respuesta

`GET /v2/domains/{domain_id}/ssl` ([orchd OAS v12.21.3 line 8452](../_research/sprint-15c/orchd-oas3-api.yaml)) — operationId `getWebsiteDomainSslCert`, tags `[orgs, websites, ssl]` — devuelve `DomainSslCert`:

```yaml
DomainSslCert:
  required: [cn, expires, issued, issuer, sans, forceHttps]
  properties:
    cn:         string      # Common Name del cert (el dominio)
    expires:    string      # fecha — formato implementation-defined; el cliente la normaliza a ISO-8601
    issued:    string
    issuer:     string      # ej. "Let's Encrypt Authority X3"
    sans:       string[]    # Subject Alternative Names (no usado por el summary v1)
    forceHttps: boolean     # display-only para nosotros (gestión del flag vía SSO al panel)
```

Códigos de error relevantes:

- `200` → cert disponible → mapear con `buildSslSummary` (A8.4).
- `404` → el dominio no tiene cert configurado → `ssl: { status: 'none' }`. (El cliente HTTP Enhance mapea 404 → `code='INVALID_STATE'` — ver `enhance_cp/api/errors.ts:74-83`; mismo criterio que `getSubscription` en `enhance.plugin.ts`; `getDomainSsl` lo captura y devuelve `null`.)
- `401`/`403` → credenciales / RBAC inválidos. El cliente HTTP los traduce a `ProvisionerPluginError` con `code='PROVIDER_AUTH_FAILED'`. El plugin lo captura en el path SSL (best-effort) → `ssl: undefined`.
- 5xx / red → el cliente HTTP los traduce a `ProvisionerPluginError` (`PROVIDER_INTERNAL_ERROR` / `PROVIDER_TIMEOUT` / `NETWORK_ERROR`). El plugin lo captura → `ssl: undefined`.

> **Decisión (NO re-litigar) — endpoint `getWebsiteDomainSslCert`, NO `getWebsiteMailDomainSslCert`.** OAS expone también `GET /v2/domains/{domain_id}/mail_ssl` (cert del subdominio `mail.<dominio>`). v1 cubre solo el website primary cert — el cert del mail es una capability mail-server propia (Enhance admin la gestiona aparte) y mezclarla con el "SSL del sitio" confundiría al cliente. Si emerge la demanda, se añade como sub-shape extra (`ssl.mail?`) sin tocar A7. Mismo criterio para los aliases (`website.aliases[]`): v1 solo expone el primary; el cliente puede tener varios certs por website pero el panel del proveedor los gestiona — exponer todos sería un *card explosion* sin valor v1.

#### A8.2. Localización del `domain_id`

El plugin persiste `enhance_org_id` y `enhance_website_id` en `services.metadata`, **NO** `domain_id` (es un detalle interno de Enhance — `domain` es entidad embebida de `website`). Para resolverlo en `getServiceInfo`:

1. `getWebsite(orgId, websiteId)` → `EnhanceWebsite { domain: { id, domain }, aliases: [...] }`.
2. `getDomainSsl(domain.id)` → cert del primary domain.

(NO se persiste `enhance_domain_id` en provision para optimizar — añadirlo requeriría una migración de datos para servicios existentes + un cambio del provision flow + un fallback durante la transición. El sub-fetch en `getServiceInfo` cuesta 1 round-trip que el cache 60s absorbe. Si el coste se vuelve material en el futuro, se promueve a persistencia con su propio Amendment.)

#### A8.3. Performance — sub-fetch encadenado dentro del `Promise.all` ya existente

El `getServiceInfo` actual paraleliza `[getSubscription, getSubscriptionBandwidth, calculateResourceUsage]`. F.7 añade `getWebsite` al `Promise.all` (4ª lectura paralela) y encadena `getDomainSsl(website.domain.id)` como sub-fetch best-effort **fuera del Promise.all** (depende del primero):

```typescript
const websiteId = extractWebsiteId(service);
const [subscription, bandwidth, resources, website] = await Promise.all([
  api.getSubscription(refs.orgId, refs.subscriptionId).catch((err) => {
    if (err instanceof ProvisionerPluginError && err.code === 'INVALID_STATE') return null;
    throw err;
  }),
  api.getSubscriptionBandwidth(refs.orgId, refs.subscriptionId).catch(() => null),
  api.calculateResourceUsage(refs.orgId, refs.subscriptionId).catch(() => null),
  websiteId ? api.getWebsite(refs.orgId, websiteId).catch(() => null) : Promise.resolve(null),
]);

const ssl = await buildSslSummary(api, website);  // best-effort, devuelve undefined en error
```

Coste: 1 round-trip paralelo extra (websites) + 1 round-trip secuencial (ssl) **solo en cache miss**. El cache 60s (manifest `serviceInfoCacheTtlSeconds` resuelve a 60s vía precedencia ADR-080 Amendment C) absorbe el coste — la página de servicio no se carga 100x/min. El circuit breaker del cliente HTTP (`EnhanceHttpClient`) protege contra orchd inalcanzable. Si `websiteId` no está en `services.metadata` (servicio legacy mal aprovisionado) → `website=null` → `ssl=undefined` → no card (degradación silenciosa, mismo patrón que `bandwidth`/`resources`).

#### A8.4. Mapeo de campos del cert → `ServiceSslSummary`

```typescript
const SSL_EXPIRING_SOON_MS = 14 * 24 * 60 * 60 * 1000;  // 14 días (ADR-077 A7.4)

async function buildSslSummary(
  api: EnhanceApiClient,
  website: EnhanceWebsite | null,
  now: Date = new Date(),
): Promise<ServiceSslSummary | undefined> {
  if (!website) return undefined;  // sin website → no podemos resolver domainId

  let cert: EnhanceDomainSslCert | null;
  try {
    cert = await api.getDomainSsl(website.domain.id);
  } catch {
    return undefined;  // error de red / auth — no exponer parcial
  }
  if (cert === null) return { status: 'none' };  // 404 = sin cert

  const expiresAt = parseEnhanceCertDate(cert.expires);
  if (!expiresAt) return undefined;  // fecha ilegible — no exponer parcial

  const msUntilExpiry = expiresAt.getTime() - now.getTime();
  const status: ServiceSslStatus =
    msUntilExpiry <= 0 ? 'expired'
    : msUntilExpiry <= SSL_EXPIRING_SOON_MS ? 'expiring_soon'
    : 'valid';

  return {
    status,
    expiresAt: expiresAt.toISOString(),
    autoRenew: detectAutoRenew(cert.issuer),
    issuer: cert.issuer,
  };
}

/**
 * Heurística de auto-renovación. Enhance auto-renueva los certs Let's
 * Encrypt (política orchd built-in, ~30 días antes de expirar). Los certs
 * subidos por el cliente vía `POST /v2/domains/{domain_id}/ssl` son
 * custom y NO se auto-renuevan. La distinción no viaja explícita en
 * `DomainSslCert.issuer`, pero es derivable porque el `issuer` LE es
 * estable: "Let's Encrypt Authority X3", "Let's Encrypt R3", "Let's
 * Encrypt E1"… todos contienen "Let's Encrypt" (apostrofado o no).
 *
 * Si emerge un proveedor adicional de auto-renovación integrado en Enhance
 * (p.ej. ZeroSSL como issuer auto-renewing), se añade al matcher;
 * mientras tanto, la heurística cubre 99% de casos reales. Cualquier cert
 * NO LE devuelve `false` (no `undefined`) — el cliente lo subió sabiendo
 * que es manual y queremos mostrarle "renovación manual" explícito.
 */
function detectAutoRenew(issuer: string): boolean {
  return /let'?s\s*encrypt/i.test(issuer);
}
```

`parseEnhanceCertDate` es defensivo: el campo `expires` en orchd OAS es `string` sin formato especificado — en la práctica suele ser ISO-8601, pero defensemos contra RFC-2822 u otros. El helper hace `new Date(raw)` y verifica `!isNaN(getTime())`; si falla → devuelve `null` y el plugin omite el `ssl` para no exponer datos parciales.

#### A8.5. `EnhanceApiClient.getDomainSsl()` — nuevo método

```typescript
// backend/src/plugins/provisioners/enhance_cp/api/client.ts (nueva sección "Domains / SSL")
/**
 * GET /v2/domains/{domain_id}/ssl — lee el cert SSL del dominio.
 *
 * Devuelve `null` si el endpoint responde 404 (no hay cert configurado).
 * Re-lanza `ProvisionerPluginError` en otros errores (autenticación, red,
 * 5xx). Sin side-effects.
 *
 * Consumido por `getServiceInfo()` para poblar `ServiceInfo.ssl?`
 * ([ADR-077 A7](./adr-077-contrato-provisioner-plugin-v2.md#amendments)).
 */
async getDomainSsl(domainId: string): Promise<EnhanceDomainSslCert | null> {
  try {
    return await this.http.get<EnhanceDomainSslCert>(
      `/v2/domains/${encodeURIComponent(domainId)}/ssl`,
    );
  } catch (err) {
    // El cliente HTTP mapea 404 → INVALID_STATE (errors.ts §74-83;
    // mismo criterio que `getSubscription` en enhance.plugin.ts). En este
    // endpoint específico (GET puro), INVALID_STATE solo puede venir de
    // 404 (no hay cert) o 409 (no aplica semánticamente a un GET; defensivo).
    if (err instanceof ProvisionerPluginError && err.code === 'INVALID_STATE') {
      return null;
    }
    throw err;
  }
}
```

Tipo correspondiente en `api/types.ts` (sección 7bis "Domains / SSL"):

```typescript
/**
 * Spec DomainSslCert line 20385 — subset usado por el plugin (omitimos
 * `sans` y `cert`/`key` que están solo en `DomainSslCertWithData`, no
 * necesarios para el summary v1).
 */
export interface EnhanceDomainSslCert {
  readonly cn: string;
  readonly expires: string;
  readonly issued: string;
  readonly issuer: string;
  readonly forceHttps: boolean;
}
```

#### A8.6. MockEnhanceServer — endpoint `/v2/domains/:domainId/ssl`

`backend/test/mocks/enhance-server/server.ts` gana:

- Tabla `state.domainSsls: Map<domainId, EnhanceDomainSslCert>` (la **ausencia** de entrada equivale a 404 = sin cert; no se almacena `null` explícito).
- Endpoint `GET /v2/domains/:domainId/ssl` → `200 cert` si la tabla tiene la entrada, `404 NOT_FOUND` si no.
- Helper `seed.domainSsls?: Record<domainId, EnhanceDomainSslCert>` para que los tests pre-siembren certs determinísticos.
- **Default behaviour** al crear un website (`POST /orgs/{org}/websites`): auto-siembra un cert "Let's Encrypt Authority X3" para el `domain.id` recién creado, `expires` = `now + 60d`, `issued` = `now`, `forceHttps: true`, `cn` = `domain.domain`. Simula el behaviour real de orchd (LE issuance al provision). Tests que quieran probar otros estados (`expiring_soon`, `expired`, `none`, custom issuer) sobreescriben con `state.domainSsls.set(domainId, customCert)` antes del test o con `seed.domainSsls`.

#### A8.7. Tests F.7

- `enhance.plugin.spec.ts` (+8 casos en describe `getServiceInfo > ssl`):
  - `valid` cuando `expires = now + 60d`.
  - `expiring_soon` cuando `expires = now + 10d`.
  - `expiring_soon` cuando `expires = now + 14d` (boundary inclusive).
  - `expired` cuando `expires = now - 1d`.
  - `none` cuando el endpoint devuelve 404.
  - `ssl=undefined` cuando `getWebsite` falla.
  - `ssl=undefined` cuando `getDomainSsl` lanza no-404.
  - `ssl=undefined` cuando `cert.expires` ilegible.
- `enhance.plugin.spec.ts` (+3 casos en describe `detectAutoRenew`):
  - `true` para "Let's Encrypt Authority X3", "Let's Encrypt R3", "Let's Encrypt E1".
  - `false` para "DigiCert SHA2 Secure Server CA", "ZeroSSL RSA Domain Secure Site CA".
  - `false` para emisor vacío.
- `plugin-contract.spec.ts`: invariante A7.3 (ssl opcional + status enum + consistencia `status='none'` sin `expiresAt`).
- `client.integration.spec.ts`: `getDomainSsl` lee del MockEnhanceServer (200, 404, 500).
- `client.spec.ts`: `getDomainSsl` mapea 404 → `null`; otros errores re-lanzan.

#### A8.8. UI — `SslStatusCard` (F.7.2)

`frontend/app/_shared/services/SslStatusCard.tsx`:

```typescript
interface Props {
  ssl: ServiceSslSummary;
  isAdmin?: boolean;
  /** Si el plugin/instancia soporta SSO, link al panel del proveedor (CTA admin). */
  ssoPanelHref?: string;
}
```

Renderiza:

- Badge según `status` (verde `valid` / ámbar `expiring_soon` / rojo `expired` / gris `none`).
- Línea principal (i18n):
  - `valid`: "SSL activo — expira en X días"
  - `expiring_soon`: "Tu certificado SSL caduca pronto — expira en X días"
  - `expired`: "SSL caducado — el sitio aparecerá como 'No seguro' en navegadores"
  - `none`: "Sin certificado SSL — el sitio aparecerá como 'No seguro' en navegadores"
- Sub-textos (opcionales, solo si presentes en el shape):
  - `autoRenew === true`: "Renovación automática activa"
  - `autoRenew === false`: "Renovación manual — recuerda renovar antes del vencimiento"
  - `issuer`: "Emitido por <issuer>"
- Admin extras (cuando `isAdmin === true`):
  - Tooltip en el badge mostrando `expiresAt` ISO exacto.
  - CTA footer "Gestionar SSL en el panel del proveedor →" (link `ssoPanelHref`, abre nueva pestaña). Si `ssoPanelHref` no se pasa (plugin sin SSO o capability `hasSsoPanel=false` en la instancia), no se muestra el CTA.

Wire en `/dashboard/services/[id]/page.tsx` y `/admin/services/[id]/page.tsx`: render `<SslStatusCard ssl={info.ssl} isAdmin={isAdmin} ssoPanelHref={...} />` SOLO si `info.ssl` está presente. La ubicación exacta en el árbol queda formalizada en F.12 (layout canónico) — interinamente, junto a `<MetricsBar>` (sección de "estado del recurso") con margen coherente con las cards existentes.

#### A8.9. i18n keys nuevas (`frontend/app/_i18n/`)

- `service.ssl.card_title`
- `service.ssl.status.valid` / `.expiring_soon` / `.expired` / `.none`
- `service.ssl.expires_in_days` (con plural — `{ count: number }`)
- `service.ssl.auto_renew_on` / `.auto_renew_off`
- `service.ssl.issuer_label`
- `service.ssl.admin_cta_manage_in_provider`

---

### Amendment A9 (2026-05-18) — Apps CMS instaladas: WordPress SSO contractual + Joomla URL canónica (Sprint 15C.II Fase F.10)

**Contexto.** Sprint 15C.II Fase F.10 — capa base de App Management. El plugin Enhance materializa la primera implementación concreta del shape genérico `AppPresence` introducido en [ADR-077 Amendment A9](./adr-077-contrato-provisioner-plugin-v2.md#amendments). Enhance soporta dos kinds canónicos hoy (Sprint 15C.II): `wordpress` (SSO contractual documentado en OAS) y `joomla` (URL canónica sin SSO). Heredable a fases futuras F.10.x (stats UI per-app `DC.NEW-51`) y F.10.y (install/uninstall desde dashboard `DC.NEW-52`). Dossier [§A.11.10.7](../60-roadmap/sprint-15c-ii-hardening-enhance-dossier.md) re-redactado post-pivot + refinamiento [§A.11.10.7.2](../60-roadmap/sprint-15c-ii-hardening-enhance-dossier.md) R1..R6 frozen pre-código.

> **Justificado por:** sprint hardening 15C.II Fase F.10 — capa base App Management con endpoints orchd contractuales documentados.
> **Sprint:** 15C.II Fase F.10 (rama `sprint15c-ii-fase-f10-curated-deeplinks`).
> **Compatibilidad:** Hacia atrás. NO bumpea `contractVersion` de ADR-077 (sigue `'v2'`). 4 nuevos métodos en `EnhanceApiClient` (additivos). Plugin Enhance declara `'open_app_admin'` en `inlineActions` (additivo). `getServiceInfo()` añade `apps` al `Promise.all` paralelizado existente (additivo, fail-soft — apps NO bloquean SSL/quota/status existentes).

#### A9.1. Endpoints orchd consumidos (verificados contra OAS)

Cuatro endpoints contractuales del [OAS de orchd](../_research/sprint-15c/orchd-oas3-api.yaml):

- [`GET /orgs/{org}/websites/{w}/apps`](../_research/sprint-15c/orchd-oas3-api.yaml#L9408) (`getWebsiteApps`) — lista apps `{ id, app: 'wordpress'|'joomla', version, path?, defaultWpUserId? }`. Returns `WebsiteAppsFullListing { items: WebsiteApp[] }`.
- [`GET /orgs/{org}/websites/{w}/apps/{appId}/wordpress/info`](../_research/sprint-15c/orchd-oas3-api.yaml#L10280) (`getWordpressInfo`) — snapshot per-WP `{ version, site_url, plugin_count, user_count, has_woocommerce }`. F.10 NO lo consume directamente (los detalles per-kind son F.10.x — DC.NEW-51); el método se añade ahora al cliente para uso futuro sin refactor.
- [`GET /orgs/{org}/websites/{w}/apps/{appId}/wordpress/users/default`](../_research/sprint-15c/orchd-oas3-api.yaml#L9838) (`getDefaultWpSsoUser`) — devuelve `WpUser` del default SSO; **404 si NO hay default user configurado** (manejo defensivo crítico — A9.2).
- [`GET /orgs/{org}/websites/{w}/apps/{appId}/wordpress/users/{userId}/sso`](../_research/sprint-15c/orchd-oas3-api.yaml#L9945) (`getWordpressUserSsoUrl`) — **SSO contractual a WP-admin** del user específico. Returns URL string. Acepta `?shouldRedirect=true` para 307 redirect en vez de JSON; Aelium consume la variante JSON (default).
- [`GET /orgs/{org}/websites/{w}/apps/{appId}/joomla/info`](../_research/sprint-15c/orchd-oas3-api.yaml#L10255) (`getJoomlaInfo`) — snapshot per-Joomla `{ version, site_url, plugin_count, user_count }`. F.10 consume `site_url` para construir la URL canónica `${site_url}/administrator`. Los detalles plugin_count/user_count se reservan para F.10.x.

**NO existe `getJoomlaUserSsoUrl`** en el OAS — verificación rigurosa contra todas las rutas `joomla` del OAS. Decisión doctrinal: Joomla usa URL canónica `${site_url}/administrator` (estándar del CMS Joomla desde su versión 1.0 en 2005 — estable a nivel del CMS, NO del panel; orchd no la puede romper porque no es suya). UX: cliente entra con sus credenciales Joomla (standard reseller — cPanel/Plesk se comportan igual).

#### A9.2. Flow `executeAction('open_app_admin', { appId })` — discriminator por kind

```typescript
// Pseudocódigo del dispatch interno (enhance.plugin.ts):
async function executeOpenAppAdmin(
  service: ServiceWithRelations,
  payload: { appId: string },
): Promise<ActionResult> {
  const refs = extractServiceRefs(service);
  // refs.enhance_org_id + refs.enhance_website_id ya disponibles en metadata
  const { client: api } = await this.getApiClient();

  // 1. Localizar la app por appId (re-query, no cache — apps pueden cambiar runtime)
  const appsResponse = await api.getWebsiteApps(refs.enhance_org_id, refs.enhance_website_id);
  const app = appsResponse.items.find(a => a.id === payload.appId);
  if (!app) {
    throw new ProvisionerPluginError(
      `App ${payload.appId} not found in website ${refs.enhance_website_id}`,
      'INVALID_STATE',
      false,
    );
  }

  // 2. Discriminator por kind
  if (app.app === 'wordpress') {
    // 2a. Resolver default SSO user (404 si no configurado)
    let defaultUser;
    try {
      defaultUser = await api.getDefaultWpSsoUser(
        refs.enhance_org_id,
        refs.enhance_website_id,
        app.id,
      );
    } catch (err) {
      if (err.code === 'NOT_FOUND' /* 404 */) {
        // Esto NO debería pasar — el plugin filtra apps WP sin default user
        // en getServiceInfo() (action 'open_app_admin' OMITIDA del actions[]).
        // Defensive: el frontend ya gateó el botón disabled; este path solo
        // si el usuario fuerza el call via curl.
        throw new ProvisionerPluginError(
          'WordPress default SSO user not configured for this installation',
          'INVALID_STATE',
          false,
        );
      }
      throw err;
    }

    // 2b. Generar SSO URL fresh on-demand (one-shot, NO cacheable)
    const ssoUrl = await api.getWordpressUserSsoUrl(
      refs.enhance_org_id,
      refs.enhance_website_id,
      app.id,
      defaultUser.id,
    );

    return {
      success: true,
      data: {
        url: ssoUrl,
        appKind: 'wordpress',
        urlKind: 'sso',
        opensIn: 'new_tab',
      },
    };
  } else if (app.app === 'joomla') {
    // 3. Joomla: URL canónica desde site_url
    const joomlaInfo = await api.getJoomlaInfo(
      refs.enhance_org_id,
      refs.enhance_website_id,
      app.id,
    );

    // site_url puede o no terminar con '/', normalizar
    const baseUrl = joomlaInfo.site_url.replace(/\/$/, '');
    return {
      success: true,
      data: {
        url: `${baseUrl}/administrator`,
        appKind: 'joomla',
        urlKind: 'canonical',
        opensIn: 'new_tab',
      },
    };
  } else {
    // 4. Kind no soportado (defensive — shouldn't reach si getServiceInfo
    // filtra correctamente; pero permite futuros kinds añadirse sin error)
    throw new ProvisionerPluginError(
      `App kind "${app.app}" not supported by open_app_admin (Enhance F.10)`,
      'NOT_IMPLEMENTED',
      false,
    );
  }
}
```

#### A9.3. Flow `getServiceInfo()` — enumera apps paralelo a SSL/quota/status existentes

`getServiceInfo` extiende su `Promise.all` con `getWebsiteApps` (fail-soft: si lanza, log warn + devuelve `null` → `apps: undefined`). Por cada `WebsiteApp` se construye un `AppPresence` con:

- `appId`, `kind`, `label` i18n, `path` opcional, `version` opcional.
- `actions`: si `kind='wordpress'` requiere `defaultWpUserId` presente en el listado (campo opcional del OAS `WebsiteApp.defaultWpUserId?` línea 19199); si ausente → `actions: []` → frontend renderiza disabled state. Si `kind='joomla'` → `actions: [{ slug: 'open_app_admin', adminOnly: false, label: 'plugin.enhance_cp.actions.open_app_admin.label' }]` siempre disponible.
- Kinds futuros: añadir cases sin amendment del contrato genérico ADR-077 A9.

**Optimización heredable**: `app.defaultWpUserId` del listado evita call extra a `getDefaultWpSsoUser` per-WP-app en `getServiceInfo`. Solo se invoca defensivamente en `executeAction` (path "el cliente forzó el call sin que el frontend lo gateara"). Patrón heredado del SSO optimization de ADR-083 §4 decisión 13.

#### A9.4. Mock `MockEnhanceServer` — extensión Sprint 15C.II Fase F.10

`backend/test/mocks/enhance-server/server.ts` + `backend/test/mocks/enhance-server/types.ts`:

- **State nuevo**: `state.websiteApps: Map<websiteId, WebsiteApp[]>` (Map keyed por `websiteId`).
- **Seed opt-in**: `MockEnhanceSeed.websiteApps?: Map<websiteId, WebsiteApp[]>` — si presente, pre-puebla el state. Si ausente, websites arrancan sin apps (NO se auto-siembra al `POST /websites` — las apps las instala el cliente explícitamente; cuando F.10.y materialice install desde dashboard, el flow las crea via `POST /websites/{w}/apps`).
- **5 endpoints simulados**:
  - `GET /orgs/:orgId/websites/:websiteId/apps` → returns `{ items: state.websiteApps.get(websiteId) || [] }`.
  - `GET /orgs/:orgId/websites/:websiteId/apps/:appId/wordpress/info` → returns `WordPressInfo` simulado (seed-overridable).
  - `GET /orgs/:orgId/websites/:websiteId/apps/:appId/wordpress/users/default` → returns default user simulado; **404 si la WP app no tiene `defaultWpUserId` en el state** (permite testing del path "WP sin default user").
  - `GET /orgs/:orgId/websites/:websiteId/apps/:appId/wordpress/users/:userId/sso` → returns `"http://mock-panel.aelium.test/wp-admin/index.php?token=<uuid>"` (JSON-encoded string, mismo patrón que `/sso` existente del mock).
  - `GET /orgs/:orgId/websites/:websiteId/apps/:appId/joomla/info` → returns `JoomlaInfo` simulado (seed-overridable, `site_url` por defecto = website primary domain).

**Cleanup canónico**: `DELETE /websites/:id` borra las apps del state (`state.websiteApps.delete(websiteId)`) — coherente con el cleanup SSL F.7.

#### A9.5. UI — `<AppShortcutsCard>` SC (F.10.3)

`frontend/app/_shared/services/AppShortcutsCard.tsx` (paralela a `<SslStatusCard>` A8.8):

```typescript
interface Props {
  apps: readonly AppPresence[];
  serviceId: string;
  isAdmin?: boolean;
}
```

Renderiza:

- Título card "Aplicaciones instaladas" (i18n key `service.apps.card_title`).
- Lista de N botones, uno por `AppPresence`. Cada botón:
  - Label: traduce `app.label` + sufijo `(path)` si `app.path` está definido y no es `/`.
  - Subtexto: `version` si presente.
  - Icono por kind (WordPress logo / Joomla logo / icono genérico para kinds futuros).
- Estado del botón:
  - `actions: []` → DISABLED con tooltip "Configura un usuario WP por defecto en el panel para activar este atajo" (i18n key `service.apps.disabled_no_default_user`) + CTA "Abrir panel" via `SsoButton` existente del card SSO padre.
  - `actions: [{ slug: 'open_app_admin' }]` → enabled, click invoca server action `openAppAdminAction(serviceId, appId)`.

Click handler:

```typescript
async function handleOpenAppAdmin(appId: string) {
  const result = await openAppAdminAction(serviceId, appId);
  if (result.success) {
    window.open(result.data.url, '_blank');
  } else {
    showToast({ type: 'error', message: result.message });
  }
}
```

Wire en `/dashboard/services/[id]/page.tsx` y `/admin/services/[id]/page.tsx`: render `<AppShortcutsCard apps={info.apps} serviceId={service.id} isAdmin={isAdmin} />` SOLO si `info.apps !== undefined && info.apps.length > 0`. Ubicación exacta en el árbol formalizada en F.12 — interinamente junto a `<SslStatusCard>` (sección "estado del recurso").

#### A9.6. Telemetry/audit per-app (R6 frozen — `metadata.app_id`)

Cuando admin ejecuta `open_app_admin` sobre service ajeno (`AuditInterceptor` filtra: actor staff + `target_user_id !== actor.id`), el orquestador o capa equivalente del flow admin añade audit enriquecido en `audit_access_log.metadata` JSON path:

```json
{
  "resource_type": "Service",
  "resource_id": "<service_uuid>",
  "target_user_id": "<service_owner_user_uuid>",
  "actor_role": "superadmin",
  "app_id": "<app_uuid>",
  "app_kind": "wordpress"
}
```

**Decisión doctrinal R6**: `metadata.app_id` JSON path (cero schema change) en lugar de columna `app_id` nullable. Justificación rigurosa en [ADR-077 Amendment A9.7](./adr-077-contrato-provisioner-plugin-v2.md#amendments) — coherente con `target_user_id` que ya vive como JSON path desde Sprint 9 Fase E.

#### A9.7. i18n keys nuevas (`frontend/app/_i18n/`)

- `service.apps.card_title` — "Aplicaciones instaladas"
- `service.apps.open_app_admin.label` — "Abrir admin"
- `service.apps.disabled_no_default_user` — "Configura un usuario WP por defecto en el panel para activar este atajo"
- `service.apps.disabled_no_default_user.cta_label` — "Abrir panel"
- `plugin.enhance_cp.apps.wordpress` — "WordPress"
- `plugin.enhance_cp.apps.joomla` — "Joomla"
- `plugin.enhance_cp.actions.open_app_admin.label` — "Abrir admin"
- `plugin.enhance_cp.actions.open_app_admin.description` — "Abre el panel de administración de la aplicación en una pestaña nueva"

#### A9.8. Tests Sprint 15C.II Fase F.10

- `enhance.plugin.spec.ts` — `getServiceInfo > apps`:
  - Website sin apps → `apps: undefined` (capability-driven por presencia, NO emitir array vacío).
  - WP con `defaultWpUserId` → `apps[].actions = [{ slug: 'open_app_admin' }]`.
  - WP sin `defaultWpUserId` → `apps[].actions = []` (disabled state).
  - Joomla → `apps[].actions = [{ slug: 'open_app_admin' }]`.
  - Multi-instancia: 2 WP (root + /blog) + 1 Joomla → 3 entries diferenciadas por `path`.
  - Fail-soft: `getWebsiteApps` lanza → `apps: undefined` (NO bloquea getServiceInfo).
- `enhance.plugin.spec.ts` — `executeAction('open_app_admin')`:
  - WP con default → llama `getWordpressUserSsoUrl(defaultUserId)` + returns `{ url, kind: 'sso' }`.
  - WP sin default (404 defensive) → throws `ProvisionerPluginError('INVALID_STATE')`.
  - Joomla → llama `getJoomlaInfo` + returns `{ url: '${site_url}/administrator', kind: 'canonical' }`.
  - Kind desconocido (defensive) → throws `ProvisionerPluginError('NOT_IMPLEMENTED')`.
  - App `appId` no existe en website → throws `INVALID_STATE`.
- `client.integration.spec.ts` — los 4 nuevos métodos cliente contra mock.
- `client.spec.ts` — manejo de errores (`getDefaultWpSsoUser` 404 → mapea a `NOT_FOUND` semánticamente).
- `plugin-contract.spec.ts` — invariante A9 capability-driven: si plugin declara `'open_app_admin'` en `inlineActions` → `getServiceInfo` DEBE emitir `apps?: AppPresence[]` (consistencia bidireccional).
- `admin-provisioning.controller.e2e` o equivalente — audit per-app: ejecutar `open_app_admin` admin sobre service ajeno → fila persistida en `audit_access_log` con `metadata.app_id` + `metadata.app_kind`.

#### A9.9. Heredabilidad a 15D RC / 15E Docker / 15G Plesk

Patrón canónico Sprint 15C.II Fase F.10 establecido:

1. **Plugin enumera apps en `getServiceInfo()`** — si el upstream expone "aplicaciones instaladas dentro del recurso" (websites con CMS para Enhance/Plesk; containers con apps para Docker; etc.), el plugin las mapea a `AppPresence[]` con sus kinds plugin-internos.
2. **Action canónica `open_app_admin`** declarada en `inlineActions` con payload `{ appId }`. El plugin discrimina por kind internamente.
3. **URLs fresh on-demand** — el plugin emite la URL en `ActionResult.data` cada vez (NO se cachean — SSO one-shot, canónicas re-generadas por consistencia).
4. **Mock extendido análogamente** — endpoints simulados para `getWebsiteApps` (o equivalente) + flow SSO per-kind.
5. **Capability gating por presencia** — frontend renderiza `<AppShortcutsCard>` solo si `info.apps !== undefined && info.apps.length > 0`. NUNCA ramifica por `provisioner_slug`.
6. **Audit per-app via `metadata.app_id`** — cero schema change, coherente A9.7 ADR-077.

15D RC NO tiene apps instalables (registro de dominios — no aplica). 15E Docker SÍ — un container puede tener apps web instaladas (WordPress en container, etc.) — heredará el patrón. 15G Plesk SÍ — Plesk Application Vault tiene catálogo extensivo (WordPress, Joomla, Drupal, MediaWiki, PrestaShop, ...) — heredará el patrón con kinds adicionales sin amendment del contrato.

#### A9.10. Amendment I — naming clarity `kind` → `appKind` + `urlKind` (Sprint 15C.II Fase F.10 commit 4)

Refinamiento doctrinal descubierto durante implementación del audit per-app (R6 frozen — `ProvisioningService.executeActionForUser` añade `audit_access_log` enriquecido con `metadata.app_id` + `metadata.app_kind`): el shape original del `ActionResult.data` del plugin tenía un solo campo `kind: 'sso' | 'canonical'` que mezclaba dos conceptos distintos:

- **Qué app** se abrió (WordPress / Joomla / futuros) — necesario para audit per-app y para el toast UX del frontend.
- **Cómo se generó la URL** (SSO contractual / URL canónica) — útil para audit (distinguir SSO real vs URL "abierta sin auth") y para tooltip UX ("inicio sesión automático" vs "te pedirá login").

Materialización: renombrar `kind` → `appKind` (valor canónico igual al de `AppPresence.kind`: `'wordpress'`/`'joomla'`/futuros) + añadir campo nuevo `urlKind: 'sso' | 'canonical'` (semántica preserved del valor anterior). Compatible hacia atrás SOLO si esta es la primera implementación que consume el shape (es el caso — Sprint 15C.II Fase F.10 es el primer feature que usa `open_app_admin`). No requiere cambio del contrato genérico ADR-077 (el campo vive en `ActionResult.data: Record<string, unknown>` libre).

Patrón heredable a futuros plugins: cuando una action canónica devuelve URL + metadata, el shape rigoroso es `{ url, <subject>Kind, urlKind?, opensIn }` — separar el QUÉ del CÓMO.

#### A9.11. Audit per-app — implementación concreta (R6 frozen — Sprint 15C.II Fase F.10 commit 4)

`ProvisioningService.executeActionForUser` añade `audit_access_log` adicional cuando se cumplen TODAS estas condiciones:

1. `actionSlug === 'open_app_admin'` (Sprint 15C.II Fase F.10 — extensible a futuras actions sub-recurso `DC.NEW-53`).
2. `isAdmin === true` (actor es staff).
3. `service.user_id !== actorUserId` (actor opera sobre service ajeno — mismo predicado canónico que `AuditInterceptor` automático).
4. `result.success === true` (la action funcionó; si falló, el `audit_change_log` del wrapper ya capturó `success: false`).

Shape del entry:

```typescript
{
  user_id: actor_id,
  action: 'service.app_admin_opened',
  resource: 'Service:<service_uuid>',
  metadata: {
    resource_type: 'Service',
    resource_id: service.id,
    target_user_id: service.user_id,    // GDPR portal visibility
    actor_role: 'admin',
    provisioner_slug: 'enhance_cp',
    action_slug: 'open_app_admin',
    app_id: <appId del payload>,         // ← R6 frozen
    app_kind: <result.data.appKind>,     // ← R6 frozen — 'wordpress'|'joomla'
    url_kind: <result.data.urlKind>,     // 'sso'|'canonical'
  },
}
```

El `audit_access_log` es ADITIVO al `audit_change_log` que el wrapper `executeActionWithCacheInvalidation` genera para TODAS las actions — no duplicación, distinta dimensión (read vs change). El portal de transparencia del cliente afectado lo ve como "El admin X abrió el WP-admin de tu app appId el día Y" (vs el log de change "El admin X ejecutó la action open_app_admin sobre el service Z").

Cuando F.10.x sume actions admin sobre apps (DC.NEW-53 — update_app_version, install_plugin, set_default_wp_sso_user), el predicado canónico se generaliza a "cualquier action que opere sobre sub-recurso identificado por `payload.appId`". Patrón heredable.

### Amendment A10 (2026-05-21) — change_package: sincronización local fail-safe (Sprint 15C.II Fase G.1.b)

**Contexto.** §A.2 área 5 del dossier de hardening identificó un coverage gap: `actionChangePackage` ejecuta `api.patchSubscription(...)` (PATCH a Enhance — ground truth del plan) y **después** `prisma.service.update(...)` para sincronizar el snapshot local `metadata.enhance_plan_id` (Sprint 15C Fase 15C.H, evita `plan_divergence` false-positive en el cron L3). El happy path estaba testeado, pero NO el escenario en que el PATCH tiene éxito y el `service.update()` local falla (disco, conflicto de tx, etc.).

**Comportamiento previo (deficiente).** El error crudo de Prisma se propagaba; el wrapper `executeActionWithCacheInvalidation` lo colapsaba al genérico `action.provider_error`, sin indicar que el PATCH ya había ocurrido (Enhance = plan nuevo) ni que el retry era seguro. El operador no tenía señal accionable y la `plan_divergence` resultante parecía un cambio externo no autorizado.

**Decisión (Yasmin 2026-05-21 — "error semántico + retry idempotente").** Se descartó la compensación/saga (revertir el PATCH): añade una 2ª llamada externa que también puede fallar y NO cubre un crash del proceso entre el PATCH y el update. En su lugar, `actionChangePackage` envuelve el `service.update()` en try/catch y, ante fallo, lanza un `ProvisionerPluginError` **semántico y retriable**:

- **Mensaje accionable** (logueado por el wrapper): indica que Enhance ya está en el plan nuevo y que la operación es **idempotente** — re-ejecutar `change_package` con el mismo `planId` re-aplica el PATCH (no-op en Enhance) y reintenta el update local, convergiendo el snapshot.
- **`retriable = true`** — el retry converge.
- **`module = 'enhance_cp'`** — origen lógico (GAP-15CII-N / Fase F.3).
- **Reusa el code `PROVIDER_INTERNAL_ERROR`** — NO añade un code al contrato `ProvisionerErrorCode` de [ADR-077](./adr-077-contrato-provisioner-plugin-v2.md) (frozen). El detalle accionable vive en el mensaje + log + este amendment; el code es secundario (branching/i18n). Trade-off consciente: la etiqueta dice "provider" aunque el fallo sea local; el mensaje desambigua.

**Coherencia doctrinal.** La `plan_divergence` transitoria (Enhance=nuevo, local=viejo) la detecta el cron L3 (`EnhanceReconciliationCron`) y la expone en el `AdminDriftBanner` — coherente con la doctrina reconcile **emit-only** de la Fase F.9 ([ADR-077 Amendment A8](./adr-077-contrato-provisioner-plugin-v2.md#amendments) — el reconcile NO auto-muta el plan por su implicación de billing). La divergencia NO es estado corrupto: el snapshot local sigue en un valor válido (el plan viejo) y el billing usa el precio del producto, no `metadata.enhance_plan_id`.

**Cobertura.** `backend/test/integration/change-package-rollback.e2e-spec.ts` (Fase G.1.b) prueba contra Postgres real: fase 1 fuerza el fallo del update (`mockRejectedValueOnce`) → `ProvisionerPluginError(PROVIDER_INTERNAL_ERROR, retriable, /idempotent/)` + fila real intacta en el plan viejo; fase 2 reintenta con el update real → la fila converge al plan nuevo.

**Heredable** a 15D RC / 15E Docker / 15G Plesk: toda action de plugin que mute el proveedor (ground truth) y luego sincronice un snapshot local debe envolver la escritura local y, ante fallo, lanzar un error semántico retriable en vez de propagar el error crudo de persistencia — confiando en la idempotencia del retry + la detección de divergencia del reconcile, no en compensación.
