# Reading order — qué leer según tipo de tarea

> **Para Claude (o cualquier IA / dev nuevo):** orden recomendado de lectura al arrancar una sesión, optimizado por tipo de tarea.
>
> **Objetivo:** evitar que el agente lea 50 archivos "por si acaso" y consuma 80% del contexto antes de hacer nada útil. Cada tarea tiene un mínimo viable de lectura. Solo lo extiendes si la tarea lo justifica.

---

## Regla cero: empezar por el índice maestro

Independientemente de la tarea, **el primer archivo a leer es siempre el mismo:**

📖 [`docs/README.md`](../README.md) — **índice maestro / mapa de toda la doc** (qué es vivo / referencia / futuro / archivo + orden de arranque).

Arranque canónico desde ahí: índice maestro → [`audit-2026-06-21.md`](./audit-2026-06-21.md) (estado real **medido** hoy) → [`current.md`](../60-roadmap/current.md) (sprint activo) → [`development-playbook.md`](./development-playbook.md) (proceso — si solo lees uno de proceso, este). Sin esto, cualquier tarea opera a ciegas.

Después, según la naturaleza de la tarea:

---

## Tarea 1 — Implementar feature en módulo existente

**Ejemplo:** "añade endpoint POST `/api/v1/billing/invoices/:id/send-email`".

**Mínimo viable:**

1. [`docs/00-foundations/rules.md`](../00-foundations/rules.md) — reglas R1–R16 + D1–D11 (refresca antes de tocar código).
2. [`docs/00-foundations/glossary.md`](../00-foundations/glossary.md) — términos canónicos del dominio (los que ese módulo usa).
3. **`docs/20-modules/<modulo>/contract.md`** — el contrato del módulo afectado (API, eventos, invariantes, deuda).
4. **`docs/20-modules/<modulo>/admin.md`** (si existe) — flujos operativos.
5. **Schema relevante:** `docs/30-data/<modulo>.md` (los modelos del dominio).

**Si toca eventos cross-módulo:**

- [`docs/20-modules/_events.md`](../20-modules/_events.md) — catálogo único.
- [`docs/20-modules/_matrix.md`](../20-modules/_matrix.md) — quién depende de quién.

**Si introduce decisión nueva (ej. nuevo enum, nuevo flow):**

- Crear ADR en [`docs/10-decisions/`](../10-decisions/) **antes** de codificar.

**Lo que NO necesitas leer:** `DECISIONS.md` legacy (ya migrado a ADRs), `DATABASE_SCHEMA.md` legacy (ya partido por dominio), ROADMAP completo (basta `current.md`).

---

## Tarea 2 — Bug fix puntual

**Ejemplo:** "el botón de Verificar 2FA está desalineado en mobile".

**Mínimo viable:**

1. **Solo el código afectado.** Reproducir, identificar línea, arreglar.
2. [`rules.md`](../00-foundations/rules.md) si tocas algo que pueda violar una regla (R5 lógica frontend, D1 emojis, R15 tamaño archivo).
3. [`docs/DESIGN_SYSTEM.md`](../40-reference/DESIGN_SYSTEM.md) si toca UI.

**Lo que NO necesitas leer:** ADRs, contracts, matrix. Un fix puntual no debería tocar arquitectura.

**Excepción:** si reproduciendo descubres que el bug viene de un design flaw (no un fallo trivial), entonces sí: leer `contract.md` del módulo + abrir ADR si la solución cambia decisión.

---

## Tarea 3 — Cerrar sprint en curso

**Ejemplo:** "cierra Sprint 8 según los items P0".

**Mínimo viable:**

1. [`docs/60-roadmap/current.md`](../60-roadmap/current.md) — estado real del sprint, items pendientes verificados.
2. **`docs/20-modules/<modulo>/contract.md`** del módulo afectado (Sprint 8 → tasks).
3. [`docs/90-meta/definition-of-done.md`](./definition-of-done.md) — checklist de cierre.
4. [`docs/60-roadmap/_sprint-template.md`](../60-roadmap/_sprint-template.md) — formato del cierre.
5. Si introduces eventos nuevos: [`_events.md`](../20-modules/_events.md).

**Tras cerrar:** mover sección a `docs/60-roadmap/completed/sprint-N-titulo.md` + actualizar `current.md`.

---

## Tarea 4 — Implementar módulo nuevo

**Ejemplo:** "implementa el módulo `partner` siguiendo el plan".

**Mínimo viable:**

1. [`rules.md`](../00-foundations/rules.md) completo (R15 será crítico — empezar con sub-services).
2. [`glossary.md`](../00-foundations/glossary.md) completo (términos del dominio nuevo).
3. **`docs/20-modules/<modulo>/contract.md`** — leer **completo**, varias veces.
4. **`docs/20-modules/<modulo>/admin.md`** (si existe).
5. [`_template-contract.md`](../20-modules/_template-contract.md) — para validar que el contrato existente está bien.
6. **ADRs específicos del módulo:** consultar el índice de [`docs/10-decisions/README.md`](../10-decisions/README.md) y leer los del bloque correspondiente.
7. **Schema relevante:** `docs/30-data/<modulo>.md` + cualquier tabla foránea que el contrato declare leer.
8. [`_matrix.md`](../20-modules/_matrix.md) — para entender cómo se conecta con otros módulos.
9. **Crear plantilla de sprint** copiando [`_sprint-template.md`](../60-roadmap/_sprint-template.md) → `current.md`.

**Si surge decisión arquitectónica nueva durante implementación:** ADR antes de codificar.

---

## Tarea 5 — Sanear deuda técnica

**Ejemplo:** "F0.6 — sanear los 344 errores `no-unsafe-*`".

**Mínimo viable:**

1. [`current.md`](../60-roadmap/current.md) + [`backlog.md`](../60-roadmap/backlog.md) — confirmar prioridad y alcance del item P0/P1.
2. [`audit-2026-06-21.md`](./audit-2026-06-21.md) — verdad verificada del estado de la deuda.
3. **Solo el código afectado.** El saneamiento es trabajo mecánico.
4. [`rules.md`](../00-foundations/rules.md) — para no introducir nuevas violaciones mientras saneas.
5. [`ci-setup.md`](./ci-setup.md) — saber cómo activar lint bloqueante en CI cuando termines.

**Lo que NO necesitas:** ADRs (saneamiento no introduce decisiones nuevas), contracts (no cambias contratos), matrix.

---

## Tarea 6 — Refactorizar archivo grande (R15)

**Ejemplo:** "este service tiene 450 líneas, divídelo".

**Mínimo viable:**

1. [`rules.md` §R15](../00-foundations/rules.md#r15--límites-de-tamaño-y-responsabilidad-única-por-archivo) — límites y patrón.
2. **`docs/20-modules/<modulo>/contract.md`** — para confirmar que la API pública del module no cambia (solo se reorganiza internamente).
3. **El código afectado.**

**Lo que NO necesitas:** ADRs (R15 ya está en regla, no decides nada), tests E2E (la refactorización R15 no debe cambiar comportamiento — los tests E2E existentes deben seguir pasando).

---

## Tarea 7 — Revisar PR / cambios propuestos

**Ejemplo:** "revisa estos cambios contra `rules.md` y `_matrix.md`".

**Mínimo viable:**

1. [`rules.md`](../00-foundations/rules.md) — checklist de violaciones potenciales.
2. **`docs/20-modules/<modulo>/contract.md`** del módulo afectado — si los cambios afectan API, eventos o invariantes.
3. [`_events.md`](../20-modules/_events.md) — si hay eventos nuevos / modificados.
4. [`_matrix.md`](../20-modules/_matrix.md) — si los cambios introducen acoplamientos cross-módulo.
5. [`commit-conventions.md`](./commit-conventions.md) — verificar formato de commits.
6. [`definition-of-done.md`](./definition-of-done.md) — ¿el PR cumple DoD?

**Output esperado:** lista de issues con severidad (R3 violación = bloqueante, copy ligeramente off = nit).

---

## Tarea 8 — Auditar coherencia doc ↔ código

**Ejemplo:** "compara qué dice `docs/30-data/support.md` con lo que hay en Prisma".

**Mínimo viable:**

1. [`audit-2026-06-21.md`](./audit-2026-06-21.md) — leer la auditoría más reciente como referencia (si la haces nueva, este es el formato).
2. **Schema canónico:** `backend/prisma/schema.prisma` — la verdad sobre las tablas.
3. **Doc objeto de auditoría:** lo que estés verificando.
4. **Código de referencia** según el eje (controllers, services, listeners).

**Output esperado:** tabla con drift, severidad, acción propuesta.

---

## Tarea 9 — Configurar CI / hooks / herramientas

**Ejemplo:** "añade gate de CI que valide que cada `@OnEvent` tiene entrada en `_events.md`".

**Mínimo viable:**

1. [`ci-setup.md`](./ci-setup.md) — estructura actual del CI.
2. [`git-hooks.md`](./git-hooks.md) — Husky + lint-staged + commitlint.
3. [`e2e-tests.md`](./e2e-tests.md) — Playwright config y dependencias.
4. **`.github/workflows/ci.yml`** — código del workflow.

**Lo que NO necesitas:** ADRs, contracts (esto es tooling, no negocio).

---

## Tarea 10 — Onboarding tras larga ausencia

**Ejemplo:** *"vuelvo después de 2 meses, qué ha cambiado y qué hago primero"*.

**Orden de lectura:**

1. [`development-playbook.md`](./development-playbook.md) §1 (estado actual) y §4 (refactor) — primero.
2. [`current.md`](../60-roadmap/current.md) — qué sprints están abiertos.
3. [`backlog.md`](../60-roadmap/backlog.md) — qué priorizó el último ciclo.
4. **`git log --oneline -20`** — últimos 20 commits para ver actividad reciente.
5. Solo después: profundizar en el módulo donde vayas a trabajar.

---

## Antipatrones (NO hacer)

❌ **Leer todo `DECISIONS.md` legacy** "por si acaso". Está marcado MIGRADO. Ir directamente al ADR específico.
❌ **Leer todo `ROADMAP.md` legacy.** Sustituido por `60-roadmap/`. Solo histórico.
❌ **Leer todos los contracts** antes de tocar uno solo.
❌ **Leer toda la auditoría** para un bug de UI.
❌ **Releer `rules.md`** cada vez que tocas un archivo. Una vez por sesión basta.

---

## Resumen — el "atajo de Claude"

Si la sesión es corta (<30 min) y la tarea está clara, leer solo:

1. **playbook** (siempre).
2. **`contract.md` del módulo afectado** (si es feature/bug en módulo).
3. **`rules.md`** (si introduces lógica nueva).

Para todo lo demás, este documento te dice qué buscar **bajo demanda**, no upfront.

---

## Mantenimiento de este documento

- **Cuando se añada un tipo de tarea recurrente nuevo:** ampliar la lista.
- **Cuando un documento clave cambie de ubicación:** actualizar referencias.
- **Cuando se introduzca un patrón mejor:** revisar y actualizar.

Es deuda continua. Si lo estás leyendo y notas que un orden está mal o que te ahorró tiempo, edítalo y commit.
