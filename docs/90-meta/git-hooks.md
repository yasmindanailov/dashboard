# Git hooks — Husky + lint-staged

> Validación automática local antes de cada commit y push.
> Detecta errores en tu máquina antes de que lleguen a GitHub.
>
> **Documento maestro del flujo pre-PR:** [`local-ci-playbook.md`](./local-ci-playbook.md).
> Esta página detalla la mecánica husky/lint-staged; el playbook
> describe el flujo end-to-end (cuándo ejecutar qué + bypass policy).

---

## Qué hacen

Cada vez que ejecutas `git commit` o `git push`, Git ejecuta automáticamente unos scripts (hooks). Los nuestros viven en `.husky/` y son:

| Hook | Cuándo | Qué ejecuta | Qué pasa si falla |
|------|--------|-------------|-------------------|
| `pre-commit` | Antes de `git commit` | `lint-staged` — auto-formatea archivos modificados | El commit se aborta y los cambios siguen en working directory |
| `pre-push` | Antes de `git push` | **Smart detection** del subset afectado (typecheck + lint:check + tests del/los subproyecto(s) cambiado(s)) — ver [local-ci-playbook §2](./local-ci-playbook.md#2-pre-push-smart-detection) | El push se aborta — los commits siguen locales hasta arreglar |
| `commit-msg` | Tras escribir mensaje commit | Commitlint conventional commits | Commit aborta si formato no canónico — ver [`commit-conventions.md`](./commit-conventions.md) |

**Resultado:** la mayoría de errores se atrapan en tu máquina, no en CI. Ahorra ciclos de "subir → CI rojo → arreglar → volver a subir".

---

## Arquitectura

| Archivo | Rol |
|---------|-----|
| `package.json` (root) | Tooling-only: husky + lint-staged + commitlint + scripts `ci:*` orquestador (ver [playbook §1](./local-ci-playbook.md#1-comando-canónico-antes-de-pushear)) |
| `.husky/pre-commit` | Una sola línea: `pnpm exec lint-staged` |
| `.husky/pre-push` | Smart detection del subset afectado (Sprint 15C.II post-Fase D): typecheck + lint:check + tests solo del/los subproyecto(s) cambiado(s) vs `origin/master`. Si solo cambian docs → skip silencioso |
| `.husky/commit-msg` | Commitlint validation contra conventional commits config |
| `.lintstagedrc.cjs` | Configuración con función JS que mapea archivos staged a su proyecto y ejecuta el ESLint correspondiente |

---

## Qué hace `lint-staged` exactamente

Solo procesa **archivos staged** (los que vas a commitear), no todo el repo.

| Patrón | Comando |
|--------|---------|
| `backend/**/*.{ts,js}` | `cd backend && pnpm exec eslint --fix <archivos>` |
| `frontend/**/*.{ts,tsx,js,jsx}` | `cd frontend && pnpm exec eslint --fix <archivos>` |

Ejemplo: si modificas `backend/src/modules/auth/auth.service.ts`, lint-staged ejecuta ESLint solo en ese archivo y aplica auto-fix. Si tras el fix quedan **errores reales** (no warnings), el commit se aborta.

> **Nota durante saneamiento:** mientras existan los 344 errores reales pendientes (F0.6), tocar un archivo con error preexistente bloqueará tu commit aunque tú no hayas introducido el bug. Si te ocurre, dime y lo arreglamos en el momento.

---

## Comportamiento esperado

### Caso normal — todo OK

```
$ git commit -m "feat: añade endpoint X"
✔ Backed up original state
✔ Running tasks for staged files...
✔ Applying modifications from tasks...
✔ Cleaning up temporary files...
[master abc1234] feat: añade endpoint X
```

### Caso con error real

```
$ git commit -m "feat: foo"
✖ backend/**/*.{ts,js}:
  src/modules/auth/auth.service.ts
    42:10  error  Promise without await — no-floating-promises

husky - pre-commit script failed (code 1)
```

El commit no se crea. Tus cambios siguen en working directory. Tienes que arreglar y volver a `git add` + `git commit`.

### Caso con warning (no bloquea)

```
$ git commit -m "feat: foo"
✔ ...
✔ Cleaning up...
[master abc1234] feat: foo
```

Los warnings aparecen pero no abortan. Se acumulan como deuda hasta el próximo saneamiento.

---

## Bypass de emergencia

**Solo si sabes lo que haces:**

```bash
git commit --no-verify -m "..."
git push --no-verify
```

`--no-verify` salta el hook. Útil cuando un hook es buggy o un caso muy excepcional. **No usar como hábito** — anula la protección entera.

---

## Qué hacer si el hook falla por algo no relacionado

| Síntoma | Causa probable | Solución |
|---------|---------------|----------|
| `husky: command not found` | Husky no instalado | `pnpm install` desde el root |
| `core.hooksPath` incorrecto | Setup roto | `pnpm install` (re-ejecuta `prepare`) |
| Typecheck falla por Prisma | Prisma client no generado | `cd backend && pnpm prisma generate` |
| Hook lento (>30s) | Repo grande con muchos archivos modificados | Normal en commits grandes; lint-staged es rápido salvo en monstruos |
| Hook no se dispara | `core.hooksPath` desconectado | Ver `git config core.hooksPath` — debe ser `.husky/_` |

---

## Cómo desactivar temporalmente (no recomendado)

Si tienes que desactivar Husky por un rato (ejemplo: modo debug intenso):

```bash
HUSKY=0 git commit -m "..."
```

Variable de entorno `HUSKY=0` desactiva todos los hooks. Volverá a funcionar sin esa variable.

---

## Relación con CI

El CI (`.github/workflows/ci.yml`) **repite** las mismas validaciones que los hooks locales, más algunas extra (build, tests). Esto es intencional:

- Los hooks son la **primera barrera** (rápido, en tu máquina)
- El CI es la **segunda barrera** (seguro, en máquina limpia)

Si los hooks pasaron pero CI falla, suele ser porque tu máquina tiene algo distinto (variable de entorno, dependencia caché, etc.). Los logs del CI lo dirán.

---

## Próximos pasos del setup

- [ ] **F0.3** — añadir `commitlint` al hook `commit-msg` para validar formato de mensajes (Conventional Commits)
- [ ] **F0.6** — sanear los 344 errores de lint reales para activar `--max-warnings=0` en lint-staged (modo estricto)
