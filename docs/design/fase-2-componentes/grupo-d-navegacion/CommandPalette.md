# CommandPalette — Spec

> Estado: **listo**
> Fuente: `frontend/app/components/ui/CommandPalette/CommandPalette.{tsx,module.css}`
> Maqueta: `mockup/components/command-palette.html`

---

## 1. Anatomía

```
┌─────────────────────────────────────────────────────────┐
│ 🔍  Buscar página, acción o entidad…           [ESC]    │ ← search row
├─────────────────────────────────────────────────────────┤
│  RECIENTES                                              │ ← section label
│  [⏱]  Floristería Pérez                                 │ ← item
│  [⏱]  INV-00042                                         │
│                                                         │
│  NAVEGAR                                                │
│  [👥] Clientes                Lista de clientes         │
│  [🏷] Productos               Catálogo de productos     │
│                                                         │
│  ACCIONES RÁPIDAS                                       │
│  [+]  Nuevo ticket            Crear ticket de soporte   │ ← icon brand
├─────────────────────────────────────────────────────────┤
│  ↑ ↓ navegar    ↵ abrir    esc cerrar                   │ ← footer hints
└─────────────────────────────────────────────────────────┘
```

Activado con `Cmd+K` / `Ctrl+K` desde cualquier pantalla autenticada.

| Parte | Token / detalle |
|---|---|
| `.cmd-overlay` | Backdrop con blur(4px) y bg `rgba(15,23,42,0.4)` (slate dark). z-modal. |
| `.cmd-palette` | 560px max-width, `--radius-lg`, `--shadow-xl`. Animación `--motion-modal-in`. |
| `.cmd-search-row` | SearchInput pattern. Icon + input + ESC kbd. |
| `.cmd-section-label` | Eyebrow en uppercase (RECIENTES / NAVEGAR / ACCIONES RÁPIDAS). |
| `.cmd-item` | 32×32 icon (bg secondary o brand-subtle si action) + label + desc opcional + shortcut opcional. Active/hover bg `--brand-subtle`. |
| `.cmd-footer` | Hints de teclado con `<kbd>` styled. |
| `.cmd-empty` | Voz Aelium: "No encontramos nada para 'foo'. Prueba con otra cosa." |

---

## 2. Secciones

| Section | Cuándo aparece | Contenido |
|---|---|---|
| **Recientes** | Si hay items en `localStorage` (max 5) | Pages visitadas recientemente. |
| **Navegar** | Siempre que hay items permitidos por rol (PBAC) | Páginas principales del shell. |
| **Acciones rápidas** | Acciones contextuales por rol | "Nuevo ticket", "Contratar servicio", "Nuevo producto". |

> Las secciones **se filtran por rol** vía `lib/permissions.ts` → `canAccess(role, module)`.

---

## 3. Comportamiento

| Acción | Resultado |
|---|---|
| `Cmd+K` / `Ctrl+K` | Abrir paleta (overlay + palette anim). Focus en search. |
| Escribir en search | Filtra items por label, description, keywords. |
| `Arrow Down` / `Arrow Up` | Navegar entre items, scroll si hace falta. |
| `Enter` | Ejecutar item activo (navegar o action). Añadir a recientes. |
| `Esc` | Cerrar (anim cmd-palette-out + overlay-out). |
| Click outside | Cerrar. |
| Click item | Ejecutar item. |

---

## 4. Tokens

```
Layout    --space-1/2/2_5/3/4/8 · --radius-sm/lg/xs · --z-modal
Tipografía --font-size-xs/sm/base · --font-weight-medium/semibold
          --font-mono (kbd)
Color     --surface-primary/secondary · --brand · --brand-subtle
          --text-primary/secondary/tertiary · --text-on-brand · --border
Sombras   --shadow-xl
Motion    --motion-modal-in · --transition-fast · --ease-out
```

---

## 5. Validación con documento de marca

- **Experto que empodera (rasgo 1)**: la paleta da productividad — el usuario salta a cualquier pantalla en 2 keystrokes. Empodera al staff.
- **Pragmático (rasgo 6)**: si hay forma rápida de hacerlo, ofrécela. Cmd+K es esa forma.
- **Voz**:
  - Placeholder: "Buscar página, acción o entidad…" — directo, contextual.
  - Section labels en castellano: "RECIENTES", "NAVEGAR", "ACCIONES RÁPIDAS".
  - Empty state Aelium: "No encontramos nada para '...'. Prueba con otra cosa." (corregir el actual).
  - Footer hints en español: "navegar", "abrir", "cerrar".

### Items producto

| Section | Items reales (admin) |
|---|---|
| Navegar | Dashboard, Clientes, Productos, Facturación, Tickets, Chat en vivo, Configuración |
| Acciones | Nuevo producto, Nuevo ticket |
| Recientes | Floristería Pérez, INV-00042, ticket #234, etc. |

| Section | Items reales (cliente) |
|---|---|
| Navegar | Dashboard, Mis facturas, Soporte |
| Acciones | Contratar servicio |
| Recientes | facturas vistas, tickets abiertos |

---

## 6. Reglas de uso

- **Activar SIEMPRE con Cmd+K / Ctrl+K**. Detectar UA para mostrar atajo correcto en hints.
- **Filtrar por permisos** del rol (PBAC). Item que el usuario no puede usar, no aparece.
- **Recientes max 5** items, FIFO. Persistir en localStorage.
- **Mostrar atajo en topbar** ("⌘K" como kbd) para descubrimiento.
- **Empty state con voz Aelium**, no neutra.

---

## 7. Accesibilidad

- `role="dialog"` + `aria-label="Paleta de comandos"` en `.cmd-palette`.
- Search input con `autocomplete="off" spellcheck="false"`.
- Items como `<button>` con keyboard nav completo.
- Esc cierra y devuelve focus al trigger.
- Screen readers anuncian count de resultados al filtrar.

---

## 8. Drift vs implementación actual

| ID | Drift | Resolución |
|---|---|---|
| **D2D-3** | `--surface-hover` no existe → hover no se ve | Migrar a `--brand-subtle` (mismo tratamiento que `.dropdown-item:hover`). |
| **D2D-9** | Empty voz neutra | Refactor a voz Aelium. |
| Animaciones sin token | overlayIn/paletteIn inline ms | Migrar a `--motion-modal-in` + `--ease-out`. |
| `--surface, --border, --text-link` con fallbacks | Herencia legacy | Limpiar fallbacks rgba — los tokens existen. |
| Shortcut Cmd vs Ctrl | Hardcoded | Detectar UA, mostrar correcto. |
