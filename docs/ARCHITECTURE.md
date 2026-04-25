# ARCHITECTURE.md — Aelium Dashboard
> Documento técnico de arquitectura.
> Lo lee el agente IA al inicio de cada sesión de desarrollo.
> Para el contexto completo de producto, ver DECISIONS.md.
> Para las normas de diseño e interfaz, ver DESIGN_SYSTEM.md.
> Versión 1.2 | Abril 2026

---

## QUÉ ES ESTE PROYECTO

Dashboard de billing, soporte y gestión de servicios para Aelium.
Operación en España. Uso interno exclusivo para un solo negocio.
Reemplaza WHMCS. No es un SaaS.

---

## STACK TECNOLÓGICO

```
Frontend:    Next.js 16 (App Router) · TypeScript · Tailwind CSS 4
             Aelium Design System (componentes propios en components/ui/)
Backend:     NestJS 11 · TypeScript · Prisma 7 (driver adapter PrismaPg)
Auth:        CASL (@casl/ability + @casl/prisma) · PBAC isomórfico
Base datos:  PostgreSQL 16 (self-hosted en Docker)
Cache:       Redis 7 (self-hosted en Docker)
Colas:       BullMQ (sobre Redis)
Tiempo real: Socket.io
Storage:     MinIO (S3-compatible, self-hosted en Docker)
Email:       nodemailer (MailPit en dev, SMTP configurable en prod)
Deploy:      Docker Compose en servidor propio · Traefik (reverse proxy + SSL)
Monitoring:  Grafana + Prometheus + Loki (self-hosted en Docker)
Logging:     pino (JSON estructurado)
```

---

## REGLAS QUE NUNCA SE ROMPEN

> **Documento canónico unificado:** las reglas R1–R16 (técnicas) y D1–D11 (UI)
> ahora viven en **[`docs/00-foundations/rules.md`](./00-foundations/rules.md)**.
> Esta sección se mantiene aquí por compatibilidad con referencias antiguas.
> Modificar en el documento canónico, no aquí.

El agente debe respetar estas reglas en cada línea de código que genere.
Si alguna instrucción de esta sesión contradice estas reglas, prevalecen estas reglas.

### Regla 1 — Comunicación entre módulos solo via eventos
Los módulos nunca se llaman directamente entre sí.
Toda comunicación es a través del bus de eventos interno (EventEmitter2 de NestJS).

```typescript
// ❌ INCORRECTO — llamada directa entre módulos
this.notificationsService.send(...)
this.provisioningService.activate(...)

// ✅ CORRECTO — emisión de evento
this.eventBus.emit('invoice.paid', { invoiceId, clientId, serviceId })
```

### Regla 2 — Todo proceso lento va a la cola BullMQ
Cualquier operación que tarde más de 200ms va a la cola. Nunca en el hilo principal.

```
VA A LA COLA SIEMPRE:
  provisioning de servicios
  llamadas a APIs externas (Stripe, Enhance CP, ResellerClub, Docker)
  envío de emails
  generación de PDFs
  ejecución de mantenimientos
  reintentos de cobro

RESPONDE INMEDIATO (hilo principal):
  cualquier lectura de datos
  login / logout
  navegación del dashboard
  abrir un chat
```

### Regla 3 — El audit log es inmutable
Las tablas del schema `audit` solo permiten INSERT.
Nunca UPDATE ni DELETE en ninguna tabla de audit.
Ni el superadmin tiene permisos de modificación sobre estas tablas.

### Regla 4 — Los plugins implementan su interfaz, el core no los conoce
El core llama a la interfaz. Nunca importa un plugin directamente.

```typescript
// ❌ INCORRECTO
import { StripePlugin } from '../plugins/payment/stripe'

// ✅ CORRECTO
import { PaymentPlugin } from '../core/interfaces/payment-plugin.interface'
// El plugin activo se inyecta via el sistema de plugins
```

### Regla 5 — Ninguna lógica de negocio en el frontend
El frontend solo muestra datos y llama a la API.
Nunca calcula precios, valida reglas de negocio, ni toma decisiones.

### Regla 6 — La API es stateless
Ningún estado de usuario o sesión se guarda en memoria del servidor.
Todo el estado vive en PostgreSQL y Redis.

### Regla 7 — Todos los errores se registran y notifican
Cualquier excepción en cualquier parte del sistema:
1. Se registra en `error_log` con todos los detalles técnicos.
2. Se notifica al superadmin via notificación interna inmediata.
3. Al cliente se muestra un mensaje elegante sin detalles técnicos.
El cliente nunca ve un stack trace ni un error en crudo.

### Regla 8 — Eventos críticos usan Outbox Pattern
Los eventos que disparan acciones entre módulos (invoice.paid, service.provisioned, etc.)
se persisten en la tabla `event_outbox` dentro de la misma transacción de base de datos.
Un worker los despacha y los marca como procesados. Si el proceso muere, el evento se reintenta.

```typescript
// ❌ INCORRECTO — emitir evento sin persistir
await this.invoiceRepo.save(invoice);
this.eventBus.emit('invoice.paid', payload);
// Si el proceso muere entre save y emit, el evento se pierde

// ✅ CORRECTO — persistir evento en la misma transacción
await this.dataSource.transaction(async (manager) => {
  await manager.save(Invoice, invoice);
  await manager.save(EventOutbox, {
    eventName: 'invoice.paid',
    payload: { invoiceId, clientId, serviceId },
  });
});
// El outbox worker lo despacha. Si muere, se reintenta.
```

### Regla 9 — Todo request lleva correlation ID
Cada request HTTP genera un `correlationId` único (UUID) que se propaga a todos los
módulos, eventos, y jobs de BullMQ que se disparen como consecuencia.
Todos los logs y registros de error incluyen el correlationId.

### Regla 10 — Rate limiting en todos los endpoints
Cada endpoint tiene un límite de requests por unidad de tiempo.
Los endpoints sensibles (login, registro, webhooks) tienen límites más restrictivos.
El rate limiting usa Redis como storage compartido entre instancias.

### Regla 11 — Circuit breaker en llamadas a APIs externas
Las llamadas a APIs externas (Stripe, Enhance CP, ResellerClub, Docker API) usan
circuit breaker. Si un servicio falla N veces consecutivas, el circuito se abre y
los intentos nuevos se rechazan inmediatamente hasta que el servicio se recupere.
Al abrirse un circuito, se notifica al superadmin.

### Regla 12 — Credenciales encriptadas con AES-256-GCM
Toda credencial almacenada (claves API, contraseñas de servidores, secrets) se encripta
con AES-256-GCM. La clave maestra vive en variable de entorno, nunca en la base de datos
ni en el código fuente.

### Regla 13 — Los jobs fallidos nunca desaparecen
Cuando un job de BullMQ agota todos sus reintentos, queda en estado `failed` en Redis.
Se genera una notificación al superadmin. El admin puede reintentar manualmente desde
el dashboard. Los jobs fallidos nunca se eliminan automáticamente.

### Regla 14 — Error handling visible en el frontend
El frontend NUNCA traga errores silenciosamente.
Todo `catch` muestra feedback visual al usuario:
- Errores de negocio → toast/banner con el mensaje del backend.
- Errores de red → "Error de conexión. Inténtalo de nuevo."
- HTTP 403 → Componente "Sin permisos".
- HTTP 401 → Redirect a login.
Nunca `catch {}` vacío. Nunca `console.log` como único handling.

```typescript
// ❌ INCORRECTO — error silenciado
try { await api.save(data); }
catch { /* handled */ }

// ✅ CORRECTO — feedback visible
try { await api.save(data); }
catch (err) {
  setError(err instanceof Error ? err.message : 'Error inesperado');
}
```

### Regla 15 — Límites de tamaño y responsabilidad única por archivo
Ningún archivo debe crecer sin control. Los límites son estrictos:

**Backend (NestJS):**
- **Service**: máximo **300 líneas**. Si supera este límite, dividir en sub-servicios por dominio (`ChatService`, `TicketService`, `QueryService`). El módulo principal re-exporta la API pública.
- **Controller**: máximo **200 líneas**. Un controller solo rutea y valida — la lógica vive en el service.
- **Gateway (WebSocket)**: máximo **250 líneas**. Handlers delegados a servicios.
- **Listener/Worker**: máximo **150 líneas**. Un listener = un evento o grupo cohesivo de eventos.

**Frontend (Next.js/React):**
- **Componente de UI**: máximo **200 líneas**. Si supera, extraer sub-componentes.
- **Página**: máximo **300 líneas**. Si supera, extraer secciones a componentes dedicados.
- **Custom hook**: máximo **150 líneas**. Un hook = una responsabilidad (ej: `useChatSocket`, `useConversations`).
- **Archivo de API**: máximo **400 líneas**. Si supera, dividir por dominio (`support-api.ts`, `billing-api.ts`).

**Regla de oro:** si necesitas scroll para entender qué hace un archivo, es demasiado grande.

```
Ejemplo de refactorización:

❌ INCORRECTO — support.service.ts (900+ líneas con todo)
  createChat(), createGuestChat(), createTicket(), escalate(),
  findAll(), findOne(), addMessage(), markAsRead(), getStats()

✅ CORRECTO — dividido por dominio
  support-chat.service.ts    → createChat(), createGuestChat(), linkGuest()
  support-ticket.service.ts  → createTicket(), escalate()
  support-query.service.ts   → findAll(), findOne(), getStats()
  support-message.service.ts → addMessage(), markAsRead()
```

### Regla 16 — Toda interfaz usa el Design System
Todo componente visual del frontend se construye exclusivamente con los componentes
de `frontend/app/components/ui/`. Nunca se crean botones, badges, cards, tablas,
modales o inputs ad-hoc en las páginas.

Las normas de diseño están en `DESIGN_SYSTEM.md`. La organización de las páginas
(anatomía, reglas de contenido, patrones de interacción) está en `UI_SPEC.md`.
Ambos documentos son de lectura obligatoria antes de crear cualquier interfaz nueva.

```
❌ INCORRECTO — botón ad-hoc en una página
<button
  className="bg-blue-500 text-white px-4 py-2 rounded"
  onClick={handleSave}
>
  Guardar
</button>

✅ CORRECTO — componente del Design System
import { Button } from '@/components/ui';
<Button variant="primary" onClick={handleSave}>Guardar</Button>
```

**Regla de oro:** si una página necesita un componente visual que no existe en `components/ui/`,
el componente se crea primero en la librería, se documenta en DESIGN_SYSTEM.md, y luego se usa.

---

## ESTRUCTURA DE CARPETAS

```
/
├── /backend                          ← NestJS API
│   ├── /src
│   │   ├── /modules                  ← lógica de negocio por dominio
│   │   │   ├── /auth
│   │   │   ├── /clients
│   │   │   ├── /billing
│   │   │   ├── /products
│   │   │   ├── /provisioning
│   │   │   ├── /support
│   │   │   ├── /tasks
│   │   │   ├── /notifications
│   │   │   ├── /audit
│   │   │   ├── /infrastructure
│   │   │   ├── /projects             ← proyectos y presupuestos (Sprint 22)
│   │   │   └── /partner              ← módulo partner (Fase 2)
│   │   │
│   │   ├── /plugins                  ← integraciones intercambiables
│   │   │   ├── /payment
│   │   │   │   ├── /stripe
│   │   │   │   └── /redsys           ← futuro
│   │   │   ├── /provisioners
│   │   │   │   ├── /enhance-cp
│   │   │   │   ├── /resellerclub
│   │   │   │   ├── /docker-engine
│   │   │   │   ├── /manual
│   │   │   │   └── /internal
│   │   │   ├── /notification-channels
│   │   │   │   ├── /email
│   │   │   │   └── /whatsapp         ← futuro
│   │   │   ├── /ai-providers
│   │   │       └── /claude
│   │   │   └── /ai-workers              ← agentes IA para tareas (Sprint 25, ver AI_WORKERS.md)
│   │   │       └── /openclaw
│   │   │
│   │   └── /core                     ← servicios compartidos del backend
│   │       ├── /database              ← PrismaService (PrismaPg driver adapter)
│   │       ├── /settings              ← SettingsService (config dinámica con cache)
│   │       ├── /email                 ← EmailService (nodemailer + plantillas)
│   │       ├── /events                ← bus de eventos
│   │       ├── /interfaces            ← contratos de plugins
│   │       ├── /config                ← configuración global
│   │       ├── /queue                 ← BullMQ setup
│   │       └── /common                ← middleware, filtros, utilidades
│   │
│   └── /templates                    ← plantillas Docker .yaml
│       ├── nextcloud-basic.yaml
│       ├── nextcloud-pro.yaml
│       └── ...
│
├── /frontend                         ← Next.js
│   ├── /app
│   │   ├── /(auth)                   ← login, registro, verificación
│   │   ├── /dashboard                ← área autenticada (layout con sidebar + topbar)
│   │   │   ├── /billing
│   │   │   ├── /clients
│   │   │   ├── /products
│   │   │   ├── /support
│   │   │   ├── /support/chats
│   │   │   └── /ds-preview           ← preview temporal del Design System
│   │   ├── /components
│   │   │   ├── /ui                   ← Aelium Design System (ver DESIGN_SYSTEM.md)
│   │   │   │   ├── /Button           ← .tsx + .module.css + index.ts
│   │   │   │   ├── /Badge
│   │   │   │   ├── /Card
│   │   │   │   ├── /Table
│   │   │   │   ├── /Modal
│   │   │   │   ├── /Toast
│   │   │   │   ├── /Input
│   │   │   │   ├── /Tabs
│   │   │   │   ├── /EmptyState
│   │   │   │   ├── /Skeleton
│   │   │   │   ├── /Avatar
│   │   │   │   ├── /StatusDot
│   │   │   │   ├── /Tooltip
│   │   │   │   ├── /Dropdown
│   │   │   │   └── index.ts          ← barrel export
│   │   │   └── /ChatWidget           ← widget flotante de chat para clientes
│   │   └── /globals.css              ← tokens de diseño (fuente única de verdad)
│   └── /lib                          ← llamadas a la API únicamente
│
├── /docs
│   ├── ARCHITECTURE.md               ← este archivo
│   ├── DECISIONS.md                  ← contexto completo de producto
│   ├── DESIGN_SYSTEM.md              ← normas de diseño y componentes UI
│   └── ROADMAP.md                    ← plan de ejecución
│
└── docker-compose.yml
```

---

## MÓDULOS DEL CORE

Cada módulo es responsable de su dominio. No entra en el dominio de otro.

### auth
**Responsabilidad:** autenticación, sesiones, 2FA, permisos por rol.
**Emite:** `auth.login` · `auth.logout` · `auth.2fa_verified` · `auth.session_expired`
**Escucha:** nada (es iniciador)

### clients
**Responsabilidad:** ficha del cliente, CRM, contexto del negocio, notas internas.
**Emite:** `client.created` · `client.updated` · `client.deletion_requested`
**Escucha:** nada (es fuente de datos, otros lo consultan)

### billing
**Responsabilidad:** facturas, suscripciones, ciclos de pago, reintentos de cobro, prorrateo.
No sabe qué pasa con el servicio tras el pago. No envía emails directamente.
**Emite:** `invoice.created` · `invoice.paid` · `invoice.failed` · `invoice.overdue` · `subscription.cancelled` · `subscription.suspended`
**Escucha:** nada (es iniciador del ciclo de facturación)

### products
**Responsabilidad:** catálogo de productos, configuración, pricing, categorías, extras.
Es la fuente de verdad sobre qué existe en el catálogo y cómo se comporta.
**Emite:** `product.created` · `product.updated` · `product.deactivated`
**Escucha:** nada

### provisioning
**Responsabilidad:** orquestar el ciclo de vida de los servicios del cliente.
Llama al plugin de provisioner correcto según el tipo de producto.
No sabe nada de facturación. Solo escucha eventos y ejecuta acciones.
**Emite:** `service.provisioned` · `service.suspended` · `service.cancelled` · `service.failed` · `service.reactivated`
**Escucha:** `invoice.paid` · `invoice.failed` · `subscription.suspended` · `subscription.cancelled`

### support
**Responsabilidad:** chat en tiempo real, conversaciones asíncronas, gestión de la atención al cliente.
**Emite:** `chat.started` · `chat.escalated` · `chat.closed` · `conversation.created` · `conversation.replied` · `conversation.closed`
**Escucha:** nada

### tasks
**Responsabilidad:** generación y gestión de tareas del equipo. Mantenimientos, WOW calls, tareas de proyecto.
**Emite:** `task.created` · `task.completed` · `task.overdue` · `maintenance.completed`
**Escucha:** `service.provisioned` (genera tarea WOW) · `invoice.paid` (si activa slot de mantenimiento) · `project.deposit_paid` (genera tareas del proyecto)

### projects
**Responsabilidad:** gestión del ciclo de vida de proyectos (propuestas y organizativos). Presupuestos, items, historial, depósitos.
**Emite:** `project.created` · `project.proposal_sent` · `project.accepted` · `project.deposit_paid` · `project.completed` · `project.paid` · `project.cancelled`
**Escucha:** `invoice.paid` (detecta pago de depósito o factura final)

### notifications
**Responsabilidad:** escuchar eventos del sistema y despachar notificaciones por los canales activos.
No genera contenido de negocio. Solo toma plantillas, inyecta variables, y despacha.
**Emite:** `notification.sent` · `notification.failed`
**Escucha:** todos los eventos relevantes del sistema

### audit
**Responsabilidad:** registrar de forma inmutable todos los accesos y cambios sobre datos de clientes.
No emite eventos. Solo recibe y escribe. Nunca bloquea el flujo principal (es asíncrono).
**Emite:** nada
**Escucha:** todos los eventos que implican acceso o modificación de datos de clientes

### infrastructure
**Responsabilidad:** registro y monitorización de servidores, pools de servidores por producto.
**Emite:** `server.capacity_warning` · `server.pool_full`
**Escucha:** `service.provisioned` · `service.cancelled` (para actualizar recursos usados)

### promotions
**Responsabilidad:** gestión de reglas de promoción (upsell/crossell), extras de producto, códigos de descuento.
Evalúa qué promociones aplican a un cliente según su contexto y el trigger activo.
No sabe cómo se cobra ni cómo se provisiona — solo aplica incentivos y genera los mensajes.
**Emite:** `promotion.triggered` · `promotion.accepted` · `promotion.dismissed`
**Escucha:** `service.provisioned` · `invoice.paid` · `client.created` (evalúa si aplica alguna regla)

### knowledge_base
**Responsabilidad:** base de conocimiento interna para los agentes IA y los agentes humanos.
Artículos técnicos · políticas · FAQs · notas de producto.
Solo el superadmin puede crear y editar contenido.
**Emite:** nada
**Escucha:** nada (es fuente de datos de solo lectura)

### partner
**Responsabilidad:** orquestar el ciclo de vida de la relación partner-cliente.
Gestionar comisiones, liquidaciones, comunicación partner↔cliente, y desvinculaciones.
Se construye en Fase 2 — después de que el core del dashboard esté funcional.
Ver documentación completa en PARTNER_ARCHITECTURE.md, PARTNER_DECISIONS.md, PARTNER_SCHEMA.md.
**Emite:** `partner.approved` · `partner.commission_generated` · `partner.payout_completed` · `partner.payout_failed` · `partner.client_unlinked` · `partner.unlink_escalated`
**Escucha:** `invoice.paid` (genera comisión si el cliente tiene partner_id) · `service.cancelled` (verifica si el cliente del partner se queda sin servicios)

### error_log
**Responsabilidad:** capturar, almacenar y notificar todos los errores del sistema.
Recibe excepciones de todos los módulos via el bus de eventos.
Nunca bloquea el flujo principal — es completamente asíncrono.
**Emite:** `error.critical` · `error.medium` · `error.low` (para notificaciones al superadmin)
**Escucha:** `system.error` (evento genérico que emite cualquier módulo al capturar una excepción)

---

## INTERFACES DE PLUGINS

Cada plugin debe implementar su interfaz completa.
El core nunca importa un plugin — siempre importa la interfaz.

### PaymentPlugin
```typescript
interface PaymentPlugin {
  charge(params: ChargeParams): Promise<ChargeResult>
  refund(transactionId: string, amount: number): Promise<RefundResult>
  createCustomer(email: string, name: string): Promise<{ customerId: string }>
}
```

### ProvisionerPlugin
```typescript
interface ProvisionerPlugin {
  provision(params: ProvisionParams): Promise<ProvisionResult>
  suspend(serviceId: string): Promise<void>
  reactivate(serviceId: string): Promise<void>
  terminate(serviceId: string): Promise<void>
  getStatus(serviceId: string): Promise<ServiceStatus>
}
```

### NotificationChannelPlugin
```typescript
interface NotificationChannelPlugin {
  send(params: NotificationParams): Promise<SendResult>
  isAvailable(): boolean
}
```

### AiProviderPlugin
```typescript
interface AiProviderPlugin {
  complete(prompt: string, context: ClientContext): Promise<string>
  isAvailable(): boolean
}
```

---

## SCHEMA DE BASE DE DATOS — ESTRUCTURA GENERAL

El schema completo vive en DATABASE_SCHEMA.md.
Esta sección describe la organización de schemas en PostgreSQL.

```
Schema: public          ← datos principales de la aplicación
Schema: audit           ← tablas de audit log (solo INSERT, nunca UPDATE/DELETE)
Schema: queue           ← tablas de BullMQ (gestionadas automáticamente)
```

### Tablas principales (schema public)

```
users                   ← todos los usuarios del sistema (clientes + agentes + admin)
roles                   ← definición de roles (slug enum)
sessions                ← sesiones activas (token_hash, refresh_hash, device)
email_verifications     ← tokens de verificación de email (hasheados SHA-256)
password_resets         ← tokens de reset de contraseña (hasheados SHA-256)

products                ← catálogo de productos
product_categories      ← categorías y subcategorías
product_extras          ← extras/upsell vinculados a productos
pricing_plans           ← planes de precio por producto

services                ← servicios contratados por clientes (instancias de productos)
service_slots           ← slots de Support Inside asignados a servicios
subscriptions           ← suscripciones activas

invoices                ← facturas
invoice_items           ← líneas de factura
payments                ← intentos de cobro y su resultado

servers                 ← servidores registrados
server_pools            ← relación servidor-producto (pools)
docker_templates        ← plantillas .yaml para provisioning Docker

conversations           ← hilos de comunicación (chat + asíncrono)
messages                ← mensajes dentro de conversaciones

tasks                   ← tareas del equipo
task_checklists         ← items de checklist por tarea
maintenance_logs        ← registro de mantenimientos completados

notifications           ← notificaciones internas (campana)
notification_templates  ← plantillas editables por evento

settings                ← configuración global del sistema (key-value)
integrations_registry   ← catálogo de descripciones de integraciones externas

billing_profiles        ← perfiles de facturación del cliente (puede tener varios)
client_consents         ← consentimientos de analíticas y privacidad por cliente

promotions              ← reglas de promoción (upsell/crossell)
promotion_views         ← registro de qué cliente ha visto qué promoción y cuántas veces
discount_codes          ← códigos de descuento configurables
discount_code_uses      ← registro de usos de códigos de descuento

knowledge_base_articles ← artículos de la base de conocimiento interna
knowledge_base_tags     ← etiquetas para organizar artículos

error_log               ← registro de todos los errores del sistema (todos los niveles)
event_outbox            ← eventos pendientes de despacho (Outbox Pattern)

partners                ← datos de agencias partner
partner_client_notes    ← notas inmutables del partner sobre sus clientes
partner_tickets         ← tickets del partner a sus clientes (bidireccional)
partner_ticket_messages ← mensajes dentro de tickets partner-cliente
partner_notifications   ← notificaciones unidireccionales del partner a clientes
partner_commissions     ← comisiones generadas al cobrar facturas de clientes del partner
partner_payouts         ← liquidaciones automáticas mensuales al partner
partner_client_links    ← vinculación cuenta partner + cuenta cliente del mismo usuario
partner_unlink_requests ← solicitudes de desvinculación cliente-partner
```

### Tablas de audit (schema audit — solo INSERT)

```
audit.access_log        ← quién accedió a la ficha de un cliente · cuándo · desde dónde
audit.change_log        ← qué cambió · valor anterior · valor nuevo · quién
audit.integration_log   ← qué datos salieron a qué servicio externo
audit.service_log       ← eventos por servicio concreto (metadata JSON flexible)
```

---

## COLA DE TRABAJOS — JOBS Y COLAS

```
COLA: provisioning
  jobs: provision-service · suspend-service · reactivate-service · terminate-service

COLA: billing
  jobs: generate-invoice · charge-invoice · retry-charge · generate-pdf

COLA: notifications
  jobs: send-email · send-whatsapp · send-internal-notification

COLA: maintenance
  jobs: execute-maintenance · check-overdue-tasks · generate-monthly-tasks

COLA: infrastructure
  jobs: poll-server-metrics · check-server-capacity

COLA: promotions
  jobs: evaluate-promotion-rules · expire-promotions · apply-discount

COLA: outbox
  jobs: dispatch-pending-events (polling cada 5 segundos)

COLA: referrals
  jobs: generate-monthly-credits · apply-referral-discount · check-referral-status

COLA: partner
  jobs: generate-monthly-payouts · process-payout-sepa · process-payout-stripe · retry-failed-payout · generate-commission · check-partner-client-status
```

Cada job es idempotente — si se ejecuta dos veces, el resultado es el mismo.
Cada job registra su resultado en la base de datos antes de considerarse completado.
Los jobs que agotan reintentos quedan en estado `failed` — nunca se borran automáticamente.
Reintentos por defecto: 5 con backoff exponencial (30s → 60s → 120s → 240s → 480s).
Jobs fallidos generan notificación al superadmin vía evento `system.error`.

---

## WEBSOCKETS — CHAT EN TIEMPO REAL

```
Tecnología: Socket.io sobre NestJS WebSocket Gateway

Namespaces:
  /chat           ← conversaciones cliente-agente en tiempo real
  /notifications  ← notificaciones internas en tiempo real (campana)
  /admin          ← alertas operativas para agentes y admin

Eventos del namespace /chat:
  message:send        ← cliente o agente envía mensaje
  message:received    ← confirma recepción
  chat:escalate       ← cliente solicita agente humano
  chat:agent_joined   ← agente se une a la conversación
  chat:closed         ← conversación cerrada
  agent:typing        ← el agente está escribiendo (visible al cliente)
  client:typing       ← el cliente está escribiendo (visible al agente)
  promotion:show      ← el servidor indica al cliente que hay una promoción activa
```

---

## SISTEMA DE PLUGINS — CÓMO FUNCIONA

### Registro de plugins
Cada plugin se registra en el módulo correspondiente al arrancar la aplicación.
El sistema de plugins lee la configuración de settings para saber cuál está activo.

```typescript
// El core pregunta qué plugin de pago está activo
// Lee de settings: { active_payment_plugin: 'stripe' }
// Resuelve la implementación correcta
// El módulo de billing nunca sabe si es Stripe o Redsys
```

### Estructura interna de un plugin

```
/plugins/payment/stripe/
  ├── stripe.plugin.ts        ← implementa PaymentPlugin
  ├── stripe.config.ts        ← campos de configuración necesarios
  ├── stripe.module.ts        ← módulo NestJS
  └── stripe.manifest.json    ← metadata del plugin
```

### manifest.json de un plugin

```json
{
  "name": "Stripe",
  "slug": "stripe",
  "type": "payment",
  "version": "1.0.0",
  "description": "Procesamiento de pagos via Stripe",
  "config_fields": [
    { "key": "secret_key", "label": "Clave secreta", "type": "password", "required": true },
    { "key": "webhook_secret", "label": "Webhook secret", "type": "password", "required": true },
    { "key": "mode", "label": "Modo", "type": "select", "options": ["test", "production"], "required": true }
  ]
}
```

El dashboard del admin lee el manifest para renderizar el formulario de configuración del plugin. Sin hardcodear campos en el frontend.

---

## AUDIT LOG DEL SERVICIO — METADATA FLEXIBLE

La tabla `audit.service_log` usa un campo `metadata` JSON para soportar cualquier tipo de producto sin modificar el schema.

```typescript
// Estructura del registro
{
  id: uuid,
  service_id: uuid,
  tipo_accion: string,      // definido al crear el producto
  actor_id: uuid,           // agente o null si es el sistema
  actor_nota: string|null,  // nota opcional del agente
  timestamp: datetime,
  metadata: jsonb           // campos específicos del tipo de producto
}
```

Los tipos de evento y sus campos se definen al crear el producto en el dashboard.
El frontend los lee para renderizar texto legible al cliente.

---

## IDENTIDAD VISUAL

El frontend debe ser coherente con la identidad visual de Aelium en todo momento.
La fuente de verdad de tokens de diseño está en `frontend/app/globals.css`.
Para referencia rápida, ver SESSION_RULES.md > Paleta.

---

## ROLES Y PERMISOS — RESUMEN TÉCNICO

```
superadmin      → acceso total · solo asignable desde la base de datos
agent_full      → soporte + billing · sin configuración del sistema
agent_billing   → facturas · pagos · clientes · sin soporte
agent_support   → chat · conversaciones · historial cliente · sin billing
client          → su propio contexto únicamente
partner_pending → registrado y email verificado · pendiente de aprobación manual
partner         → aprobado · acceso completo al dashboard partner (solo sus clientes)
```

Guards de NestJS por rol en cada endpoint.
El frontend oculta elementos según el rol — pero la seguridad real está en la API.
El frontend nunca es la única barrera de seguridad.

---

## REGLAS OPERATIVAS DEL AGENTE

> Para todas las reglas operativas (workflow, sesiones, limitaciones, commits,
> checklist de cierre de sprint), ver **SESSION_RULES.md**.
>
> Para el plan de ejecución y estado de cada sprint, ver **ROADMAP.md**.

---

*La fuente de verdad de producto es DECISIONS.md.*
*La fuente de verdad técnica es este archivo.*
*La fuente de verdad operativa es SESSION_RULES.md.*
*El plan de ejecución es ROADMAP.md.*
