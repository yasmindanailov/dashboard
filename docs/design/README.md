# docs/design — Programa de evolución UI/UX

> **Aviso para sesiones de desarrollo:** esta carpeta contiene trabajo iterativo
> de diseño (fases, mockups, drafts, decisiones en progreso). **NO leer en
> tareas de desarrollo regulares** (features, bugs, refactors). Es contenido
> extenso y no relevante para el trabajo de código habitual.
>
> Solo cargar contexto de aquí cuando la tarea sea explícitamente:
> *"modo diseño, fase N"* o *"implementación de fase N de diseño"*.

---

## Qué es esto

Programa iterativo para elevar el UI/UX del dashboard a un estándar profesional
y diferenciador, organizado por fases secuenciales con outputs versionables.

**No reemplaza** a `docs/DESIGN_SYSTEM.md` ni `docs/UI_SPEC.md`. Esos siguen
siendo la fuente de verdad del estado actual. Esta carpeta es el espacio donde
se diseña la siguiente capa antes de promocionarla a los canónicos.

## Distinción importante

| Documento | Rol |
|-----------|-----|
| `docs/DESIGN_SYSTEM.md` | Sistema de diseño canónico — estado actual, post-Sprint 7.5 |
| `docs/UI_SPEC.md` | Anatomía canónica de páginas — estado actual |
| `docs/design/` (esta carpeta) | Programa iterativo de evolución — drafts, mockups, decisiones en curso |

Cuando una fase completa entrega cambios al sistema, se promocionan a los
canónicos en un paso separado (modo implementación) y se documenta en
`implementation-log/`.

## Índice

| Documento | Propósito |
|-----------|-----------|
| `SESSION_RULES.md` | Protocolo de sesión (inicio/fin), modo diseño vs implementación |
| `PLAN.md` | Estado actual, fases, decisiones acumuladas, próxima acción |
| `BRIEF.md` | Brief de producto, audiencia, restricciones técnicas |
| `DECISIONS.md` | Log de decisiones cerradas con justificación |
| `REFERENCES.md` | Referentes visuales y de patrón |
| `fase-N-*/` | Entregables por fase (specs, tokens, mockups, NOTES) |
| `implementation-log/` | Registro de qué se aplicó al código real, deudas y drift |

## Cómo arrancar una sesión de diseño

Decirle a Claude Code, en el primer mensaje:

```
Modo diseño, fase N. Lee docs/design/SESSION_RULES.md y docs/design/PLAN.md
antes de hacer nada.
```

El protocolo completo está en `SESSION_RULES.md`.
