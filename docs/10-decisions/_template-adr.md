# ADR-NNN — &lt;Título descriptivo en español&gt;

> **Status:** Active &nbsp;|&nbsp; Superseded by ADR-MMM &nbsp;|&nbsp; Deprecated &nbsp;|&nbsp; Withdrawn
> **Date:** YYYY-MM-DD (fecha de la decisión original, o fecha de migración si se desconoce)
> **Original:** DECISIONS.md §N (si proviene de migración) — opcional
> **Domain:** foundation &nbsp;|&nbsp; auth &nbsp;|&nbsp; billing &nbsp;|&nbsp; support &nbsp;|&nbsp; products &nbsp;|&nbsp; tasks &nbsp;|&nbsp; partner &nbsp;|&nbsp; infrastructure &nbsp;|&nbsp; ui &nbsp;|&nbsp; cross-cutting

---

## Contexto

¿Qué problema o restricción nos llevó a tomar esta decisión?

Suficiente background para que alguien que entra fresco entienda el porqué. Si la decisión se tomó bajo presión de tiempo o por una limitación específica, mencionarlo. La honestidad histórica importa.

> **Una pregunta útil:** ¿qué pasaría si NO tomáramos esta decisión? Si la respuesta es "nada", la decisión no necesita ADR. Los ADRs son para decisiones que importan.

---

## Opciones consideradas

> Si la decisión original solo registró la elegida (sin alternativas), reconstruirlas honestamente: ¿qué otras opciones eran razonables en ese momento?

1. **Opción A — &lt;nombre&gt;**
   - Pros: …
   - Contras: …
2. **Opción B — &lt;nombre&gt;**
   - Pros: …
   - Contras: …
3. **(opción elegida — Opción C — &lt;nombre&gt;)**
   - Pros: …
   - Contras: …

---

## Decisión

Qué se eligió, con detalle suficiente para implementarlo.

Si involucra naming, schema, contratos: incluir aquí el detalle exacto. Un futuro lector debe poder reconstruir la implementación leyendo solo esta sección.

```typescript
// Ejemplo de código si ayuda a clarificar
```

---

## Consecuencias

- ✅ **Ganamos:**
  - …
  - …
- ⚠️ **Perdemos / aceptamos:**
  - …
  - …
- 🚪 **Puertas que cierra:**
  - …

---

## Cuándo revisar

¿Qué condiciones invalidarían esta decisión y obligarían a un ADR nuevo?

Ejemplos:
- "Cuando el volumen supere X, la solución actual no escala — revisar."
- "Cuando se introduzca el módulo Y, esta decisión podría aplicar a más casos — extender."
- "Si Hacienda cambia el RD 1619/2012, revisar invariantes de numeración."

> **No es predicción del futuro** — es definir el trigger explícito que dispararía la revisión.

---

## Referencias

- **Módulos afectados:** `auth`, `billing`, … (links a `docs/20-modules/<modulo>/contract.md` cuando aplique)
- **Reglas relacionadas:** R5, R8, D11 (links a `docs/00-foundations/rules.md#r5--`)
- **ADRs relacionados:** ADR-002 (predecesor), ADR-014 (motiva esta), ADR-031 (consecuencia)
- **Glosario:** términos del [`glossary.md`](../00-foundations/glossary.md) que aparecen aquí
- **Discusión externa:** issue de GitHub, doc externo, etc. (si existe)

---

## Notas de revisión (opcional)

Si tras un tiempo se ven detalles relevantes que no estaban claros al tomar la decisión, añadir aquí. **No editar las secciones anteriores** — añadir notas con fecha:

> **2026-XX-XX:** observación adicional…
