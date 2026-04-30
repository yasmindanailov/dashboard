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
      subject: 'Nueva tarea asignada: {{task_title}}',
      body: `
        <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #635BFF 0%, #8B5CF6 100%); padding: 32px; border-radius: 16px 16px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">Tarea asignada</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">{{task_type_label}} · Prioridad {{task_priority_label}}</p>
          </div>
          <div style="background: #fff; padding: 32px; border: 1px solid #f0f0f0; border-top: none; border-radius: 0 0 16px 16px;">
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Hola {{#if recipient.first_name}}{{recipient.first_name}}{{else}}agente{{/if}},
            </p>
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Se te ha asignado una nueva tarea: <strong>{{task_title}}</strong>.
            </p>
            <div style="background: #f9fafb; border-radius: 12px; padding: 20px; margin: 20px 0;">
              <table style="width: 100%; font-size: 14px; color: #374151;">
                <tr><td style="padding: 4px 0; color: #9ca3af;">Tipo:</td><td style="text-align: right; font-weight: 600;">{{task_type_label}}</td></tr>
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
        task_title: 'string',
        task_type_label: 'string',
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
      subject: 'Nueva tarea: {{task_title}}',
      body: 'Se te ha asignado una tarea de {{task_type_label}} con prioridad {{task_priority_label}}.',
      variables: {
        task_title: 'string',
        task_type_label: 'string',
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
      body:
        'Hemos completado el mantenimiento mensual de tu servicio ({{month_label}}). Revisa el resumen desde tu panel.',
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
      subject: 'Sobre tu solicitud: {{task_title}}',
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
              Hemos terminado de trabajar en tu solicitud "<strong>{{task_title}}</strong>". Aquí tienes el detalle:
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
        task_title: 'string',
        task_type: 'string',
        task_type_label: 'string',
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
      subject: 'Sobre tu solicitud: {{task_title}}',
      body:
        'Hemos completado tu solicitud{{#if task_reason}} ({{task_reason}}){{/if}}. Revisa los detalles desde tu panel.',
      variables: {
        task_title: 'string',
        task_reason: 'string?',
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
