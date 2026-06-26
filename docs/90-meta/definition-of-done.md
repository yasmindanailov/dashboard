# Definition of Done — Aelium Dashboard

> Checklist obligatoria para cerrar un sprint, una feature o un PR.
> Si algún punto queda sin marcar, el trabajo **no está terminado**.

---

## Por qué existe este documento

Sin un DoD claro, "terminado" significa lo que cada uno quiera. Una feature
puede estar "terminada" para Claude (código compila) pero **no** para ti
(no se ha probado en navegador, no hay doc, no hay test). Este documento
fija un mínimo no-negociable que aplica a todo trabajo.

> Aplica a: Claude (que ejecuta) + Yasmin (que valida).
> Quien cierra un sprint declara explícitamente que cada punto está cumplido.

---

## DoD por SPRINT

Un sprint del ROADMAP NO se da por completado hasta que **todos** los
puntos de las 4 categorías están ✅.

### 1. Código (responsabilidad: Claude)

- [ ] Todos los pasos del sprint marcados como ✅ en `ROADMAP.md` (o nueva ubicación post-refactor)
- [ ] Build verde: `pnpm build` pasa en backend y frontend
- [ ] Typecheck verde: `pnpm typecheck` pasa en backend y frontend
- [ ] Lint sin **nuevos** errores introducidos durante el sprint
- [ ] Tests pasan: `pnpm test` en backend (Jest) y frontend (Jest + RTL, harness GL-26)
- [ ] CI verde en GitHub Actions tras el último push del sprint

### 2. Documentación (responsabilidad: Claude, validación: Yasmin)

- [ ] Si tocó un módulo: `docs/features/<modulo>/admin.md` actualizado
- [ ] Si hubo decisión de arquitectura: ADR nuevo creado (post refactor F1: `docs/10-decisions/adr-NNN-*.md`)
- [ ] Si introdujo eventos nuevos: añadidos al catálogo `docs/20-modules/_events.md` (cuando exista)
- [ ] Si afectó al contrato del módulo: `docs/20-modules/<mod>/contract.md` actualizado
- [ ] Si introdujo settings nuevos: añadidos a `docs/50-operations/settings-reference.md`
- [ ] Si introdujo emails: añadidos a `docs/50-operations/email-templates.md`

> Las rutas con prefijo numérico son las del refactor de doc propuesto.
> Hasta que se ejecute, usar las rutas actuales (`docs/features/`, `docs/DECISIONS.md`).

### 3. Proceso (responsabilidad: Claude)

- [ ] Cada commit del sprint cumple Conventional Commits (ver `commit-conventions.md`)
- [ ] El último commit del sprint tiene mensaje claro tipo `feat(sprint-N): cierra sprint con X, Y, Z`
- [ ] Edge cases descubiertos durante el sprint anotados en ROADMAP.md (asignados a sprints futuros si no se resuelven)
- [ ] No quedan TODOs sin contexto en el código (`// TODO: implementar` → ❌). Cada TODO debe enlazar a un edge case con ID.

### 4. Smoke testing manual (responsabilidad: Yasmin)

- [ ] Flujos críticos verificados en navegador:
  - Login + 2FA (rol cualquiera)
  - Crear cliente / editar perfil
  - Crear factura / generar PDF
  - Abrir chat / escalar a ticket
- [ ] **Flujo nuevo del sprint** verificado punta a punta (varios casos: éxito, error, edge case)
- [ ] No hay errores en la consola del navegador durante uso normal
- [ ] Las páginas tocadas siguen el Design System (ver `docs/DESIGN_SYSTEM.md`)

> Los flujos críticos se prueban **siempre**, aunque el sprint no los toque
> directamente. Una refactorización en `clients` puede romper `billing` por
> dependencias no obvias. Probar el conjunto cuesta poco y atrapa mucho.

---

## DoD por FEATURE individual (sub-sprint)

Cuando dentro de un sprint cierras una feature concreta:

- [ ] La feature funciona en el navegador (Yasmin lo verifica)
- [ ] Build + typecheck + lint pasan localmente
- [ ] Hooks pre-commit y pre-push pasaron limpios
- [ ] Commit con mensaje Conventional Commits
- [ ] Si la feature introduce un nuevo flujo crítico → se añade a la lista de smoke testing del DoD por sprint

---

## DoD por PR (cuando haya colaboradores o pre-merge a producción)

> Por ahora trabajas sola con Claude pusheando directo a `master`.
> Esto aplicará cuando: (a) haya equipo, (b) haya producción, (c) se active branch protection.

- [ ] CI verde (todos los jobs)
- [ ] Sin warnings nuevos de lint (cuando F0.6 esté completado)
- [ ] Descripción del PR explica el "por qué", no solo el "qué"
- [ ] Si toca un contrato de módulo: actualizado en doc
- [ ] Aprobación explícita de Yasmin antes de merge

---

## DoD por ADR (Architecture Decision Record)

Un ADR no está terminado hasta que responde a las **5 preguntas obligatorias**:

1. **Contexto** — ¿Qué problema o restricción nos llevó aquí?
2. **Opciones consideradas** — ¿Qué alternativas se evaluaron y por qué se descartaron?
3. **Decisión** — ¿Qué se eligió (con detalle suficiente para implementarla)?
4. **Consecuencias** — ¿Qué gana, qué pierde, qué puertas cierra?
5. **Cuándo revisar** — ¿Qué condición invalidaría esta decisión en el futuro?

Si falta cualquiera de las 5 → el ADR está incompleto.

---

## Casos en que un punto NO aplica

A veces algún check no es relevante. Reglas:

- **Marcar explícitamente como N/A** con justificación 1 línea. Nunca dejar en blanco.
- Ejemplo: `[N/A] Smoke test billing — sprint solo tocó docs, no código`
- Si más de 3 puntos son N/A en un sprint, revisar: probablemente el sprint era trivial y no necesitaba DoD formal, o se está saltando trabajo.

---

## Cómo se usa en la práctica

### Al cerrar un sprint, Claude hace:

1. Recorre el DoD punto por punto y marca ✅ / ❌ / N/A
2. Si algún ❌ no es viable cerrar en este sprint → moverlo a backlog/sprint siguiente con justificación
3. Comenta en el commit final del sprint: "Cierra Sprint N — DoD verificado salvo X (movido a Sprint M por razón Y)"
4. Yasmin revisa los puntos de "Smoke testing manual" y aprueba o reporta problemas

### Si alguien (Claude o Yasmin) detecta que un sprint pasado no cumplió el DoD:

1. Crear entrada en ROADMAP "Hardening Sprint X" con los puntos pendientes
2. Resolver antes de avanzar a sprints que dependen de X

---

## Relación con otros documentos

- `docs/90-meta/git-hooks.md` — automatiza partes del DoD a nivel commit
- `docs/90-meta/ci-setup.md` — automatiza partes del DoD a nivel push/PR
- `docs/90-meta/commit-conventions.md` — define el formato de commit obligatorio
- `docs/90-meta/sprint-template.md` — plantilla con DoD embebido al iniciar sprint
- `docs/DESIGN_SYSTEM.md` — reglas que cumplir en el smoke test de UI

---

## Evolución de este documento

Este DoD es una **versión inicial mínima**. A medida que el proyecto madure
debería añadirse:

- [ ] Tests automatizados de los flujos críticos (F0.4) → reemplaza parte del smoke test manual
- [ ] Cobertura mínima de tests por módulo (cuando haya métrica)
- [ ] Performance budget (tiempos de respuesta máximos por endpoint)
- [ ] Accessibility checklist (WCAG AA mínimo)
- [ ] Security scan automático (SAST en CI)

Cada añadido se discute primero, se documenta aquí, y luego se enforza.
