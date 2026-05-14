/**
 * Sprint 15C Fase 15C.B — types canónicos del plugin Enhance CP.
 *
 * Mapping LITERAL del spec orchd v12.21.3
 * (`docs/_research/sprint-15c/orchd-oas3-api.yaml`).
 *
 * Convenciones:
 *   - Solo se modela el subset que el plugin necesita en v1
 *     (28 features in — ADR-083 §5.1). Schemas no usados (`Allowance`,
 *     `Tag`, `BackupAction`, `WebsiteKind`, etc.) NO se importan; el
 *     cliente los pasa como `unknown` cuando el spec los menciona pero
 *     no los explota.
 *   - `Subscription.id` es **integer** (NO uuid) por contrato Enhance —
 *     se persiste en `services.provider_reference` serializado a string
 *     (ADR-083 §2 decisión 9).
 *   - `Org.id` y `Website.id` son uuid string.
 *   - Los campos required del spec se exponen como obligatorios; los
 *     opcionales como `?:` con `| undefined` implícito.
 *
 * Cualquier cambio breaking en el spec Enhance v13+ requiere amendment
 * a ADR-083 + actualización de estos types + bump `manifest.version`
 * del plugin.
 */

// ────────────────────────────────────────────────────────────────────────────
// 1. Identifiers (newtype-ish — distinguen contextos en call-sites)
// ────────────────────────────────────────────────────────────────────────────

/** UUID del Master org (Aelium tenant root). Cargado desde manifest config. */
export type MasterOrgId = string;

/** UUID del customer org (un Client Aelium). */
export type CustomerOrgId = string;

/** UUID del login (credencial Enhance del owner del customer). */
export type LoginId = string;

/** UUID del member (rol Owner del customer org). */
export type MemberId = string;

/**
 * Integer ID de subscription Enhance — ATENCIÓN: NO es uuid.
 * Se serializa a string al persistir en `services.provider_reference`.
 */
export type SubscriptionId = number;

/** UUID del website. */
export type WebsiteId = string;

/** UUID o integer ID de un DNS record. Spec line 18139: format uuid. */
export type DnsRecordId = string;

/** UUID de un default DNS record cluster-wide. */
export type DefaultDnsRecordId = string;

// ────────────────────────────────────────────────────────────────────────────
// 2. System / install (auth probe)
// ────────────────────────────────────────────────────────────────────────────

/** Spec /version line 59-73 — devuelve string SemVer plano. */
export type EnhanceVersionResponse = string;

// ────────────────────────────────────────────────────────────────────────────
// 3. Org (line 15504) — Org schema canónico
// ────────────────────────────────────────────────────────────────────────────

/** Spec line 15552-15554 — Status enum. */
export type EnhanceStatus = 'active' | 'deleted';

/**
 * Spec Org schema (line 15504). Subset usado por el plugin:
 *   - id, name, status, ownerId, ownerLoginId (SSO 2-call OTP — ADR-083 §4 decisión 13)
 *   - subscriptionsCount, websitesCount (display in admin dashboard)
 *   - createdAt (ISO-8601-ish — Enhance returns "string" sin format)
 *
 * Los campos no usados por el plugin (slackNotificationWebhookUrl,
 * suspendedBy, ownerAvatarPath, locale, parentId) se ignoran al
 * deserializar — TypeScript solo requiere los listados.
 */
export interface EnhanceOrg {
  readonly id: CustomerOrgId;
  readonly name: string;
  readonly status: EnhanceStatus;
  readonly ownerId?: MemberId;
  readonly ownerLoginId?: LoginId;
  readonly owner?: string;
  readonly ownerEmail?: string;
  readonly subscriptionsCount: number;
  readonly websitesCount: number;
  readonly createdAt: string;
}

/** Spec NewCustomer line 15455 — body POST /orgs/{master}/customers. */
export interface EnhanceNewCustomer {
  readonly name: string;
}

/** Spec CustomersListing line 15462 — response GET /orgs/{master}/customers. */
export interface EnhanceCustomersListing {
  readonly items: readonly EnhanceOrg[];
  readonly total: number;
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Login (line 16072) — credenciales del cliente
// ────────────────────────────────────────────────────────────────────────────

/** Spec LoginInfo line 16072 — body POST /logins?orgId=. */
export interface EnhanceLoginInfo {
  readonly email: string;
  readonly password: string;
  readonly name: string;
}

/**
 * Spec response POST /logins — Enhance devuelve `{ id, ... }`.
 * El plugin solo necesita el id; el resto se ignora.
 */
export interface EnhanceLoginCreated {
  readonly id: LoginId;
  readonly email?: string;
  readonly name?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// 5. Member (line 16333 + NewMember line 16238 + RoleList)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Spec Role line 16149 — enum cerrado.
 * El plugin v1 solo crea miembros con rol 'Owner' (decisión 10 §3 ADR-083).
 */
export type EnhanceRole =
  | 'Owner'
  | 'SuperAdmin'
  | 'Business'
  | 'SiteAccess'
  | 'Support'
  | 'Sysadmin';

/** Spec NewMember line 16238 — body POST /orgs/{org}/members. */
export interface EnhanceNewMember {
  readonly loginId: LoginId;
  readonly roles: readonly EnhanceRole[];
}

/** Spec Member line 16333 — subset usado en SSO resolve. */
export interface EnhanceMember {
  readonly id: MemberId;
  readonly loginId: LoginId;
  readonly isActive: boolean;
  readonly email: string;
  readonly name: string;
  readonly roles: readonly EnhanceRole[];
  readonly joinedAt: string;
}

/** Spec OrgOwnerUpdate line 18444 — body PUT /orgs/{org}/owner. */
export interface EnhanceOrgOwnerUpdate {
  readonly memberId: MemberId;
}

// ────────────────────────────────────────────────────────────────────────────
// 6. Subscription (line 15934 + NewSubscription 15923 + UpdateSubscription 16013)
// ────────────────────────────────────────────────────────────────────────────

/** Spec NewSubscription line 15923. */
export interface EnhanceNewSubscription {
  readonly planId: number;
  readonly friendlyName?: string;
}

/**
 * Spec Subscription line 15934 — subset usado por el plugin v1.
 * Solo lee status, planId, planName, resources para mapear a `ServiceInfo`.
 */
export interface EnhanceSubscription {
  readonly id: SubscriptionId;
  readonly planId: number;
  readonly planName: string;
  readonly subscriberId: CustomerOrgId;
  readonly vendorId: MasterOrgId;
  readonly status: EnhanceStatus;
  readonly suspendedBy?: string;
  readonly resources: readonly EnhanceUsedResource[];
  readonly friendlyName: string;
  readonly persistentAppsAllowed: boolean;
}

/** Spec UpdateSubscription line 16013 — body PATCH /orgs/{org}/subscriptions/{id}. */
export interface EnhanceUpdateSubscription {
  readonly status?: EnhanceStatus;
  readonly isSuspended?: boolean;
  readonly planId?: number;
  readonly friendlyName?: string;
}

/** Spec UsedResource line 16026 — usado en métricas. */
export interface EnhanceUsedResource {
  readonly name: string;
  readonly total?: number;
  readonly usage: number;
}

/** Spec UsedResourcesFullListing line 16049 — response calculate-resource-usage. */
export interface EnhanceUsedResourcesFullListing {
  readonly items: readonly EnhanceUsedResource[];
}

/**
 * Spec response GET /orgs/{org}/subscriptions/{id}/bandwidth.
 * Spec NO declara schema dedicado — el endpoint devuelve un objeto
 * con `usedMb` numeric. El plugin solo lo lee a través del cliente.
 */
export interface EnhanceBandwidth {
  readonly usedMb: number;
  readonly periodStart?: string;
  readonly periodEnd?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// 7. Website (line 16448 + NewWebsite 16392 + UpdateWebsite 16424)
// ────────────────────────────────────────────────────────────────────────────

/** Spec NewWebsite line 16392 — body POST /orgs/{org}/websites. */
export interface EnhanceNewWebsite {
  readonly domain: string;
  readonly subscriptionId?: SubscriptionId;
}

/** Spec WebsiteStatus enum (referenced from spec). */
export type EnhanceWebsiteStatus =
  | 'creating'
  | 'active'
  | 'suspended'
  | 'deleting'
  | 'deleted'
  | 'failed';

/** Spec WebsiteDomain — embedded subset (id + domain string). */
export interface EnhanceWebsiteDomain {
  readonly id: string;
  readonly domain: string;
}

/**
 * Spec Website line 16448 — subset usado por el plugin v1.
 * Lee status para mapear a `ServiceInfoStatus` + domain para display.
 */
export interface EnhanceWebsite {
  readonly id: WebsiteId;
  readonly domain: EnhanceWebsiteDomain;
  readonly aliases: readonly EnhanceWebsiteDomain[];
  readonly status: EnhanceWebsiteStatus;
  readonly suspendedBy?: string;
  readonly subscriptionId?: SubscriptionId;
  readonly planId?: number;
  readonly plan?: string;
  readonly orgId: CustomerOrgId;
  readonly createdAt: string;
}

/** Spec UpdateWebsite line 16424 — body PATCH /orgs/{org}/websites/{ws}. */
export interface EnhanceUpdateWebsite {
  readonly isSuspended?: boolean;
  readonly status?: EnhanceWebsiteStatus;
  readonly subscriptionId?: SubscriptionId;
}

// ────────────────────────────────────────────────────────────────────────────
// 7bis. Domains / SSL (line 8452) — GET /v2/domains/{domain_id}/ssl
//       Sprint 15C.II Fase F.7 — ADR-083 Amendment A8 (2026-05-13).
// ────────────────────────────────────────────────────────────────────────────

/**
 * Spec DomainSslCert line 20385 — subset usado por el plugin (omitimos
 * `sans` y los campos `cert`/`key` que están solo en
 * `DomainSslCertWithData`, no necesarios para el summary v1).
 *
 * El plugin lo lee vía `EnhanceApiClient.getDomainSsl(domainId)` y lo
 * mapea a `ServiceSslSummary` ([ADR-077 A7](../../../../core/provisioning/types.ts) +
 * ADR-083 A8.4). El campo `expires` viene como `string` sin formato
 * especificado por el OAS — el plugin lo parsea defensivo (`new Date(raw)`
 * + `isFinite(.getTime())`) y si falla devuelve `ssl: undefined` (no
 * expone parcial).
 */
export interface EnhanceDomainSslCert {
  readonly cn: string;
  readonly expires: string;
  readonly issued: string;
  readonly issuer: string;
  readonly forceHttps: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// 8. SSO (line 5039) — GET /orgs/{org}/members/{m}/sso
// ────────────────────────────────────────────────────────────────────────────

/**
 * Spec response GET /orgs/{org}/members/{m}/sso.
 * Devuelve string plano: la OTP URL completa
 * (`https://<panel>/login/sessions/sso?otp=<uuid>`).
 *
 * El plugin NO la cachea (TTL gestionado por Enhance — ADR-083 §4 decisión 15).
 */
export type EnhanceSsoOtpUrl = string;

// ────────────────────────────────────────────────────────────────────────────
// 9. DNS Records (line 18130 + NewDnsRecord 18185 + UpdateDnsRecord 18170)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Spec DnsRecordKind line 18256 — 11 kinds soportados por Enhance.
 *
 * El plugin v1 expone solo 7 al cliente (ADR-083 §5 decisión 17):
 *   `EnhanceDnsRecordKindV1 = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'SRV' | 'CAA'`
 *
 * Los 4 restantes (`SPF`, `NS`, `PTR`, `DS`) están fuera v1 con razón:
 *   - SPF deprecated RFC 7208.
 *   - NS rompe delegación si lo edita cliente.
 *   - PTR requiere reverse DNS delegation que cliente típico no tiene.
 *   - DS va con flag DNSSEC enable separado (DC.NEW-15C-DNSSEC).
 *
 * Este type se queda con los 11 para no romper el spec del cliente HTTP.
 * Para validar UI/payload el plugin usa `EnhanceDnsRecordKindV1` (más estrecho).
 */
export type EnhanceDnsRecordKind =
  | 'A'
  | 'AAAA'
  | 'CNAME'
  | 'TXT'
  | 'SPF'
  | 'SRV'
  | 'NS'
  | 'MX'
  | 'PTR'
  | 'DS'
  | 'CAA';

/** Subset expuesto al cliente por el plugin v1 — ADR-083 §5 decisión 17. */
export type EnhanceDnsRecordKindV1 =
  | 'A'
  | 'AAAA'
  | 'CNAME'
  | 'MX'
  | 'TXT'
  | 'SRV'
  | 'CAA';

/** Spec DnsSoa line 18107 — SOA record de la zona. */
export interface EnhanceDnsSoa {
  readonly adminEmail: string;
  readonly nameServer: string;
  readonly expire: number;
  readonly refresh: number;
  readonly retry: number;
  readonly ttl: number;
}

/** Spec DnsRecord line 18130 — record en zona Enhance. */
export interface EnhanceDnsRecord {
  readonly id: DnsRecordId;
  readonly kind: EnhanceDnsRecordKind;
  readonly name: string;
  readonly value: string;
  readonly ttl?: number;
  readonly proxy: boolean;
}

/** Spec DnsZone line 18088 — zona DNS authoritative del website. */
export interface EnhanceDnsZone {
  readonly origin: string;
  readonly soa: EnhanceDnsSoa;
  readonly records: readonly EnhanceDnsRecord[];
  readonly dnssecDsRecords?: string;
  readonly dnssecDnskeyRecords?: string;
}

/** Spec NewDnsRecord line 18185 — body POST .../dns-zone/records. */
export interface EnhanceNewDnsRecord {
  readonly kind: EnhanceDnsRecordKind;
  readonly name: string;
  readonly value: string;
  readonly ttl?: number;
  readonly proxy?: boolean;
}

/** Spec UpdateDnsRecord line 18170 — body PATCH .../dns-zone/records/{id}. */
export interface EnhanceUpdateDnsRecord {
  readonly kind?: EnhanceDnsRecordKind;
  readonly name?: string;
  readonly value?: string;
  readonly ttl?: number;
  readonly proxy?: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// 10. Default DNS Records (line 18234 + NewDefaultDnsRecord 18202 + Update 18220)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Spec DefaultDnsRecord line 18234 — record platform-level que se aplica
 * automáticamente a TODA zona nueva del cluster.
 *
 * El plugin Enhance los configura en bootstrap del onActivated() hook
 * (ADR-083 §5 decisión 20) + cuando el setting
 * `provisioning.default_nameservers` cambia (NS-sync C3 → C2 ADR-082 §4).
 */
export interface EnhanceDefaultDnsRecord {
  readonly id: DefaultDnsRecordId;
  readonly kind: EnhanceDnsRecordKind;
  readonly name: string;
  readonly value: string;
  readonly ttl?: number;
  readonly overrideConflicting?: boolean;
}

/** Spec NewDefaultDnsRecord line 18202 — body POST /v2/settings/dns/default-records. */
export interface EnhanceNewDefaultDnsRecord {
  readonly kind: EnhanceDnsRecordKind;
  readonly name: string;
  readonly value: string;
  readonly ttl?: number;
  readonly overrideConflicting?: boolean;
}

/** Spec UpdateDefaultDnsRecord line 18220 — body PATCH /v2/settings/dns/default-records/{id}. */
export interface EnhanceUpdateDefaultDnsRecord {
  readonly kind?: EnhanceDnsRecordKind;
  readonly name?: string;
  readonly value?: string;
  readonly ttl?: number;
  readonly overrideConflicting?: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// 11. Reset password (line 12595+) — PUT /v2/logins/{loginId}/password
// ────────────────────────────────────────────────────────────────────────────

/** Body PUT /v2/logins/{loginId}/password. */
export interface EnhanceNewPassword {
  readonly NewPassword: string;
}

// ────────────────────────────────────────────────────────────────────────────
// 11.5 Plans (Sprint 15C Fase 15C.E — ADR-083 Amendment A3)
// Spec line 5186 GET /orgs/{org_id}/plans + line 15733 Plan schema +
// line 18488 PlansListing schema. Subset usado por la 10ª inline action
// `list_available_plans` que alimenta el dropdown admin del modal
// `change_package` (decisión 30 + Amendment A3).
// ────────────────────────────────────────────────────────────────────────────

/**
 * Spec Plan schema (line 15733). Subset usado por el plugin v1:
 *   - id (integer, NO uuid — coherente con SubscriptionId).
 *   - name (string display).
 *   - subscriptionsCount (integer — info display admin).
 *   - planType (enum opaque, expuesto como string display).
 *   - createdAt (string).
 *
 * Los campos no usados (`resources`, `allowances`, `selections`,
 * `serverGroupIds`, `cgroupLimits`, `fsQuotaLimit`, `allowedPhpVersions`,
 * `defaultPhpVersion`, `redisAllowed`, `preinstallWordpressTheme`,
 * `persistentAppsAllowed`) se ignoran al deserializar — el dropdown
 * admin solo necesita id + name + display info.
 */
export interface EnhancePlan {
  readonly id: number;
  readonly name: string;
  readonly subscriptionsCount: number;
  readonly planType?: string;
  readonly createdAt: string;
}

/** Spec PlansListing line 18488 — response GET /orgs/{org_id}/plans. */
export interface EnhancePlansListing {
  readonly items: readonly EnhancePlan[];
  readonly total: number;
}

// ────────────────────────────────────────────────────────────────────────────
// 12. Generic POST response (id wrapper)
// ────────────────────────────────────────────────────────────────────────────

/**
 * La mayoría de los POST en Enhance devuelven `{ id: <uuid|integer> }`.
 * Tipo genérico para tipar el resultado mínimo del plugin.
 */
export interface EnhanceCreatedRef<TId = string> {
  readonly id: TId;
}
