/**
 * Runner standalone del `MockResellerClubServer` para E2E (GL-26 — comercio de
 * dominios). Espejo de `mock-enhance-runner.ts` (Sprint 15C Fase 15C.I) para el
 * plugin ResellerClub: el mock canónico (`backend/test/mocks/resellerclub-server/`)
 * es in-process para Jest; los E2E Playwright (que arrancan backend+frontend con
 * `start:prod`) necesitan el mock como **proceso separado** — Playwright lo
 * gestiona como 4º `webServer` en `playwright.config.ts` (lifecycle paralelo,
 * kill al teardown).
 *
 * Auth **permisivo** (sin `seed.apiKey`): el plugin RC envía sus credenciales
 * dummy (cifradas en el vault) y el mock las acepta sin validar. Convenciones de
 * disponibilidad del mock: SLD normal → disponible; `google` o `*taken*` → no
 * disponible (`backend/test/mocks/resellerclub-server/server.ts`).
 *
 * El spec `sprint-15d-resellerclub-flow.spec.ts` apunta el plugin a este mock
 * vía `plugin_installs.config.__base_url_override` (DC.NEW-67).
 *
 * Variables de entorno:
 *   - `E2E_MOCK_RC_PORT`  default 3098 (3099 lo usa mock-enhance).
 *
 * Ejecución (vía pnpm desde backend porque allí vive `ts-node`):
 *
 *     pnpm --dir backend exec ts-node --transpile-only \
 *       --project ../tests/e2e/fixtures/tsconfig.mock-runner.json \
 *       ../tests/e2e/fixtures/mock-resellerclub-runner.ts
 */
import { startMockResellerClubServer } from '../../../backend/test/mocks/resellerclub-server';

const PORT = Number(process.env.E2E_MOCK_RC_PORT) || 3098;

void (async () => {
  let mock: Awaited<ReturnType<typeof startMockResellerClubServer>>;
  try {
    mock = await startMockResellerClubServer({ port: PORT });
    // eslint-disable-next-line no-console -- la salida del runner es la única señal que ve Playwright
    console.log(
      `[mock-resellerclub-server] listening on ${mock.baseUrl} (auth permisivo)`,
    );
  } catch (err) {
    // eslint-disable-next-line no-console -- la salida del runner es la única señal que ve Playwright
    console.error('[mock-resellerclub-server] failed to start:', err);
    process.exit(1);
  }

  const shutdown = async (signal: string): Promise<void> => {
    // eslint-disable-next-line no-console
    console.log(`[mock-resellerclub-server] received ${signal}, stopping...`);
    try {
      await mock.stop();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[mock-resellerclub-server] stop error:', err);
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
})();
