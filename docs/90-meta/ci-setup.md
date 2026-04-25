# CI — Continuous Integration

> Configuración del pipeline automático que valida cada commit y PR.
> Documento operativo: explica qué hace, cómo leerlo, y qué hacer cuando falla.

---

## Qué es esto

Cada vez que se sube código a GitHub (commit a `master` o pull request), GitHub Actions ejecuta automáticamente una serie de comprobaciones. El resultado aparece como un check verde (✅) o rojo (❌) junto al commit.

**Sin CI:** los errores solo aparecen cuando tú o un usuario los descubre en producción.
**Con CI:** los errores aparecen antes de mergear, en menos de 5 minutos.

---

## Qué comprueba el pipeline

Archivo: [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)

Dos jobs corren **en paralelo** (uno para backend, otro para frontend) en máquinas Linux limpias.

### Backend
| # | Paso | Bloqueante | Qué verifica |
|---|------|------------|--------------|
| 1 | Install dependencies | ✅ | `pnpm-lock.yaml` no está corrupto, paquetes existen |
| 2 | Generate Prisma client | ✅ | El schema Prisma es válido y compila |
| 3 | **Typecheck** | ✅ | Todo el código TypeScript es coherente (no hay tipos rotos) |
| 4 | **Build** | ✅ | El backend compila a JavaScript ejecutable |
| 5 | Lint | ❌ informativo | Reglas de calidad de código (hoy hay ~239 errores conocidos pendientes — ver [Próximos pasos](#próximos-pasos)) |
| 6 | **Tests** | ✅ | Los tests unitarios pasan (hoy 0 tests, pasa por defecto con `--passWithNoTests`) |

### Frontend
| # | Paso | Bloqueante | Qué verifica |
|---|------|------------|--------------|
| 1 | Install dependencies | ✅ | Paquetes instalables |
| 2 | **Typecheck** | ✅ | TypeScript correcto |
| 3 | Lint | ❌ informativo | ~105 errores reales pendientes |
| 4 | **Build** | ✅ | Next.js compila la app |

> **Bloqueante** = si falla, el check sale rojo, no debes mergear.
> **Informativo** = si falla, el check muestra advertencia pero el job sigue verde. Solo durante la fase actual de saneamiento.

---

## Cómo verlo en GitHub

### En la lista de commits
Cada commit muestra un icono al lado del mensaje:
- 🟡 amarillo: el CI está corriendo (espera 3-5 minutos)
- ✅ verde: todos los jobs pasaron
- ❌ rojo: al menos un job falló

### En un Pull Request
GitHub muestra los checks al fondo de la página, con detalle por job. Si algo falla, hay un enlace "Details" que abre los logs.

### Acción del usuario

| Situación | Qué hago yo (Claude) | Qué haces tú |
|-----------|----------------------|--------------|
| CI verde | Sigo trabajando con confianza | Apruebas el merge si era un PR |
| CI rojo (1-2 jobs) | Investigo logs, arreglo, vuelvo a pushar | Esperas a que arregle, no mergees |
| CI rojo recurrente | Reporto y propongo cambios al pipeline | Lo discutimos juntos antes de cambiar |
| Job lento (>10 min) | Investigo cuellos de botella | Solo reportar si te molesta |

---

## Por qué algunos checks no son bloqueantes (todavía)

Auditoría inicial encontró:
- **Backend:** 239 errores reales de lint (no-unsafe-*, floating-promises, unsafe-enum-comparison)
- **Frontend:** 105 errores reales (set-state-in-effect, exhaustive-deps, rules-of-hooks, no-explicit-any)

Si pusiéramos `lint:check` como bloqueante hoy, **el CI estaría rojo en cada commit** y no podríamos avanzar.

**Plan de saneamiento (sesión dedicada próximamente):**
1. Categorizar errores por gravedad (bug real vs falso positivo).
2. Arreglar bugs reales.
3. Documentar excepciones legítimas con `eslint-disable` justificado.
4. Volver `lint:check` bloqueante.

A partir de ahí, cualquier código nuevo que introduzca un error de lint **rompe el CI**.

---

## Cómo arrancar el CI por primera vez

Una vez subas este workflow a GitHub:

1. **Verificar que GitHub Actions está habilitado**
   - Ve a `https://github.com/yasmindanailov/dashboard/actions`
   - Si te pide aceptar workflows, acéptalos.
2. **Hacer un commit cualquiera** (puede ser este mismo o uno de prueba)
3. **Esperar 3-5 minutos**
4. **Revisar en GitHub Actions** que ambos jobs (Backend, Frontend) salen verdes

Si ambos salen verdes en el primer intento, el CI funciona. Si alguno sale rojo, abrir los logs y reportar.

---

## Plan free de GitHub — limitaciones

Tu repo es privado en GitHub Free. Esto significa:

| Recurso | Límite Free | Impacto |
|---------|-------------|---------|
| Minutos de CI/mes | 2000 min | Más que suficiente para desarrollo solo |
| Workflows en paralelo | Limitados | Imperceptible para nuestro tamaño |
| Branch protection | **NO disponible** | Ver siguiente sección |
| Secrets | Disponibles | Para variables sensibles cuando haya prod |

---

## Branch protection en plan Free privado

GitHub Free **no permite reglas de protección de branch** en repos privados. En la práctica significa que puedes hacer push directo a `master` aunque el CI esté rojo (no hay nada que te lo impida automáticamente).

**Mientras estés en plan Free privado:**
- La protección la haces tú: **NO mergees / pushees a master con CI en rojo**
- Husky (que configuraremos pronto) bloqueará commits malos antes incluso de subirlos
- Cuando tengas equipo o despliegues a producción, considerar pagar **GitHub Pro ($4/mes)** para activar protection rules

---

## Variables y secrets

Hoy el CI no necesita secrets (no se conecta a producción ni a base de datos). En el futuro:

| Cuándo | Qué secret | Para qué |
|--------|------------|----------|
| Tests E2E con DB | `DATABASE_URL` | Postgres efímero del CI |
| Deploy a staging | `STAGING_DEPLOY_KEY` | SSH al servidor staging |
| Sentry production | `SENTRY_AUTH_TOKEN` | Subir source maps |
| Notificaciones | `SLACK_WEBHOOK` o similar | Avisar en chat |

Los secrets se gestionan en `github.com/yasmindanailov/dashboard/settings/secrets/actions` — **nunca en el código**.

---

## Próximos pasos del setup F0 (Salvaguardas)

Tras este CI básico, viene:

1. ⏭️ **F0.2** Husky + lint-staged (validación pre-commit local — bloquea commits malos antes de pushar)
2. ⏭️ **F0.3** Conventional Commits + commitlint (formato de mensaje de commit validado automáticamente)
3. ⏭️ **F0.4** Suite mínima de tests E2E (los 3 flujos críticos: login, checkout, escalación)
4. ⏭️ **F0.5** Sentry para errores de producción (cuando haya despliegue real)
5. ⏭️ **F0.6** Saneamiento de los 344 errores de lint
6. ⏭️ **F0.7** Definition of Done por sprint
7. ⏭️ **F0.8** Branch protection o equivalente

---

## Si algo va mal

| Problema | Solución |
|----------|----------|
| CI tarda más de 10 min | Reportar — investigamos qué se ralentizó |
| Workflow no se ejecuta | Verificar Actions habilitado en Settings → Actions → Allow all actions |
| "frozen-lockfile" error | Pasó algo raro en `pnpm install`. Reportar con el log |
| Build falla por env var | Añadir variable al workflow o como secret |
| Job aleatoriamente falla | Reintentar (botón "Re-run jobs"). Si vuelve a fallar, reportar |
