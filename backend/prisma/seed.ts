import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import { seedRoles } from './seeds/roles';
import { seedSettings } from './seeds/settings';
import { seedPluginInstalls } from './seeds/plugin-installs';
import { seedTestAccounts } from './seeds/test-accounts';
import { seedSampleClients } from './seeds/sample-clients';
import { seedSampleProducts } from './seeds/sample-products';
import { seedSampleInvoices } from './seeds/sample-invoices';
import { seedSampleSupport } from './seeds/sample-support';
import { seedNotificationTemplates } from './seeds/notification-templates';
import { seedSampleClientNotes } from './seeds/sample-client-notes';
import { seedSupportInsidePlans } from './seeds/support-inside-plans';
import { seedSampleSupportInside } from './seeds/sample-support-inside';
import { seedSampleEnhancePluginInstall } from './seeds/sample-enhance-plugin-install';

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
    // Sprint 15A (ADR-080 §2) — plugins triviales canónicos `internal` y `manual`
    // habilitados por defecto. Operación canónica de la empresa (NO demo data) —
    // se siembra siempre, incluso en producción. Plugins reales (Sprint 15B/C/D/E/G)
    // se instalan desde la UI admin con secrets cifrados.
    await seedPluginInstalls(prisma);
    // Sprint 15C Fase 15C.J — seed dev/QA del plugin install enhance_cp.
    // Condicional: solo siembra si NODE_ENV !== 'production' Y las 3 env
    // vars ENHANCE_DEV_BASE_URL/MASTER_ORG_ID/API_TOKEN están completas.
    // En producción, el plugin Enhance se configura desde la UI admin
    // (`/admin/settings/plugins`) con secrets cifrados — el seed no
    // sustituye ese flujo, solo lo automatiza para QA/staging/dev.
    await seedSampleEnhancePluginInstall(prisma);
    await seedNotificationTemplates(prisma);
    // Sprint 16 (ADR-079): el catálogo de tags se eliminó. Las notas demo
    // se generan en `sample-client-notes` después de los clientes/tickets.
    // Sprint 8 Fase D (ADR-034 + ADR-061 + ADR-075) — los 3 planes
    // canónicos Support Inside. Operación canónica de la empresa, no
    // demo data: se siembra SIEMPRE (incluso en producción) con upsert
    // idempotente por slug.
    await seedSupportInsidePlans(prisma);
    await seedTestAccounts(prisma);
    await seedSampleClients(prisma);
    await seedSampleProducts(prisma);
    await seedSampleInvoices(prisma);
    await seedSampleSupport(prisma);
    // Sub-fase 8.D.12.10 — depende de support-inside-plans + sample-products
    // (hosting-pro como servicio cubierto) + test-accounts (cliente Carla).
    await seedSampleSupportInside(prisma);
    // Sprint 16 (ADR-079) — 2 notas demo para Carla en el ClientNotesTab:
    // una `source_system='exceptional'` + una `source_system='ticket'`.
    await seedSampleClientNotes(prisma);

    console.log('✅ Seed completed');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('❌ Seed failed:', e);
  process.exit(1);
});
