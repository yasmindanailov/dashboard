/**
 * Sprint 15C Fase 15C.B — barrel canónico del cliente Enhance API.
 *
 * Exporta TODOS los símbolos que las Fases 15C.C-H necesitarán importar.
 * El plugin (Fase C) y los listeners (Fase D) consumen exclusivamente
 * desde aquí — nunca desde paths internos del subfolder `api/`.
 */

export { EnhanceApiClient } from './client';
export { EnhanceHttpClient } from './http-client';
export type {
  EnhanceHttpClientConfig,
  EnhanceHttpRequestOptions,
  HttpMethod,
} from './http-client';

export {
  invalidPayloadError,
  mapHttpStatusToProvisionerError,
  networkError,
  safeParseErrorBody,
  timeoutError,
} from './errors';
export type { EnhanceErrorBodyShape } from './errors';

export type {
  CustomerOrgId,
  DefaultDnsRecordId,
  DnsRecordId,
  EnhanceBandwidth,
  EnhanceCreatedRef,
  EnhanceCustomersListing,
  EnhanceDefaultDnsRecord,
  EnhanceDnsRecord,
  EnhanceDnsRecordKind,
  EnhanceDnsRecordKindV1,
  EnhanceDnsSoa,
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
  EnhancePlan,
  EnhancePlansListing,
  EnhanceRole,
  EnhanceSsoOtpUrl,
  EnhanceStatus,
  EnhanceSubscription,
  EnhanceUpdateDefaultDnsRecord,
  EnhanceUpdateDnsRecord,
  EnhanceUpdateSubscription,
  EnhanceUpdateWebsite,
  EnhanceUsedResource,
  EnhanceUsedResourcesFullListing,
  EnhanceVersionResponse,
  EnhanceWebsite,
  EnhanceWebsiteApp,
  EnhanceWebsiteAppKind,
  EnhanceWebsiteAppsFullListing,
  EnhanceWebsiteDomain,
  EnhanceWebsiteStatus,
  EnhanceWordPressInfo,
  EnhanceWordpressUserSsoUrl,
  EnhanceWpUser,
  EnhanceJoomlaInfo,
  LoginId,
  MasterOrgId,
  MemberId,
  SubscriptionId,
  WebsiteId,
} from './types';
