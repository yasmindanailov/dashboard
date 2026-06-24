import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

/**
 * Dev-only — apunta el plugin `resellerclub` al MockResellerClubServer local
 * (offline) seteando `plugin_installs.config.__base_url_override` (DC.NEW-67), o lo
 * limpia con `--off` para volver a OT&E. El plugin lo recoge en la SIGUIENTE llamada
 * (`getApiClient` relee el install y el cacheKey incluye `updated_at`) — sin reinicio
 * del backend.
 *
 *   pnpm rc:mock-on               → http://127.0.0.1:3099 (o $MOCK_RC_PORT)
 *   pnpm rc:mock-on http://host…  → URL explícita
 *   pnpm rc:mock-off              → vuelve a OT&E (environment)
 */
const RC_SLUG = 'resellerclub';

async function main(): Promise<void> {
  const off = process.argv.includes('--off');
  const explicit = process.argv.find((a) => a.startsWith('http'));
  const url = explicit ?? `http://127.0.0.1:${process.env.MOCK_RC_PORT ?? '3099'}`;

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const install = await prisma.pluginInstall.findUnique({
      where: { slug: RC_SLUG },
    });
    if (!install) {
      throw new Error(
        `Plugin "${RC_SLUG}" no instalado (corre el seed o set-rc-creds primero).`,
      );
    }
    const config: Record<string, unknown> =
      install.config &&
      typeof install.config === 'object' &&
      !Array.isArray(install.config)
        ? { ...(install.config as Record<string, unknown>) }
        : {};

    if (off) {
      delete config.__base_url_override;
    } else {
      config.__base_url_override = url;
    }

    await prisma.pluginInstall.update({
      where: { slug: RC_SLUG },
      data: { config: config as Prisma.InputJsonValue },
    });
    console.log(
      off
        ? '✓ resellerclub: __base_url_override eliminado → vuelve a OT&E (environment).'
        : `✓ resellerclub: __base_url_override = ${url} (la próxima llamada usa el mock).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
