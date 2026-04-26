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
