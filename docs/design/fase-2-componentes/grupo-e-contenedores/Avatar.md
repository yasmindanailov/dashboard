# Avatar · sistema de variantes (DD-029)

> Estado: **listo · refactor crítico necesario (paleta · D2E-1)**
> Fuente: `frontend/app/components/ui/Avatar/Avatar.{tsx,module.css}`
> Maqueta: `mockup/components/avatar.html`

---

## 1. Filosofía y paleta brand-coherent (D2E-1)

La versión actual usa **8 colores random** incluyendo pink, orange y
cyan que **no son brand**. Viola "Riguroso y consecuente". Migración a
**5 colores derivados de tokens semánticos**:

| ID | Color | Token | Uso típico |
|---|---|---|---|
| `color-1` | `#3B82F6` | `--brand` | Default brand |
| `color-2` | `#1D4ED8` | `--brand-active` | Brand alternativa |
| `color-3` | `#10B981` | `--success` | Verde, no semántico aquí |
| `color-4` | `#1F8EFA` | `--info` | Azul vivo |
| `color-5` | `#8B5CF6` | `--pending` | Púrpura |

**Excluidos a propósito**: warning (ámbar = alerta), danger (rojo = problema). Avatar nunca debe sugerir "este usuario es un alerta".

Hash determinístico igual: misma cadena de nombre → mismo color siempre.

## 2. Anatomía y variantes

| Variante | Caso |
|---|---|
| `single` (default) | Avatar individual. Initials o image. |
| `with-status` | Avatar + StatusDot superpuesto (online, busy, away, offline, active). |
| `group` | Overlapping avatars para teams. Max visible + "+N". |
| Sizes | `xs` 20 · `sm` 28 · `md` 36 · `lg` 44 · `xl` 64. |

```html
<!-- Single -->
<div class="avatar size-md color-1"><span>YA</span></div>

<!-- With image -->
<div class="avatar size-md"><img src="..." alt="Yasmin"></div>

<!-- With status -->
<div class="avatar size-md color-1 with-status" data-status="online"><span>YA</span></div>

<!-- Group -->
<div class="avatar-group size-md">
  <div class="avatar size-md color-1"><span>YA</span></div>
  <div class="avatar size-md color-3"><span>MA</span></div>
  <div class="avatar size-md color-5"><span>SA</span></div>
  <div class="avatar-rest">+3</div>
</div>
```

## 3. Sizes (reconciliación · D2E-Avatar-px)

| Size | Diámetro | Font-size initials | Uso |
|---|---|---|---|
| `xs` | 20px | 9px | Inline en chips, celdas densas, headers de notificación. |
| `sm` | 28px | 11px | Listas densas, sub-info. |
| `md` (default) | 36px | 13px | Default. Header de cliente, dropdown items. |
| `lg` | 44px | 14px | Profile cards, comments thread. |
| `xl` | 64px | 20px | Profile pages, profile menu open. |

> Drift detectado: TS antiguo definía SIZE_PX 28/40/56 mientras CSS
> 24/32/40. Tras refactor, los tamaños son los de spec arriba —
> verificados en CSS y JSX.

## 4. With-status · 5 estados

| `data-status` | Color del dot | Uso |
|---|---|---|
| `online` | `--success` | Usuario activo ahora. |
| `active` | `--success` con pulse | Actividad en este momento (escribiendo, atendiendo). |
| `busy` | `--warning` | Ocupado / en llamada. |
| `away` | `--text-tertiary` | Inactivo > 15 min. |
| `offline` | `--text-tertiary` 0.5 | Desconectado. |

Border 2px del color de superficie alrededor del dot — destaca sobre cualquier fondo.

## 5. Group

Avatares se solapan con `margin-left: -8px` (md) / `-6px` (sm) / `-4px` (xs). Border 2px `--surface-primary` en cada uno para separación visual.

`.avatar-rest` compone "+N" cuando hay más miembros que avatares visibles. Background `--surface-secondary`, color `--text-secondary`, tabular-nums.

**Convención**: máximo 4 avatares visibles, después rest. Si son ≤ 4, se muestran todos sin rest.

## 6. Tokens

```
Layout    --radius-full · sizes definidos por variante
Tipografía --font-weight-medium · --font-feature-numeric (rest)
Color     --brand · --brand-active · --success · --info · --pending (paleta)
          --surface-primary · --surface-secondary
          --text-secondary · --text-tertiary · --text-on-brand
          --warning (busy)
Motion    --ease-in-out (status active pulse)
```

## 7. Voz / contexto

Avatar no lleva texto — pero sí un `aria-label` con el nombre completo. Convención: el nombre real, no slug ni email.

## 8. Reglas de uso

- **Sin paletas saturadas / divergentes** (D2E-1). Solo los 5 colores aprobados.
- **Initials siempre 2 letras** (primer y última palabra de las 2 primeras del nombre). "Yasmin Aelium" → "YA".
- **Image override** — si hay foto del usuario, usarla. Initials es fallback.
- **with-status solo donde aplica realmente** (presence en chat, agente online). Sin abusar.
- **Group max 4 visibles** + "+N" rest.
- **Color text on initials** = `--text-on-brand` (blanco). Verificado contraste AA con los 5 colores.

## 9. Accesibilidad

- `<div role="img" aria-label="Yasmin Aelium">` cuando es initials.
- `<img alt="Yasmin Aelium">` cuando es foto.
- Status: `aria-label="Yasmin Aelium · online"` (incluir estado).
- Group: contenedor con `aria-label="3 agentes asignados, más 3"`.

## 10. Drift vs implementación actual

| ID | Drift | Resolución |
|---|---|---|
| **D2E-1** | 8 colores random (pink/orange/cyan no brand) | Migrar a paleta de 5 colores derivados de tokens. |
| **D2E-Avatar-px** | TS dice 28/40/56, CSS 24/32/40 | Reconciliar a 20/28/36/44/64 (xs/sm/md/lg/xl). |
| Sin `with-status` | No existe | Añadir variant. |
| Sin `group` | No existe | Añadir composición. |
| Sin `xs`/`xl` | Solo sm/md/lg | Añadir tamaños extremos. |
