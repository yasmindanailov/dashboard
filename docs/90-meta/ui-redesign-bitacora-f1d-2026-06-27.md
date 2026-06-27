# Bitácora del rediseño UI — F1d (marca: favicon + animación de logo) · sesión 2026-06-27

> Registro riguroso de la **fase F1d** del rediseño UI (cerrar el cabo suelto de
> marca que F2 dejó pendiente: **favicon** + **logo animado**). Continúa la
> [bitácora F2](./ui-redesign-bitacora-f2-2026-06-27.md) y el
> [plan](./ui-migration-plan-2026-06-26.md) /
> [backlog](./ui-migration-backlog-2026-06-26.md).
> **Rama:** `redesign/f1d-favicon-loader` (desde `origin/master` `10884c7`, el
> merge de F0+F1 #136). **Todo verde.**

## 0. Resumen ejecutivo

F1d cierra los dos pendientes de marca anotados en la bitácora F2 §5: **favicon**
y **«loader animado»**. Sobre la marcha, **Yasmin redefinió el segundo entregable**
(ver §1): el «loader animado» **no** es un spinner de carga — es la **animación de
entrada del logo** (modelo **«01 · Ensamblaje»** del mockup `LogotipoAnimado.dc.html`)
que se reproduce **al entrar a la página** en el logo del **dashboard** y del
**login**. El loading se queda como está (skeleton existente). Verde: typecheck +
lint:check (max-warnings 0) + **44/44 tests** + `next build` + **verificación
visual Playwright** sobre build de producción aislado (favicon a 16-96px en claro
y oscuro + frames de la animación en el login).

## 1. Decisión de Yasmin (esta sesión) — redefinición del entregable

Tras un primer intento de «loader» como **spinner del isotipo en rotación**
(variante «04 · Rotación» del mockup, cableado en `loading.tsx`), Yasmin corrige:

- **La animación del logo será SOLO el modelo «01 · Ensamblaje»** (los dos rombos
  convergen desde los lados), y se usa como **entrada del logo al cargar la
  página** — en el **logo del dashboard (shells) y del login**.
- **El loading se deja como está.** Ya existe un **skeleton** (`Skeleton`) para los
  estados de carga; se reutilizará ese o se decidirá otro, **no** un loader de logo.
- En consecuencia: **se revierte** el spinner `BrandLoader` (componente + test +
  export del barrel + `dashboard/loading.tsx` + `admin/loading.tsx` + entrada en
  `ds-preview`). **El favicon se mantiene** (entregable independiente y correcto).

## 2. Qué se construyó

### 2.1 Favicon (marca real en la pestaña; fin del default de Next)

El `frontend/app/favicon.ico` era el **default del scaffolding** (Sprint 0
`53704d3`, logo de Next) — verificado con `file` (ICO 16/32). Sustituido por la
convención de **app-icons de Next 16** (doc oficial
`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/app-icons.md`):

- **`app/icon.svg`** — isotipo de marca (dos rombos `#BFDBFE`/`#3B82F6`), **mismo
  trazado que `BrandMark`** reexpresado en SVG y centrado en un `viewBox` 32×32
  (grupo `translate(16 16) scale(0.8226) translate(-13.5 -14.5)`; centros de los
  rombos en (11.9, 16) y (20.1, 16) → punto medio exacto (16,16); ~2px de padding
  horizontal). SVG → nítido a cualquier DPI, `sizes="any"`.
- **`app/apple-icon.tsx`** — touch-icon iOS (no admite SVG ni transparencia) vía
  `ImageResponse` (next/og): isotipo de **formas puras** (sin texto → sin fuentes)
  centrado sobre fondo blanco, 180×180, estáticamente optimizado en build.
- **`git rm app/favicon.ico`** — se elimina el default para que no se sirva el logo
  equivocado ni se emita un `<link>` en conflicto.

**Verificado (Playwright, build de prod):** el `<head>` emite exactamente
`icon -> /icon.svg (image/svg+xml)` + `apple-touch-icon -> /apple-icon (image/png)`,
**sin** rastro de `favicon.ico`. Render legible a 16/24/32/48/96px sobre fondo
claro y oscuro; apple-icon centrado.

### 2.2 Animación de entrada del logo — «01 · Ensamblaje» (prop `intro` de BrandMark)

En vez de un componente nuevo, la animación es una **capacidad opt-in de
`BrandMark`** (reutilizable allá donde ya se usa el logo, F2-independiente):

- **`BrandMark` gana `intro?: boolean`.** Cuando es `true`, cada rombo recibe una
  clase (`introBack`/`introFront`) que reproduce el Ensamblaje: deslizan desde los
  lados (`translateX(±shift)`) con fundido de opacidad, **una sola vez al montar**
  (CSS puro, sin JS). La **distancia de slide escala con el tamaño**
  (`--bm-assemble-shift = round(size·0.85)px`, var por instancia). El estado final
  (`translateX(0) rotate(45deg)`) **coincide con el reposo** → cero salto, cero
  regresión visual.
- **Keyframes** `aelBrandAssembleBack/Front` en `BrandMark.module.css` (no en
  `globals.css`). **`prefers-reduced-motion: reduce` → `animation: none`** (el
  isotipo aparece en reposo, sin desplazamiento vestibular).
- **Cableado** (`<BrandMark … intro />`):
  - **Login** (`AuthLayout.tsx`): logo desktop (panel aurora, `size 34`, con
    wordmark) + logo móvil (`size 28`).
  - **Shells**: `dashboard/Sidebar.tsx:189` + `admin/AdminSidebar.tsx:302`.
  - **`ds-preview`**: fila de demo en la sección BrandMark con botón **Reproducir**
    (remonta vía `key` para re-disparar la animación one-shot — afordancia de QA).

> **Comportamiento «al entrar»:** el shell (layout) **persiste** entre
> navegaciones SPA → el logo se ensambla **una vez por carga dura** (entrada al
> portal / redirect de login), no en cada navegación. El login monta en su
> entrada. Es exactamente lo pedido.

## 3. Verificación (empírica)

- `pnpm --dir frontend typecheck && lint:check` (max-warnings 0) verdes.
- **44/44 tests** (6 suites — baseline de master; el spinner revertido se llevó sus
  4 tests).
- **`pnpm --dir frontend build`** OK — `○ /icon.svg` y `○ /apple-icon` generados
  como estáticos; sin errores SSR.
- **QA visual Playwright** sobre `next start` en **puerto aislado :3055** (el `:3002`
  estaba ocupado por el `dev` de Yasmin) contra el **build de producción**:
  - **Favicon** ✓: isotipo bicolor nítido y centrado a 16-96px en claro/oscuro;
    apple-icon centrado; `<head>` correcto (sin default).
  - **Login** ✓: frame temprano (~180ms) muestra los rombos **mid-convergencia**
    (separados + semi-transparentes); frame en reposo (~1480ms) el logo asentado y
    correcto (idéntico al estándar). La secuencia converge-y-asienta = «01 ·
    Ensamblaje».
  - Shell admin/cliente: mismo componente + prop → comportamiento idéntico
    (no screenshoteado: requiere auth/backend; el mecanismo está probado en login).

## 4. Nota de reconciliación con F2 (importante para el merge)

`dashboard/Sidebar.tsx` y `admin/AdminSidebar.tsx` **también los toca la rama F2**
(`redesign/f2-shells`, sin mergear) en el header del logo. F1d nace de `master`
(pre-F2), así que al añadir `intro` a esas dos líneas habrá un **conflicto trivial**
al integrar ambas ramas. **Resolución:** conservar la versión F2 del header del
logo **y mantener `intro`** en el `<BrandMark>`. (La capacidad `intro` y el cableado
de login viven en ficheros que F2 no toca → sin conflicto.) Orden esperado: Yasmin
mergea F2 primero; F1d rebasa sobre el nuevo master y re-aplica `intro` (1 token por
shell).

## 5. Estado y siguiente paso

- **F1d CÓDIGO-COMPLETO y verde** en `redesign/f1d-favicon-loader`. **PR contra
  master** (Yasmin mergea). Cierra el último pendiente de la fundación de marca.
- **Pendiente del rediseño:** **F3** (verticales con backend: Stripe E6…) y **F4**
  (reskin página a página). F4 arranca tras el merge de F2 (shells).
- **Falta (Yasmin):** smoke visual en `:3002` (reiniciar `dev`) + merge.
