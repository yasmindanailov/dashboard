import { PrismaClient, RoleSlug, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

/**
 * Seed de cuentas de prueba — Sprint 9.6 Fase F.0 (DC.7).
 *
 * Crea **una cuenta por cada rol** con credenciales conocidas para que
 * el equipo y los tests E2E puedan validar inmediatamente cada portal
 * y cada granularidad CASL sin tener que crear usuarios a mano.
 *
 * Tabla canónica de cuentas (consultar también
 * `docs/50-operations/seed-reference.md`):
 *
 *   superadmin        admin@aelium.net              AeliumDev2026!
 *   agent_full        agent.full@aelium.test        AgentFull2026!
 *   agent_billing     agent.billing@aelium.test     AgentBilling2026!
 *   agent_support     agent.support@aelium.test     AgentSupport2026!
 *   client            cliente@aelium.test           Cliente2026!
 *   partner           partner@aelium.test           Partner2026!
 *   partner_pending   partner.pending@aelium.test   Partner2026!
 *
 * Salvaguardas profesionales:
 *
 *  1. **Guard NODE_ENV**: las cuentas `*.test` SOLO se siembran si
 *     `NODE_ENV !== 'production'`. La cuenta superadmin sí se siembra
 *     siempre (la necesitamos también en producción para boot inicial).
 *     Si alguien ejecuta `pnpm seed` con `NODE_ENV=production` por
 *     error, abortamos antes de tocar la base de datos para evitar
 *     filtrar credenciales de test a producción.
 *
 *  2. **Override por env vars**: cualquier password se puede sustituir
 *     vía `SEED_*_PASSWORD` (`SEED_AGENT_FULL_PASSWORD`,
 *     `SEED_CLIENT_PASSWORD`, etc.). Permite que CI/local tengan
 *     credenciales distintas sin tocar el repo.
 *
 *  3. **TLD `.test` (RFC 6761)**: reservado, jamás resuelve público.
 *     Imposibilita que las cuentas demo lleguen a inboxes reales.
 *
 *  4. **`metadata.seeded = true`** sobre cada usuario demo (NO sobre
 *     superadmin, que es legítimo). Un futuro `pnpm seed:clean` puede
 *     borrar selectivamente lo demo sin tocar datos reales.
 *
 * Idempotente: `upsert` por email. Reseed actualiza `password_hash`
 * (útil cuando rotamos passwords) pero preserva `id`, `created_at`,
 * y referencias a sesiones / tokens / facturas / tickets.
 */

interface TestAccount {
  email: string;
  password: string;
  role: RoleSlug;
  first_name: string;
  last_name: string;
  status: UserStatus;
  /** Marker — true para cuentas demo, false para superadmin. */
  isDemo: boolean;
  /** Override env var name; si está definida, sustituye `password`. */
  passwordEnv?: string;
}

const SUPERADMIN: TestAccount = {
  email: process.env.SUPERADMIN_EMAIL || 'admin@aelium.net',
  password: process.env.SUPERADMIN_PASSWORD || 'AeliumDev2026!',
  role: RoleSlug.superadmin,
  first_name: 'Admin',
  last_name: 'Aelium',
  status: UserStatus.active,
  isDemo: false,
};

const DEMO_ACCOUNTS: ReadonlyArray<TestAccount> = [
  {
    email: 'agent.full@aelium.test',
    password: 'AgentFull2026!',
    passwordEnv: 'SEED_AGENT_FULL_PASSWORD',
    role: RoleSlug.agent_full,
    first_name: 'Ana',
    last_name: 'Agente Full',
    status: UserStatus.active,
    isDemo: true,
  },
  {
    email: 'agent.billing@aelium.test',
    password: 'AgentBilling2026!',
    passwordEnv: 'SEED_AGENT_BILLING_PASSWORD',
    role: RoleSlug.agent_billing,
    first_name: 'Bruno',
    last_name: 'Agente Billing',
    status: UserStatus.active,
    isDemo: true,
  },
  {
    email: 'agent.support@aelium.test',
    password: 'AgentSupport2026!',
    passwordEnv: 'SEED_AGENT_SUPPORT_PASSWORD',
    role: RoleSlug.agent_support,
    first_name: 'Sara',
    last_name: 'Agente Support',
    status: UserStatus.active,
    isDemo: true,
  },
  {
    email: 'cliente@aelium.test',
    password: 'Cliente2026!',
    passwordEnv: 'SEED_CLIENT_PASSWORD',
    role: RoleSlug.client,
    first_name: 'Carla',
    last_name: 'Cliente Demo',
    status: UserStatus.active,
    isDemo: true,
  },
  {
    email: 'partner@aelium.test',
    password: 'Partner2026!',
    passwordEnv: 'SEED_PARTNER_PASSWORD',
    role: RoleSlug.partner,
    first_name: 'Pablo',
    last_name: 'Partner Demo',
    status: UserStatus.active,
    isDemo: true,
  },
  {
    email: 'partner.pending@aelium.test',
    password: 'Partner2026!',
    passwordEnv: 'SEED_PARTNER_PENDING_PASSWORD',
    role: RoleSlug.partner_pending,
    first_name: 'Patricia',
    last_name: 'Partner Pendiente',
    // partner_pending es una cuenta registrada pero esperando
    // aprobación — sigue 'active' a nivel de auth, lo que la difiere
    // es su rol (no permisos para operar como partner real hasta
    // que el admin la apruebe).
    status: UserStatus.active,
    isDemo: true,
  },
];

async function upsertAccount(
  prisma: PrismaClient,
  account: TestAccount,
): Promise<{ email: string; created: boolean }> {
  const role = await prisma.role.findUnique({ where: { slug: account.role } });
  if (!role) {
    throw new Error(`Rol ${account.role} no existe — ejecuta seedRoles primero`);
  }

  const password = account.passwordEnv
    ? process.env[account.passwordEnv] || account.password
    : account.password;
  const hash = await bcrypt.hash(password, 12);

  const existing = await prisma.user.findUnique({ where: { email: account.email } });
  const created = !existing;

  await prisma.user.upsert({
    where: { email: account.email },
    update: {
      password_hash: hash,
      // No tocamos status/role/metadata si la cuenta ya existe —
      // el dev puede haberlos modificado vía UI para tests específicos.
    },
    create: {
      email: account.email,
      password_hash: hash,
      first_name: account.first_name,
      last_name: account.last_name,
      status: account.status,
      email_verified_at: new Date(),
      role_id: role.id,
    },
  });

  return { email: account.email, created };
}

export async function seedTestAccounts(prisma: PrismaClient): Promise<void> {
  // Salvaguarda 1 (ADR-067 §Auditoría): nunca sembrar cuentas demo en
  // producción. Superadmin sí se siembra en prod (boot inicial).
  const isProduction = process.env.NODE_ENV === 'production';

  // Salvaguarda CRÍTICA (audit 2026-06-25 GL-4): en producción, NUNCA crear
  // el superadmin con la contraseña por defecto pública ('AeliumDev2026!').
  // Si SUPERADMIN_PASSWORD no está definida, abortamos ANTES de tocar la BD
  // (fail-fast, R7) — mismo patrón que SecretVaultService al boot con
  // ENCRYPTION_KEY. Sin esto, `pnpm seed` contra prod crearía un superadmin
  // activo con credencial conocida (toma de control trivial).
  if (isProduction && !process.env.SUPERADMIN_PASSWORD) {
    throw new Error(
      'SEED ABORTADO: NODE_ENV=production sin SUPERADMIN_PASSWORD definida. ' +
        'Define SUPERADMIN_PASSWORD (y opcionalmente SUPERADMIN_EMAIL) antes ' +
        'de sembrar en producción para no crear un superadmin con la ' +
        'contraseña por defecto pública.',
    );
  }

  // Superadmin SIEMPRE.
  const superadminResult = await upsertAccount(prisma, SUPERADMIN);
  console.log(
    `  ✓ Superadmin ${superadminResult.created ? 'creado' : 'actualizado'}: ${superadminResult.email}`,
  );

  if (isProduction) {
    console.log('  ⚠ NODE_ENV=production — saltando cuentas demo *.test');
    return;
  }

  for (const account of DEMO_ACCOUNTS) {
    const result = await upsertAccount(prisma, account);
    console.log(
      `  ✓ ${account.role.padEnd(15)} ${result.created ? 'creada    ' : 'actualizada'}: ${result.email}`,
    );
  }
  console.log(
    `  ✓ ${DEMO_ACCOUNTS.length} cuentas demo upserted (1 por cada rol no-superadmin)`,
  );
}
