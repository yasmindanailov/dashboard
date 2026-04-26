# Jobs & Crons Reference — Aelium Dashboard

> **Catálogo canónico de TODOS los crons y jobs BullMQ.**
> Si vas a programar trabajo asíncrono → consulta este archivo para no duplicar. Si vas a añadir uno nuevo → añádelo aquí en el mismo PR.

> **Última auditoría:** 2026-04-26 — F5.
> **Crons in-process activos:** 7 (todos en `@nestjs/schedule`).
> **Jobs BullMQ implementados:** 0 — librería instalada pero **sin colas registradas**. **Deuda crítica** ([ADR-056](../10-decisions/adr-056-estrategia-escalabilidad.md)).
> **Crons aspiracionales:** 4 documentados en ADRs sin implementación todavía.

---

## Resumen ejecutivo

| Métrica | Valor |
|---------|-------|
| Crons `@Cron` activos | 7 |
| Jobs BullMQ activos | **0** |
| DLQ implementada | ❌ ([ADR-055](../10-decisions/adr-055-resiliencia-circuit-breaker.md) la describe — bloqueada hasta tener BullMQ) |
| Panel `/dashboard/admin/jobs/failed` | ❌ pendiente |
| Crons que emiten eventos críticos sin Outbox | 4 (`detectOverdueInvoices`, `generatePendingInvoices`, `autoSuspendServices`, `autoCancelServices`) — **deuda R8** |

**⚠️ Bloqueo arquitectónico para escalar horizontalmente:** todos los crons corren in-process. Si se añade una segunda instancia del backend, **cada cron se ejecuta dos veces** = facturas duplicadas, suspensiones duplicadas, etc. Antes de escalar, **migrar a BullMQ scheduled jobs** (con leader election natural — un solo worker procesa cada job repeat). Ver ADR-056 §13.30+.

**Indicadores:**
- ✅ Cron/job activo y consumido
- 🟡 Implementado pero sin uso real todavía
- ❌ Documentado pero NO implementado
- ⚠️ Sin Outbox para evento crítico que emite

---

## Crons in-process activos (`@nestjs/schedule`)

### 💳 Billing lifecycle (6 crons)

| Cron | Schedule | Módulo | Qué hace | Eventos que emite | Estado |
|------|----------|--------|----------|-------------------|--------|
| `detectOverdueInvoices` | `EVERY_DAY_AT_1AM` (01:00) | billing | Marca facturas `pending` con `due_date < now` como `overdue` | `invoice.overdue` | ✅ ⚠️ sin Outbox |
| `generatePendingInvoices` | `EVERY_DAY_AT_2AM` (02:00) | billing | Genera facturas para servicios activos próximos a vencer (según `billing.invoice_advance_days`) | `invoice.created` | ✅ ⚠️ sin Outbox |
| `retryOverduePayments` | `EVERY_6_HOURS` | billing | Reintenta cobros en facturas `overdue` con `next_retry_at` vencido (hasta `billing.max_payment_retries`) | `payment.retry_attempt`, `invoice.failed` (al agotar) | ✅ ⚠️ |
| `autoSuspendServices` | `EVERY_DAY_AT_3AM` (03:00) | billing | Suspende servicios cuyas facturas agotaron reintentos y superan `billing.grace_period_days` | `service.suspended` | ✅ ⚠️ sin Outbox + huérfano (provisioning ausente) |
| `autoCancelServices` | `EVERY_DAY_AT_4AM` (04:00) | billing | Cancela servicios suspendidos tras `billing.cancellation_after_suspension_days` | `service.cancelled` | ✅ ⚠️ sin Outbox + huérfano |
| `checkPauseExpiration` | `EVERY_DAY_AT_5AM` (05:00) | billing | Reanuda servicios pausados cuya `pause_max_date` ya pasó | `service.resumed` | ✅ huérfano (provisioning ausente) |

**Cadena lógica del ciclo de vida (visión global):**

```
Día N:  generatePendingInvoices (02:00)  →  factura nueva 'pending'
        detectOverdueInvoices    (01:00)  →  pending → overdue (si vencidas ayer)
        retryOverduePayments     (cada 6h)→  intenta cobrar overdue
                                              └→ si éxito: invoice.paid (manual hoy via plugin manual)
                                              └→ si agota retries: invoice.failed
        autoSuspendServices      (03:00)  →  suspende servicios con invoice.failed antiguo
        autoCancelServices       (04:00)  →  cancela tras grace period
        checkPauseExpiration     (05:00)  →  reanuda los pausados que vencieron
```

### 💬 Support cleanup (1 cron)

| Cron | Schedule | Módulo | Qué hace | Eventos | Estado |
|------|----------|--------|----------|---------|--------|
| `cleanupExpiredGuestSessions` | `EVERY_DAY_AT_6AM` (06:00) | support | Cierra sesiones guest expiradas (>30 días sin actividad — configurable `support.guest_session_ttl_days`) | `guest_session.expired` (si está catalogado — verificar) | ✅ |

---

## Jobs BullMQ activos

**Ninguno todavía.** Las librerías `@nestjs/bull` y `bull` están instaladas en `node_modules/`, pero:

- ❌ No hay `BullModule.registerQueue(...)` en `app.module.ts` ni en módulos individuales.
- ❌ No hay clases con `@Processor(...)` / `WorkerHost`.
- ❌ No hay `Queue.add(...)` en código.

Ver [ADR-056 §13.30+](../10-decisions/adr-056-estrategia-escalabilidad.md) — migración planificada cuando aplique.

### Defaults globales esperados (cuando se implemente — [ADR-055](../10-decisions/adr-055-resiliencia-circuit-breaker.md))

| Parámetro | Valor |
|-----------|-------|
| Reintentos | 5 |
| Backoff | Exponencial (30s → 60s → 120s → 240s → 480s) |
| Jitter | ±10% (evitar thundering herd) |
| DLQ | Jobs `failed` quedan en Redis indefinidamente, generan `system.error` al superadmin |
| Idempotencia | Obligatoria — `idempotency_key` en payload de jobs con side effects |

### Configuración Redis (cuando se conecte BullMQ)

| Variable env | Default | Notas |
|--------------|---------|-------|
| `REDIS_URL` | `redis://localhost:6379` (host `redis` en Docker Compose) | Compartido entre cache y BullMQ — usar bases distintas (`/0` cache, `/1` BullMQ) |
| `BULLMQ_PREFIX` | `aelium-jobs` | (cuando se configure) |

---

## Crons aspiracionales (documentados, no implementados)

| Cron | Origen | Objetivo | Sprint estimado |
|------|--------|----------|-----------------|
| **Retención RGPD** | [ADR-010](../10-decisions/adr-010-rgpd-retencion-datos.md) | Diario: anonimizar conversaciones cerradas >2 años, borrar `audit_*_log` >2 años | Sprint dedicado RGPD (sin asignar) — **deuda crítica legal** |
| **Preparación numeración año siguiente** | [ADR-025](../10-decisions/adr-025-numeracion-secuencial-facturas.md) | Fin de noviembre: `CREATE SEQUENCE invoice_number_seq_<YEAR+1>` | Sprint billing futuro — necesario para RD 1619/2012 |
| **Expurgo housekeeping** | [ADR-030](../10-decisions/adr-030-periodo-gracia-reintentos.md) | Limpiar datos de servicios completamente cancelados tras `billing.data_retention_after_suspension_days` | Sprint dedicado |
| **Borrado de notificaciones leídas** | [ADR-060](../10-decisions/adr-060-decisiones-pre-schema.md), [ADR-042](../10-decisions/adr-042-sistema-notificaciones.md) | Diario: `DELETE FROM notifications WHERE status='read' AND read_at < now() - interval N days` (configurable `notifications.retention_days`) | Sprint 11 (notifications) |
| **Cron mensual de comisiones partner** | [ADR-051](../10-decisions/adr-051-partner-comisiones-liquidaciones.md) | 1 del mes a las 03:00 UTC: agrupar `partner_commissions` accrued del mes pasado, generar `partner_payouts`, transferir SEPA / Stripe Connect | Fase 2 partner — **debe usar BullMQ + Outbox** |
| **Cron mensual de créditos referidos** | [ADR-054](../10-decisions/adr-054-sistema-referidos-clientes.md) | 1 del mes a las 04:00 UTC: por cada referral activo con servicios, generar `referral_credit` accrued | Sprint dedicado tras Fase 2 |
| **Cron expiración de créditos referidos** | [ADR-054](../10-decisions/adr-054-sistema-referidos-clientes.md) | Diario: marcar como `expired` los `referral_credits` con `accrued_at + credit_expiry_months < now()` | Sprint dedicado |
| **Cron alertas de mantenimiento crítico** | [ADR-041](../10-decisions/adr-041-sistema-tareas.md), [ADR-042](../10-decisions/adr-042-sistema-notificaciones.md) | Diario: tareas `maintenance` cuyo `due_date - now < support.maintenance_critical_threshold_days` → notificación al agente + admin | Cierre Sprint 8 + Sprint 11 |
| **Cron creación tareas mensuales de mantenimiento** | [ADR-041](../10-decisions/adr-041-sistema-tareas.md) | Mensual en fecha de aniversario: por cada slot activo, crear tarea `maintenance` o `maintenance_mgmt` | Cierre Sprint 8 |

---

## Eventos emitidos por crons (resumen)

| Evento | Emisor (cron) | Consumidor actual | Outbox |
|--------|---------------|--------------------|--------|
| `invoice.created` | `generatePendingInvoices` | `billing-email.listener` | ❌ |
| `invoice.overdue` | `detectOverdueInvoices` | `billing-email.listener` | ❌ |
| `invoice.failed` | `retryOverduePayments` (al agotar) | `billing-email.listener` | ❌ |
| `service.suspended` | `autoSuspendServices` | _(huérfano — espera provisioning)_ | ❌ |
| `service.cancelled` | `autoCancelServices` | _(huérfano — espera provisioning)_ | ❌ |
| `service.resumed` | `checkPauseExpiration` | _(huérfano — espera provisioning)_ | ❌ |

**Riesgo R8:** los 4 eventos `invoice.*` salen de un cron — si el proceso muere entre commit DB y `emit`, el cliente no se entera de su factura. Por eso `invoice.*` es el primer candidato para Outbox.

---

## Monitoring de jobs (planificado)

[ADR-055](../10-decisions/adr-055-resiliencia-circuit-breaker.md) describe pero NO está implementado:

- **Panel `/dashboard/admin/jobs/failed`** — listar jobs failed en Redis, ver detalles, **reintentar manualmente**.
- **Notificación `system.error`** al superadmin cuando un job entra en DLQ.
- **Métricas Prometheus** sobre cola: tamaño, jobs procesados/seg, ratio failures.

Bloqueado hasta que existan jobs BullMQ.

---

## Cómo añadir un cron / job nuevo

1. **¿Es trabajo periódico?** → cron.
   - **Hoy (in-process):** `@Cron('expression')` en un service NestJS.
   - **Cuando se migre a BullMQ:** `Queue.add(jobName, payload, { repeat: { pattern: 'cron-expr' } })`.
2. **¿Es trabajo puntual disparado por evento o request?** → job BullMQ (cuando se implemente).
3. **¿Emite eventos críticos (transición de estado, cambio de dinero, gestión de servicio)?** → **Outbox obligatorio** ([ADR-033](../10-decisions/adr-033-outbox-pattern-pendiente.md)).
4. **¿Es idempotente?** Si no, añadir `idempotency_key` al payload y guard al inicio.
5. **Documentar aquí**: nombre, schedule, módulo, qué hace, eventos que emite, estado.
6. **Documentar el evento** en `docs/20-modules/_events.md` si emite uno nuevo.

### Plantilla mínima de cron

```typescript
@Cron('0 3 * * *', { name: 'autoSuspendServices', timeZone: 'UTC' })
async autoSuspendServices() {
  const correlationId = randomUUID();  // R9
  this.logger.log({ correlationId, msg: 'autoSuspendServices start' });

  // ... lógica idempotente — si vuelve a correr no rompe ...

  this.logger.log({ correlationId, msg: 'autoSuspendServices done', count });
}
```

### Plantilla mínima de job BullMQ (cuando se implemente)

```typescript
@Processor('billing-payments')
export class PaymentRetryProcessor extends WorkerHost {
  async process(job: Job<{ invoice_id: string; idempotency_key: string }>) {
    // 1. Idempotency guard
    if (await this.alreadyProcessed(job.data.idempotency_key)) return;

    // 2. Trabajo
    await this.retry(job.data.invoice_id);

    // 3. Marcar idempotency
    await this.markProcessed(job.data.idempotency_key);
  }
}
```

---

## Documentos relacionados

- [ADR-055](../10-decisions/adr-055-resiliencia-circuit-breaker.md) — Resiliencia: circuit breaker + retries + DLQ + graceful shutdown.
- [ADR-056](../10-decisions/adr-056-estrategia-escalabilidad.md) — Estrategia escalabilidad: cuándo migrar crons in-process a BullMQ.
- [ADR-033](../10-decisions/adr-033-outbox-pattern-pendiente.md) — Outbox Pattern (deuda crítica — afecta a 4 eventos `invoice.*`).
- [ADR-041](../10-decisions/adr-041-sistema-tareas.md) — Tareas: cron mensual mantenimientos pendiente.
- [ADR-051](../10-decisions/adr-051-partner-comisiones-liquidaciones.md) — Cron mensual partner payouts (Fase 2).
- [ADR-054](../10-decisions/adr-054-sistema-referidos-clientes.md) — Cron mensual referral credits.
- [`docs/20-modules/_events.md`](../20-modules/_events.md) — Catálogo de eventos.
- [`settings-reference.md`](./settings-reference.md) — Settings que consumen los crons (`billing.*`, `support.*`).
