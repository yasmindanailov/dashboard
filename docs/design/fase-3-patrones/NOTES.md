# NOTES.md — Fase 3 · Patrones de página

> Deudas de implementación TS/CSS module a ejecutar en sprints
> propios cuando esta fase de diseño quede aprobada.

---

## Resumen

Fase 3 entrega especificación + CSS de mockup + 3 maquetas con todas
las variantes nativas (DD-029). La implementación TS de cada nueva
variante NO se ejecuta aquí — queda registrada en este NOTES para
sprints futuros, en orden de prioridad por valor producto.

Cero cambios en `frontend/` durante esta fase. La rama `dashboard-ui-design-teiTc`
solo crece en `docs/design/` y `docs/design/mockup/`.

---

## Patrón 1 · `PageHeader`

### N3-1 · Eyebrow opcional
Añadir prop `eyebrow?: string`. Render como `<span class="ph-eyebrow">`
(brand color, uppercase, letter-spacing 0.08em). **Sin marker** (DD-030).
Sprint pequeño, riesgo cero.

---

## Patrón 2 · `ListPage`

### N3-2 · Variant prop
```ts
variant?: 'standard' | 'grid' | 'timeline' | 'split'  // default 'standard'
```
- `standard`: render Table como children (sin cambios). 
- `grid`: container CSS aplica grid auto-fill 280px.
- `timeline`: container envuelve children en card neutra.
- `split`: container es grid 2 cols (master 360 + detail flex). Página
  inyecta `<aside class="split-master">` + `<div class="split-detail">`.

Migración de páginas existentes: ninguna requiere cambio inmediato (todas
usan `standard` por defecto). Las nuevas (`/cliente/transparency`,
`/agente/support`) ya nacen con la variante adecuada.

### N3-3 · Gap explícito en `.container`
Migrar a `display: flex; flex-direction: column; gap: var(--space-6)`.
Tras esto los hijos no necesitan margin-bottom propio. Compatibilidad
verificada porque los componentes hijos actuales no fijan margin.

### N3-4 · Slot `aside` NO se abre
La variante `split` cubre el caso de aside-en-lista. Si emerge un caso
nuevo, decisión propia.

---

## Patrón 3 · `DetailPage`

### N3-5 · Migración Tabs DS (DD-028) — **prioridad alta**
Hoy DetailPage renderiza tabs hardcoded. Migración:

```ts
// Antes
tabs?: DetailTab[]
activeTab?: string
onTabChange?: (key: string) => void

// Después
tabs?: ReactNode  // se espera <Tabs variant="underline" ... />
// API legacy se mantiene durante migración fase 5+
```

Páginas a migrar a la nueva API: `admin/clientes/[id]`, `admin/billing/[id]`,
`admin/products/[id]` y todas las que se creen de nuevo.

### N3-6 · Variant prop + aside
```ts
variant?: 'standard' | 'with-aside' | 'workspace-lite'  // default 'standard'
aside?: ReactNode  // solo render si variant === 'with-aside'
// workspace-lite usa slots `railLeft?` y `railRight?`
```

### N3-7 · Header card sin firma decorativa
Confirmado: NO añadir border-left, NO rombo (DD-030). La firma viene
del **contenido** de la página (avatar, badge, eyebrow tipográfico).

### N3-8 · Ritmo vertical
Migrar `.container` a `flex column + gap: --space-6`. Quitar
`margin-top` del headerCard.

---

## Patrón 4 · `FormPage`

### N3-9 · Variant prop + steps + toc
```ts
variant?: 'standard' | 'wizard' | 'long-form'  // default 'standard'
steps?: { key: string; label: string; status: 'done' | 'current' | 'pending' }[]
currentStep?: string
toc?: { id: string; label: string }[]
actionsSticky?: boolean  // default false
```

### N3-10 · Title con token
Migrar `font-size: 24px` hardcoded a `var(--font-size-xl)`. Verificar
que el render visual no cambia (24px = `--font-size-xl` actual).

### N3-11 · Sticky actions
Activar cuando la página decide:
```tsx
<FormPage actionsSticky>...</FormPage>
```
CSS ya implementado en `mockup/styles.css`. Replicar al CSS module:
`position: sticky; bottom: 0; backdrop-filter: blur(8px); border-top`.

### N3-12 · Wizard intersection observer
Para que el TOC `is-active` siga al scroll:
```ts
useIntersectionObserver(sections, { threshold: 0.3 }, (id) => setActive(id))
```
Hook reutilizable, cabe en `frontend/app/hooks/`.

### N3-13 · Modal "salir sin guardar"
Cuando `actions = "Cancelar"` y hay cambios pendientes, abrir Modal
confirm con la voz Aelium documentada en `FormPage.md` § 4. Lógica
en la página, no en el wrapper.

---

## Decisiones cerradas en esta fase

### El wrapper renderiza Breadcrumb
Ningún consumidor de DetailPage o FormPage debe renderizar
`<Breadcrumb>` suelto. Los wrappers ya lo hacen. La página solo provee
`breadcrumb={[...]}`.

### ListPage NO renderiza Breadcrumb
ListPage es la "raíz de sección" — su h1 es la sección. No hay breadcrumb
en list pages (Clientes / Facturas / Tickets son nivel 1 después del
sidebar).

### Ancho único 1200/1400 reafirmado
Confirmado: ningún wrapper expone props de ancho. `wide?: boolean`
sube de 1200 a 1400. Punto.

### Workspace puro (chats) fuera de fase 3
Pattern `Workspace` con 3 columnas a viewport completo se diseña en
fase propia cuando abordemos chats. Workspace-lite (variante de
DetailPage) NO es Workspace puro — es para triage operativo dentro
del shell normal.

---

## Para fase 4 (shells)

### N3-14 · ClientShell envuelve patterns con sidebar lateral
Confirmar que sidebar + topbar + main rinden bien con patterns dentro.
Verificar gap entre sidebar collapse y `.container`.

### N3-15 · AdminShell con context-back-link
Cuando admin entra a una entidad cliente desde otro contexto, el back-link
flotante (ya existe en código) debe coexistir con Breadcrumb sin doblar.

### N3-16 · AuthShell sin patterns
Auth pages (login/register/reset) no usan FormPage estándar — usan
AuthShell propio (centrado vertical, sin sidebar). FormPage es para
formularios dentro del producto.

---

## Lo que esta fase NO entregó

- Implementación TS de las variantes en `frontend/` (registrado arriba).
- Pattern Workspace puro (chats).
- Mockups de páginas reales del producto compuestas con patterns
  (fases 5-9).
- Estados especiales (loading patterns, error patterns) — fase 10.
- Migración del DetailPage internal Tabs a Tabs DS — sprint propio.
