/**
 * Sprint 15D Fase 15D.C — `ResellerClubApiClient` high-level.
 *
 * Cubre los endpoints del **scope 15D core** (ADR-081 §9) que las fases
 * 15D.D-G necesitarán:
 *   - Pre-venta: checkAvailability, getResellerPrice/getCustomerPrice.
 *   - Customer/contact lazy (15D.D): signupCustomer, searchCustomerByEmail, addContact.
 *   - Ciclo de vida (15D.D/E): registerDomain, renewDomain, getDomainDetails*.
 *   - Reconcile (15D.E): searchDomains.
 *   - Gestión curada (15D.F): modifyNameservers/Contacts/PrivacyProtection/AuthCode,
 *     enable/disableTheftProtection.
 *   - Admin (15D.F): suspendOrder/unsuspendOrder.
 *
 * Fuera de scope (15D.II): transfer-in, suggest-names rico, IDN, child-NS.
 *
 * Doctrina (R4 + ADR-077 §5):
 *   - El cliente NO toca Redis/EventEmitter/Audit/Prisma — solo HTTP tipado.
 *     La orquestación (advisory lock, eventos, persistencia) vive en el plugin
 *     y el orquestador (15D.D).
 *   - Cada método devuelve el shape canónico (types.ts) o lanza
 *     `ProvisionerPluginError` con código semántico (el http-client mapea).
 *   - Idempotencia/lazy-create se delega al plugin (15D.D): el cliente solo
 *     expone `searchCustomerByEmail` (cross-search defensivo, ADR-081 §3).
 */

import { Logger } from '@nestjs/common';

import { invalidPayloadError } from './errors';
import {
  ResellerClubHttpClient,
  ResellerClubHttpClientConfig,
} from './http-client';
import {
  RcAddContactInput,
  RcAvailabilityResponse,
  RcContactId,
  RcCustomerDetails,
  RcCustomerId,
  RcCustomerPriceResponse,
  RcDomainDetails,
  RcDomainSearchResponse,
  RcOrderId,
  RcRegisterInput,
  RcRegisterResponse,
  RcRenewInput,
  RcResellerPriceResponse,
  RcSignupCustomerInput,
} from './types';

/** Contactos de un dominio para `modify-contact`. */
export interface RcDomainContacts {
  readonly 'reg-contact-id': RcContactId;
  readonly 'admin-contact-id': RcContactId | -1;
  readonly 'tech-contact-id': RcContactId | -1;
  readonly 'billing-contact-id': RcContactId | -1;
}

export class ResellerClubApiClient {
  private readonly logger = new Logger(ResellerClubApiClient.name);
  private readonly http: ResellerClubHttpClient;

  constructor(config: ResellerClubHttpClientConfig) {
    this.http = new ResellerClubHttpClient(config);
  }

  // ─── Pre-venta ──────────────────────────────────────────────────────────────

  /** `domains/available` — disponibilidad single/bulk. Pre-flight DOM-INV-1. */
  async checkAvailability(
    domainName: string,
    tlds: readonly string[],
  ): Promise<RcAvailabilityResponse> {
    return this.http.get<RcAvailabilityResponse>('domains/available', {
      'domain-name': domainName,
      tlds,
    });
  }

  /** `products/reseller-price` — COSTE mayorista (fuente de getTldPricing/DOM-INV-3, ADR-081 A1.1). */
  async getResellerPrice(): Promise<RcResellerPriceResponse> {
    return this.http.get<RcResellerPriceResponse>('products/reseller-price');
  }

  /** `products/customer-price` — precio sugerido por RC (no se usa en v1, ADR-081 A1.1). */
  async getCustomerPrice(): Promise<RcCustomerPriceResponse> {
    return this.http.get<RcCustomerPriceResponse>('products/customer-price');
  }

  // ─── Customer + contact (lazy — 15D.D) ──────────────────────────────────────

  /** `customers/signup` → customer-id (RC lo devuelve como número plano, A1.4). */
  async signupCustomer(input: RcSignupCustomerInput): Promise<RcCustomerId> {
    const raw = await this.http.post('customers/signup', { ...input });
    return this.normalizeId(raw, 'customers/signup');
  }

  /**
   * `customers/search` por email → customer-id si existe, `null` si no (cross-search
   * defensivo, ADR-081 §3). El "vacío" NO es error de negocio (HTTP 200,
   * `recsindb:"0"`), así que no lanza. [Extracción CONSERVADORA — refinar Fase G].
   */
  async searchCustomerByEmail(email: string): Promise<RcCustomerId | null> {
    const res = await this.http.get<RcDomainSearchResponse>(
      'customers/search',
      {
        'no-of-records': 10,
        'page-no': 1,
        username: email,
      },
    );
    if (this.recordCount(res) === 0) return null;
    return this.extractFirstRecordId(res, [
      'customerid',
      'customer.customerid',
    ]);
  }

  /** `customers/details` por customer-id (no por email — el miss llega como error, A1.3/§4.6). */
  async getCustomerDetails(
    customerId: RcCustomerId,
  ): Promise<RcCustomerDetails> {
    return this.http.get<RcCustomerDetails>('customers/details-by-id', {
      'customer-id': customerId,
    });
  }

  /** `contacts/add` → contact-id (RC lo devuelve como número plano, A1.4). */
  async addContact(input: RcAddContactInput): Promise<RcContactId> {
    const raw = await this.http.post('contacts/add', { ...input });
    return this.normalizeId(raw, 'contacts/add');
  }

  // ─── Ciclo de vida (15D.D/E) ────────────────────────────────────────────────

  /** `domains/register` → order-id (provider_reference). Extrae `entityid`/`eaqid`. */
  async registerDomain(input: RcRegisterInput): Promise<RcOrderId> {
    const raw = await this.http.post<RcRegisterResponse>('domains/register', {
      ...input,
    });
    return this.normalizeId(raw, 'domains/register');
  }

  /** `domains/renew`. `exp-date` (epoch actual) requerido → verificar DOM-INV-4 tras renovar. */
  async renewDomain(input: RcRenewInput): Promise<void> {
    await this.http.post('domains/renew', { ...input });
  }

  /** `domains/details-by-name` — fuente de getServiceInfo + expires_at. [CONSERVADOR Fase G]. */
  async getDomainDetailsByName(
    domainName: string,
    options: string = 'All',
  ): Promise<RcDomainDetails> {
    return this.http.get<RcDomainDetails>('domains/details-by-name', {
      'domain-name': domainName,
      options,
    });
  }

  /** `domains/details` por order-id. [CONSERVADOR Fase G]. */
  async getDomainDetailsByOrderId(
    orderId: RcOrderId,
    options: string = 'All',
  ): Promise<RcDomainDetails> {
    return this.http.get<RcDomainDetails>('domains/details', {
      'order-id': orderId,
      options,
    });
  }

  /** `domains/search` — reconcile cron (vacío = `{recsindb:"0"}`, OT&E ✓). */
  async searchDomains(
    params: Record<string, string | number> = {},
  ): Promise<RcDomainSearchResponse> {
    return this.http.get<RcDomainSearchResponse>('domains/search', {
      'no-of-records': 50,
      'page-no': 1,
      ...params,
    });
  }

  // ─── Gestión curada (15D.F) ─────────────────────────────────────────────────

  /** `domains/modify-ns` — acción curada peligrosa (confirm en UI). */
  async modifyNameservers(
    orderId: RcOrderId,
    ns: readonly string[],
  ): Promise<void> {
    await this.http.post('domains/modify-ns', { 'order-id': orderId, ns });
  }

  /** `domains/modify-contact`. */
  async modifyContacts(
    orderId: RcOrderId,
    contacts: RcDomainContacts,
  ): Promise<void> {
    await this.http.post('domains/modify-contact', {
      'order-id': orderId,
      ...contacts,
    });
  }

  /** `domains/modify-privacy-protection` — WHOIS privacy ON/OFF (no soportado en algunos TLDs). */
  async modifyPrivacyProtection(
    orderId: RcOrderId,
    enable: boolean,
    reason: string,
  ): Promise<void> {
    await this.http.post('domains/modify-privacy-protection', {
      'order-id': orderId,
      'protect-privacy': enable,
      reason,
    });
  }

  /** `domains/modify-auth-code` — EPP/auth code (transfer-out). */
  async modifyAuthCode(orderId: RcOrderId, authCode: string): Promise<void> {
    await this.http.post('domains/modify-auth-code', {
      'order-id': orderId,
      'auth-code': authCode,
    });
  }

  /** `domains/enable-theft-protection` — registrar lock ON. */
  async enableTheftProtection(orderId: RcOrderId): Promise<void> {
    await this.http.post('domains/enable-theft-protection', {
      'order-id': orderId,
    });
  }

  /** `domains/disable-theft-protection` — registrar lock OFF. */
  async disableTheftProtection(orderId: RcOrderId): Promise<void> {
    await this.http.post('domains/disable-theft-protection', {
      'order-id': orderId,
    });
  }

  // ─── Admin (15D.F) ──────────────────────────────────────────────────────────

  /** `orders/suspend` — admin (impago/fraude). */
  async suspendOrder(orderId: RcOrderId, reason: string): Promise<void> {
    await this.http.post('orders/suspend', { 'order-id': orderId, reason });
  }

  /** `orders/unsuspend` — admin. */
  async unsuspendOrder(orderId: RcOrderId): Promise<void> {
    await this.http.post('orders/unsuspend', { 'order-id': orderId });
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /** Normaliza un id RC (número plano, string numérica, u objeto con `entityid`) a string. */
  private normalizeId(raw: unknown, command: string): string {
    if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
    if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) return raw.trim();
    if (raw && typeof raw === 'object') {
      const o = raw as Record<string, unknown>;
      for (const key of [
        'entityid',
        'eaqid',
        'customerid',
        'contactid',
        'id',
      ]) {
        const v = o[key];
        if (typeof v === 'number' && Number.isFinite(v)) return String(v);
        if (typeof v === 'string' && /^\d+$/.test(v.trim())) return v.trim();
      }
    }
    throw invalidPayloadError(
      command,
      'no se pudo extraer el id de la respuesta',
    );
  }

  /** Cuenta de registros de una respuesta paginada RC (`recsindb`). */
  private recordCount(res: RcDomainSearchResponse): number {
    const n = Number(res.recsindb ?? '0');
    return Number.isFinite(n) ? n : 0;
  }

  /** Extrae el id del primer registro numérico de una respuesta paginada. [CONSERVADOR]. */
  private extractFirstRecordId(
    res: RcDomainSearchResponse,
    keys: readonly string[],
  ): RcCustomerId | null {
    for (const [k, v] of Object.entries(res)) {
      if (!/^\d+$/.test(k) || !v || typeof v !== 'object') continue;
      const rec = v as Record<string, unknown>;
      for (const key of keys) {
        const val = rec[key];
        if (typeof val === 'number' && Number.isFinite(val)) return String(val);
        if (typeof val === 'string' && /^\d+$/.test(val.trim())) {
          return val.trim();
        }
      }
    }
    this.logger.warn(
      'searchCustomerByEmail: registros presentes pero sin id extraíble',
    );
    return null;
  }
}
