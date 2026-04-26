# ADR-055 — Resiliencia: circuit breaker, retries, timeouts, dead letter queue

> **Status:** Active (parcialmente implementado)
> **Date:** 2026-04 · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §38 (resiliencia y seguridad — partes operativas) + §39 (DLQ + tests)
> **Domain:** cross-cutting

---

## Contexto

El sistema depende de varios componentes que **pueden fallar de forma transitoria**:

- APIs externas (Stripe, ResellerClub, Enhance CP, Docker API).
- BullMQ jobs (provisioning, generación de PDFs, envío de emails).
- Conexiones DB / Redis bajo carga puntual.

Sin estrategia de resiliencia explícita:
- **Una caída transitoria de Stripe** = todos los cobros del momento fallan permanentemente y nadie los reintenta.
- **Un job de provisioning con bug puntual** = el cliente queda sin servicio y nadie lo notifica.
- **Una API externa lenta** = todo el thread bloqueado, dashboard inaccesible.
- **Un cron que muere a mitad de ejecución** = la mitad de los clientes con su factura, la otra mitad sin nada.

Hace falta una **batería estándar de patrones de resiliencia** aplicada de forma coherente: timeouts, retries con backoff, circuit breakers, dead letter queue, graceful shutdown, health checks, contadores atómicos.

---

## Decisión

### Timeouts en llamadas externas

Todas las llamadas a APIs externas tienen **timeout explícito**, nunca confiar en el default del cliente HTTP:

- **Default:** 10 segundos.
- **Configurable por integración** (ej: Stripe webhook procesado en ≤5s, generación PDF puede subir a 30s).

### Retries con backoff exponencial

Aplicado en BullMQ jobs por defecto:

```
Reintentos:    5
Backoff:       exponencial (30s → 60s → 120s → 240s → 480s)
Jitter:        ±10% para evitar thundering herd
```

### Circuit breaker (opossum)

```
Librería:        opossum (open source, Node.js)
Timeout:         10 segundos por llamada
Umbral apertura: 50% de fallos en ventana de 10 intentos
Reset timeout:   60 segundos (intenta cerrar el circuito)
Al abrirse:      notificación al superadmin via system.error
Aplica a:        Stripe · Enhance CP · ResellerClub · Docker API
```

**Estados del circuito:**
- **Closed** — funcionamiento normal, las llamadas pasan.
- **Open** — fallos detectados, las llamadas devuelven error inmediatamente sin intentar la API.
- **Half-Open** — tras `reset_timeout`, deja pasar una llamada de prueba; si tiene éxito vuelve a closed.

### Dead Letter Queue (DLQ)

Todos los jobs de BullMQ que **agotan reintentos**:

- Quedan en estado `failed` en Redis.
- **Nunca se eliminan automáticamente.**
- Generan notificación al superadmin via `system.error` con detalles del error.
- El admin puede **reintentar manualmente** desde el dashboard (`/dashboard/admin/jobs/failed`).

Esto evita la situación clásica "el job falló silenciosamente y nadie se enteró".

### Validación de webhooks de Stripe

El plugin de Stripe (ADR-031) **debe verificar la firma `Stripe-Signature`** con el `webhook_secret` en cada request entrante. Rechazar cualquier webhook sin firma válida.

**Sin esto, cualquiera puede simular un pago exitoso.** Es obligatorio (no negociable).

### Graceful shutdown

Al recibir SIGTERM:

1. El servidor deja de aceptar requests nuevos.
2. Los workers de BullMQ dejan de aceptar jobs nuevos.
3. Se esperan hasta **30 segundos** a que los jobs en curso terminen.
4. Se cierran conexiones a PostgreSQL y Redis.
5. El proceso se apaga limpiamente.

Esto evita pérdida de trabajo en deployment.

### Health check

Endpoint `/health` que valida:
- Conexión a PostgreSQL activa.
- Conexión a Redis activa.
- Workers de BullMQ respondiendo.

Traefik usa este endpoint para routing y auto-restart si el servicio queda no-saludable.

### Contadores atómicos (sin race conditions)

Los contadores de uso (extras, promociones, descuentos) se actualizan con **SQL atómico**:

```sql
UPDATE discount_codes
SET uses_count = uses_count + 1
WHERE id = $1
  AND (max_uses_total IS NULL OR uses_count < max_uses_total)
RETURNING *;
-- Si no devuelve filas → el límite ya se alcanzó
```

**No leer-y-luego-incrementar en código** — race condition garantizada bajo carga.

### Outbox Pattern (referencia)

Los **eventos críticos** (ej: `invoice.paid → provisioning`) deben pasar por Outbox. Detalle completo en ADR-033 (decisión + deuda actual).

### Estrategia de testing relacionada

Patrones de resiliencia testeados con:
- **Unit tests** (Jest) — circuit breaker logic, atomic counter logic, retry policies.
- **Integration tests** (Jest + testcontainers) — flujos críticos como `invoice → payment → provisioning` con simulación de fallo.
- **Contract tests** — cualquier `PaymentPlugin` debe pasar el mismo suite (interfaz uniforme).

Detalle global en ADR-006 (estrategia de tests).

---

## Consecuencias

- ✅ **Ganamos:**
  - **Fallos transitorios no rompen flujos** — retries cubren la mayoría.
  - **Fallos persistentes no se silencian** — DLQ + notificación al admin garantizan visibilidad.
  - **Fallos en cascada se contienen** — circuit breaker evita que un Stripe caído sature el sistema.
  - **Deploys sin pérdida de trabajo** — graceful shutdown.
  - **Sin race conditions en contadores** — SQL atómico.
- ⚠️ **Aceptamos:**
  - **Latencia añadida por timeouts** (10s) — peor caso, una llamada lenta espera 10s antes de fallar. Aceptable: usuario ve loading; alternativa (sin timeout) cuelga el thread indefinidamente.
  - **Reintentos pueden duplicar efectos no idempotentes** — toda operación con side effect debe ser idempotente o validada con `idempotency_key`. Mitigación: documentado en webhook handlers.
  - **DLQ requiere disciplina del admin** — los jobs failed no se autocorrigen; el admin debe revisar y reintentar.
  - **Circuit breaker abierto deja al sistema sin la API** — si Stripe se cae 1 hora, los cobros también. Aceptable: alternativa (insistir) hace más daño.
- 🚪 **Cierra:**
  - **No llamadas a APIs externas sin timeout.** Bloquea el code review.
  - **No jobs sin política de retry definida.** Default aplicado, pero debe ser consciente.
  - **No webhooks de Stripe sin validación de firma.**
  - **No incrementar contadores en código** — siempre SQL atómico.

---

## Cuándo revisar

- Si el sistema escala a múltiples instancias → revisar locks distribuidos para crons (no duplicar trabajo).
- Si las APIs externas se vuelven más estables (Stripe rara vez falla) → reducir reintentos en algunas integraciones.
- Si surgen patrones de fallo que el circuit breaker actual no captura (degradación lenta, no fallos completos) → considerar adaptive circuit breaker.
- Si el volumen de jobs failed crece → automatizar reintentos para tipos seguros (envío de email, generación PDF) y mantener manual solo los críticos (provisioning, payments).

---

## Referencias

- **Módulos afectados:** todos los módulos que llaman a APIs externas o usan BullMQ (billing, provisioning, notifications, infrastructure).
- **Reglas relacionadas:** R8 (Outbox), R10 (rate limiting — complementario), R11 (circuit breaker en llamadas externas), R5 (cálculos en backend).
- **ADRs relacionados:** ADR-006 (estrategia tests — incluye contract tests), ADR-007 (observabilidad — correlation ID propagado), ADR-016 (rate limiting Redis), ADR-031 (payment providers — circuit breaker aplica a Stripe), ADR-033 (Outbox pendiente — bloquea fiabilidad de eventos críticos).
- **Glosario:** [Circuit breaker](../00-foundations/glossary.md), [DLQ](../00-foundations/glossary.md), [Outbox](../00-foundations/glossary.md), [Idempotencia](../00-foundations/glossary.md).
- **Librerías:** opossum (circuit breaker), @nestjs/throttler (rate limiting), BullMQ (jobs), @nestjs/terminus (health check).
- **Estado actual:** circuit breaker + DLQ + graceful shutdown + health check **implementados**. Outbox **deuda crítica** (ADR-033). Webhook validation Stripe pendiente hasta plugin Stripe (ADR-031).
