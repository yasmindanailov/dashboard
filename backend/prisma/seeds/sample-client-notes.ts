import { PrismaClient } from '@prisma/client';

/**
 * sample-client-notes — Sprint 16 Fase 16.B (ADR-079).
 *
 * Genera 2 notas demo para Carla (cliente principal) que aparecerán en el
 * ClientNotesTab al hacer smoke testing:
 *   - Nota excepcional (`source_system='exceptional'`) — caso libre.
 *   - Nota desde ticket cerrado (`source_system='ticket'` con `source_id`
 *     apuntando al primer ticket existente del cliente, si lo hay).
 *
 * Idempotente: si ya existen 2 notas para Carla, no añade más. Skip si
 * `NODE_ENV=production` (datos demo, no operativos).
 */
export async function seedSampleClientNotes(
  prisma: PrismaClient,
): Promise<void> {
  if (process.env.NODE_ENV === 'production') return;

  const carla = await prisma.user.findUnique({
    where: { email: 'cliente@aelium.test' },
    select: { id: true },
  });
  if (!carla) {
    console.log('  · sample-client-notes: cliente Carla no existe, skip');
    return;
  }

  const superadmin = await prisma.user.findUnique({
    where: { email: 'admin@aelium.net' },
    select: { id: true },
  });
  if (!superadmin) return;

  const existing = await prisma.clientNote.count({
    where: { user_id: carla.id },
  });
  if (existing >= 2) {
    console.log(
      `  · sample-client-notes: Carla ya tiene ${existing} notas, skip`,
    );
    return;
  }

  // Nota excepcional (libre).
  await prisma.clientNote.create({
    data: {
      user_id: carla.id,
      author_id: superadmin.id,
      category: 'exceptional',
      source_system: 'exceptional',
      source_id: null,
      triggered_by_action: 'manual_entry',
      body:
        'Cliente con proyecto e-commerce ambicioso. Le interesa hablar de Cloudflare cuando el tráfico crezca.',
      is_pinned: true,
    },
  });

  // Nota de ticket si Carla tiene algún ticket seedeado.
  const ticket = await prisma.conversation.findFirst({
    where: { user_id: carla.id, type: 'ticket' },
    select: { id: true },
  });
  if (ticket) {
    await prisma.clientNote.create({
      data: {
        user_id: carla.id,
        author_id: superadmin.id,
        category: 'support',
        source_system: 'ticket',
        source_id: ticket.id,
        triggered_by_action: 'ticket.resolved',
        body:
          'Resolución del ticket: revisé el panel del cliente y configuré el redirect 301. Funciona correctamente.',
        is_pinned: false,
      },
    });
  }

  console.log('  · sample-client-notes: 2 notas demo creadas para Carla');
}
