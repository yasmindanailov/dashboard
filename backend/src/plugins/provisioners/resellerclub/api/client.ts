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
 *   - Transfer-in (15D.II.T1, ADR-081 A7): validateTransfer, transferDomain,
 *     resendTransferRfa, cancelTransfer.
 *
 * Fuera de scope (15D.II posterior): suggest-names rico, IDN, child-NS.
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
  RcContactDetails,
  RcContactId,
  RcCustomerDetails,
  RcCustomerId,
  RcCustomerPriceResponse,
  RcDomainDetails,
  RcDomainSearchResponse,
  RcModifyContactInput,
  RcOrderId,
  RcRegisterInput,
  RcRegisterResponse,
  RcRenewInput,
  RcResellerPriceResponse,
  RcSignupCustomerInput,
  RcTransferInput,
  RcTransferResponse,
  RcValidateTransferResponse,
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

  /**
   * `contacts/modify` — actualiza los DATOS de la entidad contacto (15D.G·2).
   * Como el contacto es compartido por los dominios del cliente (1 titular),
   * esto propaga el WHOIS a todos ellos. [CONSERVADOR Fase G].
   */
  async modifyContactDetails(
    contactId: RcContactId,
    input: RcModifyContactInput,
  ): Promise<void> {
    await this.http.post('contacts/modify', {
      ...input,
      'contact-id': contactId,
    });
  }

  /** `contacts/details` — datos actuales del contacto (verify-after-write + cambio de nombre). */
  async getContactDetails(contactId: RcContactId): Promise<RcContactDetails> {
    return this.http.get<RcContactDetails>('contacts/details', {
      'contact-id': contactId,
    });
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

  // ─── Transfer-in (Sprint 15D.II — ADR-081 A7) ───────────────────────────────

  /**
   * `domains/validate-transfer` — pre-flight de la FSM: ¿es el dominio
   * transferible? (registrado en otro registrar, sin lock, fuera del bloqueo de
   * 60 días). No inicia nada. [CONSERVADOR — refinar Fase 15D.II.G].
   */
  async validateTransfer(
    domainName: string,
  ): Promise<RcValidateTransferResponse> {
    return this.http.get<RcValidateTransferResponse>(
      'domains/validate-transfer',
      { 'domain-name': domainName },
    );
  }

  /**
   * `domains/transfer` → order-id (provider_reference). Inicia el transfer-in
   * (el registrar lo deja "InProgress"/`submitted`; la FSM avanza vía reconcile,
   * [ADR-084 A2]). El `auth-code` EPP inválido → `INVALID_AUTH_CODE`; dominio no
   * transferible (lock / <60d / no registrado fuera) → `TRANSFER_REJECTED` (el
   * http-client mapea ambos). El `auth-code` es secreto (R12 — ADR-077 A14).
   */
  async transferDomain(input: RcTransferInput): Promise<RcOrderId> {
    const raw = await this.http.post<RcTransferResponse>('domains/transfer', {
      ...input,
    });
    return this.normalizeId(raw, 'domains/transfer');
  }

  /** `domains/resend-rfa` — reenvía el correo de autorización (RFA) al titular de origen. */
  async resendTransferRfa(orderId: RcOrderId): Promise<void> {
    await this.http.post('domains/resend-rfa', { 'order-id': orderId });
  }

  /** `domains/cancel-transfer` — cancela un transfer-in en curso. */
  async cancelTransfer(orderId: RcOrderId): Promise<void> {
    await this.http.post('domains/cancel-transfer', { 'order-id': orderId });
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

  /**
   * `domains/delete` — borrado admin en período de gracia (15D.G·2, ADR-081 A3.1).
   * RC reembolsa el registro si está dentro de la ventana de gracia del TLD;
   * fuera de ella devuelve error de negocio (el http-client lo mapea). Operación
   * destructiva e irreversible: el dominio desaparece del registrador.
   */
  async deleteDomain(orderId: RcOrderId): Promise<void> {
    await this.http.post('domains/delete', { 'order-id': orderId });
  }

  /**
   * `domains/restore` — restore RGP (15D.II.R, ADR-081 A7.2): recupera un dominio
   * en período de redención con la tarifa especial del registrar. RC lo devuelve a
   * `active`. El fee se cobra de forma inmediata e irreversible — la decisión de
   * restaurar es admin/soporte. Shapes CONSERVADORES hasta el smoke OT&E (A7.4).
   */
  async restoreDomain(orderId: RcOrderId): Promise<void> {
    await this.http.post('domains/restore', { 'order-id': orderId });
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
