/**
 * Sprint 15D Fase 15D.C — barrel canónico del cliente ResellerClub API.
 *
 * El plugin (15D.D) y los crons (15D.E) consumen exclusivamente desde aquí —
 * nunca desde paths internos del subfolder `api/` (patrón enhance_cp/api/index.ts).
 */

export { ResellerClubApiClient } from './client';
export type { RcDomainContacts } from './client';

export {
  RESELLERCLUB_PRODUCTION_URL,
  RESELLERCLUB_SANDBOX_URL,
  ResellerClubHttpClient,
  resolveResellerClubBaseUrl,
} from './http-client';
export type {
  RcEnvironment,
  RcHttpMethod,
  RcParamValue,
  RcParams,
  ResellerClubHttpClientConfig,
} from './http-client';

export {
  cloudflareWafError,
  invalidPayloadError,
  isCloudflareChallenge,
  mapHttpStatusToProvisionerError,
  mapRcBusinessError,
  networkError,
  parseRcErrorEnvelope,
  rcBusinessError,
  rcErrorDetail,
  RC_ERROR_MODULE,
  timeoutError,
} from './errors';

export type {
  RcAddContactInput,
  RcAvailabilityEntry,
  RcAvailabilityResponse,
  RcAvailabilityStatus,
  RcClassKey,
  RcContactDetails,
  RcContactId,
  RcContactType,
  RcCustomerDetails,
  RcModifyContactInput,
  RcCustomerId,
  RcCustomerPriceByYears,
  RcCustomerPriceEntry,
  RcCustomerPriceResponse,
  RcDomainDetails,
  RcDomainSearchResponse,
  RcErrorEnvelope,
  RcInvoiceOption,
  RcOrderId,
  RcPriceOperation,
  RcRegisterInput,
  RcRegisterResponse,
  RcRenewInput,
  RcResellerPriceByYears,
  RcResellerPriceEntry,
  RcResellerPriceResponse,
  RcSignupCustomerInput,
} from './types';
