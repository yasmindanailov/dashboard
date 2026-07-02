# Fase 1 — Foundations / Design tokens

> Estado: **en curso**
> Modo: **diseño**
> Entrega previa parcial: `phase-1-tokens.html` (generado en sesión Claude
> Design). Pendiente de auditar e integrar.

---

## Objetivo

Definir el sistema de tokens completo del dashboard, listo para volcar a
`frontend/app/globals.css` y al `@theme` de Tailwind 4. Los tokens son la
base de todas las fases siguientes: cualquier componente, patrón o página
los consume.

Al cerrar esta fase, el dashboard entero debería poder cambiar de aspecto
editando solo los tokens.

---

## Entradas

- `../BRIEF.md` — restricciones técnicas e identidad visual actual
- `../DECISIONS.md` — DD-001 a DD-008 aplican directamente
- `../PLAN.md` — principios rectores
- `../../DESIGN_SYSTEM.md` — sistema canónico actual
- `frontend/app/globals.css` — tokens en código (auditar y refinar, no rehacer)
- `preview.html` (cuando se suba) — entregable parcial de Claude Design

---

## Alcance

Confirmado en fase 0 (ver DECISIONS.md):

### A. Color
- Brand scale completa derivada de `#3B82F6` (50–950)
- Neutrales: surface, text, border (con escalas)
- Semánticos × 5 (success / warning / danger / info / **pending**), cada
  uno con base, `-hover`, `-light`, `-border`, `-strong`
- Nombres preparados para dark mode (DD-006)

### B. Spacing
- Escala 4px (mantener actual): documentar uso por contexto

### C. Tipografía
- DM Sans 400/500/600 (DD-002)
- Escala xs–2xl actual + display 3xl/4xl (DD-005)
- Pares semánticos: caption / body / body-lg / h3 / h2 / h1 / display
- Reglas de uso por densidad (cliente vs admin)

### D. Radios
- Escala xs / sm / md / lg / xl / full
- Mapping recomendado a componentes

### E. Sombras
- Niveles xs / sm / md / lg / xl + brand
- Mapping a elevación

### F. Motion
- Durations (fast 150 / normal 200 / slow 300)
- **Easings** (DD-007): ease-out entradas, ease-in salidas, ease-in-out
  default — asociados a tipo de cambio

### G. Layout tokens
- `--sidebar-width`, `--sidebar-collapsed`, `--topbar-height`
- `--container-max-width` por tipo de página

### H. Z-index
- Escala existente, documentar

### I. Iconografía (DD-008)
- `--icon-size-sm/md/lg`, `--icon-stroke-width`
- Íconos concretos NO entran aquí; van a fase 2

---

## Entregables esperados al cerrar

| Archivo | Contenido |
|---------|-----------|
| `tokens.md` | Tabla por categoría: nombre, valor, uso recomendado |
| `tokens.css` | Variables CSS listas para sustituir/extender `globals.css` |
| `preview.html` | Mockup navegable autocontenido: swatches, tipografía, sombras, radios, motion samples |
| `audit.md` | Diff entre `globals.css` actual y los nuevos tokens: qué se añade, qué se renombra (con plan de migración), qué se deprecia |
| `NOTES.md` | Deudas, decisiones pendientes que afectan fases siguientes |

---

## Plan de la sesión activa

1. **Subida del preview parcial:** el usuario sube `phase-1-tokens.html` a
   esta carpeta (renombrarlo a `preview.html`).
2. **Auditoría:** Claude Code lee `preview.html` + `frontend/app/globals.css`
   y produce `audit.md` con el diff y huecos detectados.
3. **Cierre de gaps:** completar lo que falte (motion easings, iconografía,
   pending semántico, escala display) según el alcance.
4. **Entregables finales:** `tokens.md` + `tokens.css` + `NOTES.md`.
5. **Revisión humana** sobre `preview.html` final.
6. **Cierre de fase:** actualizar `DECISIONS.md` con tokens definitivos,
   `PLAN.md` (estado: cerrada, próxima acción: fase 2), commit.

---

## Restricciones específicas de esta fase

- No tocar `frontend/app/globals.css` aún. La fase 1 entrega un draft;
  la migración real ocurre en modo implementación tras aprobación.
- No introducir tokens cuyo valor dependa de un componente específico —
  los tokens son del sistema, no de un caso de uso.
- Si algún token actual de `globals.css` está siendo consumido por
  componentes y no encaja en el nuevo sistema, registrar la decisión
  (renombrar / deprecar / mantener) en `audit.md` con plan de migración.

---

## Cómo continuar esta fase en una nueva sesión

```
Modo diseño, fase 1. Lee docs/design/SESSION_RULES.md, docs/design/PLAN.md,
docs/design/DECISIONS.md y docs/design/fase-1-tokens/ (todos los archivos
presentes). Confirma el estado y propón la próxima acción concreta antes de
generar nada.
```
