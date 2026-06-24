/**
 * Sprint 15D Fase 15D.C — `MockResellerClubServer` Express stub canónico.
 *
 * Materializa ADR-081 §10 + el patrón de ubicación ADR-083 Amendment A1
 * (`backend/test/mocks/<plugin-slug>-server/`). Responde a los comandos
 * LogicBoxes del scope 15D core (`<command>.json`) con shapes:
 *   - **Verificados en OT&E** (findings §4): `domains/available`, pricing
 *     (`reseller`/`customer-price`), ids escalares (`signup`/`contacts/add`),
 *     los DOS envoltorios de error, `domains/search` vacío.
 *   - **Conservadores** (findings §4.8 — OT&E no pudo capturarlos por la
 *     validación de NS): `register`/`details`/gestión/`renew`/suspend. Aquí el
 *     mock SÍ deja completar el happy path (es su valor: determinista, sin la
 *     restricción de NS de OT&E). Se refinan en el smoke Fase G.
 *
 * Alta fidelidad (lección L20): modela los **errores reales** (no solo el happy
 * path) — dominio no disponible, premium, `.es` sin NIF (inelegible), redemption,
 * registrar lock, auth inválida — vía nombres de dominio convencionales o seed.
 *
 * Doctrina:
 *   - Auth opcional: si `seed.apiKey` se setea, todos los comandos (excepto
 *     `/__test__/*`) exigen `auth-userid` + `api-key` correctos; si no, permisivo.
 *   - Errores de negocio con HTTP 200 + envoltorio (como el `register` real).
 *   - State in-memory por instancia, fresco por corrida; `reset()` lo limpia sin
 *     matar el server; `POST /__test__/seed` siembra runtime.
 */

import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';

import express, { Request, Response, NextFunction } from 'express';

import {
  RcAvailabilityStatus,
  RcCustomerPriceResponse,
  RcResellerPriceResponse,
} from '../../../src/plugins/provisioners/resellerclub/api/types';

// ────────────────────────────────────────────────────────────────────────────
// TLD ↔ classkey (verificado OT&E, findings §4.2)
// ────────────────────────────────────────────────────────────────────────────

const TLD_CLASSKEY: Readonly<Record<string, string>> = {
  com: 'domcno',
  net: 'dotnet',
  org: 'domorg',
  es: 'dotes',
  eu: 'doteu',
};

/** Pricing por defecto (estructura real OT&E §4.3/§4.4; valores plausibles). */
function defaultResellerPrice(): RcResellerPriceResponse {
  const entry = (cost: string): RcResellerPriceResponse[string] => ({
    '0': {
      pricing: {
        addnewdomain: { '1': cost },
        renewdomain: { '1': cost },
        addtransferdomain: { '1': cost },
        restoredomain: { '1': (Number(cost) + 30).toFixed(2) },
      },
    },
    'privacy-protection': '0.0',
    premium_dns: '4.0',
  });
  return {
    domcno: entry('8.00'),
    dotnet: entry('9.00'),
    domorg: entry('9.50'),
    dotes: entry('6.00'),
    doteu: entry('5.50'),
  };
}

function defaultCustomerPrice(): RcCustomerPriceResponse {
  const years = (price: number): Record<string, number> =>
    Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [String(i + 1), price]),
    );
  const entry = (p: number): RcCustomerPriceResponse[string] => ({
    addnewdomain: years(p),
    renewdomain: years(p),
    addtransferdomain: { '1': p },
    restoredomain: { '1': p + 35 },
  });
  return {
    domcno: entry(11.99),
    dotnet: entry(12.99),
    domorg: entry(12.99),
    dotes: entry(8.99),
    doteu: entry(7.99),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

export interface MockResellerClubSeed {
  /** Reseller Id exigido. Si se setea (junto a apiKey), el mock valida auth. */
  readonly authUserId?: string;
  /** API key exigida. Si no se setea, modo permisivo. */
  readonly apiKey?: string;
  /** Override de reseller-price (COSTE). Default: 5 TLDs core. */
  readonly resellerPrice?: RcResellerPriceResponse;
  /** Override de customer-price. Default: 5 TLDs core. */
  readonly customerPrice?: RcCustomerPriceResponse;
  /** FQDNs con disponibilidad forzada (p. ej. `{'taken.com':'regthroughothers'}`). */
  readonly availabilityOverrides?: Readonly<
    Record<string, RcAvailabilityStatus>
  >;
  /** SLDs (sin TLD) tratados como premium en `register` → DOMAIN_PREMIUM. */
  readonly premiumDomains?: readonly string[];
  /**
   * Fase 15D.E — order-ids cuyo `domains/renew` responde Success pero NO avanza
   * `endtime` (modela el fallo silencioso que DOM-INV-4 debe atrapar).
   */
  readonly frozenRenewOrderIds?: readonly string[];
  /**
   * Fase 15D.II.T1 — FQDNs forzados como transferibles (override de la convención
   * "registrado en otro registrar"). Sin esto, transferible ⟺ availability ===
   * `regthroughothers` (y el SLD no contiene `locked`/`recent`).
   */
  readonly transferableDomains?: readonly string[];
  /**
   * Fase 15D.II.T1 — auth-code EPP válido esperado por FQDN. Si se setea, el
   * `domains/transfer` exige ese código exacto (else `INVALID_AUTH_CODE`); si no,
   * acepta cualquier código no vacío salvo `INVALID`/`WRONG`.
   */
  readonly transferAuthCodes?: Readonly<Record<string, string>>;
}

export interface MockResellerClubServerOptions {
  readonly port?: number;
  readonly seed?: MockResellerClubSeed;
}

export interface MockResellerClubServerInstance {
  readonly baseUrl: string;
  readonly port: number;
  readonly state: MockResellerClubState;
  reset(): void;
  stop(): Promise<void>;
}

export async function startMockResellerClubServer(
  options: MockResellerClubServerOptions = {},
): Promise<MockResellerClubServerInstance> {
  const seed = options.seed ?? {};
  const state = createInitialState(seed);
  const app = buildApp(state);

  const server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(options.port ?? 0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  const port = address.port;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    port,
    state,
    reset(): void {
      Object.assign(state, createInitialState(seed));
    },
    stop(): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// State in-memory
// ────────────────────────────────────────────────────────────────────────────

interface MockRcCustomer {
  customerid: string;
  username: string;
  name: string;
  company: string;
}
interface MockRcContact {
  contactid: string;
  customerid: string;
  type: string;
  /** Datos WHOIS del contacto (15D.G·2 — contacts/modify + contacts/details). */
  name: string;
  company: string;
  email: string;
  address1: string;
  city: string;
  state: string;
  country: string;
  zip: string;
  telno: string;
}
interface MockRcDomain {
  orderid: string;
  domainname: string;
  customerid: string;
  endtime: number;
  creationtime: number;
  ns: string[];
  regcontactid: string;
  admincontactid: string;
  techcontactid: string;
  billingcontactid: string;
  privacyprotected: boolean;
  theftprotection: boolean;
  suspended: boolean;
  /** Auth/EPP code (transfer-out). Sembrado al registrar; `get_auth_code` lo lee. */
  domsecret: string;
  /** Fase 15D.II.T1 — estado del transfer-in (undefined = dominio normal, no transferido). */
  transferStatus?: 'submitted' | 'completed' | 'failed' | 'cancelled';
  /** Fase 15D.II.R — dominio en redención (RGP); `domains/restore` lo recupera. */
  inRedemption?: boolean;
}

export interface MockResellerClubState {
  authUserId: string | undefined;
  apiKey: string | undefined;
  nextCustomerId: number;
  nextContactId: number;
  nextOrderId: number;
  resellerPrice: RcResellerPriceResponse;
  customerPrice: RcCustomerPriceResponse;
  availabilityOverrides: Map<string, RcAvailabilityStatus>;
  premiumDomains: Set<string>;
  frozenRenewOrderIds: Set<string>;
  transferableDomains: Set<string>;
  transferAuthCodes: Map<string, string>;
  customersByEmail: Map<string, MockRcCustomer>;
  customersById: Map<string, MockRcCustomer>;
  contactsById: Map<string, MockRcContact>;
  domainsByName: Map<string, MockRcDomain>;
  domainsByOrderId: Map<string, MockRcDomain>;
  requestLog: { method: string; path: string }[];
}

function createInitialState(seed: MockResellerClubSeed): MockResellerClubState {
  return {
    authUserId: seed.authUserId,
    apiKey: seed.apiKey,
    nextCustomerId: 33_566_000,
    nextContactId: 134_143_000,
    nextOrderId: 90_000_000,
    resellerPrice: seed.resellerPrice ?? defaultResellerPrice(),
    customerPrice: seed.customerPrice ?? defaultCustomerPrice(),
    availabilityOverrides: new Map(
      Object.entries(seed.availabilityOverrides ?? {}),
    ),
    premiumDomains: new Set(seed.premiumDomains ?? []),
    frozenRenewOrderIds: new Set(seed.frozenRenewOrderIds ?? []),
    transferableDomains: new Set(
      (seed.transferableDomains ?? []).map((d) => d.toLowerCase()),
    ),
    transferAuthCodes: new Map(
      Object.entries(seed.transferAuthCodes ?? {}).map(([k, v]) => [
        k.toLowerCase(),
        v,
      ]),
    ),
    customersByEmail: new Map(),
    customersById: new Map(),
    contactsById: new Map(),
    domainsByName: new Map(),
    domainsByOrderId: new Map(),
    requestLog: [],
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Express app
// ────────────────────────────────────────────────────────────────────────────

function buildApp(state: MockResellerClubState): express.Express {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use((req: Request, _res: Response, next: NextFunction) => {
    state.requestLog.push({ method: req.method, path: req.path });
    next();
  });

  // Auth (excepto /__test__/*). Auth inválida → envoltorio de negocio (HTTP 200).
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/__test__')) return next();
    if (state.apiKey === undefined) return next();
    const p = readParams(req);
    if (
      str(p, 'auth-userid') !== state.authUserId ||
      str(p, 'api-key') !== state.apiKey
    ) {
      rcError(res, 'Authentication Failed: invalid api-key');
      return;
    }
    next();
  });

  registerRoutes(app, state);
  registerTestSeedRoute(app, state);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ status: 'ERROR', message: 'mock route not found' });
  });
  return app;
}

function registerRoutes(
  app: express.Express,
  state: MockResellerClubState,
): void {
  // ─── Pre-venta ──────────────────────────────────────────────────────────
  app.get('/domains/available.json', (req, res) => {
    const p = readParams(req);
    const sld = str(p, 'domain-name') ?? '';
    const tlds = arr(p, 'tlds');
    const out: Record<
      string,
      { classkey: string; status: RcAvailabilityStatus }
    > = {};
    for (const tld of tlds) {
      const fqdn = `${sld}.${tld}`;
      out[fqdn] = {
        classkey: TLD_CLASSKEY[tld] ?? `dot${tld}`,
        status: availabilityFor(state, fqdn, sld),
      };
    }
    res.json(out);
  });

  app.get('/products/reseller-price.json', (_req, res) => {
    res.json(state.resellerPrice);
  });
  app.get('/products/customer-price.json', (_req, res) => {
    res.json(state.customerPrice);
  });

  // ─── Customer + contact ───────────────────────────────────────────────────
  app.post('/customers/signup.json', (req, res) => {
    const p = readParams(req);
    const email = str(p, 'username') ?? '';
    if (state.customersByEmail.has(email)) {
      rcError(res, `Customer ${email} already exists`);
      return;
    }
    const id = String(state.nextCustomerId++);
    const customer: MockRcCustomer = {
      customerid: id,
      username: email,
      name: str(p, 'name') ?? '',
      company: str(p, 'company') ?? '',
    };
    state.customersByEmail.set(email, customer);
    state.customersById.set(id, customer);
    res.json(Number(id)); // id escalar (findings §4.5)
  });

  app.get('/customers/search.json', (req, res) => {
    const p = readParams(req);
    const email = str(p, 'username') ?? '';
    const c = state.customersByEmail.get(email);
    if (!c) {
      res.json({ recsonpage: '0', recsindb: '0' });
      return;
    }
    res.json({
      recsonpage: '1',
      recsindb: '1',
      '1': { customerid: Number(c.customerid), username: c.username },
    });
  });

  app.get('/customers/details-by-id.json', (req, res) => {
    const p = readParams(req);
    const c = state.customersById.get(str(p, 'customer-id') ?? '');
    if (!c) {
      rcError(res, `Customer not found`, { httpStatus: 500 });
      return;
    }
    res.json({
      customerid: c.customerid,
      username: c.username,
      name: c.name,
      company: c.company,
    });
  });

  app.post('/contacts/add.json', (req, res) => {
    const p = readParams(req);
    const type = str(p, 'type') ?? 'Contact';
    // DOM-INV-5: .es exige es_tipo_identificacion (NIF/NIE) en attr-*.
    if (type === 'EsContact' && !hasEsIdentification(p)) {
      rcError(
        res,
        'es_tipo_identificacion (NIF) is required for .es registrant',
      );
      return;
    }
    const id = String(state.nextContactId++);
    state.contactsById.set(id, {
      contactid: id,
      customerid: str(p, 'customer-id') ?? '',
      type,
      ...contactDetailsFromParams(p),
    });
    res.json(Number(id)); // id escalar
  });

  // ─── Modificar / leer la entidad contacto (15D.G·2) ─────────────────────────
  app.post('/contacts/modify.json', (req, res) => {
    const p = readParams(req);
    const c = state.contactsById.get(str(p, 'contact-id') ?? '');
    if (!c) {
      rcError(res, 'Contact not found', { lowercase: true });
      return;
    }
    // .es conserva la exigencia de NIF al modificar (DOM-INV-5).
    if (c.type === 'EsContact' && !hasEsIdentification(p)) {
      rcError(
        res,
        'es_tipo_identificacion (NIF) is required for .es registrant',
      );
      return;
    }
    Object.assign(c, contactDetailsFromParams(p));
    res.json({ entityid: Number(c.contactid), actionstatus: 'Success' });
  });

  app.get('/contacts/details.json', (req, res) => {
    const p = readParams(req);
    const c = state.contactsById.get(str(p, 'contact-id') ?? '');
    if (!c) {
      rcError(res, 'Contact not found', { httpStatus: 500 });
      return;
    }
    res.json({
      contactid: c.contactid,
      name: c.name,
      company: c.company,
      emailaddr: c.email,
      telno: c.telno,
      address1: c.address1,
      city: c.city,
      state: c.state,
      country: c.country,
      zip: c.zip,
    });
  });

  // ─── Ciclo de vida ────────────────────────────────────────────────────────
  app.post('/domains/register.json', (req, res) => {
    const p = readParams(req);
    const fqdn = (str(p, 'domain-name') ?? '').toLowerCase();
    const sld = fqdn.split('.')[0];
    if (
      state.domainsByName.has(fqdn) ||
      availabilityFor(state, fqdn, sld) !== 'available'
    ) {
      rcError(res, `Domain ${fqdn} not available for registration`, {
        lowercase: true,
      });
      return;
    }
    if (state.premiumDomains.has(sld)) {
      rcError(res, `${fqdn} is a premium domain`, { lowercase: true });
      return;
    }
    const years = num(p, 'years') ?? 1;
    const orderId = String(state.nextOrderId++);
    const now = Math.floor(Date.now() / 1000);
    const domain: MockRcDomain = {
      orderid: orderId,
      domainname: fqdn,
      customerid: str(p, 'customer-id') ?? '',
      creationtime: now,
      endtime: now + years * 365 * 24 * 3600,
      ns: arr(p, 'ns'),
      regcontactid: str(p, 'reg-contact-id') ?? '',
      admincontactid: str(p, 'admin-contact-id') ?? '',
      techcontactid: str(p, 'tech-contact-id') ?? '',
      billingcontactid: str(p, 'billing-contact-id') ?? '',
      privacyprotected: str(p, 'protect-privacy') === 'true',
      theftprotection: false,
      suspended: false,
      domsecret: `Auth-${orderId}`,
    };
    state.domainsByName.set(fqdn, domain);
    state.domainsByOrderId.set(orderId, domain);
    res.json({
      entityid: Number(orderId),
      actionstatus: 'Success',
      description: fqdn,
    });
  });

  app.post('/domains/renew.json', (req, res) => {
    const p = readParams(req);
    const d = state.domainsByOrderId.get(str(p, 'order-id') ?? '');
    if (!d) {
      rcError(res, 'Order not found', { lowercase: true });
      return;
    }
    const years = num(p, 'years') ?? 1;
    // Fase 15D.E: order-ids "congelados" responden Success sin extender el
    // endtime → ejercita la verificación DOM-INV-4 del plugin.
    if (!state.frozenRenewOrderIds.has(d.orderid)) {
      d.endtime += years * 365 * 24 * 3600; // DOM-INV-4: la fecha avanza
    }
    res.json({ entityid: Number(d.orderid), actionstatus: 'Success' });
  });

  app.get('/domains/details-by-name.json', (req, res) => {
    const p = readParams(req);
    sendDomainDetails(
      res,
      state.domainsByName.get((str(p, 'domain-name') ?? '').toLowerCase()),
    );
  });
  app.get('/domains/details.json', (req, res) => {
    const p = readParams(req);
    sendDomainDetails(
      res,
      state.domainsByOrderId.get(str(p, 'order-id') ?? ''),
    );
  });

  app.get('/domains/search.json', (_req, res) => {
    const domains = [...state.domainsByOrderId.values()];
    const out: Record<string, unknown> = {
      recsonpage: String(domains.length),
      recsindb: String(domains.length),
    };
    domains.forEach((d, i) => {
      out[String(i + 1)] = {
        orderid: d.orderid,
        'entity.entityid': d.orderid,
        domainname: d.domainname,
        endtime: String(d.endtime),
      };
    });
    res.json(out);
  });

  // ─── Transfer-in (Sprint 15D.II Fase T1) ────────────────────────────────────
  registerTransferRoutes(app, state);

  // ─── Gestión curada ─────────────────────────────────────────────────────
  registerManagementRoutes(app, state);

  // ─── Admin ────────────────────────────────────────────────────────────────
  app.post('/orders/suspend.json', (req, res) =>
    mutateDomain(state, req, res, (d) => (d.suspended = true)),
  );
  app.post('/orders/unsuspend.json', (req, res) =>
    mutateDomain(state, req, res, (d) => (d.suspended = false)),
  );

  // Borrado en gracia (15D.G·2): elimina el dominio del registrador.
  app.post('/domains/delete.json', (req, res) => {
    const d = state.domainsByOrderId.get(
      str(readParams(req), 'order-id') ?? '',
    );
    if (!d) {
      rcError(res, 'Order not found', { lowercase: true });
      return;
    }
    state.domainsByOrderId.delete(d.orderid);
    state.domainsByName.delete(d.domainname);
    res.json({ entityid: Number(d.orderid), actionstatus: 'Success' });
  });

  // Restore RGP (15D.II.R): recupera un dominio en redención → active + extiende
  // endtime (RC renueva 1 año al restaurar). Fuera de redención RC también acepta
  // (es idempotente para el mock); el fee lo controla Aelium.
  app.post('/domains/restore.json', (req, res) => {
    const d = state.domainsByOrderId.get(
      str(readParams(req), 'order-id') ?? '',
    );
    if (!d) {
      rcError(res, 'Order not found', { lowercase: true });
      return;
    }
    d.inRedemption = false;
    const now = Math.floor(Date.now() / 1000);
    if (d.endtime < now) d.endtime = now + 365 * 24 * 3600;
    res.json({ entityid: Number(d.orderid), actionstatus: 'Success' });
  });

  // Test-only (15D.II.R): marca un order-id como en redención (espejo de
  // `/__test__/advance-transfer`) para ejercitar el flujo restore de extremo a extremo.
  app.post('/__test__/set-redemption', (req, res) => {
    const d = state.domainsByOrderId.get(
      str(readParams(req), 'order-id') ?? '',
    );
    if (!d) {
      res.status(404).json({ error: 'order not found' });
      return;
    }
    d.inRedemption = true;
    res.json({ ok: true });
  });
}

function registerManagementRoutes(
  app: express.Express,
  state: MockResellerClubState,
): void {
  app.post('/domains/modify-ns.json', (req, res) =>
    mutateDomain(state, req, res, (d) => (d.ns = arr(readParams(req), 'ns'))),
  );
  app.post('/domains/modify-contact.json', (req, res) =>
    mutateDomain(state, req, res, (d) => {
      const p = readParams(req);
      d.regcontactid = str(p, 'reg-contact-id') ?? d.regcontactid;
      d.admincontactid = str(p, 'admin-contact-id') ?? d.admincontactid;
      d.techcontactid = str(p, 'tech-contact-id') ?? d.techcontactid;
      d.billingcontactid = str(p, 'billing-contact-id') ?? d.billingcontactid;
    }),
  );
  app.post('/domains/modify-privacy-protection.json', (req, res) =>
    mutateDomain(
      state,
      req,
      res,
      (d) =>
        (d.privacyprotected =
          str(readParams(req), 'protect-privacy') === 'true'),
    ),
  );
  app.post('/domains/modify-auth-code.json', (req, res) =>
    mutateDomain(state, req, res, (d) => {
      // El setter de auth-code round-trip-ea con `domains/details.domsecret`.
      d.domsecret = str(readParams(req), 'auth-code') ?? d.domsecret;
    }),
  );
  app.post('/domains/enable-theft-protection.json', (req, res) =>
    mutateDomain(state, req, res, (d) => (d.theftprotection = true)),
  );
  app.post('/domains/disable-theft-protection.json', (req, res) =>
    mutateDomain(state, req, res, (d) => (d.theftprotection = false)),
  );
}

/**
 * Transfer-in (15D.II.T1). Modela la asincronía con una FSM simulable: el
 * `transfer` deja el dominio en `submitted`; el avance a `completed`/`failed` lo
 * dispara el endpoint test-only `/__test__/advance-transfer` (determinista, sin
 * timers). El estado viaja en `domains/details.actionstatus` (lo leerá el
 * reconcile en T2). Errores de alta fidelidad: no transferible → TRANSFER_REJECTED,
 * auth-code inválido → INVALID_AUTH_CODE (mapeados por errors.ts).
 */
function registerTransferRoutes(
  app: express.Express,
  state: MockResellerClubState,
): void {
  // Pre-flight: ¿es transferible? (no inicia nada)
  app.get('/domains/validate-transfer.json', (req, res) => {
    const p = readParams(req);
    const fqdn = (str(p, 'domain-name') ?? '').toLowerCase();
    const sld = fqdn.split('.')[0];
    const transferable = isTransferable(state, fqdn, sld);
    const body: { domainname: string; transferable: boolean; reason?: string } =
      { domainname: fqdn, transferable };
    if (!transferable) body.reason = transferReason(fqdn, sld);
    res.json(body);
  });

  // Inicia el transfer-in (asíncrono → estado `submitted` en el mock).
  app.post('/domains/transfer.json', (req, res) => {
    const p = readParams(req);
    const fqdn = (str(p, 'domain-name') ?? '').toLowerCase();
    const sld = fqdn.split('.')[0];
    if (state.domainsByName.has(fqdn)) {
      rcError(res, `Domain ${fqdn} is already in this account`, {
        lowercase: true,
      });
      return;
    }
    if (!isTransferable(state, fqdn, sld)) {
      rcError(
        res,
        `transfer rejected for ${fqdn}: ${transferReason(fqdn, sld)}`,
        {
          lowercase: true,
        },
      );
      return;
    }
    if (!isValidTransferAuthCode(state, fqdn, str(p, 'auth-code') ?? '')) {
      rcError(res, 'invalid authorization code (EPP auth-code) for transfer', {
        lowercase: true,
      });
      return;
    }
    const orderId = String(state.nextOrderId++);
    const now = Math.floor(Date.now() / 1000);
    const domain: MockRcDomain = {
      orderid: orderId,
      domainname: fqdn,
      customerid: str(p, 'customer-id') ?? '',
      creationtime: now,
      endtime: now, // se fija al completar el transfer (advance)
      ns: arr(p, 'ns'),
      regcontactid: str(p, 'reg-contact-id') ?? '',
      admincontactid: str(p, 'admin-contact-id') ?? '',
      techcontactid: str(p, 'tech-contact-id') ?? '',
      billingcontactid: str(p, 'billing-contact-id') ?? '',
      privacyprotected: str(p, 'protect-privacy') === 'true',
      theftprotection: false,
      suspended: false,
      domsecret: `Auth-${orderId}`,
      transferStatus: 'submitted',
    };
    state.domainsByName.set(fqdn, domain);
    state.domainsByOrderId.set(orderId, domain);
    res.json({
      entityid: Number(orderId),
      actionstatus: 'InProgress',
      actiontype: 'AddTransferDomain',
      description: fqdn,
    });
  });

  // Reenvía el correo de autorización (RFA) — éxito sobre un transfer en curso.
  app.post('/domains/resend-rfa.json', (req, res) =>
    mutateTransfer(state, req, res, () => {}, ['submitted']),
  );

  // Cancela un transfer-in en curso.
  app.post('/domains/cancel-transfer.json', (req, res) =>
    mutateTransfer(
      state,
      req,
      res,
      (d) => {
        d.transferStatus = 'cancelled';
      },
      ['submitted'],
    ),
  );
}

function registerTestSeedRoute(
  app: express.Express,
  state: MockResellerClubState,
): void {
  app.post('/__test__/seed', (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Partial<MockResellerClubSeed>;
    if (body.availabilityOverrides) {
      for (const [k, v] of Object.entries(body.availabilityOverrides)) {
        state.availabilityOverrides.set(k, v);
      }
    }
    if (body.premiumDomains) {
      for (const sld of body.premiumDomains) state.premiumDomains.add(sld);
    }
    if (body.frozenRenewOrderIds) {
      for (const id of body.frozenRenewOrderIds) {
        state.frozenRenewOrderIds.add(id);
      }
    }
    if (body.transferableDomains) {
      for (const d of body.transferableDomains) {
        state.transferableDomains.add(d.toLowerCase());
      }
    }
    if (body.transferAuthCodes) {
      for (const [k, v] of Object.entries(body.transferAuthCodes)) {
        state.transferAuthCodes.set(k.toLowerCase(), v);
      }
    }
    if (body.resellerPrice) state.resellerPrice = body.resellerPrice;
    if (body.customerPrice) state.customerPrice = body.customerPrice;
    res.json({ ok: true });
  });

  // Fase 15D.II.T1 — avanza la FSM de un transfer-in (test-only, determinista).
  app.post('/__test__/advance-transfer', (req: Request, res: Response) => {
    const body = (req.body ?? {}) as {
      orderId?: string | number;
      domainName?: string;
      to?: string;
    };
    const d =
      body.orderId !== undefined
        ? state.domainsByOrderId.get(String(body.orderId))
        : state.domainsByName.get(String(body.domainName ?? '').toLowerCase());
    if (!d || !d.transferStatus) {
      res
        .status(404)
        .json({ status: 'ERROR', message: 'no transfer order to advance' });
      return;
    }
    if (body.to === 'failed') {
      d.transferStatus = 'failed';
    } else {
      d.transferStatus = 'completed';
      const now = Math.floor(Date.now() / 1000);
      d.creationtime = now;
      d.endtime = now + 365 * 24 * 3600; // período del registro entrante
    }
    res.json({ ok: true, transferStatus: d.transferStatus });
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function availabilityFor(
  state: MockResellerClubState,
  fqdn: string,
  sld: string,
): RcAvailabilityStatus {
  const override = state.availabilityOverrides.get(fqdn);
  if (override) return override;
  if (state.domainsByName.has(fqdn)) return 'regthroughus';
  // Convención de fidelidad: "google"/"taken" se consideran no disponibles.
  if (sld === 'google' || sld.includes('taken')) return 'regthroughothers';
  return 'available';
}

function sendDomainDetails(res: Response, d: MockRcDomain | undefined): void {
  if (!d) {
    rcError(res, "Website doesn't exist", { httpStatus: 500 });
    return;
  }
  const body: Record<string, unknown> = {
    orderid: d.orderid,
    entityid: d.orderid,
    domainname: d.domainname,
    entitystatus: d.suspended ? 'Suspended' : 'Active',
    // El registrar/theft lock viaja en los ejes de estado (lo lee
    // `detectRegistrarLock` → `/transferlock/`). Fidelidad read-after-write
    // de `toggle_registrar_lock` (15D.F).
    currentstatus: d.theftprotection ? 'transferlock' : 'ok',
    creationtime: String(d.creationtime),
    endtime: String(d.endtime),
    ns1: d.ns[0],
    ns2: d.ns[1],
    ns3: d.ns[2],
    ns4: d.ns[3],
    registrantcontactid: d.regcontactid,
    admincontactid: d.admincontactid,
    techcontactid: d.techcontactid,
    billingcontactid: d.billingcontactid,
    isprivacyprotected: d.privacyprotected,
    // Auth/EPP code para `get_auth_code` (no se expone en `DomainInfo`; R12).
    domsecret: d.domsecret,
  };
  // Transfer-in en curso: expone el estado de la acción (15D.II.T1) para el
  // reconcile (T2). Un transfer completado/normal NO lleva actionstatus.
  if (d.transferStatus === 'submitted') body.actionstatus = 'InProgress';
  else if (d.transferStatus === 'failed') body.actionstatus = 'Failed';
  else if (d.transferStatus === 'cancelled') body.actionstatus = 'Cancelled';
  // Redención (15D.II.R): el eje de estado lleva el marcador RGP que
  // `mapRcDomainStatus` detecta (/redemption|rgp/) → lifecycle='redemption'.
  if (d.inRedemption) body.orderstatus = ['renewhold', 'rgp'];
  res.json(body);
}

function mutateDomain(
  state: MockResellerClubState,
  req: Request,
  res: Response,
  apply: (d: MockRcDomain) => void,
): void {
  const d = state.domainsByOrderId.get(str(readParams(req), 'order-id') ?? '');
  if (!d) {
    rcError(res, 'Order not found', { lowercase: true });
    return;
  }
  apply(d);
  res.json({ entityid: Number(d.orderid), actionstatus: 'Success' });
}

/** Aplica una acción a un transfer-in en curso si su estado lo permite (15D.II.T1). */
function mutateTransfer(
  state: MockResellerClubState,
  req: Request,
  res: Response,
  apply: (d: MockRcDomain) => void,
  allowed: readonly NonNullable<MockRcDomain['transferStatus']>[],
): void {
  const d = state.domainsByOrderId.get(str(readParams(req), 'order-id') ?? '');
  if (!d || !d.transferStatus) {
    rcError(res, 'no transfer order found', { lowercase: true });
    return;
  }
  if (!allowed.includes(d.transferStatus)) {
    rcError(res, `transfer action not allowed in status ${d.transferStatus}`, {
      lowercase: true,
    });
    return;
  }
  apply(d);
  res.json({ entityid: Number(d.orderid), actionstatus: 'Success' });
}

/** ¿Es transferible? (registrado en otro registrar, sin lock, fuera de 60d). 15D.II.T1. */
function isTransferable(
  state: MockResellerClubState,
  fqdn: string,
  sld: string,
): boolean {
  if (state.domainsByName.has(fqdn)) return false; // ya en nuestra cuenta / en transfer
  if (sld.includes('locked') || sld.includes('recent')) return false; // lock / <60d
  if (state.transferableDomains.has(fqdn)) return true; // override seed
  return availabilityFor(state, fqdn, sld) === 'regthroughothers';
}

/** Razón por la que NO es transferible (el texto mapea a TRANSFER_REJECTED en errors.ts). */
function transferReason(fqdn: string, sld: string): string {
  if (sld.includes('locked')) {
    return 'registrar lock is enabled at the losing registrar';
  }
  if (sld.includes('recent')) {
    return 'transfer not allowed within 60 days of registration';
  }
  return `domain ${fqdn} is not registered with another registrar (nothing to transfer)`;
}

/** Valida el auth-code EPP: con seed exige coincidencia exacta; si no, acepta no-vacío ≠ INVALID/WRONG. */
function isValidTransferAuthCode(
  state: MockResellerClubState,
  fqdn: string,
  code: string,
): boolean {
  const expected = state.transferAuthCodes.get(fqdn);
  if (expected !== undefined) return code === expected;
  const c = code.trim().toUpperCase();
  return c.length > 0 && c !== 'INVALID' && c !== 'WRONG';
}

function hasEsIdentification(p: Record<string, unknown>): boolean {
  const names = arr(p, 'attr-name');
  return names.includes('es_tipo_identificacion');
}

/** Datos WHOIS del contacto desde los params (add/modify). */
function contactDetailsFromParams(
  p: Record<string, unknown>,
): Omit<MockRcContact, 'contactid' | 'customerid' | 'type'> {
  return {
    name: str(p, 'name') ?? '',
    company: str(p, 'company') ?? '',
    email: str(p, 'email') ?? '',
    address1: str(p, 'address-line-1') ?? '',
    city: str(p, 'city') ?? '',
    state: str(p, 'state') ?? '',
    country: str(p, 'country') ?? '',
    zip: str(p, 'zipcode') ?? '',
    telno: str(p, 'phone') ?? '',
  };
}

/** Envoltorio de error de negocio RC (findings §4.7). Por defecto mayúscula/HTTP 200. */
function rcError(
  res: Response,
  message: string,
  opts: { lowercase?: boolean; httpStatus?: number } = {},
): void {
  const status = opts.httpStatus ?? 200;
  if (opts.lowercase) {
    res.status(status).json({ status: 'error', error: message });
  } else {
    res.status(status).json({ status: 'ERROR', message });
  }
}

function readParams(req: Request): Record<string, unknown> {
  const q = req.query as Record<string, unknown>;
  const b = (req.body ?? {}) as Record<string, unknown>;
  return { ...q, ...b };
}

function str(p: Record<string, unknown>, key: string): string | undefined {
  const v = p[key];
  return typeof v === 'string' ? v : undefined;
}

function num(p: Record<string, unknown>, key: string): number | undefined {
  const v = p[key];
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && /^\d+$/.test(v)) return Number(v);
  return undefined;
}

function arr(p: Record<string, unknown>, key: string): string[] {
  const v = p[key];
  if (Array.isArray(v))
    return v.filter((x): x is string => typeof x === 'string');
  if (typeof v === 'string') return [v];
  return [];
}
