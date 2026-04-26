# ADR-033 — Outbox Pattern para eventos críticos (decisión + deuda actual)

> **Status:** Active · **`invoice.*` cerrado P0.2 (2026-04-26)** · resto de eventos críticos pendiente
> **Date:** 2026-04-26 (formalización durante refactor F2 + primera implementación P0.2)
> **Original:** Regla R8 + ARCHITECTURE.md §8 (referencia) + auditoría de eventos `_events.md`
> **Domain:** foundation, billing

---

## Contexto

La auditoría exhaustiva del bus de eventos del sistema (durante F4 del refactor de doc, abril 2026) reveló:

- **25 eventos** definidos en el sistema.
- **0 de 25** usan Outbox Pattern.
- **Eventos críticos** (transición de dinero, cambios de estado de servicio) emiten directamente con `EventEmitter2.emit()` tras commit de la transacción Prisma.

Si el proceso del backend muere **entre el commit a Postgres y el `emit()`**, el evento se pierde:

- Una factura queda en `paid` en BD pero el cliente nunca recibe el email de confirmación.
- Un servicio se marca `suspended` pero el listener de provisioning (futuro) nunca se entera y la instancia externa sigue activa.
- Una comisión partner se calcula y persiste pero el listener que dispara el payout no se ejecuta.

Esto contradice la **Regla R8** declarada en `rules.md`: "Eventos críticos usan Outbox Pattern".

Hace falta una **decisión explícita** sobre cómo y cuándo se cierra esta brecha, evitando que la deuda quede invisible.

---

## Opciones consideradas

1. **Implementar Outbox completo desde día 1 para los 25 eventos.**
   - Pros: 100% conformidad con R8 inmediatamente.
   - Contras: trabajo significativo. Riesgo de retrasar otras prioridades. Muchos eventos son hooks aspiracionales (futuros listeners de audit, provisioning) — no críticos hoy.

2. **Asumir el riesgo, no implementar Outbox.**
   - Pros: cero coste actual.
   - Contras: en producción, la pérdida silenciosa de un `invoice.paid` significa cliente sin notificación de su factura. Riesgo reputacional y operacional.

3. **(Elegida)** **Implementación incremental por criticidad.** Decidir AHORA qué eventos son críticos y deben usar Outbox; el resto puede emitir directo. Documentar deuda actual y plan de cierre.

---

## Decisión

### Clasificación de criticidad

#### CRÍTICOS — deben usar Outbox antes de producción

Eventos cuya pérdida tiene impacto real (financiero, legal, de servicio):

| Evento | Razón |
|--------|-------|
| `invoice.created` | Cliente debe recibir factura por email. Sin email, factura "fantasma" para el cliente. |
| `invoice.paid` | Confirmación de pago — invariante de UX y de operación interna. |
| `invoice.failed` | Cliente debe saber que el cobro falló para resolverlo. |
| `invoice.overdue` | Recordatorio crítico antes de suspensión. |
| `service.suspended` | Provisioning (futuro) debe desactivar instancia externa. Sin esto, regalo de producto. |
| `service.cancelled` | Provisioning debe purgar instancia tras `data_retention_days`. |
| `service.resumed` | Provisioning debe reactivar instancia. |
| `service.paused` | Provisioning debe congelar instancia. |
| `checkout.completed` | Provisioning (futuro) debe activar el servicio nuevo. |
| `partner.commission_generated` (futuro) | Trazabilidad fiscal de comisiones. |
| `partner.payout_initiated` (futuro) | Liquidación monetaria. |
| `partner.payout_completed` (futuro) | Confirmación de transferencia. |
| `partner.payout_failed` (futuro) | Retry + alerta superadmin. |

#### NO CRÍTICOS — pueden emitir directo (aceptamos riesgo)

Eventos cuyo impacto de pérdida es absorbible:

| Evento | Razón |
|--------|-------|
| `auth.*` (8 eventos) | Hooks aspiracionales para audit futuro. La pérdida en raros crashes no compromete el sistema. |
| `task.created`, `task.assigned`, `task.completed` | Tareas internas; no hay impacto a cliente final. |
| `conversation.created`, `conversation.assigned`, `message.created` | UI se refresca al volver a entrar; pérdida de email puntual aceptable. |

### Mecanismo Outbox

Schema real implementado (`backend/prisma/schema.prisma`, migración `20260419092414_init`):

```prisma
enum EventStatus {
  pending
  processing
  done
  failed
}

model EventOutbox {
  id            String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  event_type    String      @db.VarChar(200)
  payload       Json
  status        EventStatus @default(pending)
  retry_count   Int         @default(0)
  max_retries   Int         @default(5)
  last_error    String?
  processed_at  DateTime?   @db.Timestamptz()
  created_at    DateTime    @default(now()) @db.Timestamptz()

  @@index([status])
  @@index([created_at])
  @@map("event_outbox")
}
```

> Nota: el schema real difiere ligeramente del borrador inicial de este ADR.
> Campos finales: `event_type` (no `event_name`), enum `status` con 4 estados (`pending` / `processing` / `done` / `failed`) en lugar de un boolean derivado de `processed_at`. Permite reaper de filas atascadas en `processing` tras crash.

Patrón de uso (P0.2 — implementado en `invoice.*`):

```typescript
// backend/src/core/outbox/outbox.service.ts
@Injectable()
export class OutboxService {
  async enqueue<P extends Record<string, unknown>>(
    tx: Prisma.TransactionClient,
    eventType: string,
    payload: P,
  ): Promise<void> {
    await tx.eventOutbox.create({
      data: { event_type: eventType, payload: payload as Prisma.InputJsonValue },
    });
  }
}

// Productor (ej. billing-invoice.service.ts):
const updated = await this.prisma.$transaction(async (tx) => {
  const u = await tx.invoice.update({
    where: { id }, data: { status: 'paid', paid_at: new Date() },
  });
  await this.outbox.enqueue(tx, 'invoice.paid', { invoice_id: u.id, /* ... */ });
  return u;
});
```

Worker (`backend/src/core/outbox/outbox.worker.ts`):

1. `@Interval(5000)` reclama lote de 50 filas `pending` con `FOR UPDATE SKIP LOCKED` (seguro multi-instancia).
2. Marca el lote `processing`, emite vía `eventEmitter.emitAsync()` y espera a los listeners.
3. Si OK → `status='done'`, `processed_at=now()`.
4. Si listener falla → `retry_count++`, guarda `last_error`. Si `retry_count >= max_retries` → `status='failed'` (revisión manual). Si no → vuelve a `pending` para el siguiente tick.
5. `onModuleInit()` reclama filas atascadas en `processing` (crash recovery).

Ventajas vs emit directo:

- Si el proceso muere **antes** del commit: la transacción rollback completo. Estado consistente.
- Si muere **después** del commit: el evento persiste en `event_outbox`. Worker lo emitirá cuando arranque.
- Los listeners siguen siendo `@OnEvent` normales — la abstracción Outbox vive en el productor + worker.

### Plan de cierre — estado por fase

| # | Tarea | Estado |
|---|------|--------|
| 1 | Schema + migración Prisma para `event_outbox` | ✅ ya en `init` (`20260419092414_init`) |
| 2 | Servicio `OutboxService.enqueue(tx, ...)` para que productores no escriban tabla manualmente | ✅ P0.2 (2026-04-26) |
| 3 | Worker que despacha + retries + crash recovery | ✅ P0.2 — `@Interval(5s)` + `FOR UPDATE SKIP LOCKED`. **Sustituye BullMQ** (consistente con resto de crons del proyecto, ver Playbook §1). Migrar a BullMQ se pospone a Sprint 9 cuando convivan más jobs distribuidos. |
| 4 | Refactor de eventos críticos `invoice.*` (4) | ✅ P0.2 |
| 5 | Refactor `service.*` (4), `checkout.completed`, `partner.*` (4 futuros) | ⏳ Pendiente — se hará en Sprint 11 (provisioning) y Sprint 19 (partner) cuando esos módulos se implementen — **deben nacer con outbox** |
| 6 | Tests E2E que demuestren persistencia tras crash simulado | ✅ P0.2 — `tests/e2e/outbox-invoice.spec.ts` |
| 7 | Monitoring (alerta si `event_outbox` crece sin procesarse, alerta a superadmin si rows en `failed`) | ⏳ Pendiente — Sprint 9 (Audit + Notifications) |

### Trigger del sprint

Cuando se cumpla CUALQUIERA de:

- Decisión de desplegar a producción (es bloqueante).
- Implementación de plugin Stripe (los reintentos automáticos amplifican el riesgo).
- Implementación del módulo Partner (los payouts implican dinero real).

---

## Consecuencias

- ✅ **Ganamos (P0.2):**
  - Los 4 eventos `invoice.*` cumplen R8: si el proceso muere entre commit y emit, el evento queda en `event_outbox` y se reintenta al arrancar el worker.
  - Patrón canónico (`OutboxService.enqueue(tx, eventType, payload)`) listo para reutilizar en `service.*`, `checkout.*`, `partner.*` cuando esos módulos se implementen.
  - Deuda visible y medible: una query `SELECT count(*) FROM event_outbox WHERE status='failed'` muestra el problema operacional.
- ⚠️ **Aceptamos:**
  - 9 de 13 eventos críticos siguen sin Outbox (`service.*`, `checkout.completed`, `partner.*` futuros). Aceptable hoy: `service.*` no tiene listener todavía (provisioning es stub) y `partner.*` no existe aún. Se cubren al implementar esos módulos.
  - Backoff inmediato (próximo tick = 5s) en lugar de exponencial — suficiente para fallos transitorios; los crónicos llegan a `failed` tras 5 reintentos.
  - Sin alerta automática al superadmin cuando un evento llega a `failed` (R7 lo cubrirá cuando se implemente notifications full en Sprint 9).
- 🚪 **Cierra:**
  - **Eventos críticos nuevos** (post-P0.2) **deben nacer con Outbox**, vía `OutboxService.enqueue(tx, ...)` dentro de `prisma.$transaction`. Cualquier PR que añada un `eventEmitter.emit()` en código transaccional crítico debe ser rechazado.
  - **El campo `outbox` en `_events.md`** se mantiene actualizado al añadir/modificar eventos.

---

## Cuándo revisar

- Al ejecutar el sprint de cierre: verificar que la lista de "críticos" sigue vigente y no ha crecido.
- Si surge un evento nuevo que dudamos si es crítico: por defecto **es crítico** salvo justificación clara de lo contrario.
- Si en producción se observa que un evento "no crítico" sí causa problemas al perderse → ascender a crítico.

---

## Referencias

- **Módulos afectados:** todos los que emiten eventos. Especialmente billing y futuro provisioning, partner.
- **Reglas relacionadas:** R8 (Outbox para eventos críticos — esta es la formalización de cómo se cumple).
- **ADRs relacionados:** ADR-004 (arquitectura monolito + eventos), ADR-026 (estados factura), ADR-028 (ciclo vida servicio), ADR-051 (comisiones partner — futuro).
- **Glosario:** [Outbox / event_outbox](../00-foundations/glossary.md), [Evento](../00-foundations/glossary.md).
- **Auditoría que reveló la deuda:** [`docs/20-modules/_events.md`](../20-modules/_events.md).
- **Schema futuro:** Prisma model `EventOutbox` (definir en migración cuando se ejecute el sprint).
