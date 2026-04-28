import { PrismaClient, RoleSlug } from '@prisma/client';

/**
 * Seed canónico de roles del sistema (Sprint 9.6 Fase F.0).
 *
 * Los 7 roles son `is_system: true` — no se pueden borrar desde la UI
 * (incluso por superadmin). Cualquier nuevo rol que aparezca en
 * `RoleSlug` enum debe declararse aquí para que el seed lo cree.
 *
 * Idempotente: `upsert` por slug. Reseed no rompe ni duplica.
 */
const ROLES: ReadonlyArray<{
  slug: RoleSlug;
  name: string;
  description: string;
}> = [
  {
    slug: RoleSlug.superadmin,
    name: 'Superadmin',
    description: 'Acceso total al sistema',
  },
  {
    slug: RoleSlug.agent_full,
    name: 'Agente completo',
    description: 'Acceso a todos los módulos operativos',
  },
  {
    slug: RoleSlug.agent_billing,
    name: 'Agente facturación',
    description: 'Acceso solo a billing y clientes',
  },
  {
    slug: RoleSlug.agent_support,
    name: 'Agente soporte',
    description: 'Acceso solo a soporte y tareas',
  },
  {
    slug: RoleSlug.client,
    name: 'Cliente',
    description: 'Acceso al portal de cliente',
  },
  {
    slug: RoleSlug.partner_pending,
    name: 'Partner pendiente',
    description: 'Registrado, pendiente de aprobación',
  },
  {
    slug: RoleSlug.partner,
    name: 'Partner',
    description: 'Agencia partner aprobada',
  },
];

export async function seedRoles(prisma: PrismaClient): Promise<void> {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { slug: role.slug },
      update: {},
      create: { ...role, is_system: true },
    });
  }
  console.log(`  ✓ ${ROLES.length} roles upserted`);
}
