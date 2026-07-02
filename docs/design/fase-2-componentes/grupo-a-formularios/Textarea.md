# Textarea — Spec

> Estado: **listo**
> Fuente actual: `frontend/app/components/ui/Textarea/Textarea.{tsx,module.css}`
> Maqueta: `docs/design/mockup/components/textarea.html`

---

## 1. Anatomía

```
┌─────────────────────────────────────────┐
│ Label                                   │
│ ┌─────────────────────────────────────┐ │
│ │                                     │ │
│ │ Multi-line value                    │ │  ← --line-height-normal
│ │                                     │ │
│ └─────────────────────────────────────┘ │
│ Helper · ó · error            123/500   │  ← char count
└─────────────────────────────────────────┘
```

| Parte | Token / detalle |
|---|---|
| `field-label` | Igual que Input. |
| `textarea` | `<textarea>` con `resize: vertical`, padding `--space-3`. |
| `textarea-footer` | Flex justify-between: helper/error a la izquierda, charCount a la derecha. |
| `char-count` | `--font-size-xs` · `--text-tertiary`. Cambia a `--warning` al 90% de maxLength, a `--danger` al 100%. |

---

## 2. Tamaños (DD-NEW)

Resolución D2A-4: añadir sm/md/lg coherentes con Input/Select/Button.

| Tamaño | Padding | Font-size | Min-height |
|---|---|---|---|
| `sm` | `--space-2 --space-3` | `--font-size-sm` | 64px |
| `md` (default) | `--space-3` | `--font-size-base` | 96px |
| `lg` | `--space-4` | `--font-size-md` | 128px |

`rows` HTML sigue siendo configurable encima de min-height.

---

## 3. Estados

| Estado | Comportamiento |
|---|---|
| **default** | `border: --border`. |
| **hover** | `border: --border-hover`. |
| **focus-visible** | `border: --brand` + `--focus-ring`. |
| **disabled** | `bg: --surface-secondary` · cursor not-allowed. |
| **readonly** | Visual igual a default · sin ring. |
| **error** | `border: --danger` + ring rojo. |
| **char count: warn** (≥90%) | Color `--warning`. |
| **char count: error** (≥100%) | Color `--danger`. Bloquea más input. |
| **resize: none** | Para textareas en filas de tabla o donde no proceda redimensionar. |

---

## 4. Tokens consumidos

```
Layout       --space-2/3/4 · --radius-sm
Tipografía   --font-family · --font-size-xs/sm/base/md
             --line-height-normal
Color        --surface-primary/secondary
             --text-primary/secondary/tertiary
             --border · --border-hover · --brand · --warning · --danger
Estado       --focus-ring
Motion       --transition-fast · --ease-out
```

---

## 5. Voz de marca aplicada (DD-022)

### Reglas en labels y placeholders

- Pregunta directa, no etiqueta robotizada.
  - ✓ "Cuéntanos qué pasa"
  - ✗ "Descripción del problema"
- Placeholder con ejemplo real, no abstracto.
  - ✓ "ej. Recibí un email diciendo que la web está caída pero a mí me funciona…"
  - ✗ "Introduzca su mensaje aquí"

### Ejemplos producto

| Contexto | Label | Placeholder |
|---|---|---|
| Soporte · ticket | "Cuéntanos qué pasa" | "Lo que veas, lo que necesites. Sin filtro." |
| Cliente · onboarding | "¿Qué hace tu negocio?" | "Una frase. La que le dirías a un amigo." |
| Admin · nota interna | "Nota interna" | "Para el equipo. El cliente no lo ve." |
| Cliente · solicitud cancelar | "¿Por qué cancelas?" | "Nos ayuda a mejorar. Opcional." |

### Char counter — voz

Cuando el contador entra en zona warning (90%), el copy cercano puede
animar:

- ✓ "Te quedan 50 caracteres."
- ✗ "Has excedido el 90% del límite."

---

## 6. Reglas de uso

- Char count visible **solo si** hay `maxLength`. Sin maxLength, no
  contador.
- El campo crece verticalmente. Si el contexto no permite crecer
  (cards densas), `resize: none` + altura fija.
- Inválido truncar texto silenciosamente al `maxLength`. El `<textarea>`
  nativo respeta el límite — no añadir lógica encima.
- Para mensajes de chat (donde Aelium chatea con cliente) **no usar
  Textarea** — ese es ChatWidget, otro componente.

---

## 7. Accesibilidad

- `<label htmlFor>` + `<textarea id>`.
- `aria-invalid` y `aria-describedby` en error.
- `maxLength` HTML5 nativo.
- Char counter debería tener `aria-live="polite"` para que lectores de
  pantalla anuncien cuando el usuario se acerca al límite.

---

## 8. Drift vs implementación actual

> Detalle en `audit-existing.md` § Componente 4.

| ID | Drift | Resolución |
|---|---|---|
| **D2A-2** | Focus ring | Migrar a `--focus-ring`. |
| **D2A-3** | Border default `--border-hover` | Corregir a `--border`. |
| **D2A-4** | Sin sm/md/lg | Añadir tamaños. |
| Char counter | Usa `--warning`/`--danger` directos | OK, mantener. Documentado como deuda menor: si aparece otro componente con thresholds similares, abstraerlo. |

---

## 9. Materialización

`docs/design/mockup/components/textarea.html`
