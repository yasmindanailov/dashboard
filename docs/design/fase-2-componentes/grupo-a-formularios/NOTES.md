# NOTES.md — Fase 2.A · Formularios

> Deudas, decisiones pendientes y observaciones que pasan a fases
> siguientes o al modo implementación.

---

## Para el modo implementación (cuando se promocione fase 2.A)

### N2A-1 · Migrar focus ring de los 5 componentes a `--focus-ring`
Hoy: `box-shadow: 0 0 0 3px var(--brand-subtle)` en Input, Select, Textarea, SearchInput.
Cambio mecánico — sustituir por `outline: none; box-shadow: var(--focus-ring);` en `:focus-visible`. **Riesgo bajo**, mejora a11y.

### N2A-2 · Border default de `--border-hover` a `--border`
Hoy: los inputs arrancan con `--border-hover` (intenso). Spec: arrancar con `--border` y subir a `--border-hover` en hover real. Cambio en una línea por componente.

### N2A-3 · Añadir tamaños sm/md/lg a Input y Textarea
Hoy no tienen. Añadir clases `field-sm` / `field-md` / `field-lg` con paddings y font-size correspondientes.

### N2A-4 · Refactor de Button danger:hover
Hex `#DC2626` → `--danger-hover`. `rgba(...)` → nuevo token `--shadow-danger` (proponer DD-019 en implementación, o registrar como deuda).

### N2A-5 · Dropdown · keyboard navigation
Falta completa. Añadir Arrow up/down, Esc, Enter, Home, End, Tab, según spec § 8 de Dropdown.md. ARIA roles `menu` / `menuitem`. Trabajo de implementación — la spec lo describe.

### N2A-6 · Dropdown · animación
`fadeIn 100ms ease` → `--motion-stack-in` (180ms ease-out). Si Framer Motion entra en algún componente, considerar migrar Dropdown junto con Modal y Toast.

### N2A-7 · SearchInput · ocultar cancel nativo de WebKit
Añadir `::-webkit-search-cancel-button { display: none; }` para evitar choque con clear custom.

### N2A-8 · Voz de marca · refactor de copy
Aplicar DD-022 a TODOS los usos existentes de Button/Input/Select/Textarea/SearchInput/Dropdown en el código. Trabajo grande de copywriting + refactor:

- Recorrer cada `.tsx` que usa estos componentes y revisar sus labels, placeholders, helpers, opciones, items.
- Sustituir genérico por vocabulario Aelium (ver `Button.md` § Voz de marca y los ejemplos en cada `.html`).
- Validar con humano antes de mergear — el copy es marca.

---

## Decisiones controvertidas que se cierran aquí (no se elevan)

### Disabled de Input se unifica con Select/Textarea
`bg: --surface-secondary` · `color: --text-tertiary` · `cursor: not-allowed`. Ya estaba en Select/Textarea, Input se alinea.

### SearchInput se queda sm/md (sin lg)
Documentado: un buscador grande raramente tiene sentido. Si emerge un caso, se reabre.

### Submenús anidados en Dropdown — NO
Documentado en spec. Si la jerarquía requiere submenú, hay un problema de diseño previo.

### Item disabled en Dropdown — sin implementar hasta caso real
Spec lo documenta como variante con `aria-disabled` + opacity. Implementar cuando aparezca uso.

---

## Para fase 2.B (feedback)

### N2A-9 · Char counter de Textarea como patrón compartido
Si Badge, AlertBanner u otros tienen thresholds parecidos (algo cerca de un límite), considerar abstraer a un mini-componente `<Threshold>` o a una clase utility `.threshold-warn` / `.threshold-error`.

### N2A-10 · Estados de feedback inline (validating, saving, saved)
Los inputs no tienen "validating" o "saved" hoy. Si fase 2.B introduce un componente Toast de "guardando..." considerar si los inputs deberían tener estado inline también.

---

## Para fase 2.C (data)

### N2A-11 · SearchInput dentro de Table
SearchInput se usará prominentemente en `FilterBar` y `ListPage`. Asegurar que la spec de Table consume SearchInput sin overrides.

### N2A-12 · Dropdown como Row Actions
Dropdown es el patrón de "acciones de fila" en tablas. Spec de Table en fase 2.C debe documentar esta integración.

---

## Para fase 3 (patrones)

### N2A-13 · Field group / sección de form
No hay un patrón "FieldGroup" hoy. Pero sample-form.html ya muestra cómo se agrupan visualmente. Formalizar en fase 3 (`FormPage`).

### N2A-14 · Form actions (footer del form)
Patrón consistente: izquierda "Más opciones" / "Más acciones", derecha "Cancelar" + "CTA primary". Documentar en patrón `FormPage`.

---

## Para fase 4 (shells)

### N2A-15 · Densidad por portal aplicada a inputs
Cliente: `field-md` y `field-lg` por defecto, body-lg.
Agente/Admin: `field-sm` y `field-md`.
Esta regla se cierra al diseñar shells.

---

## Lo que esta fase explícitamente NO entregó

- Specs visuales del resto de componentes — fases 2.B–2.E.
- Combobox / autocomplete (cuando un select supera 10 opciones).
- Date picker / Time picker (no había en código auditado, no hace falta hoy).
- Form validation library / framework — implementación, no diseño.
- Multi-select — sin caso real identificado.
