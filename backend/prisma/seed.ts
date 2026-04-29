import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import { seedRoles } from './seeds/roles';
import { seedSettings } from './seeds/settings';
import { seedTestAccounts } from './seeds/test-accounts';
import { seedSampleClients } from './seeds/sample-clients';
import { seedSampleProducts } from './seeds/sample-products';
import { seedSampleInvoices } from './seeds/sample-invoices';
import { seedSampleSupport } from './seeds/sample-support';
import { seedNotificationTemplates } from './seeds/notification-templates';
import { seedSampleTaskTags } from './seeds/sample-task-tags';

/**
 * Orquestador del seed de la base de datos — Sprint 9.6 Fase F.0
 * (DC.7 + ADR-066).
 *
 * Compone los módulos de `seeds/` en el orden correcto. Cada módulo
 * es **idempotente** (re-seed no rompe ni duplica) y los módulos demo
 * (`test-accounts`, `sample-*`) ejecutan un guard interno
 * `NODE_ENV !== 'production'` para no contaminar producción con
 * datos de prueba.
 *
 * Orden de ejecución:
 *   1. roles                  — Foreign key necesaria para todo lo demás.
 *   2. settings               — Catálogo global; sin FKs.
 *   3. notification-templates — Plantillas Handlebars (Sprint 9 Fase D).
 *   4. test-accounts          — 1 cuenta por cada rol (incluye superadmin).
 *   5. sample-clients         — 2 clientes demo + perfiles billing.
 *   6. sample-products        — 2 productos demo + pricing rows.
 *   7. sample-invoices        — 2 facturas del cliente principal.
 *   8. sample-support         — 1 ticket + 1 chat del cliente principal.
 *
 * En producción solo corren los pasos 1-4 (la cuenta superadmin sí se
 * siembra, las demo `*.test` se omiten via guard).
 *
 * Documentación canónica de cuentas y datos de muestra:
 * `docs/50-operations/seed-reference.md`.
 */
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  console.log('🌱 Seeding database...');
  console.log(`  Environment: NODE_ENV=${process.env.NODE_ENV || '(undefined)'}`);

  try {
    await seedRoles(prisma);
    await seedSettings(prisma);
    await seedNotificationTemplates(prisma);
    // Sprint 8 Fase B.7 (ADR-073) — catálogo operativo, no datos demo:
    // se siembra siempre (idempotente vía slug).
    await seedSampleTaskTags(prisma);
    await seedTestAccounts(prisma);
    await seedSampleClients(prisma);
    await seedSampleProducts(prisma);
    await seedSampleInvoices(prisma);
    await seedSampleSupport(prisma);

    console.log('✅ Seed completed');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('❌ Seed failed:', e);
  process.exit(1);
});
