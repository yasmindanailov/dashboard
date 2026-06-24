/**
 * Sprint 15D Fase 15D.C — types canónicos del cliente ResellerClub (LogicBoxes API).
 *
 * Fuentes (en orden de autoridad):
 *   1. **Verificación empírica OT&E (2026-05-22)** — shapes capturados contra
 *      `test.httpapi.com` con IP fija whitelisteada. Marcados `[OT&E ✓]`.
 *      Detalle en `docs/_research/sprint-15d/resellerclub-ote-findings.md` §4.
 *   2. Wrappers en producción `phillipsdata/logicboxes` + dossier §4 + módulos
 *      WHMCS/Blesta — para los shapes **register-dependientes** que OT&E no pudo
 *      capturar (validación de NS por DNS, ns1/ns2.aelium.net sin registro A en
 *      pre-producción — findings §4.8). Marcados `[CONSERVADOR — refinar Fase G]`.
 *
 * Convenciones (heredadas de enhance_cp/api/types.ts):
 *   - Solo se modela el subset del **scope 15D core** (ADR-081 §9). Transfer-in,
 *     suggest-names rico, IDN y child-NS son 15D.II — fuera de este fichero.
 *   - Campos required del shape como obligatorios; opcionales como `?:`.
 *   - RC devuelve ids como **número plano** (`signup`/`contacts/add`) [OT&E ✓];
 *     se normalizan a `string` al persistir en `services.provider_reference`.
 *
 * Cualquier divergencia descubierta en el smoke OT&E (Fase G) se materializa
 * como Amendment de ADR-081 (L18) + actualización de estos types.
 */

// ────────────────────────────────────────────────────────────────────────────
// 1. Identifiers (newtype-ish — distinguen contextos en los call-sites)
// ────────────────────────────────────────────────────────────────────────────

/** Customer-id RC (1 por usuario Aelium → tabla `resellerclub_customers`, ADR-081 §3). */
export type RcCustomerId = string;

/** Contact-id RC (handle registrant/admin/tech/billing → `resellerclub_contact_handles`, ADR-081 §4). */
export type RcContactId = string;

/**
 * Order-id / entity-id RC de un dominio registrado. Es el `provider_reference`
 * canónico (ADR-081 §5). RC lo emite como número; se normaliza a string.
 */
export type RcOrderId = string;

/**
 * Clave de producto RC (`domcno`, `dotnet`, `domorg`, `dotes`, `doteu`…). [OT&E ✓]
 * Coincide con el `classkey` de `domains/available` y es la clave de unión
 * availability ↔ pricing ↔ `domain_tld_pricing` (ADR-081 A1.2). NO es el TLD literal.
 */
export type RcClassKey = string;

// ────────────────────────────────────────────────────────────────────────────
// 2. Envoltorios de error de negocio [OT&E ✓ — findings §4.7, ADR-081 A1.3]
// ────────────────────────────────────────────────────────────────────────────

/**
 * RC señala errores de negocio con DOS envoltorios (ambos pueden llegar con
 * HTTP 200 **o** 500):
 *   - `{ status: 'ERROR', message }`  (mayúscula — la mayoría de comandos)
 *   - `{ status: 'error', error }`    (minúscula — p. ej. `domains/register`)
 * El http-client los detecta por `String(status).toLowerCase() === 'error'`
 * y extrae el detalle de `message ?? error` antes de mapear a ProvisionerErrorCode.
 */
export interface RcErrorEnvelope {
  readonly status: 'ERROR' | 'error';
  readonly message?: string;
  readonly error?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// 3. Pre-venta: availability [OT&E ✓ — findings §4.1]
// ────────────────────────────────────────────────────────────────────────────

/**
 * Estado de disponibilidad de un FQDN. `available` = registrable; cualquier otro
 * valor = no registrable (el cliente trata todo lo ≠ `available` defensivamente).
 * RC puede devolver otros valores no verificados → se permite catch-all string.
 */
export type RcAvailabilityStatus =
  | 'available'
  | 'regthroughothers'
  | 'regthroughus'
  | 'unknown'
  | (string & {});

/** Entrada de `domains/available` por FQDN. [OT&E ✓] */
export interface RcAvailabilityEntry {
  readonly classkey: RcClassKey;
  readonly status: RcAvailabilityStatus;
}

/** `domains/available` → objeto keyed por FQDN. [OT&E ✓] */
export type RcAvailabilityResponse = Record<string, RcAvailabilityEntry>;

// ────────────────────────────────────────────────────────────────────────────
// 4. Pre-venta: pricing [OT&E ✓ — findings §4.3/§4.4, ADR-081 A1.1]
// ────────────────────────────────────────────────────────────────────────────

/** Operaciones tarifadas por RC. [OT&E ✓] */
export type RcPriceOperation =
  | 'addnewdomain' // register
  | 'renewdomain'
  | 'addtransferdomain'
  | 'restoredomain';

/** Precio por número de años (`"1".."10"`). En `reseller-price` el valor es string. */
export type RcResellerPriceByYears = Record<string, string>;

/**
 * `products/reseller-price` → COSTE mayorista, keyed por product-key (== classkey).
 * Precios como **string**, anidados bajo el slab `"0"`; `category` se ignora.
 * Es la fuente canónica de `getTldPricing()` y del margin guard DOM-INV-3
 * (ADR-081 A1.1). [OT&E ✓]
 */
export interface RcResellerPriceEntry {
  readonly '0'?: {
    readonly pricing: Partial<Record<RcPriceOperation, RcResellerPriceByYears>>;
  };
  readonly 'privacy-protection'?: string;
  readonly premium_dns?: string;
}

/** `products/reseller-price` → objeto keyed por product-key. [OT&E ✓] */
export type RcResellerPriceResponse = Record<string, RcResellerPriceEntry>;

/** Precio por años en `customer-price` (valor **number**). */
export type RcCustomerPriceByYears = Record<string, number>;

/**
 * `products/customer-price` → precio **sugerido** por RC (NO es nuestro coste).
 * Precios como **number**, por años, sin slab `"0"` ni `category`. No se usa en
 * v1 (Aelium fija su precio con `markup_percent` sobre `reseller-price`). [OT&E ✓]
 */
export type RcCustomerPriceEntry = Partial<
  Record<RcPriceOperation, RcCustomerPriceByYears>
>;

/** `products/customer-price` → objeto keyed por product-key. [OT&E ✓] */
export type RcCustomerPriceResponse = Record<string, RcCustomerPriceEntry>;

// ────────────────────────────────────────────────────────────────────────────
// 5. Customer + contact handles (ADR-081 §3/§4)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Tipo de contacto RC. `Contact` (genérico) cubre .com/.net/.org; los regulados
 * usan tipos específicos (`.es` → EsContact con NIF/NIE, DOM-INV-5). [wrapper]
 */
export type RcContactType = 'Contact' | 'EsContact' | 'EuContact' | 'UkContact';

/**
 * Datos para crear un customer (`customers/signup`). RC devuelve el `customer-id`
 * como número plano (el cliente lo normaliza a `RcCustomerId`). [OT&E ✓ id escalar]
 */
export interface RcSignupCustomerInput {
  readonly username: string; // email
  readonly passwd: string;
  readonly name: string;
  readonly company: string;
  readonly 'address-line-1': string;
  readonly city: string;
  readonly state: string;
  readonly country: string; // ISO-3166 alpha-2
  readonly zipcode: string;
  readonly 'phone-cc': string;
  readonly phone: string;
  readonly 'lang-pref'?: string;
}

/**
 * Datos para crear un contact handle (`contacts/add`). RC devuelve el `contact-id`
 * como número plano. `attr-name`/`attr-value` portan los extension-specific details
 * (p. ej. `.es`: NIF/NIE — DOM-INV-5). [OT&E ✓ id escalar]
 */
export interface RcAddContactInput {
  readonly name: string;
  readonly company: string;
  readonly email: string;
  readonly 'address-line-1': string;
  readonly city: string;
  readonly state: string;
  readonly country: string;
  readonly zipcode: string;
  readonly 'phone-cc': string;
  readonly phone: string;
  readonly 'customer-id': RcCustomerId;
  readonly type: RcContactType;
  readonly 'attr-name'?: readonly string[];
  readonly 'attr-value'?: readonly string[];
}

/**
 * `contacts/modify` — actualiza los DATOS de una entidad contacto (15D.G·2).
 * Propaga a todos los dominios que la referencian (modelo "1 titular/cliente").
 * Mismos campos que `add` salvo que la entidad ya pertenece a su customer →
 * `contact-id` en vez de `customer-id`.
 */
export interface RcModifyContactInput {
  readonly 'contact-id': RcContactId;
  readonly name: string;
  readonly company: string;
  readonly email: string;
  readonly 'address-line-1': string;
  readonly city: string;
  readonly state: string;
  readonly country: string;
  readonly zipcode: string;
  readonly 'phone-cc': string;
  readonly phone: string;
  readonly 'attr-name'?: readonly string[];
  readonly 'attr-value'?: readonly string[];
}

/**
 * `contacts/details` (subset usado, 15D.G·2 — verify-after-write + detección de
 * cambio de nombre del titular). [CONSERVADOR — campos exactos confirmados Fase G].
 */
export interface RcContactDetails {
  readonly contactid?: string | number;
  readonly name?: string;
  readonly company?: string;
  readonly emailaddr?: string;
  readonly telno?: string;
  readonly address1?: string;
  readonly city?: string;
  readonly state?: string;
  readonly country?: string;
  readonly zip?: string;
}

/**
 * `customers/details` (subset usado). "No existe" llega como HTTP 500 +
 * RcErrorEnvelope (findings §4.6) → el cross-search lo trata como "crear".
 * [CONSERVADOR — refinar Fase G: campos exactos]
 */
export interface RcCustomerDetails {
  readonly customerid: RcCustomerId;
  readonly username: string;
  readonly name?: string;
  readonly company?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// 6. Ciclo de vida — register / details / renew
//    [CONSERVADOR — refinar Fase G: OT&E no pudo capturarlos, findings §4.8]
// ────────────────────────────────────────────────────────────────────────────

/** Política de facturación RC. `NoInvoice` = Aelium controla el cobro (no RC). */
export type RcInvoiceOption = 'NoInvoice' | 'PayInvoice' | 'KeepInvoice';

/** Input de `domains/register`. NS por defecto = `provisioning.default_nameservers`. */
export interface RcRegisterInput {
  readonly 'domain-name': string;
  readonly years: number;
  readonly ns: readonly string[]; // claves duplicadas en el wire (ns=a&ns=b)
  readonly 'customer-id': RcCustomerId;
  readonly 'reg-contact-id': RcContactId;
  readonly 'admin-contact-id': RcContactId | -1; // -1 para .eu/.uk/.nz/.ru
  readonly 'tech-contact-id': RcContactId | -1;
  readonly 'billing-contact-id': RcContactId | -1;
  readonly 'invoice-option': RcInvoiceOption;
  readonly 'protect-privacy': boolean;
  readonly 'attr-name'?: readonly string[];
  readonly 'attr-value'?: readonly string[];
}

/**
 * Respuesta de `domains/register` OK. [CONSERVADOR — refinar Fase G]
 * El order-id viene (según wrappers) en `entityid`; el cliente lo normaliza con
 * fallbacks (`entityid` → `eaqid`). `actionstatus` indica si quedó pendiente.
 */
export interface RcRegisterResponse {
  readonly entityid?: string | number;
  readonly eaqid?: string | number;
  readonly actionstatus?: string;
  readonly actiontype?: string;
  readonly description?: string;
}

/** Input de `domains/renew`. `exp-date` (epoch del vencimiento actual) → DOM-INV-4. */
export interface RcRenewInput {
  readonly 'order-id': RcOrderId;
  readonly years: number;
  readonly 'exp-date': number; // epoch (s) del endtime actual; releer details antes
  readonly 'invoice-option': RcInvoiceOption;
}

/**
 * `domains/details` / `details-by-name` (subset para getServiceInfo + expires_at).
 * [CONSERVADOR — refinar Fase G: los nombres/ejes exactos de estado los confirma
 * el smoke OT&E]. `endtime` (epoch) → `services.expires_at` (ADR-082 A2.3).
 * Los nameservers vienen como `ns1`, `ns2`, … (campos numerados, no array).
 */
export interface RcDomainDetails {
  readonly orderid?: string | number;
  readonly entityid?: string | number;
  readonly domainname?: string;
  /** Estado de la entidad ("Active"/"Suspended"/"Deleted"…). */
  readonly entitystatus?: string;
  /** Estados del dominio ("ok"/"transferlock"/redemption…). LogicBoxes los da como array. */
  readonly currentstatus?: string;
  readonly orderstatus?: readonly string[];
  /** Epoch (s) de creación / vencimiento. */
  readonly creationtime?: string | number;
  readonly endtime?: string | number;
  /** Nameservers: campos numerados ns1..nsN. */
  readonly ns1?: string;
  readonly ns2?: string;
  readonly ns3?: string;
  readonly ns4?: string;
  /** Ids de contacto. */
  readonly registrantcontactid?: string | number;
  readonly admincontactid?: string | number;
  readonly techcontactid?: string | number;
  readonly billingcontactid?: string | number;
  /** Flags de privacy / lock. */
  readonly isprivacyprotected?: boolean | string;
  readonly ordersuspendedbyparent?: boolean | string;
  /** Privacy/theft (registrar lock). */
  readonly domsecret?: string;
}

/** `domains/search` (reconcile cron). Vacío → `{recsonpage:"0", recsindb:"0"}`. [OT&E ✓ vacío] */
export interface RcDomainSearchResponse {
  readonly recsonpage?: string;
  readonly recsindb?: string;
  /** Registros indexados por posición ("1", "2", …) — shape conservador. */
  readonly [index: string]: unknown;
}
