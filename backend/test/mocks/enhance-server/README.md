# MockEnhanceServer — Sprint 15C Fase 15C.B

Express stub local que responde como `orchd v12.21.3`. Materializa
[ADR-083](../../../../docs/10-decisions/adr-083-plugin-enhance-cp-specifics.md) §7
decisión 25 + [Amendment A1](../../../../docs/10-decisions/adr-083-plugin-enhance-cp-specifics.md#amendment-a1-2026-05-08--ubicación-canónica-del-mockenhanceserver).

> **Ubicación canónica**: `backend/test/mocks/enhance-server/`. Patrón
> aplicable a futuros plugins SaaS (RC `backend/test/mocks/resellerclub-server/`,
> Plesk `backend/test/mocks/plesk-server/`, etc.). Razón técnica + doctrina
> de patrón en Amendment A1.

## Cobertura

28 endpoints orchd cubiertos — los mismos que `EnhanceApiClient` toca:

- `/version`, `/orgs/{orgId}` (system probe)
- `/orgs/{master}/customers` (POST + GET con search)
- `/logins?orgId=`, `/v2/logins/{loginId}/password`
- `/orgs/{org}/members`, `/orgs/{org}/owner`, `/orgs/{org}/members/{m}`,
  `/orgs/{org}/members/{m}/sso`
- `/orgs/{master}/customers/{cust}/subscriptions` (POST)
- `/orgs/{org}/subscriptions/{id}` (GET, PATCH, DELETE)
- `/orgs/{org}/subscriptions/{id}/bandwidth`
- `/orgs/{org}/subscriptions/{id}/calculate-resource-usage`
- `/orgs/{org}/websites` (POST)
- `/orgs/{org}/websites/{wsId}` (GET, PATCH, DELETE)
- `/orgs/{org}/websites/{ws}/domains/{dom}/dns-zone`
- `/orgs/{org}/websites/{ws}/domains/{dom}/dns-zone/records`
- `/orgs/{org}/websites/{ws}/domains/{dom}/dns-zone/records/{id}`
- `/v2/settings/dns/default-records` (GET, POST)
- `/v2/settings/dns/default-records/{id}` (PATCH, DELETE)

## Uso desde tests

```typescript
import { startMockEnhanceServer } from '../../../../test/mocks/enhance-server';
import { EnhanceApiClient } from './api/client';

let mock: Awaited<ReturnType<typeof startMockEnhanceServer>>;
let client: EnhanceApiClient;

beforeAll(async () => {
  mock = await startMockEnhanceServer({
    seed: {
      apiToken: 'test-token-fixture',
      masterOrgId: '00000000-0000-0000-0000-00000000aaaa',
    },
  });
  client = new EnhanceApiClient({
    baseUrl: mock.baseUrl,
    apiToken: 'test-token-fixture',
  });
});

afterAll(async () => {
  await mock.stop();
});

afterEach(() => {
  mock.reset(); // limpia state pero mantiene el server
});
```

## Doctrina del mock

- **Auth opcional**: si `seed.apiToken` se provee, todos los endpoints
  (excepto `/version`) requieren `Authorization: Bearer <apiToken>`. Si no,
  modo permisivo.
- **Idempotencia 409**: POST que crea recurso con email duplicado devuelve
  409 (mismo comportamiento Enhance real). El plugin lo gestiona via
  `searchCustomersByEmail` + insert mapping en `enhance_customers`
  ([ADR-083 §2 decisión 8](../../../../docs/10-decisions/adr-083-plugin-enhance-cp-specifics.md)).
- **Default DNS records aplicados a zonas nuevas**: al crear un website,
  el mock auto-popula su zona con copias de los `defaultDnsRecords`
  cluster-wide pre-sembrados — espejo del comportamiento Enhance real
  ([ADR-082 §5](../../../../docs/10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md)).
- **`state.requestLog`**: cada request se registra; útil para aserciones
  de "este test no llamó a `getVersion` dos veces".

## CI

CI E2E [(ADR-083 §7 decisión 27)](../../../../docs/10-decisions/adr-083-plugin-enhance-cp-specifics.md):
los tests integration usan exclusivamente este mock — NUNCA Enhance live.
El smoke E2E manual contra live ([decisión 28](../../../../docs/10-decisions/adr-083-plugin-enhance-cp-specifics.md))
lo ejecuta Yasmin en cierre Sprint 15C Fase I (1-2 horas) para validar
shapes reales.

## Limitaciones conscientes

- **No simula latencia**: timing del `setTimeout` del mock tiene latencia
  cero; tests que verifican timeout deben ahogar el server deliberadamente.
- **No simula rate limiting / circuit breaker behavior**: si necesitas
  testear `PROVIDER_RATE_LIMITED`, mockea `global.fetch` directamente como
  hace `http-client.spec.ts`.
- **No persiste entre `start()`s**: state in-memory. Cada instance arranca
  limpia (excepto el seed inicial).
