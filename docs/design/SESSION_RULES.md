# SESSION_RULES.md — Protocolo del programa de diseño

> Reglas operativas para sesiones de Claude Code que trabajen en `docs/design/`.
> Análogo a `docs/SESSION_RULES.md` pero acotado al programa de diseño.
> Se carga manualmente al iniciar la sesión.

---

## Regla 0 — Aislamiento

Esta carpeta NO debe leerse en sesiones de desarrollo regulares. Si la sesión
no fue iniciada explícitamente con *"modo diseño"* o *"implementación de fase N
de diseño"*, no abrir archivos de `docs/design/`.

---

## Regla 1 — Dos modos, jamás mezclar

| Modo diseño | Modo implementación |
|-------------|---------------------|
| Solo escribe en `docs/design/` | Aplica al código real en `frontend/app/` |
| Genera specs, mockups HTML, tokens en archivos aparte | Modifica componentes y páginas existentes |
| No toca `frontend/`, `backend/`, ni los canónicos `DESIGN_SYSTEM.md`/`UI_SPEC.md` | Promociona cambios aprobados a los canónicos cuando aplique |
| Rama: `claude/dashboard-ui-design-teiTc` | Rama: `feat/design-fase-N-impl` (o similar) |
| Salida: archivos en `docs/design/fase-N/` | Salida: PR con cambios de código + entrada en `implementation-log/` |

Declarar el modo explícitamente al inicio de la sesión. Si se cruza el límite,
abortar y avisar al usuario.

---

## Regla 2 — Orden de lectura al iniciar sesión

En este orden, sin saltarse ninguno:

1. `docs/design/PLAN.md` — estado actual, fase activa, decisiones acumuladas
2. `docs/design/DECISIONS.md` — justificación detrás de cada decisión cerrada
3. La fase anterior completa si aplica (`fase-N-*/NOTES.md` + entregables)
4. `docs/design/BRIEF.md` solo si necesitas reanudar contexto del producto
5. Este archivo

Después: confirmar al usuario en qué fase estamos, qué decisiones aplican, y
cuál es la próxima acción. **No generar nada hasta que el usuario confirme.**

---

## Regla 3 — Restricciones técnicas inviolables

El diseño se va a implementar sobre el stack existente. Cualquier propuesta
debe ser implementable con:

- Next.js 16 (App Router) + React 19 + TypeScript estricto
- CSS Modules + Tailwind 4 con tokens CSS centralizados (`globals.css`)
- DM Sans (400/500/600) como única familia tipográfica
- Sin librerías UI externas (no shadcn, MUI, Chakra, Radix, Headless UI)
- Iconos SVG inline (Lucide no está instalado)
- Framer Motion 12 disponible para micro-interacciones
- Socket.io para realtime (chat, notificaciones)
- Sin librería de gráficos instalada (a evaluar caso por caso)

Si una decisión rompe alguna restricción, justificarlo y pedir confirmación
antes de avanzar.

---

## Regla 4 — Coherencia con los canónicos

Mientras una fase no se haya promocionado a `docs/DESIGN_SYSTEM.md` o
`docs/UI_SPEC.md`, esos archivos siguen siendo la verdad. No contradecirlos
sin marcar la decisión como **propuesta de cambio** en `DECISIONS.md` con
justificación. La promoción ocurre en modo implementación.

---

## Regla 5 — Estados completos por defecto

Toda spec de componente o patrón debe entregarse con todos los estados
aplicables: default / hover / focus-visible / active / disabled / loading /
error / empty. No aceptar specs incompletas como cerradas.

---

## Regla 6 — Tokens, no valores

Nada de hex hardcoded ni magic numbers en specs ni en mockups. Todo se
expresa en tokens. Si falta un token, proponerlo y añadirlo a fase 1
(`tokens.css`) antes de usarlo.

---

## Regla 7 — Cierre de sesión

Antes de terminar cada sesión, ejecutar en este orden:

1. **Actualizar `PLAN.md`**: estado de la fase, próxima acción, fecha.
2. **Añadir entradas a `DECISIONS.md`** por cada decisión cerrada hoy, con
   justificación corta y referencia al artefacto que la materializa.
3. **Generar/actualizar `NOTES.md`** de la fase activa con deudas, dudas
   y decisiones pendientes que afecten fases posteriores.
4. **Commit** en la rama `claude/dashboard-ui-design-teiTc` con mensaje
   `docs(design): fase N — [resumen corto]`.
5. **Resumen al usuario**: qué se cerró, qué quedó pendiente, qué sigue.

Si algún paso queda sin hacer, dejarlo registrado en el TodoWrite final.

---

## Regla 8 — Estructura de cada fase

Toda carpeta `fase-N-*/` debe contener al cerrarse:

| Archivo | Contenido |
|---------|-----------|
| `README.md` | Objetivo de la fase, entradas, entregables, estado |
| `*.md` | Specs (uno por componente/patrón cuando aplique) |
| `*.css` o `*.json` | Tokens o configuración derivada (si aplica) |
| `preview.html` | Mockup navegable autocontenido (si aplica) |
| `NOTES.md` | Deudas, decisiones pendientes, drift conocido |

Mockups HTML deben ser autocontenidos (sin dependencias externas) para
poder abrirse directamente en el navegador.

---

## Regla 9 — Si hay ambigüedad, preguntar

Si una decisión puede tener múltiples interpretaciones razonables y afecta
fases posteriores, preguntar antes de avanzar. No inventar criterios. La
respuesta del usuario se registra en `DECISIONS.md`.

---

## Regla 10 — Commit conventions

Coherente con el repo:

```
docs(design): fase 1 — tokens base aprobados
docs(design): fase 2.A — formularios specs cerrados
feat(design-impl): aplicar tokens fase 1 a globals.css
```

Sin co-authors automáticos. Sin firmas de IA. Mensaje en español, descriptivo.
