# ADR-065 — `NotificationChannelInterface` + plugin pattern + plantillas editables

> **Status:** Active
> **Date:** 2026-04-27
> **Domain:** notifications, cross-cutting

---

## Contexto

[ADR-042](./adr-042-sistema-notificaciones.md) declaró que el dashboard tendría un módulo `notifications` central que escucha eventos cross-módulo y los despacha por canales activos (email, campana, futuros WhatsApp/SMS) con plantillas editables desde la UI. La declaración era a nivel arquitectónico — sin definir interfaces concretas ni mecanismo de render.

A 2026-04-27, el estado real es:

- **Stub `notifications/`** — `NotificationsModule`, `NotificationsController`, `NotificationsService` existen como esqueleto de 6 líneas con `// TODO`.
- **Tabla `notifications`** — ya en schema Prisma (campos `user_id`, `channel`, `title`, `body`, `read_at`, `metadata`). Suficiente para campana.
- **`core/email/EmailService`** — existe y funciona; lo invocan directamente `BillingEmailListener` y `TasksEmailListener` con plantillas inline (HTML hardcoded en código).
- **2 colas BullMQ activas tras Sprint 9 Fases A y B+C** — `pdf-generation` y `outbox-dispatch`. La infra está madura para añadir la tercera (`notifications-dispatch`).
- **2 eventos operativos huérfanos** desde Fases A y C — `dlq.job_failed` y `outbox.event_failed`. ADR-033 §7 los emite pero nadie los consume; el plan consistente es que `notifications-*` los consuman para alertar al superadmin (R7).

Sin un patrón canónico para canales:

- Cada listener emite emails a través de `EmailService` directamente, con HTML inline. Cambiar el copy de `invoice.paid` exige editar TypeScript y desplegar.
- La campana (in-app notifications) no existe — los emails llegan al cliente, pero el dashboard no muestra nada.
- Añadir WhatsApp / SMS / Slack futuro requeriría refactor masivo de cada listener.
- ADR-042 exige plantillas editables desde UI, pero hoy están en código.

Esta ADR formaliza **cómo se implementa ADR-042**: la interfaz de canal, el render de plantillas, el dispatcher centralizado, y los plugins concretos `EmailChannel` + `InAppChannel`.

> **¿Qué pasaría si NO tomáramos esta decisión?** Cada nueva notificación nace con HTML inline en el listener emisor. Cuando el admin pida cambiar el tono de los emails (P1.4 Sprint 14 inminente), hay que tocar código. Cuando se añada un canal futuro (WhatsApp para confirmaciones de pago), todos los listeners se modifican uno a uno. El módulo `notifications` queda en stub indefinidamente.

---

## Opciones consideradas

### A. Mecanismo de plantillas

1. **Mantener HTML inline en listeners**
   - Descartado: contradice ADR-042 §"Plantillas editables desde el dashboard".
2. **Plantillas en archivos del filesystem (`templates/billing/invoice-paid.hbs`)**
   - Pros: control de versiones; fácil de leer.
   - Contras: editar plantilla = redeploy. Contradice ADR-042 que exige UI editable.
3. **Plantillas en tabla Postgres (`notification_templates`) renderizadas con Handlebars** ✅ elegido
   - Pros: editable desde UI admin (Fase D 9.D.12 — diferida a Sprint 9.5 si tiempo lo aprieta); validador de variables; preview server-side; locale fallback nativo.
   - Contras: una migración con seed de plantillas iniciales. Aceptable.

### B. Motor de render

1. **Handlebars** ✅ elegido
   - Pros: estándar industria; sin lógica programable (limita escapes peligrosos); helpers extensibles; escape HTML por defecto en `{{var}}`; `{{{raw}}}` explícito si hace falta.
   - Contras: dependencia nueva (`handlebars` ~30 KB).
2. **Nunjucks / Pug / EJS**
   - Más potentes pero permiten lógica arbitraria → riesgo de plantillas con ifs anidados que el admin no puede revisar.
3. **String templating naive (`'{{x}}'.replace(...)`)**
   - Descartado: HTML escape manual, sin helpers, sin loops.

### C. Interfaz de canal

1. **Función plain `(notification, recipient) => Promise<void>`**
   - Pros: simple.
   - Contras: sin metadata estructural (`isAvailableFor`, `name`, `label`); difícil de testear en aislamiento.
2. **Interfaz TypeScript `NotificationChannelInterface` con providers Nest** ✅ elegido (alineado con ADR-042 §Plugin de canal y patrón análogo a payment providers ADR-031, provisioners ADR-021)
3. **Discriminated unions sobre payload `{ channel: 'email' | 'in_app', ... }`**
   - Descartado: no extensible sin tocar el tipo central; los plugins no pueden traer su propia config.

### D. ¿Quién decide qué canales se invocan para un evento?

1. **Hardcoded por evento** (ej: `invoice.paid` → email + in_app, siempre)
   - Descartado: ADR-042 exige que el admin active/desactive canales por evento.
2. **Lookup en `notification_templates` por `(event_type, channel, locale)`** ✅ elegido
   - Si existe template activa → ese canal se despacha. Si no → se omite.
   - Permite el admin "apagar" un canal para un evento simplemente desactivando su plantilla.
   - Locale fallback: `(event_type, channel, locale)` → `(event_type, channel, 'es')`.

### E. ¿Síncrono o async (BullMQ)?

1. **Síncrono — `dispatch()` espera a `channel.send()` antes de devolver**
   - Descartado: viola R2 (envío email = >200ms a SMTP externo).
2. **Encolar en `notifications-dispatch` cola BullMQ; el processor ejecuta canales** ✅ elegido
   - Coherente con Fases A-C. DLQ + retries automáticos para emails que rebotan.
3. **Híbrido — campana síncrona (insert local), email async**
   - Descartado: complica el flujo. La campana también va a la cola; insert Postgres es <10ms en local pero variable en prod.

### F. Idempotencia

1. **`jobId` por `(event_type, recipient_id, dispatch_at)`** — descartado: dos eventos del mismo tipo al mismo recipient en el mismo segundo (ej: doble click en "marcar pagada") deberían enviar 2 emails (son 2 acciones legítimas).
2. **Sin idempotencia en cola, con guard de aplicación si hace falta** ✅ elegido — el código emisor (BillingEmailListener, etc.) decide si dedup. Por defecto, una notificación = un email.

---

## Decisión

### A. Schema `notification_templates`

```prisma
model NotificationTemplate {
  id          String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  event_type  String              @db.VarChar(100)
  channel     NotificationChannel
  locale      String              @default("es") @db.VarChar(10)
  subject     String              @db.VarChar(300)   // emails: subject; in_app: title
  body        String              @db.Text          // emails: HTML; in_app: markdown/plain
  variables   Json                                   // {"client.name": "string", "invoice.amount": "number"}
  active      Boolean             @default(true)
  updated_by  String?             @db.Uuid
  created_at  DateTime            @default(now()) @db.Timestamptz()
  updated_at  DateTime            @updatedAt       @db.Timestamptz()
  @@unique([event_type, channel, locale])
  @@map("notification_templates")
}
```

`NotificationChannel` ya existe en schema (enum: `internal | email | whatsapp | push`).

### B. Interfaz `NotificationChannelInterface`

```typescript
// backend/src/modules/notifications/interfaces/notification-channel.interface.ts
import type { NotificationChannel as ChannelType } from '@prisma/client';

export interface NotificationRecipient {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  language: string | null;
}

export interface RenderedNotification {
  event_type: string;
  subject: string;
  body: string;
  metadata?: Record<string, unknown>;
}

export interface DeliveryResult {
  delivered: boolean;
  channel: ChannelType;
  message?: string;        // razón si delivered=false (ej. "user opted out")
  external_id?: string;    // SMTP message-id, in_app row id, futuro WhatsApp message-id
}

export interface NotificationChannelInterface {
  readonly name: ChannelType;
  readonly label: string;
  isAvailableFor(recipient: NotificationRecipient): boolean | Promise<boolean>;
  send(
    rendered: RenderedNotification,
    recipient: NotificationRecipient,
  ): Promise<DeliveryResult>;
}
```

Cada canal se inyecta como provider Nest con token `NOTIFICATION_CHANNELS` (multi-provider). El `NotificationsService` los recibe como array y selecciona los activos por `(event_type, channel)` consultando `notification_templates`.

### C. Plugins iniciales

#### `EmailChannel` (envuelve `core/email/EmailService`)

```typescript
@Injectable()
export class EmailChannel implements NotificationChannelInterface {
  readonly name = 'email' as const;
  readonly label = 'Email';
  constructor(private readonly emailService: EmailService) {}
  isAvailableFor(r: NotificationRecipient): boolean { return Boolean(r.email); }
  async send(rendered, recipient): Promise<DeliveryResult> { /* ... */ }
}
```

#### `InAppChannel` (campana — insert en `notifications`)

```typescript
@Injectable()
export class InAppChannel implements NotificationChannelInterface {
  readonly name = 'internal' as const;
  readonly label = 'Campana';
  constructor(private readonly prisma: PrismaService) {}
  isAvailableFor(): boolean { return true; }
  async send(rendered, recipient): Promise<DeliveryResult> {
    const row = await this.prisma.notification.create({
      data: {
        user_id: recipient.user_id,
        channel: 'internal',
        title: rendered.subject,
        body: rendered.body,
        metadata: rendered.metadata as Prisma.InputJsonValue | undefined,
      },
    });
    return { delivered: true, channel: 'internal', external_id: row.id };
  }
}
```

### D. `NotificationTemplateService` — render

```typescript
@Injectable()
export class NotificationTemplateService {
  async render(eventType: string, channel: ChannelType, locale: string,
              payload: Record<string, unknown>): Promise<RenderedNotification | null> {
    const tpl = await this.findTemplate(eventType, channel, locale);
    if (!tpl) return null;  // sin plantilla activa → canal omitido
    const subject = Handlebars.compile(tpl.subject, { noEscape: false })(payload);
    const body = Handlebars.compile(tpl.body, { noEscape: channel === 'email' })(payload);
    return { event_type: eventType, subject, body };
  }
  // Lookup con fallback locale → 'es'
  // Validador `validateVariables(template, declaredVariables)` (Sprint 9.5)
}
```

Para email, `noEscape: true` porque la plantilla es HTML curado por el admin. Para in_app, `noEscape: false` porque el cuerpo lo lee el frontend (escapado por React por defecto en JSX, pero la plantilla puede contener `<` que no queremos romper).

### E. `NotificationsService.dispatch()` — orquestador

```typescript
@Injectable()
export class NotificationsService {
  constructor(
    @InjectQueue('notifications-dispatch') private readonly queue: Queue,
  ) {}

  async dispatch(eventType: string, payload: Record<string, unknown>,
                 recipient: { user_id: string }): Promise<void> {
    await this.queue.add('dispatch-notification', { eventType, payload, recipient_id: recipient.user_id });
  }
}
```

El `NotificationsDispatchProcessor`:
1. Resuelve el `recipient` completo desde DB (`user_id` → email + nombre + locale).
2. Para cada canal disponible (`isAvailableFor(recipient)`):
   - `template = templateService.render(eventType, channel.name, recipient.language ?? 'es', payload)`
   - Si `template === null` → log debug y siguiente canal.
   - Si OK → `channel.send(template, recipient)`.
3. Si todas las entregas fallan → throw → BullMQ reintenta con backoff exponencial.
4. Si una entrega falla pero otra OK → log warning, no throw (otros canales recibieron).

### F. Listeners — quién emite

#### Refactor de listeners legacy (cierra deuda inline HTML)

- `BillingEmailListener` (4 `@OnEvent('invoice.*')`) → cada handler queda en una línea: `await notifications.dispatch('invoice.paid', payload, { user_id: payload.user_id })`. El HTML inline se mueve a la fila `notification_templates` correspondiente vía seed.
- `TasksEmailListener` (`@OnEvent('task.assigned')`) → idéntico patrón.

#### Listeners nuevos consumen huérfanos operativos

- `NotificationsOutboxListener` con `@OnEvent('outbox.event_failed')` — alerta superadmin (campana + email) con detalle del row Outbox que llegó a `failed`.
- `NotificationsDlqListener` con `@OnEvent('dlq.job_failed')` — alerta superadmin con detalle del job BullMQ en DLQ.

Ambos listeners resuelven dinámicamente el(los) `superadmin` desde la tabla `users WHERE role.slug = 'superadmin'` y emiten `dispatch()` para cada uno. Cumple R7 + cierra ADR-033 §7 + cierra ADR-055 §Monitoring (alerta DLQ).

### G. Convenio de plantillas seedeadas

| `event_type` | `channel` | Recipient | Subject | Body |
|--------------|-----------|-----------|---------|------|
| `invoice.created` | `email` | factura.user | "Factura {{invoice_number}} disponible" | HTML actual del listener (movido) |
| `invoice.paid` | `email` | factura.user | "✓ Pago confirmado — {{invoice_number}}" | HTML actual |
| `invoice.failed` | `email` | factura.user | "⚠ Cobro fallido — {{invoice_number}}" | HTML actual |
| `invoice.overdue` | `email` | factura.user | "Recordatorio: factura {{invoice_number}} vencida" | HTML actual |
| `invoice.paid` | `internal` | factura.user | "Pago confirmado" | "Tu factura {{invoice_number}} de {{total}} {{currency}} se ha pagado." |
| `task.assigned` | `email` | tarea.assignee | "Nueva tarea asignada" | HTML actual |
| `task.assigned` | `internal` | tarea.assignee | "Nueva tarea: {{task_title}}" | "Te ha sido asignada una tarea." |
| `outbox.event_failed` | `internal` | superadmin | "⚠ Outbox event failed" | "Evento {{event_type}} ({{event_outbox_id}}) falló tras {{retry_count}} reintentos: {{last_error}}" |
| `outbox.event_failed` | `email` | superadmin | "⚠ Aelium — Outbox event failed" | HTML con detalles |
| `dlq.job_failed` | `internal` | superadmin | "⚠ Job en DLQ" | "Job {{name}} en cola {{queue}} falló tras {{attempts_made}} intentos: {{last_error}}" |
| `dlq.job_failed` | `email` | superadmin | "⚠ Aelium — Job en DLQ" | HTML con detalles |

**Compatibilidad con el HTML actual:** la migración seedea las filas con el HTML exacto que hoy está inline en `BillingEmailListener` y `TasksEmailListener`, parametrizado con Handlebars. Los emails enviados antes y después del refactor son **byte-idéntico** — los tests E2E no detectan cambio.

### H. Cola `notifications-dispatch`

Hereda los defaults globales de `JobsModule` (`attempts=5`, backoff exponencial 30s→480s, `removeOnFail: false`). Cada despacho de evento → 1 job. Si un email rebota o el insert in_app falla, BullMQ reintenta. Tras 5 intentos → `failed_jobs` + emit `dlq.job_failed` (R7+R13).

`OnModuleInit` del processor registra la cola en `DlqService` y `RetryService` (consistente con `pdf-generation` y `outbox-dispatch`).

### I. Settings consumidos

Seedeados en Fase D (parte de 9.D.16 — pueden añadirse en Fase D MVP o en sub-sprint UX):

| Setting | Default | Consumidor |
|---------|---------|------------|
| `notifications.retention_days` | 90 | Cron limpieza notificaciones leídas (Sprint 9.5) |
| `notifications.unread_max_in_dropdown` | 50 | Frontend campana (Sprint 9.5) |
| `notifications.email_enabled_globally` | true | `EmailChannel.isAvailableFor()` — kill switch |
| `notifications.maintenance_critical_threshold_days` | 7 | Cron de tareas críticas (Sprint 8 Fase C — fuera de scope Sprint 9) |

### J. Regla canónica nueva (D-NN en `rules.md`)

> **`EmailService.send(...)` directo está prohibido fuera de `EmailChannel`.** Toda notificación cliente / agente / superadmin pasa por `NotificationsService.dispatch(eventType, payload, recipient)`. Cualquier nuevo `@OnEvent` que envíe email debe usar el dispatcher.

---

## Consecuencias

- ✅ **Ganamos:**
  - **Plantillas editables desde DB** — base lista para UI admin (diferida).
  - **Multicanal trivial** — añadir WhatsApp = nuevo plugin `WhatsAppChannel`, cero cambios en listeners emisores.
  - **Campana cliente y superadmin** — los huérfanos `outbox.event_failed` y `dlq.job_failed` quedan visibles a través de campana + email.
  - **Coherencia con ADR-031 (payment providers) y ADR-021 (provisioners)** — mismo patrón plugin.
  - **DLQ de notifications gratis** — un email rebotado entra en `failed_jobs` con audit trail (R13).
- ⚠️ **Aceptamos:**
  - **Migración Prisma con tabla nueva** + seed inicial de plantillas. Coste mediano (~10 filas de seed).
  - **HTML inline duplicado durante migración** — el commit de Fase D contiene tanto el listener legacy como el nuevo flujo. Se elimina el legacy en el mismo commit (no hay co-existencia). Los tests E2E de billing siguen verdes porque las plantillas seedean el HTML idéntico.
  - **Handlebars añade ~30 KB al bundle del backend.** Aceptable.
  - **UI admin de templates queda fuera de Fase D MVP** (diferida a Sprint 9.5). El admin no puede editar plantillas hasta entonces — sólo via SQL directo. Aceptable: el seed es suficiente para producción inicial.
- 🚪 **Cierra:**
  - **No `EmailService.send` directo en código nuevo.** Bloquea code review post Fase D.
  - **No HTML inline en `@OnEvent` listeners.** Toda plantilla vive en `notification_templates`.
  - **No notificaciones cross-módulo sin plantilla seedeada.** Plantilla nueva = mismo PR del listener nuevo.

---

## Cuándo revisar

- Cuando haya >50 plantillas activas — considerar particionado por dominio en lugar de tabla única.
- Cuando se añada un canal stateful (WhatsApp con plantillas pre-aprobadas que no aceptan free text) — extender el modelo con `metadata` propio del canal.
- Si `notifications-dispatch` cuello de botella >100 ev/s — particionar cola por canal o por dominio.
- Si el admin pide plantillas con lógica avanzada (loops, condicionales) — evaluar Nunjucks. Hoy Handlebars + helpers cubre 95% casos.

---

## Referencias

- **Módulos afectados:** `modules/notifications/` (implementación principal), `modules/billing/` (refactor `BillingEmailListener`), `modules/tasks/` (refactor `TasksEmailListener`), `core/email/` (queda como implementación interna del `EmailChannel`).
- **Reglas relacionadas:** [R1](../00-foundations/rules.md#r1--), [R2](../00-foundations/rules.md#r2--), [R7](../00-foundations/rules.md#r7--), [R13](../00-foundations/rules.md#r13--), nueva D-NN.
- **ADRs relacionados:** [ADR-042](./adr-042-sistema-notificaciones.md) (formaliza), [ADR-031](./adr-031-payment-providers.md) (patrón análogo plugin), [ADR-021](./adr-021-provisioners.md) (patrón análogo plugin), [ADR-033 §7](./adr-033-outbox-pattern-pendiente.md) (consumidor del huérfano `outbox.event_failed`), [ADR-055 §Monitoring](./adr-055-resiliencia-circuit-breaker.md) (consumidor del huérfano `dlq.job_failed`), [ADR-063](./adr-063-bullmq-canonico-dlq-retries.md) (cola `notifications-dispatch` hereda defaults).
- **Glosario:** [Notificación](../00-foundations/glossary.md), [Canal](../00-foundations/glossary.md), [Plantilla](../00-foundations/glossary.md).
- **Sprint que implementa:** [Sprint 9 Fase D](../60-roadmap/current.md#fase-d--notifications-full-cierra-adr-042).
