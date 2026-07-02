# Modal · sistema de 5 variantes (DD-029)

> Estado: **listo**
> Fuente: `frontend/app/components/ui/Modal/Modal.{tsx,module.css}`
> Maqueta: `mockup/components/modal.html`

---

## 1. Filosofía

Modal cubre 5 casos UX radicalmente distintos. DD-029 exige variantes
nativas:

| Variante | Caso de uso | Anim |
|---|---|---|
| `standard` (default) | Forms, edición, info compleja | `--motion-modal-in` (slide-up + fade) |
| `drawer` | Detalle inline desde listado, filtros avanzados, side panel | Slide lateral derecho |
| `confirm` | Confirmaciones críticas, destructivas | scale-in compacto |
| `full-screen` | Multi-paso (checkout, onboarding wizard) | Sin transform, fade |
| `bottom-sheet` | Mobile · acciones contextuales | Slide-up desde abajo |

## 2. Anatomía base

```html
<div class="modal-overlay [variante]" role="dialog" aria-modal="true">
  <div class="modal-dialog size-md">
    <div class="modal-header">
      <div class="modal-header-text">
        <span class="modal-eyebrow">Crear cliente</span>
        <h2 class="modal-title">Nuevo cliente</h2>
      </div>
      <button class="modal-close" aria-label="Cerrar">…</button>
    </div>
    <div class="modal-body">
      <p>…</p>
    </div>
    <div class="modal-footer">
      <span class="footer-left">Tarda menos de un minuto.</span>
      <button class="btn btn-secondary btn-md">Cancelar</button>
      <button class="btn btn-primary btn-md">Crear cliente</button>
    </div>
  </div>
</div>
```

| Parte | Token / detalle |
|---|---|
| `.modal-overlay` | bg `rgba(15, 23, 42, 0.4)` (slate dark de marca) + `backdrop-filter: blur(2px)`. |
| `.modal-dialog` | `--surface-primary` + `--radius-lg` + `--shadow-xl`. Animación `--motion-modal-in`. |
| `.modal-eyebrow` | Eyebrow brand tipográfico (uppercase + letter-spacing). **Sin marker rombo** (DD-030 · saturación). |
| `.modal-title` | `--font-size-md`, semibold, letter-spacing. |
| `.modal-close` | 32×32 ghost button con `--focus-ring`. |
| `.modal-body` | Padding `--space-6`, scroll vertical. |
| `.modal-footer` | Border-top, flex justify-end. `.footer-left` para texto auxiliar. |

## 3. Variantes

### 3.1 Standard
Sizes `sm/md/lg/xl` (400/520/680/920px). Centro. Backdrop con blur. Slide-up + fade entrada.

### 3.2 Drawer
Side panel deslizante. Default lateral derecho (`.drawer`), variante `.left`. Width 480px, 100vh. Border-radius solo en lado interno.

**Cuándo**: ver detalle de cliente sin salir del listado, filtros avanzados, panel de configuración rápida.

### 3.3 Confirm
Compacto (max 420px). Para acciones críticas. **Variante `.destructive`** sin border-left (DD-030 · accent-stripe se reserva a navegación funcional). La señal destructiva viene del **title concreto + body explicando consecuencias + botón danger** — los tres juntos comunican criticidad sin necesidad de adornos en el contenedor.

```html
<div class="modal-dialog confirm destructive">
  <div class="modal-header"><h2 class="modal-title">¿Eliminar Floristería Pérez?</h2></div>
  <div class="modal-body">
    <p>Se eliminará el cliente y sus <strong>5 servicios</strong>. Esta acción no se puede deshacer.</p>
  </div>
  <div class="modal-footer">
    <button class="btn btn-secondary btn-md">No, dejar como está</button>
    <button class="btn btn-danger btn-md">Sí, eliminar cliente</button>
  </div>
</div>
```

**Voz de marca obligatoria**: el title pregunta el qué concreto ("¿Eliminar Floristería Pérez?"), el body explica las consecuencias (rasgo "experto que empodera"), los CTA dicen qué pasa (DD-022).

### 3.4 Full-screen
100% viewport. Sin border-radius. Para flows multi-paso (checkout, onboarding wizard, editor amplio).

**Estructura recomendada**: header con stepper + body con paso activo + footer con "Atrás / Siguiente / Cancelar".

### 3.5 Bottom-sheet
Mobile. Slide-up desde abajo. Drag handle visual (4px height) en top-center. Border-radius solo arriba.

**Cuándo**: mobile breakpoint, acciones contextuales (compartir, more options).

## 4. Estados

| Estado | Comportamiento |
|---|---|
| **closed** | DOM no renderizado. |
| **open · entering** | Anim entrada per variante. Focus al primer interactivo. |
| **open · idle** | Backdrop bloquea scroll del body. Tab trap activo. |
| **closing** | Anim salida (más rápida — `--motion-modal-out`). |
| **focus-visible (close button, footer btns)** | `--focus-ring`. |

## 5. Tokens consumidos

```
Layout    --space-3/4/5/6 · --radius-lg · --radius-sm · --z-modal
Tipografía --font-size-xs/sm/md · --font-weight-medium/semibold
Color     --surface-primary · --border · --brand · --danger
          --text-primary/secondary/tertiary
Sombras   --shadow-xl
Motion    --motion-modal-in · --motion-modal-out · --transition-fast · --ease-out
```

## 6. Voz de marca aplicada

- **Eyebrow contextual** opcional: "Crear cliente", "Editar producto" — mismo patrón que StatsCard.
- **Title como pregunta o acción concreta**: "Nuevo cliente", "¿Eliminar Floristería Pérez?".
- **Body explica las consecuencias** cuando es destructivo. Sin "Are you sure?". Sí "Se eliminará el cliente y sus 5 servicios. No se puede deshacer."
- **CTA en participio o verbo concreto**: "Sí, eliminar cliente" (no "Aceptar"). "No, dejar como está" (no "Cancelar"). DD-022.
- **footer-left** opcional para texto auxiliar: "Tarda menos de un minuto.", "Te avisamos cuando termine."

## 7. Reglas de uso

- **Cada Modal SIEMPRE** con `aria-modal="true"`, `role="dialog"`, `aria-labelledby` apuntando a `.modal-title`.
- **ESC cierra** + click fuera cierra (excepto destructive: solo botón).
- **Focus trap** dentro del modal (a implementar).
- **Body scroll lock** mientras hay modal abierto.
- **Una sola Modal abierta a la vez** — sin nesting.

## 8. Accesibilidad

- ESC cierra (excepto en destructive — solo botón).
- Focus al primer interactivo al abrir; al trigger al cerrar.
- Tab trap dentro del modal.
- Backdrop `aria-hidden="true"`.

## 9. Drift vs implementación actual

| ID | Drift | Resolución |
|---|---|---|
| **D2E-Modal-var** | Solo 1 variant | Añadir drawer, confirm, full-screen, bottom-sheet. |
| **D2E-Modal-anim** | Anim sin tokens | Migrar a `--motion-modal-in/out`. |
| **D2E-Modal-trap** | Sin focus trap | Añadir en implementación. |
| Backdrop hex | `rgba(0,0,0,0.4)` | Migrar a `rgba(15,23,42,0.4)` (slate-900 marca). |
| Close icon hardcoded | 20×20 | `--icon-size-lg`. |
