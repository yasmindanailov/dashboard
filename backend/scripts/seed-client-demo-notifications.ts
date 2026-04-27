/**
 * Inserta datos demo en la cuenta `test-cliente@aelium.test` para que un
 * smoke manual de Sprint 9.5 (NotificationBell + chat + ticket) tenga
 * material real al primer login.
 *
 * Requisitos previos:
 *   pnpm --dir backend tsx scripts/seed-test-account.ts  (cliente + factura)
 *
 * Idempotente: si ya hay notificaciones / conversaciones con la marca
 * `[demo-9.5]` en metadata o body, no las duplica.
 *
 * Genera:
 *  - 5 notificaciones internal en la campana del cliente:
 *      · invoice.paid (con action_url a la factura)
 *      · invoice.created
 *      · system.error (sin action_url, ejemplo de aviso operativo)
 *      · task.assigned (cliente recibe info de tarea propia)
 *      · invoice.overdue
 *  - 1 conversación tipo `chat` activa con 2 mensajes (cliente + agente).
 *  - 1 conversación tipo `ticket` resuelta con 3 mensajes.
 *
 * Uso:  pnpm --dir backend tsx scripts/seed-client-demo-notifications.ts
 */

import 'dotenv/config';
import { PrismaClient, RoleSlug } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const CLIENT_EMAIL = 'test-cliente@aelium.test';
const DEMO_TAG = '[demo-9.5]';

async function main() {
  console.log('🌱 Inyectando datos demo Sprint 9.5...');

  const client = await prisma.user.findUnique({
    where: { email: CLIENT_EMAIL },
    select: { id: true },
  });
  if (!client) {
    throw new Error(
      `Cliente ${CLIENT_EMAIL} no existe. Ejecuta primero seed-test-account.ts.`,
    );
  }

  const superadmin = await prisma.user.findFirst({
    where: { role: { slug: RoleSlug.superadmin } },
    select: { id: true, first_name: true, last_name: true },
  });
  if (!superadmin) {
    throw new Error('No hay superadmin en DB.');
  }

  const invoice = await prisma.invoice.findFirst({
    where: { user_id: client.id },
    orderBy: { created_at: 'desc' },
    select: { id: true, invoice_number: true, total: true, currency: true },
  });

  // ── Notificaciones internas ────────────────────────────────────

  const existingDemoNotifs = await prisma.notification.count({
    where: { user_id: client.id, body: { contains: DEMO_TAG } },
  });

  if (existingDemoNotifs > 0) {
    console.log(
      `  · ${existingDemoNotifs} notificaciones demo ya existen — no duplico`,
    );
  } else {
    const baseTime = Date.now();
    const fiveAgoMin = (mins: number) => new Date(baseTime - mins * 60_000);

    const notifs = [
      {
        title: 'Pago confirmado',
        body: `${DEMO_TAG} Tu factura ${invoice?.invoice_number ?? 'AELIUM-TEST'} de ${invoice?.total ?? 121} ${invoice?.currency ?? 'EUR'} se ha pagado correctamente.`,
        action_url: invoice ? `/dashboard/billing/${invoice.id}` : null,
        metadata: { event: 'invoice.paid', demo: true },
        created_at: fiveAgoMin(2),
        sent_at: fiveAgoMin(2),
      },
      {
        title: `Nueva factura ${invoice?.invoice_number ?? 'AELIUM-TEST'}`,
        body: `${DEMO_TAG} Se ha generado una nueva factura por ${invoice?.total ?? 121} ${invoice?.currency ?? 'EUR'}.`,
        action_url: invoice ? `/dashboard/billing/${invoice.id}` : null,
        metadata: { event: 'invoice.created', demo: true },
        created_at: fiveAgoMin(20),
        sent_at: fiveAgoMin(20),
      },
      {
        title: '⚠ Aviso operativo',
        body: `${DEMO_TAG} Hubo un retraso temporal procesando tu solicitud, pero ya está resuelto. No requiere acción por tu parte.`,
        action_url: null,
        metadata: { event: 'system.error', demo: true },
        created_at: fiveAgoMin(120),
        sent_at: fiveAgoMin(120),
      },
      {
        title: 'Tarea de mantenimiento programada',
        body: `${DEMO_TAG} Se ha programado una tarea de mantenimiento sobre tu servicio para mañana a las 03:00 UTC.`,
        action_url: null,
        metadata: { event: 'task.assigned', demo: true },
        // Esta queda LEÍDA para mostrar también el estilo "ya leído".
        read_at: fiveAgoMin(60),
        created_at: fiveAgoMin(180),
        sent_at: fiveAgoMin(180),
      },
      {
        title: '🔴 Factura vencida',
        body: `${DEMO_TAG} La factura ${invoice?.invoice_number ?? 'AELIUM-TEST'} está vencida. Si no se regulariza, el servicio será suspendido.`,
        action_url: invoice ? `/dashboard/billing/${invoice.id}` : null,
        metadata: { event: 'invoice.overdue', demo: true },
        created_at: fiveAgoMin(720),
        sent_at: fiveAgoMin(720),
      },
    ];

    for (const n of notifs) {
      await prisma.notification.create({
        data: {
          user_id: client.id,
          channel: 'internal',
          title: n.title,
          body: n.body,
          action_url: n.action_url,
          read_at: 'read_at' in n ? n.read_at : null,
          sent_at: n.sent_at,
          metadata: n.metadata,
          created_at: n.created_at,
        },
      });
    }
    console.log(`  ✓ ${notifs.length} notificaciones internas inyectadas`);
  }

  // ── Conversaciones (chat + ticket) ─────────────────────────────

  const existingDemoConvs = await prisma.conversation.count({
    where: {
      user_id: client.id,
      tags: { array_contains: ['demo-9.5'] },
    },
  });

  if (existingDemoConvs > 0) {
    console.log(
      `  · ${existingDemoConvs} conversaciones demo ya existen — no duplico`,
    );
  } else {
    // Chat abierto (type=chat, status=waiting_client tras la respuesta del agente)
    const chat = await prisma.conversation.create({
      data: {
        user_id: client.id,
        type: 'chat',
        status: 'waiting_client',
        priority: 'normal',
        subject: 'Consulta sobre mi servicio',
        tags: ['demo-9.5'],
        first_response_at: new Date(Date.now() - 25 * 60_000),
        messages: {
          create: [
            {
              sender_type: 'client',
              sender_id: client.id,
              body: '¡Hola! Me gustaría saber si puedo cambiar el plan de mi servicio actual.',
              created_at: new Date(Date.now() - 30 * 60_000),
            },
            {
              sender_type: 'agent',
              sender_id: superadmin.id,
              body: 'Hola! Por supuesto, te explico las opciones disponibles. ¿Tienes preferencia por un plan mensual o anual?',
              created_at: new Date(Date.now() - 25 * 60_000),
            },
          ],
        },
      },
      select: { id: true },
    });
    console.log(`  ✓ Chat creado (status=waiting_client): ${chat.id}`);

    // Ticket resuelto (type=ticket, status=resolved, category=support_billing)
    const ticket = await prisma.conversation.create({
      data: {
        user_id: client.id,
        type: 'ticket',
        status: 'resolved',
        priority: 'high',
        subject: 'Problema con la facturación',
        category: 'support_billing',
        tags: ['demo-9.5'],
        resolution_note: 'Resuelto: factura corregida y reenviada al cliente.',
        resolved_at: new Date(Date.now() - 60 * 60_000),
        resolved_by_id: superadmin.id,
        first_response_at: new Date(Date.now() - 3 * 60 * 60_000),
        messages: {
          create: [
            {
              sender_type: 'client',
              sender_id: client.id,
              body: 'Vi un cargo duplicado en mi factura del mes pasado, ¿podéis revisarlo?',
              created_at: new Date(Date.now() - 4 * 60 * 60_000),
            },
            {
              sender_type: 'agent',
              sender_id: superadmin.id,
              body: 'Hola, gracias por avisar. Ya estoy revisando el caso, te confirmo en breve.',
              created_at: new Date(Date.now() - 3 * 60 * 60_000),
            },
            {
              sender_type: 'agent',
              sender_id: superadmin.id,
              body: 'Confirmado: era un error nuestro al renovar. Ya lo hemos corregido y la factura nueva está en tu panel. Disculpa las molestias.',
              created_at: new Date(Date.now() - 60 * 60_000),
            },
          ],
        },
      },
      select: { id: true },
    });
    console.log(`  ✓ Ticket resuelto creado: ${ticket.id}`);
  }

  // ── Resumen ────────────────────────────────────────────────────

  const summary = await prisma.notification.count({
    where: { user_id: client.id, channel: 'internal', read_at: null },
  });

  console.log('');
  console.log('✅ Datos demo listos');
  console.log('');
  console.log(`Cliente: ${CLIENT_EMAIL}  /  TestCliente2026!`);
  console.log(`  · Notificaciones unread: ${summary}`);
  console.log('  · Login en: http://localhost:3002');
  console.log('');
  console.log('Smoke checklist:');
  console.log('  1. Login → ver badge en campana del Topbar.');
  console.log('  2. Click campana → ver dropdown con 4 unread + 1 read.');
  console.log('  3. Click "Pago confirmado" → marca leída + navega a la factura.');
  console.log('  4. Click "Marcar todas" → contador a 0.');
  console.log('  5. Ir a /dashboard/support → ver chat activo + ticket resuelto.');
}

main()
  .catch((e) => {
    console.error('❌ Seed demo notifications falló:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
