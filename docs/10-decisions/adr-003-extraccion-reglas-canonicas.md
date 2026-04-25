# ADR-003 — Extracción de reglas a documento canónico

> **Status:** Active
> **Date:** 2026-04-26 (decisión y ejecución durante F1 del refactor de doc)
> **Original:** DECISIONS.md §3 (reglas listadas allí, ahora puntero canónico)
> **Domain:** foundation, meta-doc

---

## Contexto

El proyecto fue acumulando reglas técnicas y de UI dispersas en múltiples documentos:

- 16 reglas técnicas (R1–R16) en `ARCHITECTURE.md` con ejemplos de código.
- 11 reglas de diseño (D1–D11) en `DESIGN_SYSTEM.md`.
- Resúmenes parciales en `DECISIONS.md §3`.
- Referencias cruzadas a "Regla 15", "Regla D1" etc. en commits, ROADMAP, contracts y código.

Esta dispersión causaba:

1. **Drift:** la versión de una regla en `ARCHITECTURE.md` podía divergir del resumen en `DECISIONS.md`.
2. **Imposibilidad de citar con confianza:** ¿"Regla 8" está en arquitectura o en decisiones?
3. **Coste de mantenimiento:** modificar una regla obligaba a editar 2-3 archivos.
4. **Ambigüedad para Claude:** al iniciar una sesión, ¿qué archivo lee primero para conocer las reglas vigentes?

---

## Opciones consideradas

1. **Dejar las reglas donde están** y aceptar la duplicación.
   - Pros: cero refactor.
   - Contras: drift garantizado a medida que el proyecto evoluciona.

2. **Embeber las reglas en cada `contract.md` de módulo** (las que aplican a ese módulo).
   - Pros: contexto local.
   - Contras: amplifica la duplicación. Las reglas son **transversales** — embedirlas N veces multiplica el problema.

3. **(Elegida)** **Documento único canónico** `docs/00-foundations/rules.md` que centraliza R1–R16 + D1–D11. Otros documentos lo referencian, no lo copian.
   - Pros: una sola fuente de verdad. Drift imposible. Claude lee un archivo.
   - Contras: requiere migración inicial. Las referencias antiguas (`ARCHITECTURE.md Regla 15`) siguen apuntando al archivo legacy hasta que se actualicen.

---

## Decisión

**Las reglas R1–R16 (técnicas) y D1–D11 (UI) son canónicas en `docs/00-foundations/rules.md`.**

Convenciones aplicadas:

- **IDs preservados:** R1, R2…, D1, D2… ya estaban en commits y código históricos. No se renumeran.
- **Estructura del archivo:** índice rápido (tabla con una línea por regla) + sección detallada por regla con ejemplos correctos / incorrectos.
- **Cross-references desde otros docs:** `ARCHITECTURE.md` y `DESIGN_SYSTEM.md` mantienen las reglas en su contenido legacy, pero con un callout en su cabecera apuntando al canónico.
- **Modificación de reglas:** debe pasar por un ADR nuevo que justifique el cambio. Sin ADR no se modifica una regla.
- **Citar regla en commits:** patrón `feat(billing): X — cumple R8`.

`docs/00-foundations/glossary.md` se crea en la misma carpeta para términos canónicos del proyecto (chat, ticket, factura, comisión...) bajo el mismo principio.

---

## Consecuencias

- ✅ **Ganamos:**
  - Una sola fuente para todas las reglas. Drift imposible.
  - Claude lee un solo archivo para conocer las reglas vigentes.
  - Citar regla con confianza: "R8" significa lo que dice `rules.md`.
  - Glosario co-localizado evita ambigüedad terminológica.
- ⚠️ **Aceptamos:**
  - Migración gradual: `ARCHITECTURE.md` y `DESIGN_SYSTEM.md` aún contienen el texto original de las reglas (con callout). La migración total es tarea futura no bloqueante.
  - Hay que documentar este patrón al equipo / a Claude en cada sesión nueva (de ahí el `90-meta/development-playbook.md`).
- 🚪 **Cierra:**
  - No se aceptan más reglas inline en `DECISIONS.md`. Cualquier regla nueva va directamente a `rules.md` con su ID secuencial.

---

## Cuándo revisar

- Cuando el archivo `rules.md` supere ~60 reglas (hoy hay 27). Llegado ese punto, considerar partirlo en `architecture-rules.md` y `ui-rules.md` separados con un índice maestro.

---

## Referencias

- **Módulos afectados:** todos (las reglas son transversales).
- **Documento canónico:** [`docs/00-foundations/rules.md`](../00-foundations/rules.md).
- **Documento legacy con callout:** [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md), [`docs/DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md).
- **ADRs relacionados:** todos los siguientes ADRs referencian reglas concretas (R1, R8, R15, etc.) y ya apuntan al canónico.
- **Glosario:** [`docs/00-foundations/glossary.md`](../00-foundations/glossary.md).
