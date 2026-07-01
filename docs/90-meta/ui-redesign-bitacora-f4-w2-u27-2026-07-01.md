# Bitácora F4·W2 — U27 Producto-form · 2026-07-01

> Documentación **empírica** del reskin 1:1 de **U27 Producto-form**
> (`/admin/products/new` + `/admin/products/[id]/edit`) hacia
> `mockup-uiux/admin/ProductoForm.dc.html`. Rama `redesign/f4-producto-form`
> (desde `origin/master` `ecd3c49`, ya con U22). Cierra la vertical **Productos**
> (U25 lista + U26 detalle + U27 form). Mapa: `ui-migration-{plan,backlog,gap}-2026-06-26.md`
> (gap U27 = `ui-migration-gap-2026-06-26.md:466-472`).

---

## 1. Método: empírico + preguntar cualquier diff (regla Yasmin)

Antes de tocar: lectura de la doc canónica (README → audit → current → rules →
SESSION_RULES → backlog F4 → gap U27 → contract products) + **verificación contra
código/git**. Hallazgo que corrigió la doc: **U22 (PR #149) ya estaba MERGED** en
`origin/master` (`ecd3c49`) — la rama vieja `redesign/f4-cliente-detalle` era el
pre-merge. → se arrancó rama nueva sobre master.

Regla dura de la sesión: **1:1 exacto; cualquier diff mockup↔realidad se pregunta
antes de implementar**. Se surfacearon 3 decisiones (respuestas Yasmin):

| # | Diff | Decisión Yasmin |
|---|------|-----------------|
| **D1** | Acciones del form: mockup en **cabecera** vs DS `FormPage` al **pie** (congelado §472) | **Cabecera (1:1 mockup)** |
| **D2** | Pricing del **editar** (el mockup solo dibuja crear) | **Reskin en sitio + reordenar** (Identidad → Pricing → Provisioning → Ciclo de vida) |
| **D3** | Nivel primitiva: cards 16+sombra / inputs radio-10/borde-#E2E8F0 / labels 12px grises vs DS actual | **Cambio SISTÉMICO ahora** (Card/Input/Select/Textarea/label globales) |

---

## 2. Cambio SISTÉMICO de primitivas (D3) — ⚠️ afecta a TODA la app

Alinea las primitivas del DS al mockup (fidelidad 1:1 + DRY; mismo patrón que el
Badge de U22). Con tokens, sin literales.

- **`globals.css`**: nuevos tokens `--radius-field: 10px` (inputs/selects/textareas)
  + `--control-height: 42px` (alto de input/select).
- **`Card`**: `--radius-md` (12px) → `--radius-lg` (**16px**) + `box-shadow:
  var(--shadow-sm)` (idéntico al card-chrome que W1 dio a `Table.wrapperCard`).
- **`Input` / `Select` / `Textarea`**: borde `--border-hover` (#CBD5E1) →
  `--border` (#E2E8F0) · radio → `--radius-field` (10px) · alto → `--control-height`
  (42px, input+select) · **label `--text-primary` → `--text-secondary`** (gris del
  mockup) · gap label↔campo 4 → 6px. `Select.sm/lg` re-ajustados a alto fijo.

**Deltas tipográficos aceptados** (evitar ensuciar la escala por ≤1px): label 13px
vs mockup 12px; input 14px vs 13.5px; focus-ring `--brand-subtle` (0.06) vs mockup
0.10. Documentados; candidatos a afinar en la pasada global si Yasmin lo pide.

> **⚠️ RE-SMOKE OBLIGATORIO (Yasmin):** el cambio toca `Card`, `Input`, `Select`,
> `Textarea` → **todas las páginas con forms/cards** cambian de aspecto (registro,
> ajustes, cuenta, checkout, plan-editor, detalles, listas con card-chrome…).
> Verde de build/tests NO cubre regresión visual. Re-smoke ligero de las páginas
> ya mergeadas (igual que el aviso del Badge en U22).

**Fuera de scope (no estaba en la decisión):** `Button` (radio 8px; el mockup usa
10px) — se deja para una futura pasada si se decide.

---

## 3. FormPage — `headerActions` additivo (D1)

`FormPage` gana la prop **`headerActions`** (acciones en la cabecera, junto al
título, alineadas a la derecha). **Additiva**: por defecto las acciones siguen al
pie vía `actions`; nunca ambas. Documentado como **UI_SPEC §2.6 Amendment A1**.
El form sigue sin definir estilos de actions (los gestiona `FormPage`).

---

## 4. Reskin 1:1 de U27

**Paso 1 (tipo):** rejilla `auto-fill minmax(280px)` con tarjetas **icon-well
(DS `IconWell`) + label + píldora Addon + descripción**. `constants.icon` (vacío)
→ Lucide por tipo (Globe/Globe/Server/Wrench/Layers) + `namePlaceholder`
(Web Pro/Dominios/Nextcloud/We Do It/Proyecto ERP). `support_inside` sigue
excluido (ADR-075).

**Paso 2 (secciones, orden 1:1):** Addon banner (azul, we_do_it) → **Identidad**
→ **Pricing** (filas inline ciclo/precio/setup/quitar + "Añadir plan" punteado) →
**Provisioning** (select 380px + hint 1:1 + sub-form `@rjsf` dinámico, que
*supera* al mockup, gap §472) → **Ciclo de vida** (gracia/suspensión/cancelación
+ "El cliente puede pausar") → **banner info gris** por tipo (dominio/we_do_it/
custom). Contenedor `max-width:880px`, gap 20px (mockup 18 → D6 4px-scale).
Acciones en cabecera ("Cambiar tipo" + "Crear X"). Copy alineado 1:1.

**Editar:** mismas secciones compartidas, **reordenadas** (D2) a Identidad →
Pricing → Provisioning → Ciclo de vida; pricing = planes **persistidos** (lista +
añadir + modal de borrado, CRUD atómico vía Server Actions) reskineado al lenguaje
del mockup. `type` inmutable (PROD-INV-2) = subtítulo. Acciones en cabecera.

**Cero features perdidas:** slug auto, validación (nombre/≥1 plan/rjsf), select de
provisioner real, config `provisioner_config`, `(no registrado)` para plugin
removido, modal de borrado — todo conservado.

---

## 5. R15 — extracción de secciones compartidas

El backlog ya lo anticipaba ("los forms de producto se reestructuran en su reskin
F4"). Secciones **compartidas** crear↔editar en `admin/products/_components/form/`:
`IdentitySection` · `ProvisioningSection` · `LifecycleSection` · `ProductBanners`
(Addon+Info) · `provisioner-options.ts` (helper). Solo-crear en `new/_components/`:
`TypeSelectorGrid` · `PricingRowsEditor`.

Resultado (LOC): **NewProductForm 614 → 308** · **ProductEditForm 580 → 384**
(ambos bajo el bar de trabajo <400 del equipo; secciones <100). Duplicación
Identidad/Provisioning/Ciclo-de-vida eliminada. _(Residual sobre el estricto 200:
lógica cohesiva de estado+handlers+composición del controlador del form.)_

---

## 6. DoD (verde)

`frontend`: **typecheck** ✅ · **lint:check** (--max-warnings=0) ✅ · **test**
(15 suites / **96**) ✅ · **build** prod ✅. D1 sin emojis ✅ · CSS tokens-only ✅.
No toca backend/@Module → **boot smoke N/A**. `ci:check` = gate pre-push (backend
intacto).

**Falta (Yasmin):** (1) **smoke visual 1:1** de `/admin/products/new` + `/[id]/edit`
(reiniciar `pnpm --dir frontend dev`; Turbopack no aplica por HMR los tokens nuevos
de `globals.css`). (2) **RE-SMOKE del cambio sistémico** en páginas ya mergeadas
(§2). (3) PR/merge.

---

## 7. Notas / deltas honestos

- **Icon-well del tipo:** DS `IconWell` `tone="brand" size="sm"` (32px, bg
  `--brand-light` #DBEAFE) vs mockup 34px bg `#EFF4FF` (`--brand-wash`). Se usa la
  primitiva DS (R16); si Yasmin quiere el wash exacto = tono nuevo en `IconWell`
  (micro-delta para la pasada global).
- Colores de banners (info gris / addon azul) mapeados a los tokens más cercanos
  (`--surface-secondary`/`--border`/`--text-secondary`; `--brand-wash`/`--brand-light`/
  `--brand-hover`) — sin literales.
- Gap entre secciones 20px (mockup 18px, off-scale D6).

## 8. Siguiente

**F4·W2 restante: U24 Servicio-detalle admin** (toca la plantilla frozen
`ServiceDetailLayout` ADR-070 + 3 features SI spec'd). Luego W3 (shells) y W4
(XL, con F3). **Stripe E6** sigue aplazado «tras el diseño».
