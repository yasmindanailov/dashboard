import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as nodemailer from 'nodemailer';

import { NotificationTemplateService } from '../src/modules/notifications/notification-template.service';
import type { PrismaService } from '../src/core/database/prisma.service';
import { SettingsService } from '../src/core/settings/settings.service';
import { seedNotificationTemplates } from '../prisma/seeds/notification-templates';

/**
 * Dev-only — smoke del layout maestro de correos (F4·W3).
 *
 * Renderiza la plantilla PILOTO `invoice.paid` (email) por el pipeline REAL
 * (`NotificationTemplateService.preview` → `compileAndWrap` → `buildEmailLayout`)
 * y la envía a MailPit (SMTP dev) para verificar 1:1 con
 * `mockup-uiux/Correo Ejemplo Pago.dc.html`.
 *
 * El seed es create-only (`upsert` con `update:{}`): si la fila invoice.paid/email
 * es pre-piloto (semantic=NULL), este script la recrea (borra + re-seed, solo esa
 * fila) para garantizar que probamos el layout maestro y no el HTML legacy.
 *
 *   pnpm --dir backend ts-node --transpile-only scripts/send-pilot-email.ts
 *   (opcional) SMOKE_EMAIL_TO=tu@correo.test  → destinatario del correo
 */
const EVENT = 'invoice.paid';
const CHANNEL = 'email' as const;
const LOCALE = 'es';
// Dirección PLANA a propósito: MailPit auto-etiqueta por el plus-address
// (`foo+tag@…`), así que un `+algo` crearía un tag fantasma que no es del correo.
const TO = process.env.SMOKE_EMAIL_TO ?? 'cliente@aelium.test';

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  // 1. Fuerza que la fila piloto refleje SIEMPRE el seed actual. El seed es
  //    create-only (upsert `update:{}`) → sin recrearla no veríamos los cambios
  //    de diseño al iterar. Borramos + re-seedeamos solo esa fila (idempotente).
  const existing = await prisma.notificationTemplate.findFirst({
    where: { event_type: EVENT, channel: CHANNEL, locale: LOCALE },
    select: { id: true },
  });
  if (existing) {
    await prisma.notificationTemplate.delete({ where: { id: existing.id } });
  }
  await seedNotificationTemplates(prisma);
  const tpl = await prisma.notificationTemplate.findFirst({
    where: { event_type: EVENT, channel: CHANNEL, locale: LOCALE },
    select: { id: true, semantic: true },
  });
  if (!tpl) {
    throw new Error('No existe la plantilla invoice.paid/email/es tras el seed.');
  }
  console.log(`· plantilla piloto (refrescada): id=${tpl.id} · semantic=${tpl.semantic}`);

  // 2. Render por el pipeline REAL (idéntico a "Previsualizar" del admin):
  //    compileAndWrap envuelve el fragmento en buildEmailLayout e inyecta
  //    {{email.*}} (tono success) + {{app_url}}. Datos 1:1 con el mockup.
  const settings = new SettingsService(prisma as unknown as PrismaService);
  const svc = new NotificationTemplateService(
    prisma as unknown as PrismaService,
    settings,
  );
  const rendered = await svc.preview(tpl.id, {
    payload: {
      invoice_number: 'AEL-2026-0042',
      total: 119.88,
      currency: 'EUR',
      payment_provider: 'Tarjeta ···· 4242',
    },
  });

  // 3. Envío real a MailPit (mismo transporte SMTP que EmailService en dev).
  const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST ?? '127.0.0.1',
    port: Number(process.env.MAIL_PORT ?? 1025),
    secure: false,
  });
  const info = (await transporter.sendMail({
    from: process.env.MAIL_FROM ?? 'Aelium <noreply@aelium.net>',
    to: TO,
    subject: rendered.subject,
    html: rendered.body,
  })) as { messageId: string };

  console.log('');
  console.log('✓ Correo piloto enviado a MailPit');
  console.log(`  to:       ${TO}`);
  console.log(`  subject:  ${rendered.subject}`);
  console.log(`  msgId:    ${info.messageId}`);
  console.log('  Ábrelo en la bandeja MailPit → http://localhost:8025');

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
