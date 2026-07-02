# Skeleton — Spec

> Estado: **listo**
> Fuente: `frontend/app/components/ui/Skeleton/Skeleton.{tsx,module.css}`
> Maqueta: `docs/design/mockup/components/skeleton.html`

---

## 1. Anatomía

Bloque animado con shimmer linear-gradient. Reemplaza temporalmente al contenido real mientras carga.

## 2. Variantes (DD-NEW · D2B-3 morfológicas)

| Variante | Descripción | Tamaño base |
|---|---|---|
| `block` (default) | Rectángulo. Width/height configurables. | `width auto · height 16px` |
| `circle` | Círculo. Para avatares y iconos. | Configurable. |
| `line` | Línea de texto. | `height 14px` (= small text) |
| `line-lg` | Línea de body. | `height 20px` |
| `title` | Título de sección. | `height 28px · width 60%` |
| `avatar` | Avatar circular. | `32×32` |
| `paragraph` | 3 lines, última al 70%. | composición |
| `row` | Avatar + 2 lines (skeleton row de tabla). | composición |
| **`rombo`** | **(nuevo)** Rombo Aelium pulsando. Para empty/loading con identidad. | `16×16` |

### Skeleton-rombo · firma visual

Reemplazo opcional al shimmer para momentos donde queremos transmitir "Aelium está cargando", no solo "algo carga". Pulsa con `--ease-in-out`. Se usa típicamente en empty states + loaders de página, no en filas masivas.

## 3. Composición

Skeleton se usa para **espejar la forma del contenido real**. La regla:

- Skeleton de un Card → mismo tamaño y proporciones que la Card real.
- Skeleton de una row de tabla → avatar (si lo hay) + lines en posición y tamaño cercanos al texto real.
- Skeleton de un párrafo → 3 lines, última más corta (mimetiza fin de párrafo).

Esto es **morfológico**: el usuario reconoce inmediatamente la estructura mientras carga. Reduce salto cognitivo cuando llega el contenido.

## 4. Estados

Skeleton no tiene estados interactivos. Solo:

| Estado | Comportamiento |
|---|---|
| **shimmer** (default) | Linear-gradient anima de derecha a izquierda. 1.5s loop. |
| **pulse** (rombo) | Opacity 0.5 ↔ 1, mismo loop. |

## 5. Tokens consumidos

```
Color   --surface-secondary, --surface-tertiary (gradient stops)
Layout  --radius-sm (default) · --radius-full (circle/avatar) · --radius-xs (line)
Motion  --ease-in-out · 1.5s duration
```

## 6. Reglas de uso

- **Mostrar skeleton ≥ 200ms** desde el inicio de la carga. Si la respuesta llega antes, no parpadear con skeleton — feedback visual ruidoso.
- **Espejar el contenido real**, no usar skeleton genérico que no anticipa la forma.
- **Cantidad coherente** con la cantidad esperada: si normalmente hay ~10 filas, mostrar 5-7 skeletons (no 1, no 50).
- Cuando es **carga de página completa**, considerar `.aelium-loader.lg` con texto en lugar de skeleton si no se sabe la forma.
- `prefers-reduced-motion: reduce` → desactivar shimmer (mostrar bloque estático).

## 7. Accesibilidad

- `aria-busy="true"` en el contenedor padre que está cargando.
- `aria-label="Cargando..."` en el contenedor (no en cada skeleton).
- Lectores de pantalla deberían anunciar "Cargando" una vez, no por cada skeleton individual.

## 8. Drift vs implementación actual

| ID | Drift | Resolución |
|---|---|---|
| **D2B-3** | Solo block + circle | Añadir line, title, avatar, paragraph, row, rombo. |
| Tokens DD-021 | `--surface-tertiary` cambió a slate-100 | Verificar que el shimmer sigue siendo legible. **Sí** — los tonos azulados-grises del gradient ahora aportan más identidad. |
| `prefers-reduced-motion` | No respetado | Añadir media query que desactive animation. |
