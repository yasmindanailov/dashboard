# Plantilla de sprint — puntero

> **La plantilla canónica vive en [`docs/90-meta/sprint-template.md`](../90-meta/sprint-template.md).**
>
> Este archivo existe solo como **puntero** desde la carpeta `60-roadmap/` para mantener la convención de "una plantilla por carpeta" sin duplicar contenido (la plantilla es transversal: aplica al inicio de cualquier sprint, no es exclusiva del roadmap).

---

## Cómo usarla

1. **Copia el contenido** de [`docs/90-meta/sprint-template.md`](../90-meta/sprint-template.md) a una sección nueva en [`current.md`](./current.md) (si encaja como continuación de los sprints en curso).
2. **Personaliza** las 10 secciones (objetivo, depende de, produce, modifica, pasos atómicos, edge cases, DoD, riesgos, decisiones a registrar) **antes de empezar a codificar**.
3. **Si introduce decisión arquitectónica** → ADR antes de codificar.
4. **Si introduce módulo nuevo** → `contract.md` antes de codificar.

---

## Cuándo NO copiar la plantilla entera

- Si el "sprint" es solo cerrar 2-3 deudas pequeñas (ej: cerrar Sprint 8 mínimo) → no inventar sprint nuevo, **continuar el existente** y marcar pasos en `current.md`.
- Si es un **bugfix** o **mejora puntual** → no necesita sprint propio. Sigue [DoD](../90-meta/definition-of-done.md) y commit con Conventional Commits.

---

## Documentos relacionados

- [`docs/90-meta/sprint-template.md`](../90-meta/sprint-template.md) — Plantilla canónica (10 secciones).
- [`docs/90-meta/definition-of-done.md`](../90-meta/definition-of-done.md) — Cuándo se cierra un sprint.
- [`README.md`](./README.md) — Cómo está organizado este roadmap.
- [`current.md`](./current.md) — Sprints en curso (donde se añade el sprint nuevo tras copiar plantilla).
