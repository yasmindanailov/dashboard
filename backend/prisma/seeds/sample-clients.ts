import {
  PrismaClient,
  RoleSlug,
  UserStatus,
  ClientType,
  BillingProfileType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

/**
 * Seed de clientes de muestra — Sprint 9.6 Fase F.0 (DC.7).
 *
 * Crea 2 clientes adicionales (B2C y B2B) con su `client_profile` y
 * `billing_profile` asociado, para que el árbol admin
 * (`/admin/clients`, `/admin/billing`, `/admin/support`) tenga >1
 * cliente al validar la UX. El cliente principal sigue siendo
 * `cliente@aelium.test` (creado en `test-accounts.ts`); este seed
 * añade volumen mínimo profesional.
 *
 * Salvaguardas:
 *  - Skip si NODE_ENV === 'production' (datos demo, no producción).
 *  - Idempotente vía upsert por email.
 *  - `metadata.seeded = true` en cada cliente para futuras limpiezas
 *    selectivas.
 *  - `client_profile.notes_internal = 'SEED_DEMO'` como marker
 *    adicional (también consultable desde admin UI si hace falta).
 */

interface SampleClient {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  client_type: ClientType;
  company_name?: string;
  tax_id?: string;
  phone?: string;
  /** BillingProfile asociado al cliente. */
  billing: {
    type: BillingProfileType;
    label: string;
    company_name?: string;
    nif_cif?: string;
    address_line1: string;
    city: string;
    postal_code: string;
  };
}

const CLIENTS: ReadonlyArray<SampleClient> = [
  {
    email: 'maria.perez@aelium.test',
    password: 'Cliente2026!',
    first_name: 'María',
    last_name: 'Pérez',
    client_type: ClientType.individual,
    phone: '+34 600 111 222',
    billing: {
      type: BillingProfileType.personal,
      label: 'Personal — María Pérez',
      address_line1: 'Calle Mayor 12, 3º B',
      city: 'Madrid',
      postal_code: '28013',
    },
  },
  {
    email: 'contacto@acme-demo.test',
    password: 'Cliente2026!',
    first_name: 'Carlos',
    last_name: 'Acme',
    client_type: ClientType.company,
    company_name: 'Acme Solutions S.L.',
    tax_id: 'B12345678',
    phone: '+34 911 222 333',
    billing: {
      type: BillingProfileType.empresa,
      label: 'Acme Solutions S.L. — fiscal',
      company_name: 'Acme Solutions S.L.',
      nif_cif: 'B12345678',
      address_line1: 'Av. Diagonal 401, planta 5',
      city: 'Barcelona',
      postal_code: '08008',
    },
  },
];

export async function seedSampleClients(prisma: PrismaClient): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.log('  ⚠ NODE_ENV=production — saltando sample-clients');
    return;
  }

  const clientRole = await prisma.role.findUnique({
    where: { slug: RoleSlug.client },
  });
  if (!clientRole) throw new Error('Rol client no existe — ejecuta seedRoles primero');

  for (const c of CLIENTS) {
    const hash = await bcrypt.hash(c.password, 12);

    const user = await prisma.user.upsert({
      where: { email: c.email },
      update: { password_hash: hash },
      create: {
        email: c.email,
        password_hash: hash,
        first_name: c.first_name,
        last_name: c.last_name,
        status: UserStatus.active,
        email_verified_at: new Date(),
        role_id: clientRole.id,
      },
    });

    // ClientProfile: 1:1 con user — upsert por unique user_id.
    await prisma.clientProfile.upsert({
      where: { user_id: user.id },
      update: {},
      create: {
        user_id: user.id,
        client_type: c.client_type,
        company_name: c.company_name,
        tax_id: c.tax_id,
        phone: c.phone,
        country: 'ES',
        notes_internal: 'SEED_DEMO',
        metadata: { seeded: true } as object,
      },
    });

    // BillingProfile: el modelo no tiene unique natural útil para
    // upsert (user_id+label podría duplicarse). Usamos findFirst +
    // create-if-not-exists para idempotencia.
    const existingProfile = await prisma.billingProfile.findFirst({
      where: { user_id: user.id, label: c.billing.label },
    });

    if (!existingProfile) {
      await prisma.billingProfile.create({
        data: {
          user_id: user.id,
          type: c.billing.type,
          label: c.billing.label,
          first_name: c.first_name,
          last_name: c.last_name,
          company_name: c.billing.company_name,
          nif_cif: c.billing.nif_cif,
          address_line1: c.billing.address_line1,
          city: c.billing.city,
          postal_code: c.billing.postal_code,
          country: 'ES',
          is_default: true,
        },
      });
    }
  }

  // El cliente principal del test-accounts (cliente@aelium.test)
  // también necesita su client_profile + billing_profile para que el
  // checkout cliente y los specs E2E tengan datos reales.
  const mainClient = await prisma.user.findUnique({
    where: { email: 'cliente@aelium.test' },
  });
  if (mainClient) {
    await prisma.clientProfile.upsert({
      where: { user_id: mainClient.id },
      update: {},
      create: {
        user_id: mainClient.id,
        client_type: ClientType.individual,
        phone: '+34 600 999 888',
        country: 'ES',
        notes_internal: 'SEED_DEMO',
        metadata: { seeded: true } as object,
      },
    });

    const existingMainProfile = await prisma.billingProfile.findFirst({
      where: { user_id: mainClient.id, label: 'Personal — Carla' },
    });
    if (!existingMainProfile) {
      await prisma.billingProfile.create({
        data: {
          user_id: mainClient.id,
          type: BillingProfileType.personal,
          label: 'Personal — Carla',
          first_name: 'Carla',
          last_name: 'Cliente Demo',
          address_line1: 'Calle Aelium 1',
          city: 'Madrid',
          postal_code: '28001',
          country: 'ES',
          is_default: true,
        },
      });
    }
  }

  console.log(`  ✓ ${CLIENTS.length} clientes demo + 1 perfil principal upserted`);
}
