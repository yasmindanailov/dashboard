import { PrismaClient } from '@prisma/client';

/**
 * Seed inicial de `notification_templates` (Sprint 9 Fase D + ADR-065).
 *
 * Cada plantilla preserva BYTE-IDÉNTICAMENTE el HTML inline anterior de
 * `BillingEmailListener` y `TasksEmailListener` para que los tests E2E
 * y la UX del cliente no detecten cambios en el copy.
 *
 * 🔒 EC-T8-17 (Sprint 8 Fase B) + GL-25 (audit 2026-06-25) — REGLA CANÓNICA:
 *
 * NUNCA usar `{{{var}}}` ni `{{& var}}` (render crudo → XSS). El guard
 * `notification-templates.security.spec.ts` falla el build si aparecen.
 *
 * ⚠️ El canal `email` se compila con `noEscape: true` (el HTML lo escribe el
 * admin), así que `{{var}}` **NO se escapa** en email. Para CUALQUIER variable
 * de origen usuario (asunto de conversación, cuerpo del mensaje del cliente,
 * nombre libre…) usa el helper **`{{e <var>}}`** (escape vía `SafeString`,
 * GL-25), nunca `{{var}}` a secas. En el canal `internal` (campana,
 * `noEscape:false`) `{{var}}` sí auto-escapa; `{{e}}` también es seguro ahí
 * (devuelve `SafeString` → no doble-escapa).
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
      semantic: 'info',
      subject: 'Tu factura {{invoice_number}}',
      body: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr>
          <td valign="middle" style="padding-right:13px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" valign="middle" width="44" height="44" bgcolor="{{email.tint}}" style="width:44px;height:44px;background:{{email.tint}};border-radius:12px"><img src="{{app_url}}/brand/email/status-info.png" width="21" height="21" alt="" style="display:block;border:0"></td></tr></table></td>
          <td valign="middle"><div style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.3;color:{{email.fg}}">Nueva factura</div><div style="font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;color:#94A3B8;margin-top:2px">{{e invoice_number}}</div></td>
        </tr></table>
        <h1 style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:#0F172A">Aquí tienes tu factura</h1>
        <p style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Hola{{#if recipient.first_name}} {{e recipient.first_name}}{{/if}}, hemos emitido tu factura <strong style="font-weight:600;color:#0F172A">{{e invoice_number}}</strong>. La tienes lista para ver y descargar el PDF cuando quieras.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;border:1px solid #E6ECF3;border-radius:12px;border-collapse:separate;border-spacing:0;background:#F8FAFF"><tr><td style="padding:18px 22px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="padding:7px 0;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;color:#64748B">Factura</td><td align="right" style="padding:7px 0;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;font-weight:600;color:#0F172A">{{e invoice_number}}</td></tr>
          <tr><td colspan="2" style="padding:12px 0 0"><div style="height:1px;background:#E6ECF3;margin-bottom:12px;font-size:0;line-height:0">&nbsp;</div></td></tr>
          <tr><td style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;font-weight:600;color:#0F172A">Importe</td><td align="right" style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:18px;font-weight:700;letter-spacing:-0.01em;color:{{email.fg}}">{{total}} {{currency}}</td></tr>
        </table></td></tr></table>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 6px"><tr><td align="center" bgcolor="#3B82F6" style="border-radius:11px;background:#3B82F6"><a href="{{app_url}}/dashboard/billing/{{invoice_id}}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:11px">Ver factura</a></td></tr></table>
        <p style="margin:0 0 4px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:13.5px;line-height:1.6;color:#94A3B8;text-align:center">También la tienes en tu panel → Facturas.</p>
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
    // PILOTO F4·W3 del layout maestro: `semantic` no-nulo → `body` es el
    // FRAGMENTO del cuerpo (el render lo envuelve en `buildEmailLayout`). Usa
    // `{{email.*}}` (colores del tono, inyectados) y `{{app_url}}` (URL absoluta).
    // 1:1 con `mockup-uiux/Correo Ejemplo Pago.dc.html`.
    {
      event_type: 'invoice.paid',
      channel: 'email' as const,
      locale: 'es',
      semantic: 'success',
      subject: 'Pago confirmado — {{invoice_number}}',
      body: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr>
          <td valign="middle" style="padding-right:13px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" valign="middle" width="44" height="44" bgcolor="{{email.tint}}" style="width:44px;height:44px;background:{{email.tint}};border-radius:12px"><img src="{{app_url}}/brand/email/status-success.png" width="21" height="21" alt="" style="display:block;border:0"></td></tr></table></td>
          <td valign="middle"><div style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.3;color:{{email.fg}}">Pago confirmado</div><div style="font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;color:#94A3B8;margin-top:2px">{{e invoice_number}}</div></td>
        </tr></table>
        <h1 style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:#0F172A">Gracias{{#if recipient.first_name}}, {{e recipient.first_name}}{{/if}}.</h1>
        <p style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Hemos recibido tu pago de la factura <strong style="font-weight:600;color:#0F172A">{{e invoice_number}}</strong>. Tu servicio sigue activo — no tienes que hacer nada.</p>
        <p style="margin:0 0 26px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Te dejo el resumen por si lo necesitas:</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;border:1px solid #E6ECF3;border-radius:12px;border-collapse:separate;border-spacing:0;background:#F8FAFF"><tr><td style="padding:18px 22px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="padding:7px 0;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;color:#64748B">Factura</td><td align="right" style="padding:7px 0;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;font-weight:600;color:#0F172A">{{e invoice_number}}</td></tr>
          <tr><td style="padding:7px 0;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;color:#64748B">Vía</td><td align="right" style="padding:7px 0;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;font-weight:600;color:#0F172A">{{e payment_provider}}</td></tr>
          <tr><td colspan="2" style="padding:12px 0 0"><div style="height:1px;background:#E6ECF3;margin-bottom:12px;font-size:0;line-height:0">&nbsp;</div></td></tr>
          <tr><td style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;font-weight:600;color:#0F172A">Total pagado</td><td align="right" style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:18px;font-weight:700;letter-spacing:-0.01em;color:{{email.fg}}">{{total}} {{currency}}</td></tr>
        </table></td></tr></table>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 6px"><tr><td align="center" bgcolor="#3B82F6" style="border-radius:11px;background:#3B82F6"><a href="{{app_url}}/dashboard/billing/{{invoice_id}}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:11px">Ver factura</a></td></tr></table>
        <p style="margin:0 0 4px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:13.5px;line-height:1.6;color:#94A3B8;text-align:center">También la tienes en tu panel → Facturas.</p>
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
      semantic: 'warning',
      subject: 'No pudimos procesar tu pago — {{invoice_number}}',
      body: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr>
          <td valign="middle" style="padding-right:13px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" valign="middle" width="44" height="44" bgcolor="{{email.tint}}" style="width:44px;height:44px;background:{{email.tint}};border-radius:12px"><img src="{{app_url}}/brand/email/status-warning.png" width="21" height="21" alt="" style="display:block;border:0"></td></tr></table></td>
          <td valign="middle"><div style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.3;color:{{email.fg}}">Cobro no procesado</div><div style="font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;color:#94A3B8;margin-top:2px">{{e invoice_number}} · intento {{retry_count}}/{{max_retries}}</div></td>
        </tr></table>
        <h1 style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:#0F172A">No pudimos procesar tu pago</h1>
        <p style="margin:0 0 22px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Hola{{#if recipient.first_name}} {{e recipient.first_name}}{{/if}}, no hemos podido cobrar la factura <strong style="font-weight:600;color:#0F172A">{{e invoice_number}}</strong>. {{#if (lt retry_count max_retries)}}Lo intentaremos de nuevo automáticamente — no tienes que hacer nada por ahora.{{else}}Ha sido el último intento: si no regularizas el pago, tu servicio se suspenderá.{{/if}}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;border-collapse:separate;border-spacing:0"><tr><td bgcolor="{{email.tint}}" style="background:{{email.tint}};border:1px solid {{email.accent}}33;border-radius:12px;padding:15px 17px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;line-height:1.55;color:{{email.fg}}">Intento {{retry_count}} de {{max_retries}}. Revisar tu método de pago ahora evita que se acumulen más intentos.</td></tr></table>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 6px"><tr><td align="center" bgcolor="#3B82F6" style="border-radius:11px;background:#3B82F6"><a href="{{app_url}}/dashboard/billing" target="_blank" style="display:inline-block;padding:13px 30px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:11px">Actualizar método de pago</a></td></tr></table>
        <p style="margin:0 0 4px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:13.5px;line-height:1.6;color:#94A3B8;text-align:center">¿Ya lo actualizaste? Ignora este aviso.</p>
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
      semantic: 'danger',
      subject: 'Factura vencida — {{invoice_number}}',
      body: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr>
          <td valign="middle" style="padding-right:13px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" valign="middle" width="44" height="44" bgcolor="{{email.tint}}" style="width:44px;height:44px;background:{{email.tint}};border-radius:12px"><img src="{{app_url}}/brand/email/status-danger.png" width="21" height="21" alt="" style="display:block;border:0"></td></tr></table></td>
          <td valign="middle"><div style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.3;color:{{email.fg}}">Factura vencida</div><div style="font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;color:#94A3B8;margin-top:2px">{{e invoice_number}}</div></td>
        </tr></table>
        <h1 style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:#0F172A">Tu factura está vencida</h1>
        <p style="margin:0 0 22px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Hola{{#if recipient.first_name}} {{e recipient.first_name}}{{/if}}, la factura <strong style="font-weight:600;color:#0F172A">{{e invoice_number}}</strong> de <strong style="font-weight:600;color:#0F172A">{{total}} EUR</strong> sigue pendiente. Si no se regulariza, tu servicio se suspenderá automáticamente.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;border-collapse:separate;border-spacing:0"><tr><td bgcolor="{{email.tint}}" style="background:{{email.tint}};border:1px solid {{email.accent}}33;border-radius:12px;padding:15px 17px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;line-height:1.55;color:{{email.fg}}">Acción requerida: actualiza tu método de pago o contáctanos para resolverlo cuanto antes.</td></tr></table>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 6px"><tr><td align="center" bgcolor="#3B82F6" style="border-radius:11px;background:#3B82F6"><a href="{{app_url}}/dashboard/billing" target="_blank" style="display:inline-block;padding:13px 30px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:11px">Regularizar el pago</a></td></tr></table>
        <p style="margin:0 0 4px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:13.5px;line-height:1.6;color:#94A3B8;text-align:center">¿Ya has pagado? Puede tardar unos minutos en reflejarse.</p>
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
      semantic: 'info',
      subject: 'Nueva tarea asignada: {{task_source_system_label}}',
      body: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr>
          <td valign="middle" style="padding-right:13px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" valign="middle" width="44" height="44" bgcolor="{{email.tint}}" style="width:44px;height:44px;background:{{email.tint}};border-radius:12px"><img src="{{app_url}}/brand/email/status-info.png" width="21" height="21" alt="" style="display:block;border:0"></td></tr></table></td>
          <td valign="middle"><div style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.3;color:{{email.fg}}">Tarea asignada</div><div style="font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;color:#94A3B8;margin-top:2px">{{task_source_system_label}} · Prioridad {{task_priority_label}}</div></td>
        </tr></table>
        <h1 style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:#0F172A">Se te ha asignado una tarea</h1>
        <p style="margin:0 0 22px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Hola {{#if recipient.first_name}}{{e recipient.first_name}}{{else}}agente{{/if}}, tienes una nueva tarea: <strong style="font-weight:600;color:#0F172A">{{task_source_system_label}}</strong>.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;border:1px solid #E6ECF3;border-radius:12px;border-collapse:separate;border-spacing:0;background:#F8FAFF"><tr><td style="padding:18px 22px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="padding:7px 0;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;color:#64748B">Tipo</td><td align="right" style="padding:7px 0;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;font-weight:600;color:#0F172A">{{task_source_system_label}}</td></tr>
          <tr><td style="padding:7px 0;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;color:#64748B">Prioridad</td><td align="right" style="padding:7px 0;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;font-weight:600;color:#0F172A">{{task_priority_label}}</td></tr>
          <tr><td style="padding:7px 0;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;color:#64748B">Vence</td><td align="right" style="padding:7px 0;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;font-weight:600;color:#0F172A">{{due_label}}</td></tr>
        </table></td></tr></table>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 6px"><tr><td align="center" bgcolor="#3B82F6" style="border-radius:11px;background:#3B82F6"><a href="{{task_url}}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:11px">Ver tarea</a></td></tr></table>
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
      semantic: 'success',
      subject: 'Mantenimiento completado · {{month_label}}',
      body: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr>
          <td valign="middle" style="padding-right:13px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" valign="middle" width="44" height="44" bgcolor="{{email.tint}}" style="width:44px;height:44px;background:{{email.tint}};border-radius:12px"><img src="{{app_url}}/brand/email/status-success.png" width="21" height="21" alt="" style="display:block;border:0"></td></tr></table></td>
          <td valign="middle"><div style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.3;color:{{email.fg}}">Mantenimiento completado</div><div style="font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;color:#94A3B8;margin-top:2px">{{month_label}}</div></td>
        </tr></table>
        <h1 style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:#0F172A">Mantenimiento completado</h1>
        <p style="margin:0 0 18px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Hola {{#if recipient.first_name}}{{e recipient.first_name}}{{else}}cliente{{/if}}, hemos completado el mantenimiento mensual de tu servicio. Aquí tienes el resumen del trabajo:</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;border:1px solid #E6ECF3;border-radius:12px;border-collapse:separate;border-spacing:0;background:#F8FAFF"><tr><td style="padding:16px 20px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#334155;white-space:pre-wrap">{{e notes}}</td></tr></table>
        <p style="margin:0 0 22px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Si ves algo que revisar, escríbenos desde tu panel — estamos a tu lado.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 6px"><tr><td align="center" bgcolor="#3B82F6" style="border-radius:11px;background:#3B82F6"><a href="{{service_url}}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:11px">Ver mi servicio</a></td></tr></table>
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
      semantic: 'success',
      subject: 'Tu solicitud está resuelta',
      body: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr>
          <td valign="middle" style="padding-right:13px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" valign="middle" width="44" height="44" bgcolor="{{email.tint}}" style="width:44px;height:44px;background:{{email.tint}};border-radius:12px"><img src="{{app_url}}/brand/email/status-success.png" width="21" height="21" alt="" style="display:block;border:0"></td></tr></table></td>
          <td valign="middle"><div style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.3;color:{{email.fg}}">Solicitud resuelta</div>{{#if task_reason}}<div style="font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;color:#94A3B8;margin-top:2px">{{e task_reason}}</div>{{/if}}</td>
        </tr></table>
        <h1 style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:#0F172A">Hemos resuelto tu solicitud</h1>
        <p style="margin:0 0 18px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Hola {{#if recipient.first_name}}{{e recipient.first_name}}{{else}}cliente{{/if}}, hemos terminado de trabajar en tu solicitud. Aquí tienes el detalle:</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px;border:1px solid #E6ECF3;border-radius:12px;border-collapse:separate;border-spacing:0;background:#F8FAFF"><tr><td style="padding:16px 20px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#334155;white-space:pre-wrap">{{e client_notes}}</td></tr></table>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 6px"><tr><td align="center" bgcolor="#3B82F6" style="border-radius:11px;background:#3B82F6"><a href="{{service_url}}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:11px">Ir a mi panel</a></td></tr></table>
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
      body: 'Hemos completado tu solicitud{{#if task_reason}} ({{e task_reason}}){{/if}}. Revisa los detalles desde tu panel.',
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
      semantic: 'success',
      subject: 'Tu ticket #{{ticket_sequence}} está resuelto',
      body: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr>
          <td valign="middle" style="padding-right:13px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" valign="middle" width="44" height="44" bgcolor="{{email.tint}}" style="width:44px;height:44px;background:{{email.tint}};border-radius:12px"><img src="{{app_url}}/brand/email/status-success.png" width="21" height="21" alt="" style="display:block;border:0"></td></tr></table></td>
          <td valign="middle"><div style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.3;color:{{email.fg}}">Ticket resuelto</div><div style="font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;color:#94A3B8;margin-top:2px">#{{ticket_sequence}}</div></td>
        </tr></table>
        <h1 style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:#0F172A">Hemos resuelto tu solicitud</h1>
        <p style="margin:0 0 22px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Hola{{#if recipient.first_name}} {{e recipient.first_name}}{{/if}}, hemos resuelto tu solicitud. Revisa la respuesta del agente desde tu panel.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;border-collapse:separate;border-spacing:0"><tr><td bgcolor="{{email.tint}}" style="background:{{email.tint}};border:1px solid {{email.accent}}33;border-radius:12px;padding:15px 17px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;line-height:1.7;color:{{email.fg}}">Tienes tres opciones:<br>· Si la solución te sirve, confírmala desde el panel.<br>· Si necesitas seguir, responde y volvemos a abrirlo.<br>· Si no haces nada, se cerrará solo en {{auto_close_days}} días.</td></tr></table>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 6px"><tr><td align="center" bgcolor="#3B82F6" style="border-radius:11px;background:#3B82F6"><a href="{{ticket_url}}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:11px">Ver ticket</a></td></tr></table>
      `.trim(),
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
      semantic: 'info',
      subject: 'Ticket #{{ticket_sequence}} cerrado automáticamente',
      body: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr>
          <td valign="middle" style="padding-right:13px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" valign="middle" width="44" height="44" bgcolor="{{email.tint}}" style="width:44px;height:44px;background:{{email.tint}};border-radius:12px"><img src="{{app_url}}/brand/email/status-info.png" width="21" height="21" alt="" style="display:block;border:0"></td></tr></table></td>
          <td valign="middle"><div style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.3;color:{{email.fg}}">Ticket cerrado</div><div style="font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;color:#94A3B8;margin-top:2px">#{{ticket_sequence}}</div></td>
        </tr></table>
        <h1 style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:#0F172A">Ticket cerrado automáticamente</h1>
        <p style="margin:0 0 26px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Hola{{#if recipient.first_name}} {{e recipient.first_name}}{{/if}}, el ticket que resolviste el {{resolved_at_label}} se ha cerrado automáticamente tras {{auto_close_days}} días sin respuesta del cliente.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 6px"><tr><td align="center" bgcolor="#3B82F6" style="border-radius:11px;background:#3B82F6"><a href="{{ticket_url}}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:11px">Ver ticket archivado</a></td></tr></table>
      `.trim(),
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

    // ═════════════ SUPPORT (GL-25 — audit 2026-06-25) ═════════════
    // Migración de los emails inline de `SupportEmailListener` (HTML con
    // interpolación cruda de contenido de usuario → inyección + violación D12)
    // a plantillas de BD. Todo el contenido de origen usuario (asunto de la
    // conversación, cuerpo del mensaje) usa el helper `{{e}}` — OBLIGATORIO en
    // el canal email (`noEscape:true`), donde `{{var}}` NO escaparía.

    // ───────────── conversation.created (email cliente) ─────────────
    {
      event_type: 'conversation.created',
      channel: 'email' as const,
      locale: 'es',
      semantic: 'info',
      subject: 'Hemos recibido tu consulta — "{{e subject}}"',
      body: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr>
          <td valign="middle" style="padding-right:13px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" valign="middle" width="44" height="44" bgcolor="{{email.tint}}" style="width:44px;height:44px;background:{{email.tint}};border-radius:12px"><img src="{{app_url}}/brand/email/status-info.png" width="21" height="21" alt="" style="display:block;border:0"></td></tr></table></td>
          <td valign="middle"><div style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.3;color:{{email.fg}}">Consulta recibida</div><div style="font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;color:#94A3B8;margin-top:2px">{{e channel}}</div></td>
        </tr></table>
        <h1 style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:#0F172A">Hemos recibido tu consulta</h1>
        <p style="margin:0 0 22px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Hola{{#if recipient.first_name}} {{e recipient.first_name}}{{/if}}, tu consulta ya está con nuestro equipo. La revisaremos lo antes posible y te responderemos desde tu panel de soporte.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;border:1px solid #E6ECF3;border-radius:12px;border-collapse:separate;border-spacing:0;background:#F8FAFF"><tr><td style="padding:18px 22px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="padding:7px 0;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;color:#64748B">Asunto</td><td align="right" style="padding:7px 0;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;font-weight:600;color:#0F172A">{{e subject}}</td></tr>
          <tr><td style="padding:7px 0;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;color:#64748B">Canal</td><td align="right" style="padding:7px 0;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;font-weight:600;color:#0F172A">{{e channel}}</td></tr>
        </table></td></tr></table>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 6px"><tr><td align="center" bgcolor="#3B82F6" style="border-radius:11px;background:#3B82F6"><a href="{{support_url}}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:11px">Ver mi conversación</a></td></tr></table>
        <p style="margin:0 0 4px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:13.5px;line-height:1.6;color:#94A3B8;text-align:center">Te avisamos por correo en cuanto haya respuesta.</p>
      `.trim(),
      variables: {
        subject: 'string',
        channel: 'string',
        support_url: 'string',
        'recipient.first_name': 'string?',
      },
    },

    // ───────────── conversation.created (campana cliente) ─────────────
    {
      event_type: 'conversation.created',
      channel: 'internal' as const,
      locale: 'es',
      subject: 'Consulta recibida',
      body: 'Hemos recibido tu consulta "{{e subject}}". Te avisaremos cuando haya respuesta.',
      variables: { subject: 'string' },
    },

    // ───────────── message.created (email cliente — respuesta del agente) ─────────────
    {
      event_type: 'message.created',
      channel: 'email' as const,
      locale: 'es',
      semantic: 'info',
      subject: 'Nueva respuesta en "{{e subject}}"',
      body: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr>
          <td valign="middle" style="padding-right:13px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" valign="middle" width="44" height="44" bgcolor="{{email.tint}}" style="width:44px;height:44px;background:{{email.tint}};border-radius:12px"><img src="{{app_url}}/brand/email/status-info.png" width="21" height="21" alt="" style="display:block;border:0"></td></tr></table></td>
          <td valign="middle"><div style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.3;color:{{email.fg}}">Nueva respuesta</div></td>
        </tr></table>
        <h1 style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:#0F172A">Tienes una nueva respuesta</h1>
        <p style="margin:0 0 18px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Hola{{#if recipient.first_name}} {{e recipient.first_name}}{{/if}}, has recibido una respuesta en tu conversación "<strong style="font-weight:600;color:#0F172A">{{e subject}}</strong>":</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px;border:1px solid #E6ECF3;border-radius:12px;border-collapse:separate;border-spacing:0;background:#F8FAFF"><tr><td style="padding:16px 20px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#334155;white-space:pre-line">{{e preview}}</td></tr></table>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 6px"><tr><td align="center" bgcolor="#3B82F6" style="border-radius:11px;background:#3B82F6"><a href="{{support_url}}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:11px">Ver conversación</a></td></tr></table>
        <p style="margin:0 0 4px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:13.5px;line-height:1.6;color:#94A3B8;text-align:center">Entra a tu panel para ver la conversación completa y responder.</p>
      `.trim(),
      variables: {
        subject: 'string',
        preview: 'string',
        support_url: 'string',
        'recipient.first_name': 'string?',
      },
    },

    // ───────────── message.created (campana cliente) ─────────────
    {
      event_type: 'message.created',
      channel: 'internal' as const,
      locale: 'es',
      subject: 'Nueva respuesta en soporte',
      body: 'Tienes una nueva respuesta en "{{e subject}}".',
      variables: { subject: 'string' },
    },

    // ───────────── conversation.assigned (email agente) ─────────────
    {
      event_type: 'conversation.assigned',
      channel: 'email' as const,
      locale: 'es',
      semantic: 'info',
      subject: 'Conversación asignada — "{{e subject}}"',
      body: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr>
          <td valign="middle" style="padding-right:13px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" valign="middle" width="44" height="44" bgcolor="{{email.tint}}" style="width:44px;height:44px;background:{{email.tint}};border-radius:12px"><img src="{{app_url}}/brand/email/status-info.png" width="21" height="21" alt="" style="display:block;border:0"></td></tr></table></td>
          <td valign="middle"><div style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.3;color:{{email.fg}}">Conversación asignada</div></td>
        </tr></table>
        <h1 style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:#0F172A">Se te ha asignado una conversación</h1>
        <p style="margin:0 0 26px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Hola{{#if recipient.first_name}} {{e recipient.first_name}}{{else}} agente{{/if}}, tienes una nueva conversación asignada: "<strong style="font-weight:600;color:#0F172A">{{e subject}}</strong>".</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 6px"><tr><td align="center" bgcolor="#3B82F6" style="border-radius:11px;background:#3B82F6"><a href="{{support_url}}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:11px">Abrir en el panel</a></td></tr></table>
        <p style="margin:0 0 4px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:13.5px;line-height:1.6;color:#94A3B8;text-align:center">Entra al panel de soporte para revisarla y responder.</p>
      `.trim(),
      variables: {
        subject: 'string',
        support_url: 'string',
        'recipient.first_name': 'string?',
      },
    },

    // ───────────── conversation.assigned (campana agente) ─────────────
    {
      event_type: 'conversation.assigned',
      channel: 'internal' as const,
      locale: 'es',
      subject: 'Conversación asignada',
      body: 'Se te ha asignado la conversación "{{e subject}}".',
      variables: { subject: 'string' },
    },

    // ───────────── support_inside.technician_assigned (campana técnico) ─────────────
    // F3·E8 — notificación informativa (sin acción): el agente pasa a ser el
    // "técnico asignado" (cuidador estable) de un cliente Support Inside. La
    // tarea de mantenimiento mensual (lo accionable) la crea el cron aparte.
    {
      event_type: 'support_inside.technician_assigned',
      channel: 'internal' as const,
      locale: 'es',
      subject: 'Nuevo cliente asignado',
      body: 'Ahora eres el técnico de mantenimiento de {{e client_name}}.',
      variables: { client_name: 'string' },
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
      semantic: 'danger',
      subject: 'Outbox event failed: {{event_type}}',
      body: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr>
          <td valign="middle" style="padding-right:13px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" valign="middle" width="44" height="44" bgcolor="{{email.tint}}" style="width:44px;height:44px;background:{{email.tint}};border-radius:12px"><img src="{{app_url}}/brand/email/status-danger.png" width="21" height="21" alt="" style="display:block;border:0"></td></tr></table></td>
          <td valign="middle"><div style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.3;color:{{email.fg}}">Outbox event failed</div><div style="font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;color:#94A3B8;margin-top:2px">{{e event_type}}</div></td>
        </tr></table>
        <h1 style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:#0F172A">Evento de Outbox fallido</h1>
        <p style="margin:0 0 18px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">El evento ha agotado {{retry_count}} reintentos y requiere revisión manual.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;border:1px solid #E6ECF3;border-radius:12px;border-collapse:separate;border-spacing:0;background:#F8FAFF"><tr><td style="padding:14px 16px;font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;line-height:1.7;color:#334155;white-space:pre-wrap">id: {{event_outbox_id}}
event_type: {{e event_type}}
retry_count: {{retry_count}}
last_error: {{e last_error}}</td></tr></table>
        <p style="margin:0 0 4px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;line-height:1.6;color:#64748B">Revisa la fila en <code style="font-family:'DM Mono',ui-monospace,Menlo,monospace">event_outbox</code> y, si procede, vuelve a marcarla como <code style="font-family:'DM Mono',ui-monospace,Menlo,monospace">pending</code> tras corregir el listener fallido.</p>
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
      semantic: 'warning',
      subject: 'Job en DLQ: {{queue}}/{{name}}',
      body: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr>
          <td valign="middle" style="padding-right:13px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" valign="middle" width="44" height="44" bgcolor="{{email.tint}}" style="width:44px;height:44px;background:{{email.tint}};border-radius:12px"><img src="{{app_url}}/brand/email/status-warning.png" width="21" height="21" alt="" style="display:block;border:0"></td></tr></table></td>
          <td valign="middle"><div style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.3;color:{{email.fg}}">Job en DLQ</div><div style="font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;color:#94A3B8;margin-top:2px">{{e queue}} / {{e name}}</div></td>
        </tr></table>
        <h1 style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:#0F172A">Job en la cola de fallos (DLQ)</h1>
        <p style="margin:0 0 18px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">El job ha agotado {{attempts_made}} reintentos y entró en la cola de fallos.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;border:1px solid #E6ECF3;border-radius:12px;border-collapse:separate;border-spacing:0;background:#F8FAFF"><tr><td style="padding:14px 16px;font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;line-height:1.7;color:#334155;white-space:pre-wrap">failed_job_id: {{failed_job_id}}
queue: {{e queue}}
name: {{e name}}
attempts_made: {{attempts_made}}
last_error: {{e last_error}}</td></tr></table>
        <p style="margin:0 0 4px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;line-height:1.6;color:#64748B">Revisa la fila en <code style="font-family:'DM Mono',ui-monospace,Menlo,monospace">failed_jobs</code> y reintenta manualmente desde el panel admin.</p>
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
      semantic: 'danger',
      subject: 'Tarea vencida — {{task_source_system_label}}',
      body: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr>
          <td valign="middle" style="padding-right:13px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" valign="middle" width="44" height="44" bgcolor="{{email.tint}}" style="width:44px;height:44px;background:{{email.tint}};border-radius:12px"><img src="{{app_url}}/brand/email/status-danger.png" width="21" height="21" alt="" style="display:block;border:0"></td></tr></table></td>
          <td valign="middle"><div style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.3;color:{{email.fg}}">Tarea vencida</div><div style="font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;color:#94A3B8;margin-top:2px">{{task_source_system_label}} · Prioridad {{task_priority_label}}</div></td>
        </tr></table>
        <h1 style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:#0F172A">Tarea vencida</h1>
        <p style="margin:0 0 22px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Hola {{#if recipient.first_name}}{{e recipient.first_name}}{{else}}agente{{/if}}, la tarea <strong style="font-weight:600;color:#0F172A">{{task_source_system_label}}</strong> superó su fecha límite por más de {{days_overdue}} días y se marcó automáticamente como <strong style="font-weight:600;color:#0F172A">no completada a tiempo</strong>.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;border:1px solid #E6ECF3;border-radius:12px;border-collapse:separate;border-spacing:0;background:#F8FAFF"><tr><td style="padding:18px 22px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="padding:7px 0;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;color:#64748B">Tipo</td><td align="right" style="padding:7px 0;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;font-weight:600;color:#0F172A">{{task_source_system_label}}</td></tr>
          <tr><td style="padding:7px 0;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;color:#64748B">Prioridad</td><td align="right" style="padding:7px 0;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;font-weight:600;color:#0F172A">{{task_priority_label}}</td></tr>
          <tr><td style="padding:7px 0;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;color:#64748B">Vencía</td><td align="right" style="padding:7px 0;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;font-weight:600;color:#0F172A">{{due_date_label}}</td></tr>
          <tr><td style="padding:7px 0;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;color:#64748B">Días vencida</td><td align="right" style="padding:7px 0;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;font-weight:700;color:{{email.fg}}">{{days_overdue}}</td></tr>
        </table></td></tr></table>
        <p style="margin:0 0 22px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;line-height:1.6;color:#64748B">Está en estado terminal y no admite cambios. Para retomar el trabajo, crea una tarea nueva (auditabilidad, ADR-041).</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 6px"><tr><td align="center" bgcolor="#3B82F6" style="border-radius:11px;background:#3B82F6"><a href="{{task_url}}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:11px">Ver tarea</a></td></tr></table>
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
      semantic: 'warning',
      subject: '{{total}} tarea(s) sin asignar fuera de SLA',
      body: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr>
          <td valign="middle" style="padding-right:13px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" valign="middle" width="44" height="44" bgcolor="{{email.tint}}" style="width:44px;height:44px;background:{{email.tint}};border-radius:12px"><img src="{{app_url}}/brand/email/status-warning.png" width="21" height="21" alt="" style="display:block;border:0"></td></tr></table></td>
          <td valign="middle"><div style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.3;color:{{email.fg}}">Cola pública fuera de SLA</div><div style="font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;color:#94A3B8;margin-top:2px">{{total}} sin asignar</div></td>
        </tr></table>
        <h1 style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:#0F172A">{{total}} tarea(s) sin asignar fuera de SLA</h1>
        <p style="margin:0 0 18px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Las siguientes tareas llevan demasiado tiempo en la cola pública sin tomarse. La más antigua espera desde hace {{oldest_age_hours}} h.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;border:1px solid #E6ECF3;border-radius:12px;border-collapse:separate;border-spacing:0;background:#F8FAFF"><tr><td style="padding:14px 16px;font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;line-height:1.7;color:#334155;white-space:pre-wrap">{{e summary}}</td></tr></table>
        <p style="margin:0 0 4px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;line-height:1.6;color:#64748B">Reasigna desde /admin/tasks?scope=unassigned o revisa si la cola crece de forma sistemática (capacidad de equipo, ADR-072).</p>
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
      semantic: 'danger',
      subject: '{{total}} servicio(s) sin mantenimiento crítico',
      body: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr>
          <td valign="middle" style="padding-right:13px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" valign="middle" width="44" height="44" bgcolor="{{email.tint}}" style="width:44px;height:44px;background:{{email.tint}};border-radius:12px"><img src="{{app_url}}/brand/email/status-danger.png" width="21" height="21" alt="" style="display:block;border:0"></td></tr></table></td>
          <td valign="middle"><div style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.3;color:{{email.fg}}">Mantenimiento crítico</div><div style="font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;color:#94A3B8;margin-top:2px">{{total}} servicio(s) · >{{threshold_days}}d</div></td>
        </tr></table>
        <h1 style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:#0F172A">{{total}} servicio(s) sin mantenimiento</h1>
        <p style="margin:0 0 18px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Los siguientes servicios activos con checklist contratado llevan más de {{threshold_days}} días sin un mantenimiento registrado.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;border:1px solid #E6ECF3;border-radius:12px;border-collapse:separate;border-spacing:0;background:#F8FAFF"><tr><td style="padding:14px 16px;font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;line-height:1.7;color:#334155;white-space:pre-wrap">{{e summary}}</td></tr></table>
        <p style="margin:0 0 4px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;line-height:1.6;color:#64748B">Programa un mantenimiento urgente para los servicios listados o revisa si siguen activos en producción.</p>
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
      semantic: 'danger',
      subject: 'Sesión comprometida ({{attacked_user_email}})',
      body: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr>
          <td valign="middle" style="padding-right:13px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" valign="middle" width="44" height="44" bgcolor="{{email.tint}}" style="width:44px;height:44px;background:{{email.tint}};border-radius:12px"><img src="{{app_url}}/brand/email/status-danger.png" width="21" height="21" alt="" style="display:block;border:0"></td></tr></table></td>
          <td valign="middle"><div style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.3;color:{{email.fg}}">Sesión comprometida</div><div style="font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;color:#94A3B8;margin-top:2px">Auth · replay de refresh token</div></td>
        </tr></table>
        <h1 style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:#0F172A">Sesión comprometida</h1>
        <p style="margin:0 0 18px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Se ha detectado el reuso de un refresh token ya canjeado. Por seguridad, todas las sesiones del usuario afectado se han revocado y se le pedirá iniciar sesión de nuevo.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;border:1px solid #E6ECF3;border-radius:12px;border-collapse:separate;border-spacing:0;background:#F8FAFF"><tr><td style="padding:14px 16px;font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;line-height:1.7;color:#334155;white-space:pre-wrap">usuario_email: {{e attacked_user_email}}
user_id: {{user_id}}
session_id: {{session_id}}
ip_atacante: {{e ip}}
intento_replay: {{attempted_at}}
canje_legitimo_original: {{original_used_at}}
sesiones_revocadas: {{revoked_sessions_count}}</td></tr></table>
        <p style="margin:0 0 4px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;line-height:1.6;color:#64748B">Acción: contacta al usuario por un canal externo para confirmar si reconoce la actividad. Si no la reconoce, resetea su contraseña (forgot-password) y revisa los accesos en <code style="font-family:'DM Mono',ui-monospace,Menlo,monospace">/admin/error-log</code>.</p>
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
      semantic: 'warning',
      subject: 'Plugin {{plugin_slug}} caído ({{operation}})',
      body: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr>
          <td valign="middle" style="padding-right:13px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" valign="middle" width="44" height="44" bgcolor="{{email.tint}}" style="width:44px;height:44px;background:{{email.tint}};border-radius:12px"><img src="{{app_url}}/brand/email/status-warning.png" width="21" height="21" alt="" style="display:block;border:0"></td></tr></table></td>
          <td valign="middle"><div style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.3;color:{{email.fg}}">Plugin caído</div><div style="font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;color:#94A3B8;margin-top:2px">{{e plugin_slug}} · circuito abierto</div></td>
        </tr></table>
        <h1 style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:#0F172A">Plugin caído — circuito abierto</h1>
        <p style="margin:0 0 18px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">El proveedor del plugin <strong style="font-weight:600;color:#0F172A">{{e plugin_slug}}</strong> ha fallado repetidamente. El circuit breaker abrió la operación <strong style="font-weight:600;color:#0F172A">{{e operation}}</strong> para no saturar al proveedor mientras se recupera. Las lecturas servirán un fallback "unknown" desde cache; las acciones inline fallarán hasta que el circuito vuelva a cerrarse.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;border:1px solid #E6ECF3;border-radius:12px;border-collapse:separate;border-spacing:0;background:#F8FAFF"><tr><td style="padding:14px 16px;font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;line-height:1.7;color:#334155;white-space:pre-wrap">plugin_slug: {{e plugin_slug}}
operation: {{e operation}}
breaker_name: {{breaker_name}}
opened_at: {{opened_at}}
failure_count: {{failure_count}}
last_error_code: {{last_error_code}}
reset_timeout_ms: {{reset_timeout_ms}}</td></tr></table>
        <p style="margin:0 0 4px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;line-height:1.6;color:#64748B">Acción: revisa la API del proveedor y los logs en <code style="font-family:'DM Mono',ui-monospace,Menlo,monospace">/admin/error-log</code>. Si la caída persiste, deshabilita el plugin desde <code style="font-family:'DM Mono',ui-monospace,Menlo,monospace">/admin/settings/plugins</code>.</p>
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
      semantic: 'danger',
      subject: 'Error operativo en {{module}}',
      body: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr>
          <td valign="middle" style="padding-right:13px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" valign="middle" width="44" height="44" bgcolor="{{email.tint}}" style="width:44px;height:44px;background:{{email.tint}};border-radius:12px"><img src="{{app_url}}/brand/email/status-danger.png" width="21" height="21" alt="" style="display:block;border:0"></td></tr></table></td>
          <td valign="middle"><div style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.3;color:{{email.fg}}">Error operativo</div><div style="font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;color:#94A3B8;margin-top:2px">{{e module}} · {{level}}</div></td>
        </tr></table>
        <h1 style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:#0F172A">Error operativo en {{e module}}</h1>
        <p style="margin:0 0 18px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">{{e message}}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;border:1px solid #E6ECF3;border-radius:12px;border-collapse:separate;border-spacing:0;background:#F8FAFF"><tr><td style="padding:14px 16px;font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;line-height:1.7;color:#334155;white-space:pre-wrap">error_log_id: {{error_log_id}}
module: {{e module}}
level: {{level}}{{#if correlation_id}}
correlation_id: {{e correlation_id}}{{/if}}</td></tr></table>
        <p style="margin:0 0 4px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;line-height:1.6;color:#64748B">Revisa el detalle completo (incluido el stack trace si aplica) en <code style="font-family:'DM Mono',ui-monospace,Menlo,monospace">/admin/error-log</code> y márcalo como resuelto cuando proceda.</p>
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
    // EC-T8-17 + GL-25: en email `{{var}}` NO escapa (noEscape:true) → usa
    // `{{e var}}` para contenido de usuario. NUNCA triple-stash ni
    // ampersand-stash unescaped. El test guard
    // `notification-templates.security.spec.ts` falla el build si
    // introducimos un patrón unsafe.
    {
      event_type: 'service.password_reset',
      channel: 'email' as const,
      locale: 'es',
      semantic: 'info',
      subject: 'Tu contraseña ha sido restablecida — {{domain}}',
      body: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr>
          <td valign="middle" style="padding-right:13px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" valign="middle" width="44" height="44" bgcolor="{{email.tint}}" style="width:44px;height:44px;background:{{email.tint}};border-radius:12px"><img src="{{app_url}}/brand/email/status-info.png" width="21" height="21" alt="" style="display:block;border:0"></td></tr></table></td>
          <td valign="middle"><div style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.3;color:{{email.fg}}">Contraseña restablecida</div><div style="font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;color:#94A3B8;margin-top:2px">{{e domain}}</div></td>
        </tr></table>
        <h1 style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:#0F172A">Contraseña restablecida</h1>
        <p style="margin:0 0 18px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Hola{{#if recipient.first_name}} {{e recipient.first_name}}{{/if}}, hemos restablecido la contraseña de tu cuenta para el servicio <strong style="font-weight:600;color:#0F172A">{{e domain}}</strong>. Esta es tu nueva contraseña temporal:</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;border:1px solid #E6ECF3;border-radius:12px;border-collapse:separate;border-spacing:0;background:#F8FAFF"><tr><td align="center" style="padding:18px 20px;font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:18px;font-weight:600;letter-spacing:1px;color:#0F172A;word-break:break-all">{{e new_password}}</td></tr></table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;border-collapse:separate;border-spacing:0"><tr><td bgcolor="#FFFBEB" style="background:#FFFBEB;border:1px solid #F59E0B33;border-radius:12px;padding:15px 17px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;line-height:1.55;color:#B45309"><strong style="font-weight:600">Cámbiala al iniciar sesión por primera vez.</strong> Es temporal — no la reutilices en otros servicios.</td></tr></table>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 6px"><tr><td align="center" bgcolor="#3B82F6" style="border-radius:11px;background:#3B82F6"><a href="{{panel_url}}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:11px">Ir a mi servicio</a></td></tr></table>
        <p style="margin:0 0 4px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:13.5px;line-height:1.6;color:#94A3B8;text-align:center">Si no solicitaste este cambio, contáctanos cuanto antes.</p>
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
    // EC-T8-17 + GL-25: en email `{{var}}` NO escapa (noEscape:true) → usa
    // `{{e var}}` para contenido de usuario. NUNCA triple-stash. Ver cabecera.
    {
      event_type: 'service.cancelled',
      channel: 'email' as const,
      locale: 'es',
      semantic: 'info',
      subject: 'Tu servicio ha sido cancelado — {{domain}}',
      body: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr>
          <td valign="middle" style="padding-right:13px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" valign="middle" width="44" height="44" bgcolor="{{email.tint}}" style="width:44px;height:44px;background:{{email.tint}};border-radius:12px"><img src="{{app_url}}/brand/email/status-info.png" width="21" height="21" alt="" style="display:block;border:0"></td></tr></table></td>
          <td valign="middle"><div style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.3;color:{{email.fg}}">Servicio cancelado</div><div style="font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;color:#94A3B8;margin-top:2px">{{e domain}}</div></td>
        </tr></table>
        <h1 style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:#0F172A">Servicio cancelado</h1>
        <p style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Hola{{#if recipient.first_name}} {{e recipient.first_name}}{{/if}}, te confirmamos que el servicio <strong style="font-weight:600;color:#0F172A">{{e domain}}</strong> ha sido cancelado y ya no está activo.</p>
        <p style="margin:0 0 26px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Si crees que es un error, o quieres volver a contratar este u otro servicio, escríbenos — estamos para ayudarte.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 6px"><tr><td align="center" bgcolor="#3B82F6" style="border-radius:11px;background:#3B82F6"><a href="{{support_url}}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:11px">Contactar con soporte</a></td></tr></table>
        <p style="margin:0 0 4px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:13.5px;line-height:1.6;color:#94A3B8;text-align:center">Si necesitas recuperar datos de este servicio, contáctanos cuanto antes — algunos pueden no estar disponibles tras la cancelación.</p>
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

    // ───────────── service.cancellation_scheduled (email cliente — audit GL-2 / H2.3) ─────────────
    //
    // Emitido por `NotificationsOnServiceCancellationScheduledListener` cuando el
    // cron `ServiceLifecycleWorker.notifyUpcomingCancellations` detecta que un
    // servicio suspendido por impago está a `cancellation_notice_days` (default 7)
    // de la cancelación AUTOMÁTICA e IRREVERSIBLE (destruye el recurso en el
    // proveedor). Es un aviso previo (decisión GL-2 "destruir CON aviso"): el
    // cliente todavía puede evitarlo regularizando el pago. CTA principal a
    // facturación; soporte como secundario. Siempre se despacha (sin toggle).
    //
    // Variables:
    //   - service_id: UUID del servicio.
    //   - domain: domain del servicio (fallback domain → label → service_id).
    //   - cancellation_date: fecha humana (es-ES) en que se cancelará.
    //   - billing_url: URL absoluta a /dashboard/billing (CTA principal).
    //   - support_url: URL absoluta a /dashboard/support (CTA secundario).
    //   - recipient.first_name: opcional, añadido por el dispatcher.
    //
    // EC-T8-17 + GL-25: en email `{{var}}` NO escapa (noEscape:true) → usa
    // `{{e var}}` para contenido de usuario. NUNCA triple-stash. Ver cabecera.
    {
      event_type: 'service.cancellation_scheduled',
      channel: 'email' as const,
      locale: 'es',
      semantic: 'danger',
      subject: 'Tu servicio se cancelará pronto — {{domain}}',
      body: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr>
          <td valign="middle" style="padding-right:13px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" valign="middle" width="44" height="44" bgcolor="{{email.tint}}" style="width:44px;height:44px;background:{{email.tint}};border-radius:12px"><img src="{{app_url}}/brand/email/status-danger.png" width="21" height="21" alt="" style="display:block;border:0"></td></tr></table></td>
          <td valign="middle"><div style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.3;color:{{email.fg}}">Cancelación inminente</div><div style="font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;color:#94A3B8;margin-top:2px">{{e domain}}</div></td>
        </tr></table>
        <h1 style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:#0F172A">Tu servicio se cancelará pronto</h1>
        <p style="margin:0 0 18px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Hola{{#if recipient.first_name}} {{e recipient.first_name}}{{/if}}, el servicio <strong style="font-weight:600;color:#0F172A">{{e domain}}</strong> lleva un tiempo suspendido por un pago pendiente. Si no se regulariza, se cancelará automáticamente el <strong style="font-weight:600;color:#0F172A">{{cancellation_date}}</strong>.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;border-collapse:separate;border-spacing:0"><tr><td bgcolor="{{email.tint}}" style="background:{{email.tint}};border:1px solid {{email.accent}}33;border-radius:12px;padding:15px 17px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;line-height:1.55;color:{{email.fg}}">La cancelación es <strong style="font-weight:600">irreversible</strong>: el servicio y sus datos se eliminarán de forma permanente.</td></tr></table>
        <p style="margin:0 0 22px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Todavía estás a tiempo: regulariza el pago desde tu panel y el servicio volverá a estar activo.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 6px"><tr><td align="center" bgcolor="#3B82F6" style="border-radius:11px;background:#3B82F6"><a href="{{billing_url}}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:11px">Regularizar el pago</a></td></tr></table>
        <p style="margin:0 0 4px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:13.5px;line-height:1.6;color:#94A3B8;text-align:center">¿Dudas o crees que es un error? <a href="{{support_url}}" target="_blank" style="color:#3B82F6;text-decoration:none">Contáctanos</a> cuanto antes.</p>
      `.trim(),
      variables: {
        service_id: 'string',
        domain: 'string',
        cancellation_date: 'string',
        billing_url: 'string',
        support_url: 'string',
        'recipient.first_name': 'string?',
      },
    },
    // ───────────── service.cancellation_scheduled (campana cliente) ─────────────
    {
      event_type: 'service.cancellation_scheduled',
      channel: 'internal' as const,
      locale: 'es',
      subject: 'Tu servicio {{domain}} se cancelará el {{cancellation_date}}',
      body: 'El servicio {{domain}} se cancelará de forma irreversible el {{cancellation_date}} por un pago pendiente. Regulariza el pago desde tu panel para evitarlo.',
      variables: {
        service_id: 'string',
        domain: 'string',
        cancellation_date: 'string',
        billing_url: 'string',
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
    // EC-T8-17 + GL-25: en email `{{var}}` NO escapa (noEscape:true) → usa
    // `{{e var}}` para contenido de usuario. NUNCA triple-stash. Ver cabecera.
    {
      event_type: 'service.suspended',
      channel: 'email' as const,
      locale: 'es',
      semantic: 'warning',
      subject: 'Tu servicio ha sido suspendido — {{domain}}',
      body: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr>
          <td valign="middle" style="padding-right:13px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" valign="middle" width="44" height="44" bgcolor="{{email.tint}}" style="width:44px;height:44px;background:{{email.tint}};border-radius:12px"><img src="{{app_url}}/brand/email/status-warning.png" width="21" height="21" alt="" style="display:block;border:0"></td></tr></table></td>
          <td valign="middle"><div style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.3;color:{{email.fg}}">Servicio suspendido</div><div style="font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;color:#94A3B8;margin-top:2px">{{e domain}}</div></td>
        </tr></table>
        <h1 style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:#0F172A">Servicio suspendido</h1>
        <p style="margin:0 0 18px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Hola{{#if recipient.first_name}} {{e recipient.first_name}}{{/if}}, el servicio <strong style="font-weight:600;color:#0F172A">{{e domain}}</strong> ha sido suspendido temporalmente. Tus datos se conservan — la suspensión solo desactiva el acceso al servicio.</p>
        {{#if reason_label}}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;border-collapse:separate;border-spacing:0"><tr><td bgcolor="{{email.tint}}" style="background:{{email.tint}};border:1px solid {{email.accent}}33;border-radius:12px;padding:15px 17px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;line-height:1.55;color:{{email.fg}}"><strong style="font-weight:600">Motivo:</strong> {{reason_label}}</td></tr></table>
        {{/if}}
        {{#if is_overdue_payment}}
        <p style="margin:0 0 22px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Para reactivarlo, regulariza el pago pendiente desde tu panel. En cuanto lo registremos, volverá a estar activo.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 6px"><tr><td align="center" bgcolor="#3B82F6" style="border-radius:11px;background:#3B82F6"><a href="{{billing_url}}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:11px">Ir a facturación</a></td></tr></table>
        {{else}}
        {{#if is_maintenance}}
        <p style="margin:0 0 4px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Volverá a estar disponible automáticamente cuando finalice el mantenimiento programado. No necesitas hacer nada.</p>
        {{else}}
        <p style="margin:0 0 22px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Para más información sobre esta suspensión, contacta con nuestro equipo — estamos para ayudarte.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 6px"><tr><td align="center" bgcolor="#3B82F6" style="border-radius:11px;background:#3B82F6"><a href="{{support_url}}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:11px">Contactar con soporte</a></td></tr></table>
        {{/if}}
        {{/if}}
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
      semantic: 'success',
      subject: 'Tu servicio vuelve a estar activo — {{domain}}',
      body: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr>
          <td valign="middle" style="padding-right:13px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" valign="middle" width="44" height="44" bgcolor="{{email.tint}}" style="width:44px;height:44px;background:{{email.tint}};border-radius:12px"><img src="{{app_url}}/brand/email/status-success.png" width="21" height="21" alt="" style="display:block;border:0"></td></tr></table></td>
          <td valign="middle"><div style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.3;color:{{email.fg}}">Servicio reactivado</div><div style="font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;color:#94A3B8;margin-top:2px">{{e domain}}</div></td>
        </tr></table>
        <h1 style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:#0F172A">Tu servicio vuelve a estar activo</h1>
        <p style="margin:0 0 26px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Hola{{#if recipient.first_name}} {{e recipient.first_name}}{{/if}}, ¡buenas noticias! El servicio <strong style="font-weight:600;color:#0F172A">{{e domain}}</strong> vuelve a estar activo. Ya puedes usarlo con normalidad — tus datos se mantuvieron intactos durante la suspensión.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 6px"><tr><td align="center" bgcolor="#3B82F6" style="border-radius:11px;background:#3B82F6"><a href="{{panel_url}}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:11px">Ir a mi servicio</a></td></tr></table>
        <p style="margin:0 0 4px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:13.5px;line-height:1.6;color:#94A3B8;text-align:center">Gracias por tu paciencia.</p>
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
    // EC-T8-17 + GL-25: en email `{{var}}` NO escapa → usa `{{e var}}` para
    // contenido de usuario. `notification-templates.security.spec.ts` falla el
    // build si hay triple-stash o una var de usuario sin escapar.
    {
      event_type: 'service.quota_threshold_crossed',
      channel: 'email' as const,
      locale: 'es',
      semantic: 'warning',
      subject: 'Estás al {{used_pct}}% de almacenamiento en {{domain}}',
      body: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr>
          <td valign="middle" style="padding-right:13px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" valign="middle" width="44" height="44" bgcolor="{{email.tint}}" style="width:44px;height:44px;background:{{email.tint}};border-radius:12px"><img src="{{app_url}}/brand/email/status-warning.png" width="21" height="21" alt="" style="display:block;border:0"></td></tr></table></td>
          <td valign="middle"><div style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.3;color:{{email.fg}}">Almacenamiento casi al límite</div><div style="font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;color:#94A3B8;margin-top:2px">{{e domain}}</div></td>
        </tr></table>
        <h1 style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:#0F172A">Estás cerca del límite de almacenamiento</h1>
        <p style="margin:0 0 22px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Hola{{#if recipient.first_name}} {{e recipient.first_name}}{{/if}}, tu servicio <strong style="font-weight:600;color:#0F172A">{{e domain}}</strong> está al <strong style="font-weight:600;color:#0F172A">{{used_pct}}%</strong> de su cuota de almacenamiento. Si llega al 100%, dejará de aceptar nuevos archivos (subidas, copias, registros) hasta que liberes espacio o amplíes el plan.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;border:1px solid #E6ECF3;border-radius:12px;border-collapse:separate;border-spacing:0;background:#F8FAFF"><tr><td style="padding:18px 22px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="padding:7px 0;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;color:#64748B">Uso actual</td><td align="right" style="padding:7px 0;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;font-weight:600;color:#0F172A">{{used_mb_label}}</td></tr>
          <tr><td style="padding:7px 0;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;color:#64748B">Cuota total</td><td align="right" style="padding:7px 0;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;font-weight:600;color:#0F172A">{{total_mb_label}}</td></tr>
          <tr><td colspan="2" style="padding:12px 0 0"><div style="height:1px;background:#E6ECF3;margin-bottom:12px;font-size:0;line-height:0">&nbsp;</div></td></tr>
          <tr><td style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;font-weight:600;color:#0F172A">Porcentaje</td><td align="right" style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:18px;font-weight:700;letter-spacing:-0.01em;color:{{email.fg}}">{{used_pct}}%</td></tr>
        </table></td></tr></table>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 6px"><tr><td align="center" bgcolor="#3B82F6" style="border-radius:11px;background:#3B82F6"><a href="{{service_url}}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:11px">Ver detalles del servicio</a></td></tr></table>
        <p style="margin:0 0 4px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:13.5px;line-height:1.6;color:#94A3B8;text-align:center">¿Necesitas ayuda para liberar espacio o ampliar el plan? <a href="{{support_url}}" target="_blank" style="color:#3B82F6;text-decoration:none">Contáctanos</a>.</p>
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
      semantic: 'success',
      subject: 'Dominio renovado — {{fqdn}}',
      body: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr>
          <td valign="middle" style="padding-right:13px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" valign="middle" width="44" height="44" bgcolor="{{email.tint}}" style="width:44px;height:44px;background:{{email.tint}};border-radius:12px"><img src="{{app_url}}/brand/email/status-success.png" width="21" height="21" alt="" style="display:block;border:0"></td></tr></table></td>
          <td valign="middle"><div style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.3;color:{{email.fg}}">Dominio renovado</div><div style="font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;color:#94A3B8;margin-top:2px">{{e fqdn}}</div></td>
        </tr></table>
        <h1 style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:#0F172A">Dominio renovado</h1>
        <p style="margin:0 0 26px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Hola{{#if recipient.first_name}} {{e recipient.first_name}}{{/if}}, hemos renovado tu dominio <strong style="font-weight:600;color:#0F172A">{{e fqdn}}</strong>. Sigue activo sin interrupciones.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 6px"><tr><td align="center" bgcolor="#3B82F6" style="border-radius:11px;background:#3B82F6"><a href="{{panel_url}}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:11px">Ver mi dominio</a></td></tr></table>
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
      semantic: 'warning',
      subject: 'Tu dominio {{fqdn}} caduca en {{days_left}} días',
      body: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr>
          <td valign="middle" style="padding-right:13px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" valign="middle" width="44" height="44" bgcolor="{{email.tint}}" style="width:44px;height:44px;background:{{email.tint}};border-radius:12px"><img src="{{app_url}}/brand/email/status-warning.png" width="21" height="21" alt="" style="display:block;border:0"></td></tr></table></td>
          <td valign="middle"><div style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.3;color:{{email.fg}}">Caduca pronto</div><div style="font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;color:#94A3B8;margin-top:2px">{{e fqdn}}</div></td>
        </tr></table>
        <h1 style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:#0F172A">Tu dominio caduca pronto</h1>
        <p style="margin:0 0 26px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Hola{{#if recipient.first_name}} {{e recipient.first_name}}{{/if}}, tu dominio <strong style="font-weight:600;color:#0F172A">{{e fqdn}}</strong> caduca en <strong style="font-weight:600;color:#0F172A">{{days_left}} días</strong>. Renuévalo a tiempo para no perderlo.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 6px"><tr><td align="center" bgcolor="#3B82F6" style="border-radius:11px;background:#3B82F6"><a href="{{panel_url}}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:11px">Renovar dominio</a></td></tr></table>
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
      semantic: 'danger',
      subject: 'Tu dominio {{fqdn}} ha caducado',
      body: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr>
          <td valign="middle" style="padding-right:13px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" valign="middle" width="44" height="44" bgcolor="{{email.tint}}" style="width:44px;height:44px;background:{{email.tint}};border-radius:12px"><img src="{{app_url}}/brand/email/status-danger.png" width="21" height="21" alt="" style="display:block;border:0"></td></tr></table></td>
          <td valign="middle"><div style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.3;color:{{email.fg}}">Dominio caducado</div><div style="font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;color:#94A3B8;margin-top:2px">{{e fqdn}}</div></td>
        </tr></table>
        <h1 style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:#0F172A">Tu dominio ha caducado</h1>
        <p style="margin:0 0 26px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Hola{{#if recipient.first_name}} {{e recipient.first_name}}{{/if}}, tu dominio <strong style="font-weight:600;color:#0F172A">{{e fqdn}}</strong> ha caducado. Aún puedes recuperarlo durante un breve periodo de gracia — renuévalo cuanto antes.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 6px"><tr><td align="center" bgcolor="#3B82F6" style="border-radius:11px;background:#3B82F6"><a href="{{panel_url}}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:11px">Recuperar dominio</a></td></tr></table>
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
      semantic: 'danger',
      subject: 'Tu dominio {{fqdn}} está en periodo de redención',
      body: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr>
          <td valign="middle" style="padding-right:13px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" valign="middle" width="44" height="44" bgcolor="{{email.tint}}" style="width:44px;height:44px;background:{{email.tint}};border-radius:12px"><img src="{{app_url}}/brand/email/status-danger.png" width="21" height="21" alt="" style="display:block;border:0"></td></tr></table></td>
          <td valign="middle"><div style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.3;color:{{email.fg}}">En redención</div><div style="font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;color:#94A3B8;margin-top:2px">{{e fqdn}}</div></td>
        </tr></table>
        <h1 style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:#0F172A">Dominio en redención</h1>
        <p style="margin:0 0 26px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Hola{{#if recipient.first_name}} {{e recipient.first_name}}{{/if}}, tu dominio <strong style="font-weight:600;color:#0F172A">{{e fqdn}}</strong> ha entrado en periodo de redención. Todavía puede rescatarse, pero con una tarifa de recuperación más alta y por tiempo limitado. Contáctanos para recuperarlo.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 6px"><tr><td align="center" bgcolor="#3B82F6" style="border-radius:11px;background:#3B82F6"><a href="{{panel_url}}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:11px">Ver mi dominio</a></td></tr></table>
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

    // ───────────── domain.restored (email cliente) — Sprint 15D.II.R ─────────────
    {
      event_type: 'domain.restored',
      channel: 'email' as const,
      locale: 'es',
      semantic: 'success',
      subject: 'Dominio restaurado — {{fqdn}}',
      body: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr>
          <td valign="middle" style="padding-right:13px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" valign="middle" width="44" height="44" bgcolor="{{email.tint}}" style="width:44px;height:44px;background:{{email.tint}};border-radius:12px"><img src="{{app_url}}/brand/email/status-success.png" width="21" height="21" alt="" style="display:block;border:0"></td></tr></table></td>
          <td valign="middle"><div style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.3;color:{{email.fg}}">Dominio restaurado</div><div style="font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;color:#94A3B8;margin-top:2px">{{e fqdn}}</div></td>
        </tr></table>
        <h1 style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:#0F172A">Dominio restaurado</h1>
        <p style="margin:0 0 26px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Hola{{#if recipient.first_name}} {{e recipient.first_name}}{{/if}}, hemos recuperado tu dominio <strong style="font-weight:600;color:#0F172A">{{e fqdn}}</strong> desde el periodo de redención. Vuelve a estar activo. Te enviamos por separado la factura de la tarifa de restauración.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 6px"><tr><td align="center" bgcolor="#3B82F6" style="border-radius:11px;background:#3B82F6"><a href="{{panel_url}}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:11px">Ver mi dominio</a></td></tr></table>
      `.trim(),
      variables: {
        service_id: 'string',
        fqdn: 'string',
        panel_url: 'string',
        'recipient.first_name': 'string?',
      },
    },
    // ───────────── domain.restored (campana cliente) ─────────────
    {
      event_type: 'domain.restored',
      channel: 'internal' as const,
      locale: 'es',
      subject: 'Dominio restaurado — {{fqdn}}',
      body: 'Hemos recuperado tu dominio {{fqdn}} desde redención. Vuelve a estar activo; la tarifa de restauración se factura por separado.',
      variables: { service_id: 'string', fqdn: 'string', panel_url: 'string' },
    },

    // ═════════════ Sprint 15D.II.T3 — FSM de transfer-in (ADR-084 §5 + A2) ═════════════
    // Emitidos por: domain.transfer_initiated (orquestador, Outbox),
    // domain.transfer_completed (reconcile cron, Outbox),
    // domain.transfer_failed (reconcile cron, Outbox). Consumidos por
    // `NotificationsOnDomainTransferListener`. Variables: service_id, fqdn, panel_url
    // (detalle del dominio) + (failed: reason).

    // ───────────── domain.transfer_initiated (email cliente) ─────────────
    {
      event_type: 'domain.transfer_initiated',
      channel: 'email' as const,
      locale: 'es',
      semantic: 'info',
      subject: 'Transferencia iniciada — {{fqdn}}',
      body: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr>
          <td valign="middle" style="padding-right:13px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" valign="middle" width="44" height="44" bgcolor="{{email.tint}}" style="width:44px;height:44px;background:{{email.tint}};border-radius:12px"><img src="{{app_url}}/brand/email/status-info.png" width="21" height="21" alt="" style="display:block;border:0"></td></tr></table></td>
          <td valign="middle"><div style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.3;color:{{email.fg}}">Transferencia iniciada</div><div style="font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;color:#94A3B8;margin-top:2px">{{e fqdn}}</div></td>
        </tr></table>
        <h1 style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:#0F172A">Transferencia iniciada</h1>
        <p style="margin:0 0 26px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Hola{{#if recipient.first_name}} {{e recipient.first_name}}{{/if}}, hemos enviado al registrador la transferencia de <strong style="font-weight:600;color:#0F172A">{{e fqdn}}</strong>. Suele tardar 5–7 días; te avisaremos cuando se complete. No se te cobrará hasta entonces.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 6px"><tr><td align="center" bgcolor="#3B82F6" style="border-radius:11px;background:#3B82F6"><a href="{{panel_url}}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:11px">Ver el estado</a></td></tr></table>
      `.trim(),
      variables: {
        service_id: 'string',
        fqdn: 'string',
        panel_url: 'string',
        'recipient.first_name': 'string?',
      },
    },
    // ───────────── domain.transfer_initiated (campana cliente) ─────────────
    {
      event_type: 'domain.transfer_initiated',
      channel: 'internal' as const,
      locale: 'es',
      subject: 'Transferencia iniciada — {{fqdn}}',
      body: 'Hemos enviado al registrador la transferencia de {{fqdn}}. Suele tardar 5–7 días; te avisaremos al completarse.',
      variables: { service_id: 'string', fqdn: 'string', panel_url: 'string' },
    },

    // ───────────── domain.transfer_completed (email cliente) ─────────────
    {
      event_type: 'domain.transfer_completed',
      channel: 'email' as const,
      locale: 'es',
      semantic: 'success',
      subject: 'Dominio transferido — {{fqdn}}',
      body: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr>
          <td valign="middle" style="padding-right:13px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" valign="middle" width="44" height="44" bgcolor="{{email.tint}}" style="width:44px;height:44px;background:{{email.tint}};border-radius:12px"><img src="{{app_url}}/brand/email/status-success.png" width="21" height="21" alt="" style="display:block;border:0"></td></tr></table></td>
          <td valign="middle"><div style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.3;color:{{email.fg}}">Transferencia completada</div><div style="font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;color:#94A3B8;margin-top:2px">{{e fqdn}}</div></td>
        </tr></table>
        <h1 style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:#0F172A">Transferencia completada</h1>
        <p style="margin:0 0 26px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Hola{{#if recipient.first_name}} {{e recipient.first_name}}{{/if}}, ¡listo! <strong style="font-weight:600;color:#0F172A">{{e fqdn}}</strong> ya está gestionado por Aelium. Puedes administrar sus nameservers, privacidad y bloqueo desde tu panel.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 6px"><tr><td align="center" bgcolor="#3B82F6" style="border-radius:11px;background:#3B82F6"><a href="{{panel_url}}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:11px">Gestionar mi dominio</a></td></tr></table>
      `.trim(),
      variables: {
        service_id: 'string',
        fqdn: 'string',
        panel_url: 'string',
        'recipient.first_name': 'string?',
      },
    },
    // ───────────── domain.transfer_completed (campana cliente) ─────────────
    {
      event_type: 'domain.transfer_completed',
      channel: 'internal' as const,
      locale: 'es',
      subject: 'Dominio transferido — {{fqdn}}',
      body: '{{fqdn}} ya está gestionado por Aelium. Ya puedes administrarlo desde tu panel.',
      variables: { service_id: 'string', fqdn: 'string', panel_url: 'string' },
    },

    // ───────────── domain.transfer_failed (email cliente) ─────────────
    {
      event_type: 'domain.transfer_failed',
      channel: 'email' as const,
      locale: 'es',
      semantic: 'warning',
      subject: 'La transferencia de {{fqdn}} no se completó',
      body: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr>
          <td valign="middle" style="padding-right:13px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" valign="middle" width="44" height="44" bgcolor="{{email.tint}}" style="width:44px;height:44px;background:{{email.tint}};border-radius:12px"><img src="{{app_url}}/brand/email/status-warning.png" width="21" height="21" alt="" style="display:block;border:0"></td></tr></table></td>
          <td valign="middle"><div style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.3;color:{{email.fg}}">Transferencia no completada</div><div style="font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;color:#94A3B8;margin-top:2px">{{e fqdn}}</div></td>
        </tr></table>
        <h1 style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:#0F172A">Transferencia no completada</h1>
        <p style="margin:0 0 26px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Hola{{#if recipient.first_name}} {{e recipient.first_name}}{{/if}}, la transferencia de <strong style="font-weight:600;color:#0F172A">{{e fqdn}}</strong> no pudo completarse. Suele deberse al bloqueo de transferencia o a un código de autorización incorrecto en tu registrador actual. Revísalo y vuelve a intentarlo — no se te ha cobrado nada.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 6px"><tr><td align="center" bgcolor="#3B82F6" style="border-radius:11px;background:#3B82F6"><a href="{{panel_url}}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:11px">Reintentar transferencia</a></td></tr></table>
      `.trim(),
      variables: {
        service_id: 'string',
        fqdn: 'string',
        panel_url: 'string',
        reason: 'string?',
        'recipient.first_name': 'string?',
      },
    },
    // ───────────── domain.transfer_failed (campana cliente) ─────────────
    {
      event_type: 'domain.transfer_failed',
      channel: 'internal' as const,
      locale: 'es',
      subject: 'La transferencia de {{fqdn}} no se completó',
      body: 'La transferencia de {{fqdn}} no pudo completarse. Revisa el bloqueo y el código de autorización en tu registrador actual y reinténtalo — no se te ha cobrado nada.',
      variables: {
        service_id: 'string',
        fqdn: 'string',
        panel_url: 'string',
        reason: 'string?',
      },
    },

    // Sprint 15D Fase 15D.F.1 — alertas de SEGURIDAD de gestión del dominio
    // (cambio de nameservers / bloqueo de registrar). Emitidas por
    // `executeActionForUser` tras la inline action exitosa (Outbox, ADR-084 §5),
    // consumidas por `NotificationsOnDomainManagementListener`. Tono "verifica
    // que fuiste tú" — patrón estándar de registrar.

    // ───────────── domain.nameservers_changed (email cliente) ─────────────
    {
      event_type: 'domain.nameservers_changed',
      channel: 'email' as const,
      locale: 'es',
      semantic: 'warning',
      subject: 'Se han cambiado los nameservers de {{fqdn}}',
      body: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr>
          <td valign="middle" style="padding-right:13px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" valign="middle" width="44" height="44" bgcolor="{{email.tint}}" style="width:44px;height:44px;background:{{email.tint}};border-radius:12px"><img src="{{app_url}}/brand/email/status-warning.png" width="21" height="21" alt="" style="display:block;border:0"></td></tr></table></td>
          <td valign="middle"><div style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.3;color:{{email.fg}}">Nameservers actualizados</div><div style="font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;color:#94A3B8;margin-top:2px">{{e fqdn}}</div></td>
        </tr></table>
        <h1 style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:#0F172A">Nameservers actualizados</h1>
        <p style="margin:0 0 26px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Hola{{#if recipient.first_name}} {{e recipient.first_name}}{{/if}}, se han modificado los nameservers de tu dominio <strong style="font-weight:600;color:#0F172A">{{e fqdn}}</strong>. Si has sido tú, no necesitas hacer nada. Si no reconoces este cambio, revísalo cuanto antes y contáctanos.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 6px"><tr><td align="center" bgcolor="#3B82F6" style="border-radius:11px;background:#3B82F6"><a href="{{panel_url}}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:11px">Revisar mi dominio</a></td></tr></table>
      `.trim(),
      variables: {
        service_id: 'string',
        fqdn: 'string',
        panel_url: 'string',
        'recipient.first_name': 'string?',
      },
    },
    // ───────────── domain.nameservers_changed (campana cliente) ─────────────
    {
      event_type: 'domain.nameservers_changed',
      channel: 'internal' as const,
      locale: 'es',
      subject: 'Nameservers de {{fqdn}} actualizados',
      body: 'Se han modificado los nameservers de tu dominio {{fqdn}}. Si no reconoces este cambio, revísalo cuanto antes y contáctanos.',
      variables: { service_id: 'string', fqdn: 'string', panel_url: 'string' },
    },

    // ───────────── domain.lock_changed (email cliente) ─────────────
    {
      event_type: 'domain.lock_changed',
      channel: 'email' as const,
      locale: 'es',
      semantic: 'warning',
      subject: 'Se ha cambiado el bloqueo de transferencia de {{fqdn}}',
      body: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr>
          <td valign="middle" style="padding-right:13px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" valign="middle" width="44" height="44" bgcolor="{{email.tint}}" style="width:44px;height:44px;background:{{email.tint}};border-radius:12px"><img src="{{app_url}}/brand/email/status-warning.png" width="21" height="21" alt="" style="display:block;border:0"></td></tr></table></td>
          <td valign="middle"><div style="font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.3;color:{{email.fg}}">Bloqueo actualizado</div><div style="font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:12.5px;color:#94A3B8;margin-top:2px">{{e fqdn}}</div></td>
        </tr></table>
        <h1 style="margin:0 0 14px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:#0F172A">Bloqueo de transferencia actualizado</h1>
        <p style="margin:0 0 26px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.62;color:#334155">Hola{{#if recipient.first_name}} {{e recipient.first_name}}{{/if}}, se ha cambiado el bloqueo de transferencia (registrar lock) de tu dominio <strong style="font-weight:600;color:#0F172A">{{e fqdn}}</strong>. Este ajuste protege tu dominio frente a transferencias no autorizadas. Si no reconoces este cambio, revísalo cuanto antes y contáctanos.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 6px"><tr><td align="center" bgcolor="#3B82F6" style="border-radius:11px;background:#3B82F6"><a href="{{panel_url}}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:11px">Revisar mi dominio</a></td></tr></table>
      `.trim(),
      variables: {
        service_id: 'string',
        fqdn: 'string',
        panel_url: 'string',
        'recipient.first_name': 'string?',
      },
    },
    // ───────────── domain.lock_changed (campana cliente) ─────────────
    {
      event_type: 'domain.lock_changed',
      channel: 'internal' as const,
      locale: 'es',
      subject: 'Bloqueo de transferencia de {{fqdn}} actualizado',
      body: 'Se ha cambiado el bloqueo de transferencia de tu dominio {{fqdn}}. Si no reconoces este cambio, revísalo cuanto antes y contáctanos.',
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
