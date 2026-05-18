/**
 * Sprint 15C Fase 15C.B — `EnhanceApiClient` high-level.
 *
 * Cubre TODOS los endpoints que las Fases 15C.C-H necesitarán:
 *   - Fase C plugin core: provision flow 6-step + SSO + getServiceInfo + reconcile.
 *   - Fase D listeners DNS: bootstrap default records + reconcile defensivo.
 *   - Fase E acciones curadas: reset_account_password + recalculate_provider_metrics
 *     (renombrada desde `force_resync` en Sprint 15C.II Fase E — Amendment A5.1).
 *   - Fase F SSO: cliente + admin impersonation.
 *   - Fase G UI DNS: zone CRUD + records CRUD.
 *   - Fase H reconcile cron: getSubscription + getWebsite drift detection.
 *
 * Doctrina (R4 + ADR-077 §5):
 *   - El cliente NO toca Redis, EventEmitter ni AuditService — eso vive
 *     en los wrappers `core/provisioning/plugin-utils.ts`. Aquí solo
 *     llamadas HTTP tipadas.
 *   - Cada método devuelve el shape canónico del spec
 *     (`types.ts`) o lanza `ProvisionerPluginError` con código semántico.
 *   - Idempotencia se delega al plugin: el cliente NO interpreta 409
 *     conflict como éxito automático — devuelve `INVALID_STATE` y el plugin
 *     decide (típicamente: reintentar con `searchCustomersByEmail` para
 *     recuperar el ID del recurso ya existente — ADR-083 §2 decisión 8).
 *
 * Mapping endpoint → método:
 *
 *   System / probe:
 *     GET /version                                          → getVersion
 *     GET /orgs/{orgId}                                     → getOrg
 *
 *   Customers (Fase C provision flow step 1 + lazy create):
 *     POST /orgs/{master}/customers                         → createCustomer
 *     GET /orgs/{master}/customers?search={email}           → searchCustomersByEmail
 *
 *   Logins (Fase C step 2 + Fase E reset password):
 *     POST /logins?orgId={org}                              → createLogin
 *     PUT /v2/logins/{loginId}/password                     → resetLoginPassword
 *
 *   Members (Fase C steps 3-4 + Fase F SSO):
 *     POST /orgs/{org}/members                              → addMember
 *     PUT /orgs/{org}/owner                                 → setOwner
 *     GET /orgs/{org}/members/{memberId}/sso                → getMemberSsoOtpUrl
 *
 *   Subscriptions (Fase C step 5 + Fase E + Fase H reconcile):
 *     POST /orgs/{master}/customers/{cust}/subscriptions    → createSubscription
 *     GET /orgs/{org}/subscriptions/{id}                    → getSubscription
 *     PATCH /orgs/{org}/subscriptions/{id}                  → patchSubscription
 *     DELETE /orgs/{org}/subscriptions/{id}                 → deleteSubscription
 *     GET /orgs/{org}/subscriptions/{id}/bandwidth          → getSubscriptionBandwidth
 *     PUT /orgs/{org}/subscriptions/{id}/calculate-resource-usage
 *                                                           → calculateResourceUsage
 *
 *   Websites (Fase C step 6 + Fase H reconcile):
 *     POST /orgs/{org}/websites                             → createWebsite
 *     GET /orgs/{org}/websites/{wsId}                       → getWebsite
 *     PATCH /orgs/{org}/websites/{wsId}                     → patchWebsite
 *     DELETE /orgs/{org}/websites/{wsId}                    → deleteWebsite
 *
 *   DNS records per-zone (Fase G UI):
 *     GET /orgs/{org}/websites/{ws}/domains/{dom}/dns-zone  → getDnsZone
 *     POST .../dns-zone/records                             → addDnsRecord
 *     PATCH .../dns-zone/records/{id}                       → updateDnsRecord
 *     DELETE .../dns-zone/records/{id}                      → deleteDnsRecord
 *
 *   Default DNS records cluster-wide (Fase D bootstrap + sync):
 *     GET /v2/settings/dns/default-records                  → listDefaultDnsRecords
 *     POST /v2/settings/dns/default-records                 → addDefaultDnsRecord
 *     PATCH /v2/settings/dns/default-records/{id}           → updateDefaultDnsRecord
 *     DELETE /v2/settings/dns/default-records/{id}          → deleteDefaultDnsRecord
 */

import { Logger } from '@nestjs/common';

import { ProvisionerPluginError } from '../../../../core/provisioning/types';
import { EnhanceHttpClient, EnhanceHttpClientConfig } from './http-client';
import {
  CustomerOrgId,
  DefaultDnsRecordId,
  DnsRecordId,
  EnhanceBandwidth,
  EnhanceCreatedRef,
  EnhanceCustomersListing,
  EnhanceDefaultDnsRecord,
  EnhanceDnsZone,
  EnhanceDomainSslCert,
  EnhanceLoginCreated,
  EnhanceLoginInfo,
  EnhanceMember,
  EnhanceNewCustomer,
  EnhanceNewDefaultDnsRecord,
  EnhanceNewDnsRecord,
  EnhanceNewMember,
  EnhanceNewPassword,
  EnhanceNewSubscription,
  EnhanceNewWebsite,
  EnhanceOrg,
  EnhanceOrgOwnerUpdate,
  EnhancePlansListing,
  EnhanceSsoOtpUrl,
  EnhanceSubscription,
  EnhanceUpdateDefaultDnsRecord,
  EnhanceUpdateDnsRecord,
  EnhanceUpdateSubscription,
  EnhanceUpdateWebsite,
  EnhanceUsedResourcesFullListing,
  EnhanceVersionResponse,
  EnhanceWebsite,
  EnhanceWebsiteAppsFullListing,
  EnhanceWordPressInfo,
  EnhanceWpUser,
  EnhanceWordpressUserSsoUrl,
  EnhanceJoomlaInfo,
  LoginId,
  MasterOrgId,
  MemberId,
  SubscriptionId,
  WebsiteId,
} from './types';

/**
 * Cliente Enhance API canónico. Una instancia por boot del plugin —
 * inyectado por el `PluginRegistryService` cuando el plugin enhance_cp
 * pasa contract validation + está enabled en `plugin_installs`.
 */
export class EnhanceApiClient {
  private readonly logger = new Logger(EnhanceApiClient.name);
  private readonly http: EnhanceHttpClient;

  constructor(config: EnhanceHttpClientConfig) {
    this.http = new EnhanceHttpClient(config);
  }

  // ─── 1. System / auth probe (Fase C onActivated + test-connection) ──────

  /**
   * GET /version (sin auth) — devuelve string SemVer plano.
   * Usado en test-connection (ADR-083 §1 decisión 5) como primer probe
   * de conectividad. Si responde 200, Enhance está vivo.
   */
  async getVersion(): Promise<EnhanceVersionResponse> {
    return this.http.get<EnhanceVersionResponse>('/version', {
      skipAuth: true,
    });
  }

  /**
   * GET /orgs/{orgId} — segundo probe del test-connection.
   * Valida que `masterOrgId` resuelve y que el token tiene permisos sobre
   * él. Si responde 200, auth + RBAC OK. Si 401/403, alerta admin.
   */
  async getOrg(orgId: CustomerOrgId): Promise<EnhanceOrg> {
    return this.http.get<EnhanceOrg>(`/orgs/${encodeURIComponent(orgId)}`);
  }

  // ─── 2. Customers (Fase C provision step 1 + lazy create idempotency) ───

  /**
   * POST /orgs/{master}/customers — crea un customer org sub-tenant.
   * Step 1 del provision flow 6-step (ADR-083 §3 decisión 10).
   *
   * Idempotencia sintética: si el customer ya existe (409 Conflict),
   * el plugin lo recupera con `searchCustomersByEmail` (decisión 8 step 2).
   * El cliente HTTP NO maneja 409 como éxito — devuelve INVALID_STATE.
   */
  async createCustomer(
    masterId: MasterOrgId,
    body: EnhanceNewCustomer,
  ): Promise<EnhanceCreatedRef<CustomerOrgId>> {
    return this.http.post<EnhanceCreatedRef<CustomerOrgId>>(
      `/orgs/${encodeURIComponent(masterId)}/customers`,
      body,
    );
  }

  /**
   * GET /orgs/{master}/customers?search={email} — busca customers por
   * email del owner. Defensivo cross-restart (ADR-083 §2 decisión 8 step 2).
   *
   * Si Enhance encuentra el customer, devuelve `items: [Org{...}]` con
   * `ownerId` + `ownerLoginId` pobladas — el plugin construye el mapping
   * `enhance_customers` directamente sin re-ejecutar el flow 6-step.
   */
  async searchCustomersByEmail(
    masterId: MasterOrgId,
    email: string,
  ): Promise<EnhanceCustomersListing> {
    return this.http.get<EnhanceCustomersListing>(
      `/orgs/${encodeURIComponent(masterId)}/customers`,
      { query: { search: email } },
    );
  }

  // ─── 3. Logins (Fase C step 2 + Fase E reset password) ──────────────────

  /**
   * POST /logins?orgId={org} — crea login del cliente en el realm Enhance.
   * Step 2 del provision flow. La password se genera Aelium-side con
   * `crypto.randomUUID()` y NO se persiste — el cliente la cambia desde
   * Customer Panel via `reset_account_password` action.
   */
  async createLogin(
    orgId: CustomerOrgId,
    body: EnhanceLoginInfo,
  ): Promise<EnhanceLoginCreated> {
    return this.http.post<EnhanceLoginCreated>('/logins', body, {
      query: { orgId },
    });
  }

  /**
   * PUT /v2/logins/{loginId}/password — resetea la password del owner.
   * Acción curada `reset_account_password` (ADR-083 §9 decisión 32).
   * El plugin genera la nueva password Aelium-side y la entrega al cliente
   * por email seguro (Sprint 15C Fase E).
   */
  async resetLoginPassword(
    loginId: LoginId,
    body: EnhanceNewPassword,
  ): Promise<void> {
    await this.http.put<void>(
      `/v2/logins/${encodeURIComponent(loginId)}/password`,
      body,
    );
  }

  // ─── 4. Members (Fase C steps 3-4 + Fase F SSO 2-call) ──────────────────

  /**
   * POST /orgs/{org}/members — vincula login al customer org como member.
   * Step 3 del provision flow. Body `{ loginId, roles: ['Owner'] }`.
   */
  async addMember(
    orgId: CustomerOrgId,
    body: EnhanceNewMember,
  ): Promise<EnhanceCreatedRef<MemberId>> {
    return this.http.post<EnhanceCreatedRef<MemberId>>(
      `/orgs/${encodeURIComponent(orgId)}/members`,
      body,
    );
  }

  /**
   * PUT /orgs/{org}/owner — promueve al member al rol de Owner del org.
   * Step 4 del provision flow.
   */
  async setOwner(
    orgId: CustomerOrgId,
    body: EnhanceOrgOwnerUpdate,
  ): Promise<void> {
    await this.http.put<void>(`/orgs/${encodeURIComponent(orgId)}/owner`, body);
  }

  /**
   * GET /orgs/{org}/members/{memberId} — útil para reconcile cuando la
   * `enhance_owner_member_id` cacheada en `enhance_customers` puede haber
   * cambiado (ej. admin promovió otro Owner desde panel).
   */
  async getMember(
    orgId: CustomerOrgId,
    memberId: MemberId,
  ): Promise<EnhanceMember> {
    return this.http.get<EnhanceMember>(
      `/orgs/${encodeURIComponent(orgId)}/members/${encodeURIComponent(memberId)}`,
    );
  }

  /**
   * GET /orgs/{org}/members/{memberId}/sso — devuelve OTP URL single-use.
   * Step 2 del SSO 2-call flow (ADR-083 §4 decisión 13).
   *
   * El plugin redirige el browser cliente al string devuelto. El TTL del
   * OTP es corto (gestionado por Enhance) — el plugin NUNCA lo cachea.
   */
  async getMemberSsoOtpUrl(
    orgId: CustomerOrgId,
    memberId: MemberId,
  ): Promise<EnhanceSsoOtpUrl> {
    return this.http.get<EnhanceSsoOtpUrl>(
      `/orgs/${encodeURIComponent(orgId)}/members/${encodeURIComponent(memberId)}/sso`,
    );
  }

  // ─── 5. Subscriptions (Fase C step 5 + Fase H reconcile) ────────────────

  /**
   * POST /orgs/{master}/customers/{cust}/subscriptions — crea subscription
   * con el plan id del producto Aelium. Step 5 del provision flow.
   *
   * Devuelve `{ id: integer }` — el plugin lo serializa a string al
   * persistir en `services.provider_reference`.
   */
  async createSubscription(
    masterId: MasterOrgId,
    customerOrgId: CustomerOrgId,
    body: EnhanceNewSubscription,
  ): Promise<EnhanceCreatedRef<SubscriptionId>> {
    return this.http.post<EnhanceCreatedRef<SubscriptionId>>(
      `/orgs/${encodeURIComponent(masterId)}/customers/${encodeURIComponent(customerOrgId)}/subscriptions`,
      body,
    );
  }

  /**
   * GET /orgs/{org}/subscriptions/{id} — lectura puntual del estado real.
   * Usado por reconcile cron (ADR-083 §6 decisión 24) y por `getServiceInfo`
   * (cache 60s Redis L1).
   */
  async getSubscription(
    orgId: CustomerOrgId,
    subscriptionId: SubscriptionId,
  ): Promise<EnhanceSubscription> {
    return this.http.get<EnhanceSubscription>(
      `/orgs/${encodeURIComponent(orgId)}/subscriptions/${subscriptionId}`,
    );
  }

  /**
   * PATCH /orgs/{org}/subscriptions/{id} — suspend / unsuspend / change plan.
   * Acciones admin curadas (ADR-083 §1.G + §9 decisión 32):
   *   - `{ isSuspended: true }`  → suspend.
   *   - `{ isSuspended: false }` → unsuspend.
   *   - `{ planId: <new> }`      → change_package (admin only v1).
   */
  async patchSubscription(
    orgId: CustomerOrgId,
    subscriptionId: SubscriptionId,
    body: EnhanceUpdateSubscription,
  ): Promise<EnhanceSubscription> {
    return this.http.patch<EnhanceSubscription>(
      `/orgs/${encodeURIComponent(orgId)}/subscriptions/${subscriptionId}`,
      body,
    );
  }

  /**
   * DELETE /orgs/{org}/subscriptions/{id} — cancela subscription.
   * `force=true` admin-only (audit pesado — wipe completo).
   * Default: force=false (cancelación elegante con período de gracia
   * gestionado por Enhance internamente).
   */
  async deleteSubscription(
    orgId: CustomerOrgId,
    subscriptionId: SubscriptionId,
    options: { readonly force?: boolean } = {},
  ): Promise<void> {
    await this.http.delete<void>(
      `/orgs/${encodeURIComponent(orgId)}/subscriptions/${subscriptionId}`,
      options.force ? { query: { force: 'true' } } : undefined,
    );
  }

  /**
   * GET /orgs/{org}/subscriptions/{id}/bandwidth — métrica de uso de banda.
   * Enhance cachea internamente 12h; `?refreshCache=true` fuerza refresh.
   * El plugin lo usa con cache 60s Redis L1 (`getServiceInfoWithCache`).
   */
  async getSubscriptionBandwidth(
    orgId: CustomerOrgId,
    subscriptionId: SubscriptionId,
    options: { readonly refreshCache?: boolean } = {},
  ): Promise<EnhanceBandwidth> {
    return this.http.get<EnhanceBandwidth>(
      `/orgs/${encodeURIComponent(orgId)}/subscriptions/${subscriptionId}/bandwidth`,
      options.refreshCache ? { query: { refreshCache: 'true' } } : undefined,
    );
  }

  /**
   * PUT /orgs/{org}/subscriptions/{id}/calculate-resource-usage — pide a
   * Enhance que recalcule disco + ancho de banda de la subscription en su
   * lado. Backing de la acción admin `recalculate_provider_metrics`
   * (ADR-083 §9 decisión 32 + Amendment A5.1 — renombrada desde `force_resync`).
   */
  async calculateResourceUsage(
    orgId: CustomerOrgId,
    subscriptionId: SubscriptionId,
  ): Promise<EnhanceUsedResourcesFullListing> {
    return this.http.put<EnhanceUsedResourcesFullListing>(
      `/orgs/${encodeURIComponent(orgId)}/subscriptions/${subscriptionId}/calculate-resource-usage`,
    );
  }

  // ─── 5.5. Plans (Sprint 15C Fase 15C.E — ADR-083 Amendment A3) ──────────

  /**
   * GET /orgs/{org}/plans — lista planes Enhance disponibles bajo una
   * org (típicamente Master org Aelium). Spec line 5186, response
   * `PlansListing` (line 18488). Auth: bearer (público en spec pero el
   * cliente HTTP siempre añade Authorization header — coherencia).
   *
   * Consumido por el plugin (Fase 15C.E commit 4) en el case
   * `list_available_plans` de `executeAction`. Alimenta el dropdown
   * admin del modal `change_package` (ADR-083 §8 decisión 30 +
   * Amendment A3 — la 10ª inline action `list_available_plans` reemplaza
   * la rama `getServiceInfo admin variant` no implementada).
   *
   * Devuelve `PlansListing` completo (items + total) — el plugin
   * extrae `items` como subset display para el dropdown UI.
   */
  async listPlans(orgId: CustomerOrgId): Promise<EnhancePlansListing> {
    return this.http.get<EnhancePlansListing>(
      `/orgs/${encodeURIComponent(orgId)}/plans`,
    );
  }

  // ─── 6. Websites (Fase C step 6 + Fase H reconcile) ─────────────────────

  /**
   * POST /orgs/{org}/websites — crea website asociado a subscription.
   * Step 6 del provision flow. Body `{ domain, subscriptionId }`.
   */
  async createWebsite(
    orgId: CustomerOrgId,
    body: EnhanceNewWebsite,
  ): Promise<EnhanceCreatedRef<WebsiteId>> {
    return this.http.post<EnhanceCreatedRef<WebsiteId>>(
      `/orgs/${encodeURIComponent(orgId)}/websites`,
      body,
    );
  }

  /** GET /orgs/{org}/websites/{wsId} — usado por reconcile + getServiceInfo. */
  async getWebsite(
    orgId: CustomerOrgId,
    websiteId: WebsiteId,
  ): Promise<EnhanceWebsite> {
    return this.http.get<EnhanceWebsite>(
      `/orgs/${encodeURIComponent(orgId)}/websites/${encodeURIComponent(websiteId)}`,
    );
  }

  /**
   * PATCH /orgs/{org}/websites/{wsId} — suspend / unsuspend / move subscription.
   * Lo usa el orquestador via wrapper, no directo el plugin.
   */
  async patchWebsite(
    orgId: CustomerOrgId,
    websiteId: WebsiteId,
    body: EnhanceUpdateWebsite,
  ): Promise<EnhanceWebsite> {
    return this.http.patch<EnhanceWebsite>(
      `/orgs/${encodeURIComponent(orgId)}/websites/${encodeURIComponent(websiteId)}`,
      body,
    );
  }

  /** DELETE /orgs/{org}/websites/{wsId} — elimina website (cancelación granular). */
  async deleteWebsite(
    orgId: CustomerOrgId,
    websiteId: WebsiteId,
  ): Promise<void> {
    await this.http.delete<void>(
      `/orgs/${encodeURIComponent(orgId)}/websites/${encodeURIComponent(websiteId)}`,
    );
  }

  // ─── 6bis. Domains / SSL (Sprint 15C.II Fase F.7 — ADR-083 A8) ──────────

  /**
   * GET /v2/domains/{domain_id}/ssl — lee el cert SSL del dominio.
   *
   * Devuelve `null` si el endpoint responde 404 (no hay cert configurado
   * para el dominio — caso `ServiceSslStatus = 'none'`). Re-lanza
   * `ProvisionerPluginError` en otros errores (autenticación, red, 5xx)
   * para que el caller los capture en su rama best-effort y degrade a
   * `ssl: undefined`. Sin side-effects.
   *
   * Consumido por `getServiceInfo()` para poblar `ServiceInfo.ssl?`
   * ([ADR-077 Amendment A7](../../../../../docs/10-decisions/adr-077-contrato-provisioner-plugin-v2.md)).
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
      if (
        err instanceof ProvisionerPluginError &&
        err.code === 'INVALID_STATE'
      ) {
        return null;
      }
      throw err;
    }
  }

  // ─── 6ter. Apps CMS instaladas (Sprint 15C.II Fase F.10 — ADR-083 A9) ───

  /**
   * GET /orgs/{org}/websites/{ws}/apps — lista apps CMS instaladas en una
   * website. Sirve para poblar `ServiceInfo.apps?: AppPresence[]` en
   * `getServiceInfo()` ([ADR-077 Amendment A9](../../../../../docs/10-decisions/adr-077-contrato-provisioner-plugin-v2.md)).
   *
   * Returns `WebsiteAppsFullListing { items: WebsiteApp[] }`. Si el website
   * NO tiene apps instaladas, el response es `{ items: [] }` (200, NO 404).
   *
   * El campo opcional `WebsiteApp.defaultWpUserId?` permite al plugin
   * decidir si la action `'open_app_admin'` está disponible para una
   * instalación WP sin hacer una call extra a `getDefaultWpSsoUser`
   * (optimización heredada de ADR-083 §4 decisión 13 — ownerMemberId
   * cacheado en `enhance_customers`).
   */
  async getWebsiteApps(
    orgId: CustomerOrgId,
    websiteId: WebsiteId,
  ): Promise<EnhanceWebsiteAppsFullListing> {
    return this.http.get<EnhanceWebsiteAppsFullListing>(
      `/orgs/${encodeURIComponent(orgId)}/websites/${encodeURIComponent(websiteId)}/apps`,
    );
  }

  /**
   * GET /orgs/{org}/websites/{ws}/apps/{appId}/wordpress/info — snapshot
   * per-WP instalación. Sprint 15C.II Fase F.10 NO consume el resultado
   * directamente (los stats UI son F.10.x — `DC.NEW-51`); el método se
   * añade ahora al cliente para uso futuro sin refactor.
   */
  async getWordpressInfo(
    orgId: CustomerOrgId,
    websiteId: WebsiteId,
    appId: string,
  ): Promise<EnhanceWordPressInfo> {
    return this.http.get<EnhanceWordPressInfo>(
      `/orgs/${encodeURIComponent(orgId)}/websites/${encodeURIComponent(websiteId)}/apps/${encodeURIComponent(appId)}/wordpress/info`,
    );
  }

  /**
   * GET /orgs/{org}/websites/{ws}/apps/{appId}/wordpress/users/default —
   * devuelve el WP user marcado como default SSO. Returns `null` si el
   * endpoint responde 404 (no hay default user configurado — caso "WP sin
   * default user", el frontend renderiza el atajo disabled con tooltip).
   *
   * Re-lanza `ProvisionerPluginError` en otros errores (autenticación, red,
   * 5xx) para que el caller los capture y degrade. Mismo patrón defensivo
   * que `getDomainSsl` (Sprint 15C.II Fase F.7 — ADR-083 Amendment A8).
   */
  async getDefaultWpSsoUser(
    orgId: CustomerOrgId,
    websiteId: WebsiteId,
    appId: string,
  ): Promise<EnhanceWpUser | null> {
    try {
      return await this.http.get<EnhanceWpUser>(
        `/orgs/${encodeURIComponent(orgId)}/websites/${encodeURIComponent(websiteId)}/apps/${encodeURIComponent(appId)}/wordpress/users/default`,
      );
    } catch (err) {
      if (
        err instanceof ProvisionerPluginError &&
        err.code === 'INVALID_STATE'
      ) {
        return null;
      }
      throw err;
    }
  }

  /**
   * GET /orgs/{org}/websites/{ws}/apps/{appId}/wordpress/users/{userId}/sso
   * — devuelve URL SSO al WP-admin del user específico. Returns string
   * plano (la URL completa con token de session WP).
   *
   * El plugin NO la cachea (one-shot/short-TTL — gestionado por Enhance).
   * Llamado fresh on-demand dentro de `executeAction('open_app_admin')`
   * cuando el cliente clickea el atajo del frontend.
   */
  async getWordpressUserSsoUrl(
    orgId: CustomerOrgId,
    websiteId: WebsiteId,
    appId: string,
    userId: number,
  ): Promise<EnhanceWordpressUserSsoUrl> {
    return this.http.get<EnhanceWordpressUserSsoUrl>(
      `/orgs/${encodeURIComponent(orgId)}/websites/${encodeURIComponent(websiteId)}/apps/${encodeURIComponent(appId)}/wordpress/users/${encodeURIComponent(String(userId))}/sso`,
    );
  }

  /**
   * GET /orgs/{org}/websites/{ws}/apps/{appId}/joomla/info — snapshot
   * per-Joomla instalación. Sprint 15C.II Fase F.10 consume `site_url`
   * para construir la URL canónica `${site_url}/administrator` (no hay
   * SSO Joomla documentado en orchd). Los detalles plugin_count/user_count
   * se reservan para F.10.x stats UI (`DC.NEW-51`).
   */
  async getJoomlaInfo(
    orgId: CustomerOrgId,
    websiteId: WebsiteId,
    appId: string,
  ): Promise<EnhanceJoomlaInfo> {
    return this.http.get<EnhanceJoomlaInfo>(
      `/orgs/${encodeURIComponent(orgId)}/websites/${encodeURIComponent(websiteId)}/apps/${encodeURIComponent(appId)}/joomla/info`,
    );
  }

  // ─── 7. DNS records per-zone (Fase G UI 7 record kinds) ─────────────────

  /**
   * GET /orgs/{org}/websites/{ws}/domains/{dom}/dns-zone — devuelve la
   * zona completa con SOA + records.
   *
   * Sirve `list_dns_records` action — L2 reads on-demand sin cache (DH-INV-6
   * + ADR-083 §6 decisión 23). UI llama a este método cada vez que el
   * cliente abre la pestaña DNS.
   */
  async getDnsZone(
    orgId: CustomerOrgId,
    websiteId: WebsiteId,
    domain: string,
  ): Promise<EnhanceDnsZone> {
    return this.http.get<EnhanceDnsZone>(
      `/orgs/${encodeURIComponent(orgId)}/websites/${encodeURIComponent(websiteId)}/domains/${encodeURIComponent(domain)}/dns-zone`,
    );
  }

  /**
   * POST /orgs/{org}/websites/{ws}/domains/{dom}/dns-zone/records — añade record.
   * Sirve `add_dns_record` action.
   */
  async addDnsRecord(
    orgId: CustomerOrgId,
    websiteId: WebsiteId,
    domain: string,
    body: EnhanceNewDnsRecord,
  ): Promise<EnhanceCreatedRef<DnsRecordId>> {
    return this.http.post<EnhanceCreatedRef<DnsRecordId>>(
      `/orgs/${encodeURIComponent(orgId)}/websites/${encodeURIComponent(websiteId)}/domains/${encodeURIComponent(domain)}/dns-zone/records`,
      body,
    );
  }

  /**
   * PATCH .../dns-zone/records/{id} — modifica record existente.
   * Sirve `update_dns_record` action.
   */
  async updateDnsRecord(
    orgId: CustomerOrgId,
    websiteId: WebsiteId,
    domain: string,
    recordId: DnsRecordId,
    body: EnhanceUpdateDnsRecord,
  ): Promise<void> {
    await this.http.patch<void>(
      `/orgs/${encodeURIComponent(orgId)}/websites/${encodeURIComponent(websiteId)}/domains/${encodeURIComponent(domain)}/dns-zone/records/${encodeURIComponent(recordId)}`,
      body,
    );
  }

  /**
   * DELETE .../dns-zone/records/{id} — elimina record.
   * Sirve `delete_dns_record` action (destructive, confirmRequired=true).
   */
  async deleteDnsRecord(
    orgId: CustomerOrgId,
    websiteId: WebsiteId,
    domain: string,
    recordId: DnsRecordId,
  ): Promise<void> {
    await this.http.delete<void>(
      `/orgs/${encodeURIComponent(orgId)}/websites/${encodeURIComponent(websiteId)}/domains/${encodeURIComponent(domain)}/dns-zone/records/${encodeURIComponent(recordId)}`,
    );
  }

  // ─── 8. Default DNS records cluster-wide (Fase D bootstrap + sync) ──────

  /**
   * GET /v2/settings/dns/default-records — lista los defaults globales del
   * cluster. Idempotency check del bootstrap onActivated() del plugin
   * (ADR-083 §5 decisión 20).
   */
  async listDefaultDnsRecords(): Promise<readonly EnhanceDefaultDnsRecord[]> {
    return this.http.get<readonly EnhanceDefaultDnsRecord[]>(
      '/v2/settings/dns/default-records',
    );
  }

  /**
   * POST /v2/settings/dns/default-records — añade un default record global.
   * El plugin lo invoca en bootstrap + cuando el setting
   * `provisioning.default_nameservers` cambia (NS-sync C3 → C2 ADR-082 §4).
   */
  async addDefaultDnsRecord(
    body: EnhanceNewDefaultDnsRecord,
  ): Promise<EnhanceCreatedRef<DefaultDnsRecordId>> {
    return this.http.post<EnhanceCreatedRef<DefaultDnsRecordId>>(
      '/v2/settings/dns/default-records',
      body,
    );
  }

  /** PATCH /v2/settings/dns/default-records/{id} — modifica un default. */
  async updateDefaultDnsRecord(
    recordId: DefaultDnsRecordId,
    body: EnhanceUpdateDefaultDnsRecord,
  ): Promise<void> {
    await this.http.patch<void>(
      `/v2/settings/dns/default-records/${encodeURIComponent(recordId)}`,
      body,
    );
  }

  /** DELETE /v2/settings/dns/default-records/{id} — elimina un default. */
  async deleteDefaultDnsRecord(recordId: DefaultDnsRecordId): Promise<void> {
    await this.http.delete<void>(
      `/v2/settings/dns/default-records/${encodeURIComponent(recordId)}`,
    );
  }
}
