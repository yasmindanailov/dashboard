import {
  PrismaClient,
  ConversationType,
  ConversationStatus,
  ConversationPriority,
  ConversationCategory,
  MessageSender,
} from '@prisma/client';

/**
 * Seed de soporte de muestra — Sprint 9.6 Fase F.0 (DC.7).
 *
 * Crea 1 ticket + 1 chat abiertos del cliente principal
 * (`cliente@aelium.test`), cada uno con un mensaje inicial. Sirve
 * para validar:
 *
 *  - `/admin/support` (list full workflow tabs incluyendo
 *    "Esperando agente").
 *  - `/admin/support/[id]` (detail full con sidebar contexto cliente).
 *  - `/admin/support/chats` (workspace WS — el chat aparece en lista).
 *  - `/dashboard/support` (list cliente con tabs reducidas).
 *  - `/dashboard/support/[id]` (detail cliente sin sidebar contexto).
 *
 * Salvaguardas:
 *  - Skip si NODE_ENV === 'production'.
 *  - Idempotencia vía marker `metadata.seeded = true` + `subject`
 *    prefijado con `[SEED]` (Conversation no tiene unique natural útil).
 *  - Re-run busca por marker; si existe, no recrea.
 */

interface SampleConversation {
  type: ConversationType;
  subject: string;
  category: ConversationCategory;
  status: ConversationStatus;
  priority: ConversationPriority;
  initial_message: string;
}

const CONVERSATIONS: ReadonlyArray<SampleConversation> = [
  {
    type: ConversationType.ticket,
    subject: '[SEED] No me llega la factura mensual por email',
    category: ConversationCategory.support_billing,
    status: ConversationStatus.waiting_agent,
    priority: ConversationPriority.normal,
    initial_message:
      'Hola equipo, llevo dos meses sin recibir la factura por email aunque sí la veo en mi dashboard. ¿Podéis revisar la configuración? Gracias.',
  },
  {
    type: ConversationType.chat,
    subject: '[SEED] Consulta sobre cambio de plan',
    category: ConversationCategory.support_general,
    status: ConversationStatus.open,
    priority: ConversationPriority.normal,
    initial_message:
      'Hola, ¿podéis explicarme la diferencia entre Hosting Pro mensual y anual? Quiero saber si me compensa cambiar.',
  },
];

export async function seedSampleSupport(prisma: PrismaClient): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.log('  ⚠ NODE_ENV=production — saltando sample-support');
    return;
  }

  const client = await prisma.user.findUnique({
    where: { email: 'cliente@aelium.test' },
  });
  if (!client) {
    console.log('  ⚠ cliente@aelium.test no existe — saltando sample-support');
    return;
  }

  let created = 0;

  for (const conv of CONVERSATIONS) {
    // Idempotencia por subject único de seed (incluye marker `[SEED]`).
    const existing = await prisma.conversation.findFirst({
      where: { user_id: client.id, subject: conv.subject },
    });
    if (existing) continue;

    await prisma.conversation.create({
      data: {
        type: conv.type,
        user_id: client.id,
        subject: conv.subject,
        status: conv.status,
        priority: conv.priority,
        category: conv.category,
        channel: 'web',
        metadata: { seeded: true } as object,
        messages: {
          create: [
            {
              sender_type: MessageSender.client,
              sender_id: client.id,
              body: conv.initial_message,
              is_internal: false,
            },
          ],
        },
      },
    });

    created++;
  }

  console.log(
    `  ✓ ${created} conversaciones demo creadas (${CONVERSATIONS.length - created} ya existían)`,
  );
}
