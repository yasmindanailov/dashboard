# ADR-007 — Estrategia de observabilidad

> **Status:** Active
> **Date:** 2026-04-25 (durante F0.5 del refactor)
> **Original:** DECISIONS.md §31 + §38 (parcial)
> **Domain:** foundation, ops

---

## Contexto

Cuando algo falla en producción, **te enteras solo si un usuario te lo dice** — y los usuarios casi nunca lo dicen, simplemente abandonan. El proyecto necesita observabilidad para:

1. Captura automática de errores con stack trace, contexto del usuario, request, parámetros.
2. **Trazabilidad cross-módulo:** un request HTTP puede emitir eventos, encolar jobs y llamar a APIs externas. Si falla, hay que reconstruir la cadena.
3. Performance traces para detectar endpoints lentos.
4. Profiling cuando un proceso consume CPU sin razón aparente.

La elección debe equilibrar valor (qué problemas detecto) y coste (€/mes, impacto en performance, ruido si está mal configurada).

---

## Opciones consideradas

1. **Sentry.**
   - Pros: maduro, plan free generoso (5k errores/mes), integración nativa con NestJS y Next.js, replay de sesión opcional, SCA + RGPD compliance configurable.
   - Contras: tooling externo (vendor lock-in cuasi-aceptable). Coste si volumen sube.

2. **Datadog.**
   - Pros: APM completo, dashboards potentes.
   - Contras: caro desde el principio. Overkill para nuestra escala.

3. **Self-hosted: Glitchtip o Grafana + Loki + Tempo.**
   - Pros: control total, sin vendor lock-in.
   - Contras: operación adicional. Aelium ya self-hostea Postgres, Redis, MinIO; añadir un stack de observabilidad completo es trabajo.

4. **Solo logs estructurados a stdout** (sin SaaS).
   - Pros: cero coste extra.
   - Contras: requiere configurar agregación + alertas + UI. En la práctica termina siendo "no tengo observabilidad".

---

## Decisión

Estrategia en 3 capas:

### Capa 1 — Logs estructurados con Pino
- **`nestjs-pino`** en backend.
- Cada log JSON con: timestamp, level, correlation ID (R9), módulo, mensaje, contexto.
- Pretty print solo en dev (`pino-pretty`); JSON crudo en producción (parseable por agregadores).
- **Cero `console.log`** en código de producción (R14): solo `Logger` de NestJS.

### Capa 2 — Correlation IDs (Regla R9)
- `CorrelationIdMiddleware` genera UUID v4 al inicio de cada request HTTP.
- Se propaga a logs, eventos del bus interno, jobs de BullMQ.
- Permite seguir la cadena: "el request `abc-123` llegó al endpoint X, emitió evento Y, encoló job Z, falló porque…".

### Capa 3 — Sentry (cuando se active el DSN)
- **Backend:** `@sentry/nestjs` + `@sentry/profiling-node`. Init en `src/instrument.ts` (debe importarse antes que cualquier módulo en `main.ts`). `SentryGlobalFilter` registrado vía `APP_FILTER`.
- **Frontend:** `@sentry/nextjs`. Configs separadas para client / server / edge runtimes. `instrumentation.ts` orquesta.
- **Activación condicional:** sin `SENTRY_DSN` env var, no-op (no envía datos, no consume cuota). Activar solo en staging/producción. **Decisión actual: no activado en producción** porque aún no hay producción desplegada.
- **Privacidad:** `sendDefaultPii: false`. No se envían IPs, headers de auth, request body completos sin filtrar.
- **Sample rates conservadores:** `tracesSampleRate: 0.1`, `profilesSampleRate: 0.1`. Ajustar al alza si volumen lo permite y se necesita mejor cobertura.
- **Replay de sesión:** desactivado por defecto en client (`replaysSessionSampleRate: 0`). Activar manualmente cuando se necesite debugging visual.

---

## Consecuencias

- ✅ **Ganamos:**
  - Trazabilidad completa con correlation IDs.
  - Errores capturados automáticamente cuando Sentry esté activo.
  - Performance traces para 10% de requests (configurable).
  - Profiling on-demand para 10% de transacciones.
- ⚠️ **Aceptamos:**
  - Hoy Sentry está **inactivo** (sin DSN). Hasta que se despliegue a producción, el operador depende de logs estructurados manualmente.
  - Sentry plan free tiene límites (5k errores/mes); requiere upgrade si volumen real lo supera.
  - Vendor lock-in suave con Sentry — migrable a Glitchtip (compatible API) si hace falta.
- 🚪 **Cierra:**
  - **No `console.log` o `console.error` como sistema de logging principal** — siempre `Logger` de NestJS y Pino.
  - **No silenciar errores** ni en backend ni en frontend (R14, R7).

---

## Cuándo revisar

- **Activar Sentry:** cuando se haga el primer despliegue a staging o producción. Hasta entonces, la decisión es no activar (evitar ruido y consumo de cuota durante desarrollo).
- Si el volumen de errores supera 5k/mes en plan free → evaluar upgrade Sentry vs migración a Glitchtip self-hosted.
- Si Datadog o New Relic ofrecen integraciones que justifican el coste extra → revisar.

---

## Referencias

- **Módulos afectados:** todos.
- **Reglas relacionadas:** R7 (errores notificados), R9 (correlation ID), R14 (error handling visible).
- **ADRs relacionados:** ADR-002 (stack backend incluye Pino), ADR-005 (stack frontend incluye Sentry config), ADR-006 (estrategia tests).
- **Documentos:** [`docs/90-meta/sentry-setup.md`](../90-meta/sentry-setup.md).
- **Implementación:** `backend/src/instrument.ts`, `frontend/sentry.{client,server,edge}.config.ts`, `frontend/instrumentation.ts`, `backend/src/core/common/middleware/correlation-id.middleware.ts`.
