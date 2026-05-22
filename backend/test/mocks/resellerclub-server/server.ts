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
    });
    res.json(Number(id)); // id escalar
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
    d.endtime += years * 365 * 24 * 3600; // DOM-INV-4: la fecha avanza
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

  // ─── Gestión curada ─────────────────────────────────────────────────────
  registerManagementRoutes(app, state);

  // ─── Admin ────────────────────────────────────────────────────────────────
  app.post('/orders/suspend.json', (req, res) =>
    mutateDomain(state, req, res, (d) => (d.suspended = true)),
  );
  app.post('/orders/unsuspend.json', (req, res) =>
    mutateDomain(state, req, res, (d) => (d.suspended = false)),
  );
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
    mutateDomain(state, req, res, () => undefined),
  );
  app.post('/domains/enable-theft-protection.json', (req, res) =>
    mutateDomain(state, req, res, (d) => (d.theftprotection = true)),
  );
  app.post('/domains/disable-theft-protection.json', (req, res) =>
    mutateDomain(state, req, res, (d) => (d.theftprotection = false)),
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
    if (body.resellerPrice) state.resellerPrice = body.resellerPrice;
    if (body.customerPrice) state.customerPrice = body.customerPrice;
    res.json({ ok: true });
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
  res.json({
    orderid: d.orderid,
    entityid: d.orderid,
    domainname: d.domainname,
    entitystatus: d.suspended ? 'Suspended' : 'Active',
    currentstatus: 'ok',
    creationtime: String(d.creationtime),
    endtime: String(d.endtime),
    ns1: d.ns[0],
    ns2: d.ns[1],
    registrantcontactid: d.regcontactid,
    admincontactid: d.admincontactid,
    techcontactid: d.techcontactid,
    billingcontactid: d.billingcontactid,
    isprivacyprotected: d.privacyprotected,
  });
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

function hasEsIdentification(p: Record<string, unknown>): boolean {
  const names = arr(p, 'attr-name');
  return names.includes('es_tipo_identificacion');
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
