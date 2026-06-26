import {
  PrismaClient,
  ProductType,
  ProductStatus,
  BillingCycle,
  SupportInsideSlotType,
  SupportInsideChannel,
  SupportInsidePriorityTier,
  SupportInsideCtaVisibility,
} from '@prisma/client';

// Sub-fase 8.D.12 (2026-05-01): tipos de producto canónicos a los que se
// les puede asignar slot Support Inside. Excluye `domain` (no se mantiene,
// se renueva), `support_inside` (auto-asignación absurda), y `we_do_it` /
// `custom_service` (a decidir cuando se introduzcan en el catálogo real).
const DEFAULT_APPLICABLE_PRODUCT_TYPES: ProductType[] = [
  ProductType.hosting_web,
  ProductType.docker_service,
];

/**
 * Seed canónico de los 3 planes Support Inside — Sprint 8 Fase D
 * (ADR-034 §"Tres niveles base" + ADR-061 + ADR-075).
 *
 * Operación canónica de la empresa, NO demo data. Se siembra siempre
 * (incluido NODE_ENV=production) — los 3 planes son la oferta comercial
 * permanente. Idempotente por slug.
 *
 * Pricing inicial (ADR-034 §"pendiente cerrar al lanzar" — los precios
 * exactos se ajustan con primeros clientes reales). Estos son
 * placeholders consistentes para entornos dev / CI / staging:
 *   - Básico:  19,00 €/mes — 0 slots incluidos, canales reactivos
 *   - Medium:  39,00 €/mes — 1 slot mantenimiento
 *   - Pro:     79,00 €/mes — 1 slot mantenimiento+gestión, prioridad max
 * Anual con 15% de descuento (precio final = monthly × 12 × 0.85).
 *
 * GL-23 (audit 2026-06-25): `channels_active` se alinea a los canales
 * **realmente entregables** hoy = webchat + email. `phone`/`whatsapp` se
 * retiran de la oferta hasta que exista dispatcher (no se vende lo que no se
 * entrega). Re-añadir un canal = 1 línea aquí + su entrega. Los precios y los
 * slots por plan NO se tocan (decisión Yasmin 2026-06-26).
 *
 * Cada plan tiene `support_inside_config` poblada con los campos que el
 * editor admin (ADR-075 §B.2) muestra en sus 5 secciones card.
 */

interface PlanSeed {
  slug: string;
  name: string;
  short_description: string;
  description: string;
  badge_text?: string;
  order_index: number;
  pricing_monthly: string;
  pricing_yearly: string;
  config: {
    slots_included: number;
    slot_types_allowed: SupportInsideSlotType[];
    applicable_product_types: ProductType[];
    extra_slot_price: string;
    channels_active: SupportInsideChannel[];
    priority_tier: SupportInsidePriorityTier;
    response_sla_hours: number;
    cta_visibility: SupportInsideCtaVisibility;
  };
}

const PLANS: ReadonlyArray<PlanSeed> = [
  {
    slug: 'support-inside-basico',
    name: 'Support Inside Básico',
    short_description:
      'Soporte reactivo con agente real. Sin mantenimientos incluidos.',
    description:
      'Acceso a webchat y email, con agente real de primeras en cualquier canal. Tareas técnicas básicas (DNS, instalar WordPress, plugins recomendados, configuraciones del producto) bajo demanda. Sin slots de mantenimiento incluidos — pueden contratarse aparte.',
    order_index: 1,
    pricing_monthly: '19.00',
    pricing_yearly: '193.80', // 19 × 12 × 0.85
    config: {
      slots_included: 0,
      slot_types_allowed: [SupportInsideSlotType.maintenance],
      applicable_product_types: DEFAULT_APPLICABLE_PRODUCT_TYPES,
      extra_slot_price: '12.00',
      channels_active: [
        SupportInsideChannel.webchat,
        SupportInsideChannel.email,
      ],
      priority_tier: SupportInsidePriorityTier.standard,
      response_sla_hours: 24,
      cta_visibility: SupportInsideCtaVisibility.catalog_banner,
    },
  },
  {
    slug: 'support-inside-medium',
    name: 'Support Inside Medium',
    short_description:
      '1 slot de mantenimiento mensual incluido + SLA de respuesta 12h.',
    description:
      'Todo Básico + 1 slot de mantenimiento mensual incluido (cubre actualizaciones, revisión backups, SSL, etc., según el checklist del servicio asignado al slot). Slots adicionales pueden contratarse aparte. SLA de respuesta 12h hábiles.',
    badge_text: 'Recomendado',
    order_index: 2,
    pricing_monthly: '39.00',
    pricing_yearly: '397.80', // 39 × 12 × 0.85
    config: {
      slots_included: 1,
      slot_types_allowed: [SupportInsideSlotType.maintenance],
      applicable_product_types: DEFAULT_APPLICABLE_PRODUCT_TYPES,
      extra_slot_price: '12.00',
      channels_active: [
        SupportInsideChannel.webchat,
        SupportInsideChannel.email,
      ],
      priority_tier: SupportInsidePriorityTier.high,
      response_sla_hours: 12,
      cta_visibility: SupportInsideCtaVisibility.catalog_banner,
    },
  },
  {
    slug: 'support-inside-pro',
    name: 'Support Inside Pro',
    short_description:
      '1 slot mantenimiento + gestión proactiva. Prioridad máxima en cola.',
    description:
      'Todo Medium + el slot incluido es de tipo mantenimiento + gestión proactiva (acompañamiento activo del servicio: optimizaciones de rendimiento, Cloudflare/CDN si crece tráfico, revisión de métricas, recomendaciones técnicas). Prioridad máxima en la cola del agente. SLA de respuesta 4h hábiles. Para negocios complejos que necesitan a alguien encima.',
    order_index: 3,
    pricing_monthly: '79.00',
    pricing_yearly: '805.80', // 79 × 12 × 0.85
    config: {
      slots_included: 1,
      slot_types_allowed: [
        SupportInsideSlotType.maintenance,
        SupportInsideSlotType.maintenance_management,
      ],
      applicable_product_types: DEFAULT_APPLICABLE_PRODUCT_TYPES,
      extra_slot_price: '24.00',
      channels_active: [
        SupportInsideChannel.webchat,
        SupportInsideChannel.email,
      ],
      priority_tier: SupportInsidePriorityTier.max,
      response_sla_hours: 4,
      cta_visibility: SupportInsideCtaVisibility.landing_cta,
    },
  },
];

export async function seedSupportInsidePlans(
  prisma: PrismaClient,
): Promise<void> {
  for (const plan of PLANS) {
    const product = await prisma.product.upsert({
      where: { slug: plan.slug },
      update: {
        name: plan.name,
        short_description: plan.short_description,
        description: plan.description,
        badge_text: plan.badge_text,
        order_index: plan.order_index,
        // Sprint 11 Fase 11.C: idempotencia para corregir BDs ya seedeadas
        // antes del cambio canónico (provisioner: 'manual' → 'internal').
        provisioner: 'internal',
      },
      create: {
        slug: plan.slug,
        name: plan.name,
        short_description: plan.short_description,
        description: plan.description,
        badge_text: plan.badge_text,
        order_index: plan.order_index,
        type: ProductType.support_inside,
        // ADR-034 §"Naturaleza": Support Inside es addon global de cuenta
        // que requiere al menos un producto activo para contratarse.
        is_addon: true,
        is_global_addon: true,
        requires_existing_product: true,
        status: ProductStatus.active,
        // Sprint 11 Fase 11.C (ADR-077 §3 mapping canónico): Support Inside
        // es servicio digital sin proveedor externo ni setup manual del
        // agente — usa el plugin `internal` que activa el service
        // inmediatamente tras `invoice.paid`. El listener Sprint 8 D.12.9
        // (`SupportInsideOnServiceProvisionedListener`) sigue creando la
        // SupportInsideSubscription aparte (consume `service.provisioned`
        // emitido por BillingCheckoutService al CREAR el service, no
        // `service.activated` del orquestador).
        provisioner: 'internal',
      },
    });

    // Pricing mensual
    await prisma.productPricing.upsert({
      where: {
        product_id_billing_cycle_currency: {
          product_id: product.id,
          billing_cycle: BillingCycle.monthly,
          currency: 'EUR',
        },
      },
      update: {},
      create: {
        product_id: product.id,
        billing_cycle: BillingCycle.monthly,
        price: plan.pricing_monthly,
        currency: 'EUR',
        active: true,
      },
    });

    // Pricing anual (con 15% descuento — declarado en discount_percentage
    // para que la UI lo muestre como "ahorro 15%" automáticamente).
    await prisma.productPricing.upsert({
      where: {
        product_id_billing_cycle_currency: {
          product_id: product.id,
          billing_cycle: BillingCycle.annual,
          currency: 'EUR',
        },
      },
      update: {},
      create: {
        product_id: product.id,
        billing_cycle: BillingCycle.annual,
        price: plan.pricing_yearly,
        currency: 'EUR',
        discount_percentage: '15.00',
        active: true,
      },
    });

    // SupportInsideConfig 1:1.
    // Update sincroniza `applicable_product_types` cuando cambia el seed
    // (no `slot_types_allowed`/`channels_active` etc, que el admin edita
    // desde la UI — preservamos su elección). El re-seed solo refresca lo
    // que es decisión técnica/migracional, no comercial.
    await prisma.supportInsideConfig.upsert({
      where: { product_id: product.id },
      update: {
        applicable_product_types: plan.config.applicable_product_types,
      },
      create: {
        product_id: product.id,
        slots_included: plan.config.slots_included,
        slot_types_allowed: plan.config.slot_types_allowed,
        applicable_product_types: plan.config.applicable_product_types,
        extra_slot_price: plan.config.extra_slot_price,
        channels_active: plan.config.channels_active,
        priority_tier: plan.config.priority_tier,
        response_sla_hours: plan.config.response_sla_hours,
        cta_visibility: plan.config.cta_visibility,
      },
    });
  }

  console.log(
    `  ✓ ${PLANS.length} planes Support Inside canónicos upserted (Básico/Medium/Pro)`,
  );
}
