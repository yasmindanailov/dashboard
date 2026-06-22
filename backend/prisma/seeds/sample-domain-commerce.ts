import {
  PrismaClient,
  ProductType,
  ProductStatus,
  DomainPriceOperation,
  DomainPriceSource,
  Prisma,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';

import { SecretVaultService } from '../../src/core/security/secret-vault.service';

/**
 * Seed dev/QA del comercio de dominios — Sprint 15D Fase 15D.F.2.
 *
 * Da de alta lo mínimo para que el buscador (`/domains/check-availability`) y el
 * checkout de dominio funcionen de punta a punta en local:
 *   1. `plugin_installs` de ResellerClub (sample, enabled) — para que el buscador
 *      RESUELVA el registrar por capability (`is_domain_registrar`). Solo si las
 *      env vars `RESELLERCLUB_OTE_*` están completas (mismo patrón que enhance).
 *   2. Producto "Dominio" (`type='domain'`, provisioner=`resellerclub`) — un único
 *      producto por registrar (ADR-084 §1). NO lleva `ProductPricing`.
 *   3. Filas `domain_tld_pricing` (register + renew, 1 año, EUR) para los TLDs
 *      ofertados — lo que en producción rellena el cron `sync-resellerclub-pricing`.
 *
 * Guardas: skip si `NODE_ENV === 'production'`. Idempotente (upsert). Las filas
 * de precio se siembran SIEMPRE en dev (catálogo); el `plugin_installs` solo si
 * hay credenciales OT&E (sin ellas, el buscador devuelve 503 hasta que el admin
 * instale RC desde la UI).
 *
 * NOTA OT&E: con RC instalado, la disponibilidad pega contra OT&E real — requiere
 * que la IP del servidor esté whitelisteada (DC.NEW-63). El precio (filas abajo)
 * NO depende de OT&E. Un demo 100% offline necesitaría correr el
 * `MockResellerClubServer` como servicio de dev (follow-up).
 */

const RC_SLUG = 'resellerclub';
const DOMAIN_PRODUCT_SLUG = 'dominios';
const DEFAULT_CURRENCY = 'EUR';
const MARKUP_PERCENT = 25;

/** Coste mayorista de muestra por TLD (alineado con `MockResellerClubServer`). */
const TLD_COSTS: Readonly<Record<string, string>> = {
  com: '8.00',
  net: '9.00',
  org: '9.50',
  es: '6.00',
  eu: '5.50',
};

export async function seedSampleDomainCommerce(
  prisma: PrismaClient,
): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.log('  ⚠ NODE_ENV=production — saltando sample-domain-commerce');
    return;
  }

  await seedResellerclubInstall(prisma);
  await seedDomainProduct(prisma);
  await seedTldPricing(prisma);
}

/** `plugin_installs` de ResellerClub (sample) — solo con credenciales OT&E. */
async function seedResellerclubInstall(prisma: PrismaClient): Promise<void> {
  const authUserId = (process.env.RESELLERCLUB_OTE_USERID ?? '').trim();
  const apiKey = (process.env.RESELLERCLUB_OTE_APIKEY ?? '').trim();
  if (!authUserId || !apiKey) {
    console.log(
      '  ⚠ RESELLERCLUB_OTE_USERID/APIKEY incompletas — saltando resellerclub plugin install',
    );
    return;
  }

  const existing = await prisma.pluginInstall.findUnique({
    where: { slug: RC_SLUG },
  });
  if (existing) {
    console.log(
      `  📦 resellerclub plugin install: preserved (existing — admin config wins).`,
    );
    return;
  }

  const vault = buildSeedVault();
  const userIdBlob = vault.encrypt(authUserId);
  const apiKeyBlob = vault.encrypt(apiKey);

  await prisma.pluginInstall.create({
    data: {
      slug: RC_SLUG,
      enabled: true,
      config: {
        environment: 'sandbox',
        markup_percent: MARKUP_PERCENT,
        tlds_offered: '.com,.net,.org,.es,.eu',
        default_currency: DEFAULT_CURRENCY,
      },
      secrets: {
        authUserId: blobToJson(userIdBlob),
        apiKey: blobToJson(apiKeyBlob),
      },
      key_version: vault.currentKeyVersion,
    },
  });
  console.log(
    `  📦 resellerclub plugin install: created (enabled=true, environment=sandbox)`,
  );
}

/** Un único producto "Dominio" por registrar (ADR-084 §1 — sin ProductPricing). */
async function seedDomainProduct(prisma: PrismaClient): Promise<void> {
  await prisma.product.upsert({
    where: { slug: DOMAIN_PRODUCT_SLUG },
    update: {},
    create: {
      slug: DOMAIN_PRODUCT_SLUG,
      name: 'Dominios',
      type: ProductType.domain,
      short_description: 'Registra y gestiona tus dominios.',
      description:
        'Registro y renovación de dominios (.com, .net, .org, .es, .eu) vía ResellerClub. El precio se calcula por extensión desde la tabla de pricing.',
      status: ProductStatus.active,
      provisioner: RC_SLUG,
      metadata: { seeded: true } as object,
    },
  });
  console.log(
    `  🌐 producto "Dominios" (type=domain, provisioner=resellerclub) listo.`,
  );
}

/** Filas `domain_tld_pricing` de muestra (register + renew, 1 año, EUR). */
async function seedTldPricing(prisma: PrismaClient): Promise<void> {
  const operations: DomainPriceOperation[] = [
    DomainPriceOperation.register,
    DomainPriceOperation.renew,
  ];
  let count = 0;
  for (const [tld, costStr] of Object.entries(TLD_COSTS)) {
    const cost = new Prisma.Decimal(costStr);
    const price = cost.mul(1 + MARKUP_PERCENT / 100).toDecimalPlaces(2);
    for (const operation of operations) {
      await prisma.domainTldPricing.upsert({
        where: {
          registrar_slug_tld_operation_years_price_currency: {
            registrar_slug: RC_SLUG,
            tld,
            operation,
            years: 1,
            price_currency: DEFAULT_CURRENCY,
          },
        },
        update: {},
        create: {
          registrar_slug: RC_SLUG,
          tld,
          operation,
          years: 1,
          cost_amount: cost,
          cost_currency: DEFAULT_CURRENCY,
          price_amount: price,
          price_currency: DEFAULT_CURRENCY,
          markup_percent: new Prisma.Decimal(MARKUP_PERCENT),
          source: DomainPriceSource.sync,
          active: true,
          synced_at: new Date(),
        },
      });
      count++;
    }
  }
  console.log(
    `  💶 domain_tld_pricing: ${count} filas (register+renew × 5 TLDs).`,
  );
}

/** Serializa el blob cifrado al shape persistido en `plugin_installs.secrets`. */
function blobToJson(blob: {
  ciphertext: string;
  iv: string;
  tag: string;
  key_version: number;
}): Prisma.InputJsonValue {
  return {
    ciphertext: blob.ciphertext,
    iv: blob.iv,
    tag: blob.tag,
    key_version: blob.key_version,
  };
}

/**
 * `SecretVaultService` standalone (shim `ConfigService` → `process.env`) — mismo
 * algoritmo AES-256-GCM que el backend en runtime (réplica de sample-enhance).
 */
function buildSeedVault(): SecretVaultService {
  const shim = {
    getOrThrow: (key: string): string => {
      const value = process.env[key];
      if (typeof value !== 'string' || value.length === 0) {
        throw new Error(
          `Seed vault: missing env var "${key}" (required by SecretVaultService).`,
        );
      }
      return value;
    },
  } as unknown as ConfigService;
  return new SecretVaultService(shim);
}
