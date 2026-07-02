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
 * Dev-only — herramienta de revisión del sweep del layout de correos (F4·W3).
 *
 * Renderiza por el pipeline REAL (compileAndWrap → buildEmailLayout) y envía a
 * MailPit las plantillas email indicadas, para revisarlas 1:1 en la bandeja.
 * Refresca las filas objetivo desde el seed (create-only → borrar + reseed) para
 * que reflejen SIEMPRE el diseño actual.
 *
 *   pnpm --dir backend exec ts-node --transpile-only scripts/send-email-preview.ts invoice.created invoice.failed
 *   pnpm --dir backend exec ts-node --transpile-only scripts/send-email-preview.ts all   (todas las migradas)
 */
const TO = process.env.SMOKE_EMAIL_TO ?? 'cliente@aelium.test';

// Muestras ricas por evento (se combinan sobre DEFAULT_PREVIEW_SAMPLES del
// service + recipient ficticio). Se amplían tanda a tanda.
const SAMPLES: Record<string, Record<string, unknown>> = {
  'invoice.created': { invoice_number: 'AEL-2026-0043', total: 49, currency: 'EUR' },
  'invoice.failed': { invoice_number: 'AEL-2026-0044', retry_count: 2, max_retries: 5 },
  'invoice.overdue': { invoice_number: 'AEL-2026-0045', total: 49 },
  // ── Support ──
  'conversation.created': {
    subject: 'No me llega el correo de verificación',
    channel: 'chat',
    support_url: 'http://localhost:3002/dashboard/support',
  },
  'message.created': {
    subject: 'Problema con mi dominio',
    preview:
      'Hola, ya lo he revisado por mi parte.\nEl DNS ya está propagado — pruébalo de nuevo en una hora y me dices. Cualquier cosa, aquí estoy.',
    support_url: 'http://localhost:3002/dashboard/support',
  },
  'conversation.assigned': {
    subject: 'Solicitud de cambio de plan',
    support_url: 'http://localhost:3002/admin/support',
  },
  'conversation.resolved': {
    ticket_sequence: '1042',
    ticket_url: 'http://localhost:3002/dashboard/support/1042',
    auto_close_days: 7,
  },
  'conversation.auto_closed': {
    ticket_sequence: '1042',
    ticket_url: 'http://localhost:3002/admin/support/1042',
    auto_close_days: 7,
    resolved_at_label: '25 jun 2026',
  },
  // ── Tasks / Mantenimiento ──
  'task.assigned': {
    task_source_system_label: 'Soporte',
    task_priority_label: 'Alta',
    task_url: 'http://localhost:3002/admin/tasks',
    due_label: '15 jul 2026',
  },
  'maintenance.completed': {
    month_label: 'julio 2026',
    notes: 'Actualizamos WordPress y sus plugins a la última versión.\nRevisamos copias de seguridad y el certificado SSL.\nTodo funcionando correctamente.',
    service_url: 'http://localhost:3002/dashboard/services/123',
  },
  'task.completed': {
    task_source_system_label: 'Soporte',
    task_reason: 'Cambio de plan',
    client_notes: 'Hemos aplicado el cambio de plan que pediste.\nYa está activo en tu cuenta — no tienes que hacer nada más.',
    service_url: 'http://localhost:3002/dashboard',
  },
  'task.overdue': {
    task_source_system_label: 'Mantenimiento',
    task_priority_label: 'Alta',
    task_url: 'http://localhost:3002/admin/tasks',
    due_date_label: '1 jul 2026',
    days_overdue: 5,
  },
  'task.unassigned_overdue': {
    total: 3,
    oldest_age_hours: 26,
    summary:
      '· Instalar SSL — en cola hace 26 h\n· Migrar correo — en cola hace 20 h\n· Revisar DNS — en cola hace 14 h',
  },
  'maintenance.critical': {
    total: 2,
    threshold_days: 30,
    summary: '· web.cliente-uno.com — 41 días sin mantenimiento\n· tienda.cliente-dos.com — 35 días sin mantenimiento',
  },
  // ── Service ──
  'service.password_reset': {
    domain: 'micuenta.aelium.net',
    new_password: 'A7f2-9Kx3-Qm5p-Lz8w',
    panel_url: 'http://localhost:3002/dashboard/services/1',
    provisioner_slug: 'enhance_cp',
  },
  'service.cancelled': {
    domain: 'tienda-antigua.com',
    support_url: 'http://localhost:3002/dashboard/support',
  },
  'service.cancellation_scheduled': {
    domain: 'miweb.com',
    cancellation_date: '18 de julio de 2026',
    billing_url: 'http://localhost:3002/dashboard/billing',
    support_url: 'http://localhost:3002/dashboard/support',
  },
  'service.suspended': {
    domain: 'miweb.com',
    reason_label: 'Pago pendiente',
    is_overdue_payment: true,
    billing_url: 'http://localhost:3002/dashboard/billing',
    support_url: 'http://localhost:3002/dashboard/support',
  },
  'service.unsuspended': {
    domain: 'miweb.com',
    panel_url: 'http://localhost:3002/dashboard/services/1',
  },
  'service.quota_threshold_crossed': {
    domain: 'miweb.com',
    used_pct: '92',
    used_mb_label: '9,2 GB',
    total_mb_label: '10 GB',
    service_url: 'http://localhost:3002/dashboard/services/1',
    support_url: 'http://localhost:3002/dashboard/support',
  },
  // ── Domain ──
  'domain.renewed': { fqdn: 'micliente.com', panel_url: 'http://localhost:3002/dashboard/domains/1', new_expires_at: '15 jul 2027' },
  'domain.expiring_soon': { fqdn: 'micliente.com', panel_url: 'http://localhost:3002/dashboard/domains/1', days_left: 14 },
  'domain.expired': { fqdn: 'micliente.com', panel_url: 'http://localhost:3002/dashboard/domains/1' },
  'domain.entered_redemption': { fqdn: 'micliente.com', panel_url: 'http://localhost:3002/dashboard/domains/1' },
  'domain.restored': { fqdn: 'micliente.com', panel_url: 'http://localhost:3002/dashboard/domains/1' },
  'domain.transfer_initiated': { fqdn: 'micliente.com', panel_url: 'http://localhost:3002/dashboard/domains/1' },
  'domain.transfer_completed': { fqdn: 'micliente.com', panel_url: 'http://localhost:3002/dashboard/domains/1' },
  'domain.transfer_failed': { fqdn: 'micliente.com', panel_url: 'http://localhost:3002/dashboard/domains/1', reason: 'AUTH_CODE_INVALID' },
  'domain.nameservers_changed': { fqdn: 'micliente.com', panel_url: 'http://localhost:3002/dashboard/domains/1' },
  'domain.lock_changed': { fqdn: 'micliente.com', panel_url: 'http://localhost:3002/dashboard/domains/1' },
  // ── Ops superadmin ──
  'outbox.event_failed': {
    event_type: 'invoice.created',
    event_outbox_id: 'a1b2c3d4-0000-0000-0000-000000000000',
    retry_count: 5,
    last_error: 'Connection refused: ECONNREFUSED 127.0.0.1:6379',
  },
  'dlq.job_failed': {
    failed_job_id: 'job-8842',
    queue: 'pdf-generation',
    name: 'invoice-pdf',
    attempts_made: 5,
    last_error: 'MinIO endpoint unreachable (timeout tras 30s)',
  },
  'system.error': {
    error_log_id: 'err-00291',
    level: 'error',
    module: 'BillingService',
    message: 'Excepción no controlada al generar la factura mensual.',
    correlation_id: 'corr-7f3a91',
  },
  'auth.refresh_replay_detected': {
    attacked_user_email: 'cliente@ejemplo.com',
    user_id: 'u-1042',
    session_id: 's-5521',
    ip: '203.0.113.7',
    attempted_at: '2026-07-02 07:14 UTC',
    original_used_at: '2026-07-01 22:03 UTC',
    revoked_sessions_count: 3,
  },
  'plugin.circuit_opened': {
    plugin_slug: 'enhance_cp',
    operation: 'getServiceInfo',
    breaker_name: 'enhance_cp:getServiceInfo',
    opened_at: '2026-07-02 07:10 UTC',
    failure_count: 5,
    last_error_code: 'PROVIDER_TIMEOUT',
    reset_timeout_ms: 30000,
  },
};

async function main(): Promise<void> {
  const args = process.argv
    .slice(2)
    .flatMap((a) => a.split(','))
    .map((s) => s.trim())
    .filter(Boolean);
  if (args.length === 0) {
    throw new Error(
      'Uso: send-email-preview.ts <event.type> [event.type...] | all',
    );
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  let events = args;
  if (args.length === 1 && args[0] === 'all') {
    const migrated = await prisma.notificationTemplate.findMany({
      where: { channel: 'email', semantic: { not: null } },
      select: { event_type: true },
      distinct: ['event_type'],
    });
    events = migrated.map((m) => m.event_type);
  }

  // Refresca las filas objetivo desde el seed (create-only → borrar + reseed).
  await prisma.notificationTemplate.deleteMany({
    where: { event_type: { in: events }, channel: 'email' },
  });
  await seedNotificationTemplates(prisma);

  const settings = new SettingsService(prisma as unknown as PrismaService);
  const svc = new NotificationTemplateService(
    prisma as unknown as PrismaService,
    settings,
  );
  const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST ?? '127.0.0.1',
    port: Number(process.env.MAIL_PORT ?? 1025),
    secure: false,
  });

  const replyTo = await settings.get(
    'branding',
    'company_email',
    'hola@aelium.net',
  );

  console.log(`Enviando ${events.length} correo(s) a MailPit (${TO})…`);
  for (const event of events) {
    const tpl = await prisma.notificationTemplate.findFirst({
      where: { event_type: event, channel: 'email', locale: 'es' },
      select: { id: true, semantic: true },
    });
    if (!tpl) {
      console.log(`  ⚠ ${event}: sin plantilla email`);
      continue;
    }
    const rendered = await svc.preview(tpl.id, { payload: SAMPLES[event] ?? {} });
    await transporter.sendMail({
      from: process.env.MAIL_FROM ?? 'Aelium <noreply@aelium.net>',
      replyTo,
      to: TO,
      subject: rendered.subject,
      html: rendered.body,
      headers: {
        'Auto-Submitted': 'auto-generated',
        'X-Auto-Response-Suppress': 'OOF, AutoReply',
        'X-Aelium-Event': event,
      },
    });
    console.log(
      `  ✓ ${event}  [${tpl.semantic ?? 'legacy'}]  "${rendered.subject}"`,
    );
  }
  console.log('Revísalos en MailPit → http://localhost:8025');

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
