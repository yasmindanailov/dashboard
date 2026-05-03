# AlertBanner — Spec

> Estado: **listo**
> Fuente: `frontend/app/components/ui/AlertBanner/AlertBanner.{tsx,module.css}`
> Maqueta: `docs/design/mockup/components/alert-banner.html`

---

## 1. Anatomía

```
┌─────────────────────────────────────────┐
│ [icon]  TITLE                       [✕] │
│         body text…                      │
└─────────────────────────────────────────┘
```

Banner inline para mensaje contextual. A diferencia de Toast (overlay temporal), AlertBanner vive **dentro del flujo de la página** y permanece hasta que el usuario lo cierra o se resuelve la causa.

## 2. Variantes (DD-NEW · D2B-4 añadir pending)

| Variant | Uso |
|---|---|
| `info` | Aviso neutro persistente. "Mantenimiento programado". |
| `success` | Confirmación destacada. "Tu hosting está listo". |
| `warning` | Atención. "Tu factura vence en 5 días". |
| `danger`  | Problema. "Tu servicio está suspendido". |
| `pending` | **(nuevo)** En revisión, esperando acción externa. "Estamos revisando tus datos". |

Cada variant: bg `--{state}-light`, border `--{state}-border` (DD-018 alpha 0.18), icon `--{state}`, text `--{state}-strong`.

## 3. Estructura

| Prop | Tipo | Detalle |
|---|---|---|
| `variant` | enum | Default `info`. |
| `title` | string opcional | Bold. Una línea. |
| `children` | ReactNode | Body text. |
| `onClose` | callback opcional | Si presente, muestra botón ✕. |

## 4. Estados

| Estado | Comportamiento |
|---|---|
| **default** | Visible. |
| **without title** | Solo body, alineación vertical centrada con icono. |
| **dismissed** | Hijo de la página: el padre decide remontarlo o no. AlertBanner no auto-dismiss. |

## 5. Tokens consumidos

```
Layout    --space-3/4 · --radius-md · --radius-xs
Tipografía --font-size-sm · --font-weight-semibold (title)
           --line-height-normal
Color     --{state}-light · --{state}-border · --{state}-strong · --{state}
          (success, warning, danger, info, pending)
Motion    --transition-fast · --ease-out
Iconos    18×18 (excepción documentada — D2B-7)
```

## 6. Voz de marca aplicada

### Reglas en title

- **Sustantivo o frase nominal**, no comando. "Mantenimiento programado", no "Atención".
- **Específico**, no genérico. "Tu factura vence en 5 días", no "Aviso".

### Reglas en body

- **Frase completa con sujeto**. "Vamos a actualizar la base de datos…", no "BD en mantenimiento".
- **Si hay acción del usuario, decirlo**: "Te avisamos cuando termine."

### Ejemplos producto

| Variant | Title | Body |
|---|---|---|
| info | Mantenimiento programado | "Mañana de 4 a 5h pausamos algunos servicios. Te avisamos cuando termine." |
| success | Tu hosting está listo | "Ya puedes empezar a subir tu web. Te enviamos las credenciales por correo." |
| warning | Tu factura vence en 5 días | "Cárgala antes para que no se interrumpa el servicio." |
| danger | Tu servicio está suspendido | "Hay una factura pendiente. Págala y te lo reactivamos al momento." |
| pending | Estamos revisando tus datos | "Te llamamos en 24h para confirmar y activar tu cuenta." |

## 7. Reglas de uso

- AlertBanner **vive en la página**, no flota. Si necesitas notificación temporal, usa Toast.
- **No abusar**: si una página tiene 3 AlertBanners visibles, el usuario los ignora todos. Máximo 1 prominente, 1 secundario.
- Si la causa se resuelve (factura pagada), el banner desaparece automáticamente — no obliga al usuario a cerrarlo.
- Botón `onClose` solo si **el usuario tiene control real** sobre cerrarlo. Si el aviso debe permanecer hasta resolverse, sin onClose.

## 8. Accesibilidad

- `role="alert"` para anuncios importantes (warning, danger).
- Para info/success persistente, `role="status"` es suficiente (menos intrusivo).
- Botón close con `aria-label="Cerrar"`.

## 9. Drift vs implementación actual

| ID | Drift | Resolución |
|---|---|---|
| **D2B-A** | text colors hex hardcoded (#1E40AF, #065F46, #92400E, #991B1B) | Migrar a `--{state}-strong`. |
| Border alpha 0.15 | DD-018 lo subió a 0.18 | Migrar a `--{state}-border`. |
| **D2B-4** | Sin variant pending | Añadir. |
| **D2B-7** | Icon 18×18 hardcoded | Documentar excepción. |
| Voz | Falta patrón en componente | Aplicar reglas de copy en cada uso. |
