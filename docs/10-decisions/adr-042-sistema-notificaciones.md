# ADR-042 — Sistema de notificaciones internas (campana + multicanal)

> **Status:** Active (planificada — implementación Sprint 11)
> **Date:** 2026-04 (Sprint 11 plan) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §11
> **Domain:** cross-cutting

---

## Contexto

El dashboard genera muchas señales relevantes para el cliente y para el equipo:
- Facturas creadas / pagadas / fallidas / vencidas.
- Servicios provisionados / suspendidos / cancelados / fallidos.
- Mantenimientos completados o críticos.
- Tareas creadas / asignadas / vencidas.
- Tickets creados / respondidos / cerrados.
- Clientes registrados, WOW pendientes.

Si cada módulo gestiona su propio email + su propia campana + su propio Slack, el código se duplica, las plantillas se desincronizan, y el admin no tiene un único lugar para configurar qué llega por dónde.

Hace falta un **módulo de notifications** que escuche eventos cross-módulo y los despache por los canales configurados, con plantillas editables y respeto al plan del cliente.

---

## Decisión

### Principio fundamental

**Un evento → N canales.** Los módulos emiten eventos (R1). El módulo `notifications` los escucha y despacha por los canales activos. El módulo emisor **no sabe** cómo llega la notificación al destinatario — eso lo decide el plugin de canal.

```
módulo billing  ──emit──► invoice.paid ──► notifications listener
                                            │
                                            ├─► email plugin
                                            ├─► campana interna
                                            └─► (futuro: WhatsApp, Telegram, SMS)
```

### Eventos principales catalogados

```
invoice.created · invoice.paid · invoice.failed · invoice.overdue
service.provisioned · service.suspended · service.cancelled · service.failed
maintenance.completed · maintenance.critical
task.created · task.assigned · task.overdue
ticket.created · ticket.replied · ticket.closed
client.registered · client.wow_pending
```

(Catálogo vivo en `docs/20-modules/_events.md`.)

### Plantillas editables desde el dashboard

- El admin edita asunto y cuerpo de cada plantilla desde el dashboard (no toca código).
- Editor visual con **variables disponibles por evento** — el sistema las inyecta al renderizar.
  - Ejemplos: `{{client.name}}`, `{{service.name}}`, `{{invoice.amount}}`, `{{maintenance.notes}}`.
- El admin puede **activar/desactivar cada notificación por canal** (ej: `invoice.paid` por email sí, por campana no).
- El admin puede **crear notificaciones nuevas** asociadas a eventos existentes.
- Preview antes de guardar.

### Centro interno de notificaciones (campana)

- Campana con contador en la barra superior, **tanto para cliente como para agente/admin**.
- Las notificaciones del cliente son **espejo** de lo que recibiría por email — coherencia entre canales.
- Las notificaciones del agente/admin son **alertas operativas internas** (tarea asignada, error del sistema, etc.).
- Estados: `unread` · `read`.
- El **mismo evento** dispara email + campana simultáneamente (sin duplicación de lógica).

### Notificaciones críticas de mantenimiento

- X días antes de fin de mes, si una tarea de mantenimiento sigue `pending` → estado **crítico**.
- Notificación interna al agente asignado **y** al admin.
- X configurable en settings globales (`notifications.maintenance_critical_threshold_days`).

### Plugin de canal

Cada canal (email, campana, futuros) implementa una interfaz común. Patrón análogo a payment providers (ADR-031) y provisioners (ADR-021):

```typescript
interface NotificationChannelInterface {
  readonly name: string;     // 'email', 'in_app', 'whatsapp', ...
  readonly label: string;
  send(notification: Notification, recipient: Recipient): Promise<DeliveryResult>;
  isAvailableFor(recipient: Recipient): boolean;  // valida que el cliente tiene el canal
}
```

Cambiar el provider de email (Mailgun → SES → MailPit local) = cambiar el plugin sin tocar nada más.

### Retención de notificaciones internas

- Notificaciones leídas se conservan **90 días** (configurable, ADR-060).
- Vista de campana: máximo **50 más recientes**, botón "Ver más" para cargar histórico.
- Borrado automático tras 90 días via cron — no se conserva indefinidamente.

---

## Consecuencias

- ✅ **Ganamos:**
  - Punto único de configuración para el admin — qué llega, por dónde, con qué texto.
  - Eventos desacoplados: añadir canal nuevo (WhatsApp) = nuevo plugin sin tocar emisores.
  - Plantillas editables = el admin ajusta tono/copy sin pedir cambios técnicos.
  - Coherencia: campana y email cuentan la misma historia porque parten del mismo evento.
- ⚠️ **Aceptamos:**
  - Sin **Outbox Pattern** (ADR-033) en eventos críticos → riesgo de pérdida si el proceso muere entre commit y emit. **Crítico para `invoice.*`** — deuda actual.
  - Plantillas editables crean superficie para errores del admin (variable mal escrita = render vacío). Mitigación: validador de plantilla antes de guardar.
  - Retención 90 días puede ser insuficiente para compliance en algunos clientes — configurable.
- 🚪 **Cierra:**
  - **No notificaciones directas desde módulos de negocio.** Toda notificación pasa por el bus de eventos + listener de notifications.
  - **No plantillas hardcoded en código.** Si una plantilla nueva hace falta, se crea desde la UI (o seed inicial).

---

## Cuándo revisar

- Cuando se implemente Outbox (ADR-033) → eventos críticos (`invoice.paid`, `service.provisioned`) deben pasar por outbox antes de despachar notificaciones.
- Si el volumen de notificaciones supera capacidad del worker → mover a cola dedicada con prioridades.
- Si se añade un canal con quirks particulares (WhatsApp con plantillas pre-aprobadas, SMS con límite de caracteres) → revisar interfaz para soportar metadatos del plugin.

---

## Referencias

- **Módulos afectados:** notifications (productor), billing/services/tasks/tickets/clients (consumidores → emisores de eventos).
- **Reglas relacionadas:** R1 (módulos por eventos), R8 (Outbox para eventos críticos), R4 (plugins).
- **ADRs relacionados:** ADR-009 (estrategia plugins), ADR-031 (payment providers — patrón análogo), ADR-033 (Outbox pendiente — bloquea fiabilidad de notificaciones críticas), ADR-041 (tasks — productor de `task.*`), ADR-044 (settings — donde se configuran plantillas y canales).
- **Glosario:** [Notificación](../00-foundations/glossary.md), [Canal](../00-foundations/glossary.md), [Plantilla](../00-foundations/glossary.md).
- **Catálogo de eventos:** `docs/20-modules/_events.md`.
