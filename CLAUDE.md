# CLAUDE.md — Contrato del agente (Aelium Dashboard)

> Este archivo se **auto-carga en cada sesión**. Es el contrato mínimo de disciplina para que cualquier agente, en cualquier chat nuevo, opere de forma coherente y profesional. Es corto a propósito: lo demás se lee bajo demanda siguiendo los punteros.

**Proyecto:** SaaS de hosting + dominios (pre-producción). Backend NestJS 11 + Prisma 7 + PostgreSQL 16 + Redis + BullMQ. Frontend Next.js 16 + React 19. Monorepo: `backend/` y `frontend/` son proyectos pnpm independientes.

---

## 1. Arranque de cada sesión (no lo saltes)

Lee, **en este orden**, antes de tocar nada:

1. [`docs/README.md`](docs/README.md) — índice maestro / mapa de toda la doc (qué es vivo / referencia / futuro / archivo).
2. [`docs/90-meta/audit-2026-06-25.md`](docs/90-meta/audit-2026-06-25.md) — estado real **medido** del código (la auditoría de conformidad vigente; sustituye a `audit-2026-06-21`).
3. [`docs/60-roadmap/current.md`](docs/60-roadmap/current.md) — qué se está construyendo **ahora** (sprint activo).
4. [`docs/00-foundations/rules.md`](docs/00-foundations/rules.md) — reglas canónicas **R1–R17 / D1–D11** (inviolables).
5. [`docs/90-meta/development-playbook.md`](docs/90-meta/development-playbook.md) + [`docs/90-meta/SESSION_RULES.md`](docs/90-meta/SESSION_RULES.md) — proceso + reglas operativas.

> El estado del sprint NO se repite aquí (driftearía): la verdad viva está en `current.md`. **No hardcodees números** (ADRs, tests, sprints) — apunta a su índice.

## 2. Las 3 leyes de este código

1. **La doc es un mapa, no un evangelio.** Está bien mantenida pero puede tener drift. **Verifica contra el código real** (grep/read) antes de afirmar un hecho — especialmente conteos, "X está implementado", o file:line. Si encuentras drift, corrígelo o anótalo.
2. **Las reglas canónicas (`rules.md` R1–R17 / D1–D11) no se rompen.** Cítalas en el código y en los commits (`// R8 …`, `cumple R15`). Solo se modifican vía ADR, nunca por una excepción puntual.
3. **Una rama por (sub-)fase. Conventional Commits. Nunca `--no-verify`** salvo emergencia documentada (ver bypass policy en [`local-ci-playbook.md`](docs/90-meta/local-ci-playbook.md)). Trabaja siempre en rama, no en `master`.

## 3. Antes de CODEAR (puerta de entrada)

- Lee el `docs/20-modules/<módulo>/contract.md` del módulo que vas a tocar.
- Si introduces/consumes un evento → mira [`docs/20-modules/_events.md`](docs/20-modules/_events.md) **antes** de emitirlo.
- Si usas un nombre nuevo → búscalo en [`docs/00-foundations/glossary.md`](docs/00-foundations/glossary.md) (puede existir el canónico).
- Si la decisión no está clara → el **ADR frozen gana** sobre cualquier apuntado de dossier/nota (lección L18). Materializa mejoras como Amendment del ADR, no como desvío silencioso.
- Mira la auditoría vigente: ¿hay un hallazgo conocido en esa área?

## 4. Antes de CERRAR (Definition of Done — no negociable)

Verde local **completo** antes de pushear/cerrar fase:

```
pnpm --dir backend typecheck && pnpm --dir backend lint:check && pnpm --dir backend test
pnpm --dir frontend typecheck && pnpm --dir frontend lint:check && pnpm --dir frontend test
```

- **Si tocaste algún `@Module`/imports/exports → BOOT SMOKE OBLIGATORIO.** `ci:check` NO atrapa errores del grafo DI de NestJS (`UnknownDependenciesException`); solo el arranque real lo hace (`pnpm --dir backend dev` → confirmar `Nest application successfully started` + `4/4 plugins`).
- `pnpm ci:check` antes de pushear (ver [`local-ci-playbook.md`](docs/90-meta/local-ci-playbook.md)).
- Documentación al día: `contract.md` / `admin.md` / `_events.md` del módulo tocado.
- DoD completo: [`docs/90-meta/definition-of-done.md`](docs/90-meta/definition-of-done.md).

## 5. Lecciones operativas (causaron fallos reales — respétalas)

- **`lint-staged` (pre-commit) ≠ `lint:check` (CI).** El hook de commit usa config ligera sin reglas type-aware; corre el **`lint:check` completo** antes de cerrar o el CI te pillará `require-await`/`no-unsafe` (DC.NEW-69). _(Existe `.husky/pre-push` que ya corre `lint:check`.)_
- **R-IPv6:** en `.env` de dev usa `127.0.0.1`, **nunca `localhost`** (DATABASE_URL, REDIS_HOST, S3_ENDPOINT, MAIL_HOST, BACKEND_URL).
- **R8 Outbox:** los eventos que disparan acciones cross-módulo se persisten en `event_outbox` dentro de la `$transaction`, no `emit()` directo.
- **R3 audit:** tablas `audit_*` solo INSERT. Nunca UPDATE/DELETE (salvo el cron de retención).
- **R4:** `core/` y `modules/` no importan un plugin concreto — acceso por interfaz/capability, nunca `if (provisioner === 'X')`.
- **Contrato de plugins frozen** (ADR-077 v2): cambios additivos (capability-driven por presencia), nunca breaking sin bump de versión.

## 6. Levantar el stack (dev)

```
docker compose -f docker/docker-compose.dev.yml up -d   # postgres + redis + mailpit + minio
pnpm --dir backend dev      # NestJS :3001/api/v1 (watch)
pnpm --dir frontend dev     # Next :3002
```

Mock de Enhance (para smoke del plugin de hosting) en `:3099`: ver `tests/e2e/fixtures/mock-enhance-runner.ts`. Cuentas seed canónicas y datos demo: [`docs/50-operations/seed-reference.md`](docs/50-operations/seed-reference.md).

## 7. Memoria del agente

La memoria persistente vive en `~/.claude/projects/<ruta>/memory/` (índice en `MEMORY.md`). Es contexto de fondo, refleja lo que era cierto al escribirse — **si cita un file/flag, verifica que sigue existiendo** antes de recomendarlo. Guarda ahí lo no derivable del repo (decisiones, preferencias, estado), no lo que el código/git ya registra.

---

> **Si solo recuerdas una cosa:** verifica contra el código, respeta las reglas canónicas, y cierra con el DoD verde (incluido el boot smoke si tocaste módulos). La robustez es una práctica por commit, no un estado.
