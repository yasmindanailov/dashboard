/**
 * Crea una cuenta cliente de prueba con datos para smoke test manual
 * post Sprint 9. Idempotente: si el cliente ya existe, lo reutiliza.
 *
 * Uso:  pnpm --dir backend tsx scripts/seed-test-account.ts
 *   (o):  pnpm --dir backend ts-node scripts/seed-test-account.ts
 *
 * Genera:
 *  - Cliente test:     test-cliente@aelium.test  /  TestCliente2026!
 *  - Factura para el cliente (estado pending) — para que /dashboard/billing
 *    tenga contenido y el portal /dashboard/transparency reciba accesos
 *    cuando un admin la consulte.
 *
 * El superadmin ya está seedeado vía prisma/seed.ts:
 *  - admin@aelium.net  /  AeliumDev2026
 */

import 'dotenv/config';
import { PrismaClient, RoleSlug } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const CLIENT_EMAIL = 'test-cliente@aelium.test';
const CLIENT_PASSWORD = 'TestCliente2026!';

async function main() {
  console.log('🌱 Sembrando cuenta cliente de prueba...');

  // 1. Resolver rol cliente
  const clientRole = await prisma.role.findUniqueOrThrow({
    where: { slug: RoleSlug.client },
  });

  // 2. Upsert cliente
  const passwordHash = await bcrypt.hash(CLIENT_PASSWORD, 12);
  const client = await prisma.user.upsert({
    where: { email: CLIENT_EMAIL },
    update: {
      password_hash: passwordHash,
      status: 'active',
      email_verified_at: new Date(),
    },
    create: {
      email: CLIENT_EMAIL,
      password_hash: passwordHash,
      first_name: 'Cliente',
      last_name: 'Demo',
      status: 'active',
      email_verified_at: new Date(),
      role_id: clientRole.id,
    },
  });
  console.log(`  ✓ Cliente: ${client.email} (id ${client.id})`);

  // 3. Billing profile mínimo (necesario para crear factura)
  const billingProfile = await prisma.billingProfile.upsert({
    where: {
      // No hay constraint único trivial — buscamos por user_id+is_default
      id: (
        await prisma.billingProfile.findFirst({
          where: { user_id: client.id },
          select: { id: true },
        })
      )?.id ?? '00000000-0000-0000-0000-000000000000',
    },
    update: {},
    create: {
      user_id: client.id,
      type: 'personal',
      label: 'Personal',
      first_name: 'Cliente',
      last_name: 'Demo',
      nif_cif: '00000000T',
      address_line1: 'Calle Demo 1',
      city: 'Madrid',
      postal_code: '28001',
      country: 'ES',
      is_default: true,
    },
  });
  console.log(`  ✓ Billing profile: ${billingProfile.id}`);

  // 4. Factura pendiente (estado pending) — útil para smoke test del flujo
  //    /dashboard/billing y como recurso accedido por admin para activar
  //    el AuditInterceptor.
  const existing = await prisma.invoice.findFirst({
    where: { user_id: client.id, notes: 'Factura E2E sprint 9 — smoke test' },
    select: { id: true, invoice_number: true },
  });
  if (existing) {
    console.log(
      `  ✓ Factura ya existe: ${existing.invoice_number} (id ${existing.id})`,
    );
  } else {
    // Generar invoice_number simple — saltamos la sequence canónica para
    // no chocar con el cron de generación. Sufijo "TEST" deja claro que
    // no es producción.
    const count = await prisma.invoice.count();
    const invoice = await prisma.invoice.create({
      data: {
        invoice_number: `AELIUM-TEST-${String(count + 1).padStart(4, '0')}`,
        user_id: client.id,
        billing_profile_id: billingProfile.id,
        status: 'pending',
        subtotal: 100,
        tax_rate: 21,
        tax_amount: 21,
        discount_amount: 0,
        total: 121,
        currency: 'EUR',
        due_date: new Date(Date.now() + 30 * 86400_000),
        is_manual: true,
        notes: 'Factura E2E sprint 9 — smoke test',
        items: {
          create: [
            {
              description: 'Hosting demo — 1 mes',
              quantity: 1,
              unit_price: 100,
              setup_fee: 0,
              discount_pct: 0,
              total: 100,
            },
          ],
        },
      },
    });
    console.log(
      `  ✓ Factura: ${invoice.invoice_number} (id ${invoice.id}, total ${invoice.total} ${invoice.currency})`,
    );
  }

  console.log('');
  console.log('✅ Cuenta cliente de prueba lista');
  console.log('');
  console.log('Credenciales:');
  console.log(`  CLIENTE:    ${CLIENT_EMAIL}  /  ${CLIENT_PASSWORD}`);
  console.log(`  SUPERADMIN: admin@aelium.net  /  AeliumDev2026`);
  console.log('');
  console.log('URLs:');
  console.log('  Frontend:        http://localhost:3002');
  console.log('  API:             http://localhost:3001/api/v1');
  console.log('  API Swagger:     http://localhost:3001/api/v1/docs');
  console.log('  Mailpit:         http://localhost:8025');
  console.log('  MinIO console:   http://localhost:9001  (minioadmin/minioadmin)');
}

main()
  .catch((e) => {
    console.error('❌ Seed test-account falló:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
