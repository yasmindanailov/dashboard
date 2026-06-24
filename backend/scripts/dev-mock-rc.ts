import { startMockResellerClubServer } from '../test/mocks/resellerclub-server/server';

/**
 * Dev-only — arranca el `MockResellerClubServer` (offline, alta fidelidad) como
 * backend del plugin `resellerclub`, para probar el comercio de dominios sin OT&E
 * (la IP de salida no está whitelisteada → Cloudflare WAF 403, DC.NEW-63).
 *
 * Uso:
 *   1) pnpm rc:mock        (este proceso — déjalo corriendo)
 *   2) pnpm rc:mock-on     (apunta el plugin al mock; NO hace falta reiniciar el backend)
 *   …probar en el dashboard…
 *   3) pnpm rc:mock-off    (volver a OT&E)
 *
 * Convenciones del mock (para probar en la Tienda):
 *   - Registrar:  cualquier nombre (p.ej. `midominio`) → disponible + comprable.
 *   - Transferir: SLD que contenga "taken" (p.ej. `mitaken.com`) → transferible;
 *                 auth-code: cualquiera salvo "INVALID"/"WRONG".
 *   - Ocupados:   "google" o cualquier "*taken*".
 *   - Sugerencias/bulk: funcionan (variaciones de la keyword × TLDs tarifados).
 *   - Auth permisivo (acepta las credenciales del vault sin validarlas).
 */
const PORT = Number(process.env.MOCK_RC_PORT ?? 3099);

async function main(): Promise<void> {
  const mock = await startMockResellerClubServer({ port: PORT });
  console.log(
    `🧪 MockResellerClubServer escuchando en ${mock.baseUrl} (auth permisivo).`,
  );
  console.log(
    '   Apunta el plugin:  pnpm rc:mock-on    ·    revertir:  pnpm rc:mock-off',
  );
  console.log(
    '   Registrar→cualquier nombre · Transferir→SLD con "taken" · Ctrl+C para parar.',
  );

  const stop = (): void => {
    void mock.stop().finally(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((e) => {
  console.error('mock failed:', e);
  process.exit(1);
});
