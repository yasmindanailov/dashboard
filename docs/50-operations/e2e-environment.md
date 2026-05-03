# E2E test environment — referencia canónica

> **Sprint 13.5 Fase E (DC.11).** Documento de referencia para configurar
> el entorno de tests end-to-end (Playwright) coherentemente entre local,
> CI y futuro Sprint 14 (deploy productivo). Este documento NO sustituye
> a `playwright.config.ts` — describe **qué configura** ese fichero y
> **qué env vars** consumen los services backend/frontend cuando los
> arranca Playwright.

> Última actualización: 2026-05-03 (post Sprint 13.5 Fase E cierre).

---

## 1. Topología

La suite E2E ejerce el sistema completo desde el navegador:

```
┌────────────────────────────────────────────────────────────────────────┐
│  Playwright (chromium headless)  → http://localhost:3002 (frontend)    │
│           │                                                            │
│           └─ navega + dispara requests a /api/v1 → http://localhost:3001│
│                                                                        │
│  Frontend Next.js  (next start)  → puerto 3002                         │
│  Backend NestJS    (start:prod)  → puerto 3001                         │
│           │                                                            │
│           ├─ Postgres   (5432)     ← schema `public`, BD canónica      │
│           ├─ Redis      (6379)     ← BullMQ (DB 1) + cache (DB 0)      │
│           ├─ MailPit    (1025/8025)← SMTP entrante + UI admin          │
│           └─ MinIO      (9000/9001)← S3-compatible (bucket aelium-storage)│
└────────────────────────────────────────────────────────────────────────┘
```

**Local:** Yasmin levanta los services con `docker compose up -d` (root del
repo). Backend + frontend los arranca el propio Playwright (ver
`webServer` en `playwright.config.ts:92-110`).

**CI:** los services son `services:` del job E2E en `.github/workflows/ci.yml`
(MinIO se arranca como step explícito por limitación GHA — no acepta
`command:` en services).

---

## 2. Env vars canónicas

### 2.1 Conexión a services (backend)

| Variable | Local default | CI default | Notas |
|----------|---------------|------------|-------|
| `DATABASE_URL` | `postgresql://aelium:aelium_dev@localhost:5432/aelium_dashboard?schema=public` | `postgresql://aelium:aelium_test@localhost:5432/aelium_dashboard_test?schema=public` | Connection string Postgres. **CI usa BD `_test` distinta** para no contaminar BD de desarrollo si Yasmin ejecuta localmente sobre el mismo Postgres. |
| `REDIS_URL` | `redis://localhost:6379` | `redis://localhost:6379` | Canónica desde Sprint 9 Fase A (ADR-063 §B). `JobsModule` + `DlqService` leen `ConfigService.getOrThrow('REDIS_URL')`. |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | localhost / 6379 / vacío | localhost / 6379 / vacío | Redundantes con `REDIS_URL` por compatibilidad histórica. |
| `BULLMQ_PREFIX` | `aelium-jobs` | `aelium-jobs-ci` | Aísla colas BullMQ en Redis compartido. Diferenciar entornos evita colisiones. |
| `MAIL_HOST` / `MAIL_PORT` / `MAIL_TRANSPORT` | localhost / 1025 / smtp | localhost / 1025 / smtp | MailPit acepta SMTP plano sin auth en dev. La UI admin de MailPit (8025) es donde Yasmin verifica emails enviados. |
| `MAIL_FROM` | `Aelium Dev <noreply@aelium.test>` | `Aelium CI <noreply@aelium.test>` | Sender por defecto. Distinguir entornos en el inbox ayuda al debug. |
| `S3_ENDPOINT` | `http://localhost:9000` | `http://localhost:9000` | MinIO endpoint. |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | minioadmin / minioadmin | minioadmin / minioadmin | Credenciales por defecto MinIO (DEV). En Sprint 14 deploy: sustituir por keys reales. |
| `S3_BUCKET` | `aelium-storage` | `aelium-storage` | Auto-creado por `bitnami/minio` con `MINIO_DEFAULT_BUCKETS` o por `StorageService.ensureBucket()` en boot. |
| `S3_REGION` | `eu-west-1` | `eu-west-1` | Marker — MinIO no usa región pero el SDK la requiere. |
| `S3_FORCE_PATH_STYLE` | `'true'` | `'true'` | MinIO no soporta virtual-hosted style; obligatorio path-style. |

### 2.2 Backend run config

| Variable | E2E value | Notas |
|----------|-----------|-------|
| `PORT` | `3001` | Puerto backend NestJS. Hard-coded en `webServer[0]` de Playwright. |
| `API_PREFIX` | `api/v1` | Sufijo de las rutas REST. Coincide con `NEXT_PUBLIC_API_URL`. |
| `JWT_SECRET` | (32+ chars) | **CI usa secrets canónicos NO de producción** (ver `.github/workflows/ci.yml:155`). En local Yasmin tiene `.env` propio. |
| `JWT_REFRESH_SECRET` | (32+ chars) | Idem. Distinto del access. |
| `ENCRYPTION_KEY` | (64 hex chars) | AES-256 para encriptar API keys de plugins (Sprint 11). |
| `SUPERADMIN_EMAIL` | `admin@aelium.net` | Cuenta canónica seedeada. Los specs E2E hacen login con esta cuenta. |
| `SUPERADMIN_PASSWORD` | `AeliumDev2026!` (local) / `AeliumDev2026` (CI) | **NO usar la del CI en producción** — son secrets de dev por convención del proyecto. |
| `DISABLE_CRON_WORKERS` | `'true'` | **Crítico en E2E.** Desactiva los crons in-process (`@nestjs/schedule`) para que los specs disparen los jobs manualmente vía endpoint `/admin/tasks/cron/:name`. Si está `false`, los crons corren en paralelo y pueden cambiar el estado mid-test. |

### 2.3 Frontend run config

| Variable | E2E value | Notas |
|----------|-----------|-------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001/api/v1` | URL absoluta del backend. Usada por `lib/api.ts`. |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3002` | URL del propio frontend. Usada para CTAs absolutos. |
| `NEXT_PUBLIC_WS_URL` | `http://localhost:3001` | Gateway WebSocket (`/support`, `/notifications`). Sprint 13.5 DC.37 lo consume desde `useConversationDetail`. |

### 2.4 Playwright run config

| Variable | E2E value | Notas |
|----------|-----------|-------|
| `E2E_FRONTEND_URL` | `http://localhost:3002` | Override del `baseURL` de Playwright. Útil si Yasmin testea contra un frontend diferente puerto local. |
| `E2E_BACKEND_URL` | `http://localhost:3001` | Override del backend para `webServer[0].url`. |
| `E2E_API_URL` | `http://localhost:3001/api/v1` | URL absoluta API para `request.fetch()` en specs. |
| `E2E_MAILPIT_URL` | `http://localhost:8025` | UI admin MailPit — los helpers `mailpit.ts` la consultan para extraer códigos 2FA + verificar emails. |
| `CI` | `'true'` (sólo CI) | Toggle reintentos (2× en CI, 0× local) y reportes (HTML+JSON+github en CI, HTML+list en local). |

---

## 3. Pre-condiciones para correr la suite

### 3.1 Local

```bash
# Desde el root del repo:
docker compose up -d                 # Postgres + Redis + MailPit + MinIO
cd backend && pnpm prisma migrate deploy && pnpm prisma db seed
cd .. && pnpm install --frozen-lockfile
pnpm --dir backend build
pnpm --dir frontend build
pnpm test:e2e                        # 118/118 verde esperado
```

### 3.2 CI

El job `e2e` del workflow lo orquesta solo: services efímeros + MinIO step
+ install deps + prisma migrate/seed + build backend/frontend +
`pnpm test:e2e`. Ver `.github/workflows/ci.yml:97-292`.

---

## 4. Aislamiento entre tests (estado actual + ruta canónica)

### 4.1 Estado actual (Sprint 9.6 → 13.5)

`workers=1 + fullyParallel=false` — los specs corren **secuenciales**
porque comparten:

- Postgres BD canónica (1 schema).
- MailPit (un buzón compartido).
- Cuentas seed (1 por rol; login concurrente colisiona).
- Redis (BullMQ + JWT refresh).

Cada spec llama `resetTestData()` en `beforeAll` para truncar tablas
no-seed (ver `tests/e2e/fixtures/db.ts`). Tiempo total suite: ~1 min.

### 4.2 Ruta canónica de paralelización (DC.13 — diferida)

DC.13 propone **fixtures aisladas por spec**: schema dinámico Postgres
por worker, MailPit con filtro `to-address`, usuarios `e2e-${uid}-${role}`
por worker, BullMQ prefix por worker. Beneficio esperado: ~1 min →
~15 s con `workers=4`.

**Sprint 13.5 difirió DC.13 a sub-sprint propio "Sprint 13.5.5 — CI Infra"**
por riesgo cross-cutting sobre la suite estable (reescribir
`fixtures/db.ts` + `auth.ts` + cuentas seed por-worker requiere ~3-4h
sólidas). DC.27 (migrar CI E2E a imagen oficial Playwright) acompaña
en el mismo sub-sprint por simetría operativa (cambia el modelo de
networking del CI completo).

---

## 5. Errores comunes y diagnóstico

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| `Jest worker exception` al cargar specs | Turbopack worker corrompido | `pnpm dev:clean` (alias `rm -rf .next/`) + reiniciar. Ver `development-playbook.md` §"Cuando el dev server crashea". |
| `connect ECONNREFUSED 5432` | Postgres no levantado | `docker compose ps` → si no aparece postgres healthy, `docker compose up -d postgres`. |
| `MailPit timeout: no email found` | Mailbox compartido entre specs (race) | Cada spec llama `clearMailbox()` antes del trigger. Si reincide, revisar el `subjectIncludes` filter. |
| Tests cancelados al recibir nuevo commit | `concurrency` policy del workflow | Esperado — `cancel-in-progress: true` ahorra minutos CI. Si el run se canceló por error, dispara manualmente desde Actions. |
| `Container not healthy: postgres` en CI | Healthcheck timeout | Subir `--health-retries` en el service. Antes de tocar, verificar logs del runner para ver si fue un fallo transitorio. |
| Login test falla con 401 inesperado | Seed sin ejecutar / superadmin con password distinto | `pnpm prisma db seed` desde `backend/`. Si CI: revisar step "Prisma — seed" en el log. |
| `Workers > 1` produce cascada de fallos | Aislamiento incompleto (DC.13 abierta) | Volver a `workers=1`. La paralelización canónica la entrega Sprint 13.5.5. |

---

## 6. Cuándo cambiar este documento

- **Cuando se añada una env var nueva** consumida por backend/frontend en
  E2E → añádela aquí y a `.github/workflows/ci.yml` env block en el
  mismo PR.
- **Cuando se cierre DC.13 + DC.27** (Sprint 13.5.5) → reescribir §4.1
  para reflejar el modelo paralelizado y eliminar la advertencia.
- **Cuando se aborde Sprint 14 deploy real** → añadir §7 con la
  diferenciación entre env vars locales/CI y env vars productivas
  (secrets generados por hosting, no los del repo).

---

## 7. Documentos relacionados

- [`playwright.config.ts`](../../playwright.config.ts) — config canónica.
- [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) — job CI E2E.
- [`tests/e2e/fixtures/db.ts`](../../tests/e2e/fixtures/db.ts) — helper truncate canónico.
- [`tests/e2e/fixtures/auth.ts`](../../tests/e2e/fixtures/auth.ts) — helpers login UI/API.
- [`tests/e2e/fixtures/mailpit.ts`](../../tests/e2e/fixtures/mailpit.ts) — extracción 2FA / verificación emails.
- [`tests/e2e/fixtures/test-config.ts`](../../tests/e2e/fixtures/test-config.ts) — constantes canónicas.
- [`docs/90-meta/development-playbook.md`](../90-meta/development-playbook.md) — flujo cuando CI rojo.
- [`docs/60-roadmap/backlog.md`](../60-roadmap/backlog.md) — DC.11/DC.13/DC.27 estado vivo.
