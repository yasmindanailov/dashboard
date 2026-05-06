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

## Provisioning y servicios del cliente

### Provisioner
Plugin que activa un producto en un sistema externo (cPanel WHM, Enhance, ResellerClub, Docker Engine, ...) o internamente (`internal`, `manual`). Declarado en `products.provisioner_slug`. Implementa la interfaz `ProvisionerPlugin` definida en [ADR-021](../10-decisions/adr-021-provisioners.md) y extendida en [ADR-070](../10-decisions/adr-070-service-info-sso-acciones-curadas.md).

### Provisioning orchestrator
Componente del módulo `provisioning` (Sprint 11) que recibe `invoice.paid` (vía R8 Outbox), resuelve `provisioner_slug` del producto, decide servidor (consulta `infrastructure.pickServerForProduct` cuando aplica), invoca `plugin.provision(...)`, gestiona retries via BullMQ y resultado. **Es el único conector entre core y plugins** — los plugins no se importan desde otros módulos.

### Service info (`getServiceInfo()`)
Payload normalizado que cada `ProvisionerPlugin` retorna a la página `/dashboard/services/[id]`: estado, display, métricas opcionales, capabilities (incluido `has_sso_panel` e `inline_actions`). Pull lazy bajo demanda con cache Redis 60s (TTL configurable). Documento canónico: [ADR-070](../10-decisions/adr-070-service-info-sso-acciones-curadas.md). Permite que **una sola plantilla React renderice todos los servicios** independientemente del plugin (sin `if (provisioner === 'X')`).

### SSO panel (`getSsoUrl()`)
Mecanismo canónico para que el cliente abra el panel del proveedor externo (cPanel, Plesk, Enhance, Collabora admin) **logueado** sin volver a introducir credenciales. El plugin genera URL temporal (5-15 min) firmada por la API del proveedor. Si el plugin no soporta SSO (ResellerClub para clientes finales), `getSsoUrl` retorna `null` y el frontend oculta el botón. Cada apertura registra fila en `audit_access_log` con `action='sso_panel_open'`.

### Acción curada
Acción inline ejecutable desde el dashboard sin salir al panel externo (ej. `restart_container` para Docker, `add_dns_record` para ResellerClub, `reset_account_password` para cPanel). Cada plugin declara su lista en `capabilities.inline_actions`. Una acción **sólo** se admite si cumple los **5 criterios canónicos** de [ADR-070](../10-decisions/adr-070-service-info-sso-acciones-curadas.md) §"doctrina de cuándo añadir una acción inline": frecuencia >5/mes, idempotencia o reversibilidad, sin estado dual, auditable significativamente, aprobada por superadmin con ADR específico. Toda ejecución registra fila en `audit_access_log`.

### Capability flag
Booleano declarado por el plugin en `capabilities` que el frontend usa para condicionar UI sin ramificar por slug. Ejemplos: `has_sso_panel`, `has_metrics_history` (sólo Docker), `has_renewal_link`. Doctrina ADR-070: **el frontend lee capabilities, nunca compara `provisioner_slug`** directamente.

### Dashboard como puerta unificada
Doctrina arquitectónica ([ADR-070](../10-decisions/adr-070-service-info-sso-acciones-curadas.md)): el dashboard de Aelium es **siempre la puerta de entrada y el archivo histórico** del cliente, aunque la operativa profunda (gestionar emails, DBs, instalar apps de cPanel) viva en el panel externo accesible vía SSO. Aelium **no replica** funcionalidad de paneles externos — sólo **delega** (SSO) o **expone acciones curadas** (5 criterios). Antipatrón explícitamente prohibido: implementar "Email Manager / DB Manager / File Manager" replicando cPanel desde el dashboard.

### RemoteServer
DTO en memoria (NO tabla Prisma) que representa un servidor gestionado por un proveedor SaaS (Enhance CP, cPanel WHM, Plesk Obsidian, DirectAdmin) tal como lo expone su API admin. Aelium **NO almacena** `RemoteServer` en BD — los obtiene bajo demanda vía `plugin.listRemoteServers()` con cache Redis 600s. Documento canónico: [ADR-071](../10-decisions/adr-071-vista-admin-federada-infraestructura.md). Distinto del `Server` propio (tabla `servers`), que sí persiste con métricas time-series.

### Federated Server View (Vista admin federada)
Patrón arquitectónico ([ADR-071](../10-decisions/adr-071-vista-admin-federada-infraestructura.md)): la página `/admin/infrastructure` **agrega en una sola pantalla** servidores propios (Docker, persistidos por Aelium) + servidores remotos (gestionados por proveedores SaaS, fetcheados via API con cache 600s). Sin doble fuente de verdad: Aelium no almacena los remotos, los presenta consultivamente. Distinción visual clara: TAB 1 propios con gráficas time-series, TAB 2 remotos con snapshot + "última sync hace X min". Cierra el antipatrón "vista admin partida" sin caer en BD espejo (antipatrón A2) ni replicación de panel admin (antipatrón A3).

### ProviderHealthSummary
DTO devuelto por `plugin.getProviderHealthSummary()` ([ADR-071](../10-decisions/adr-071-vista-admin-federada-infraestructura.md)) con resumen agregado de un proveedor SaaS: `servers_total`, `servers_healthy`, `servers_with_warnings`, `servers_unreachable`, `total_active_services`, `api_status` (`healthy | degraded | down`), `last_sync_at`. Permite mostrar cabecera por proveedor en `/admin/infrastructure` TAB 2 sin abrir cada servidor uno a uno. Cache compartida con `listRemoteServers` (un solo round-trip al proveedor por sync).

### Plugin Manifest
Declaración estática que cada plugin de provisioning expone para que el orquestador, la UI admin y el portal RGPD entiendan su forma sin inspeccionar código ([ADR-080 §1](../10-decisions/adr-080-plugin-framework.md)). Incluye: `slug`, `version` (semver del plugin), `manifestVersion` (`v1`), `label` y `description` (i18n keys), `docsUrl`, `settingsCategory` (provisioner / payment / notification / ai), `configSchema` (JSON-Schema 7 de campos NO secretos), `secretsSchema` (JSON-Schema 7 de campos cifrados), y `testConnectionMethod` (`getStatus` | `custom` | `null`). Ajv lo valida en backend para los PATCH; `@rjsf/core` con tema DS lo renderiza como form dinámico en el frontend admin.

### Secret Vault (`SecretVaultService`)
Servicio canónico de cifrado de secretos del backend ([ADR-080 §3](../10-decisions/adr-080-plugin-framework.md)). AES-256-GCM con clave maestra `ENCRYPTION_KEY` (env var dedicada, 32 bytes hex, validada al boot — fail-fast). IV per-secret (12 bytes random), tag GCM (16 bytes) para integridad. `key_version` desde v1 prepara rotación elegante futura. **Es el único componente del backend que toca la clave maestra**; cualquier otro módulo recibe los secretos descifrados como string en memoria. R12: secrets NUNCA en logs / audit / responses GET (audit usa `<set>`/`<cleared>`, GET responde `'***'`/`null`).

### Circuit Breaker
Patrón de resiliencia aplicado a las invocaciones a plugins de provisioning ([ADR-080 §5](../10-decisions/adr-080-plugin-framework.md)). Implementación canónica `HouseCircuitBreaker` (Sprint 15A, ~200 LOC en `core/provisioning/circuit-breaker.ts`) tras la interface `CircuitBreaker` para permitir migración futura a `opossum` sin tocar call-sites. Estados: `closed` → `open` (≥5 fallos en 60s) → `half-open` (tras 30s reset_timeout) → `closed` (probe OK) o `open` (probe KO). Aplicado EXCLUSIVAMENTE en `getServiceInfoWithCache` y `executeActionWithCacheInvalidation` por cumplir los 3 criterios canónicos: idempotente + frecuente + propagable a UX. NO envuelve `provision()`/`deprovision()` (anti-patrón "blanket protection" — ya tienen retry BullMQ propio). Emite `plugin.circuit_opened` / `plugin.circuit_closed` consumidos por `NotificationsPluginCircuitListener`.

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
