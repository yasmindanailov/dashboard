# ADR-063 — Infra BullMQ canónica + DLQ + retries con backoff exponencial

> **Status:** Active
> **Date:** 2026-04-26
> **Domain:** foundation, infrastructure, cross-cutting

---

## Contexto

[ADR-055](./adr-055-resiliencia-circuit-breaker.md) declaró que todo trabajo asíncrono usaría BullMQ con DLQ + retries con backoff exponencial. [ADR-056 §13.30+](./adr-056-estrategia-escalabilidad.md) añadió que escalar horizontalmente exige migrar crons in-process a jobs scheduled BullMQ con leader election natural.

A 2026-04-26, el estado real ([`jobs-reference.md`](../50-operations/jobs-reference.md)) es:

- **Lib instalada:** `@nestjs/bullmq` v11 + `bullmq` v5 ya en `backend/package.json`.
- **Colas BullMQ activas: 0.** Ningún `BullModule.registerQueue(...)` ni `@Processor(...)`.
- **Crons in-process: 7** (`@nestjs/schedule`, `@Cron(...)` o `@Interval(...)`).
- **DLQ: ❌** no implementada.
- **Panel `/admin/jobs/failed`: ❌** no existe.
- **Sprint 11.5 cerró con deuda controlada R2:** `InvoicePdfStorageService.generateAndUploadInBackground` ejecuta upload S3 con `setImmediate(...)` dentro del request — fire-and-forget síncrono. Documentado como "primer cliente de cola `pdf-generation`" en [`jobs-reference.md`](../50-operations/jobs-reference.md#crons-aspiracionales-documentados-no-implementados).
- **Outbox worker** (cierre P0.2) usa `@Interval(5000)` — funciona pero no es BullMQ; cuando el sistema escale a 2 instancias, **cada instancia ejecuta el dispatch en paralelo** (mitigado parcialmente por `FOR UPDATE SKIP LOCKED`, pero contradice ADR-056 §13.30).

Sin un patrón canónico para colas, DLQ y retries:

- Cada módulo que quiera trabajo asíncrono lo improvisa (`setImmediate`, `Promise.then().catch()`, `setTimeout` infinito).
- Los fallos se silencian (no hay tabla `failed_jobs`, no hay alerta superadmin).
- El admin no tiene UI para diagnosticar ni reintentar — la única vía es leer logs.
- Migrar a BullMQ "más tarde" será cada vez más caro: hay que refactorizar todos los call sites, no solo añadir uno.

Sprint 9 Fase A formaliza la decisión y construye la base de la que dependerán Fase B (cola `pdf-generation`), Fase C (Outbox dispatcher), Fase D (cola `notifications-dispatch`) y Fase F (UI admin).

> **¿Qué pasaría si NO tomáramos esta decisión?** Cada nuevo sprint añade trabajo asíncrono con su propia ad-hoc, y la deuda crece exponencialmente. Sprint 11.5 ya creó una. Sprint 14 (Deploy real) sería imposible sin DLQ — los emails fallidos en producción se pierden silenciosamente.

---

## Opciones consideradas

### A. Tecnología de colas

1. **BullMQ + Redis (existente)** ✅ elegido
   - Pros: ya instalado; funciona contra Redis (también ya instalado); soporte oficial NestJS (`@nestjs/bullmq`); leader election natural via Redis; DLQ y retries built-in; comunidad activa.
   - Contras: requiere Redis disponible (ya es dependencia dura del proyecto).
2. **AWS SQS / Google Pub/Sub**
   - Descartado: lock-in cloud específico, contradice ADR-043 (self-hosted).
3. **Postgres-as-a-queue (`pg-boss`, `graphile-worker`)**
   - Pros: cero dependencias nuevas, transaccional con DB.
   - Contras: rendimiento bajo, sin DLQ nativa, sin UI admin madura. Migración futura a Redis = retrabajo.
4. **RabbitMQ / NATS**
   - Descartado: añade un componente más al stack.

### B. Persistencia de jobs failed

1. **Solo Redis (BullMQ default)**
   - Pros: cero código.
   - Contras: si Redis se vacía (crash, reinicio sin persistencia), los jobs failed desaparecen. Sin trazabilidad histórica (¿cuántos PDFs fallaron este mes?).
2. **Tabla `failed_jobs` en Postgres + Redis** ✅ elegido
   - Pros: trazabilidad permanente; queries SQL para reportes; Redis sigue siendo source-of-truth de los jobs activos pero el "post-mortem" vive en DB.
   - Contras: doble persistencia. Mitigado: solo se escribe cuando un job alcanza estado `failed` (raro por diseño). Volumen bajo.

### C. Política de retries

1. **3 retries con backoff lineal (10s · 20s · 30s)**
   - Descartado: insuficiente para fallos transitorios largos (API caída 2 min).
2. **5 retries con backoff exponencial 30s → 480s + jitter ±10%** ✅ elegido (alineado con ADR-055)
   - Pros: cubre fallos transitorios típicos (caídas <8 min); jitter evita thundering herd.
   - Contras: el peor caso tarda ~17 min en llegar a DLQ. Aceptable.
3. **Retries infinitos hasta éxito**
   - Descartado: bug permanente (ej. payload corrupto) consume Redis indefinidamente.

### D. Alerta de DLQ

1. **Solo log (warn/error en Pino)**
   - Descartado: nadie lee logs en tiempo real; el admin no se entera.
2. **Notificación al superadmin via `system.error` event** ✅ elegido (cumple R7)
   - Pros: usa el bus de eventos existente; el listener `notifications-dlq.listener` despacha vía `NotificationsService` (Fase D) → campana + email.
   - Contras: si el envío de la notificación también falla, el `system.error` se loggea silencioso (aceptable — degradación controlada, ver ADR-064 EC-S9-07).

### E. UI de gestión

1. **Solo CLI / API**
   - Descartado: el admin no usa CLI; reintentos manuales serían burocracia.
2. **`/dashboard/admin/jobs/failed` con tabla + botón Reintentar** ✅ elegido (Fase F del Sprint 9)

---

## Decisión

### A. Tecnología y configuración

```typescript
// backend/src/core/jobs/jobs.module.ts
import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: (cfg: ConfigService) => ({
        connection: {
          url: cfg.getOrThrow<string>('REDIS_URL'),
          // Redis DB 1 reservada para BullMQ; DB 0 para cache de SettingsService
          db: 1,
        },
        prefix: 'aelium-jobs',
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: { age: 3600 },  // 1h
          removeOnFail: false,                // los failed quedan en Redis hasta intervención
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [DlqService, RetryService],
  exports: [BullModule, DlqService, RetryService],
})
export class JobsModule {}
```

**Variables de entorno (no nuevas — `REDIS_URL` ya existe):**

| Variable | Default dev | Notas |
|----------|-------------|-------|
| `REDIS_URL` | `redis://localhost:6379` | Compartida cache + BullMQ. Bases distintas (`/0` cache, `/1` BullMQ). |
| `BULLMQ_PREFIX` | `aelium-jobs` | Prefijo de keys en Redis. Permite múltiples entornos compartiendo Redis. |

### B. Política canónica de retries

| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| `attempts` | 5 | ADR-055 §Retries — cubre fallos transitorios típicos. |
| `backoff.type` | `'exponential'` | Mismo. |
| `backoff.delay` | `30_000` ms | Inicial 30s. Exponencial: 30s → 60s → 120s → 240s → 480s. |
| Jitter | ±10% | BullMQ no lo aplica nativo; lo añadimos en `defaultJobOptions` del processor cuando aplique (`backoff: { type: 'custom', delay: (attemptsMade) => 30_000 * 2**(attemptsMade-1) * (0.9 + Math.random() * 0.2) }`). |

**Override por cola permitido** cuando el caso lo justifique (ej. webhooks de Stripe con timeout más corto). Documentar en `jobs-reference.md`.

### C. Tabla `failed_jobs` (post-mortem)

```prisma
enum FailedJobStatus {
  failed     // recién entró en DLQ
  retrying   // admin pulsó "Reintentar", está re-procesándose
  resolved   // job re-procesado con éxito (audit trail)
}

model FailedJob {
  id              String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  job_id          String          @db.VarChar(200)            // BullMQ job.id
  queue           String          @db.VarChar(100)
  name            String          @db.VarChar(200)
  payload         Json
  last_error      String          @db.Text
  stack_trace     String?         @db.Text
  attempts_made   Int
  retried_at      DateTime?       @db.Timestamptz()
  retried_by      String?         @db.Uuid
  status          FailedJobStatus @default(failed)
  created_at      DateTime        @default(now()) @db.Timestamptz()

  @@index([queue, status])
  @@index([created_at])
  @@map("failed_jobs")
}
```

### D. `DlqService`

```typescript
// backend/src/core/jobs/dlq.service.ts
@Injectable()
export class DlqService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async onModuleInit() {
    // Por cada cola registrada, suscribirse a QueueEvents.failed
    // (la lista de colas se obtiene via BullMQ getQueues() o registro manual)
  }

  async onJobFailed(queue: string, job: Job, error: Error) {
    if (job.attemptsMade < (job.opts.attempts ?? 5)) return;  // todavía hay retries

    const failed = await this.prisma.failedJob.create({
      data: {
        job_id: job.id!,
        queue,
        name: job.name,
        payload: job.data as Prisma.InputJsonValue,
        last_error: error.message,
        stack_trace: error.stack ?? null,
        attempts_made: job.attemptsMade,
      },
    });

    this.events.emit('dlq.job_failed', {
      job_id: failed.id,
      queue,
      name: job.name,
      last_error: error.message,
      attempts_made: job.attemptsMade,
    });
  }
}
```

### E. `RetryService`

```typescript
@Injectable()
export class RetryService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('pdf-generation') private readonly pdfQueue: Queue,
    // ... otras colas inyectadas según se vayan creando
  ) {}

  async retry(failedJobId: string, actorId: string): Promise<void> {
    const failed = await this.prisma.failedJob.findUniqueOrThrow({ where: { id: failedJobId } });
    if (failed.status !== 'failed') {
      throw new BadRequestException('Job ya fue reintentado o resuelto');
    }

    const queue = this.resolveQueue(failed.queue);  // map nombre → instancia
    await queue.add(failed.name, failed.payload, {
      jobId: `retry-${failed.id}`,
      attempts: 5,  // resetea contador
    });

    await this.prisma.failedJob.update({
      where: { id: failedJobId },
      data: { status: 'retrying', retried_at: new Date(), retried_by: actorId },
    });
  }
}
```

### F. Naming de colas (convenio)

- **Plural en kebab-case:** `pdf-generation`, `outbox-dispatch`, `notifications-dispatch`.
- **Sin sufijo `-queue`** (redundante).
- **Prefijo de dominio cuando ayuda a desambiguar:** `billing-payments` (vs `billing-pdf`), `support-attachments`.

### G. Convenio de jobs

- **Idempotencia obligatoria:** todo job con side effects pasa `idempotency_key` en payload. El processor valida antes de ejecutar.
- **`jobId` estable cuando aplique:** ej. `invoice-pdf-{invoice_id}` para que `Queue.add()` duplicado sea no-op (BullMQ descarta si `jobId` ya existe).
- **Payload mínimo:** sólo IDs y campos imprescindibles. El processor lee el resto de DB. Reduce tamaño de Redis y evita stale data.

### H. Settings consumidos por la infra

Seedeados en `backend/prisma/seed.ts` — Sprint 9 Fase A:

| Setting | Default | Consumidor |
|---------|---------|------------|
| `jobs.default_retries` | 5 | `JobsModule.defaultJobOptions.attempts` |
| `jobs.backoff_initial_ms` | 30000 | `JobsModule.defaultJobOptions.backoff.delay` |
| `jobs.dlq_alert_to_superadmin` | true | `DlqService.onJobFailed()` — kill switch para entornos test |

### I. Métricas (futuro, no en Sprint 9)

ADR-055 §Monitoring describe métricas Prometheus (queue size, jobs/sec, failure ratio). Pendiente sprint dedicado de observabilidad cuando se conecte Prometheus en producción (Sprint 14 P1.4).

---

## Consecuencias

- ✅ **Ganamos:**
  - Patrón único para todo trabajo asíncrono. Cero ad-hoc.
  - DLQ persistente: ningún fallo se silencia (R13 cumplido por construcción).
  - UI admin para diagnóstico y reintento manual (Fase F).
  - Leader election natural via Redis: cuando se escale horizontalmente, un solo worker procesa cada job repeat.
  - Backoff exponencial con jitter: cubre fallos transitorios sin thundering herd.
  - Migración a SQS/RabbitMQ futura, si se necesita, es localizada al `JobsModule` — los call sites usan `Queue.add(...)` y son agnósticos.
- ⚠️ **Aceptamos:**
  - **Redis es dependencia dura.** Si Redis cae, todas las colas se detienen. Mitigación: `lazyConnect=true`, healthcheck `/health` lo refleja, app sigue respondiendo en read-only para flujos no-async.
  - **Doble persistencia (Redis + Postgres `failed_jobs`).** Aceptable: volumen bajo, beneficio de trazabilidad alto.
  - **Migración del `OutboxWorker` actual** (`@Interval(5s)`) a BullMQ exige cuidado para no perder eventos. Cubierto en ADR-064 (Sprint 9 Fase C).
  - **Crons in-process actuales NO se migran en Sprint 9.** Quedan en `@nestjs/schedule` hasta Sprint 13 Hardening. Implica que hasta entonces el sistema NO puede correr en 2+ instancias sin duplicar trabajo de billing lifecycle. Trade-off explícito: scope realista para el sprint.
- 🚪 **Cierra:**
  - **No se permite trabajo asíncrono nuevo fuera de BullMQ.** Cualquier `setImmediate`, `setTimeout` >100ms, `Promise.then().catch()` con side effects, o cron in-process añadido post-Sprint 9 debe ser rechazado en code review (excepción: hooks WS efímeros, debounces de UX).
  - **No DLQ ad-hoc por módulo.** Toda DLQ pasa por `failed_jobs` + `DlqService`.
  - **No reintento manual desde código.** El admin reintenta desde UI; el código no llama a `queue.add()` con payload de fila `failed_jobs` directamente.

---

## Cuándo revisar

- Cuando se escale a 2+ instancias del backend (Sprint 14+) — verificar leader election en jobs scheduled.
- Si Redis se vuelve cuello de botella (>10k jobs/min) — considerar particionado por cola en Redis Cluster.
- Si `failed_jobs` crece >1M filas — añadir cron de archivado a tabla histórica (Sprint 13 Hardening).
- Si surge un cuarto entorno donde Redis no esté disponible (ej. tests unitarios masivos) — proporcionar `MockJobsModule` con queue in-memory para testing aislado (hoy basta con `redis-memory-server` o el Redis de CI).

---

## Referencias

- **Módulos afectados:** `core/jobs/` (nuevo), `core/outbox/` (refactor en ADR-064), `modules/billing/` (cola `pdf-generation` en Fase B), `modules/notifications/` (cola `notifications-dispatch` en Fase D — ADR-065), `modules/error-log/` (consume `system.error` en Fase F).
- **Reglas relacionadas:** [R2](../00-foundations/rules.md#r2--todo-proceso-lento-va-a-la-cola-bullmq), [R7](../00-foundations/rules.md#r7--todos-los-errores-se-registran-y-notifican), [R13](../00-foundations/rules.md#r13--los-jobs-fallidos-nunca-desaparecen).
- **ADRs relacionados:** [ADR-055](./adr-055-resiliencia-circuit-breaker.md) (formaliza §DLQ y §Retries de aquí), [ADR-056](./adr-056-estrategia-escalabilidad.md) (motiva leader election), [ADR-033](./adr-033-outbox-pattern-pendiente.md) (Outbox migra en ADR-064), [ADR-042](./adr-042-sistema-notificaciones.md) (consumidor `notifications-dispatch` en ADR-065), [ADR-007](./adr-007-observabilidad.md) (correlation ID propagado en payloads).
- **Glosario:** [DLQ](../00-foundations/glossary.md), [Idempotencia](../00-foundations/glossary.md), [Job](../00-foundations/glossary.md), [Backoff exponencial](../00-foundations/glossary.md).
- **Catálogo:** [`jobs-reference.md`](../50-operations/jobs-reference.md) — actualizado en Sprint 9 G.2.
- **Sprint que implementa:** [Sprint 9 Fase A](../60-roadmap/current.md#fase-a--infra-bullmq--dlq-cierra-adr-055-base-de-todo).

---

## Notas de revisión

> **2026-04-29 (post [ADR-069](./adr-069-estrategia-deploy-diferido.md)):** las referencias internas de este ADR a "Sprint 14 P1.4" y "Sprint 14+" deben leerse como **Sprint 14 / P-DEPLOY** tras la reclasificación de ADR-069. La decisión técnica de este ADR no cambia; sólo cambia que Sprint 14 ya no está en cola activa por defecto, requiere trigger de negocio. Las consecuencias técnicas (Prometheus pendiente, leader election natural via Redis ya disponible) se mantienen.
