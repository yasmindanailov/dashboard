import {
  PrismaClient,
  ProductType,
  ProductStatus,
  BillingCycle,
} from '@prisma/client';

/**
 * Seed de productos de muestra — Sprint 9.6 Fase F.0 (DC.7).
 *
 * Catálogo mínimo profesional para que `/admin/products`,
 * `/admin/billing/checkout` (5 steps) y `/dashboard/billing/checkout`
 * (4 steps) tengan productos disponibles al hacer smoke local.
 *
 *  - hosting-pro          (hosting_web)    — 3 ciclos (mensual / trimestral / anual)
 *
 * Sprint 8 Fase D + ADR-075 (2026-05-01): el producto demo
 * `support-inside-basic` se eliminó de aquí. Los 3 planes canónicos
 * Básico/Medium/Pro de Support Inside se seedean en
 * `support-inside-plans.ts` como operación canónica (no demo data),
 * con su `support_inside_config` poblada según ADR-034 §"Tres niveles".
 *
 * Salvaguardas:
 *  - Skip si NODE_ENV === 'production'.
 *  - Idempotente vía `upsert` por `slug` (campo unique del modelo).
 *  - `metadata.seeded = true` marker para limpieza selectiva futura.
 */

interface SamplePricing {
  billing_cycle: BillingCycle;
  price: string;
  setup_fee?: string;
  discount_percentage?: string;
}

interface SampleProduct {
  slug: string;
  name: string;
  type: ProductType;
  short_description: string;
  description: string;
  badge_text?: string;
  is_addon?: boolean;
  is_global_addon?: boolean;
  pricing: SamplePricing[];
}

const PRODUCTS: ReadonlyArray<SampleProduct> = [
  {
    slug: 'hosting-pro',
    name: 'Hosting Pro',
    type: ProductType.hosting_web,
    short_description: 'Hosting web gestionado para proyectos profesionales.',
    description:
      'Plan de hosting web con SSD, backups diarios, SSL gratuito y panel cPanel. Ideal para sitios WordPress, ecommerce y aplicaciones a medida.',
    badge_text: 'Recomendado',
    pricing: [
      { billing_cycle: BillingCycle.monthly, price: '12.00' },
      { billing_cycle: BillingCycle.quarterly, price: '34.20', discount_percentage: '5.00' },
      { billing_cycle: BillingCycle.annual, price: '115.20', discount_percentage: '20.00' },
    ],
  },
];

export async function seedSampleProducts(prisma: PrismaClient): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.log('  ⚠ NODE_ENV=production — saltando sample-products');
    return;
  }

  for (const p of PRODUCTS) {
    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      update: {},
      create: {
        slug: p.slug,
        name: p.name,
        type: p.type,
        short_description: p.short_description,
        description: p.description,
        badge_text: p.badge_text,
        is_addon: p.is_addon ?? false,
        is_global_addon: p.is_global_addon ?? false,
        status: ProductStatus.active,
        provisioner: 'manual',
        metadata: { seeded: true } as object,
      },
    });

    for (const pricing of p.pricing) {
      await prisma.productPricing.upsert({
        where: {
          product_id_billing_cycle_currency: {
            product_id: product.id,
            billing_cycle: pricing.billing_cycle,
            currency: 'EUR',
          },
        },
        update: {},
        create: {
          product_id: product.id,
          billing_cycle: pricing.billing_cycle,
          price: pricing.price,
          setup_fee: pricing.setup_fee ?? '0',
          currency: 'EUR',
          discount_percentage: pricing.discount_percentage,
          active: true,
        },
      });
    }
  }

  console.log(
    `  ✓ ${PRODUCTS.length} productos demo (${PRODUCTS.reduce((n, p) => n + p.pricing.length, 0)} pricing rows) upserted`,
  );
}
