# Sprint 0 — Scaffolding ✅

> **Estado:** ✅ Cerrado
> **Commit cierre:** `53704d3`
> **Sprint origen:** Sprint 0 (inicial)

---

## Objetivo

Levantar el monorepo con backend NestJS + frontend Next.js + Docker Compose dev (PostgreSQL + Redis), Prisma con migración inicial, seed idempotente y la página de login con identidad visual de la marca.

---

## Lo que entregó

- **Monorepo:** `backend/` (NestJS 11) + `frontend/` (Next.js 16) + `docker-compose.yml` (PostgreSQL 16 + Redis 7) + `docs/`.
- **Backend scaffolding:** 13 módulos stub en NestJS (incluyendo `auth`, `clients`, `products`, `billing`, `support`, `tasks`, `notifications`, `audit`, `error-log`, `infrastructure`, `knowledge-base`, `promotions`, `provisioning`, `dashboard`).
- **Schema Prisma + migración inicial:** modelos base de los 13 módulos.
- **Seed idempotente:** roles del sistema (7), superadmin inicial, settings básicos.
- **Globals NestJS:** `GlobalExceptionFilter`, `CorrelationIdMiddleware` (R9), `Helmet`, `CORS`, Swagger UI.
- **Frontend scaffolding:** Next.js 16 + Tailwind 4 + DM Sans + tokens de diseño (sentaron base para Design System Sprint 7.5).
- **Página de login:** layout split-screen 55/45 con animación Aurora Digital (canvas) — primera UI con identidad visual de marca (anticipa [ADR-059](../../10-decisions/adr-059-auth-layout-split-screen.md)).
- **README.md:** instrucciones de arranque local.

---

## Decisiones clave consolidadas en este sprint

- **Monorepo simple** (no NX, no Turborepo) — overhead innecesario para esta escala.
- **Docker Compose para dev** — reproduce producción sin cloud dependency ([ADR-043](../../10-decisions/adr-043-infraestructura-self-hosted.md)).
- **PostgreSQL 16 + Redis 7** — versiones estables, no bleeding edge.
- **Prisma como ORM** — typesafe, migraciones SQL versionadas, suficiente para esta escala ([ADR-002](../../10-decisions/adr-002-stack-backend.md)).
- **CorrelationId desde el día 1** — instrumentar observabilidad sin retrofit ([ADR-007](../../10-decisions/adr-007-observabilidad.md)).

---

## Verificación de cierre (auditoría 2026-04-26)

Confirmado en código:
- ✅ `backend/src/modules/` con 13 módulos (algunos stub, otros implementados en sprints siguientes).
- ✅ `docker-compose.yml` con 4 servicios (postgres, redis, mailpit, app placeholder).
- ✅ `backend/prisma/schema.prisma` con migración inicial.
- ✅ `backend/prisma/seed.ts` con seeds idempotentes.
- ✅ `frontend/` con Next.js 16 + Tailwind 4 + login page funcional.

**Sin drift detectado.**
