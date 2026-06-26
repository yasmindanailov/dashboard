# Local CI playbook — flujo canónico antes de PR

> Documento maestro del flujo de validación local pre-PR. Sprint 15C.II post-Fase D
> (2026-05-10) — derivado del incidente billing GitHub Actions que motivó endurecer
> las garantías locales contra CI rojo predecible.
>
> Audiencia: cualquier persona (humana o agente) que vaya a abrir un PR contra
> `master`.
>
> Documentos relacionados: [`ci-setup.md`](./ci-setup.md) (workflow remoto detallado),
> [`git-hooks.md`](./git-hooks.md) (mecánica husky/lint-staged), [`commit-conventions.md`](./commit-conventions.md)
> (formato commit messages), [`definition-of-done.md`](./definition-of-done.md) (criterios
> de cierre de sprint).

---

## Filosofía — defense in depth

Tu PR pasa por tres barreras antes de mergear, en este orden. Cada una atrapa lo
que la anterior dejó pasar:

| # | Barrera | Cuándo se ejecuta | Tiempo típico | Bloquea |
|---|---|---|---|---|
| **1** | **lint-staged** (`pre-commit`) | Cada `git commit` | 1-5s | Errores ESLint en archivos modificados |
| **2** | **pre-push smart** | Cada `git push` | 60-120s | Typecheck + lint:check + tests del subset afectado (ver §2) |
| **3** | **CI remoto** (`.github/workflows/ci.yml`) | Apertura PR + push a `master` | 3-15 min | Backend + Frontend (siempre). E2E (solo bajo política §3) |

La regla canónica: **si pre-push pasa, CI debería pasar también**. La única
excepción legítima es el bloque E2E que solo corre remotamente (es muy caro
ejecutarlo en local de manera rutinaria).

---

## 1. Comando canónico antes de pushear

Antes de cualquier `git push` que vaya a abrir o actualizar un PR, ejecuta:

```bash
pnpm ci:check
```

Este script orquesta exactamente lo que CI Backend + Frontend hace. Si pasa,
tu push tiene >95% de probabilidad de pasar CI también.

### Variantes según el momento

| Comando | Qué hace | Tiempo | Cuándo usarlo |
|---|---|---|---|
| `pnpm ci:check` | Backend (typecheck + lint:check + tests) + Frontend (typecheck + lint:check + tests) | ~3-5 min | **Antes de cada push** que vaya a PR |
| `pnpm ci:check:full` | `ci:check` + build backend + build frontend | ~5-8 min | **Antes de marcar el PR como ready** o tras cambios grandes en config |
| `pnpm ci:backend` | Solo backend (typecheck + lint:check + tests) | ~2-3 min | Cuando solo tocaste backend |
| `pnpm ci:frontend` | Solo frontend (typecheck + lint:check + tests) | ~30-60s | Cuando solo tocaste frontend |
| `pnpm ci:install` | Re-sincroniza node_modules con lockfiles (root + backend + frontend) | ~30-90s | Tras `git pull` que cambió `pnpm-lock.yaml` o cambios de deps |
| `pnpm ci:e2e` | Suite E2E completa (build + Playwright run) | ~10-15 min | Cuando tu cambio toca flujos E2E o antes de cerrar un sprint |

### Cuándo NO hace falta ejecutar manualmente

El hook **pre-push smart** (§2) ya ejecuta `ci:check` automáticamente sobre el
subset afectado al hacer `git push`. Si dejas que el hook corra, no necesitas
ejecutarlo a mano antes. Hacerlo igualmente es defensivo (más rápido para
iterar — el hook se ejecuta al push final, no entre commits).

---

## 2. Pre-push smart detection

`.husky/pre-push` ejecuta el subset de checks adecuado **detectando qué cambió**
desde `origin/master`:

| Archivos cambiados | Checks ejecutados | Tiempo |
|---|---|---|
| Solo `backend/**` | Backend typecheck + lint + tests | ~2-3 min |
| Solo `frontend/**` | Frontend typecheck + lint + tests | ~30-60s |
| `backend/**` + `frontend/**` | Ambos | ~3-5 min |
| `tests/e2e/**` o `playwright.config.ts` | Ambos (afectan E2E que toca todo) | ~3-5 min |
| `package.json` / `pnpm-lock.yaml` / `.husky/*` / `.lintstagedrc.cjs` | Ambos (cambios transversales) | ~3-5 min |
| Solo `docs/**` / `*.md` / `.github/**` (sin `workflows/`) / `.gitignore` | **Skip — no bloquea** | <1s |
| Sin commits nuevos vs origin/master | Skip | <1s |

### Bypass — emergencias documentadas

```bash
git push --no-verify
```

Salta el hook entero. **Uso excepcional**, no hábito. Casos legítimos:

- Push doc-only correction donde el hook ya pasó la última vez y los archivos
  doctorados no afectan runtime.
- Push de rama temporal WIP que NO va a abrir PR (ej. backup de trabajo, rama
  experimental local).
- Hot-fix urgente con validación local fuera de banda (alguien ejecutó
  `ci:check:full` aparte y se documenta en el PR).

**NO legítimos**:
- Saltar el hook porque "tarda mucho" en uso diario. Si tarda > 5 min,
  significa que tocaste cambios grandes — el tiempo extra está justificado.
- Saltar el hook porque sabes que falla y no quieres arreglar. Eso es deuda
  técnica oculta.

---

## 3. Política de ejecución CI remoto (workflows)

El workflow [`ci.yml`](../../.github/workflows/ci.yml) ejecuta tres tipos de jobs
con políticas distintas para optimizar consumo de minutos (plan Free GitHub
Actions = 2000 min/mes en repos privados):

| Job | Ejecuta en | Tiempo típico | Política |
|---|---|---|---|
| **Backend** | Cada PR + push a `master` | ~3 min | Siempre (rápido — Backend roto no se mergea) |
| **Frontend** | Cada PR + push a `master` | ~3 min | Siempre |
| **E2E** (3 shards) | `push` a `master` post-merge **O** PR con label `ready-for-e2e` | ~10-25 min × 3 | Opt-in en PRs para ahorrar ~70% minutos CI |

### Cómo añadir la label `ready-for-e2e` a un PR

Cuando tu PR esté listo para merge (revisión completada, conflictos resueltos,
tests locales verdes), añade la label:

- Vía CLI: `gh pr edit <PR#> --add-label ready-for-e2e`
- Vía UI: en la página del PR, panel derecho → "Labels" → seleccionar `ready-for-e2e`

GitHub Actions detecta la label y arranca E2E automáticamente. La label
desencadena los 3 shards Playwright que ejecutan los ~120 tests del proyecto.

### Cuándo SÍ ejecutar E2E pronto

- Tu cambio toca el flujo end-to-end de un plugin (provision, action, sso).
- Modificas `getServiceInfo`, `executeAction`, `getSsoUrl` o sus wrappers.
- Cambias el schema Prisma + migración.
- Tocas `tests/e2e/**` o `playwright.config.ts`.
- Cambios en el orquestador de provisioning o cron jobs.

Para estos casos, **añade la label al abrir el PR**, no esperes al final.

### Cuándo basta con esperar al push a master

- Cambios de doctrina / refactor que typecheck + tests unit cubren bien.
- Doc updates de cualquier scope.
- Cambios admin UI puro que no toca el contrato del plugin.
- Aumentos de cobertura (tests nuevos sin cambio de production code).

---

## 4. Casos de uso típicos — qué comando en qué momento

### Desarrollo iterativo dentro de una fase

```bash
# Mientras codeas — sin checks completos
git add <archivos>
git commit -m "feat(scope): cambio X"  # → pre-commit lint-staged (1-5s)

# Cuando vas a pushear la primera vez
git push -u origin tu-rama             # → pre-push smart (1-3 min)
gh pr create --title "..." --body "..."

# Mientras iteras el PR (varios commits + push)
git push                                # → pre-push smart cada vez
```

### Antes de marcar PR como listo para merge

```bash
pnpm ci:check:full                      # ~5-8 min — full backend + frontend incluyendo builds
gh pr edit <PR#> --add-label ready-for-e2e
```

### Tras un `git pull` que actualiza dependencies

```bash
pnpm ci:install                         # ~30-90s — sincroniza node_modules con lockfiles
```

### Al cerrar un sprint o fase grande

```bash
pnpm ci:check:full                      # Validación completa local
pnpm ci:e2e                             # ~10-15 min — E2E suite completa local
```

---

## 5. Troubleshooting

### "pre-push tarda mucho"

Verifica qué subset se está ejecutando — si solo tocaste backend, frontend no
debería correr. Si ambos, ~3-5 min es esperable.

Si quieres ver tiempos por step:

```bash
time pnpm ci:backend
time pnpm ci:frontend
```

### "pre-push falla con 'origin/master no encontrado'"

```bash
git fetch origin master
```

El hook lo intenta automáticamente, pero si tu red estaba caída en ese momento,
hazlo manualmente.

### "pre-push falla con prisma generate error"

```bash
cd backend && pnpm prisma generate
```

Tras cambiar `schema.prisma`, Prisma client necesita regenerarse antes de que
typecheck pase. El script `ci:backend` lo hace automáticamente, pero si lo
ejecutaste a mano sin él, hay que regenerar.

### "lint:check muestra warnings que no existían"

Lint-staged en pre-commit usa `--fix` pero NO `--max-warnings=0`. CI remoto SÍ
usa `--max-warnings=0` para backend (frontend usa `lint` sin esa flag por la
deuda DC.6 — 27 warnings `set-state-in-effect`). Si lint:check local falla,
revisa qué warnings se introdujeron desde tu último commit.

### "Tests pasan local pero CI falla"

Diferencias típicas:

1. **Variables de entorno**: CI tiene su propio `.env` (definido en `ci.yml`).
   Compara con tu `.env` local.
2. **Servicios Docker**: tu Postgres / Redis / Mailpit corriendo local con
   versión distinta a CI (Postgres 16, Redis 7).
3. **Prisma client desactualizado**: si tocaste `schema.prisma` y no regeneraste.
4. **Tests no determinísticos** (flakiness): si vuelves a pushear el mismo
   commit y CI pasa, era flake. Documenta en el PR.

### "E2E label no dispara nada"

Verifica que añadiste la label exacta: `ready-for-e2e`. Si la añades y no se
dispara, comprueba el workflow run en GitHub Actions — debe estar listado con
"Re-run workflow" disponible.

---

## 6. Bypass policy — cuándo es aceptable mergear sin CI verde

Hereda de la lógica del [dossier Sprint 15C.II §A.9.10](../60-roadmap/sprint-15c-ii-hardening-enhance-dossier.md#a910-bypass-ci-documentado--incidente-billing-externo-github-actions-2026-05-10).
**Las 3 condiciones DEBEN concurrir simultáneamente:**

1. **Motivo externo al equipo**: GitHub Actions caído, proveedor de servicios
   inaccesible, billing accidentado, runner agotado. NO incluye "tarda
   demasiado", "no tengo tiempo", "estoy seguro de que pasa".
2. **Validación local exhaustiva ejecutada y registrada**: mínimo `pnpm
   ci:check:full` verde + boot real verificado del stack (backend + frontend
   arrancados sin errores DI ni typecheck runtime).
3. **Documentación formal en el PR**: comentario con el detalle del bypass
   (intentos CI, validación local ejecutada, checks NO cubiertos y análisis
   de riesgo). El PR queda auditable.

Si las 3 no concurren, **NO bypass**. Espera a resolver el bloqueo o pide
ayuda en lugar de saltarte la barrera.

Patrón canónico aplicado por primera vez en [PR #57](https://github.com/yasmindanailov/dashboard/pull/57)
(Sprint 15C.II Fase D) — ver §A.9.10 del dossier para el caso de referencia.

---

## 7. Mantenimiento del setup

### Cuando cambia la lista de subproyectos

Si añades un nuevo subproyecto (ej. `mobile/`), actualiza:

1. **`.husky/pre-push`** — añade el case del nuevo subdir en la detección.
2. **`package.json`** root — añade `ci:mobile` script.
3. **`.lintstagedrc.cjs`** — añade glob para los archivos del nuevo subdir.
4. **`.github/workflows/ci.yml`** — añade un nuevo job análogo a `backend`/`frontend`.
5. **Este documento** — actualiza las tablas §1-§3.

### Cuando cambia un comando canónico

Si renombras un script (ej. `lint:check` → `lint:strict`), actualiza:

1. **`package.json`** root (script `ci:*`).
2. **`.husky/pre-push`** (referencia al nuevo nombre).
3. **`.github/workflows/ci.yml`** (step name).
4. **Este documento** + [`ci-setup.md`](./ci-setup.md) + [`git-hooks.md`](./git-hooks.md).

### Cuando GitHub cambia su política de minutos / pricing

Re-evaluar §3 (política E2E). Si los minutos free aumentan o el coste por
minuto baja, quizás merece la pena correr E2E en cada PR. Si suben, hay que
restringir más (ej. E2E solo cuando hay cambio relevante detectado por path
filter en el workflow).

---

## 8. Resumen visual del flujo canónico

```text
┌────────────────────────────────────────────────────────────────────┐
│ Mientras codeas — iteración rápida                                 │
└────────────────────────────────────────────────────────────────────┘
       │
       ▼
git commit  ──► pre-commit (lint-staged) ──► 1-5s ──► ok o aborta
       │
       ▼
┌────────────────────────────────────────────────────────────────────┐
│ Cuando vas a pushear                                               │
└────────────────────────────────────────────────────────────────────┘
       │
       ▼
git push    ──► pre-push (smart detection) ──► 1-3 min ──► ok o aborta
       │                  │
       │                  └── opcional: pnpm ci:check antes de push
       │                                  (defensivo si quieres
       │                                   pillar antes el fallo)
       ▼
GitHub abre PR
       │
       ▼
┌────────────────────────────────────────────────────────────────────┐
│ CI remoto                                                          │
└────────────────────────────────────────────────────────────────────┘
       │
       ├── Backend job (siempre) ──► ~3 min ──► ✅
       ├── Frontend job (siempre) ──► ~3 min ──► ✅
       └── E2E job (3 shards):
              ├── pull_request sin label ────► skip (ahorro CI)
              ├── pull_request label `ready-for-e2e` ──► ~10-25 min × 3 ──► ✅
              └── push a master post-merge ──► ~10-25 min × 3 ──► ✅
       │
       ▼
┌────────────────────────────────────────────────────────────────────┐
│ Antes de marcar PR como ready for merge                            │
└────────────────────────────────────────────────────────────────────┘
       │
       ├── pnpm ci:check:full ──► validación local exhaustiva
       │       (typecheck + lint + tests + builds, ambos lados)
       │
       ├── gh pr edit <PR#> --add-label ready-for-e2e
       │       (dispara E2E remoto si no había corrido aún)
       │
       └── (opcional) pnpm ci:e2e ──► validación E2E local
               (~10-15 min, requiere stack levantado)
       │
       ▼
Merge a master ──► CI dispara E2E en push (red de seguridad final)
```

---

## 9. Histórico de cambios al flujo

| Fecha | Cambio | Motivación |
|---|---|---|
| 2026-04-26 | Setup inicial CI (`ci-setup.md`) — Backend + Frontend jobs | Sprint F0.1 |
| 2026-04-27 | Husky + lint-staged + pre-commit (`git-hooks.md`) | Sprint F0.2 |
| 2026-04-27 | Commitlint + commit-msg hook | Sprint F0.3 |
| 2026-04-28 | E2E job añadido a CI (`ci.yml` E2E section) | Sprint F0.4 |
| 2026-05-10 | **Este playbook** + scripts `ci:*` root + pre-push smart + E2E opt-in por label | Sprint 15C.II post-Fase D — incidente billing motivó endurecer garantías locales y optimizar consumo CI |
