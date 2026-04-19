/**
 * EC-4.8 Fix: Backfill ClientProfile for existing users that don't have one.
 * 
 * Run with: npx ts-node scripts/backfill-client-profiles.ts
 * Or via: npx prisma db execute --file scripts/backfill-client-profiles.sql
 */

import { PrismaClient, RoleSlug } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();

  try {
    // Find all client users without a profile
    const clientRole = await prisma.role.findUnique({
      where: { slug: RoleSlug.client },
    });

    if (!clientRole) {
      console.log('Client role not found. Nothing to do.');
      return;
    }

    const usersWithoutProfile = await prisma.user.findMany({
      where: {
        role_id: clientRole.id,
        client_profile: null,
      },
      select: { id: true, email: true },
    });

    if (usersWithoutProfile.length === 0) {
      console.log('All client users already have a ClientProfile. Nothing to do.');
      return;
    }

    console.log(`Found ${usersWithoutProfile.length} client(s) without ClientProfile:`);

    for (const user of usersWithoutProfile) {
      await prisma.clientProfile.create({
        data: { user_id: user.id },
      });
      console.log(`  ✅ Created ClientProfile for ${user.email} (${user.id})`);
    }

    console.log('Done.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
