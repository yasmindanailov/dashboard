# Fase 2.A — Formularios

> Estado: **en curso · modelo de spec en revisión**
> Modo: **diseño**
> Output: 6 specs + 6 páginas de maqueta + audit + NOTES.

---

## Objetivo

Especificar visualmente los 6 componentes de formularios: **Button, Input,
Select, Textarea, SearchInput, Dropdown**. Estados completos, tokens cero
hardcoded, accesibilidad teclado, integración con la maqueta viva.

---

## Entradas

- `../../fase-1-tokens/tokens.css` — tokens cerrados.
- `../../fase-1-tokens/tokens.md` — tabla canónica.
- `../../DECISIONS.md` — DD-001 a DD-018 aplican.
- `../../BRIEF.md` — restricciones técnicas.
- `audit-existing.md` — fuentes reales auditadas (en esta carpeta).
- `frontend/app/components/ui/{Button,Input,Select,Textarea,SearchInput,Dropdown}/` — código real.

---

## Entregables

| Archivo | Estado |
|---------|--------|
| `audit-existing.md` | Listo |
| `Button.md` | **Modelo · pendiente de aprobación** |
| `Input.md` | Pendiente (espera aprobación del modelo) |
| `Select.md` | Pendiente |
| `Textarea.md` | Pendiente |
| `SearchInput.md` | Pendiente |
| `Dropdown.md` | Pendiente |
| `../../mockup/components/button.html` | **Modelo · pendiente de aprobación** |
| `../../mockup/components/{otros}.html` | Pendientes |
| `NOTES.md` | Se cierra al final del grupo |

---

## Decisiones controvertidas detectadas en el audit

> Se cierran ANTES de avanzar más allá del modelo. Ver `audit-existing.md`
> para detalle. Cada una espera respuesta humana.

- **D2A-1 — Border-radius de Button.** El código actual usa `--radius-sm`
  (8px) para sm/md y `--radius-md` (12px) para lg. El mapping de fase 1
  decía `--radius-full`. Conflicto. Resolución: registrar como decisión
  (probablemente mantener actual, contradice el mapping).
- **D2A-2 — Focus ring uniforme.** Los inputs actuales usan
  `box-shadow: 0 0 0 3px var(--brand-subtle)` en :focus, no el nuevo
  `--focus-ring` doble. Decidir si migrar todos a `--focus-ring`
  (preferido) o mantener el patrón actual.
- **D2A-3 — `--border` default vs `--border-hover`.** Los inputs hoy
  arrancan con `--border-hover` en estado reposo (intensidad alta para
  un default). DD-004/regla nueva dice default = `--border`. Decidir
  si corregir o mantener.
- **D2A-4 — Tamaños.** Button tiene sm/md/lg. Select tiene sm/md/lg.
  SearchInput tiene sm/md (no lg). Input y Textarea no tienen tamaños.
  Decidir nivelar a sm/md/lg en todos o mantener heterogeneidad.
- **D2A-5 — Hex hardcoded en Button.module.css** (`#DC2626` y
  `rgba(239,68,68,0.15)`). Migrar a `--danger-hover` y nuevo token
  `--shadow-danger` (o usar `--shadow-brand` con override).

Las decisiones se cierran en `../../DECISIONS.md` con DD-019 en adelante.

---

## Plan de la sesión activa

1. ✅ Audit de los 6 componentes (`audit-existing.md`).
2. ✅ Infraestructura de la maqueta viva (`../../mockup/`).
3. ✅ Modelo de spec: `Button.md` + `mockup/components/button.html`.
4. ⏸ **Pausa para aprobación humana** del modelo.
5. ⏸ Cerrar D2A-1 a D2A-5 (decisiones controvertidas).
6. ⏸ Specs en bloque de Input, Select, Textarea, SearchInput, Dropdown.
7. ⏸ Páginas de maqueta correspondientes.
8. ⏸ `NOTES.md` con deudas para fase 2.B y siguientes.
9. ⏸ Commit de cierre del grupo.
