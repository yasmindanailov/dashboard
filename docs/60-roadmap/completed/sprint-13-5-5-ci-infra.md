# Sprint 13.5.5 — CI Infra (cerrado)

> **Cierre formal:** 2026-05-03 — Fases 0 → C mergeadas a master vía PR #26.
> **Foco doctrinal:** sub-sprint dedicado a infra de tests CI con commits aislados verificables iterativamente contra CI real, según mandato Sprint 13.5 §4.3 (DC.13 + DC.27 diferidas para evitar refactor invasivo bajo presión de sprint feature).
> **Cobertura final:** **118/118 E2E verde** sin regresión, distribuidos en 3 shards CI paralelos.

---

## 1. Objetivo en una frase (cumplido)

Cerrar **DC.27 al 100%** (job E2E del CI corre en imagen oficial Playwright + MinIO como service container) y **DC.13 parcial-canónica** (sharding CI con `--shard=N/M`, dejando paralelización local diferida a sub-sprint condicionado por trigger), reduciendo wall-clock CI de ~25 min a **~10 min** sin tocar la suite local.

---

## 2. Resumen ejecutivo

| Métrica | Valor |
|---------|-------|
| Sesiones | ~1 sesión densa con verificación CI iterativa |
| PRs / commits ahead of master | 4 commits encadenados (`1a39eaa` plan + `259c74b` Fase A + `14493b0` fix MinIO + `048345e` Fase B) |
| Migraciones Prisma | 0 (sub-sprint es CI infra, no toca schema) |
| Cobertura E2E final | **118/118 verde** (sin regresión local; distribuido en 3 shards CI paralelos) |
| ADRs nacidos | 0 (decisiones operativas registradas en `current.md` sin requerir ADR formal) |
| DCs cerradas | **2** (DC.27 ✅ + DC.13 ✅ parcial-canónica con paralelización local diferida) |
| Wall-clock CI E2E | 25 min baseline → ~10 min estimado con 3 shards (medido en run del PR #26) |

---

## 3. Cronología

| Hito | Salida | Commit |
|------|--------|--------|
| **Fase 0 — Plan canónico congelado** (current.md doc-only + rama desde master) | Plan con 4 fases + DoD por fase + decisión arquitectónica explicada | `1a39eaa` |
| **Fase A — Job E2E en imagen Playwright + service names + MinIO container** | DC.27 implementado: `mcr.microsoft.com/playwright:v1.59.1-noble` + 4 services (postgres/redis/mailpit/minio) + DNS interno + eliminados 3 steps cache/install browsers | `259c74b` |
| **Fase A.fix — Pin MinIO a `bitnamilegacy`** | Fix tras run rojo: Bitnami retiró `bitnami/minio:latest` del Docker Hub público en agosto 2025; pin a `bitnamilegacy/minio:2025.7.23-debian-12-r5` (último estable, multi-arch, Apache 2.0) | `14493b0` |
| **Fase B — Sharding CI con `--shard=N/M`** | DC.13 parcial-canónica: matrix 3 shards × 1 total, `fail-fast: false`, artifact upload con sufijo `-shard-N` | `048345e` |
| **Fase C — Cierre documental** | Backlog DC.13 ✅ parcial / DC.27 ✅, `e2e-environment.md §4.2` reescrita, retrospectiva, mover a `completed/`, índice actualizado | (este PR) |

---

## 4. Decisión arquitectónica clave (Fase 0)

El plan original Sprint 13.5 §4.1 mencionaba "schema Postgres dinámico por worker + BullMQ_PREFIX por worker" como vía para `workers=4 + fullyParallel=true` local. Tras inspeccionar los 25 specs E2E reales en arranque de Sprint 13.5.5, esa vía **resultó no viable sin reescribir `webServer` para arrancar un backend NestJS por worker** (puertos 3001/3011/3021/3031, 4× memoria, 4× boot), porque:

1. **22 de 25 specs hacen login con cuenta seed única** `admin@aelium.net` + `clearMailbox()` antes de esperar código 2FA. En paralelo: un worker borra el mailbox justo cuando otro espera su código → cascada de fallos.
2. **6 specs son intrínsecamente system-wide:** `tasks-crons.spec.ts` (dispara crons globales), `outbox-invoice.spec.ts` (espera al `OutboxWorker` global), `notifications.spec.ts` (processor `notifications-dispatch` global), `audit-portal.spec.ts` + `admin-error-log.spec.ts` (leen logs globales), `admin-tree-migration.spec.ts` + `aliases-rest-deprecation.spec.ts` (verifican rutas globales).
3. **Bloqueo arquitectónico fundamental:** `playwright.config.ts:webServer` arranca **un solo backend NestJS** antes de los workers; `BULLMQ_PREFIX` y `DATABASE_URL?schema=...` se leen en boot del proceso → no son por-worker sin multi-backend.

### Vías evaluadas

| Opción | Estrategia | Coste estimado | Beneficio | Riesgo |
|--------|-----------|----------------|-----------|--------|
| A — Híbrida con proyecto serial Playwright | Cuentas seed por-worker + 2 proyectos `parallel`/`serial` | 3-4 sesiones | Local ~60s → ~25-30s | Medio |
| B — Backend per-worker | webServer dinámico arranca 4 backends + 4 frontends + schema Postgres `worker_N` | 5-7 sesiones | Local ~60s → ~15-20s | Alto (4× RAM puede tumbar runner GHA) |
| **C ✅ adoptada** | Sharding CI + imagen Playwright. Local sin cambios. | 1-2 sesiones | CI ~25min → ~10min wall-clock | Bajo (Playwright `--shard` es estándar) |

### Por qué Opción C

1. **Beneficio real, riesgo casi cero** — Playwright `--shard` es funcionalidad madura, services CI por job son baratos y aislados.
2. **El beneficio local de A/B es marginal** — la suite ya corría ~1min localmente; ahorrar 30s no justifica refactor cross-cutting con riesgo alto.
3. **Cierra DC.27 en el mismo sub-sprint** — DC.27 ya planeaba imagen oficial Playwright; sharding entra naturalmente porque cada shard es un job CI con su container.
4. **Doctrina Sprint 13.5 §6.4** explícitamente avala cierres parciales: "*un cierre parcial documentado vale más que un cierre forzado que rompe estado verde*". DC.13 cierra parcial-canónica (CI sí, local no), no forzada.

### Deuda diferida explícitamente registrada

**Paralelización local con `workers > 1`** queda diferida a sub-sprint futuro **condicionado por trigger**: si la suite local supera 2 min wall-clock, abrir sub-sprint dedicado **Sprint 13.5.6 — E2E parallel local** que aborde la opción canónica de backend por-worker. Hasta entonces, `workers: 1 + fullyParallel: false` se mantiene en `playwright.config.ts`.

---

## 5. Métricas de impacto por DC cerrada

### 5.1 DC.27 — Job E2E en imagen oficial Playwright

| Antes | Después |
|-------|---------|
| `runs-on: ubuntu-latest` + 3 steps `Cache Playwright browsers` + `Install Playwright browsers` + `Install Playwright system deps` (~60-90s + flake intermitente `apt-get update`) | `container: image: mcr.microsoft.com/playwright:v1.59.1-noble` con Chromium + system libs pre-instalados; 0 steps de install browsers |
| MinIO arrancado vía step manual `docker run` + `Wait for MinIO ready` con poll loop (~30s extra + brittleness) | MinIO declarado como `services.minio` con `bitnamilegacy/minio:2025.7.23-debian-12-r5` + `MINIO_DEFAULT_BUCKETS=aelium-storage` + healthcheck `curl /minio/health/live` (auto-managed por GHA) |
| Conexión a services vía `localhost:5432/6379/1025/9000` (port mapping del runner host) | Conexión vía DNS interno del network compartido: `postgres:5432`, `redis:6379`, `mailpit:1025`, `minio:9000`. Backend/frontend siguen `localhost:3001/3002` (mismo container del job) |
| Workflow legacy ADR-062 §C documentaba el workaround `docker run` porque `minio/minio` necesitaba `command: server /data` y GHA `services:` no lo permite | Ese workaround queda obsoleto: `bitnamilegacy/minio` arranca server automáticamente con env vars |

### 5.2 DC.13 — Sharding CI (parcial-canónica)

| Antes | Después |
|-------|---------|
| 1 job E2E secuencial — wall-clock ~25 min con 118 specs | 3 jobs paralelos (`matrix.shard: [1,2,3]`) — wall-clock ~10 min estimado |
| Falla en 1 spec cancelaba el job entero, reintento full | `fail-fast: false` permite ver fallos de TODOS los shards en un solo run; reintento independiente por shard |
| Artifact único `playwright-report/` | Artifacts por shard: `playwright-report-shard-{1,2,3}/` (`actions/upload-artifact@v4` rechaza nombres duplicados entre matrix jobs) |
| Local con `workers: 1 + fullyParallel: false` | Local **sin cambios** — paralelización local diferida a sub-sprint futuro condicionado |

### 5.3 Saneamiento documental (Fase C)

- `docs/60-roadmap/backlog.md` — DC.13 marcada ✅ parcial-canónica + DC.27 ✅, ambas con commits que las cierran y nota de paralelización local diferida.
- `docs/50-operations/e2e-environment.md §4.2` reescrita: refleja el modelo sharding CI + advertencia de aislamiento local sin cambios + cuándo abordar Sprint 13.5.6.
- Esta retrospectiva (`completed/sprint-13-5-5-ci-infra.md`).
- `completed/README.md` con índice cronológico actualizado (Sprint 13.5.5 añadido).
- `docs/60-roadmap/current.md` — Sprint 13.5.5 movido a `completed/`, sólo paraguas Sprint 7 + 7.5 vivos.

---

## 6. Lo que aprendimos

### 6.1 Inspeccionar specs reales antes de aceptar plan documentado

El plan canónico Sprint 13.5 §4.1 daba por descontado que paralelización local con `workers=4` era viable con "schema dinámico Postgres por worker". Al inspeccionar los 25 specs reales en Fase 0 de Sprint 13.5.5 se descubrió el bloqueo arquitectónico (un solo backend en `webServer`). **Lección:** un plan documentado no es contrato de viabilidad — siempre verificar contra código real antes de invertir sesiones.

### 6.2 Cierres parciales documentados son la doctrina canónica

DC.13 cerró parcial-canónica (CI sí, local no) en lugar de empujar Opción B (backend per-worker, 5-7 sesiones, riesgo alto). La doctrina Sprint 13.5 §6.4 ya lo había validado y este sub-sprint la confirma: cerrar lo que se puede cerrar bien y registrar la deuda diferida con trigger explícito vale más que forzar el cierre completo arriesgando la estabilidad.

### 6.3 Pin de imágenes externas para CI

El primer run falló porque `bitnami/minio:latest` ya no existe (retirado agosto 2025 por cambio de licencia/distribución). **Lección:** todo `:latest` en CI es deuda implícita. Pin canónico a tag fechado + comentario explicativo + plan de rotación cuando el repo legacy desaparezca.

### 6.4 Sharding CI vs paralelización local — son problemas distintos

El cuello de botella real estaba en CI (25 min wall-clock por PR), no en local (1 min). Atacar el cuello correcto con la herramienta correcta (`--shard` para CI, no `workers=4` local) entrega el 95% del valor con el 20% del riesgo.

### 6.5 Verificación CI iterativa funciona

El propio Sprint 13.5 §4.3 anticipó: "DC.13 + DC.27 requieren commits aislados verificables iterativamente contra CI real (no testeable localmente)". El run #25280493443 falló por `bitnami/minio:latest`; commit pequeño aislado `14493b0` lo arregló sin tocar el resto. Sin esa iteración, habría sido inviable detectar el problema en local.

---

## 7. DoD Sprint 13.5.5 verificado

### Código
- [x] `.github/workflows/ci.yml` migrado a `container: image: mcr.microsoft.com/playwright:v1.59.1-noble`.
- [x] MinIO declarado como `services.minio` con `bitnamilegacy/minio:2025.7.23-debian-12-r5` + healthcheck.
- [x] Service names (postgres / redis / mailpit / minio) en lugar de `localhost` para conexiones a services.
- [x] Eliminados 3 steps `Cache Playwright browsers` + `Install Playwright browsers` + `Install Playwright system deps`.
- [x] Eliminados 2 steps `Start MinIO` + `Wait for MinIO ready`.
- [x] `strategy.matrix` con 3 shards + `fail-fast: false` + artifact upload con sufijo `-shard-N`.
- [x] Step E2E ahora invoca `pnpm exec playwright test --shard=${{ matrix.shard }}/${{ matrix.total }}`.
- [x] Suite local sigue 118/118 verde con `workers: 1` (sin regresión — verificado en pre-push hooks).
- [x] CI sale verde con 3 shards paralelos en run del PR #26.

### Documentación (Fase C)
- [x] `docs/60-roadmap/backlog.md` — DC.13 ✅ parcial-canónica + DC.27 ✅ con commits que las cierran.
- [x] `docs/50-operations/e2e-environment.md §4.2` reescrita para reflejar sharding CI + advertencia local sin cambios.
- [x] Esta retrospectiva (`sprint-13-5-5-ci-infra.md`).
- [x] `completed/README.md` con Sprint 13.5.5 añadido al índice.
- [x] `current.md` — Sprint 13.5.5 movido de "en curso" a `completed/`.

### Proceso
- [x] Conventional Commits respetados (warnings de scope no bloqueantes).
- [x] Commits aislados verificables iterativamente contra CI real (Fase A → fix MinIO → Fase B).
- [x] Deuda diferida (paralelización local con `workers > 1`) registrada con trigger explícito (suite local > 2 min) y ubicación canónica futura (Sprint 13.5.6).

---

## 8. Próximas vías legítimas (post Sprint 13.5.5)

Con Sprint 13.5.5 cerrado, la cola activa P2 vuelve a:

### Vía 1 (recomendada por defecto) — Sprint 15A Plugin Framework

> *"Implementa Sprint 15A — manifest plugin + loader dinámico desde Settings + encriptación API keys + helpers `core/provisioning/plugin-utils.ts` extendidos."*

- ~1-2 sesiones. Construye sobre ADR-077 (contrato congelado) + ADR-079 (bridge canónico tasks).
- Tras Sprint 13.5 + 13.5.5, el dashboard está sin ruido residual y con CI rápido — momento ideal para abrir el "sistema operativo de plugins".

### Vía 2 — Sprint 13 §13.AUTH (cookies httpOnly + SC nativo)

- ~3-5 sesiones. Bloquea Sprint 12+ por ADR-078 §5.
- Cierra DC.6 + DC.28 acoplados; hidrata el endpoint `/me/permissions` al `AuthContext` (cierre 100% DC.15).

---

## 9. Documentación canónica vigente tras Sprint 13.5.5

- [`docs/60-roadmap/current.md`](../current.md) — Sprint 13.5.5 movido a `completed/`. Cabecera actualizada.
- [`docs/60-roadmap/backlog.md`](../backlog.md) — DC.13 ✅ parcial-canónica + DC.27 ✅ con notas de cierre y paralelización local diferida.
- [`docs/50-operations/e2e-environment.md`](../../50-operations/e2e-environment.md) §4.2 — reescrita para reflejar sharding CI.
- [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml) — job E2E con `container:` + matrix sharding + service container MinIO.

---

> Sprint 13.5.5 cerrado al 100%. Cola activa P2: **Sprint 15A Plugin Framework** como cabeza de cola.
