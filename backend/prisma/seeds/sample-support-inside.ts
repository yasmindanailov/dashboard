import {
  PrismaClient,
  BillingCycle,
  ServiceStatus,
  SupportInsideSlotType,
  SupportInsideSubscriptionStatus,
} from '@prisma/client';

/**
 * Seed demo de Support Inside — Sprint 8 Fase D.12.10 (2026-05-01).
 *
 * Activa al cliente principal (`cliente@aelium.test`) en el plan
 * **Support Inside Medium** con **1 slot de mantenimiento** asignado a
 * un servicio técnico de demostración (hosting Pro mensual).
 *
 * Por qué este seed existe:
 *   - Habilita smoke testing rápido del flujo Support Inside completo:
 *     vista de gestión cliente, badge admin, listener priority en
 *     conversaciones, cron `maintenance-monthly` con `anniversary_day`,
 *     listener audit, etc.
 *   - Materializa la decisión Yasmin 2026-05-01: "Carla tiene plan + 1
 *     slot por defecto en seed para no tener que pasar por checkout en
 *     cada `pnpm seed`".
 *
 * Por qué NO usa `BillingCheckoutService` ni emit de eventos:
 *   - El seed corre fuera del contexto Nest (script standalone con Prisma
 *     directo). No hay EventEmitter, no hay listeners. Insertamos las 3
 *     filas (Service + SupportInsideSubscription + SupportInsideSlot)
 *     directamente — patrón canónico de los demás `sample-*.ts`.
 *   - El listener `support-inside-on-service-provisioned` (sub-fase
 *     8.D.12.9) está pensado para el flujo runtime (checkout cliente
 *     real), no para el bootstrap del seed.
 *
 * Salvaguardas:
 *   - Skip si `NODE_ENV === 'production'` (Carla y su plan son demo data).
 *   - Idempotente: si la subscription ya existe activa, NO duplica ni
 *     toca el slot. Si existe cancelled, la reactiva (UQ client_id).
 *   - Si `cliente@aelium.test` no existe (seed previo no ejecutado o
 *     falló) o no hay plan Medium seedeado, log info y skip.
 *   - Marker `metadata.seeded = true` en la subscription para limpieza
 *     selectiva futura (mismo patrón que sample-invoices/sample-support).
 *
 * Dependencias en orden de ejecución:
 *   1. `seedSupportInsidePlans` — crea producto `support-inside-medium`.
 *   2. `seedTestAccounts` — crea `cliente@aelium.test`.
 *   3. `seedSampleProducts` — crea `hosting-pro` (al que apunta el slot).
 *   4. **Este seed** corre después de los 3 anteriores en `seed.ts`.
 */
export async function seedSampleSupportInside(
  prisma: PrismaClient,
): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.log('  ⚠ NODE_ENV=production — saltando sample-support-inside');
    return;
  }

  // 1. Resolver dependencias.
  const client = await prisma.user.findUnique({
    where: { email: 'cliente@aelium.test' },
    select: { id: true },
  });
  if (!client) {
    console.log('  ⚠ cliente@aelium.test no existe — saltando sample-support-inside');
    return;
  }

  const mediumPlan = await prisma.product.findUnique({
    where: { slug: 'support-inside-medium' },
    include: {
      pricing: { where: { active: true, billing_cycle: BillingCycle.monthly } },
    },
  });
  if (!mediumPlan || mediumPlan.pricing.length === 0) {
    console.log('  ⚠ plan support-inside-medium sin pricing mensual — saltando sample-support-inside');
    return;
  }
  const planPricing = mediumPlan.pricing[0];

  const hostingProduct = await prisma.product.findUnique({
    where: { slug: 'hosting-pro' },
    include: {
      pricing: { where: { active: true, billing_cycle: BillingCycle.monthly } },
    },
  });
  if (!hostingProduct || hostingProduct.pricing.length === 0) {
    console.log('  ⚠ producto hosting-pro sin pricing — saltando sample-support-inside');
    return;
  }
  const hostingPricing = hostingProduct.pricing[0];

  // 2. Idempotencia: si la subscription ya está activa, salimos sin tocar.
  const existing = await prisma.supportInsideSubscription.findUnique({
    where: { client_id: client.id },
    include: { slots: { where: { released_at: null } } },
  });
  if (existing && existing.status === 'active' && existing.slots.length > 0) {
    console.log(
      `  ✓ ${client.id} ya tiene Support Inside activo con ${existing.slots.length} slot(s) — sin cambios`,
    );
    return;
  }

  // 3. Crear (o reutilizar) los Services estándar de billing.
  //    a) Service que ancla el cobro recurrente del plan SI Medium.
  //    b) Service hosting al que apuntará el slot.
  // Idempotente: cada cliente tiene como mucho 1 Service activo por
  // (product_id, status='active'). Si ya existe activo, lo reutilizamos.
  const now = new Date();
  const monthFromNow = new Date(now.getTime() + 30 * 86_400_000);

  const planService = await ensureActiveService(prisma, {
    user_id: client.id,
    product_id: mediumPlan.id,
    label: `Support Inside — ${mediumPlan.name}`,
    amount: planPricing.price.toString(),
    currency: planPricing.currency,
    billing_cycle: planPricing.billing_cycle,
    next_due_date: monthFromNow,
  });

  const hostingService = await ensureActiveService(prisma, {
    user_id: client.id,
    product_id: hostingProduct.id,
    label: 'Web demo Carla',
    domain: 'demo-carla.aelium.test',
    amount: hostingPricing.price.toString(),
    currency: hostingPricing.currency,
    billing_cycle: hostingPricing.billing_cycle,
    next_due_date: monthFromNow,
  });

  // 4. Upsert SupportInsideSubscription apuntando al planService.
  //    UQ client_id permite reactivar una cancelada.
  const subscription = existing
    ? await prisma.supportInsideSubscription.update({
        where: { client_id: client.id },
        data: {
          product_id: mediumPlan.id,
          service_id: planService.id,
          status: SupportInsideSubscriptionStatus.active,
          started_at: now,
          cancelled_at: null,
          cancellation_reason: null,
          metadata: { seeded: true } as object,
        },
      })
    : await prisma.supportInsideSubscription.create({
        data: {
          client_id: client.id,
          product_id: mediumPlan.id,
          service_id: planService.id,
          status: SupportInsideSubscriptionStatus.active,
          metadata: { seeded: true } as object,
        },
      });

  // 5. Asignar 1 slot al hostingService (si aún no tiene uno activo).
  const existingSlot = await prisma.supportInsideSlot.findFirst({
    where: { service_id: hostingService.id, released_at: null },
    select: { id: true },
  });
  if (!existingSlot) {
    const todayDay = Math.min(now.getUTCDate(), 28);
    await prisma.supportInsideSlot.create({
      data: {
        subscription_id: subscription.id,
        service_id: hostingService.id,
        slot_type: SupportInsideSlotType.maintenance,
        is_extra: false,
        anniversary_day: todayDay,
        metadata: { seeded: true } as object,
      },
    });
  }

  console.log(
    `  ✓ Support Inside Medium activado para cliente@aelium.test con 1 slot en ${hostingService.label}`,
  );
}

/**
 * Garantiza que existe un Service activo del cliente para el producto.
 * Reutiliza si ya hay uno activo (idempotente). Si no existe, lo crea.
 */
async function ensureActiveService(
  prisma: PrismaClient,
  data: {
    user_id: string;
    product_id: string;
    label: string;
    domain?: string;
    amount: string;
    currency: string;
    billing_cycle: BillingCycle;
    next_due_date: Date;
  },
) {
  const existing = await prisma.service.findFirst({
    where: {
      user_id: data.user_id,
      product_id: data.product_id,
      status: ServiceStatus.active,
    },
  });
  if (existing) return existing;

  return prisma.service.create({
    data: {
      user_id: data.user_id,
      product_id: data.product_id,
      label: data.label,
      domain: data.domain ?? null,
      status: ServiceStatus.active,
      amount: data.amount,
      currency: data.currency,
      billing_cycle: data.billing_cycle,
      next_due_date: data.next_due_date,
      next_invoice_date: data.next_due_date,
      metadata: { seeded: true } as object,
    },
  });
}
