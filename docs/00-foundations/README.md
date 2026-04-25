# Foundations — Aelium Dashboard

> **Documentos base del proyecto.** Lo que casi nunca cambia, lo que todo lo demás referencia.

---

## Documentos de esta carpeta

| Archivo | Contenido | Cuándo leer |
|---------|-----------|-------------|
| [`rules.md`](./rules.md) | Reglas R1–R16 (técnicas) + D1–D11 (UI). Inviolables. | **Antes de escribir cualquier código** |
| [`glossary.md`](./glossary.md) | Términos canónicos del proyecto (chat, ticket, factura, comisión, etc.). | **Antes de nombrar variables, tablas, eventos** |

---

## Por qué existe esta carpeta

Antes del refactor de documentación (F1), las reglas vivían dispersas:
- 16 reglas técnicas en `ARCHITECTURE.md`
- 11 reglas de UI en `DESIGN_SYSTEM.md`
- Términos canónicos no existían como documento — se inferían del código

Esto causaba:
- Drift terminológico (`chat` vs `conversation` usados con significados distintos)
- Reglas duplicadas o contradictorias entre docs
- Imposibilidad de citar una regla con confianza ("la regla de los 200ms está... ¿en arquitectura o decisiones?")

**Con `00-foundations/` resuelto:**
- Una sola fuente para todas las reglas
- Numeración estable (R1–R16, D1–D11) que ya está en commits del histórico
- Glosario que se cita desde ADRs, contracts y feature docs

---

## Cómo se usan

### Citar una regla
En commit, PR, comentario o doc:
```
feat(billing): valida descuento — cumple R5 (no lógica en frontend)
```

### Citar un término del glosario
En código y doc, usar exactamente el término canónico:
```ts
// ❌ const todos = ...    (term ambiguo: ¿task? ¿to-do list?)
// ✅ const tasks = ...    (Task = entidad canónica del módulo Tasks)
```

### Saltarse una regla
Si una excepción es legítima:
1. Documentarla en código con comentario explicativo
2. Listarla en la sección "Excepciones" del módulo afectado (`docs/20-modules/<mod>/contract.md` cuando exista)
3. **Nunca borrar la regla de `rules.md` por una excepción.** Las excepciones son locales; la regla sigue siendo el caso general.

### Modificar una regla
Pasa por un **ADR** en `docs/10-decisions/` que justifique:
- Qué regla se cambia
- Por qué la regla anterior ya no aplica
- Qué impacto tiene en código existente
- Si requiere migración

Sin ADR no se modifica una regla. La numeración no se reutiliza.

---

## Próximas adiciones a esta carpeta

A medida que el refactor de doc avance, vivirán aquí:

- [ ] `architecture-overview.md` — Stack + diagrama global de módulos (extracto de ARCHITECTURE.md)
- [ ] `conventions.md` — Naming, error codes, log format, nomenclatura de eventos

Cada uno con su propio archivo para mantener la regla "un documento = una pregunta".

---

## Documentos relacionados (fuera de esta carpeta)

- [`docs/aelium-documento-de-marca.md`](../aelium-documento-de-marca.md) — Voz, identidad visual, BrandScripts. Referenciado por **D11**.
- [`docs/DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md) — Componentes y layouts (a migrar a `docs/40-design-system/` en fase futura). Reglas extraídas a `rules.md`, contenido restante sigue válido.
- [`docs/UI_SPEC.md`](../UI_SPEC.md) — Anatomía de páginas. Referenciado por **D10**.
- [`docs/90-meta/`](../90-meta/) — Procesos: CI, hooks, commit conventions, DoD, sentry, e2e tests.
