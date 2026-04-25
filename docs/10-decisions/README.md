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

- _(pendiente F2.B)_

### Support (ADR-034..040)

- _(pendiente F2.B)_

### Otros módulos (tasks, notifications, audit, infrastructure) (ADR-041..047)

- _(pendiente F2.C)_

### Partner & referrals (ADR-048..054)

- _(pendiente F2.C)_

### UI / landing / cross-cutting adicional (ADR-055..060)

- _(pendiente F2.C)_

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
