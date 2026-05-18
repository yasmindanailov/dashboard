/**
 * Sprint 15C Fase 15C.B — `MockEnhanceServer` Express stub canónico.
 *
 * Materializa ADR-083 §7 decisión 25 + Amendment A1 (2026-05-08). Express
 * stub local que responde a los endpoints orchd v12.21.3 con shapes
 * canónicos del spec literal
 * (`docs/_research/sprint-15c/orchd-oas3-api.yaml`).
 *
 * UBICACIÓN CANÓNICA: `backend/test/mocks/enhance-server/`
 *   (formalizada por ADR-083 Amendment A1 — la decisión 25 original
 *    declaraba `tests/mocks/enhance-server/` en raíz del repo; la
 *    implementación detectó que jest del backend resuelve módulos
 *    relativos sin tsconfig paths cross-package, por lo que el path
 *    canónico se actualizó a `backend/test/mocks/<plugin-slug>-server/`
 *    como patrón aplicable también a futuros plugins SaaS).
 *
 * Cubre los 28 endpoints que el cliente Enhance API toca + persistencia
 * in-memory por instancia (seedable + resetable). Para CI E2E (ADR-083
 * §7 decisión 27): este mock se levanta en cada suite test integration y
 * se mata al teardown.
 *
 * Doctrina:
 *   - Auth opcional: si `seed.apiToken` se setea, todos los endpoints (excepto
 *     `/version`) requieren `Authorization: Bearer <apiToken>`. Si no hay 401.
 *     Si `apiToken` no se setea, el mock acepta cualquier token (modo permisivo
 *     para tests que NO verifican auth).
 *   - Idempotencia: POST que crea recurso con email existente devuelve 409
 *     Conflict (mismo comportamiento Enhance) — el plugin lo gestiona via
 *     `searchCustomersByEmail` + insert mapping.
 *   - Datos: shapes canónicos del spec, sin campos extraños. Lo que el
 *     plugin necesite extra puede sembrarse via `seed.customers[]`.
 *   - Stateless entre `start()`s pero stateful durante el lifecycle del server
 *     (state persists across requests). `reset()` limpia el state sin matar
 *     el servidor.
 */

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { AddressInfo } from 'node:net';

import express, { Request, Response, NextFunction } from 'express';

import {
  EnhanceCustomersListing,
  EnhanceDefaultDnsRecord,
  EnhanceDnsRecord,
  EnhanceDnsRecordKind,
  EnhanceDnsZone,
  EnhanceJoomlaInfo,
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
  EnhanceSubscription,
  EnhanceUpdateDefaultDnsRecord,
  EnhanceUpdateDnsRecord,
  EnhanceUpdateSubscription,
  EnhanceDomainSslCert,
  EnhanceUpdateWebsite,
  EnhanceUsedResourcesFullListing,
  EnhanceWebsite,
  EnhanceWebsiteApp,
  EnhanceWordPressInfo,
  EnhanceWpUser,
} from '../../../src/plugins/provisioners/enhance_cp/api/types';

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

/** Customer pre-sembrado en el mock para tests que asumen su existencia. */
export interface MockEnhanceSeededCustomer {
  readonly orgId: string;
  readonly email: string;
  readonly name: string;
  readonly ownerLoginId?: string;
  readonly ownerMemberId?: string;
}

export interface MockEnhanceSeed {
  /**
   * UUID del Master org. Default `'00000000-0000-0000-0000-00000000aaaa'`.
   * El mock devolverá este id en GET /orgs/{masterOrgId} si coincide.
   */
  readonly masterOrgId?: string;

  /**
   * Token Bearer aceptado. Si se setea, todos los endpoints (excepto /version)
   * requieren `Authorization: Bearer <apiToken>`. Si no se setea, modo permisivo.
   */
  readonly apiToken?: string;

  /** Customers pre-sembrados con sus owners ya creados. */
  readonly customers?: readonly MockEnhanceSeededCustomer[];

  /**
   * Default DNS records cluster-wide pre-sembrados. Útil para tests que
   * verifican el bootstrap del plugin (ADR-083 §5 decisión 20).
   */
  readonly defaultDnsRecords?: readonly EnhanceDefaultDnsRecord[];

  /**
   * Versión SemVer reportada en GET /version. Default `'12.21.3'` (la
   * versión del spec literal capturado).
   */
  readonly version?: string;

  /**
   * Sprint 15C.II Fase F.7 — ADR-083 Amendment A8.6.
   *
   * Certs SSL pre-sembrados por `domainId` (UUID del `EnhanceWebsiteDomain`).
   * **No** se necesita sembrarlos manualmente para el flujo nominal — al
   * crear un website (`POST /orgs/{org}/websites`), el mock auto-siembra un
   * cert LetsEncrypt con `expires = now + 60d` para el `domain.id` recién
   * creado (espejo del behaviour real de orchd con LE auto-issuance).
   *
   * Útil para tests que quieran probar otros estados (`expiring_soon`,
   * `expired`, `none`, custom issuer) — el seed sobreescribe el default,
   * o el test usa `state.domainSsls.set(domainId, customCert)` /
   * `state.domainSsls.delete(domainId)` antes del test.
   */
  readonly domainSsls?: Readonly<Record<string, EnhanceDomainSslCert>>;

  /**
   * Sprint 15C.II Fase F.10 — smoke real (2026-05-18) — `DC.49` parcial.
   *
   * Websites pre-sembrados por `websiteId`. Útil para smokes E2E que
   * necesitan apps instaladas sin pasar por el flujo de provisioning real
   * (que requiere `POST /websites`). Sin pre-seed de websites, el endpoint
   * `GET /websites/:id/apps` responde 404 NotFound por la check
   * `state.websites.get(websiteId)` — apps no se pueden testear aisladamente.
   *
   * Pre-condición canónica: si seedeas `websiteApps[wsId]` también debes
   * seedear `websites` con un `EnhanceWebsite` cuyo `id === wsId` (la
   * route handler `resolveApp` verifica `ws.orgId === orgId` también, así
   * que el `orgId` debe coincidir con el del request — típicamente el
   * customer seedeado `customers[].orgId`).
   */
  readonly websites?: readonly EnhanceWebsite[];

  /**
   * Sprint 15C.II Fase F.10 — ADR-083 Amendment A9.4.
   *
   * Apps CMS instaladas pre-sembradas por `websiteId`. La **ausencia** de
   * entrada para un websiteId equivale a "el website existe pero no tiene
   * apps instaladas" → GET /apps responde 200 con `{items: []}`.
   *
   * NO se auto-siembra en `POST /websites` — las apps las instala el
   * cliente explícitamente en el panel (o via F.10.y futuro install desde
   * dashboard, `DC.NEW-52`). Tests que necesiten apps las semillan con
   * `seed.websiteApps[websiteId] = [...]` o las añaden runtime via
   * `state.websiteApps.set(websiteId, [...])`.
   *
   * Mapa también de WP users por `appId` cuando aplique — el mock devuelve
   * el primer user del array como "default SSO user" si el `WebsiteApp`
   * lleva `defaultWpUserId` (espejo del listado de orchd).
   */
  readonly websiteApps?: Readonly<Record<string, readonly EnhanceWebsiteApp[]>>;

  /**
   * Sprint 15C.II Fase F.10 — ADR-083 Amendment A9.4 (overrides
   * opcionales).
   *
   * Snapshots per-kind pre-sembrados por `appId` para los endpoints
   * `getWordpressInfo` / `getJoomlaInfo`. Si no se siembran, el mock
   * devuelve defaults sintéticos (version coherente con la del
   * `WebsiteApp`, `site_url` derivado del primary domain del website
   * que contenga la app, counts sintéticos).
   */
  readonly wordpressInfoByAppId?: Readonly<
    Record<string, EnhanceWordPressInfo>
  >;
  readonly joomlaInfoByAppId?: Readonly<Record<string, EnhanceJoomlaInfo>>;
}

export interface MockEnhanceServerOptions {
  /** Puerto. Default 0 = ephemeral (Node OS asigna). */
  readonly port?: number;
  readonly seed?: MockEnhanceSeed;
}

export interface MockEnhanceServerInstance {
  /** URL completa del mock (`http://127.0.0.1:<port>`). */
  readonly baseUrl: string;
  readonly port: number;

  /** State expuesto para inspección/aserción en tests. */
  readonly state: MockEnhanceState;

  /** Reinicia el state sin matar el servidor (útil entre tests). */
  reset(): void;

  /** Detiene el servidor y libera el puerto. */
  stop(): Promise<void>;
}

/**
 * Levanta una instancia del MockEnhanceServer. Cada test integration crea
 * su propia instancia + `stop()` en `afterAll`. Puerto ephemeral evita
 * colisiones cross-suite.
 */
export async function startMockEnhanceServer(
  options: MockEnhanceServerOptions = {},
): Promise<MockEnhanceServerInstance> {
  const seed = options.seed ?? {};
  const state = createInitialState(seed);
  const app = buildApp(state);

  const server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(options.port ?? 0, '127.0.0.1', resolve);
  });

  const address = server.address() as AddressInfo;
  const port = address.port;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
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

export interface MockEnhanceState {
  apiToken: string | undefined;
  version: string;
  masterOrgId: string;
  /** orgId → Org (incluye master + customers). */
  orgs: Map<string, EnhanceOrg>;
  /** loginId → login info. */
  logins: Map<
    string,
    { email: string; password: string; name: string; orgId: string }
  >;
  /** memberId → Member. */
  members: Map<string, EnhanceMember & { orgId: string }>;
  /** subscriptionId (integer) → Subscription. */
  subscriptions: Map<number, EnhanceSubscription>;
  /** websiteId → Website. */
  websites: Map<string, EnhanceWebsite>;
  /** zoneKey (= `${websiteId}|${domain}`) → DnsZone. */
  zones: Map<string, EnhanceDnsZone>;
  /**
   * Sprint 15C.II Fase F.7 — ADR-083 Amendment A8.6.
   * `domainId` (UUID del `EnhanceWebsiteDomain`) → cert SSL.
   * La **ausencia** de entrada equivale a 404 = sin cert. Las routes nunca
   * almacenan `null` aquí — `state.domainSsls.delete(domainId)` para "sin cert".
   */
  domainSsls: Map<string, EnhanceDomainSslCert>;
  /**
   * Sprint 15C.II Fase F.10 — ADR-083 Amendment A9.4.
   * `websiteId` → lista de apps CMS instaladas (WordPress / Joomla).
   * La **ausencia** de entrada equivale a "website sin apps" → GET /apps
   * responde 200 con `{items: []}`. Las routes NO almacenan array vacío
   * aquí; semantic equivalence — el GET handler normaliza.
   */
  websiteApps: Map<string, EnhanceWebsiteApp[]>;
  /**
   * Sprint 15C.II Fase F.10 — overrides opcionales per-app de WordPressInfo
   * / JoomlaInfo. Si no hay entry para un `appId`, el handler devuelve un
   * default sintético derivado del `WebsiteApp.version` + site_url del
   * website padre.
   */
  wordpressInfoByAppId: Map<string, EnhanceWordPressInfo>;
  joomlaInfoByAppId: Map<string, EnhanceJoomlaInfo>;
  /** recordId cluster-wide → DefaultDnsRecord. */
  defaultDnsRecords: Map<string, EnhanceDefaultDnsRecord>;
  /** Counter para subscription IDs (integer). */
  nextSubscriptionId: number;
  /** Audit log de requests recibidas — útil para aserciones en tests. */
  requestLog: Array<{ method: string; path: string; bodySummary?: string }>;
}

function createInitialState(seed: MockEnhanceSeed): MockEnhanceState {
  const masterOrgId =
    seed.masterOrgId ?? '00000000-0000-0000-0000-00000000aaaa';
  const state: MockEnhanceState = {
    apiToken: seed.apiToken,
    version: seed.version ?? '12.21.3',
    masterOrgId,
    orgs: new Map(),
    logins: new Map(),
    members: new Map(),
    subscriptions: new Map(),
    websites: new Map(),
    zones: new Map(),
    domainSsls: new Map(Object.entries(seed.domainSsls ?? {})),
    // Sprint 15C.II Fase F.10 — websiteApps + per-app info maps (seed opt-in).
    // Convertimos readonly arrays a mutables (Map.set) — semantic-preserved.
    websiteApps: new Map(
      Object.entries(seed.websiteApps ?? {}).map(([websiteId, apps]) => [
        websiteId,
        [...apps],
      ]),
    ),
    wordpressInfoByAppId: new Map(
      Object.entries(seed.wordpressInfoByAppId ?? {}),
    ),
    joomlaInfoByAppId: new Map(Object.entries(seed.joomlaInfoByAppId ?? {})),
    defaultDnsRecords: new Map(),
    nextSubscriptionId: 1000,
    requestLog: [],
  };

  // Master org siempre está presente.
  state.orgs.set(masterOrgId, {
    id: masterOrgId,
    name: 'Aelium Master',
    status: 'active',
    subscriptionsCount: 0,
    websitesCount: 0,
    createdAt: '2026-01-01T00:00:00Z',
  });

  for (const customer of seed.customers ?? []) {
    const ownerMemberId = customer.ownerMemberId ?? randomUUID();
    const ownerLoginId = customer.ownerLoginId ?? randomUUID();
    state.orgs.set(customer.orgId, {
      id: customer.orgId,
      name: customer.name,
      status: 'active',
      ownerId: ownerMemberId,
      ownerLoginId: ownerLoginId,
      ownerEmail: customer.email,
      subscriptionsCount: 0,
      websitesCount: 0,
      createdAt: new Date().toISOString(),
    });
    state.logins.set(ownerLoginId, {
      email: customer.email,
      password: 'seeded-pwd',
      name: customer.name,
      orgId: customer.orgId,
    });
    state.members.set(ownerMemberId, {
      id: ownerMemberId,
      loginId: ownerLoginId,
      orgId: customer.orgId,
      isActive: true,
      email: customer.email,
      name: customer.name,
      roles: ['Owner'],
      joinedAt: new Date().toISOString().slice(0, 10),
    });
  }

  for (const record of seed.defaultDnsRecords ?? []) {
    state.defaultDnsRecords.set(record.id, record);
  }

  // Sprint 15C.II Fase F.10 — pre-seed de websites (smoke E2E sin flujo
  // de provisioning real). Si `websiteApps` se siembra contra un `wsId` que
  // NO está en `seed.websites` ni se crea via `POST /websites`, el endpoint
  // `GET /websites/:id/apps` responderá 404 NotFound y los smokes fallarán.
  for (const ws of seed.websites ?? []) {
    state.websites.set(ws.id, ws);
  }

  return state;
}

// ────────────────────────────────────────────────────────────────────────────
// Express app
// ────────────────────────────────────────────────────────────────────────────

function buildApp(state: MockEnhanceState): express.Express {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    state.requestLog.push({
      method: req.method,
      path: req.path,
      bodySummary: summarizeBody(req.body),
    });
    next();
  });

  // Auth middleware — applied to everything EXCEPT /version.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/version') {
      next();
      return;
    }
    if (state.apiToken === undefined) {
      next();
      return;
    }
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${state.apiToken}`) {
      res
        .status(401)
        .json({ code: 'Unauthorized', message: 'invalid bearer token' });
      return;
    }
    next();
  });

  registerSystemRoutes(app, state);
  registerCustomerRoutes(app, state);
  registerLoginRoutes(app, state);
  registerMemberRoutes(app, state);
  registerSubscriptionRoutes(app, state);
  registerWebsiteRoutes(app, state);
  registerDnsZoneRoutes(app, state);
  registerDefaultDnsRoutes(app, state);
  registerSslRoutes(app, state);
  registerWebsiteAppsRoutes(app, state);

  // Catch-all 404.
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ code: 'NotFound', message: 'mock route not found' });
  });

  return app;
}

// ────────────────────────────────────────────────────────────────────────────
// Routes — System (line 59-73 + line 4364)
// ────────────────────────────────────────────────────────────────────────────

function registerSystemRoutes(
  app: express.Express,
  state: MockEnhanceState,
): void {
  // GET /version (sin auth)
  app.get('/version', (_req, res) => {
    // Spec devuelve string SemVer JSON-encoded ("1.0.0-alpha.35").
    res.type('text/plain').send(`"${state.version}"`);
  });

  // GET /orgs/{orgId}
  app.get('/orgs/:orgId', (req, res) => {
    const org = state.orgs.get(req.params.orgId);
    if (!org) {
      res.status(404).json({ code: 'NotFound', message: 'org not found' });
      return;
    }
    res.json(org);
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Routes — Customers (line 4364)
// ────────────────────────────────────────────────────────────────────────────

function registerCustomerRoutes(
  app: express.Express,
  state: MockEnhanceState,
): void {
  // POST /orgs/{master}/customers
  app.post('/orgs/:masterId/customers', (req, res) => {
    if (req.params.masterId !== state.masterOrgId) {
      res
        .status(404)
        .json({ code: 'NotFound', message: 'master org not found' });
      return;
    }
    const body = req.body as EnhanceNewCustomer;
    if (!body || typeof body.name !== 'string' || body.name.length === 0) {
      res
        .status(422)
        .json({ code: 'ValidationError', message: 'name required' });
      return;
    }
    const orgId = randomUUID();
    const newOrg: EnhanceOrg = {
      id: orgId,
      name: body.name,
      status: 'active',
      subscriptionsCount: 0,
      websitesCount: 0,
      createdAt: new Date().toISOString(),
    };
    state.orgs.set(orgId, newOrg);
    res.status(201).json({ id: orgId });
  });

  // GET /orgs/{master}/customers?search={email}
  app.get('/orgs/:masterId/customers', (req, res) => {
    if (req.params.masterId !== state.masterOrgId) {
      res
        .status(404)
        .json({ code: 'NotFound', message: 'master org not found' });
      return;
    }
    const search =
      typeof req.query.search === 'string' ? req.query.search : undefined;
    const items: EnhanceOrg[] = [];
    for (const org of state.orgs.values()) {
      if (org.id === state.masterOrgId) continue;
      if (
        search === undefined ||
        (org.ownerEmail && org.ownerEmail === search)
      ) {
        items.push(org);
      }
    }
    const result: EnhanceCustomersListing = { items, total: items.length };
    res.json(result);
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Routes — Logins (line 3423 + line 12595)
// ────────────────────────────────────────────────────────────────────────────

function registerLoginRoutes(
  app: express.Express,
  state: MockEnhanceState,
): void {
  // POST /logins?orgId={cust}
  app.post('/logins', (req, res) => {
    const orgId =
      typeof req.query.orgId === 'string' ? req.query.orgId : undefined;
    if (!orgId || !state.orgs.has(orgId)) {
      res.status(404).json({ code: 'NotFound', message: 'org not found' });
      return;
    }
    const body = req.body as EnhanceLoginInfo;
    if (!body || !body.email || !body.password || !body.name) {
      res.status(422).json({
        code: 'ValidationError',
        message: 'email/password/name required',
      });
      return;
    }
    // Idempotencia: si ya existe login con ese email, devolver 409 (mock fiel a Enhance real).
    for (const login of state.logins.values()) {
      if (login.email === body.email) {
        res
          .status(409)
          .json({ code: 'ConflictError', message: 'login already exists' });
        return;
      }
    }
    const loginId = randomUUID();
    state.logins.set(loginId, {
      email: body.email,
      password: body.password,
      name: body.name,
      orgId,
    });
    res.status(201).json({ id: loginId, email: body.email, name: body.name });
  });

  // PUT /v2/logins/{loginId}/password
  app.put('/v2/logins/:loginId/password', (req, res) => {
    const login = state.logins.get(req.params.loginId);
    if (!login) {
      res.status(404).json({ code: 'NotFound', message: 'login not found' });
      return;
    }
    const body = req.body as EnhanceNewPassword;
    if (!body || typeof body.NewPassword !== 'string') {
      res
        .status(422)
        .json({ code: 'ValidationError', message: 'NewPassword required' });
      return;
    }
    state.logins.set(req.params.loginId, {
      ...login,
      password: body.NewPassword,
    });
    res.status(204).send();
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Routes — Members (line 16238 + line 18444 + line 5039)
// ────────────────────────────────────────────────────────────────────────────

function registerMemberRoutes(
  app: express.Express,
  state: MockEnhanceState,
): void {
  // POST /orgs/{org}/members
  app.post('/orgs/:orgId/members', (req, res) => {
    const org = state.orgs.get(req.params.orgId);
    if (!org) {
      res.status(404).json({ code: 'NotFound', message: 'org not found' });
      return;
    }
    const body = req.body as EnhanceNewMember;
    const login = body && state.logins.get(body.loginId);
    if (!login) {
      res
        .status(422)
        .json({ code: 'ValidationError', message: 'loginId not found' });
      return;
    }
    const memberId = randomUUID();
    state.members.set(memberId, {
      id: memberId,
      loginId: body.loginId,
      orgId: req.params.orgId,
      isActive: true,
      email: login.email,
      name: login.name,
      roles: body.roles,
      joinedAt: new Date().toISOString().slice(0, 10),
    });
    res.status(201).json({ id: memberId });
  });

  // PUT /orgs/{org}/owner
  app.put('/orgs/:orgId/owner', (req, res) => {
    const org = state.orgs.get(req.params.orgId);
    if (!org) {
      res.status(404).json({ code: 'NotFound', message: 'org not found' });
      return;
    }
    const body = req.body as EnhanceOrgOwnerUpdate;
    const member = body && state.members.get(body.memberId);
    if (!member || member.orgId !== req.params.orgId) {
      res
        .status(422)
        .json({ code: 'ValidationError', message: 'memberId invalid' });
      return;
    }
    state.orgs.set(req.params.orgId, {
      ...org,
      ownerId: member.id,
      ownerLoginId: member.loginId,
      ownerEmail: member.email,
      owner: member.name,
    });
    res.status(204).send();
  });

  // GET /orgs/{org}/members/{memberId}
  app.get('/orgs/:orgId/members/:memberId', (req, res) => {
    const member = state.members.get(req.params.memberId);
    if (!member || member.orgId !== req.params.orgId) {
      res.status(404).json({ code: 'NotFound', message: 'member not found' });
      return;
    }
    const { orgId, ...publicMember } = member;
    void orgId;
    res.json(publicMember);
  });

  // GET /orgs/{org}/members/{memberId}/sso
  app.get('/orgs/:orgId/members/:memberId/sso', (req, res) => {
    const member = state.members.get(req.params.memberId);
    if (!member || member.orgId !== req.params.orgId) {
      res.status(404).json({ code: 'NotFound', message: 'member not found' });
      return;
    }
    const otp = randomUUID();
    res
      .type('text/plain')
      .send(`"http://mock-panel.aelium.test/login/sessions/sso?otp=${otp}"`);
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Routes — Subscriptions (line 15923 + line 15934 + line 16013)
// ────────────────────────────────────────────────────────────────────────────

function registerSubscriptionRoutes(
  app: express.Express,
  state: MockEnhanceState,
): void {
  // POST /orgs/{master}/customers/{cust}/subscriptions
  app.post('/orgs/:masterId/customers/:custId/subscriptions', (req, res) => {
    if (req.params.masterId !== state.masterOrgId) {
      res
        .status(404)
        .json({ code: 'NotFound', message: 'master org not found' });
      return;
    }
    if (!state.orgs.has(req.params.custId)) {
      res.status(404).json({ code: 'NotFound', message: 'customer not found' });
      return;
    }
    const body = req.body as EnhanceNewSubscription;
    if (!body || typeof body.planId !== 'number') {
      res
        .status(422)
        .json({ code: 'ValidationError', message: 'planId required' });
      return;
    }
    const subId = state.nextSubscriptionId++;
    const newSub: EnhanceSubscription = {
      id: subId,
      planId: body.planId,
      planName: `plan-${body.planId}`,
      subscriberId: req.params.custId,
      vendorId: state.masterOrgId,
      status: 'active',
      resources: [],
      friendlyName: body.friendlyName ?? `subscription-${subId}`,
      persistentAppsAllowed: false,
    };
    state.subscriptions.set(subId, newSub);
    res.status(201).json({ id: subId });
  });

  // GET /orgs/{org}/subscriptions/{id}
  app.get('/orgs/:orgId/subscriptions/:subId', (req, res) => {
    const sub = state.subscriptions.get(Number(req.params.subId));
    if (!sub || sub.subscriberId !== req.params.orgId) {
      res
        .status(404)
        .json({ code: 'NotFound', message: 'subscription not found' });
      return;
    }
    res.json(sub);
  });

  // PATCH /orgs/{org}/subscriptions/{id}
  app.patch('/orgs/:orgId/subscriptions/:subId', (req, res) => {
    const sub = state.subscriptions.get(Number(req.params.subId));
    if (!sub || sub.subscriberId !== req.params.orgId) {
      res
        .status(404)
        .json({ code: 'NotFound', message: 'subscription not found' });
      return;
    }
    const update = req.body as EnhanceUpdateSubscription;
    // `isSuspended` tiene precedencia sobre `status` (espejo Enhance real).
    const resolvedStatus =
      update.isSuspended !== undefined
        ? update.isSuspended
          ? 'deleted'
          : 'active'
        : (update.status ?? sub.status);
    const merged: EnhanceSubscription = {
      ...sub,
      planId: update.planId ?? sub.planId,
      planName:
        update.planId !== undefined ? `plan-${update.planId}` : sub.planName,
      friendlyName: update.friendlyName ?? sub.friendlyName,
      status: resolvedStatus,
    };
    state.subscriptions.set(sub.id, merged);
    res.json(merged);
  });

  // DELETE /orgs/{org}/subscriptions/{id}
  app.delete('/orgs/:orgId/subscriptions/:subId', (req, res) => {
    const sub = state.subscriptions.get(Number(req.params.subId));
    if (!sub || sub.subscriberId !== req.params.orgId) {
      res
        .status(404)
        .json({ code: 'NotFound', message: 'subscription not found' });
      return;
    }
    state.subscriptions.delete(sub.id);
    res.status(204).send();
  });

  // GET /orgs/{org}/subscriptions/{id}/bandwidth
  app.get('/orgs/:orgId/subscriptions/:subId/bandwidth', (req, res) => {
    const sub = state.subscriptions.get(Number(req.params.subId));
    if (!sub || sub.subscriberId !== req.params.orgId) {
      res
        .status(404)
        .json({ code: 'NotFound', message: 'subscription not found' });
      return;
    }
    res.json({
      usedMb: 1024,
      periodStart: '2026-05-01T00:00:00Z',
      periodEnd: new Date().toISOString(),
    });
  });

  // PUT /orgs/{org}/subscriptions/{id}/calculate-resource-usage
  app.put(
    '/orgs/:orgId/subscriptions/:subId/calculate-resource-usage',
    (req, res) => {
      const sub = state.subscriptions.get(Number(req.params.subId));
      if (!sub || sub.subscriberId !== req.params.orgId) {
        res
          .status(404)
          .json({ code: 'NotFound', message: 'subscription not found' });
        return;
      }
      const result: EnhanceUsedResourcesFullListing = {
        items: [
          { name: 'disk', total: 10000, usage: 2500 },
          { name: 'emailAccounts', total: 50, usage: 3 },
          { name: 'databases', total: 10, usage: 1 },
        ],
      };
      res.json(result);
    },
  );

  // GET /orgs/{org}/plans (Sprint 15C Fase 15C.E — ADR-083 Amendment A3) —
  // PlansListing canónico para alimentar dropdown admin de change_package.
  // Fixture in-memory 3 planes (Web Starter / Web Pro / Web Premium); el
  // mock NO mantiene state.plans, los planes son globales del Master Org
  // y no se mutan en tests v1 (plan CRUD admin no expuesto en Fase E).
  app.get('/orgs/:orgId/plans', (req, res) => {
    if (!state.orgs.has(req.params.orgId)) {
      res.status(404).json({ code: 'NotFound', message: 'org not found' });
      return;
    }
    res.json({
      items: [
        {
          id: 1,
          name: 'Web Starter',
          subscriptionsCount: 12,
          planType: 'shared',
          createdAt: '2026-01-15T10:00:00Z',
        },
        {
          id: 2,
          name: 'Web Pro',
          subscriptionsCount: 7,
          planType: 'shared',
          createdAt: '2026-01-15T10:00:00Z',
        },
        {
          id: 3,
          name: 'Web Premium',
          subscriptionsCount: 3,
          planType: 'dedicated',
          createdAt: '2026-01-15T10:00:00Z',
        },
      ],
      total: 3,
    });
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Routes — Websites (line 16392 + line 16448 + line 16424)
// ────────────────────────────────────────────────────────────────────────────

function registerWebsiteRoutes(
  app: express.Express,
  state: MockEnhanceState,
): void {
  // POST /orgs/{org}/websites
  app.post('/orgs/:orgId/websites', (req, res) => {
    if (!state.orgs.has(req.params.orgId)) {
      res.status(404).json({ code: 'NotFound', message: 'org not found' });
      return;
    }
    const body = req.body as EnhanceNewWebsite;
    if (!body || typeof body.domain !== 'string' || body.domain.length === 0) {
      res
        .status(422)
        .json({ code: 'ValidationError', message: 'domain required' });
      return;
    }
    const wsId = randomUUID();
    const domainId = randomUUID();
    const newWs: EnhanceWebsite = {
      id: wsId,
      domain: { id: domainId, domain: body.domain },
      aliases: [],
      status: 'active',
      subscriptionId: body.subscriptionId,
      orgId: req.params.orgId,
      createdAt: new Date().toISOString(),
    };
    state.websites.set(wsId, newWs);
    // Crear zona DNS automáticamente al crear website (espejo de Enhance real).
    const zoneKey = `${wsId}|${body.domain}`;
    state.zones.set(zoneKey, buildAutoZone(body.domain, state));
    // Sprint 15C.II Fase F.7 (ADR-083 A8.6): auto-seed de cert LetsEncrypt
    // al crear el website — espejo del behaviour real de orchd (LE issuance
    // al provision). Tests que no lo quieran usan
    // `state.domainSsls.delete(domain.id)` antes de la aserción; tests que
    // quieran otro estado sobreescriben con `state.domainSsls.set(...)`.
    if (!state.domainSsls.has(domainId)) {
      const issuedAt = new Date();
      const expiresAt = new Date(issuedAt.getTime() + 60 * 24 * 60 * 60 * 1000);
      state.domainSsls.set(domainId, {
        cn: body.domain,
        issued: issuedAt.toISOString(),
        expires: expiresAt.toISOString(),
        issuer: "Let's Encrypt Authority X3",
        forceHttps: true,
      });
    }
    res.status(201).json({ id: wsId });
  });

  // GET /orgs/{org}/websites/{wsId}
  app.get('/orgs/:orgId/websites/:wsId', (req, res) => {
    const ws = state.websites.get(req.params.wsId);
    if (!ws || ws.orgId !== req.params.orgId) {
      res.status(404).json({ code: 'NotFound', message: 'website not found' });
      return;
    }
    res.json(ws);
  });

  // PATCH /orgs/{org}/websites/{wsId}
  app.patch('/orgs/:orgId/websites/:wsId', (req, res) => {
    const ws = state.websites.get(req.params.wsId);
    if (!ws || ws.orgId !== req.params.orgId) {
      res.status(404).json({ code: 'NotFound', message: 'website not found' });
      return;
    }
    const update = req.body as EnhanceUpdateWebsite;
    const merged: EnhanceWebsite = {
      ...ws,
      status:
        update.status ??
        (update.isSuspended === true
          ? 'suspended'
          : update.isSuspended === false
            ? 'active'
            : ws.status),
      subscriptionId: update.subscriptionId ?? ws.subscriptionId,
    };
    state.websites.set(ws.id, merged);
    res.json(merged);
  });

  // DELETE /orgs/{org}/websites/{wsId}
  app.delete('/orgs/:orgId/websites/:wsId', (req, res) => {
    const ws = state.websites.get(req.params.wsId);
    if (!ws || ws.orgId !== req.params.orgId) {
      res.status(404).json({ code: 'NotFound', message: 'website not found' });
      return;
    }
    state.websites.delete(ws.id);
    // Cleanup zona asociada.
    const prefix = `${ws.id}|`;
    for (const key of state.zones.keys()) {
      if (key.startsWith(prefix)) state.zones.delete(key);
    }
    // Sprint 15C.II Fase F.7 (ADR-083 A8.6): cleanup del cert SSL del
    // primary domain del website al borrar — coherente con el behaviour
    // real (orchd elimina el cert con el dominio).
    state.domainSsls.delete(ws.domain.id);
    // Sprint 15C.II Fase F.10 (ADR-083 A9.4): cleanup de las apps CMS
    // instaladas en el website + sus info caches per-app.
    const appsOfWebsite = state.websiteApps.get(ws.id) ?? [];
    for (const app of appsOfWebsite) {
      state.wordpressInfoByAppId.delete(app.id);
      state.joomlaInfoByAppId.delete(app.id);
    }
    state.websiteApps.delete(ws.id);
    res.status(204).send();
  });
}

/**
 * Sprint 15C.II Fase F.7 — ADR-083 Amendment A8.1/A8.6.
 *
 * `GET /v2/domains/{domain_id}/ssl` → 200 cert | 404 sin cert.
 * Match real con orchd v12.21.3 (line 8452). Sin POST/PUT/DELETE — el
 * mock cubre el path read-only consumido por `getDomainSsl` v1; las
 * mutaciones (upload cert custom, set force_ssl) viven en el panel
 * Enhance real y no se gestionan desde Aelium (DH-INV-6).
 */
function registerSslRoutes(
  app: express.Express,
  state: MockEnhanceState,
): void {
  app.get('/v2/domains/:domainId/ssl', (req, res) => {
    const cert = state.domainSsls.get(req.params.domainId);
    if (!cert) {
      res.status(404).json({ code: 'NotFound', message: 'ssl cert not found' });
      return;
    }
    res.json(cert);
  });
}

/**
 * Sprint 15C.II Fase F.10 — ADR-083 Amendment A9.4.
 *
 * 5 endpoints orchd para enumerar apps CMS instaladas en una website +
 * snapshots per-kind + SSO contractual WordPress:
 *
 *   GET    /orgs/{org}/websites/{w}/apps                                → getWebsiteApps
 *   GET    /orgs/{org}/websites/{w}/apps/{appId}/wordpress/info         → getWordpressInfo
 *   GET    /orgs/{org}/websites/{w}/apps/{appId}/wordpress/users/default → getDefaultWpSsoUser (404 si no configurado)
 *   GET    /orgs/{org}/websites/{w}/apps/{appId}/wordpress/users/{userId}/sso → getWordpressUserSsoUrl
 *   GET    /orgs/{org}/websites/{w}/apps/{appId}/joomla/info            → getJoomlaInfo
 *
 * NO se auto-siembran apps al `POST /websites` — las apps las instala el
 * cliente explícitamente (o via F.10.y futuro install desde dashboard,
 * `DC.NEW-52`). Tests semillan via `seed.websiteApps` o runtime
 * `state.websiteApps.set(websiteId, [...])`.
 *
 * Defaults sintéticos:
 *   - Si NO hay override en `state.wordpressInfoByAppId`, devuelve un
 *     shape con `version` del WebsiteApp + `site_url` derivado del primary
 *     domain del website + counts (`plugin_count: 5, user_count: 1,
 *     has_woocommerce: false`).
 *   - Si NO hay override en `state.joomlaInfoByAppId`, análogo
 *     (sin `has_woocommerce`).
 *
 * Manejo 404:
 *   - App no encontrada en el listado del website → 404 NotFound.
 *   - WP `getDefaultWpSsoUser` cuando el `WebsiteApp.defaultWpUserId` no
 *     está definido → 404 NotFound (match real orchd — permite testing
 *     del path "WP sin default user configurado" canónico).
 */
function registerWebsiteAppsRoutes(
  app: express.Express,
  state: MockEnhanceState,
): void {
  // Helper: resolver la app por orgId/websiteId/appId. Devuelve null si no
  // encontrada (route emite 404 — match shape orchd).
  const resolveApp = (
    orgId: string,
    websiteId: string,
    appId: string,
  ): EnhanceWebsiteApp | null => {
    const ws = state.websites.get(websiteId);
    if (!ws || ws.orgId !== orgId) return null;
    const apps = state.websiteApps.get(websiteId) ?? [];
    return apps.find((a) => a.id === appId) ?? null;
  };

  // Helper: site_url default derivado del primary domain del website.
  const defaultSiteUrl = (websiteId: string, appPath?: string): string => {
    const ws = state.websites.get(websiteId);
    const host = ws?.domain.domain ?? 'mock.example';
    const pathSuffix =
      appPath !== undefined && appPath.length > 0 ? `/${appPath}` : '';
    return `https://${host}${pathSuffix}`;
  };

  // GET /orgs/{org}/websites/{w}/apps
  app.get('/orgs/:orgId/websites/:websiteId/apps', (req, res) => {
    const ws = state.websites.get(req.params.websiteId);
    if (!ws || ws.orgId !== req.params.orgId) {
      res.status(404).json({ code: 'NotFound', message: 'website not found' });
      return;
    }
    const items = state.websiteApps.get(ws.id) ?? [];
    res.json({ items });
  });

  // GET /orgs/{org}/websites/{w}/apps/{appId}/wordpress/info
  app.get(
    '/orgs/:orgId/websites/:websiteId/apps/:appId/wordpress/info',
    (req, res) => {
      const app = resolveApp(
        req.params.orgId,
        req.params.websiteId,
        req.params.appId,
      );
      if (!app || app.app !== 'wordpress') {
        res.status(404).json({
          code: 'NotFound',
          message: 'wordpress app not found',
        });
        return;
      }
      const override = state.wordpressInfoByAppId.get(app.id);
      if (override) {
        res.json(override);
        return;
      }
      const wpInfo: EnhanceWordPressInfo = {
        version: app.version,
        site_url: defaultSiteUrl(req.params.websiteId, app.path),
        plugin_count: 5,
        user_count: 1,
        has_woocommerce: false,
      };
      res.json(wpInfo);
    },
  );

  // GET /orgs/{org}/websites/{w}/apps/{appId}/wordpress/users/default
  app.get(
    '/orgs/:orgId/websites/:websiteId/apps/:appId/wordpress/users/default',
    (req, res) => {
      const app = resolveApp(
        req.params.orgId,
        req.params.websiteId,
        req.params.appId,
      );
      if (!app || app.app !== 'wordpress') {
        res.status(404).json({
          code: 'NotFound',
          message: 'wordpress app not found',
        });
        return;
      }
      if (app.defaultWpUserId === undefined) {
        // Match real orchd: 404 si no hay default user configurado.
        // Permite testing del path "WP sin default user" → cliente
        // renderiza atajo disabled con tooltip.
        res.status(404).json({
          code: 'NotFound',
          message: 'no default sso user configured',
        });
        return;
      }
      const wpUser: EnhanceWpUser = {
        id: app.defaultWpUserId,
        username: `admin-${app.defaultWpUserId}`,
        email: `admin-${app.defaultWpUserId}@mock.example`,
      };
      res.json(wpUser);
    },
  );

  // GET /orgs/{org}/websites/{w}/apps/{appId}/wordpress/users/{userId}/sso
  app.get(
    '/orgs/:orgId/websites/:websiteId/apps/:appId/wordpress/users/:userId/sso',
    (req, res) => {
      const app = resolveApp(
        req.params.orgId,
        req.params.websiteId,
        req.params.appId,
      );
      if (!app || app.app !== 'wordpress') {
        res.status(404).json({
          code: 'NotFound',
          message: 'wordpress app not found',
        });
        return;
      }
      // Match shape del endpoint `/orgs/.../members/.../sso` existente
      // (text/plain string JSON-encoded). El user real podría no existir
      // en el state, pero el mock no enforce eso — devuelve URL siempre
      // que la app exista (suficiente para test del flow Aelium-side).
      const otp = randomUUID();
      res
        .type('text/plain')
        .send(
          `"http://mock-panel.aelium.test/wp-admin/index.php?token=${otp}"`,
        );
    },
  );

  // GET /orgs/{org}/websites/{w}/apps/{appId}/joomla/info
  app.get(
    '/orgs/:orgId/websites/:websiteId/apps/:appId/joomla/info',
    (req, res) => {
      const app = resolveApp(
        req.params.orgId,
        req.params.websiteId,
        req.params.appId,
      );
      if (!app || app.app !== 'joomla') {
        res
          .status(404)
          .json({ code: 'NotFound', message: 'joomla app not found' });
        return;
      }
      const override = state.joomlaInfoByAppId.get(app.id);
      if (override) {
        res.json(override);
        return;
      }
      const joomlaInfo: EnhanceJoomlaInfo = {
        version: app.version,
        site_url: defaultSiteUrl(req.params.websiteId, app.path),
        plugin_count: 3,
        user_count: 1,
      };
      res.json(joomlaInfo);
    },
  );
}

/**
 * Crea zona DNS auto-poblada con los default records globales aplicados,
 * espejo del comportamiento Enhance real (ADR-082 §5).
 */
function buildAutoZone(
  origin: string,
  state: MockEnhanceState,
): EnhanceDnsZone {
  const records: EnhanceDnsRecord[] = [];
  for (const def of state.defaultDnsRecords.values()) {
    records.push({
      id: randomUUID(),
      kind: def.kind,
      name: def.name,
      value: def.value,
      ttl: def.ttl,
      proxy: false,
    });
  }
  return {
    origin,
    soa: {
      adminEmail: 'hostmaster@aelium.net',
      nameServer: 'ns1.aelium.net',
      expire: 1209600,
      refresh: 86400,
      retry: 7200,
      ttl: 3600,
    },
    records,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Routes — DNS zone & records (line 7487 + line 18130 + line 18185 + line 18170)
// ────────────────────────────────────────────────────────────────────────────

function registerDnsZoneRoutes(
  app: express.Express,
  state: MockEnhanceState,
): void {
  // GET /orgs/{org}/websites/{ws}/domains/{dom}/dns-zone
  app.get(
    '/orgs/:orgId/websites/:wsId/domains/:domain/dns-zone',
    (req, res) => {
      const ws = state.websites.get(req.params.wsId);
      if (!ws || ws.orgId !== req.params.orgId) {
        res
          .status(404)
          .json({ code: 'NotFound', message: 'website not found' });
        return;
      }
      const zone = state.zones.get(`${req.params.wsId}|${req.params.domain}`);
      if (!zone) {
        res.status(404).json({ code: 'NotFound', message: 'zone not found' });
        return;
      }
      res.json(zone);
    },
  );

  // POST .../dns-zone/records
  app.post(
    '/orgs/:orgId/websites/:wsId/domains/:domain/dns-zone/records',
    (req, res) => {
      const zoneKey = `${req.params.wsId}|${req.params.domain}`;
      const zone = state.zones.get(zoneKey);
      if (!zone) {
        res.status(404).json({ code: 'NotFound', message: 'zone not found' });
        return;
      }
      const body = req.body as EnhanceNewDnsRecord;
      if (!isValidDnsRecord(body)) {
        res
          .status(422)
          .json({ code: 'ValidationError', message: 'invalid record' });
        return;
      }
      const recordId = randomUUID();
      const newRecord: EnhanceDnsRecord = {
        id: recordId,
        kind: body.kind,
        name: body.name,
        value: body.value,
        ttl: body.ttl,
        proxy: body.proxy ?? false,
      };
      const newZone: EnhanceDnsZone = {
        ...zone,
        records: [...zone.records, newRecord],
      };
      state.zones.set(zoneKey, newZone);
      res.status(201).json({ id: recordId });
    },
  );

  // PATCH .../dns-zone/records/{id}
  app.patch(
    '/orgs/:orgId/websites/:wsId/domains/:domain/dns-zone/records/:recordId',
    (req, res) => {
      const zoneKey = `${req.params.wsId}|${req.params.domain}`;
      const zone = state.zones.get(zoneKey);
      if (!zone) {
        res.status(404).json({ code: 'NotFound', message: 'zone not found' });
        return;
      }
      const idx = zone.records.findIndex((r) => r.id === req.params.recordId);
      if (idx < 0) {
        res.status(404).json({ code: 'NotFound', message: 'record not found' });
        return;
      }
      const update = req.body as EnhanceUpdateDnsRecord;
      const oldRec = zone.records[idx];
      const newRec: EnhanceDnsRecord = {
        ...oldRec,
        kind: update.kind ?? oldRec.kind,
        name: update.name ?? oldRec.name,
        value: update.value ?? oldRec.value,
        ttl: update.ttl ?? oldRec.ttl,
        proxy: update.proxy ?? oldRec.proxy,
      };
      const newRecords = [...zone.records];
      newRecords[idx] = newRec;
      state.zones.set(zoneKey, { ...zone, records: newRecords });
      res.status(204).send();
    },
  );

  // DELETE .../dns-zone/records/{id}
  app.delete(
    '/orgs/:orgId/websites/:wsId/domains/:domain/dns-zone/records/:recordId',
    (req, res) => {
      const zoneKey = `${req.params.wsId}|${req.params.domain}`;
      const zone = state.zones.get(zoneKey);
      if (!zone) {
        res.status(404).json({ code: 'NotFound', message: 'zone not found' });
        return;
      }
      const idx = zone.records.findIndex((r) => r.id === req.params.recordId);
      if (idx < 0) {
        res.status(404).json({ code: 'NotFound', message: 'record not found' });
        return;
      }
      const newRecords = zone.records.filter((_, i) => i !== idx);
      state.zones.set(zoneKey, { ...zone, records: newRecords });
      res.status(204).send();
    },
  );
}

const DNS_RECORD_KINDS: ReadonlySet<EnhanceDnsRecordKind> = new Set([
  'A',
  'AAAA',
  'CNAME',
  'TXT',
  'SPF',
  'SRV',
  'NS',
  'MX',
  'PTR',
  'DS',
  'CAA',
]);

function isValidDnsRecord(body: unknown): body is EnhanceNewDnsRecord {
  if (typeof body !== 'object' || body === null) return false;
  const obj = body as Record<string, unknown>;
  return (
    typeof obj.kind === 'string' &&
    DNS_RECORD_KINDS.has(obj.kind as EnhanceDnsRecordKind) &&
    typeof obj.name === 'string' &&
    typeof obj.value === 'string'
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Routes — Default DNS records cluster-wide (line 896 + line 18234)
// ────────────────────────────────────────────────────────────────────────────

function registerDefaultDnsRoutes(
  app: express.Express,
  state: MockEnhanceState,
): void {
  // GET /v2/settings/dns/default-records
  app.get('/v2/settings/dns/default-records', (_req, res) => {
    res.json([...state.defaultDnsRecords.values()]);
  });

  // POST /v2/settings/dns/default-records
  app.post('/v2/settings/dns/default-records', (req, res) => {
    const body = req.body as EnhanceNewDefaultDnsRecord;
    if (
      !body ||
      typeof body.kind !== 'string' ||
      !DNS_RECORD_KINDS.has(body.kind) ||
      typeof body.name !== 'string' ||
      typeof body.value !== 'string'
    ) {
      res
        .status(422)
        .json({ code: 'ValidationError', message: 'invalid default record' });
      return;
    }
    const id = randomUUID();
    state.defaultDnsRecords.set(id, {
      id,
      kind: body.kind,
      name: body.name,
      value: body.value,
      ttl: body.ttl,
      overrideConflicting: body.overrideConflicting ?? false,
    });
    res.status(201).json({ id });
  });

  // PATCH /v2/settings/dns/default-records/{id}
  app.patch('/v2/settings/dns/default-records/:id', (req, res) => {
    const existing = state.defaultDnsRecords.get(req.params.id);
    if (!existing) {
      res
        .status(404)
        .json({ code: 'NotFound', message: 'default record not found' });
      return;
    }
    const update = req.body as EnhanceUpdateDefaultDnsRecord;
    state.defaultDnsRecords.set(req.params.id, {
      ...existing,
      kind: update.kind ?? existing.kind,
      name: update.name ?? existing.name,
      value: update.value ?? existing.value,
      ttl: update.ttl ?? existing.ttl,
      overrideConflicting:
        update.overrideConflicting ?? existing.overrideConflicting,
    });
    res.status(204).send();
  });

  // DELETE /v2/settings/dns/default-records/{id}
  app.delete('/v2/settings/dns/default-records/:id', (req, res) => {
    if (!state.defaultDnsRecords.has(req.params.id)) {
      res
        .status(404)
        .json({ code: 'NotFound', message: 'default record not found' });
      return;
    }
    state.defaultDnsRecords.delete(req.params.id);
    res.status(204).send();
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function summarizeBody(body: unknown): string | undefined {
  if (body === undefined || body === null) return undefined;
  try {
    const s = JSON.stringify(body);
    return s.length > 200 ? `${s.slice(0, 200)}...` : s;
  } catch {
    return undefined;
  }
}
