# Glosario — Aelium Dashboard

> **Términos canónicos del proyecto.**
> Cada concepto tiene UN nombre oficial y UNA definición.
> Si en código o doc aparece otro nombre para lo mismo, es un bug a corregir.

> **Por qué existe este documento:** sin glosario, "chat" puede significar conversación en tiempo real para uno y conversación cualquiera para otro. Esto causa bugs, doc divergente, y refactors costosos. El glosario es la fuente única.

---

## Soporte (chat / tickets / conversaciones)

### Conversación
Término **paraguas** que engloba chats y tickets. En BD es la tabla `conversations`. En UI casi nunca se usa solo: se prefiere "chat" o "ticket" según el caso. Solo se usa cuando hace falta referirse a ambos a la vez.

### Chat
Conversación **síncrona**, en tiempo real. Burbujas de mensajes, WebSocket, notificación inmediata.
Casos de uso típicos: cliente con duda en caliente, asistencia mientras navega.
**Diferencia con ticket:** chat se espera respuesta en minutos, no días.

### Ticket
Conversación **asíncrona**, formato email. Cuerpo largo, posible asunto editable, historial de mensajes con autor y fecha.
Casos de uso típicos: incidencia técnica, solicitud que requiere investigación.
**Diferencia con chat:** se acepta tiempo de respuesta de horas o días.

### Mensaje
Una unidad de comunicación dentro de una conversación. Tabla `messages`.
Tiene autor (`sender_id`), cuerpo (`body`), tipo (`text`, `system`, `internal_note`), timestamps.

### Nota interna
Mensaje **visible solo a agentes**, nunca al cliente. Tipo `internal_note` en `messages`.
Útil para que un agente le pase contexto a otro: "Cliente difícil, ya rebajamos un 10%".

### Nota del cliente *(distinto de nota interna)*
Anotación **estructurada** en el perfil del cliente, NO en una conversación. Tabla `client_notes`.
Categorizada (general, conversation, solution, billing, technical), pinneada o no, con autor.
Sincroniza bidireccionalmente con notas internas (Sprint 7.H22).

### Escalación
Acción de convertir un chat en ticket. Se hace cuando el agente no puede resolver en el momento.
Mantiene el historial: el ticket nuevo enlaza al chat origen (`escalated_from_id`).

### Resolución
Acción de cerrar una conversación marcándola como resuelta. Requiere nota de resolución obligatoria (Sprint 7.H17). Genera mensaje del sistema con autor y motivo.

### Estado de conversación
Valores: `open`, `waiting_agent`, `waiting_client`, `resolved`, `closed`.
- `open`: nueva, sin asignar
- `waiting_agent`: la pelota está en el agente (cliente respondió último)
- `waiting_client`: la pelota está en el cliente (agente respondió último)
- `resolved`: resuelta; puede reabrirse si el cliente escribe
- `closed`: cerrada definitivamente, no admite más mensajes

### Chat anónimo / guest
Chat iniciado desde la landing sin que el visitante esté logueado. Identificado por `guest_session_token` en cookie. Se vincula a un usuario real cuando ese visitante se registra con el mismo email (Sprint 7.5.1).

---

## Billing y servicios

### Producto
Lo que Aelium vende. Tabla `products`. Tiene tipo (`hosting_web`, `docker_service`, `support_inside`, etc.), nombre, descripción.
**No confundir con servicio.** Producto es el catálogo; servicio es lo contratado por un cliente.

### Servicio
Instancia de un producto contratada por un cliente. Tabla `services`.
Tiene estado (`pending`, `active`, `paused`, `suspended`, `cancelled`), ciclo de cobro, cliente dueño.
**Granularidad:** un cliente puede tener N servicios, cada uno una instancia de un producto.

### Plan / Pricing
Combinación producto + ciclo + precio. Tabla `product_pricing`.
Ejemplo: hosting_web con ciclo `annual` a 99€ con 15% descuento.

### Suscripción
Sinónimo informal de "servicio activo con ciclo recurrente". Cuando hablamos de "cancelar suscripción", nos referimos al servicio.
**No es una entidad separada en BD** — el ciclo lo gestiona el campo `billing_cycle` del servicio.

### Factura
Documento legal con numeración secuencial. Tabla `invoices`.
**Invariantes (Hacienda España):** numeración sin saltos, retención 10 años, **nunca se elimina** (solo cambia de estado a `cancelled`).
Estados: `draft`, `pending`, `paid`, `overdue`, `cancelled`, `refunded`.

### Item de factura
Línea de una factura. Tabla `invoice_items`. Descripción, importe, IVA aplicable.

### Numeración secuencial
PostgreSQL SEQUENCE por año (`invoice_number_seq_YYYY`). Prefijo configurable (`AEL`).
Ejemplo: `AEL-2026-00042`.

### Prorrateo
Cálculo de crédito cuando un cliente cambia de plan a mitad de ciclo.
Fórmula: `precio_diario × días_no_consumidos = crédito`.
Preview obligatorio antes de confirmar (Sprint 6.6).

### Período de gracia
Días configurables tras vencimiento antes del primer intento de cobro automático.
Default: 0 días. Configurable por producto.

### Suspensión
Estado intermedio entre `active` y `cancelled`. El servicio queda inactivo pero los datos se preservan durante X días configurables.
Si el cliente paga durante la suspensión, vuelve a `active`. Si no, transiciona a `cancelled`.

### Cancelación
Estado final. Datos del servicio se retienen Y días configurables, después se purgan.

### Pausa
Acción explícita del cliente: "quiero suspender mi servicio temporalmente". Distinta de suspensión por impago.
Misma mecánica técnica, diferente trigger.

### Provisioner
Plugin que activa el servicio en un sistema externo. Ejemplos: `enhance_cp` (control panel), `docker_compose` (contenedor), `manual` (admin lo activa a mano).
Campo `provisioner_type` en producto.

### Payment provider
Plugin que ejecuta el cobro. Ejemplos: `manual` (admin marca como pagada), `stripe` (futuro plugin).
Campo `payment_provider` en factura/servicio.

### Perfil de facturación
Datos fiscales del cliente para emitir facturas. Tabla `billing_profiles`.
Un cliente puede tener varios (factura simplificada vs factura completa con NIF).
Si no hay perfil → factura simplificada con nombre + email.

---

## Auth, permisos y roles

### Rol
Categoría de usuario que define permisos. Tabla `roles`.
Roles del sistema (`is_system: true`, no editables):

| Rol | Quién | 2FA |
|-----|-------|-----|
| `superadmin` | Dueño del sistema | Sí |
| `agent_full` | Agente con acceso a todo | Sí |
| `agent_billing` | Agente solo billing + clientes | Sí |
| `agent_support` | Agente solo soporte + tareas | Sí |
| `client` | Cliente final | No |
| `partner` | Agencia partner aprobada | (futuro) |
| `partner_pending` | Partner registrado, sin aprobar | No |

### 2FA (Two-Factor Authentication)
Código de 6 dígitos numéricos enviado por email tras login con credenciales. Solo aplica a roles privilegiados (superadmin + agentes).
Expira en 5 minutos (configurable). Token temporal mientras tanto (`temp_2fa`).

### Sesión
Registro de un access token + refresh token activos. Tabla `sessions`.
Permite ver "Mis sesiones activas" y cerrarlas individualmente.

### Token de acceso (access token)
JWT de corta duración (15 min default) usado para autenticar requests API.

### Token de refresco (refresh token)
JWT de larga duración (7 días default) que permite emitir nuevos access tokens sin re-login.
Rotación: cada uso emite uno nuevo y revoca el anterior.

### CASL
Librería de PBAC (Policy-Based Access Control) que gestiona permisos.
Se usa con `@CheckPolicies()` en controllers para autorización.
Reemplazó a `@Roles()` en Sprint 5.

### Subject (CASL)
Recurso sobre el que se aplica un permiso. Ej: `Subject.Invoice`, `Subject.Client`.
Es la "cosa" sobre la que actúas.

### Action (CASL)
Operación que puedes hacer sobre un subject. Ej: `Action.Read`, `Action.Update`, `Action.Manage`.
`Manage` es comodín — incluye todas las demás.

### Permiso
Tupla `(rol, action, subject, conditions?)`. Ejemplo:
```ts
{ action: Action.Read, subject: Subject.Invoice, conditions: { user_id: '$id' } }
// Cliente puede leer SUS facturas (no las de otros)
```
Definidos en `backend/src/core/casl/permissions.ts`.

### Bloqueo de cuenta
Tras N intentos fallidos de login (default 5), la cuenta se bloquea X minutos (default 15). Configurable en settings.

---

## Partner (parcialmente implementado)

### Partner
Agencia o profesional que revende productos de Aelium con comisión. No es un cliente — es un canal de venta.
Tabla `partners` (cuando se complete el módulo).

### Cliente del partner
Cliente final que se registró a través de un enlace personalizado del partner.
Tiene campo `partner_id` en `users`.
El partner ve sus clientes y puede gestionarlos (con límites).

### Comisión
Porcentaje sobre cobros de clientes del partner. Configurable por producto (`partner_commission_pct`).
Validado @Min(0) @Max(100).

### Liquidación / Payout
Pago periódico al partner por comisiones acumuladas. Tabla `partner_payouts` (futuro).

### Desvinculación
Acción del partner para soltar a un cliente (deja de ser su cliente). Requiere razón documentada.
Inversa: el partner puede volver a vincular si el cliente acepta.

---

## Arquitectura y eventos

### Módulo
Dominio de negocio con su propia carpeta en `backend/src/modules/`. Ejemplos: `auth`, `clients`, `billing`, `support`, `tasks`, `partner`.
Cada módulo tiene su `*.module.ts` que declara providers, controllers, listeners.

### Plugin
Implementación intercambiable de una interfaz del core. Vive en `backend/src/plugins/`.
Ejemplos: `payment/stripe`, `provisioner/enhance-cp`.
**Regla R4:** el core nunca importa un plugin directamente.

### Evento
Mensaje emitido por un módulo y escuchado por otros, vía EventEmitter2.
Naming: `<dominio>.<acción>` en pasado, ej: `invoice.paid`, `service.suspended`.
Catálogo canónico de eventos en `docs/20-modules/_events.md` (pendiente F4).

### Outbox / event_outbox
Tabla que persiste eventos críticos en la misma transacción que el cambio de estado. Garantiza que el evento se despache aunque el proceso muera (Regla R8).

### Listener
Componente que escucha un evento y reacciona. Decorador `@OnEvent(...)`.
Vive típicamente en `*-email.listener.ts` o `*-websocket.listener.ts`.

### Worker
Proceso que consume jobs de BullMQ. Ejemplo: `billing-lifecycle.worker.ts` genera facturas según calendario.
Cada worker tiene una cola dedicada o compartida.

### Job
Unidad de trabajo asíncrono en BullMQ. Tiene payload, retries, backoff, deadletter.
**Regla R13:** jobs fallidos persisten + notifican al superadmin.

### Correlation ID
UUID v4 generado por `CorrelationIdMiddleware` al inicio de cada request.
Se propaga a logs, eventos, jobs. Permite rastrear todo lo que pasó como consecuencia de un request.

### Settings (configuración global)
Tabla `settings` con pares `(category, key, value)`. Cacheado 1 minuto en memoria.
Editable desde el dashboard por superadmin (Sprint 12 — pendiente).
Categorías: `general`, `billing`, `auth`, `support`, `referrals`, `email`, `storage`.

### Storage (object storage canónico)
Servicio S3-compatible donde el dashboard persiste objetos binarios: PDFs de facturas, adjuntos de chat/tickets (futuros), logos, avatares.
En desarrollo: **MinIO** local en `docker/docker-compose.dev.yml`. En producción: AWS S3, Cloudflare R2 u otro S3-compatible (cero cambio de código, sólo env vars).
Acceso vía `StorageService` (`backend/src/core/storage/storage.service.ts`), `@Global`. Convención de keys y patrón canónico documentados en [ADR-062](../10-decisions/adr-062-storage-canonico-minio.md).

### Bucket
Contenedor del storage donde viven los objetos. Aelium usa un único bucket (`S3_BUCKET`, default `aelium-storage`) — la separación se hace por **prefijo de key** (`invoices/`, `chats/`, `tickets/`, `branding/`, `avatars/`).

### Signed URL
URL firmada con TTL (default 60 min vía `storage.signed_url_expiry_minutes`) que permite descargar un objeto del bucket sin pasar por el backend. El endpoint `/pdf` devuelve **302 redirect** a una signed URL — el bucket sirve los bytes directamente, el backend libre.

---

## Auditoría y observabilidad

### Audit log
Conjunto de tablas inmutables: `audit_access_log` (lecturas a recursos sensibles), `audit_change_log` (escrituras).
**Regla R3:** solo INSERT, ni el superadmin puede modificar.

### Error log
Tabla `error_log` con excepciones registradas. Cada error: stack trace, request, usuario, correlation ID. Visible en dashboard (admin only).

### Sentry (cuando esté activo)
Plataforma externa de observabilidad. Captura errores no manejados con reproducibilidad y contexto. Configurable vía `SENTRY_DSN` env var. Inactivo por defecto (decisión consciente: ver `docs/90-meta/sentry-setup.md`).

---

## Frontend / UI

### Design System (DS)
Librería de componentes en `frontend/app/components/ui/`. Botones, inputs, badges, tablas, modales, etc.
**Regla R16:** toda UI usa DS, no ad-hoc.
Documento de referencia: `docs/DESIGN_SYSTEM.md` (a migrar a `docs/40-design-system/` en F-future).

### Tokens
Variables CSS definidas en `frontend/app/tokens.css`. Colores, spacing, tipografía, radii, shadows.
Se cambia el look del dashboard editando solo este archivo.

### Tipos de página
6 layouts canónicos definidos en `UI_SPEC.md §2`: Overview, List, Detail, Form, Workspace, Settings.
**Regla D10:** cada página debe ser uno de los 6 tipos.

### StatusDot
Componente del DS que representa estado mediante un punto de color (verde, amarillo, rojo, gris).
Reemplaza emojis circulares (🟢🔴) prohibidos por D1.

### Toast
Notificación efímera (auto-dismiss en 3-5s) que confirma acción reciente. Componente del DS.
Ejemplos: "Factura guardada", "Error: contraseña inválida".

### Banner / AlertBanner
Notificación persistente en la página. Para info importante que requiere atención del usuario.
Ejemplos: "Tienes 3 facturas vencidas", "Mantenimiento programado mañana".

### EmptyState
Componente del DS para estados vacíos. Icono + texto + acción sugerida (D8).
Ejemplo: "Aún no tienes clientes. [+ Añadir cliente]".

---

## Portales y audiencias (ADR-066)

### Portal
Árbol raíz del frontend asociado a una **audiencia** del sistema. Cada portal tiene su propio prefijo de URL, su propio shell (Sidebar + Topbar), su propio guard de rol y su propio subtítulo `PortalBadge`. Tres portales canónicos a partir de Sprint 9.6 (DC.7):

| Portal | URL raíz | Audiencia (roles) | Subtítulo |
|--------|----------|-------------------|-----------|
| **Administración** | `/admin/*` | `superadmin`, `agent_full`, `agent_billing`, `agent_support` | "Portal de Administración" |
| **Cliente** | `/dashboard/*` | `client` | "Portal de Cliente" |
| **Partner** | `/partner/*` (Sprint 19) | `partner`, `partner_pending` | "Portal de Partner" |

La granularidad fina entre roles staff (qué subset de items ve cada agente en el sidebar admin) se resuelve con CASL + `SIDEBAR_PERMISSIONS` **dentro** del portal, no creando un portal por rol. Documento canónico: [`docs/10-decisions/adr-066-tres-portales-raiz-portalbadge.md`](../10-decisions/adr-066-tres-portales-raiz-portalbadge.md).

### PortalBadge
Componente del Design System en `frontend/app/components/ui/PortalBadge/` que renderiza el subtítulo identificador del portal bajo el logo del Sidebar. Recibe la variante (`admin | client | partner`) o resuelve dinámicamente desde el rol del usuario vía helper `portalForRole(roleSlug)` en `frontend/app/lib/portal.ts`. Cumple R16 + D11.

### Multi-path con Deprecation headers (ADR-068)
Patrón canónico para migrar rutas REST sin romper consumidores. El controller declara `@Controller([canónico, legacy])` (NestJS multi-path nativo) y el `LegacyRouteDeprecationMiddleware` añade headers `Deprecation: true` + `Sunset: <fecha HTTP-date>` + `Link: <successor>; rel="successor-version"` (RFC 9745 / 8594 / 8288) sólo a las llamadas al path legacy. La ventana de deprecación canónica para Sprint 9.6 es hasta Sprint 14 Deploy. Documento canónico: [`docs/10-decisions/adr-068-multi-path-deprecation-headers.md`](../10-decisions/adr-068-multi-path-deprecation-headers.md).

---

## Convenciones de uso del glosario

- **Citar términos:** cuando uses un término del glosario en doc o código, asegúrate de usarlo con el significado canónico aquí definido.
- **Detectar drift:** si encuentras un sinónimo o variación en el código (`task` vs `todo`, `chat` vs `conversation`), repórtalo o crea un issue para alinear.
- **Añadir un término:** edita este archivo. Una sola definición clara, sin sinónimos. Si dos conceptos parecen iguales, articular la diferencia explícitamente.
- **Cambiar una definición:** debe pasar por un ADR justificando el cambio. No se reescribe sin trail.

## Documentos relacionados

- `docs/00-foundations/rules.md` — Reglas R1–R16 + D1–D11
- `docs/aelium-documento-de-marca.md` — Voz de marca, identidad visual
- `docs/DECISIONS.md` — Decisiones de producto (a migrar a `docs/10-decisions/` ADRs en F2)
- `docs/DATABASE_SCHEMA.md` — Schema completo (a partir por dominio en F3)
- `docs/20-modules/<módulo>/contract.md` — Contrato técnico de cada módulo (pendiente F4)
