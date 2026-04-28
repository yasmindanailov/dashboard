import { PrismaClient, InvoiceStatus } from '@prisma/client';

/**
 * Seed de facturas de muestra — Sprint 9.6 Fase F.0 (DC.7).
 *
 * Crea 2 facturas del cliente principal (`cliente@aelium.test`):
 *
 *  - INV-DEMO-0001  paid     12.00 € + IVA → 14.52 €  (Hosting Pro mensual, ya cobrada)
 *  - INV-DEMO-0002  pending  19.00 € + IVA → 22.99 €  (Support Inside Basic, vence en 7 días)
 *
 * Sirven para que el smoke local muestre datos reales en
 * `/admin/billing` (full UX con columna Cliente) y `/dashboard/billing`
 * (UX cliente sin columna Cliente). Y para que los specs E2E que
 * validan la UX divergente tengan filas que comparar.
 *
 * Salvaguardas:
 *  - Skip si NODE_ENV === 'production'.
 *  - Idempotente vía `upsert` por `invoice_number` (campo unique).
 *  - `notes = 'SEED_DEMO'` como marker estable para identificar las
 *    filas demo desde un futuro `pnpm seed:clean`.
 */

interface SampleInvoice {
  invoice_number: string;
  status: InvoiceStatus;
  product_slug: string;
  description: string;
  unit_price: string;
  /** Días desde hoy hasta `due_date`. Negativo = vencido. */
  due_in_days: number;
  /** Si paid: días desde hoy hasta `paid_at` (debe ser <= due_in_days). */
  paid_days_ago?: number;
}

const INVOICES: ReadonlyArray<SampleInvoice> = [
  {
    invoice_number: 'INV-DEMO-0001',
    status: InvoiceStatus.paid,
    product_slug: 'hosting-pro',
    description: 'Hosting Pro — Mensualidad',
    unit_price: '12.00',
    due_in_days: -23, // vencía hace 23 días
    paid_days_ago: 23, // pagada el día del vencimiento
  },
  {
    invoice_number: 'INV-DEMO-0002',
    status: InvoiceStatus.pending,
    product_slug: 'support-inside-basic',
    description: 'Support Inside Basic — Mensualidad',
    unit_price: '19.00',
    due_in_days: 7, // vence en 7 días
  },
];

const TAX_RATE = 21; // %

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function calculateTotals(unitPrice: string): {
  subtotal: string;
  tax_amount: string;
  total: string;
} {
  const subtotal = Number(unitPrice);
  const tax_amount = (subtotal * TAX_RATE) / 100;
  const total = subtotal + tax_amount;
  return {
    subtotal: subtotal.toFixed(2),
    tax_amount: tax_amount.toFixed(2),
    total: total.toFixed(2),
  };
}

export async function seedSampleInvoices(prisma: PrismaClient): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.log('  ⚠ NODE_ENV=production — saltando sample-invoices');
    return;
  }

  const client = await prisma.user.findUnique({
    where: { email: 'cliente@aelium.test' },
  });
  if (!client) {
    console.log('  ⚠ cliente@aelium.test no existe — saltando sample-invoices');
    return;
  }

  const billingProfile = await prisma.billingProfile.findFirst({
    where: { user_id: client.id, is_default: true },
  });

  const now = new Date();
  let created = 0;

  for (const inv of INVOICES) {
    const product = await prisma.product.findUnique({
      where: { slug: inv.product_slug },
    });
    if (!product) continue;

    const totals = calculateTotals(inv.unit_price);
    const due_date = addDays(now, inv.due_in_days);
    const paid_at = inv.paid_days_ago
      ? addDays(now, -inv.paid_days_ago)
      : null;

    const existing = await prisma.invoice.findUnique({
      where: { invoice_number: inv.invoice_number },
    });

    if (existing) continue; // idempotencia: no recreamos

    await prisma.invoice.create({
      data: {
        invoice_number: inv.invoice_number,
        user_id: client.id,
        billing_profile_id: billingProfile?.id,
        status: inv.status,
        subtotal: totals.subtotal,
        tax_rate: TAX_RATE,
        tax_amount: totals.tax_amount,
        total: totals.total,
        currency: 'EUR',
        due_date,
        paid_at,
        is_manual: true,
        notes: 'SEED_DEMO',
        metadata: { seeded: true } as object,
        items: {
          create: [
            {
              product_id: product.id,
              description: inv.description,
              quantity: 1,
              unit_price: inv.unit_price,
              setup_fee: '0',
              total: inv.unit_price,
            },
          ],
        },
      },
    });

    created++;
  }

  console.log(
    `  ✓ ${created} facturas demo creadas (${INVOICES.length - created} ya existían)`,
  );
}
