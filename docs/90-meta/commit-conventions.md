# Convenciones de commits — Conventional Commits

> Formato obligatorio para todos los mensajes de commit del proyecto.
> Validado automáticamente por el hook `commit-msg` (commitlint).

---

## Por qué importa

Un mensaje de commit es metadata permanente. Lo lee:
- Quien revise el código en 6 meses (probablemente un Claude futuro)
- Herramientas de changelog automático
- CI para detectar tipos de cambio
- Tú mismo cuando tengas que revertir algo

Mensajes como `"cambios"`, `"fix"`, `"asdf"` destruyen información. Conventional Commits impone una estructura mínima que conserva contexto.

---

## Formato

```
<type>(<scope>): <subject>

<body opcional>

<footer opcional>
```

### Componentes

| Componente | Obligatorio | Descripción |
|------------|-------------|-------------|
| `type` | ✅ Sí | Categoría del cambio (ver tabla abajo) |
| `scope` | ⚠️ Recomendado | Módulo o área tocada (ver lista) |
| `subject` | ✅ Sí | Resumen 5–100 caracteres, en imperativo (`añade`, no `añadido`) |
| `body` | Opcional | Explicación del **por qué** del cambio. Separado por línea en blanco |
| `footer` | Opcional | Referencias (`Closes #42`, `BREAKING CHANGE: ...`, `Co-Authored-By:`) |

---

## Tipos permitidos

| Type | Cuándo usar | Ejemplo |
|------|-------------|---------|
| `feat` | Nueva funcionalidad visible para el usuario | `feat(auth): añade login con Google` |
| `fix` | Corrección de bug | `fix(billing): IVA recalculado al editar items` |
| `refactor` | Cambio interno sin cambiar comportamiento | `refactor(regla-15): divide billing.service` |
| `chore` | Tareas de mantenimiento (deps, format, configs) | `chore(deps): actualiza nestjs a 11.1.20` |
| `docs` | Solo documentación | `docs(adr): añade ADR-014 sobre provisioning` |
| `ci` | Cambios en CI/CD | `ci: añade gate de typecheck en PRs` |
| `build` | Cambios en build system o tooling | `build(F0.2): añade Husky` |
| `test` | Añadir o modificar tests | `test(billing): cubre prorrateo mensual↔anual` |
| `perf` | Mejoras de rendimiento | `perf(dashboard): cachea queries de stats 30s` |
| `style` | Cambios de formato sin afectar lógica | `style: aplica prettier a tasks/` |
| `revert` | Revertir un commit anterior | `revert: deshace cambio de PBAC en clientes` |

---

## Scopes recomendados

Si tu cambio toca un módulo concreto, indica el scope. Es opcional pero ayuda mucho. Lista actual:

**Backend modules:**
`auth`, `clients`, `products`, `billing`, `support`, `tasks`, `dashboard`, `partner`, `audit`, `settings`, `email`, `notifications`, `casl`, `prisma`

**Frontend:**
`ds` (Design System), `ui`, `layout`

**Cross-cutting:**
`regla-15`, `sprint-0` … `sprint-8`

**Tooling y proceso:**
`ci`, `deps`, `format`, `adr`, `F0`, `F0.1` … `F0.7`

> Si necesitas un scope nuevo, añádelo a `commitlint.config.cjs` en el array `scope-enum`. Mientras no esté, commitlint emite warning (no bloquea).

---

## Ejemplos buenos

```
feat(billing): permite cambio mensual↔anual con prorrateo

El cliente ve un preview del crédito antes de confirmar. Implementa la
decisión §14 (prorrateo lineal por días no consumidos).

Closes #87
```

```
fix(support): chat resuelto por escalación no se reabre

Cuando un cliente escribía en un chat ya escalado a ticket, el sistema
reabría el chat creando duplicidad. Ahora redirige al ticket.

Refs EC-6
```

```
refactor(regla-15): divide billing.service en sub-servicios

billing.service.ts (1054 líneas) → 90 líneas (fachada) + 4 sub-servicios.
Cumple Regla 15 de ARCHITECTURE.md.
```

```
ci: añade gate de typecheck bloqueante para PRs

Backend y frontend en paralelo. ~3 min total. Lint queda informativo
hasta saneamiento F0.6.
```

```
docs(adr): añade ADR-014 estrategia de provisioning Docker

Explica decisión de plugins vs core, interface PaymentProvider y
mecánica de manifest.json.
```

---

## Ejemplos malos (commitlint los bloquea)

```
❌ "cambios"                   → falta type
❌ "Fix: bug"                  → "Fix" no es tipo válido (debe ser minúsculas)
❌ "feat: x"                   → subject demasiado corto (<5 chars)
❌ "feat(unknown): xyz"        → scope desconocido (warning, no bloquea)
❌ "WIP"                       → falta type, no descriptivo
❌ "implementacion completada" → falta type
```

---

## Comportamiento del hook

Cuando ejecutas `git commit`:

1. **`pre-commit` hook** se dispara primero (lint-staged)
2. **`commit-msg` hook** valida el mensaje contra `commitlint.config.cjs`
3. Si pasa → commit creado
4. Si falla → commit abortado, mensaje del error explica qué arreglar

Ejemplo de bloqueo:

```
$ git commit -m "cambios menores"
⧗   input: cambios menores
✖   subject may not be empty [subject-empty]
✖   type may not be empty [type-empty]

✖   found 2 problems, 0 warnings
husky - commit-msg script failed (code 1)
```

El commit no se crea. Cambias el mensaje y vuelves a intentar.

---

## Bypass de emergencia

```bash
git commit --no-verify -m "cualquier cosa"
```

Salta tanto `pre-commit` como `commit-msg`. **Solo casos excepcionales**.

---

## Cuando hay co-autor (caso típico con Claude)

```
feat(auth): añade refresh token

Implementa rotación con TTL configurable.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

El footer `Co-Authored-By:` es estándar de GitHub. commitlint lo acepta.

---

## Cómo aprender más

- Spec oficial: https://www.conventionalcommits.org/
- commitlint docs: https://commitlint.js.org/
- Tipos extendidos: `commitlint.config.cjs` en el root del repo
