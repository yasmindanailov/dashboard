# ADR-002 — Stack tecnológico backend

> **Status:** Active
> **Date:** 2026-04 (origen) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §2 + §39 (parcial)
> **Domain:** foundation

---

## Contexto

El backend tiene que cumplir simultáneamente:

- **Lógica de negocio fiscal** (numeración secuencial de facturas, IVA, retención 10 años).
- **Concurrencia** con WebSockets (chat de soporte) y procesos de fondo (cron de billing, retries de cobro).
- **Tipado estricto end-to-end** porque el equipo usa IA para escribir mucho del código y los tipos atrapan errores antes de llegar a runtime.
- **Plugins intercambiables** (payment, provisioner, IA) sin acoplar el core.
- **Operable por dev solo** con documentación generada (Swagger, contracts).

La decisión cubre el stack base (framework, lenguaje, ORM, DB, cache, colas, comunicación en tiempo real).

---

## Opciones consideradas

1. **Express + TypeScript "a mano"** + Prisma + PostgreSQL.
   - Pros: máximo control, mínima abstracción.
   - Contras: hay que reescribir lo que NestJS da gratis (DI, módulos, guards, pipes, validation, swagger). Lock-in débil compensa con productividad inicial baja.

2. **Fastify + TypeScript** con plugins propios.
   - Pros: el más rápido en benchmarks.
   - Contras: ecosistema más pequeño que NestJS. Patrones menos consolidados para PBAC con CASL, WebSockets, BullMQ.

3. **Backend en otro lenguaje** (Go con Echo, Python con FastAPI, Rust con Axum).
   - Pros: rendimiento mejor en algunas cargas.
   - Contras: el stack del frontend es TypeScript; tener un único lenguaje compartido reduce coste cognitivo. Ningún ecosistema iguala el stack TS para CRUD + plugins + IA copilots que escriben código.

4. **(Elegida)** **NestJS 11 + TypeScript estricto + Prisma 7 + PostgreSQL 16 + Redis 7 + BullMQ + Socket.io.**
   - Pros: convenciones establecidas (módulos, providers, guards, pipes), DI nativa, Swagger built-in, ecosistema maduro de plugins (CASL, Throttler, Schedule, EventEmitter, BullMQ). TypeScript end-to-end con frontend.
   - Contras: capa de abstracción significativa sobre Express. Curva de aprendizaje si nadie en el equipo la conoce.

---

## Decisión

Stack backend de Aelium Dashboard:

| Capa | Elección | Razón |
|------|----------|-------|
| Framework | **NestJS 11** | DI, módulos, guards, pipes, swagger, ecosystem |
| Lenguaje | **TypeScript** estricto | Tipado end-to-end con frontend |
| ORM | **Prisma 7** | Migrations seguras, types generados, DX excelente |
| Database | **PostgreSQL 16** | SQL relacional con FK, transacciones, JSONB para datos flexibles |
| Cache | **Redis 7** | Cache + storage compartido entre instancias (rate limiting) |
| Colas | **BullMQ** (sobre Redis) | Jobs asíncronos, retries, dead-letter, prioridades |
| Pagos | **Stripe** (plugin base, R4) | Madurez, webhooks, SCA cumplimiento europeo |
| Email | **nodemailer** + SMTP configurable; MailPit en dev | Estándar |
| Tiempo real | **Socket.io** | Maduro, fallback HTTP polling, rooms para tickets |
| IA | **Claude API** (plugin base, R4) | Calidad de respuesta y contexto largo |
| Storage | **MinIO** (S3-compatible, self-hosted) | Adjuntos sin lock-in cloud, migrable |
| Logging | **Pino** + correlation IDs (R9) | Performance + structured logs |
| Auth | **Passport JWT** + 2FA email | Estándar, refresh tokens rotativos |
| PBAC | **CASL** (`@casl/ability` + `@casl/prisma`) | Isomórfico front+back, conditions, dynamic |

Versiones exactas en `backend/package.json`. El stack se hospeda en **Docker Compose** sobre servidor propio con **Traefik** como proxy.

---

## Consecuencias

- ✅ **Ganamos:**
  - DI + decoradores aceleran el boilerplate.
  - Swagger autogenerado de DTOs/controllers (Sprint 0.6).
  - PBAC isomórfico: un solo `ability.factory.ts` filtra rutas, sidebar, acciones (back y front).
  - Plugins (payment, provisioner, IA) se intercambian sin tocar core (ADR-009).
  - TypeScript estricto + Prisma generated types reduce bugs en runtime.
- ⚠️ **Aceptamos:**
  - Capa NestJS añade ~50 ms de cold start vs Express puro. No relevante a nuestra escala.
  - Prisma migrations son la fuente de verdad — cuidado con migraciones manuales en SQL que diverjan.
- 🚪 **Cierra:**
  - No se mezclan otros lenguajes de runtime (Go/Python). Si alguna pieza necesita rendimiento extremo (rare), se hace plugin separado o servicio externo, no parte del monolito.

---

## Cuándo revisar

- Si NestJS deja de mantenerse (improbable con el ritmo actual de releases).
- Si la escala obliga a partir el monolito en microservicios — el stack se mantendría pero la arquitectura cambia (ver ADR-056 estrategia de escalabilidad).
- Si Prisma 8+ introduce breaking changes que rompen el schema — evaluar migración o pin en major.

---

## Referencias

- **Módulos afectados:** todos los del backend.
- **Reglas relacionadas:** R1 (eventos entre módulos), R2 (procesos lentos a BullMQ), R4 (plugins), R6 (API stateless), R8 (Outbox).
- **ADRs relacionados:** ADR-005 (frontend), ADR-009 (plugins), ADR-031 (payment provider), ADR-043 (infraestructura).
- **Glosario:** [Módulo](../00-foundations/glossary.md), [Plugin](../00-foundations/glossary.md), [Worker](../00-foundations/glossary.md), [Job](../00-foundations/glossary.md).
- **Versiones exactas:** `backend/package.json`.
