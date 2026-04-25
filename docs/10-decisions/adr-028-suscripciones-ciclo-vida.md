# ADR-028 — Suscripciones — ciclo de vida avanzado

> **Status:** Active
> **Date:** 2026-04 (origen Sprint 6) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §21 (parcial)
> **Domain:** billing

---

## Contexto

Un servicio contratado tiene vida más allá de "activo / cancelado":

- El cliente puede **pausar voluntariamente** una suscripción (vacaciones, presupuesto temporal).
- Una factura no pagada **suspende el servicio** (estado intermedio antes de cancelar).
- El cliente puede **cambiar de plan** (mensual ↔ anual) en cualquier momento → prorrateo (ADR-029).
- Tras cancelación, los **datos del servicio se conservan X días** antes de purgarse.

Hace falta modelar estos estados y transiciones de forma coherente, evitando "estado limbo" donde el cliente paga pero el servicio sigue suspendido por un bug, o viceversa.

---

## Opciones consideradas

1. **Solo dos estados** (`active`, `cancelled`) con flags adicionales (`is_paused`, `is_suspended`).
   - Pros: simplicidad estructural.
   - Contras: combinación de flags genera estados ambiguos. Difícil saber qué transición es válida.

2. **(Elegida)** **Estados explícitos** en el campo `status` del servicio: `pending`, `active`, `paused`, `suspended`, `cancelled`. Transiciones validadas en `SubscriptionService`.
   - Pros: claridad. Cada estado tiene reglas tasadas. Transiciones explícitas en el código.
   - Contras: añadir estado nuevo requiere migración + actualización de varios sitios.

3. **Máquina de estados formal** (xstate).
   - Pros: estados + transiciones declarativas.
   - Contras: librería adicional, overhead para 5 estados.

---

## Decisión

### Estados de servicio (`enum ServiceStatus`)

| Estado | Significado | Cliente lo ve activo? | Cobros activos? | Datos preservados? |
|--------|-------------|------------------------|------------------|--------------------|
| `pending` | Recién contratado, factura en estado `pending` o `draft`. Aún no activado por provisioner. | NO (mensaje "procesando") | El primer cobro está en curso | Sí |
| `active` | Operativo. Cliente lo usa con normalidad. | SÍ | Sí, en cada ciclo | Sí |
| `paused` | Pausa voluntaria del cliente. Servicio congelado. | SÍ (con badge "Pausado") | NO durante la pausa | Sí, durante `pause_max_date` |
| `suspended` | Suspendido por impago u otra razón administrativa. | SÍ (con badge "Suspendido") | Reintentos + período de gracia | Sí, durante `suspension_days` configurables por producto |
| `cancelled` | Cancelado definitivamente. | NO | NO | Sí, durante `data_retention_days_after_cancel` configurables. Después purgado. |

### Transiciones permitidas

```
            ┌─────► active ◄─────┐
            │       │ ▲          │
            │       │ │          │
   pending ─┘  pause/▼ │ resume   │ resume(post-pago) / unblock
                      │ │          │
                  paused │      suspended ◄─── (impago)
                      │ │          │
                      ▼ ▼          ▼
                   cancelled (terminal salvo edge cases)
```

| Transición | Trigger | Quién |
|------------|---------|-------|
| `pending → active` | Provisioner termina + factura paid | Provisioner (cuando exista) o admin marca pagada manualmente (hoy) |
| `active → paused` | Cliente solicita pausa | `SubscriptionService.pauseService()` |
| `paused → active` | Cliente solicita reanudar antes de `pause_max_date` | `SubscriptionService.resumeService()` |
| `paused → cancelled` | `pause_max_date` excedida sin reanudar | Cron `ServiceLifecycleWorker.checkPauseExpiration()` |
| `active → suspended` | Factura `overdue` + reintentos agotados | Cron `ServiceLifecycleWorker.autoSuspendServices()` |
| `suspended → active` | Cliente paga la factura `overdue` | Listener de `invoice.paid` (futuro) o admin manual |
| `suspended → cancelled` | Suspensión > `suspension_days` configurable | Cron `ServiceLifecycleWorker.autoCancelServices()` |
| `* → cancelled` | Cliente solicita cancelación voluntaria | Admin (con razón obligatoria) |

### Pausa voluntaria — detalles

Configuración por producto:

| Campo en `Product` | Default | Descripción |
|--------------------|---------|-------------|
| `client_can_pause` | true | Si el cliente puede pausar este producto |
| `max_pause_duration_days` | 90 | Máximo absoluto de días de pausa |

Al pausar:
- Backend calcula `pause_max_date = now() + max_pause_duration_days`.
- Estado → `paused`. Servicio congelado.
- Cron horario `checkPauseExpiration()` evalúa: si `pause_max_date < now() && status == 'paused'` → transitar a `cancelled` o `active` (decisión de producto: por defecto **resume automático** al cumplirse `pause_max_date` para evitar cancelación silenciosa).

### Período de cobro y suspensión

Detallado en ADR-030 (período de gracia + reintentos). Resumen aquí:

- Tras `invoice.overdue` + N reintentos agotados → emitir `service.suspended` y transitar `active → suspended`.
- Tras `suspension_days` sin pago → emitir `service.cancelled` y transitar `suspended → cancelled`.

### Eventos emitidos por transición

| Transición | Evento |
|------------|--------|
| `active → paused` | `service.paused` |
| `paused → active` (manual o auto) | `service.resumed` |
| `active → suspended` | `service.suspended` |
| `suspended → active` (post-pago) | `service.resumed` |
| `suspended → cancelled` | `service.cancelled` |
| `paused → cancelled` (max excedido) | `service.cancelled` |
| Cancelación manual | `service.cancelled` |

Todos los eventos `service.*` están **huérfanos hoy** (sin listener). Cuando exista módulo `provisioning`, será el consumidor natural (desactivar instancia externa, reactivar, etc.).

---

## Consecuencias

- ✅ **Ganamos:**
  - Modelo claro: cada estado tiene reglas tasadas.
  - El cliente puede pausar voluntariamente sin perder datos.
  - Suspensión por impago no es "borrar" — el servicio se preserva durante días configurables.
- ⚠️ **Aceptamos:**
  - Validación de transiciones distribuida en `SubscriptionService` y `ServiceLifecycleWorker`. Disciplina al añadir transición nueva.
  - 4 eventos `service.*` huérfanos hoy. Listener real cuando provisioning module exista.
- 🚪 **Cierra:**
  - **No flags booleanos** para sustituir estado (`is_active && !is_paused && !is_suspended`).
  - **No transiciones directas saltando estados** (no `active → cancelled` sin pasar por suspended salvo cancelación voluntaria explícita).

---

## Cuándo revisar

- Si surge necesidad de "suspensión por seguridad" (cuenta comprometida) → estado `frozen` distinto de `suspended`.
- Si el negocio decide que la pausa máxima debe ser ilimitada → cambiar default y revisar lógica de cron.
- Si se introducen contratos con compromiso (penalización por cancelar antes de N meses) → schema adicional + ADR.

---

## Referencias

- **Módulos afectados:** billing (gestiona ciclo), provisioning (futuro consumidor de eventos).
- **ADRs relacionados:** ADR-026 (estados de factura — análogos), ADR-029 (prorrateo en cambio de plan), ADR-030 (gracia + reintentos).
- **Glosario:** [Servicio](../00-foundations/glossary.md), [Suscripción](../00-foundations/glossary.md), [Suspensión](../00-foundations/glossary.md), [Pausa](../00-foundations/glossary.md), [Cancelación](../00-foundations/glossary.md).
- **Implementación:** `backend/src/modules/billing/subscription.service.ts`, `service-lifecycle.worker.ts`, enum `ServiceStatus` en schema Prisma.
- **Eventos:** ver [`docs/20-modules/_events.md`](../20-modules/_events.md) sección `service.*`.
