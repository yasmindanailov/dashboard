# ADR-064 — Outbox dispatcher migrado a BullMQ scheduled job + alerta `outbox.event_failed`

> **Status:** Active
> **Date:** 2026-04-27
> **Domain:** foundation, infrastructure, cross-cutting

---

## Contexto

[ADR-033](./adr-033-outbox-pattern-pendiente.md) cerró P0.2 (2026-04-26) con un `OutboxWorker` que despacha eventos persistidos en `event_outbox` vía `@Interval(5000)` + `FOR UPDATE SKIP LOCKED`. Funciona bien con una sola instancia del backend, pero deja **dos deudas explícitas** marcadas en su sección §7:

1. **Sin alerta automática al superadmin** cuando una fila Outbox alcanza `max_retries` y queda en `failed`. R7 (errores se notifican) lo exige; el código no lo cumple porque no había bus de notificaciones.
2. **`@Interval(5s)` no es escalable horizontalmente.** [ADR-056 §13.30+](./adr-056-estrategia-escalabilidad.md) exige migración a un job BullMQ scheduled (con leader election natural via Redis) antes de añadir una segunda instancia del backend. Hoy, si Yasmin escala a 2 instancias, ambas ejecutarían `@Interval` cada 5s — `FOR UPDATE SKIP LOCKED` previene corrupción de filas, pero el cron compite por el mismo lote y desperdicia recursos. En jobs scheduled BullMQ, **un solo worker** procesa cada job repeat aunque haya N instancias.

Adicionalmente, el `processEvent()` actual al fallar incrementa `retry_count` y devuelve la fila a `pending` para el siguiente tick (5s). Esto significa **backoff lineal de 5s** sin importar el tipo de fallo. Para errores transitorios largos (ej. listener que llama a un API externa con caída de 1 min) consume retries inútilmente: 5 intentos × 5s = 25s, muy por debajo del [ADR-055](./adr-055-resiliencia-circuit-breaker.md) que exige 30s→480s con backoff exponencial.

Sprint 9 Fase A construyó la infra BullMQ canónica (ADR-063). Sprint 9 Fase B la usó por primera vez para `pdf-generation`. Esta ADR formaliza la **segunda cola**: `outbox-dispatch` — un repeat job que sustituye `@Interval` y un mecanismo nuevo para retries con backoff exponencial.

> **¿Qué pasaría si NO tomáramos esta decisión?** Cuando Yasmin escale a 2 instancias en Sprint 14, los dispatchers compiten cada 5s y consumen capacidad sin valor adicional. Si una fila Outbox llega a `failed` por bug en un listener crítico (ej. `invoice.paid` con email rechazado por SMTP roto), nadie se entera hasta que un cliente llama por teléfono diciendo que no recibió la factura. Es exactamente el modo de fallo que R8 + ADR-033 quieren prevenir.

---

## Opciones consideradas

### A. Mecanismo de scheduling

1. **Mantener `@Interval(5s)` y añadir leader election manual via Redis lock**
   - Pros: cero migración del worker actual.
   - Contras: lock manual = código frágil. Ya tenemos BullMQ que lo resuelve canónicamente. Inconsistente con ADR-063 (BullMQ es el patrón canónico).
2. **Migrar a `BullModule.registerQueue('outbox-dispatch')` con `repeat: { every: 5000 }`** ✅ elegido
   - Pros: leader election natural via Redis; consistencia con `pdf-generation`; UI futuro `/admin/jobs/failed` lo monitoriza igual que cualquier otra cola.
   - Contras: coste de añadir 1 queue + 1 processor. Aceptable.
3. **Cambiar a Postgres `LISTEN/NOTIFY` para despachar en tiempo real**
   - Pros: latencia 0ms.
   - Contras: cambio arquitectónico mayor. ADR-033 ya eligió tabla + worker tick. No revisamos la decisión, sólo el mecanismo del tick.

### B. Backoff de retries de eventos (cuando un listener falla)

1. **Mantener "vuelve a `pending` para el próximo tick" (lineal 5s)**
   - Descartado: contradice ADR-055 (exponencial 30s→480s).
2. **Backoff exponencial en `next_retry_at` columna nueva** ✅ elegido
   - Cuando un listener falla y `retry_count < max_retries`, el row vuelve a `pending` con un nuevo campo `next_retry_at = now() + delay(retry_count)`.
   - El `claimBatch()` filtra `WHERE status='pending' AND (next_retry_at IS NULL OR next_retry_at <= now())`.
   - Delay: `30_000 * 2^retry_count` capado a 480s. Coincide con los defaults de ADR-063.
   - Requiere migración Prisma (campo `next_retry_at` en `event_outbox`).
3. **Encolar cada evento individualmente en BullMQ con `delay`**
   - Descartado: doble-libro entre tabla `event_outbox` y BullMQ. ADR-033 mantiene Postgres como source-of-truth para los eventos persistidos.

### C. Alerta cuando un evento llega a `failed`

1. **Sólo log Pino**
   - Descartado: ya existe; nadie lo vigila.
2. **Emit evento `outbox.event_failed` consumido por `notifications-outbox.listener` (Fase D)** ✅ elegido
   - El emit ocurre tras `UPDATE event_outbox SET status='failed'` cuando `retry_count >= max_retries`.
   - El listener se introduce en Fase D del Sprint 9 (junto con `NotificationsService`); por ahora el evento se emite y queda huérfano (mismo patrón que `dlq.job_failed` de Fase A).
   - Cumple R7 + cierra ADR-033 §7.

---

## Decisión

### A. Cola `outbox-dispatch` (Sprint 9 Fase C)

```typescript
// backend/src/core/outbox/outbox.module.ts
@Global()
@Module({
  imports: [
    BullModule.registerQueue({ name: 'outbox-dispatch' }),
  ],
  providers: [OutboxService, OutboxWorker, OutboxDispatchProcessor],
  exports: [OutboxService],
})
export class OutboxModule {}
```

```typescript
// backend/src/core/outbox/outbox-dispatch.processor.ts
const REPEAT_JOB_NAME = 'outbox-tick';
const REPEAT_EVERY_MS = 5_000;

@Processor('outbox-dispatch')
export class OutboxDispatchProcessor extends WorkerHost implements OnModuleInit {
  constructor(
    private readonly worker: OutboxWorker,
    private readonly dlq: DlqService,
    private readonly retry: RetryService,
    @InjectQueue('outbox-dispatch') private readonly queue: Queue,
  ) { super(); }

  async onModuleInit(): Promise<void> {
    this.dlq.register('outbox-dispatch');
    this.retry.register('outbox-dispatch', this.queue);

    // Idempotencia: borrar y re-añadir el repeat ante hot-reload o cambios de cron.
    const repeatables = await this.queue.getJobSchedulers();
    for (const r of repeatables) {
      if (r.name === REPEAT_JOB_NAME) await this.queue.removeJobScheduler(r.key);
    }

    await this.queue.upsertJobScheduler(
      REPEAT_JOB_NAME,
      { every: REPEAT_EVERY_MS },
      { name: REPEAT_JOB_NAME, opts: { removeOnComplete: { count: 50 } } },
    );
  }

  async process(): Promise<void> {
    await this.worker.dispatch();
  }
}
```

El `OutboxWorker.dispatch()` actual permanece intacto (mismo `claimBatch` + `processEvent`). Lo único que cambia es **quién lo invoca**: ya no `@Interval`, sino el processor de la cola.

### B. Backoff exponencial en `event_outbox`

#### Migración Prisma

```prisma
model EventOutbox {
  id            String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  event_type    String      @db.VarChar(200)
  payload       Json
  status        EventStatus @default(pending)
  retry_count   Int         @default(0)
  max_retries   Int         @default(5)
  last_error    String?
  processed_at  DateTime?   @db.Timestamptz()
  next_retry_at DateTime?   @db.Timestamptz()  // ← Sprint 9 Fase C (ADR-064)
  created_at    DateTime    @default(now()) @db.Timestamptz()

  @@index([status, next_retry_at])  // claim batch ordenado por elegibilidad
  @@index([created_at])
  @@map("event_outbox")
}
```

#### `claimBatch` filtra elegibilidad

```sql
SELECT id, event_type, payload, retry_count, max_retries
FROM event_outbox
WHERE status = 'pending'
  AND (next_retry_at IS NULL OR next_retry_at <= now())
ORDER BY created_at ASC
LIMIT $1
FOR UPDATE SKIP LOCKED
```

#### Cuando un listener falla

```typescript
const delayMs = Math.min(
  30_000 * 2 ** retry_count,   // 30s → 60s → 120s → 240s → 480s
  480_000,                      // cap
);
const nextRetryAt = new Date(Date.now() + delayMs);

if (retry_count + 1 >= max_retries) {
  await this.prisma.eventOutbox.update({
    where: { id },
    data: { status: 'failed', retry_count: { increment: 1 }, last_error },
  });
  this.events.emit('outbox.event_failed', {
    event_outbox_id: id,
    event_type,
    last_error,
    retry_count: retry_count + 1,
  });
} else {
  await this.prisma.eventOutbox.update({
    where: { id },
    data: {
      status: 'pending',
      retry_count: { increment: 1 },
      last_error,
      next_retry_at: nextRetryAt,
    },
  });
}
```

### C. Evento `outbox.event_failed`

| Aspecto | Valor |
|---------|-------|
| Emisor | `OutboxWorker.processEvent()` cuando `retry_count + 1 >= max_retries` |
| Payload | `{ event_outbox_id: string; event_type: string; last_error: string; retry_count: number }` |
| Outbox | **No** — es un evento de mantenimiento operativo (no de negocio). Si se pierde por crash entre emit y listener, el siguiente arranque puede recuperar consultando `SELECT * FROM event_outbox WHERE status='failed' AND created_at > X`. |
| Consumidor | `notifications-outbox.listener` (Fase D del Sprint 9). Mientras Fase D no se cierre, el evento queda huérfano (degradación aceptada — el row sigue persistido en `failed` para revisión manual). |
| Catálogo | Documentado en `_events.md` § Operational events. |

### D. Convivencia durante el despliegue

Cualquier despliegue del nuevo dispatcher debe garantizar idempotencia frente al `@Interval` legacy:

1. El nuevo processor invoca `OutboxWorker.dispatch()` — método que ya existe.
2. El `@Interval(5000)` se elimina del `OutboxWorker` en el mismo PR.
3. Si por error ambos coexisten temporalmente, no hay corrupción: `FOR UPDATE SKIP LOCKED` impide doble emisión del mismo row.

### E. Crash recovery

`OutboxWorker.onModuleInit()` actual recupera filas atascadas en `processing` → `pending`. Esa lógica permanece. Adicionalmente:

- Las filas con `next_retry_at` en el pasado vuelven a entrar en `claimBatch` automáticamente.
- Si BullMQ pierde el repeat job (Redis flush), `OutboxDispatchProcessor.onModuleInit()` lo re-registra (`upsertJobScheduler` es idempotente).

---

## Consecuencias

- ✅ **Ganamos:**
  - **Leader election natural** — Sprint 14 puede escalar a N instancias sin coordinación adicional.
  - **Backoff exponencial cumple ADR-055** — eventos transitorios sobreviven caídas hasta 8 min.
  - **R7 cierra para Outbox** — cualquier evento `failed` levanta `outbox.event_failed` que (post Fase D) notifica al superadmin.
  - **Consistencia con `pdf-generation`** — ambas colas usan el mismo `DlqService`, `RetryService` y monitoring futuro `/admin/jobs/failed`.
  - **Cierra ADR-033 §7 y §3 al 100%.**
- ⚠️ **Aceptamos:**
  - **Migración Prisma con campo nuevo + índice nuevo** sobre `event_outbox`. Tabla pequeña en producción esperada (TPS bajo); coste de migración aceptable.
  - **`outbox.event_failed` queda huérfano hasta Fase D.** El row Outbox persiste como `failed` para revisión manual via `SELECT`; no hay UI todavía. Plan de cierre: Fase F del Sprint 9 (`/admin/jobs/failed` también lista rows Outbox `failed`, no sólo `failed_jobs`).
  - **El repeat job ocupa una entrada en BullMQ** continuamente. Coste despreciable (1 entrada).
- 🚪 **Cierra:**
  - **No `@Interval` con side effects en código nuevo post Sprint 9 Fase C.** Cualquier polling debe ir por BullMQ scheduled (consistente con ADR-063).
  - **No incrementar `retry_count` sin establecer `next_retry_at`** — el `processEvent` debe hacer ambos en la misma `UPDATE`.
  - **No emit directo de `EventEmitter2.emit()` en código transaccional crítico** (ya regulado por R8 + ADR-033 — esta ADR refuerza el monitoring del flujo).

---

## Cuándo revisar

- Si el throughput de eventos supera 100 ev/s — revisar tamaño de `claimBatch` (hoy 50) o paralelismo del processor.
- Si `next_retry_at` con cap a 480s no cubre fallos persistentes esperados — extender cap o introducir backoff custom por `event_type`.
- Si BullMQ Redis se vuelve cuello de botella — el repeat job es el componente más sensible. Considerar partición por dominio (`outbox-dispatch-billing`, `outbox-dispatch-partner`).
- Si Sprint 14 Deploy revela latencias inesperadas en propagación de `invoice.paid` → cliente — revisar `REPEAT_EVERY_MS` (hoy 5s).

---

## Referencias

- **Módulos afectados:** `core/outbox/` (refactor), `core/jobs/` (consumidor de patrón canónico ADR-063), `modules/billing/` (productores `invoice.*` que dependen del dispatcher).
- **Reglas relacionadas:** [R2](../00-foundations/rules.md#r2--), [R7](../00-foundations/rules.md#r7--), [R8](../00-foundations/rules.md#r8--), [R13](../00-foundations/rules.md#r13--).
- **ADRs relacionados:** [ADR-033](./adr-033-outbox-pattern-pendiente.md) (cierra §7 + §3), [ADR-055](./adr-055-resiliencia-circuit-breaker.md) (motiva backoff exponencial), [ADR-056](./adr-056-estrategia-escalabilidad.md) (motiva leader election), [ADR-063](./adr-063-bullmq-canonico-dlq-retries.md) (infra base).
- **Glosario:** [Outbox](../00-foundations/glossary.md), [DLQ](../00-foundations/glossary.md), [Backoff exponencial](../00-foundations/glossary.md), [Leader election](../00-foundations/glossary.md).
- **Sprint que implementa:** [Sprint 9 Fase C](../60-roadmap/current.md#fase-c--outbox-worker-hardening-cierra-adr-033-7-y-3).
