import { PrismaClient } from '@prisma/client';

/**
 * Seed inicial de `notification_templates` (Sprint 9 Fase D + ADR-065).
 *
 * Cada plantilla preserva BYTE-IDÉNTICAMENTE el HTML inline anterior de
 * `BillingEmailListener` y `TasksEmailListener` para que los tests E2E
 * y la UX del cliente no detecten cambios en el copy.
 *
 * 🔒 EC-T8-17 (Sprint 8 Fase B 2026-04-29) — REGLA CANÓNICA DE PLANTILLAS:
 *
 * SIEMPRE usar `{{var}}` (escape automático Handlebars). NUNCA usar
 * `{{{var}}}` ni `{{& var}}` — ambos rinden el contenido sin escapar y
 * abren XSS si el payload incluye texto controlado por usuario (ej.
 * `task_url`, `assigned_by`, `task_title`, `description` cliente-side).
 * El test guard `notification-templates.security.spec.ts` falla el build
 * si alguna plantilla seedeada introduce un triple-stash.
 *
 * Variables disponibles por evento:
 *  - `invoice.*`: invoice_id, invoice_number, user_id, total, currency,
 *    payment_provider (paid), retry_count + max_retries (failed/overdue),
 *    recipient.{first_name, last_name, email}
 *  - `task.assigned`: task_id, task_title, task_type, task_priority,
 *    task_description, task_url, due_label, assigned_by, recipient.*
 *  - `outbox.event_failed`: event_outbox_id, event_type, last_error,
 *    retry_count, recipient.* (superadmin)
 *  - `dlq.job_failed`: failed_job_id, queue, name, last_error,
 *    attempts_made, recipient.* (superadmin)
 */
export async function seedNotificationTemplates(
  prisma: PrismaClient,
): Promise<void> {
  const templates = [
    // ───────────── invoice.created ─────────────
    {
      event_type: 'invoice.created',
      channel: 'email' as const,
      locale: 'es',
      subject: 'Nueva factura {{invoice_number}}',
      body: `
        <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #635BFF 0%, #8B5CF6 100%); padding: 32px; border-radius: 16px 16px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">Nueva factura</h1>
            <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 14px;">{{invoice_number}}</p>
          </div>
          <div style="background: #fff; padding: 32px; border: 1px solid #f0f0f0; border-top: none; border-radius: 0 0 16px 16px;">
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Hola{{#if recipient.first_name}} {{recipient.first_name}}{{/if}},
            </p>
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Se ha generado una nueva factura por <strong>{{total}} {{currency}}</strong>.
            </p>
            <div style="background: #f9fafb; border-radius: 12px; padding: 20px; margin: 20px 0;">
              <table style="width: 100%; font-size: 14px; color: #374151;">
                <tr><td style="padding: 4px 0; color: #9ca3af;">Factura:</td><td style="text-align: right; font-weight: 600;">{{invoice_number}}</td></tr>
                <tr><td style="padding: 4px 0; color: #9ca3af;">Importe:</td><td style="text-align: right; font-weight: 600;">{{total}} {{currency}}</td></tr>
              </table>
            </div>
            <p style="color: #6b7280; font-size: 13px;">
              Puedes consultar los detalles y descargar el PDF desde tu panel de cliente.
            </p>
          </div>
        </div>
      `.trim(),
      variables: {
        invoice_id: 'string',
        invoice_number: 'string',
        total: 'number',
        currency: 'string',
        'recipient.first_name': 'string?',
      },
    },

    // ───────────── invoice.paid ─────────────
    {
      event_type: 'invoice.paid',
      channel: 'email' as const,
      locale: 'es',
      subject: '✓ Pago confirmado — {{invoice_number}}',
      body: `
        <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); padding: 32px; border-radius: 16px 16px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">✓ Pago confirmado</h1>
            <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 14px;">{{invoice_number}}</p>
          </div>
          <div style="background: #fff; padding: 32px; border: 1px solid #f0f0f0; border-top: none; border-radius: 0 0 16px 16px;">
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Hola{{#if recipient.first_name}} {{recipient.first_name}}{{/if}},
            </p>
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Hemos recibido tu pago de <strong>{{total}} {{currency}}</strong>. Tu servicio está activo.
            </p>
            <div style="background: #f0fdf4; border-radius: 12px; padding: 20px; margin: 20px 0; border: 1px solid #bbf7d0;">
              <table style="width: 100%; font-size: 14px; color: #374151;">
                <tr><td style="padding: 4px 0; color: #6b7280;">Factura:</td><td style="text-align: right; font-weight: 600;">{{invoice_number}}</td></tr>
                <tr><td style="padding: 4px 0; color: #6b7280;">Importe:</td><td style="text-align: right; font-weight: 600;">{{total}} {{currency}}</td></tr>
                <tr><td style="padding: 4px 0; color: #6b7280;">Vía:</td><td style="text-align: right;">{{payment_provider}}</td></tr>
              </table>
            </div>
            <p style="color: #6b7280; font-size: 13px;">
              Puedes descargar el PDF de tu factura desde tu panel de cliente.
            </p>
          </div>
        </div>
      `.trim(),
      variables: {
        invoice_id: 'string',
        invoice_number: 'string',
        total: 'number',
        currency: 'string',
        payment_provider: 'string',
        'recipient.first_name': 'string?',
      },
    },

    // ───────────── invoice.failed ─────────────
    {
      event_type: 'invoice.failed',
      channel: 'email' as const,
      locale: 'es',
      subject:
        '⚠ Cobro fallido — {{invoice_number}} (intento {{retry_count}}/{{max_retries}})',
      body: `
        <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); padding: 32px; border-radius: 16px 16px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">⚠ Cobro fallido</h1>
            <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 14px;">Intento {{retry_count}} de {{max_retries}}</p>
          </div>
          <div style="background: #fff; padding: 32px; border: 1px solid #f0f0f0; border-top: none; border-radius: 0 0 16px 16px;">
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Hola{{#if recipient.first_name}} {{recipient.first_name}}{{/if}},
            </p>
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              No hemos podido procesar el cobro de la factura <strong>{{invoice_number}}</strong>.
              {{#if (lt retry_count max_retries)}}Volveremos a intentarlo automáticamente.{{else}}Este ha sido el último intento. Tu servicio será suspendido si no regularizas el pago.{{/if}}
            </p>
            <p style="color: #6b7280; font-size: 13px;">
              Puedes actualizar tu método de pago desde tu panel de cliente.
            </p>
          </div>
        </div>
      `.trim(),
      variables: {
        invoice_id: 'string',
        invoice_number: 'string',
        retry_count: 'number',
        max_retries: 'number',
        'recipient.first_name': 'string?',
      },
    },

    // ───────────── invoice.overdue ─────────────
    {
      event_type: 'invoice.overdue',
      channel: 'email' as const,
      locale: 'es',
      subject: '🔴 Factura vencida — {{invoice_number}}',
      body: `
        <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%); padding: 32px; border-radius: 16px 16px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">🔴 Factura vencida</h1>
            <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 14px;">{{invoice_number}}</p>
          </div>
          <div style="background: #fff; padding: 32px; border: 1px solid #f0f0f0; border-top: none; border-radius: 0 0 16px 16px;">
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Hola{{#if recipient.first_name}} {{recipient.first_name}}{{/if}},
            </p>
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              La factura <strong>{{invoice_number}}</strong> por <strong>{{total}} EUR</strong> está vencida.
              Si no se regulariza el pago, tu servicio será suspendido automáticamente.
            </p>
            <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 12px; padding: 16px; margin: 20px 0;">
              <p style="color: #991B1B; font-size: 14px; margin: 0; font-weight: 500;">
                ⚠ Acción requerida: actualiza tu método de pago o contacta con soporte para resolver esta situación.
              </p>
            </div>
          </div>
        </div>
      `.trim(),
      variables: {
        invoice_id: 'string',
        invoice_number: 'string',
        total: 'number',
        retry_count: 'number',
        max_retries: 'number',
        'recipient.first_name': 'string?',
      },
    },

    // ───────────── invoice.paid (campana) ─────────────
    {
      event_type: 'invoice.paid',
      channel: 'internal' as const,
      locale: 'es',
      subject: 'Pago confirmado',
      body: 'Tu factura {{invoice_number}} de {{total}} {{currency}} se ha pagado correctamente.',
      variables: {
        invoice_number: 'string',
        total: 'number',
        currency: 'string',
      },
    },

    // ───────────── task.assigned (email) ─────────────
    // Sprint 8.B.1.bis: usa labels humanos `task_type_label` / `task_priority_label`
    // que el listener computa desde el enum (TASK_TYPE_LABELS_ES). No usar
    // el enum crudo `{{task_type}}` en el cuerpo — la plantilla es contenido
    // editable por admin (Sprint 9.5) y no debe conocer mapeos internos.
    {
      event_type: 'task.assigned',
      channel: 'email' as const,
      locale: 'es',
      subject: 'Nueva tarea asignada: Tarea {{task_source_system_label}}',
      body: `
        <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #635BFF 0%, #8B5CF6 100%); padding: 32px; border-radius: 16px 16px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">Tarea asignada</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">{{task_source_system_label}} · Prioridad {{task_priority_label}}</p>
          </div>
          <div style="background: #fff; padding: 32px; border: 1px solid #f0f0f0; border-top: none; border-radius: 0 0 16px 16px;">
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Hola {{#if recipient.first_name}}{{recipient.first_name}}{{else}}agente{{/if}},
            </p>
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Se te ha asignado una nueva tarea: <strong>Tarea {{task_source_system_label}}</strong>.
            </p>
            <div style="background: #f9fafb; border-radius: 12px; padding: 20px; margin: 20px 0;">
              <table style="width: 100%; font-size: 14px; color: #374151;">
                <tr><td style="padding: 4px 0; color: #9ca3af;">Tipo:</td><td style="text-align: right; font-weight: 600;">{{task_source_system_label}}</td></tr>
                <tr><td style="padding: 4px 0; color: #9ca3af;">Prioridad:</td><td style="text-align: right;">{{task_priority_label}}</td></tr>
                <tr><td style="padding: 4px 0; color: #9ca3af;">Vence:</td><td style="text-align: right;">{{due_label}}</td></tr>
              </table>
            </div>
            <p style="text-align: center; margin: 24px 0;">
              <a href="{{task_url}}" style="display: inline-block; background: #635BFF; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Ver tarea</a>
            </p>
          </div>
        </div>
      `.trim(),
      variables: {
        task_id: 'string',

        task_source_system_label: 'string',
        task_priority_label: 'string',
        task_url: 'string',
        due_label: 'string',
        'recipient.first_name': 'string?',
      },
    },

    // ───────────── task.assigned (campana) ─────────────
    {
      event_type: 'task.assigned',
      channel: 'internal' as const,
      locale: 'es',
      subject: 'Nueva tarea: Tarea {{task_source_system_label}}',
      body: 'Se te ha asignado una tarea de {{task_source_system_label}} con prioridad {{task_priority_label}}.',
      variables: {
        task_source_system_label: 'string',
        task_priority_label: 'string',
      },
    },

    // ───────────── maintenance.completed (email cliente) ─────────────
    // Sprint 8 Fase B.5 — UI_SPEC §5.16 flujo "Completar y notificar":
    // tras cerrar la task de mantenimiento se envía email al cliente
    // con resumen del trabajo. Variables computadas por el listener
    // (mes en es-ES, URL de servicio).
    {
      event_type: 'maintenance.completed',
      channel: 'email' as const,
      locale: 'es',
      subject: 'Mantenimiento completado · {{month_label}}',
      body: `
        <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #635BFF 0%, #8B5CF6 100%); padding: 32px; border-radius: 16px 16px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">Mantenimiento completado</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">{{month_label}}</p>
          </div>
          <div style="background: #fff; padding: 32px; border: 1px solid #f0f0f0; border-top: none; border-radius: 0 0 16px 16px;">
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Hola {{#if recipient.first_name}}{{recipient.first_name}}{{else}}cliente{{/if}},
            </p>
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Hemos completado el mantenimiento mensual de tu servicio.
              Aquí tienes el resumen del trabajo realizado:
            </p>
            <div style="background: #f9fafb; border-left: 4px solid #635BFF; border-radius: 8px; padding: 16px 20px; margin: 20px 0;">
              <p style="color: #374151; font-size: 14px; line-height: 1.6; white-space: pre-wrap; margin: 0;">{{notes}}</p>
            </div>
            <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
              Si tienes cualquier duda sobre este mantenimiento o detectas
              algo que revisar, contáctanos respondiendo a este correo o
              desde tu panel de cliente.
            </p>
            <p style="text-align: center; margin: 24px 0;">
              <a href="{{service_url}}" style="display: inline-block; background: #635BFF; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Ver mi servicio</a>
            </p>
          </div>
        </div>
      `.trim(),
      variables: {
        task_id: 'string',
        maintenance_log_id: 'string',
        service_id: 'string',
        month_year: 'string',
        month_label: 'string',
        notes: 'string',
        service_url: 'string',
        'recipient.first_name': 'string?',
      },
    },

    // ───────────── maintenance.completed (campana cliente) ─────────────
    {
      event_type: 'maintenance.completed',
      channel: 'internal' as const,
      locale: 'es',
      subject: 'Mantenimiento completado · {{month_label}}',
      body: 'Hemos completado el mantenimiento mensual de tu servicio ({{month_label}}). Revisa el resumen desde tu panel.',
      variables: {
        month_year: 'string',
        month_label: 'string',
      },
    },

    // ───────────── task.completed (email cliente) ─────────────
    // Sprint 8 Fase B.9 (2026-04-30) — notificación al cliente cuando el
    // agente cierra una tarea NO-MAINTENANCE con un mensaje explícito
    // (`client_notes`). Maintenance tiene su propio listener arriba con
    // plantilla más rica (resumen + mes). Aquí el subject es genérico
    // "Sobre tu solicitud" y el cuerpo prioriza el `task_reason` (Sprint
    // 8 Fase B.7 — porqué humano) si está poblado.
    {
      event_type: 'task.completed',
      channel: 'email' as const,
      locale: 'es',
      subject: 'Sobre tu solicitud: Tarea {{task_source_system_label}}',
      body: `
        <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #635BFF 0%, #8B5CF6 100%); padding: 32px; border-radius: 16px 16px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">Tarea completada</h1>
            {{#if task_reason}}<p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">{{task_reason}}</p>{{/if}}
          </div>
          <div style="background: #fff; padding: 32px; border: 1px solid #f0f0f0; border-top: none; border-radius: 0 0 16px 16px;">
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Hola {{#if recipient.first_name}}{{recipient.first_name}}{{else}}cliente{{/if}},
            </p>
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Hemos terminado de trabajar en tu solicitud "<strong>Tarea {{task_source_system_label}}</strong>". Aquí tienes el detalle:
            </p>
            <div style="background: #f9fafb; border-left: 4px solid #635BFF; border-radius: 8px; padding: 16px 20px; margin: 20px 0;">
              <p style="color: #374151; font-size: 14px; line-height: 1.6; white-space: pre-wrap; margin: 0;">{{client_notes}}</p>
            </div>
            <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
              Si tienes cualquier duda, contáctanos respondiendo a este correo o desde tu panel de cliente.
            </p>
            <p style="text-align: center; margin: 24px 0;">
              <a href="{{service_url}}" style="display: inline-block; background: #635BFF; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Ir a mi panel</a>
            </p>
          </div>
        </div>
      `.trim(),
      variables: {
        task_id: 'string',

        task_source_system_label: 'string',
        task_reason: 'string?',
        client_notes: 'string',
        service_url: 'string',
        'recipient.first_name': 'string?',
      },
    },

    // ───────────── task.completed (campana cliente) ─────────────
    {
      event_type: 'task.completed',
      channel: 'internal' as const,
      locale: 'es',
      subject: 'Sobre tu solicitud: Tarea {{task_source_system_label}}',
      body: 'Hemos completado tu solicitud{{#if task_reason}} ({{task_reason}}){{/if}}. Revisa los detalles desde tu panel.',
      variables: {
        task_reason: 'string?',
      },
    },

    // ───────────── conversation.resolved (email cliente) ─────────────
    // Sprint 16 Amendment A1 + Sprint 13.5 Fase C (DC.33).
    // Se emite cuando un agente resuelve un ticket. El estado `resolved`
    // es transitorio: cliente puede confirmar, responder, o esperar el
    // cron de auto-cierre tras `support.auto_close_resolved_days` (default 7).
    {
      event_type: 'conversation.resolved',
      channel: 'email' as const,
      locale: 'es',
      subject: 'Aelium — Tu ticket #{{ticket_sequence}} ha sido resuelto',
      body: `
        <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 20px;">Ticket resuelto</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 13px;">#{{ticket_sequence}}</p>
          </div>
          <div style="background: #fff; padding: 24px; border: 1px solid #f0f0f0; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="color: #374151; font-size: 14px;">Hola{{#if recipient.first_name}} {{recipient.first_name}}{{/if}},</p>
            <p style="color: #374151; font-size: 14px;">Hemos resuelto tu solicitud. Revisa la respuesta del agente desde tu panel.</p>
            <p style="color: #374151; font-size: 14px; margin-top: 16px;"><strong>Tienes 3 caminos:</strong></p>
            <ul style="color: #374151; font-size: 14px; padding-left: 20px;">
              <li>Si la solución te sirve, confirma desde el panel.</li>
              <li>Si necesitas seguir, responde al ticket y volveremos a abrirlo.</li>
              <li>Si no haces nada, el ticket se cerrará automáticamente en {{auto_close_days}} días.</li>
            </ul>
            <a href="{{ticket_url}}" style="display: inline-block; background: #2563EB; color: #fff; padding: 10px 20px; border-radius: 8px; text-decoration: none; margin-top: 16px;">Ver ticket</a>
          </div>
        </div>
      `,
      variables: {
        ticket_sequence: 'string',
        ticket_url: 'string',
        auto_close_days: 'number',
        'recipient.first_name': 'string?',
      },
    },

    // ───────────── conversation.resolved (campana cliente) ─────────────
    {
      event_type: 'conversation.resolved',
      channel: 'internal' as const,
      locale: 'es',
      subject: 'Tu ticket #{{ticket_sequence}} ha sido resuelto',
      body: 'Hemos resuelto tu solicitud. Confirma o responde si necesitas seguir; en caso contrario se cerrará automáticamente en {{auto_close_days}} días.',
      variables: {
        ticket_sequence: 'string',
        auto_close_days: 'number',
      },
    },

    // ───────────── conversation.auto_closed (email agente) ─────────────
    // Sprint 16 Amendment A1 + Sprint 13.5 Fase C (DC.33).
    // Se emite cuando el cron `support-resolved-auto-close` cierra un
    // ticket que llevaba >`support.auto_close_resolved_days` en `resolved`
    // sin respuesta del cliente. Notif al agente que resolvió.
    {
      event_type: 'conversation.auto_closed',
      channel: 'email' as const,
      locale: 'es',
      subject: 'Ticket #{{ticket_sequence}} cerrado automáticamente',
      body: `
        <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #6B7280 0%, #4B5563 100%); padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 20px;">Auto-cierre de ticket</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 13px;">#{{ticket_sequence}}</p>
          </div>
          <div style="background: #fff; padding: 24px; border: 1px solid #f0f0f0; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="color: #374151; font-size: 14px;">Hola{{#if recipient.first_name}} {{recipient.first_name}}{{/if}},</p>
            <p style="color: #374151; font-size: 14px;">El ticket que resolviste el {{resolved_at_label}} se ha cerrado automáticamente tras {{auto_close_days}} días sin respuesta del cliente.</p>
            <a href="{{ticket_url}}" style="display: inline-block; background: #2563EB; color: #fff; padding: 10px 20px; border-radius: 8px; text-decoration: none; margin-top: 16px;">Ver ticket archivado</a>
          </div>
        </div>
      `,
      variables: {
        ticket_sequence: 'string',
        ticket_url: 'string',
        auto_close_days: 'number',
        resolved_at_label: 'string',
        'recipient.first_name': 'string?',
      },
    },

    // ───────────── conversation.auto_closed (campana agente) ─────────────
    {
      event_type: 'conversation.auto_closed',
      channel: 'internal' as const,
      locale: 'es',
      subject: 'Ticket #{{ticket_sequence}} cerrado automáticamente',
      body: 'El ticket que resolviste el {{resolved_at_label}} se ha cerrado automáticamente tras {{auto_close_days}} días sin respuesta del cliente.',
      variables: {
        ticket_sequence: 'string',
        auto_close_days: 'number',
        resolved_at_label: 'string',
      },
    },

    // ───────────── outbox.event_failed (campana superadmin) ─────────────
    {
      event_type: 'outbox.event_failed',
      channel: 'internal' as const,
      locale: 'es',
      subject: '⚠ Outbox event failed: {{event_type}}',
      body: 'El evento {{event_type}} (id {{event_outbox_id}}) falló tras {{retry_count}} reintentos. Último error: {{last_error}}',
      variables: {
        event_outbox_id: 'string',
        event_type: 'string',
        last_error: 'string',
        retry_count: 'number',
      },
    },

    // ───────────── outbox.event_failed (email superadmin) ─────────────
    {
      event_type: 'outbox.event_failed',
      channel: 'email' as const,
      locale: 'es',
      subject: '⚠ Aelium — Outbox event failed: {{event_type}}',
      body: `
        <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%); padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 20px;">⚠ Outbox event failed</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 13px;">{{event_type}}</p>
          </div>
          <div style="background: #fff; padding: 24px; border: 1px solid #f0f0f0; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="color: #374151; font-size: 14px;">El evento ha agotado {{retry_count}} reintentos y requiere revisión manual.</p>
            <pre style="background: #f9fafb; border-radius: 8px; padding: 12px; font-size: 12px; overflow-x: auto;">id: {{event_outbox_id}}
event_type: {{event_type}}
retry_count: {{retry_count}}
last_error: {{last_error}}</pre>
            <p style="color: #6b7280; font-size: 12px;">Revisa la fila en <code>event_outbox</code> y, si procede, vuelve a marcarla como <code>pending</code> tras corregir el listener fallido.</p>
          </div>
        </div>
      `.trim(),
      variables: {
        event_outbox_id: 'string',
        event_type: 'string',
        last_error: 'string',
        retry_count: 'number',
      },
    },

    // ───────────── dlq.job_failed (campana superadmin) ─────────────
    {
      event_type: 'dlq.job_failed',
      channel: 'internal' as const,
      locale: 'es',
      subject: '⚠ Job en DLQ: {{queue}}/{{name}}',
      body: 'El job {{name}} en la cola {{queue}} falló tras {{attempts_made}} intentos. Último error: {{last_error}}',
      variables: {
        failed_job_id: 'string',
        queue: 'string',
        name: 'string',
        last_error: 'string',
        attempts_made: 'number',
      },
    },

    // ───────────── dlq.job_failed (email superadmin) ─────────────
    {
      event_type: 'dlq.job_failed',
      channel: 'email' as const,
      locale: 'es',
      subject: '⚠ Aelium — Job en DLQ: {{queue}}/{{name}}',
      body: `
        <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 20px;">⚠ Job en DLQ</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 13px;">{{queue}} / {{name}}</p>
          </div>
          <div style="background: #fff; padding: 24px; border: 1px solid #f0f0f0; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="color: #374151; font-size: 14px;">El job ha agotado {{attempts_made}} reintentos y entró en DLQ.</p>
            <pre style="background: #f9fafb; border-radius: 8px; padding: 12px; font-size: 12px; overflow-x: auto;">failed_job_id: {{failed_job_id}}
queue: {{queue}}
name: {{name}}
attempts_made: {{attempts_made}}
last_error: {{last_error}}</pre>
            <p style="color: #6b7280; font-size: 12px;">Revisa la fila en <code>failed_jobs</code> y reintenta manualmente desde el panel admin (Sprint 9 Fase F).</p>
          </div>
        </div>
      `.trim(),
      variables: {
        failed_job_id: 'string',
        queue: 'string',
        name: 'string',
        last_error: 'string',
        attempts_made: 'number',
      },
    },

    // ───────────── task.overdue (email agente — Sprint 8 Fase C) ─────────────
    //
    // Emitido por TasksOverdueService cuando una tarea con asignado supera
    // `tasks.overdue_to_failure_days` desde su due_date. La tarea queda en
    // status=`not_completed_in_time` (terminal) y el agente recibe alerta.
    // Reglas R7+R13 + EC-T8-17 (sin triple-stash).
    {
      event_type: 'task.overdue',
      channel: 'email' as const,
      locale: 'es',
      subject: '⚠ Tarea vencida: Tarea {{task_source_system_label}}',
      body: `
        <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%); padding: 32px; border-radius: 16px 16px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">⚠ Tarea vencida</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">{{task_source_system_label}} · Prioridad {{task_priority_label}}</p>
          </div>
          <div style="background: #fff; padding: 32px; border: 1px solid #f0f0f0; border-top: none; border-radius: 0 0 16px 16px;">
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Hola {{#if recipient.first_name}}{{recipient.first_name}}{{else}}agente{{/if}},
            </p>
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              La tarea <strong>Tarea {{task_source_system_label}}</strong> ha superado su fecha límite por más de {{days_overdue}} días y se ha marcado automáticamente como <strong>no completada a tiempo</strong>.
            </p>
            <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 12px; padding: 16px; margin: 20px 0;">
              <table style="width: 100%; font-size: 14px; color: #374151;">
                <tr><td style="padding: 4px 0; color: #9ca3af;">Tipo:</td><td style="text-align: right; font-weight: 600;">{{task_source_system_label}}</td></tr>
                <tr><td style="padding: 4px 0; color: #9ca3af;">Prioridad:</td><td style="text-align: right;">{{task_priority_label}}</td></tr>
                <tr><td style="padding: 4px 0; color: #9ca3af;">Vencía:</td><td style="text-align: right;">{{due_date_label}}</td></tr>
                <tr><td style="padding: 4px 0; color: #9ca3af;">Días vencida:</td><td style="text-align: right; color: #991B1B; font-weight: 600;">{{days_overdue}}</td></tr>
              </table>
            </div>
            <p style="color: #6b7280; font-size: 13px; line-height: 1.6;">
              Esta tarea ya está en estado terminal y no admite cambios. Si necesitas retomar el trabajo, crea una tarea nueva (auditabilidad ADR-041).
            </p>
            <p style="text-align: center; margin: 24px 0;">
              <a href="{{task_url}}" style="display: inline-block; background: #635BFF; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Ver tarea</a>
            </p>
          </div>
        </div>
      `.trim(),
      variables: {
        task_id: 'string',

        task_source_system_label: 'string',
        task_priority_label: 'string',
        task_url: 'string',
        due_date_label: 'string',
        days_overdue: 'number',
        'recipient.first_name': 'string?',
      },
    },

    // ───────────── task.overdue (campana agente) ─────────────
    {
      event_type: 'task.overdue',
      channel: 'internal' as const,
      locale: 'es',
      subject: 'Tarea vencida: Tarea {{task_source_system_label}}',
      body: 'La tarea Tarea {{task_source_system_label}} ({{task_source_system_label}}) superó su fecha límite por {{days_overdue}} días y pasó a estado no completada a tiempo.',
      variables: {
        task_source_system_label: 'string',
        days_overdue: 'number',
      },
    },

    // ───────────── task.unassigned_overdue (campana superadmin — Sprint 8 Fase C + ADR-072) ─────────────
    //
    // Emitido por TasksUnassignedOverdueService cuando hay tareas en la cola
    // pública que superan su SLA por tipo. Resumen pre-renderizado en el
    // listener (`summary` string) — la plantilla queda declarativa para que
    // el editor admin del Sprint 9.5 no tenga que iterar arrays Handlebars.
    {
      event_type: 'task.unassigned_overdue',
      channel: 'internal' as const,
      locale: 'es',
      subject: '⚠ {{total}} tarea(s) sin asignar fuera de SLA',
      body: 'Hay {{total}} tarea(s) en la cola pública sin asignar que superan su SLA. La más antigua lleva {{oldest_age_hours}} h. Revísalas en /admin/tasks.',
      variables: {
        total: 'number',
        oldest_age_hours: 'number',
        summary: 'string',
      },
    },

    // ───────────── task.unassigned_overdue (email superadmin) ─────────────
    {
      event_type: 'task.unassigned_overdue',
      channel: 'email' as const,
      locale: 'es',
      subject: '⚠ Aelium — {{total}} tarea(s) sin asignar fuera de SLA',
      body: `
        <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 20px;">⚠ Cola pública fuera de SLA</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 13px;">{{total}} tarea(s) sin asignar</p>
          </div>
          <div style="background: #fff; padding: 24px; border: 1px solid #f0f0f0; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="color: #374151; font-size: 14px;">Las siguientes tareas llevan demasiado tiempo en la cola pública sin tomarse. La más antigua espera desde hace {{oldest_age_hours}} h.</p>
            <pre style="background: #f9fafb; border-radius: 8px; padding: 12px; font-size: 12px; overflow-x: auto; white-space: pre-wrap;">{{summary}}</pre>
            <p style="color: #6b7280; font-size: 12px;">Reasigna desde <code>/admin/tasks?scope=unassigned</code> o investiga si la cola crece sistemáticamente (capacidad de equipo, ADR-072 §"Doctrina permanente").</p>
          </div>
        </div>
      `.trim(),
      variables: {
        total: 'number',
        oldest_age_hours: 'number',
        summary: 'string',
      },
    },

    // ───────────── maintenance.critical (campana superadmin — Sprint 8 Fase C) ─────────────
    //
    // Emitido por MaintenanceCriticalService cuando hay servicios activos con
    // checklist_items asignados que llevan >`support.maintenance_critical_threshold_days`
    // sin maintenance_log. Mientras Fase D (Support Inside) no esté cerrada y
    // ningún servicio tenga `service_checklist_items`, el cron no alerta nada
    // (degradación elegante por construcción).
    {
      event_type: 'maintenance.critical',
      channel: 'internal' as const,
      locale: 'es',
      subject: '⚠ {{total}} servicio(s) sin mantenimiento >{{threshold_days}}d',
      body: 'Hay {{total}} servicio(s) activo(s) con mantenimiento pendiente desde hace más de {{threshold_days}} días. Revisa el detalle en el panel admin.',
      variables: {
        total: 'number',
        threshold_days: 'number',
        summary: 'string',
      },
    },

    // ───────────── maintenance.critical (email superadmin) ─────────────
    {
      event_type: 'maintenance.critical',
      channel: 'email' as const,
      locale: 'es',
      subject: '⚠ Aelium — {{total}} servicio(s) sin mantenimiento crítico',
      body: `
        <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%); padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 20px;">⚠ Mantenimiento crítico</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 13px;">{{total}} servicio(s) sin maintenance_log >{{threshold_days}}d</p>
          </div>
          <div style="background: #fff; padding: 24px; border: 1px solid #f0f0f0; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="color: #374151; font-size: 14px;">Los siguientes servicios activos con checklist contratado llevan más de {{threshold_days}} días sin un mantenimiento registrado.</p>
            <pre style="background: #f9fafb; border-radius: 8px; padding: 12px; font-size: 12px; overflow-x: auto; white-space: pre-wrap;">{{summary}}</pre>
            <p style="color: #6b7280; font-size: 12px;">Acción recomendada: programar maintenance_management urgente para los servicios listados o revisar si el servicio sigue activo en producción.</p>
          </div>
        </div>
      `.trim(),
      variables: {
        total: 'number',
        threshold_days: 'number',
        summary: 'string',
      },
    },

    // ───────────── system.error (campana superadmin — Sprint 9.5) ─────────────
    {
      event_type: 'system.error',
      channel: 'internal' as const,
      locale: 'es',
      subject: '⚠ Error operativo: {{module}}',
      body: '[{{level}}] {{module}} — {{message}}',
      variables: {
        error_log_id: 'string',
        level: 'string',
        module: 'string',
        message: 'string',
        correlation_id: 'string?',
      },
    },

    // ───────────── auth.refresh_replay_detected (campana superadmin — Sprint 13 §13.AUTH Fase B) ─────────────
    //
    // Cierra ADR-078 §1.4 (Sprint 13). La emisión la hace `AuthTokenService.refresh()`
    // al detectar reuso de un refresh token (compromiso de cuenta) y la consume
    // `NotificationsAuthReplayListener`. Variables enriquecidas:
    //  - attacked_user_email: email del usuario atacado (puede ser '<email no disponible>'
    //    si la query Prisma de enriquecimiento falla — degradación elegante).
    //  - revoked_sessions_count: cuántas sesiones se revocaron en cascada.
    //  - ip: IP atacante (informativo; X-Forwarded-For si hay proxy).
    //  - attempted_at: timestamp ISO del intento de replay.
    //  - original_used_at: cuándo el token original fue canjeado legítimamente.
    {
      event_type: 'auth.refresh_replay_detected',
      channel: 'internal' as const,
      locale: 'es',
      subject: 'Sesión comprometida: {{attacked_user_email}}',
      body: 'Refresh token reutilizado desde IP {{ip}}. {{revoked_sessions_count}} sesión(es) revocada(s).',
      variables: {
        user_id: 'string',
        session_id: 'string',
        original_used_at: 'string',
        attempted_at: 'string',
        ip: 'string',
        revoked_sessions_count: 'number',
        attacked_user_email: 'string',
      },
    },

    // ───────────── auth.refresh_replay_detected (email superadmin — Sprint 13 §13.AUTH Fase B) ─────────────
    {
      event_type: 'auth.refresh_replay_detected',
      channel: 'email' as const,
      locale: 'es',
      subject: 'Aelium — Sesión comprometida ({{attacked_user_email}})',
      body: `
        <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #B91C1C 0%, #991B1B 100%); padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 20px;">Sesión comprometida</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 13px;">Auth · Replay de refresh token</p>
          </div>
          <div style="background: #fff; padding: 24px; border: 1px solid #f0f0f0; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="color: #374151; font-size: 14px;">
              Se ha detectado el reuso de un refresh token ya canjeado. Por seguridad, todas las sesiones del usuario afectado han sido revocadas y se le pedirá iniciar sesión de nuevo.
            </p>
            <pre style="background: #f9fafb; border-radius: 8px; padding: 12px; font-size: 12px; overflow-x: auto;">usuario_email: {{attacked_user_email}}
user_id: {{user_id}}
session_id: {{session_id}}
ip_atacante: {{ip}}
intento_replay: {{attempted_at}}
canje_legitimo_original: {{original_used_at}}
sesiones_revocadas: {{revoked_sessions_count}}</pre>
            <p style="color: #6b7280; font-size: 12px;">
              Acción recomendada: contactar al usuario por canal externo para confirmar si reconoce la actividad. Si no la reconoce, resetear su password (forgot-password) y revisar los logs de acceso en /admin/error-log.
            </p>
          </div>
        </div>
      `.trim(),
      variables: {
        user_id: 'string',
        session_id: 'string',
        original_used_at: 'string',
        attempted_at: 'string',
        ip: 'string',
        revoked_sessions_count: 'number',
        attacked_user_email: 'string',
      },
    },

    // ───────────── plugin.circuit_opened (campana superadmin — Sprint 15A Fase F.2) ─────────────
    //
    // Cierra ADR-080 §5. La emisión la hace `HouseCircuitBreaker.transitionTo('open')`
    // (core/provisioning/circuit-breaker.ts) y la consume
    // `NotificationsPluginCircuitListener`. Variables enriquecidas:
    //  - plugin_slug: parseado de breaker_name (ej. 'enhance_cp').
    //  - operation: parseado de breaker_name (ej. 'getServiceInfo').
    //  - last_error_code: código semántico ProvisionerPluginError o null.
    //  - failure_count: cuántos fallos antes de abrir.
    //  - reset_timeout_ms: cuánto esperará antes de probar half-open.
    {
      event_type: 'plugin.circuit_opened',
      channel: 'internal' as const,
      locale: 'es',
      subject: 'Plugin {{plugin_slug}} caído — circuito abierto',
      body: 'Operación {{operation}} desactivada tras {{failure_count}} fallos ({{last_error_code}}). Reintento en ~30s.',
      variables: {
        breaker_name: 'string',
        plugin_slug: 'string',
        operation: 'string',
        opened_at: 'string',
        last_error_code: 'string?',
        failure_count: 'number',
        reset_timeout_ms: 'number',
      },
    },

    // ───────────── plugin.circuit_opened (email superadmin — Sprint 15A Fase F.2) ─────────────
    {
      event_type: 'plugin.circuit_opened',
      channel: 'email' as const,
      locale: 'es',
      subject: 'Aelium — Plugin {{plugin_slug}} caído ({{operation}})',
      body: `
        <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #EA580C 0%, #C2410C 100%); padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 20px;">Plugin caído</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 13px;">{{plugin_slug}} · circuito abierto</p>
          </div>
          <div style="background: #fff; padding: 24px; border: 1px solid #f0f0f0; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="color: #374151; font-size: 14px;">
              El proveedor del plugin <strong>{{plugin_slug}}</strong> ha fallado repetidamente. El circuit breaker abrió la operación <code>{{operation}}</code> para no martillar al proveedor mientras se recupera. Las lecturas servirán fallback "unknown" desde cache; las acciones inline fallarán con <code>action.circuit_open</code> hasta que el circuito vuelva a cerrarse.
            </p>
            <pre style="background: #f9fafb; border-radius: 8px; padding: 12px; font-size: 12px; overflow-x: auto;">plugin_slug: {{plugin_slug}}
operation: {{operation}}
breaker_name: {{breaker_name}}
opened_at: {{opened_at}}
failure_count: {{failure_count}}
last_error_code: {{last_error_code}}
reset_timeout_ms: {{reset_timeout_ms}}</pre>
            <p style="color: #6b7280; font-size: 12px;">
              Acción recomendada: revisar la API del proveedor + logs en <code>/admin/error-log</code>. Si la caída persiste, deshabilitar el plugin desde <code>/admin/settings/plugins</code> (los servicios afectados quedarán en pending hasta restauración).
            </p>
          </div>
        </div>
      `.trim(),
      variables: {
        breaker_name: 'string',
        plugin_slug: 'string',
        operation: 'string',
        opened_at: 'string',
        last_error_code: 'string?',
        failure_count: 'number',
        reset_timeout_ms: 'number',
      },
    },

    // ───────────── plugin.circuit_closed (campana superadmin — Sprint 15A Fase F.2) ─────────────
    //
    // Notif `internal` informativa de resolución. NO se duplica como email
    // (el superadmin ya recibió el email de open; saber que cerró no merece
    // otro email).
    {
      event_type: 'plugin.circuit_closed',
      channel: 'internal' as const,
      locale: 'es',
      subject: 'Plugin {{plugin_slug}} recuperado',
      body: 'Operación {{operation}} restaurada tras {{downtime_seconds}}s de caída.',
      variables: {
        breaker_name: 'string',
        plugin_slug: 'string',
        operation: 'string',
        closed_at: 'string',
        downtime_seconds: 'number',
      },
    },

    // ───────────── system.error (email superadmin — Sprint 9.5) ─────────────
    //
    // Cierra ADR-055 §Monitoring. La emisión la hace ErrorLogService.log() y la
    // consume notifications-system-error.listener (Sprint 9.5 Fase F.10).
    {
      event_type: 'system.error',
      channel: 'email' as const,
      locale: 'es',
      subject: '⚠ Aelium — Error operativo en {{module}}',
      body: `
        <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%); padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 20px;">⚠ Error operativo</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 13px;">{{module}} · {{level}}</p>
          </div>
          <div style="background: #fff; padding: 24px; border: 1px solid #f0f0f0; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="color: #374151; font-size: 14px;">{{message}}</p>
            <pre style="background: #f9fafb; border-radius: 8px; padding: 12px; font-size: 12px; overflow-x: auto;">error_log_id: {{error_log_id}}
module: {{module}}
level: {{level}}{{#if correlation_id}}
correlation_id: {{correlation_id}}{{/if}}</pre>
            <p style="color: #6b7280; font-size: 12px;">Revisa el detalle completo (incluyendo stack trace si aplica) en el panel <code>/admin/error-log</code> y márcalo como resuelto cuando proceda.</p>
          </div>
        </div>
      `.trim(),
      variables: {
        error_log_id: 'string',
        level: 'string',
        module: 'string',
        message: 'string',
        correlation_id: 'string?',
      },
    },

    // ───────────── service.password_reset (email cliente — Sprint 15C.II Fase D) ─────────────
    //
    // DC.NEW-15CII-EMAIL-RESET + ADR-083 Amendment A4.5.
    //
    // Emitido por `NotificationsOnPasswordResetListener` cuando el wrapper
    // canónico `executeActionWithCacheInvalidation` ejecuta exitosamente la
    // action `reset_account_password` de cualquier plugin SaaS (heredable:
    // 15C enhance_cp, 15D RC, 15G Plesk). El wrapper redacta `data.password`
    // a `[REDACTED]` en audit_change_log via `core/provisioning/audit-sanitizer.ts`
    // antes de persistir (R12 compliance — gap G2 audit técnico 2026-05-10).
    // El listener recibe el plaintext temporal in-memory y lo pasa al
    // dispatcher; el plaintext NUNCA queda persistido en BD.
    //
    // Variables disponibles:
    //   - service_id: UUID del servicio (link al portal cliente).
    //   - domain: domain del servicio (display primario — fallback chain
    //     domain → label → service_id en el listener).
    //   - new_password: contraseña plaintext NUEVA generada por el plugin
    //     (32 hex chars en enhance_cp; otros plugins pueden devolver shapes
    //     equivalentes).
    //   - panel_url: URL absoluta al detalle del servicio en el portal
    //     Aelium (NO al panel externo del proveedor — el cliente abre SSO
    //     desde ahí con audit canónico `service.sso_opened`).
    //   - provisioner_slug: slug del plugin (ej. 'enhance_cp'). No mostrado
    //     al cliente; útil si el admin futuro extiende la plantilla con
    //     panel_label específico.
    //   - recipient.first_name: opcional, añadido por el dispatcher.
    //
    // EC-T8-17: SIEMPRE `{{var}}` con escape automático. NUNCA triple-stash
    // ni ampersand-stash unescaped. El test guard
    // `notification-templates.security.spec.ts` falla el build si
    // introducimos un patrón unsafe.
    {
      event_type: 'service.password_reset',
      channel: 'email' as const,
      locale: 'es',
      subject: 'Tu contraseña ha sido restablecida — {{domain}}',
      body: `
        <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #635BFF 0%, #8B5CF6 100%); padding: 32px; border-radius: 16px 16px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">Contraseña restablecida</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">{{domain}}</p>
          </div>
          <div style="background: #fff; padding: 32px; border: 1px solid #f0f0f0; border-top: none; border-radius: 0 0 16px 16px;">
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Hola{{#if recipient.first_name}} {{recipient.first_name}}{{/if}},
            </p>
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Hemos restablecido la contraseña de tu cuenta para el servicio
              <strong>{{domain}}</strong>. Esta es la nueva contraseña temporal:
            </p>
            <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin: 20px 0; text-align: center;">
              <code style="font-family: 'JetBrains Mono', 'Courier New', monospace; font-size: 18px; color: #111827; letter-spacing: 1px; word-break: break-all;">{{new_password}}</code>
            </div>
            <div style="background: #FEF3C7; border: 1px solid #FDE68A; border-radius: 12px; padding: 16px 20px; margin: 20px 0;">
              <p style="color: #92400E; font-size: 14px; margin: 0; line-height: 1.6;">
                <strong>Cambia esta contraseña al iniciar sesión por primera vez.</strong>
                Es temporal y no debes reutilizarla en otros servicios.
              </p>
            </div>
            <p style="color: #6b7280; font-size: 13px; line-height: 1.6;">
              Puedes acceder al panel del proveedor desde tu portal de cliente
              en Aelium pulsando el botón "Abrir panel".
            </p>
            <p style="text-align: center; margin: 24px 0;">
              <a href="{{panel_url}}" style="display: inline-block; background: #635BFF; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Ir a mi servicio</a>
            </p>
            <p style="color: #9ca3af; font-size: 12px; line-height: 1.6; margin-top: 24px;">
              Si no solicitaste este cambio, contacta inmediatamente con soporte
              respondiendo a este correo.
            </p>
          </div>
        </div>
      `.trim(),
      variables: {
        service_id: 'string',
        domain: 'string',
        new_password: 'string',
        panel_url: 'string',
        provisioner_slug: 'string',
        'recipient.first_name': 'string?',
      },
    },

    // ───────────── service.password_reset (campana cliente) ─────────────
    //
    // Por seguridad la campana NO muestra la nueva password (cualquiera con
    // acceso al portal verá el feed). El cliente ya recibió la password via
    // email; la campana solo confirma el evento + enlaza al servicio.
    {
      event_type: 'service.password_reset',
      channel: 'internal' as const,
      locale: 'es',
      subject: 'Contraseña restablecida — {{domain}}',
      body: 'Te hemos enviado por email la nueva contraseña de {{domain}}. Cámbiala al iniciar sesión por primera vez.',
      variables: {
        service_id: 'string',
        domain: 'string',
        provisioner_slug: 'string',
      },
    },

    // ───────────── service.cancelled (email cliente — Sprint 15C.II Fase E) ─────────────
    //
    // Emitido por `NotificationsOnServiceCancelledListener` cuando un admin
    // cancela / desprovisiona un servicio vía `POST /admin/services/:id/deprovision`
    // (provisioning.service.deprovisionAsAdmin → evento `service.cancelled`).
    // Solo se despacha si `payload.notify_client !== false` (toggle "Notificar
    // al cliente" del modal admin, default ON). Heredable a todos los plugins
    // SaaS — la plantilla es genérica (no menciona el motivo interno
    // cancelled/expired/admin_override, que es taxonomía de billing no
    // customer-facing; ni la nota interna del admin).
    //
    // Variables:
    //   - service_id: UUID del servicio.
    //   - domain: domain del servicio (display primario — fallback chain
    //     domain → label → service_id en el listener).
    //   - support_url: URL absoluta al portal de soporte del cliente.
    //   - recipient.first_name: opcional, añadido por el dispatcher.
    //
    // EC-T8-17: SIEMPRE `{{var}}` con escape automático.
    {
      event_type: 'service.cancelled',
      channel: 'email' as const,
      locale: 'es',
      subject: 'Tu servicio ha sido cancelado — {{domain}}',
      body: `
        <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #6B7280 0%, #4B5563 100%); padding: 32px; border-radius: 16px 16px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">Servicio cancelado</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">{{domain}}</p>
          </div>
          <div style="background: #fff; padding: 32px; border: 1px solid #f0f0f0; border-top: none; border-radius: 0 0 16px 16px;">
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Hola{{#if recipient.first_name}} {{recipient.first_name}}{{/if}},
            </p>
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Te confirmamos que el servicio <strong>{{domain}}</strong> ha sido
              cancelado y ya no está activo.
            </p>
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Si crees que se trata de un error, o si quieres volver a contratar
              este u otro servicio, escríbenos — estaremos encantados de ayudarte.
            </p>
            <p style="text-align: center; margin: 24px 0;">
              <a href="{{support_url}}" style="display: inline-block; background: #635BFF; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Contactar con soporte</a>
            </p>
            <p style="color: #9ca3af; font-size: 12px; line-height: 1.6; margin-top: 24px;">
              Si tenías datos en este servicio que necesitas recuperar, contacta
              con soporte cuanto antes — algunos datos pueden no estar disponibles
              tras la cancelación.
            </p>
          </div>
        </div>
      `.trim(),
      variables: {
        service_id: 'string',
        domain: 'string',
        support_url: 'string',
        'recipient.first_name': 'string?',
      },
    },

    // ───────────── service.cancelled (campana cliente) ─────────────
    {
      event_type: 'service.cancelled',
      channel: 'internal' as const,
      locale: 'es',
      subject: 'Servicio cancelado — {{domain}}',
      body: 'El servicio {{domain}} ha sido cancelado y ya no está activo. Si crees que es un error o quieres volver a contratarlo, contacta con soporte.',
      variables: {
        service_id: 'string',
        domain: 'string',
        support_url: 'string',
      },
    },

    // ───────────── service.suspended (email cliente — Sprint 15C.II Fase F) ─────────────
    //
    // ADR-077 Amendment A4. Emitido por `NotificationsOnServiceSuspendedListener`
    // cuando un admin suspende un servicio vía `POST /admin/services/:id/suspend`
    // (o el futuro cron `billing-suspend-on-overdue`). Solo se despacha si
    // `payload.notify_client !== false` (toggle del modal admin, default ON).
    // Heredable a 15E Docker + 15G Plesk.
    //
    // Variables:
    //   - service_id: UUID del servicio.
    //   - domain: domain del servicio (display primario — fallback domain → label → service_id).
    //   - reason_label: etiqueta localizada del motivo canónico (undefined para
    //     `reason='other'` — el listener lo omite; entonces no se muestra la
    //     línea "Motivo:"). NUNCA es la nota interna del admin (esa no viaja al cliente).
    //   - is_overdue_payment / is_maintenance: flags para ramificar el CTA.
    //   - billing_url: URL absoluta a /dashboard/billing (CTA cuando overdue).
    //   - support_url: URL absoluta a /dashboard/support (CTA por defecto).
    //   - recipient.first_name: opcional, añadido por el dispatcher.
    //
    // EC-T8-17: SIEMPRE `{{var}}` con escape automático.
    {
      event_type: 'service.suspended',
      channel: 'email' as const,
      locale: 'es',
      subject: 'Tu servicio ha sido suspendido — {{domain}}',
      body: `
        <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); padding: 32px; border-radius: 16px 16px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">Servicio suspendido</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">{{domain}}</p>
          </div>
          <div style="background: #fff; padding: 32px; border: 1px solid #f0f0f0; border-top: none; border-radius: 0 0 16px 16px;">
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Hola{{#if recipient.first_name}} {{recipient.first_name}}{{/if}},
            </p>
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              El servicio <strong>{{domain}}</strong> ha sido suspendido temporalmente.
              Tus datos se conservan — la suspensión solo desactiva el acceso al servicio.
            </p>
            {{#if reason_label}}
            <div style="background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 12px; padding: 16px 20px; margin: 20px 0;">
              <p style="color: #92400E; font-size: 14px; margin: 0; line-height: 1.6;">
                <strong>Motivo:</strong> {{reason_label}}
              </p>
            </div>
            {{/if}}
            {{#if is_overdue_payment}}
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Para reactivar el servicio, regulariza el pago pendiente desde tu panel.
              En cuanto registremos el pago, el servicio volverá a estar activo.
            </p>
            <p style="text-align: center; margin: 24px 0;">
              <a href="{{billing_url}}" style="display: inline-block; background: #635BFF; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Ir a facturación</a>
            </p>
            {{else}}
            {{#if is_maintenance}}
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              El servicio volverá a estar disponible automáticamente cuando finalice
              el mantenimiento programado. No necesitas hacer nada.
            </p>
            {{else}}
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Para más información sobre esta suspensión, contacta con nuestro
              equipo de soporte — estaremos encantados de ayudarte.
            </p>
            <p style="text-align: center; margin: 24px 0;">
              <a href="{{support_url}}" style="display: inline-block; background: #635BFF; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Contactar con soporte</a>
            </p>
            {{/if}}
            {{/if}}
          </div>
        </div>
      `.trim(),
      variables: {
        service_id: 'string',
        domain: 'string',
        reason_label: 'string?',
        is_overdue_payment: 'boolean?',
        is_maintenance: 'boolean?',
        billing_url: 'string',
        support_url: 'string',
        'recipient.first_name': 'string?',
      },
    },

    // ───────────── service.suspended (campana cliente) ─────────────
    {
      event_type: 'service.suspended',
      channel: 'internal' as const,
      locale: 'es',
      subject: 'Servicio suspendido — {{domain}}',
      body: 'El servicio {{domain}} ha sido suspendido temporalmente.{{#if reason_label}} Motivo: {{reason_label}}.{{/if}} Tus datos se conservan. {{#if is_overdue_payment}}Regulariza el pago pendiente para reactivarlo.{{else}}{{#if is_maintenance}}Volverá a estar disponible cuando finalice el mantenimiento.{{else}}Contacta con soporte para más información.{{/if}}{{/if}}',
      variables: {
        service_id: 'string',
        domain: 'string',
        reason_label: 'string?',
        is_overdue_payment: 'boolean?',
        is_maintenance: 'boolean?',
        billing_url: 'string',
        support_url: 'string',
      },
    },

    // ───────────── service.unsuspended (email cliente — Sprint 15C.II Fase F) ─────────────
    //
    // ADR-077 Amendment A4. Emitido por `NotificationsOnServiceUnsuspendedListener`
    // cuando un admin reactiva un servicio suspendido vía
    // `POST /admin/services/:id/unsuspend`. Se despacha SIEMPRE (reactivar es
    // buena noticia — no hay toggle de supresión, a diferencia de `suspend`).
    //
    // Variables:
    //   - service_id: UUID del servicio.
    //   - domain: domain del servicio.
    //   - panel_url: URL absoluta al detalle del servicio en el portal Aelium.
    //   - recipient.first_name: opcional.
    {
      event_type: 'service.unsuspended',
      channel: 'email' as const,
      locale: 'es',
      subject: 'Tu servicio vuelve a estar activo — {{domain}}',
      body: `
        <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); padding: 32px; border-radius: 16px 16px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">Servicio reactivado</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">{{domain}}</p>
          </div>
          <div style="background: #fff; padding: 32px; border: 1px solid #f0f0f0; border-top: none; border-radius: 0 0 16px 16px;">
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Hola{{#if recipient.first_name}} {{recipient.first_name}}{{/if}},
            </p>
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              ¡Buenas noticias! El servicio <strong>{{domain}}</strong> vuelve a estar
              activo. Ya puedes usarlo con normalidad — tus datos se mantuvieron intactos
              durante la suspensión.
            </p>
            <p style="text-align: center; margin: 24px 0;">
              <a href="{{panel_url}}" style="display: inline-block; background: #635BFF; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Ir a mi servicio</a>
            </p>
            <p style="color: #9ca3af; font-size: 12px; line-height: 1.6; margin-top: 24px;">
              Si tienes cualquier duda, responde a este correo y te ayudamos.
            </p>
          </div>
        </div>
      `.trim(),
      variables: {
        service_id: 'string',
        domain: 'string',
        panel_url: 'string',
        'recipient.first_name': 'string?',
      },
    },

    // ───────────── service.unsuspended (campana cliente) ─────────────
    {
      event_type: 'service.unsuspended',
      channel: 'internal' as const,
      locale: 'es',
      subject: 'Servicio reactivado — {{domain}}',
      body: 'El servicio {{domain}} vuelve a estar activo. Ya puedes usarlo con normalidad.',
      variables: {
        service_id: 'string',
        domain: 'string',
        panel_url: 'string',
      },
    },

    // ───────────── service.quota_threshold_crossed (email cliente — Sprint 15C.II Fase F.8) ─────────────
    // Edge-triggered upstream — `QuotaThresholdDetectorService` garantiza un
    // solo email por transición `<threshold → ≥threshold` (dossier §A.11.10.5.1
    // R1/R6). El listener `NotificationsOnServiceQuotaThresholdCrossedListener`
    // re-renderiza fresco con el contexto actual (display domain del service +
    // appUrl del ConfigService). Heredable a cualquier plugin con `has_metrics`.
    // EC-T8-17: solo `{{var}}` (escape Handlebars) — `notification-templates
    // .security.spec.ts` falla el build si introduce triple-stash.
    {
      event_type: 'service.quota_threshold_crossed',
      channel: 'email' as const,
      locale: 'es',
      subject: '⚠ Estás al {{used_pct}}% de almacenamiento en {{domain}}',
      body: `
        <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); padding: 32px; border-radius: 16px 16px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">⚠ Almacenamiento próximo al límite</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">{{domain}}</p>
          </div>
          <div style="background: #fff; padding: 32px; border: 1px solid #f0f0f0; border-top: none; border-radius: 0 0 16px 16px;">
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Hola{{#if recipient.first_name}} {{recipient.first_name}}{{/if}},
            </p>
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Tu servicio <strong>{{domain}}</strong> está al <strong>{{used_pct}}%</strong> de su cuota de almacenamiento. Si llega al 100%, dejará de aceptar nuevos archivos (uploads, copias de seguridad, registros del sitio) hasta que liberes espacio o amplíes el plan.
            </p>
            <div style="background: #FEF3C7; border: 1px solid #FCD34D; border-radius: 12px; padding: 20px; margin: 20px 0;">
              <table style="width: 100%; font-size: 14px; color: #374151;">
                <tr><td style="padding: 4px 0; color: #92400E;">Uso actual:</td><td style="text-align: right; font-weight: 600;">{{used_mb_label}}</td></tr>
                <tr><td style="padding: 4px 0; color: #92400E;">Cuota total:</td><td style="text-align: right; font-weight: 600;">{{total_mb_label}}</td></tr>
                <tr><td style="padding: 4px 0; color: #92400E;">Porcentaje:</td><td style="text-align: right; font-weight: 600;">{{used_pct}}%</td></tr>
              </table>
            </div>
            <p style="text-align: center; margin: 24px 0;">
              <a href="{{service_url}}" style="display: inline-block; background: #635BFF; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Ver detalles del servicio</a>
            </p>
            <p style="color: #6b7280; font-size: 13px;">
              Si necesitas ayuda para liberar espacio o ampliar tu plan, contacta con <a href="{{support_url}}" style="color: #635BFF;">soporte</a>.
            </p>
          </div>
        </div>
      `.trim(),
      variables: {
        service_id: 'string',
        domain: 'string',
        used_pct: 'string',
        used_mb_label: 'string',
        total_mb_label: 'string',
        service_url: 'string',
        support_url: 'string',
        'recipient.first_name': 'string?',
      },
    },

    // ───────────── service.quota_threshold_crossed (campana cliente) ─────────────
    {
      event_type: 'service.quota_threshold_crossed',
      channel: 'internal' as const,
      locale: 'es',
      subject: 'Almacenamiento al {{used_pct}}% en {{domain}}',
      body: 'Tu servicio {{domain}} está al {{used_pct}}% de su cuota de almacenamiento ({{used_mb_label}} de {{total_mb_label}}). Considera liberar espacio o ampliar el plan.',
      variables: {
        service_id: 'string',
        domain: 'string',
        used_pct: 'string',
        used_mb_label: 'string',
        total_mb_label: 'string',
        service_url: 'string',
      },
    },

    // ═════════════ Sprint 15D Fase 15D.E — ciclo de vida del dominio (ADR-084 §5) ═════════════
    // Emitidos por: domain.renewed (orquestador, Outbox), domain.expiring_soon
    // (cron de avisos), domain.expired/entered_redemption (reconcile cron, Outbox).
    // Consumidos por `NotificationsOnDomainLifecycleListener`. Variables: service_id,
    // fqdn, panel_url + (renewed: new_expires_at) / (expiring_soon: days_left).

    // ───────────── domain.renewed (email cliente) ─────────────
    {
      event_type: 'domain.renewed',
      channel: 'email' as const,
      locale: 'es',
      subject: 'Dominio renovado — {{fqdn}}',
      body: `
        <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); padding: 32px; border-radius: 16px 16px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">Dominio renovado</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">{{fqdn}}</p>
          </div>
          <div style="background: #fff; padding: 32px; border: 1px solid #f0f0f0; border-top: none; border-radius: 0 0 16px 16px;">
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Hola{{#if recipient.first_name}} {{recipient.first_name}}{{/if}},
            </p>
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Hemos renovado tu dominio <strong>{{fqdn}}</strong>. Sigue activo sin interrupciones.
            </p>
            <p style="text-align: center; margin: 24px 0;">
              <a href="{{panel_url}}" style="display: inline-block; background: #635BFF; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Ver mi dominio</a>
            </p>
          </div>
        </div>
      `.trim(),
      variables: {
        service_id: 'string',
        fqdn: 'string',
        panel_url: 'string',
        new_expires_at: 'string',
        'recipient.first_name': 'string?',
      },
    },
    // ───────────── domain.renewed (campana cliente) ─────────────
    {
      event_type: 'domain.renewed',
      channel: 'internal' as const,
      locale: 'es',
      subject: 'Dominio renovado — {{fqdn}}',
      body: 'Tu dominio {{fqdn}} se ha renovado. Sigue activo sin interrupciones.',
      variables: { service_id: 'string', fqdn: 'string', panel_url: 'string' },
    },

    // ───────────── domain.expiring_soon (email cliente) ─────────────
    {
      event_type: 'domain.expiring_soon',
      channel: 'email' as const,
      locale: 'es',
      subject: 'Tu dominio {{fqdn}} caduca en {{days_left}} días',
      body: `
        <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); padding: 32px; border-radius: 16px 16px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">Tu dominio caduca pronto</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">{{fqdn}}</p>
          </div>
          <div style="background: #fff; padding: 32px; border: 1px solid #f0f0f0; border-top: none; border-radius: 0 0 16px 16px;">
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Hola{{#if recipient.first_name}} {{recipient.first_name}}{{/if}},
            </p>
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Tu dominio <strong>{{fqdn}}</strong> caduca en <strong>{{days_left}} días</strong>.
              Renuévalo a tiempo para no perderlo.
            </p>
            <p style="text-align: center; margin: 24px 0;">
              <a href="{{panel_url}}" style="display: inline-block; background: #635BFF; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Renovar dominio</a>
            </p>
          </div>
        </div>
      `.trim(),
      variables: {
        service_id: 'string',
        fqdn: 'string',
        panel_url: 'string',
        days_left: 'number',
        'recipient.first_name': 'string?',
      },
    },
    // ───────────── domain.expiring_soon (campana cliente) ─────────────
    {
      event_type: 'domain.expiring_soon',
      channel: 'internal' as const,
      locale: 'es',
      subject: 'Tu dominio {{fqdn}} caduca en {{days_left}} días',
      body: 'Tu dominio {{fqdn}} caduca en {{days_left}} días. Renuévalo a tiempo para no perderlo.',
      variables: {
        service_id: 'string',
        fqdn: 'string',
        panel_url: 'string',
        days_left: 'number',
      },
    },

    // ───────────── domain.expired (email cliente) ─────────────
    {
      event_type: 'domain.expired',
      channel: 'email' as const,
      locale: 'es',
      subject: 'Tu dominio {{fqdn}} ha caducado',
      body: `
        <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%); padding: 32px; border-radius: 16px 16px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">Tu dominio ha caducado</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">{{fqdn}}</p>
          </div>
          <div style="background: #fff; padding: 32px; border: 1px solid #f0f0f0; border-top: none; border-radius: 0 0 16px 16px;">
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Hola{{#if recipient.first_name}} {{recipient.first_name}}{{/if}},
            </p>
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Tu dominio <strong>{{fqdn}}</strong> ha caducado. Aún puedes recuperarlo durante un
              breve periodo de gracia — renuévalo cuanto antes.
            </p>
            <p style="text-align: center; margin: 24px 0;">
              <a href="{{panel_url}}" style="display: inline-block; background: #635BFF; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Recuperar dominio</a>
            </p>
          </div>
        </div>
      `.trim(),
      variables: {
        service_id: 'string',
        fqdn: 'string',
        panel_url: 'string',
        'recipient.first_name': 'string?',
      },
    },
    // ───────────── domain.expired (campana cliente) ─────────────
    {
      event_type: 'domain.expired',
      channel: 'internal' as const,
      locale: 'es',
      subject: 'Tu dominio {{fqdn}} ha caducado',
      body: 'Tu dominio {{fqdn}} ha caducado. Aún puedes recuperarlo durante un breve periodo de gracia.',
      variables: { service_id: 'string', fqdn: 'string', panel_url: 'string' },
    },

    // ───────────── domain.entered_redemption (email cliente) ─────────────
    {
      event_type: 'domain.entered_redemption',
      channel: 'email' as const,
      locale: 'es',
      subject: 'Tu dominio {{fqdn}} está en periodo de redención',
      body: `
        <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #DC2626 0%, #991B1B 100%); padding: 32px; border-radius: 16px 16px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">Dominio en redención</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">{{fqdn}}</p>
          </div>
          <div style="background: #fff; padding: 32px; border: 1px solid #f0f0f0; border-top: none; border-radius: 0 0 16px 16px;">
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Hola{{#if recipient.first_name}} {{recipient.first_name}}{{/if}},
            </p>
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Tu dominio <strong>{{fqdn}}</strong> ha entrado en periodo de redención. Todavía puede
              rescatarse, pero con una tarifa de recuperación más alta y por tiempo limitado.
              Contáctanos para recuperarlo.
            </p>
            <p style="text-align: center; margin: 24px 0;">
              <a href="{{panel_url}}" style="display: inline-block; background: #635BFF; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Ver mi dominio</a>
            </p>
          </div>
        </div>
      `.trim(),
      variables: {
        service_id: 'string',
        fqdn: 'string',
        panel_url: 'string',
        'recipient.first_name': 'string?',
      },
    },
    // ───────────── domain.entered_redemption (campana cliente) ─────────────
    {
      event_type: 'domain.entered_redemption',
      channel: 'internal' as const,
      locale: 'es',
      subject: 'Tu dominio {{fqdn}} está en redención',
      body: 'Tu dominio {{fqdn}} está en periodo de redención. Aún puede rescatarse con una tarifa más alta por tiempo limitado. Contáctanos para recuperarlo.',
      variables: { service_id: 'string', fqdn: 'string', panel_url: 'string' },
    },
  ];

  for (const tpl of templates) {
    await prisma.notificationTemplate.upsert({
      where: {
        event_type_channel_locale: {
          event_type: tpl.event_type,
          channel: tpl.channel,
          locale: tpl.locale,
        },
      },
      update: {},
      create: tpl,
    });
  }

  console.log(`  ✓ ${templates.length} notification templates seeded`);
}
