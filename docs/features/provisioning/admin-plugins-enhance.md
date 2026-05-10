# Plugin Enhance CP — Operativa diaria

> Sprint 15C — [ADR-082](../../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md) (modelo Domain↔Hosting transversal) + [ADR-083](../../10-decisions/adr-083-plugin-enhance-cp-specifics.md) (specifics Enhance CP). Operativa diaria del superadmin para gestionar el plugin `enhance_cp`, sus suscripciones, sus operaciones admin curadas y la reconciliación L3 contra el cluster Enhance v12.21.3.
>
> Audiencia: **superadmin + agentes operativos**. El cliente final solo ve la UI de su `/dashboard/services/[id]` + `/dashboard/services/[id]/dns` — esta doc es la guía interna de quién opera el plugin desde el otro lado.
>
> Hermano canónico: [`admin-plugins.md`](./admin-plugins.md) (Sprint 15A — framework genérico de plugins). Esta doc describe lo **específico del plugin enhance_cp**; la doc framework cubre el lifecycle común a TODOS los plugins (vault, breaker, enable/disable).

---

## 1. Visión general

El plugin `enhance_cp` materializa el primer plugin SaaS real del framework Sprint 15A. Conecta Aelium con un cluster [Enhance Control Panel](https://www.enhance.com/) (orchd v12.21.3) propiedad de Aelium para aprovisionar **hosting compartido web** completamente automático: crea customer Enhance ↔ user Aelium, abre suscripción del plan elegido, levanta website + zona DNS, ofrece SSO al panel del cliente y reconcilia drift cada 6 horas.

Capacidades expuestas (Sprint 15C Fase A:
- [`PluginCapabilities.has_dns_management = true`](../../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md#3-dns-as-capability) — el plugin gestiona DNS records en Enhance vía `/orgs/.../dns-zone/records`.
- 10 `inlineActions` curadas — 7 cliente + 3 admin-only (`change_package`, `force_resync`, helper interno `list_available_plans`).
- SSO panel via `getSsoUrl` con audit obligatorio (ADR-070 §B + Sprint 15C Fase F admin impersonation).
- Reconciliación L3 cron `EVERY_6_HOURS` con 3 sub-tipos drift detection (Fase 15C.H).

---

## 2. Instalación + configuración inicial

> Pre-requisitos:
> - Cluster Enhance v12.21.3 operativo + Master Org Aelium creado.
> - Bearer token Super Admin Enhance — revocable desde la UI Enhance.
> - Setting global Aelium `provisioning.default_nameservers` con los `ns1.aelium.net`/`ns2.aelium.net` que Aelium ofrece a sus dominios (NS-sync C3 ADR-082 §4).

### 2.1. Habilitar el plugin desde `/admin/settings/plugins/enhance_cp`

1. Entrar en **Settings → Plugins**. La card `enhance_cp` aparece como **Deshabilitado**.
2. Click en la card → `/admin/settings/plugins/enhance-cp` (form dinámico construido con `@rjsf/core` + tema DS canónico).
3. Rellenar **Configuración**:
   - `baseUrl` — URL base de la API Enhance (ej. `https://enhance.aelium.net`). El plugin añade prefijos `/orgs/...` y `/v2/...` según el endpoint.
   - `masterOrgId` — UUID del Master Org Aelium en Enhance. Owner de TODOS los customers que el plugin cree (multi-tenancy ADR-083 §2).
   - `reconciliationIntervalHours` — Default `6`. El cron L3 corre con `@Cron(EVERY_6_HOURS)` cuando el plugin está enabled.
4. Rellenar **Credenciales**:
   - `apiToken` — Bearer Super Admin Enhance. Se cifra AES-256-GCM con la `ENCRYPTION_KEY` antes de persistirse en `plugin_installs.secrets` (ADR-080 §3).
5. Click **Probar conexión** → backend invoca `plugin.getStatus()` con un service sintético + GET `/version` contra el cluster real. Si verde, click **Habilitar**.

> **Lo que pasa al habilitar** (Sprint 15C Fase 15C.D listener canónico):
> - `BootstrapEnhanceDefaultsOnPluginInstalledListener` consume `plugin.installed` filter slug=`enhance_cp` → invoca `EnhanceDnsDefaultsService.applyClusterNameservers(...)` con el valor actual del setting `provisioning.default_nameservers`.
> - El listener propaga los `ns1/ns2.aelium.net` al cluster Enhance vía `POST /v2/settings/dns/default-records`. Idempotente: añade los faltantes, preserva existentes, reporta stale legacy SIN borrar (degradación elegante R7+R13).
> - Si Enhance API falla → log warning + breaker eventualmente abre. El cron L3 reintentará en la próxima ventana.

### 2.2. Seed dev/QA (`pnpm seed`)

Para skip-friendly DX en desarrollo + staging hay un seed condicional [`backend/prisma/seeds/sample-enhance-plugin-install.ts`](../../../backend/prisma/seeds/sample-enhance-plugin-install.ts) que pre-crea el `plugin_installs` row si **las 3 env vars dev están completas**:

```bash
ENHANCE_DEV_BASE_URL=https://enhance.lab.aelium.net
ENHANCE_DEV_MASTER_ORG_ID=<UUID del Master Org Aelium en Enhance>
ENHANCE_DEV_API_TOKEN=<Super Admin token revocable>
```

Si alguna falta → log info + skip silencioso (no crea fila `enabled=false` vacía — anti-patrón confunde al admin viendo `/admin/settings/plugins`).

Guard `NODE_ENV === 'production'` → skip incondicional. Producción configura el plugin desde la UI admin (los secrets en archivos de configuración del proceso violan la regla canónica).

Idempotente: si la fila YA existe (admin la configuró desde UI o seed previo), preserva la configuración del admin (admin config wins sobre env vars del seed).

### 2.3. Modelo Producto Aelium ↔ Plan Enhance (relación N:1)

> Pregunta canónica: "Si Enhance tiene 3 planes (Web Starter / Pro / Premium), ¿debo tener 3 productos en Aelium o 1?". **3 productos** — uno por plan que quieras ofrecer al cliente.

| Concepto | Donde vive | Quién lo crea | Qué representa |
|---|---|---|---|
| **Plan Enhance** | Cluster Enhance (Master Org) | Admin Aelium en Enhance UI | Recurso técnico: cuotas (disco, RAM, bandwidth, websites máximos), políticas (backups, SSL, etc.). Single source of truth. |
| **Producto Aelium** | Aelium DB (`products` table) | Admin Aelium en `/admin/products` | Oferta comercial: nombre, precio, ciclo facturación, descripción visible al cliente, addons. Apunta a UN plan Enhance via `provisioner_config.enhance_plan_id`. |
| **Subscription** | Cluster Enhance | El plugin al provisionar | Instancia del plan asignada a un customer Enhance (que mapea 1:1 a User Aelium). |
| **Service** | Aelium DB (`services` table) | El orquestador al provisionar | Vínculo entre cliente Aelium ↔ Subscription Enhance. `service.metadata.enhance_plan_id` cachea el planId actual para reconciliación. |

**Sincronización en operación:**

- **Catálogo** — admin manualmente: si Enhance añade un plan nuevo "Web Enterprise", admin debe crear el producto Aelium correspondiente con `enhance_plan_id` apuntando a ese plan. NO hay sync automático catálogo Enhance → catálogo Aelium en v1 (deuda DC.NEW-15C-CATALOG-SYNC, futuro).
- **Subscription change runtime** — automático: si admin invoca `change_package` desde `/admin/services/[id]` modal, el plugin hace `PATCH /orgs/.../subscriptions/:id` con `planId` nuevo, Enhance ajusta cuotas, y `service.metadata.enhance_plan_id` se actualiza para que el cron L3 NO emita `plan_divergence` false-positive.
- **Drift detection** — cron L3 cada 6h: si `Subscription.planId` en Enhance ≠ `service.metadata.enhance_plan_id` (alguien cambió el plan en Enhance UI bypasseando Aelium), emite `service.reconciled_external_change` con `change_type='plan_divergence'`. NO auto-corrige (billing implication).

**Recomendación operativa:**

- Crear un producto Aelium por cada plan Enhance que quieras ofrecer comercialmente.
- Si tienes 3 planes en Enhance pero solo quieres ofrecer 2 al público, crea solo 2 productos Aelium.
- El campo `enhance_plan_id` del producto se rellena con el ID numérico del plan visto en Enhance UI (ej. `1`, `2`, `3`).
- El dropdown del modal admin `change_package` consume `list_available_plans` que pregunta a Enhance los planes existentes — siempre actualizado, no requiere sync manual.

---

### 2.4. Crear productos enhance_cp con `provisioner_config`

Al crear un producto admin con `provisioner: 'enhance_cp'`:

1. Entrar en **Products → New** (`/admin/products/new`).
2. Seleccionar tipo **hosting_web**.
3. En el dropdown **Provisioner**, elegir **Hosting Enhance** (el label se traduce desde `plugin.enhance_cp.label` vía [translator local Aelium](../../../frontend/app/_shared/i18n/translator.ts) — Sprint 15C Fase I).
4. El sub-form `provisioner_config` se renderiza dinámicamente vía `@rjsf/core` + el manifest `productConfigSchema` declarado por el plugin (ADR-080 Amendment B + ADR-083 Amendment A3):
   - `enhance_plan_id` (integer required) — ID numérico del plan en Enhance. Se obtiene desde Enhance UI (la lista canónica viven en Enhance, NO en Aelium — single source of truth ADR-083 §1).
5. Guardar producto. Cliente puede contratarlo desde `/store`.

---

## 3. Flujo provisioning end-to-end (cliente checkout → service activo)

> Materializa [ADR-083 §3 decisiones 9-15](../../10-decisions/adr-083-plugin-enhance-cp-specifics.md) — provision flow 6-step idempotente.

```
Cliente → POST /api/v1/checkout (con producto enhance_cp + dominio)
  ↓
BillingCheckoutService crea Service.status='pending' + Invoice.status='pending'
  ↓
Cliente paga (Stripe / transferencia / etc.) → invoice.paid emitido
  ↓
ProvisioningOrchestratorService.handleInvoicePaid (Sprint 11 Fase 11.B)
  ↓
Encola job en BullMQ provisioning-dispatch por cada service.id en invoice.items
  ↓
Worker invoca plugin.provision(service) → EnhancePlugin.provision (6 pasos):
   1. Lazy-create customer Enhance: search-by-email → 404 → POST customer + login + member
      (idempotente — si email ya existe en Enhance, 409 → mapea via tabla `enhance_customers`).
   2. Crear Subscription con planId del product.provisioner_config.
   3. Crear Website con el dominio del service.
   4. Configurar DNS zone — auto-poblada por Enhance con default records cluster-wide (NS).
   5. Persistir provider_reference + provisioner_data + metadata.enhance_plan_id en services.
   6. Listener `auto-config-dns-on-hosting-provisioned` propaga NS al registrador del dominio (defensivo).
  ↓
Orquestador llama markActive() → Service.status='active' + emite service.activated
  ↓
Listener Sprint 16 ClientLifecycleTaskCreatorListener si isFirstService → crea task lifecycle 48h SLA
```

Tiempo total típico: 8-15 segundos. Errores no-retriable emiten `service.provisioning_failed` y dejan el service en `failed`. Errores retriable (proveedor down, rate limit) reencolan automáticamente vía BullMQ con backoff exponencial.

---

## 4. Operaciones admin diarias

### 4.1. Cambiar plan de una suscripción (`change_package`)

Acción **admin-only** (ADR-077 Amendment A3 — flag `ServiceAction.adminOnly=true`). El backend wrapper rechaza con 403 si la invoca un cliente + emite `service.action_admin_only_violation` + audit fila (defense-in-depth).

UI canónica (Sprint 15C Fase 15C.J):

1. Entrar en `/admin/services/[id]` (admin services detail page).
2. En la card **Operaciones admin**, click **Cambiar plan…**.
3. El modal `ChangePackageModal` abre + invoca `executeAction('list_available_plans')` (helper interno hidden vía `INTERNAL_HELPER_SLUGS` blacklist en `ActionsBar` UI, pero invocable por API).
4. El dropdown se puebla con los planes canónicos del cluster Enhance (ej. Web Starter / Pro / Premium).
5. Seleccionar nuevo plan + click **Confirmar**.
6. Backend invoca `plugin.executeAction(slug='change_package', payload={planId})` → PATCH `/orgs/.../subscriptions/:id` en Enhance + actualiza `service.metadata.enhance_plan_id` (Sprint 15C Fase 15C.H bug fix — sin esto, el cron L3 emitiría `plan_divergence` false-positive eterno).
7. Audit fila `audit_change_log` con `action='service.action_executed'` + payload + cliente afectado.

### 4.2. Forzar resync ad-hoc (`force_resync`)

Cuando el admin sospecha drift fuera de la ventana de 6h del cron L3 (ej. cliente reportó que el panel Enhance no levanta + crees que la subscription puede haber sido borrada por error):

1. `/admin/services/[id]` → card **Operaciones admin** → **Forzar resync**.
2. Backend invoca `plugin.executeAction('force_resync')` → mismo pipeline que el cron L3 (`reconcileService`) pero **single-shot** sobre este service. Detecta los 3 sub-tipos drift (subscription_missing / status_divergence / plan_divergence) y emite `service.reconciled_external_change` si encuentra.

### 4.3. SSO impersonation al panel cliente

> [Sprint 15C Fase 15C.F](../../10-decisions/adr-083-plugin-enhance-cp-specifics.md#amendment-a2-2026-05-09--predicado-canónico-cliente_id--user_id) + [§13.AUTH](../../60-roadmap/completed/sprint-13-auth-cookies-httponly.md) Modelo A.

Un admin/agente abriendo el panel Enhance de un service que NO le pertenece:

1. `/admin/services/[id]` → click **Abrir panel Enhance** (label viene de `plugin.enhance_cp.panel_label` traducido).
2. Backend wrapper `getSsoUrlWithAudit` detecta predicado canónico `actorIsAdmin && service.user_id !== actorUserId` → emite **DOS** eventos:
   - `service.sso_opened` (técnica, todos los SSO).
   - `service.admin_sso_impersonation` (GDPR-flagged, solo cuando admin abre service de otro user).
3. `AuditAdminSsoImpersonationListener` (`modules/audit/`) persiste en `audit_access_log` con `action='admin_sso_impersonation'` + `metadata.target_user_id = service.user_id`.
4. **Cliente lo ve en `/dashboard/transparency`** — la constante canónica `TRANSPARENCY_VISIBLE_ACTIONS = ['read', 'admin_sso_impersonation']` reemplazó el filter por action única para incluir la nueva acción RGPD-visible.

Si el admin abre el SSO de SU PROPIO service → solo `service.sso_opened` (no impersonation). Mismo flujo que cualquier cliente.

### 4.4. Gestión DNS records (cliente y admin)

UI cliente: `/dashboard/services/[id]/dns` (Sprint 15C Fase 15C.G).
- 9 tipos canónicos soportados: A, AAAA, CNAME, TXT, SPF, SRV, NS, MX, CAA.
- Bloqueo cliente: `delete_dns_record` confirmation obligatoria (`ServiceAction.confirmRequired`).
- DNS gestionado externamente (`authority='external'` desde `dns-authority-resolver.ts`) → endpoint devuelve 404 con shape `DnsExternallyManagedError` + frontend muestra `DnsExternallyBanner`.

Endpoints admin paralelos (`/api/v1/admin/services/:id/dns/records*`) operan con permission `Subject.Service` admin pero igual al cliente — el SC parent decide qué UI mostrar según role.

---

## 5. Reconciliación L3 + alertas threshold

> [ADR-083 §6 decisiones 22-24](../../10-decisions/adr-083-plugin-enhance-cp-specifics.md) + Sprint 15C Fase 15C.H.

El cron `EnhanceReconciliationCron` (`@Cron(EVERY_6_HOURS)` estático in-process — patrón canónico consistente con `AuditRetentionCron`/`NotificationsRetentionCron`, **NO BullMQ scheduled**) escanea cada 6h todos los services con:

```
provisioner_slug = 'enhance_cp' AND status IN ('active', 'suspended')
```

Por cada service hace `api.getSubscription` directo via `plugin.getApiClient()` (acoplamiento plugin-internal aceptable — el cron vive **dentro** del módulo Enhance).

3 sub-tipos drift mutuamente excluyentes por pasada:

| Sub-tipo | Detección | Acción Aelium |
|---|---|---|
| `subscription_missing` | 404 Enhance | Emit `service.reconciled_external_change` + log warn. **NO modifica `Service.status`** (DH-INV-6 ADR-082 + el enum Prisma no tiene `unknown`). Admin investiga manualmente. |
| `status_divergence` | Enhance status ≠ Aelium status | Emit + adopta **automáticamente** (`active`↔`suspended`) o emit-only fuera del set safe-adopt (cancelled/expired/failed) preservando flujo billing — A2 doctrina Fase H. |
| `plan_divergence` | `Subscription.planId ≠ service.metadata.enhance_plan_id` | Emit + NO auto-corrige (billing implication). Compara contra **`service.metadata.enhance_plan_id`** (snapshot por-servicio) NO contra `Product.provisioner_config` (catálogo) — A4 doctrina, evita false-positives tras change_package admin o cambio default catálogo. |

Listeners cableados:

- `AuditOnServiceReconciledExternalChangeListener` (`modules/audit/`) — persiste en `audit_change_log` con `user_id=null` (sistema) + `_meta.gdpr_visible_to_data_subject` discriminado per change_type.
- `NotificationsOnReconciliationThresholdExceededListener` (`modules/notifications/listeners/`) — SQL count `+1` race-tolerant sobre `audit_change_log` últimas 24h vs setting `provisioning.enhance_cp.reconciliation_alert_threshold` (default `5`). Si supera → `dispatchToSuperadmins('enhance.reconciliation_threshold_exceeded')` + dedupe via setting interno NUEVO `enhance_cp.reconciliation_last_alert_at` (ventana 24h, upsert directo Prisma).

> Para overrides operativos (subir threshold por cliente con muchos drift legítimos), editar el setting `provisioning.enhance_cp.reconciliation_alert_threshold` desde `/admin/settings`. Cambio toma efecto inmediato — el listener relee setting cada notificación.

---

## 6. Smoke manual contra Enhance live (1-2h Yasmin)

> Script reproducible para validar shapes reales contra orchd v12.21.3 antes de promote a producción. Cuando Enhance suba versión, re-correr este checklist y reportar drifts.

### 6.1. Pre-condiciones

```bash
# .env.local del backend (NO commit)
ENHANCE_DEV_BASE_URL=https://enhance.lab.aelium.net
ENHANCE_DEV_MASTER_ORG_ID=<UUID Master Org real>
ENHANCE_DEV_API_TOKEN=<Super Admin token live, revocable>
ENCRYPTION_KEY=<openssl rand -hex 32>  # 64 hex chars exactos
```

```bash
# Servicios up
docker compose -f docker/docker-compose.yml up -d postgres redis mailpit
pnpm --dir backend prisma migrate deploy
pnpm --dir backend run seed   # crea plugin_install enhance_cp si las 3 env vars están
pnpm --dir backend start:dev  # backend en :3001
pnpm --dir frontend start:dev # frontend en :3002
```

### 6.2. Checklist literal

| # | Paso | Resultado esperado |
|---|---|---|
| 1 | Login `admin@aelium.net / AeliumDev2026!` (con código 2FA del mailpit) | Cookie httpOnly seteada + redirect `/admin` |
| 2 | `/admin/settings/plugins/enhance_cp` | Card visible con label "Hosting Enhance" (NO la key cruda — verifica i18n Sprint 15C Fase I) |
| 3 | Click **Probar conexión** | "Conexión OK" verde + version Enhance reportada |
| 4 | `/admin/products/new` → crear producto enhance_cp con `enhance_plan_id=<plan real>` | Producto creado + visible en `/admin/products` |
| 5 | Cliente `/store` → contratar el producto + dominio `e2e-test.aelium.net` | Service `pending` creado + invoice `pending` |
| 6 | Marcar invoice como pagada (admin `/admin/billing/[id]/mark-paid`) | Service queda `active` en máx ~10s + email notificación al cliente |
| 7 | Verificar en Enhance UI que existen: customer + login + member + subscription + website | Recursos creados con shapes canónicos |
| 8 | Cliente `/dashboard/services/[id]` | Render N botones (filtrados adminOnly + INTERNAL_HELPER_SLUGS). Click `view_disk_usage` → métricas visibles |
| 9 | Cliente click `change_package` (NO debería verse) | Botón **ausente** en UI cliente. Si bypass via curl → 403 + audit fila `service.action_admin_only_violation` |
| 10 | Admin `/admin/services/[id]` → click **Cambiar plan…** | Modal abre + dropdown poblado con planes Enhance reales. Submit con plan distinto → 200 + `service.metadata.enhance_plan_id` actualizado |
| 11 | Cliente `/dashboard/services/[id]/dns` → crear record A apex `203.0.113.10` | 200 + record visible en lista. Verifica en Enhance UI que existe en la zona |
| 12 | Admin `/admin/services/[id]` → **Abrir panel Enhance** (siendo distinto al owner) | URL SSO se abre en nueva pestaña + cliente lo ve en `/dashboard/transparency` ("admin abrió tu panel Enhance") |
| 13 | Trigger manual del cron L3 (vía REST admin `POST /api/v1/admin/cron/enhance-reconciliation` o esperar 6h) | Si NO hay drift: log "no drift detected". Si drift forzado (ej. cambiar plan en Enhance UI sin pasar por Aelium): emite `service.reconciled_external_change` con `change_type='plan_divergence'` |
| 14 | Forzar 6+ drifts en 24h (escenario stress) | Listener notif: superadmin recibe email "enhance.reconciliation_threshold_exceeded" + dedupe 24h |

### 6.3. Reportar drift contra dossier

Si algún paso devuelve un shape distinto al esperado, abrir issue `[plugin-enhance] drift contra orchd v<version>` con:
- Versión orchd reportada por GET /version.
- Shape esperado vs shape real (diff).
- Endpoint exacto + payload + headers.
- Decision recomendada: ¿adapter en `EnhanceApiClient` o reverse en plugin?

---

## 7. Troubleshooting común

### `PROVIDER_RATE_LIMITED` (Enhance API 429)

El cliente HTTP `EnhanceApiClient` ya implementa backoff exponencial + jitter (Sprint 15C Fase B). Si supera el threshold del breaker (5 fallos en 60s) → `plugin.circuit_opened` + notif superadmin + circuito reset cada 30s.

**Acción**: revisar logs Enhance + reducir frecuencia operativa hasta que normalice. El cron L3 reintentará automáticamente al normalizar.

### Cron L3 reportando `plan_divergence` false-positive

Causa típica: admin cambió plan en Enhance UI (NO via Aelium `change_package`) → `Subscription.planId` en Enhance ≠ `service.metadata.enhance_plan_id`.

**Acción**:
1. Decidir si el cambio Enhance es legítimo (forzar resync alinea Aelium → Enhance) o erróneo (revertir en Enhance).
2. Si legítimo: ejecutar `force_resync` admin (Sprint 15C Fase E action) → backend ejecuta `actionForceResync` que actualiza `service.metadata.enhance_plan_id` con el valor Enhance + emite `service.reconciled_external_change`.

### Provision falla con `ENHANCE_CUSTOMER_DUPLICATE`

Email del cliente ya tiene un customer Enhance bajo OTRO Master Org. El plugin `searchCustomersByEmail` solo busca dentro del Master Org configurado → no encuentra → POST → 409 idempotency.

**Acción**: investigar manualmente en Enhance UI. Si el customer es de Aelium pero estaba en Master Org legacy, migrar manualmente. Si es de otra organización Aelium-side, decidir si crear con email distinto (no implementado v1) o transferir.

---

## 8. Estado canónico de funcionalidades (post smoke 2026-05-10)

> ⚠ **Sprint 15C cerrado al 90%** — el smoke real Yasmin contra mock 2026-05-10 reveló 18 issues que requieren un sub-sprint de hardening dedicado antes de promote a producción. Ver dossier canónico [`sprint-15c-ii-hardening-enhance-dossier.md`](../../60-roadmap/sprint-15c-ii-hardening-enhance-dossier.md).
>
> **Compromiso doctrinal Yasmin (2026-05-10 literal)**: "no se da un paso más, hasta que el plugin esté al 100% operativo con los features básicos y necesarios perfectos para producción." → Sprint 15D ResellerClub bloqueado hasta cierre 15C.II.

### 8.1. Plenamente implementado y verificado

| Capa | Componente | Estado |
|---|---|---|
| Backend plugin | `provision()` 6-step idempotente con lazy customer | ✅ verificado smoke real (post fix `$queryRaw`→`$executeRaw` Fase I) |
| Backend plugin | `getStatus()` con métricas reales del cluster | ✅ |
| Backend plugin | `getServiceInfo()` con `availableActions` filtradas + capabilities | ✅ |
| Backend plugin | `getSsoUrl()` con audit GDPR `service.admin_sso_impersonation` | ✅ |
| Backend plugin | `executeAction('change_package')` + actualiza `metadata.enhance_plan_id` | ✅ |
| Backend plugin | `executeAction('force_resync')` invalidando cache 60s | ✅ |
| Backend plugin | `executeAction('list_available_plans')` (helper modal) | ✅ |
| Backend plugin | `executeAction('reset_account_password')` rota password en Enhance | ⚠ **rota OK pero NO envía email al cliente** (deuda DC.NEW-15C-EMAIL-RESET) |
| Backend plugin | `executeAction('view_disk_usage'/'view_bandwidth_usage')` retorna `data` con métricas | ⚠ **funciona pero UX feedback muestra solo "Acción completada" sin renderizar `data`** (deuda DC.NEW-15C-METRICS-MODAL) |
| Backend orquestador | Reconciliación L3 cron `EVERY_6_HOURS` con 3 sub-tipos drift | ✅ |
| Backend audit | Listener `AuditAdminSsoImpersonation` + portal transparency | ✅ |
| Backend notif | Listener `NotificationsOnReconciliationThresholdExceeded` (default 5 drifts/24h) | ✅ |
| Frontend cliente | Service detail (`/dashboard/services/[id]`) header + métricas + SSO | ✅ |
| Frontend cliente | DNS records UI completa (`/dashboard/services/[id]/dns`) — list/add/update/delete con 9 kinds | ✅ verificado smoke real |
| Frontend cliente | Portal transparency lista impersonations admin | ✅ |
| Frontend admin | Service detail (`/admin/services/[id]`) con sección "Datos del servicio (admin)" + "Operaciones admin" | ✅ |
| Frontend admin | `ChangePackageModal` + dropdown poblado con `list_available_plans` | ✅ |
| Frontend admin | Plugin install `/admin/settings/plugins/enhance-cp` con form rjsf + secrets | ✅ |
| Frontend admin | Producto admin con sub-form `provisioner_config` rjsf | ✅ |
| Frontend i18n | Translator local ES — manifest labels + descriptions schema + action errors wrapper | ✅ post Fase I |

### 8.2. UX subóptima reconocida (no bloqueante)

| Componente | Comportamiento actual | Comportamiento óptimo (sub-sprint futuro) |
|---|---|---|
| `view_disk_usage` / `view_bandwidth_usage` desde `ActionsBar` | Toast "Acción 'view_disk_usage' completada." Las métricas reales ya viven en `MetricsBar` arriba (cliente + admin). Las acciones inline son redundantes. | Modal con render formateado del `result.data` (disco/bandwidth detallado por mes). Alt: sustituir por botón "Refrescar métricas" que solo invalide cache 60s. |
| `reset_account_password` | Rota password en Enhance + retorna `success`. Cliente NO recibe email automático con la nueva password. | Listener `notifications-on-password-reset` que envía template seedeado al cliente. |
| `add_dns_record` / `update_dns_record` / `delete_dns_record` / `list_dns_records` desde `ActionsBar` | Antes Fase I: botones standalone que fallaban con `INVALID_PAYLOAD`. **Post Fase I: ocultos vía `INTERNAL_HELPER_SLUGS` blacklist** — DNS se gestiona desde `/dashboard/services/[id]/dns` (UI canónica Fase G). | Mantener oculto. Si se quiere acción rápida "Refrescar DNS records", añadir slug nuevo `refresh_dns_zone` (sin payload, refresh-only). |
| Service detail admin sección "Gestión DNS" | Banner "abre el panel del proveedor — la UI admin nativa llegará en un sprint futuro". | UI admin nativa paralela a `/dashboard/services/[id]/dns` reusando endpoints `/admin/services/:id/dns/records*`. |

### 8.3. NO implementado en v1 — deudas conscientes

(Ver `completed/sprint-15c-plugin-enhance-cp.md` §"Deuda diferida v1+" para listado completo + razón. Resumen): DNSSEC, EMAIL/DB CRUD admin, importers cPanel/Plesk, sub-resellers, métricas time-series, EN locale i18n, sync catálogo Enhance↔Aelium automático, render metrics modal admin, email reset_password.

### 8.4. Issues smoke 2026-05-10 — 18 items inventario completo

> **Fuente**: smoke real Yasmin contra mock + análisis riguroso UI_SPEC §4.3. Detalle exhaustivo en [`sprint-15c-ii-hardening-enhance-dossier.md`](../../60-roadmap/sprint-15c-ii-hardening-enhance-dossier.md) §2 + §3.

**Categoría A — Bugs reales (3)**
- ✅ BUG-15CII-1 `$queryRaw → $executeRaw` advisory lock (fix in branch)
- ✅ BUG-15CII-2 `AdminPluginUpdateDto` rechaza config+secrets (fix in branch)
- ⏳ BUG-15CII-3 services pending indefinidos cuando plugin disabled (UX alerta admin)

**Categoría B — UI_SPEC §4.3 violaciones (3)**
- ✅ BUG-15CII-4 `ActionsBar` inline → `useToast()` (fix in branch)
- ✅ BUG-15CII-5 `SsoButton` inline → `useToast()` (fix in branch)
- ⏳ BUG-15CII-6 `MetricsBar` sin botón refresh — decisión doctrinal pendiente §3.1

**Categoría C — Mensajes engañosos (3)**
- ✅ BUG-15CII-7 reset_password "recibirá email" mensaje honesto (fix in branch)
- ✅ BUG-15CII-8 4 DNS actions ocultas via INTERNAL_HELPER_SLUGS (fix in branch)
- ⏳ BUG-15CII-9 `subscription not found` crudo en cliente — UX discriminada por rol §3.3

**Categoría D — UX redundante (2)**
- ✅ BUG-15CII-10 `view_disk/bandwidth_usage` adminOnly (fix in branch) — pero decisión §3.1 puede eliminarlas
- ✅ BUG-15CII-11 `force_resync` description tooltip (fix parcial in branch) — naming "Reconciliar contra Enhance" §3.2

**Categoría E — i18n parcial (3)**
- ✅ BUG-15CII-12 `translateSchema()` walk-recursive aplicado (fix in branch, requiere verificación cache-clean)
- ⏳ BUG-15CII-13 5 actions sin `description` i18n (force/view ✅ post Fase I — pendientes reset_password + change_package)
- ⏳ BUG-15CII-14 `statusReason` técnico cliente NO traducido + cliente NO debería verlo

**Categoría F — Funcionalidades NO implementadas (4)**
- ⏳ DC.NEW-15CII-EMAIL-RESET listener notif tras reset_password
- ⏳ DC.NEW-15CII-DNS-ADMIN-UI página admin nativa DNS
- ⏳ DC.NEW-15CII-METRICS-MODAL render data formateado modal admin (alternativa: §3.1 elimina las actions)
- ⏳ DC.NEW-15CII-CATALOG-SYNC sync catálogo Enhance↔Aelium

### 8.5. Decisiones doctrinales pendientes (4)

Documentadas exhaustivamente en [`sprint-15c-ii-hardening-enhance-dossier.md` §3](../../60-roadmap/sprint-15c-ii-hardening-enhance-dossier.md#3-decisiones-doctrinales-pendientes-no-resueltas-en-sprint-15c-original):

1. **§3.1 Refresh metrics pattern** — ¿spinner inline o action separada? Recomendación canónica: eliminar 2 actions + botón "↻" en MetricsBar (estándar profesional Stripe/Vercel).
2. **§3.2 Reconcile general vs servicio** — ¿per-servicio, general del plugin, o ambos? Recomendación: dual entry point + naming "Reconciliar contra Enhance".
3. **§3.3 Drift UX discriminada por rol** — cliente NUNCA ve mensajes técnicos; admin AlertBanner con CTA SSO investigación.
4. **§3.4 Admin overview operativo** — ¿añadir dashboard estadístico al `/admin/settings/plugins/enhance-cp` ahora o diferir a Sprint 12?

---

## 9. Deudas conocidas + futuro

Lista canónica de DCs en [`docs/60-roadmap/completed/sprint-15c-plugin-enhance-cp.md`](../../60-roadmap/completed/sprint-15c-plugin-enhance-cp.md) §"Deuda diferida v1+". Resumen:

- **DC.NEW-15C-1** UI cliente `change_package` cuando cierre sub-sprint billing prorrateo cross-plan.
- **DC.NEW-15C-i18n** EN locale + provider real (`next-intl` o equivalente) cuando llegue cliente angloparlante.
- **DC.NEW-15C-DNSSEC** DNSSEC enable/disable + DS records v1.1.
- **DC.NEW-15C-EMAIL** + **DC.NEW-15C-DB** CRUD email accounts + databases admin v1.1 (NUNCA cliente).
- E2E DNS UI cliente + SSO impersonation full flow — diferidos a smoke manual + unit tests por complejidad infra Playwright.

---

## 10. Referencias canónicas

- [ADR-082 Modelo Domain↔Hosting + DNS doctrine (transversal)](../../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md) — 6 invariantes DH-INV-1..6 + 4 flujos checkout + 3 capas NS sync.
- [ADR-083 Plugin Enhance CP specifics](../../10-decisions/adr-083-plugin-enhance-cp-specifics.md) — 35 decisiones frozen.
- [ADR-080 Plugin Framework](../../10-decisions/adr-080-plugin-framework.md) — manifest declarativo + vault + breaker (heredado Sprint 15A).
- [ADR-077 Contrato `ProvisionerPlugin` v2](../../10-decisions/adr-077-contrato-provisioner-plugin-v2.md) — 6 métodos + 8 capability flags + Amendment A3 `ServiceAction.adminOnly`.
- [`docs/features/provisioning/admin-plugins.md`](./admin-plugins.md) — operativa framework genérica de plugins (lifecycle común).
- [`docs/20-modules/_events.md` §service.* + §plugin.*](../../20-modules/_events.md) — eventos canónicos.
- [`docs/_research/sprint-15c/orchd-oas3-api.yaml`](../../_research/sprint-15c/orchd-oas3-api.yaml) — spec literal Enhance v12.21.3 (588 KB, 280 paths).
- [Spec E2E](../../../tests/e2e/sprint-15c-enhance-flow.spec.ts) — 6 escenarios cubriendo plugin install + filter adminOnly + audit + 403 + change_package admin.
