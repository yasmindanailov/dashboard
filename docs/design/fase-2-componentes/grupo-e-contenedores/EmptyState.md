# EmptyState · sistema de 4 variantes (DD-029)

> Estado: **listo**
> Fuente: `frontend/app/components/ui/EmptyState/EmptyState.{tsx,module.css}`
> Maqueta: `mockup/components/empty-state.html`

---

## 1. Filosofía

EmptyState es **el momento más Aelium del producto**. Es donde la voz de
marca brilla — el usuario no sabe qué hacer y la marca lo guía. La
versión inicial era una sola forma genérica. DD-029 exige variantes:
cada contexto tiene UX distinta y voz distinta.

| Variante | Caso de uso | Voz Aelium característica |
|---|---|---|
| `inline` | Tabla vacía, dropdown vacío, lista filtrada | Cortita, contextual. "Sin resultados." (sin decoración rombo · DD-030) |
| `page` | Página completa sin contenido (overview vacío) | Voz amplia, mesh sutil, rombos brand. |
| `search` | "No encontramos nada para 'foo'" | Sugerencia constructiva. "Prueba con otra cosa." |
| `first-time` | Onboarding · primer cliente, primera factura | Eyebrow + invitación + CTA prominente. "Crea el primero o llamamos contigo." |

## 2. Estructura común

```html
<div class="empty-base [variante]">
  <!-- Decoración: rombos / icono -->
  <h3 class="empty-title">…</h3>
  <p class="empty-desc">…</p>
  <div class="empty-action">[CTA?]</div>
</div>
```

## 3. Variantes en detalle

### 3.1 Inline — para tablas, listas, dropdowns sin resultados

```html
<div class="empty-base inline">
  <h3 class="empty-title">No hay clientes con esos filtros</h3>
  <p class="empty-desc">Quita algún filtro o cambia el término de búsqueda.</p>
</div>
```

Compacto, ~120-160px de altura. **Sin decoración** — solo title + desc (DD-030 · empty inline no necesita rombos). Sin CTA prominente — guía a quitar filtros.

### 3.2 Page — overview vacío con mesh sutil

```html
<div class="empty-base page">
  <div class="empty-rombos"><span class="rb"></span><span class="rb"></span><span class="rb"></span></div>
  <h3 class="empty-title">Aún no tienes facturas</h3>
  <p class="empty-desc">Cuando contrates tu primer servicio, aquí verás todas tus facturas. Te avisamos cuando llegan y se cargan automáticamente — sin sorpresas.</p>
  <div class="empty-action">
    <button class="btn btn-primary btn-lg">Ver planes</button>
    <button class="btn btn-secondary btn-lg">Habla con nosotros</button>
  </div>
</div>
```

Mesh sutil de fondo (`--mesh-opacity-product`). 3 rombos brand con opacity progresiva (0.5 / 0.7 / 1) como ilustración mínima Aelium. Title display-medium (`--font-size-2xl`), desc body-lg (`--font-size-md`), CTA en lg.

### 3.3 Search — sin resultados de búsqueda

```html
<div class="empty-base search">
  <div class="empty-icon">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
  </div>
  <h3 class="empty-title">No encontramos nada para «marina»</h3>
  <p class="empty-desc">Prueba con el NIF, el dominio, o quita acentos. Si no aparece, dinos qué buscas y lo encontramos contigo.</p>
</div>
```

Icono lupa en círculo `--surface-tertiary`. Title `--font-size-lg`. Voz Aelium clave: **sugerencia constructiva** ("prueba con NIF, dominio, sin acentos"), nunca "0 results found".

### 3.4 First-time — onboarding del primer item

```html
<div class="empty-base first-time">
  <span class="empty-eyebrow">Tu primera vez aquí</span>
  <h3 class="empty-title">No tienes clientes aún</h3>
  <p class="empty-desc">Crea el primero ahora o cuéntanos cómo te ayudamos a importar tu cartera. Si vienes de otro proveedor, lo movemos contigo — sin cortar el servicio.</p>
  <div class="empty-action">
    <button class="btn btn-primary btn-md">Crear cliente</button>
    <button class="btn btn-secondary btn-md">Cuéntanos cómo te ayudamos</button>
  </div>
</div>
```

Card con border + radius-lg + mesh muy sutil. Eyebrow brand **tipográfico** (DD-030 · sin marker rombo). Title display-md, desc body-md. Dos CTAs paralelos: la acción directa + la cercanía Aelium ("cuéntanos cómo te ayudamos").

## 4. Voz Aelium · matriz por variante

| Variante | Title pattern | Desc pattern | CTA pattern |
|---|---|---|---|
| `inline` | "Sin resultados", "No hay X con esos filtros" | Sugerencia mínima | (sin CTA o link de "Limpiar") |
| `page` | "Aún no tienes X" | Explica qué pasará cuando haya datos + tono cercano | CTA primaria + secundaria "Habla con nosotros" |
| `search` | "No encontramos nada para «query»" | Sugerencias constructivas | (sin CTA típicamente) |
| `first-time` | "No tienes X aún" | Invita + ofrece ayuda Aelium | Acción directa + "Cuéntanos cómo te ayudamos" |

**Anti-patrones universales**:
- ❌ "0 results"
- ❌ "Empty state"
- ❌ "Nothing here yet"
- ❌ Title genérico sin contexto
- ❌ CTA "Get started" sin verbo concreto

## 5. Tokens

```
Layout    --space-2/3/4/5/6/8/10/12/16 · --radius-full · --radius-lg
Tipografía --font-size-xs/sm/md/lg/2xl · --font-weight-semibold/medium
Color     --surface-primary · --surface-tertiary
          --brand · --accent-secondary
          --text-primary/secondary/tertiary
Firma     --mesh-opacity-product · rombos como ilustración
```

## 6. Reglas de uso

- **Inline para tablas/listas/dropdowns vacíos**. Page para overviews. Search para resultados de filtro/búsqueda. First-time para onboarding.
- **First-time SOLO la primera vez** — no repetir si el usuario eliminó todo (ese caso es page).
- **Voz cambia según contexto** — usar la matriz §4.
- **Rombos como ilustración** evita "stock illustration" cliché. Aelium signature.

## 7. Accesibilidad

- `role="status"` en wrapper para que screen readers anuncien empty.
- Si tiene CTA, `<button>` con `aria-label` descriptivo.
- Focus visible en CTAs (`--focus-ring`).

## 8. Drift vs implementación actual

| ID | Drift | Resolución |
|---|---|---|
| **D2E-Empty** | Forma única | Añadir 4 variantes. |
| Sin firma visual | Usaba `--text-tertiary` icon genérico | Rombos como ilustración + mesh-bg en page/first-time. |
| Voz | No documentada | Matriz por variante + anti-patrones universales. |
| Title size | Una sola | Adaptado por variante (sm en inline, lg en search, 2xl en page/first-time). |
