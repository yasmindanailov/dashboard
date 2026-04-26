# ADR-056 — Estrategia de escalabilidad (Sprint 13 ampliado)

> **Status:** Active (planificada — Sprint 13 ampliado)
> **Date:** 2026-04 · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §45
> **Domain:** cross-cutting

---

## Contexto

Aelium hoy opera con **monolito modular en NestJS + PostgreSQL + Redis + Docker Compose en un servidor propio** (ADR-043). La pregunta natural en cada sprint es: **¿esto escala?**

Hay dos respuestas erróneas comunes:

1. **"Migremos a microservicios y Kubernetes ya"** — añade complejidad operativa enorme sin beneficio real para esta escala.
2. **"No te preocupes, escala solo"** — falso. Hay cuellos de botella concretos en el código actual que **se romperán** al crecer.

La respuesta correcta es: **identificar los cuellos de botella concretos, fijar umbrales de acción, y resolverlos cuando se acerquen**. No antes (premature optimization), no después (firefighting).

Este ADR documenta el **mapa de riesgos identificados, sus mitigaciones, los sprints donde se atacan, y los umbrales que disparan acción**.

---

## Decisión

### Principio fundamental

**La arquitectura actual (monolito modular + PostgreSQL + Docker Compose) es correcta para escalar a miles de clientes.** No se necesitan microservicios, Kubernetes, ni GraphQL.

Lo que se necesita: **eliminar cuellos de botella concretos en los sistemas existentes**.

### Riesgos identificados, mitigaciones y sprint asignado

| Riesgo | Impacto | Solución | Sprint |
|--------|---------|----------|--------|
| **Single Point of Failure** | Todo cae si el servidor cae | Backups PostgreSQL automatizados + plan de recovery | 14 |
| **JWT en localStorage** | XSS roba tokens de todos los clientes | Migrar a HttpOnly cookies + CSRF token | 13.1 |
| **Socket.io single instance** | No se puede escalar horizontalmente (sticky sessions imposibles sin adapter) | `@socket.io/redis-adapter` (~10 líneas de cambio) | 13.30 |
| **Queries N+1 con Prisma** | Base de datos se degrada con carga | Auditar listados, usar `include` o `$queryRaw` para JOINs | 13.31 |
| **Offset pagination en messages** | Se degrada con millones de filas (`OFFSET` lee todas las filas anteriores) | Cursor-based pagination (`WHERE created_at < ?`) | 13.32 |
| **Sin caching layer general** | Queries repetitivas al DB en cada request | Redis caching con TTL por tipo de dato (catálogo 5min, settings 1min) | 13.33 |
| **Crecimiento sin límite de messages** | Tabla crece indefinidamente (chats antiguos no se borran) | Archival de mensajes de conversaciones cerradas >6 meses | 13.34 |

### Lo que NO se cambia

- **Monolito modular** → correcto para esta escala. Microservicios añaden complejidad sin beneficio.
- **PostgreSQL** → maneja millones de filas sin problema; los cuellos están en queries mal escritas, no en el motor.
- **Prisma ORM** → limitaciones conocidas, pero cambiar ORM ahora es más riesgo que beneficio. Para hot paths críticos: `$queryRaw` puntual.
- **Docker Compose** → superior a K8s para esta escala operativa (ADR-043).
- **REST** → correcto. GraphQL no aporta beneficio para un dashboard interno.

### Umbrales de acción

| Umbral (clientes activos) | Acción |
|---------------------------|--------|
| **< 1.000** | La arquitectura actual es suficiente. No hacer nada extra. |
| **1.000–5.000** | Aplicar Sprint 13.30–13.33: Socket.io adapter + N+1 audit + cursor pagination + Redis caching general. |
| **5.000–10.000** | Read replica PostgreSQL (DB principal escribe; replica sirve lecturas pesadas). Archival de mensajes (Sprint 13.34). |
| **> 10.000** | Evaluar separación de workers (instancia dedicada para BullMQ). CDN para MinIO si los assets pesan. Considerar segundo servidor de aplicación. |

Estos umbrales son **disparadores explícitos** — no se hace antes "por si acaso", no se descubre después por incidente.

### Crons in-process (deuda conocida)

Los crons hoy usan `@nestjs/schedule` (in-process). Esto **duplica trabajo** si se escala a múltiples instancias de la API (cada instancia ejecuta el cron). Solución cuando aplique (Sprint 13.30 o posterior):

- Migrar crons a **BullMQ jobs scheduled** (`Queue.add(jobName, data, { repeat: { cron: '0 3 * * *' } })`).
- Los workers de BullMQ tienen leader election natural (un solo worker procesa cada job).
- **Antes de escalar instancias, esto debe estar resuelto** o se duplican facturas, mantenimientos, payouts.

### Backup y recovery (Sprint 14.6)

Plan de recovery documentado en `docs/50-operations/backup-recovery.md` (futuro F5):

- Backups automatizados de PostgreSQL: diario completo + cada 6h incremental WAL (ADR-043).
- Test de restauración mensual obligatorio.
- RTO objetivo: **< 4 horas** desde detección hasta servicio operativo.
- RPO objetivo: **< 6 horas** de datos perdidos en peor caso.

### Patrón de escalado: estado fuera de la app

Desde el día 1:
- API NestJS **stateless** — el estado vive en PostgreSQL y Redis.
- Sesiones en JWT firmado (no en memoria del servidor).
- Cola BullMQ compartida via Redis — cualquier worker ejecuta cualquier job.
- WebSockets con `@socket.io/redis-adapter` — varias instancias de Socket.io coexisten.

Esto significa: **escalar horizontalmente** (más instancias) **no requiere cambios de código** una vez resueltos los cuellos del Sprint 13.

---

## Consecuencias

- ✅ **Ganamos:**
  - **Mapa explícito de cuellos de botella** — sabemos qué hacer y cuándo.
  - **No premature optimization** — no se invierte trabajo en escalar lo que no es problema.
  - **Disparadores claros** — los umbrales evitan firefighting reactivo.
  - **Arquitectura simple mantenida** mientras siga funcionando.
- ⚠️ **Aceptamos:**
  - **El primer crecimiento (< 1.000 clientes)** se hace sin acciones específicas — riesgo de descubrir cuellos no anticipados. Mitigación: monitoring activo (Grafana + Prometheus).
  - **La migración de JWT en localStorage a HttpOnly cookies** rompe APIs externas que dependen del header Authorization. Mitigación: documentar breaking change en la API v1 → v2 si aplica (cuando llegue).
  - **Read replica añade complejidad** (lag de replicación, decisiones de cuándo leer dónde). Mitigación: solo cuando sea necesario (>5k clientes).
  - **Archival de mensajes** introduce concepto de "mensajes recientes vs históricos" — UX necesita gestionarlo (vista "ver mensajes antiguos").
- 🚪 **Cierra:**
  - **No microservicios** hasta que la operativa lo justifique (no esperado en años).
  - **No Kubernetes** hasta que la complejidad de Docker Compose se rompa (no esperado en esta escala).
  - **No GraphQL** — REST es la decisión.
  - **No escalar instancias sin resolver crons in-process** primero.

---

## Cuándo revisar

- Cada paso de umbral (1k, 5k, 10k clientes) → revisar este ADR y aplicar las acciones del tier correspondiente.
- Si surge cuello no anticipado (ej: PostgreSQL se queda sin conexiones) → añadir al mapa y decidir solución.
- Si la arquitectura monolítica empieza a generar fricción de despliegue (varios equipos pisándose, deploys lentos) → reconsiderar separación de workers o módulos críticos.
- Si Aelium pivota a multi-tenant SaaS → reescritura mayor (no es el caso hoy — un solo negocio, ADR-001).

---

## Referencias

- **Módulos afectados:** todos (escalabilidad es transversal).
- **Reglas relacionadas:** R5 (cálculos en backend — necesario para que cache funcione), R8 (Outbox — bloquea escalado de eventos críticos), R11 (circuit breaker — escalado depende de no saturar APIs externas).
- **ADRs relacionados:** ADR-002 (stack backend), ADR-043 (infraestructura self-hosted — base que escala), ADR-007 (observabilidad — Grafana es la fuente de los disparadores), ADR-055 (resiliencia — los retries amortiguan picos de carga), ADR-033 (Outbox pendiente — bloquea escalar instancias).
- **Glosario:** [Read replica](../00-foundations/glossary.md), [Cursor pagination](../00-foundations/glossary.md), [Stateless](../00-foundations/glossary.md), [Archival](../00-foundations/glossary.md).
- **Sprint asignado:** 13 (mejoras 13.1, 13.30-13.34) + 14.6 (backups + recovery plan).
- **Documento futuro:** `docs/50-operations/backup-recovery.md` (F5).
