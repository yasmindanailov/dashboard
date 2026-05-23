# MockResellerClubServer — Sprint 15D Fase 15D.C

Express stub local que responde como la API de **ResellerClub / LogicBoxes**
(`<command>.json`). Materializa [ADR-081](../../../../docs/10-decisions/adr-081-plugin-resellerclub-specifics.md)
§10 + el patrón de ubicación de [ADR-083 Amendment A1](../../../../docs/10-decisions/adr-083-plugin-enhance-cp-specifics.md)
(`backend/test/mocks/<plugin-slug>-server/`).

> **Fidelidad**: los shapes de pre-venta (`available`), pricing, ids escalares
> (`signup`/`contacts/add`), los DOS envoltorios de error y `domains/search` vacío
> están **verificados en OT&E** (ver [findings §4](../../../../docs/_research/sprint-15d/resellerclub-ote-findings.md)).
> Los shapes **register-dependientes** (`register`/`details`/gestión/`renew`) son
> **conservadores** — OT&E no pudo capturarlos (la validación de NS exige que
> `ns1/ns2.aelium.net` resuelvan en DNS; findings §4.8) — y se refinan en el
> smoke de Fase G. El mock SÍ deja completar el happy path de `register` (ese es
> su valor: determinista, sin la restricción de NS de OT&E).

## Cobertura (scope 15D core, ADR-081 §9)

- `domains/available`, `products/reseller-price`, `products/customer-price`
- `customers/signup`, `customers/search`, `customers/details-by-id`, `contacts/add`
- `domains/register`, `domains/renew`, `domains/details(-by-name)`, `domains/search`
- `domains/modify-ns` / `modify-contact` / `modify-privacy-protection` /
  `modify-auth-code`, `domains/enable|disable-theft-protection`
- `orders/suspend` / `orders/unsuspend`

Fuera de scope (15D.II): transfer-in, suggest-names rico, IDN, child-NS.

## Uso desde tests

```typescript
import { startMockResellerClubServer } from '../../../../test/mocks/resellerclub-server';
import { ResellerClubApiClient, resolveResellerClubBaseUrl } from './api';

let mock: Awaited<ReturnType<typeof startMockResellerClubServer>>;
let client: ResellerClubApiClient;

beforeAll(async () => {
  mock = await startMockResellerClubServer({
    seed: { authUserId: 'uid-fixture', apiKey: 'key-fixture' },
  });
  client = new ResellerClubApiClient({
    baseUrl: mock.baseUrl, // sin sufijo /api (el mock sirve en la raíz)
    authUserId: 'uid-fixture',
    apiKey: 'key-fixture',
  });
});

afterAll(async () => {
  await mock.stop();
});

afterEach(() => mock.reset());
```

## Modelado de errores reales (alta fidelidad — L20)

- **No disponible**: `register` de un FQDN ya registrado o con `status` ≠
  `available`, o cuyo SLD sea `google`/contenga `taken` → envoltorio
  `{status:'error', error:'… not available …'}` → `DOMAIN_UNAVAILABLE`.
- **Premium**: SLD en `seed.premiumDomains` → `DOMAIN_PREMIUM`.
- **`.es` inelegible** (DOM-INV-5): `contacts/add` con `type=EsContact` sin
  `attr-name=es_tipo_identificacion` → `REGISTRANT_INELIGIBLE`.
- **Auth inválida**: si `seed.apiKey` se setea y el request no la trae →
  `{status:'ERROR', message:'Authentication Failed …'}` → `PROVIDER_AUTH_FAILED`.
- **Customer / dominio inexistente**: `customers/details-by-id` / `domains/details`
  desconocido → HTTP 500 + envoltorio (como en OT&E real, findings §4.6).

Override runtime vía `POST /__test__/seed` (`availabilityOverrides`,
`premiumDomains`, `resellerPrice`, `customerPrice`).

## CI

Los tests de integración usan **exclusivamente** este mock — NUNCA OT&E live
(ADR-081 §11). La verificación contra OT&E es manual y controlada (research +
smoke Fase G).

## Limitaciones conscientes

- **No valida nameservers por DNS** (a diferencia de OT&E real): permite el happy
  path de `register` con `ns1/ns2.aelium.net`. La validación real de NS es un
  prerequisito de infra que se ejercita en el smoke (findings §4.8).
- **No simula latencia ni rate-limiting**: para testear `PROVIDER_TIMEOUT` /
  `PROVIDER_RATE_LIMITED` se mockea `global.fetch` (como en `http-client.spec.ts`).
- **State in-memory**: cada `start()` arranca limpio (salvo el seed).
