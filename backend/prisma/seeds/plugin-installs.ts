import { PrismaClient } from '@prisma/client';

/**
 * Seed canónico de `plugin_installs` — Sprint 15A Fase D (ADR-080 §2).
 *
 * Garantiza que los plugins triviales `internal` y `manual` están
 * habilitados al boot post-`pnpm seed`. Sin estos, los servicios cuyo
 * `provisioner_slug` apunta a ellos (Support Inside, hosting-pro, etc.)
 * quedarían huérfanos al reiniciar el backend.
 *
 * Idempotente: `upsert` por `slug` PK. NO sobreescribe `enabled` si el
 * admin lo ha cambiado entre `pnpm seed` runs (preserva configuración
 * operativa). Solo crea las filas si no existen.
 *
 * Operación canónica de la empresa (NO demo data): se siembra SIEMPRE
 * (incluso en `NODE_ENV=production`) — el patrón es idéntico al de
 * `seedSupportInsidePlans` (Sprint 8 Fase D).
 *
 * Plugins reales (Sprint 15D ResellerClub, 15C Enhance CP, 15E Docker
 * Engine, 15B Stripe) se instalan en runtime desde `/admin/settings/plugins`
 * con `enabled=false` por defecto — el admin los habilita tras configurar
 * sus secrets. No se seedean.
 */

interface BootstrapPlugin {
  slug: string;
  enabled: boolean;
}

const BOOTSTRAP_PLUGINS: ReadonlyArray<BootstrapPlugin> = [
  { slug: 'internal', enabled: true },
  { slug: 'manual', enabled: true },
];

export async function seedPluginInstalls(prisma: PrismaClient): Promise<void> {
  let created = 0;
  let preserved = 0;

  for (const plugin of BOOTSTRAP_PLUGINS) {
    const existing = await prisma.pluginInstall.findUnique({
      where: { slug: plugin.slug },
    });

    if (existing) {
      preserved++;
      continue;
    }

    await prisma.pluginInstall.create({
      data: {
        slug: plugin.slug,
        enabled: plugin.enabled,
        config: {},
        secrets: {},
        key_version: 1,
      },
    });
    created++;
  }

  console.log(
    `  📦 plugin_installs: ${created} created, ${preserved} preserved.`,
  );
}
