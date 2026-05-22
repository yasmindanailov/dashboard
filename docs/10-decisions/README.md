# Decisiones (ADRs) — Aelium Dashboard

> **Architecture Decision Records** del proyecto.
> Cada ADR registra una decisión arquitectónica importante: el problema, las opciones consideradas, qué se eligió, las consecuencias.
> Son **inmutables**: una vez aceptadas, no se editan. Si una decisión cambia, se crea un ADR nuevo que **supersede** al anterior.

---

## Por qué existen los ADRs

Las decisiones técnicas se toman bajo contextos específicos. Sin registrarlas:
- 6 meses después nadie recuerda **por qué** algo se hizo así
- Surge la tentación de "y si simplemente cambiamos esto" sin entender el coste
- Las nuevas personas (humanas o IA) repiten debates ya resueltos

Con ADRs:
- Cada decisión tiene **trail** completo: contexto, alternativas, motivo
- Cambiar una decisión requiere ADR nuevo que justifique por qué el anterior ya no aplica
- Los contracts (`docs/20-modules/*/contract.md`) referencian ADRs, no §§ ambiguas

---

## Convenciones

### Numeración
- **ID secuencial cronológico:** `ADR-001`, `ADR-002`, ... sin saltos.
- Una vez asignado, **no se reutiliza**. Si un ADR se descarta antes de ser aceptado, queda como "Withdrawn" pero conserva su número.
- Los IDs **NO se corresponden 1:1** con las antiguas `DECISIONS.md §N`. La trazabilidad se mantiene mediante el campo "Original" en cada ADR.

### Naming de archivo
- `adr-NNN-titulo-en-kebab-case.md`
- 3 dígitos para mantener orden alfabético hasta 999.
- Título corto y descriptivo, en español: `adr-008-roles-y-2fa.md`, no `adr-008-decision-sobre-autenticacion-multifactor-para-administradores.md`.

### Status
| Status | Significado |
|--------|-------------|
| `Active` | Decisión vigente. La que aplica hoy. |
| `Superseded by ADR-MMM` | Reemplazada por una nueva. Ya NO aplica. Se conserva por historia. |
| `Deprecated` | Ya no se aplica pero no hay reemplazo activo (la situación que motivó la decisión desapareció). |
| `Withdrawn` | Se retiró antes de ser aceptada (contexto cambió mientras se debatía). |

### Plantilla
Ver [`_template-adr.md`](./_template-adr.md). 7 secciones estándar.

### Cómo modificar una decisión

**No se edita un ADR existente.** En su lugar:

1. Crear ADR nuevo con el ID siguiente (ej: ADR-051)
2. Sección "Contexto" explica por qué la decisión anterior ya no aplica
3. Sección "Decisión" describe la nueva
4. Editar el ADR antiguo solo para cambiar su `Status` a `Superseded by ADR-051`

Resultado: la historia queda íntegra.

---

## Índice navegable

> ADRs ordenados por bloque temático. Status entre paréntesis cuando no es `Active`.

### Foundations & cross-cutting (ADR-001..010)

- [ADR-001](./adr-001-definicion-proyecto.md) — Definición del proyecto y alcance
- [ADR-002](./adr-002-stack-backend.md) — Stack tecnológico backend (NestJS + Prisma + Postgres + Redis)
- [ADR-003](./adr-003-extraccion-reglas-canonicas.md) — Extracción de reglas a documento canónico (`rules.md`)
- [ADR-004](./adr-004-arquitectura-monolito-modular.md) — Arquitectura: monolito modular orientado a eventos
- [ADR-005](./adr-005-stack-frontend.md) — Stack tecnológico frontend (Next.js 16 + React 19 + Design System)
- [ADR-006](./adr-006-estrategia-tests.md) — Estrategia de tests (Jest unitarios + Playwright E2E)
- [ADR-007](./adr-007-observabilidad.md) — Estrategia de observabilidad (Pino + Sentry + correlation IDs)
- [ADR-008](./adr-008-orden-construccion-sprints.md) — Estrategia de sprints incrementales
- [ADR-009](./adr-009-estrategia-plugins.md) — Plugins (interface en core, implementación intercambiable)
- [ADR-010](./adr-010-rgpd-retencion-datos.md) — Cumplimiento RGPD y retención de datos

### Auth & seguridad (ADR-011..017)

- [ADR-011](./adr-011-roles-sistema.md) — Roles del sistema (7 roles fijos inmutables)
- [ADR-012](./adr-012-pbac-casl.md) — Autorización con CASL (PBAC isomórfico)
- [ADR-013](./adr-013-2fa-email.md) — Autenticación de doble factor (2FA) por email
- [ADR-014](./adr-014-bloqueo-intentos-fallidos.md) — Bloqueo de cuenta por intentos fallidos
- [ADR-015](./adr-015-encriptacion-credenciales.md) — Encriptación de credenciales con AES-256-GCM
- [ADR-016](./adr-016-rate-limiting-redis.md) — Rate limiting por endpoint con Redis
- [ADR-017](./adr-017-audit-log-inmutable.md) — Audit log inmutable

### Products & catálogo (ADR-018..024)

- [ADR-018](./adr-018-catalogo-dinamico-productos.md) — Catálogo dinámico de productos
- [ADR-019](./adr-019-configuracion-tipos-producto.md) — Configuración por tipo de producto (bloques estructurados)
- [ADR-020](./adr-020-categorias-extras-producto.md) — Categorías y sistema de extras de producto
- [ADR-021](./adr-021-provisioners.md) — Provisioners (interfaz + reglas de desarrollo por plugin)
- [ADR-022](./adr-022-wdify-deprecado-proyectos.md) — "We Do It For You" (Superseded by ADR-046)
- [ADR-023](./adr-023-promociones-codigos-descuento.md) — Módulo de promociones y códigos de descuento
- [ADR-024](./adr-024-eliminacion-hosting-agency.md) — Eliminación de `hosting_agency` como tipo

### Billing & servicios (ADR-025..033)

- [ADR-025](./adr-025-numeracion-secuencial-facturas.md) — Numeración secuencial de facturas (Hacienda RD 1619/2012)
- [ADR-026](./adr-026-estados-factura.md) — Estados de factura y transiciones permitidas
- [ADR-027](./adr-027-iva-por-pais.md) — IVA por país y multi-moneda preparada
- [ADR-028](./adr-028-suscripciones-ciclo-vida.md) — Suscripciones — ciclo de vida avanzado
- [ADR-029](./adr-029-prorrateo-cambio-plan.md) — Prorrateo en cambio de plan (mensual ↔ anual)
- [ADR-030](./adr-030-periodo-gracia-reintentos.md) — Período de gracia + reintentos de cobro automáticos
- [ADR-031](./adr-031-payment-providers.md) — Payment providers como plugins (interface intercambiable)
- [ADR-032](./adr-032-flujo-compra-checkout.md) — Flujo de compra (dos procesos + tres niveles de catálogo)
- [ADR-033](./adr-033-outbox-pattern-pendiente.md) — Outbox Pattern para eventos críticos (decisión + deuda actual)

### Support (ADR-034..040)

- [ADR-034](./adr-034-support-inside-modelo.md) — Support Inside (modelo de soporte gestionado con slots)
- [ADR-035](./adr-035-sistema-comunicacion-legacy.md) — Sistema de comunicación inicial **(Superseded by ADR-037)**
- [ADR-036](./adr-036-configuracion-chat.md) — Configuración del chat (horarios, mensajes, comportamiento)
- [ADR-037](./adr-037-arquitectura-dual-chat-tickets.md) — Arquitectura dual de soporte: chat + tickets
- [ADR-038](./adr-038-notas-estructuradas-cliente.md) — Sistema de notas estructuradas del cliente
- [ADR-039](./adr-039-nota-obligatoria-transiciones.md) — Nota obligatoria en transiciones de estado
- [ADR-040](./adr-040-rediseno-tickets.md) — Rediseño de tickets (Sprint 23 — plan)

### Otros módulos (tasks, notifications, infrastructure, settings, clients, projects, citas) (ADR-041..047)

- [ADR-041](./adr-041-sistema-tareas.md) — Sistema de tareas internas
- [ADR-042](./adr-042-sistema-notificaciones.md) — Sistema de notificaciones internas (campana + multicanal)
- [ADR-043](./adr-043-infraestructura-self-hosted.md) — Infraestructura self-hosted en Docker Compose
- [ADR-044](./adr-044-settings-extensos.md) — Configuración global extensa (settings) por secciones
- [ADR-045](./adr-045-gestion-clientes-crm.md) — Gestión de clientes (CRM ligero)
- [ADR-046](./adr-046-sistema-proyectos.md) — Sistema de Proyectos (Sprint 22 — supersedes ADR-022)
- [ADR-047](./adr-047-sistema-citas-comunicacion.md) — Sistema de citas (referencias estructuradas en mensajes)

### Partner & referrals (ADR-048..054)

- [ADR-048](./adr-048-partner-modelo-negocio.md) — Modelo de negocio partner (canal de venta indirecta)
- [ADR-049](./adr-049-partner-roles-onboarding.md) — Roles y onboarding del partner (semi-automático)
- [ADR-050](./adr-050-partner-permisos.md) — Permisos del partner (puede / no puede)
- [ADR-051](./adr-051-partner-comisiones-liquidaciones.md) — Comisiones del partner y liquidaciones automáticas
- [ADR-052](./adr-052-partner-desvinculacion-cliente.md) — Desvinculación cliente-partner (workflow + protección)
- [ADR-053](./adr-053-partner-vinculacion-cuenta-cliente.md) — Vinculación cuenta partner ↔ cuenta cliente del mismo usuario
- [ADR-054](./adr-054-sistema-referidos-clientes.md) — Sistema de referidos para clientes normales

### UI / landing / cross-cutting adicional (ADR-055..060)

- [ADR-055](./adr-055-resiliencia-circuit-breaker.md) — Resiliencia: circuit breaker, retries, timeouts, dead letter queue
- [ADR-056](./adr-056-estrategia-escalabilidad.md) — Estrategia de escalabilidad (Sprint 13 ampliado)
- [ADR-057](./adr-057-agentes-ia.md) — Agentes IA: filtro de chat y copilot del agente
- [ADR-058](./adr-058-integracion-landing.md) — Integración del dashboard con la landing
- [ADR-059](./adr-059-auth-layout-split-screen.md) — Arquitectura de auth layout (split-screen Aurora Digital)
- [ADR-060](./adr-060-decisiones-pre-schema.md) — Decisiones pre-schema (perfiles fiscales, sesiones, retención notificaciones)

### Refinamientos post-auditoría (ADR-061+)

- [ADR-061](./adr-061-support-inside-tier-cuenta-ux.md) — Support Inside como tier de cuenta (refina ADR-034 con UX dedicada, schema reutilizado)
- [ADR-062](./adr-062-storage-canonico-minio.md) — Storage canónico: MinIO + `@aws-sdk/client-s3` + `pdf_url` guarda S3 key + descarga 302 redirect a signed URL
- [ADR-063](./adr-063-bullmq-canonico-dlq-retries.md) — Infra BullMQ canónica + DLQ + retries con backoff exponencial (formaliza ADR-055 §DLQ y §Retries — Sprint 9 Fase A)
- [ADR-064](./adr-064-outbox-dispatcher-bullmq.md) — Outbox dispatcher migrado a BullMQ scheduled job + alerta `outbox.event_failed` (cierra ADR-033 §7 + §3 — Sprint 9 Fase C)
- [ADR-065](./adr-065-notification-channel-plugin-pattern.md) — `NotificationChannelInterface` + plantillas editables + dispatcher BullMQ (formaliza ADR-042 — Sprint 9 Fase D)
- [ADR-066](./adr-066-tres-portales-raiz-portalbadge.md) — Tres portales raíz por audiencia + componente `PortalBadge` (Sprint 9.6 — DC.7)
- [ADR-067](./adr-067-granularidad-casl-rol-staff.md) — Granularidad CASL fina por rol staff + Subjects `NotificationTemplate` y `Job` solo superadmin (Sprint 9.6)
- [ADR-068](./adr-068-multi-path-deprecation-headers.md) — Multi-path con Deprecation headers para migración retroactiva de rutas REST (Sprint 9.6)
- [ADR-069](./adr-069-estrategia-deploy-diferido.md) — Estrategia de deploy diferido (proyecto a largo plazo) — Sprint 14 reclasificado como gate condicionado P-DEPLOY
- [ADR-070](./adr-070-service-info-sso-acciones-curadas.md) — Dashboard como puerta unificada: `getServiceInfo()` + SSO al panel externo + acciones curadas inline (extiende ADR-021 con interfaz expresiva)
- [ADR-071](./adr-071-vista-admin-federada-infraestructura.md) — Vista admin federada de infraestructura: `listRemoteServers()` + `getProviderHealthSummary()` (simétrico admin de ADR-070)
- [ADR-072](./adr-072-tareas-sin-asignar-cola-publica.md) — Tareas sin `assigned_to`: cola pública con SLA (refina ADR-041 §"🚪 Cierra")
- [ADR-073](./adr-073-tipos-flexibles-tasks-reason-tags.md) — Tipos de tarea + `reason` libre + `tags`: separa el QUÉ del POR QUÉ (rename `wow_call` → `contact_client`, refina ADR-041 §"Tipos canónicos")
- [ADR-074](./adr-074-ticket-task-bridge.md) — Ticket ↔ Task bridge: asignar ticket crea tarea automática (`type=support_ticket`); cierre canónico vive en la tarea con dual path resolver/cerrar; sin notificaciones duplicadas al cliente
- [ADR-075](./adr-075-support-inside-ux-lista-y-aislamiento-productos.md) — Support Inside UX: lista vertical 3 filas (NO comparador) en `/admin/support-inside-plans` + aislamiento del CRUD genérico de productos (Sprint 8 Fase D)
- [ADR-076](./adr-076-checkout-unico-support-inside-via-evento.md) — Checkout único por dominio billing: Support Inside como consumidor del evento `service.provisioned` emitido por `BillingCheckoutService` (Sprint 8 Fase D.12)
- [ADR-077](./adr-077-contrato-provisioner-plugin-v2.md) — Contrato canónico `ProvisionerPlugin` v2: firma TypeScript congelada + capability flags + shapes (`ServiceInfo`/`SsoUrl`/`ActionResult`) + pipeline canónico de wrappers + política de versionado (Sprint 11 Fase 11.A)
- [ADR-078](./adr-078-auth-server-side-cookies-httponly.md) — Auth server-side con cookies httpOnly para Server Components: plan canónico de migración DC.13 + DC.6 + marker `TODO(ADR-078)` para trazabilidad mecánica + Fase 11.D del Sprint 11 como última excepción permitida del patrón `'use client' + localStorage` (Sprint 13 §13.AUTH cierra la deuda)
- [ADR-079](./adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md) — Tasks bridge unidireccional read-only + consolidación de notas con `source_system`/`source_id`/`triggered_by_action` (Sprint 16)
- [ADR-080](./adr-080-plugin-framework.md) — Plugin Framework: manifest declarativo (JSON-Schema 7 config + secrets schema) + tabla `plugin_installs` + `SecretVaultService` AES-256-GCM con `ENCRYPTION_KEY` env var + `key_version` para rotación + loader runtime desde DB + circuit breaker tras interface + 5 eventos canónicos `plugin.*` (Sprint 15A Fase A)
- [ADR-081](./adr-081-plugin-resellerclub-specifics.md) — Plugin ResellerClub specifics: auth `userid+api-key`, customer/contact lazy (PK `user_id` + advisory lock), renewal idempotente, mapping de estado→`ServiceInfoStatus` y errores RC→canónicos, sandbox OT&E, scope v1 por madurez (Sprint 15D)
- [ADR-082](./adr-082-modelo-domain-hosting-dns-doctrine.md) — Modelo Domain↔Hosting + DNS doctrine: 6 invariantes DH-INV + flujos de checkout F1–F5 + capability `has_dns_management` + NS-sync 3 capas + cross-plugin DNS authority resolver + (A2) zona post-register vía orquestador + lifecycle de expiración (Sprint 15C + 15D)
- [ADR-083](./adr-083-plugin-enhance-cp-specifics.md) — Plugin Enhance CP specifics: provisioning 6-step + customer lazy + reconcile defensivo + 35 decisiones frozen + amendments A1–A10 (Sprint 15C / 15C.II)
- [ADR-084](./adr-084-comercio-dominios-registrar.md) — Comercio de dominios: tabla `domain_tld_pricing` (TLD×operación×años) + checkout multi-ítem + invariantes de robustez DOM-INV-1..5 + FSM de transfer + catálogo de eventos `domain.*` (Sprint 15D)

---

## Documento legacy

`docs/DECISIONS.md` (~2.400 líneas, 48 §§) es el **origen histórico** de los ADRs. Tras completar F2 quedará en este estado:

- Header: "MIGRADO A ADRs. Ver `docs/10-decisions/`. Este archivo se conserva por historia."
- Cada §N original tiene un puntero al `ADR-NNN` correspondiente (cuando 1:1) o a múltiples ADRs (cuando una § se partió).

**No se borra** porque commits históricos referencian `DECISIONS.md §N`. Los enlaces deben seguir funcionando.

---

## Cómo se usa

### Para Claude (agente IA)

- **Antes de implementar algo arquitectónicamente significativo:** ¿hay ADR previo que aplica? Si sí, leer y respetar.
- **Si propones una decisión nueva:** crearla como ADR antes (no después) de codificar.
- **Si encuentras conflicto entre ADR y código actual:** flagear como bug — la decisión vigente debe respetarse.

### Para Yasmin

- **Antes de aprobar un cambio arquitectónico mayor:** pedir el ADR. Si no existe, debate antes de codificar.
- **Para reconstruir el "por qué":** los ADRs son tu memoria del proyecto.

---

## Validación futura (no implementada)

Cuando madure, posibles gates de CI:

- Cada ADR tiene los 7 campos de la plantilla
- Cada ADR `Active` no contradice a otros `Active`
- Cada referencia `ADR-NNN` en código/contracts apunta a un archivo real
- Cada §N de `DECISIONS.md` tiene puntero a su ADR correspondiente

Pendiente para sprint dedicado.

---

## Documentos relacionados

- [`_template-adr.md`](./_template-adr.md) — Plantilla canónica para ADRs nuevos
- [`_migration-plan.md`](./_migration-plan.md) — Plan de migración F2: cómo se mapean las 48 §§ originales a ~50 ADRs
- [`docs/00-foundations/rules.md`](../00-foundations/rules.md) — Reglas R1–R16 + D1–D11
- [`docs/00-foundations/glossary.md`](../00-foundations/glossary.md) — Términos canónicos
- [`docs/20-modules/`](../20-modules/) — Contracts por módulo (referencian ADRs)
- [`docs/DECISIONS.md`](../DECISIONS.md) — Documento legacy origen de los ADRs
