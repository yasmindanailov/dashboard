# Audit · patterns existentes (fase 3)

> Estado: **lectura cerrada · drift identificado**
> Fuentes auditadas:
> - `frontend/app/components/ui/PageHeader/PageHeader.{tsx,module.css}`
> - `frontend/app/components/ui/ListPage/ListPage.{tsx,module.css}`
> - `frontend/app/components/ui/DetailPage/DetailPage.{tsx,module.css}`
> - `frontend/app/components/ui/FormPage/FormPage.{tsx,module.css}`
> - `docs/UI_SPEC.md` §2.4 / §2.5 / §2.6 / §2.8 / §3.5

---

## Resumen ejecutivo

Los tres patterns existen, son funcionales, y respetan el ancho único
(`max-width: 1200px` / `wide: 1400px`). La anatomía coincide con UI_SPEC
§2.4–§2.6. La revisión detecta **7 driftings** que esta fase corrige sin
romper API pública.

Ningún drift es bloqueante para producción — pero todos comprometen la
disciplina (DD-029 sin variantes nativas, DD-028 sin Tabs DS, DD-030 con
recuadro headerCard sin firma).

---

## Patrón 1 · `PageHeader`

| ID | Drift | Severidad | Resolución |
|---|---|---|---|
| **D3-7** | Sin variante nativa para listing con `eyebrow` (sección > página). Las páginas que necesitan eyebrow lo improvisan. | Media | Añadir prop `eyebrow?: string` opcional. Tipográfico, sin rombo (DD-030). |
| **D3-12** | Subtitle siempre `--text-secondary`. Ningún caso para metadata neutra (`--text-tertiary`) cuando subtitle es contador "142 clientes". | Baja | No tocar el componente — la voz Aelium ya hace el trabajo. Documentar guidelines. |

Resto del componente sano. `responsive` ya stack en 639px.

---

## Patrón 2 · `ListPage`

| ID | Drift | Severidad | Resolución |
|---|---|---|---|
| **D3-2** | Sin separación visual entre bloques (`gap` implícito por margenes de hijos). Si hijos cambian, ritmo se rompe. | Media | Aplicar `display: flex; flex-direction: column; gap: var(--space-6)` al `.container`. Margenes de hijos quedan obsoletos pero compatibles. |
| **D3-3** | Sin variantes nativas. Hoy todas las pages usan `<Table>` por defecto. Productos catálogo (cliente) y servicios (admin) son **grid de cards**, no tabla. Audit log / activity feed pide **timeline**. Support queue pide **split master-detail**. | Alta | Añadir prop `variant?: 'standard' \| 'grid' \| 'timeline' \| 'split'`. CSS define el contenedor de contenido por variante. La página inyecta los hijos apropiados (Table, Card grid, Timeline items, master-detail panes). |
| **D3-13** | `banner` slot existe (alertas) pero no hay slot `aside` ni `intro` para variantes future. | Baja | No abrir nuevos slots. `banner` cubre 95%; el resto se compone como children. |

**No drift de marca.** El layout es minimalista funcional, ya está bien.

---

## Patrón 3 · `DetailPage`

| ID | Drift | Severidad | Resolución |
|---|---|---|---|
| **D3-1** | **Tabs hardcoded internos** — DetailPage renderiza `<button role="tab">` con `styles.tab` propio. Tras DD-028 (Tabs · 5 variantes con StatusDot prefix) esto es drift mayor: el componente DS Tabs es la fuente única. | **Alta** | DetailPage acepta el componente DS `<Tabs variant="underline">` como children del slot `tabs`, no genera markup propio. Migration: mantener compat con la API actual durante la migración fase 5+. |
| **D3-4** | `.headerCard` es `surface-primary + border + shadow-sm + radius-lg + padding 6`. Genérico SaaS — sin firma Aelium. | Media | NO añadir rombo (DD-030). NO añadir accent-stripe (DD-030). La firma viene del **contenido**: avatar with-status, badge tipográfico, ID con tabular-nums, eyebrow opcional sobre el título. |
| **D3-5** | Sin variantes nativas. Hoy DetailPage = "página entera centrada". Tickets / casos / clientes complejos piden **with-aside** (2/3 contenido + 1/3 metadata-actions). Workspace de soporte pide **3 columnas** (lista lateral + detalle + contexto). | **Alta** | Añadir `variant?: 'standard' \| 'with-aside' \| 'workspace-lite'`. CSS materializado. La página inyecta el aside como prop `aside?: ReactNode`. |
| **D3-14** | `ContextBackLink` siempre Suspense. Si la página es server component, OK; pero pattern asume client. | Baja | Documentar restricción. No tocar. |

---

## Patrón 4 · `FormPage`

| ID | Drift | Severidad | Resolución |
|---|---|---|---|
| **D3-6** | Actions con `padding-y` fijo y sin sticky. UI_SPEC §2.6 dice "sticky cuando form excede 2× viewport". Hoy NO hay sticky. | Media | Añadir prop `actionsSticky?: boolean` (default false). CSS `.actions.sticky { position: sticky; bottom: 0; backdrop-filter; border-top }`. La página decide. Spec recomienda activar cuando `>2vh` de form. |
| **D3-8** | Sin variantes nativas. **Wizard** (alta cliente, alta servicio) y **long-form con TOC** (settings, perfil) no están cubiertos — cada página los reinventa. | **Alta** | Añadir `variant?: 'standard' \| 'wizard' \| 'long-form'`. Wizard expone `steps?: { key, label, status }[]` y `currentStep?: string`. Long-form expone `toc?: { id, label }[]`. |
| **D3-9** | `header.title` con `font-size: 24px` hardcoded. Debería ser token (`--font-size-xl` o nuevo `--font-size-2xl` si se promociona). | Baja | Migrar a `var(--font-size-xl)` — ya existe (24px). |
| **D3-10** | Sin breadcrumb integrado a la izquierda del title — lo apila vertical. OK con el spec actual, pero impide variantes inline (eyebrow + title con breadcrumb compacto). | Baja | Mantener apilado vertical. La variante long-form puede inline el breadcrumb si se valida. No urgente. |
| **D3-11** | Actions sin separación visual cuando NO sticky — solo `padding 4 0`. En forms cortos el botón "flota" sin anclaje. | Baja | Añadir `border-top: 1px solid transparent` en default y `--border` cuando sticky. Disciplina visual sin agregar peso. |

---

## Drift transversal

| ID | Tema | Resolución |
|---|---|---|
| **D3-15** | Ritmo vertical inconsistente: PageHeader `mb: --space-6`, Breadcrumb sin `mb` (depende del contenedor), DetailPage `headerCard mt: --space-5 / mb: --space-6`. | **Convergencia**: gap del wrapper raíz a `--space-6`. Hijos no fijan `margin-top/bottom` propios. |
| **D3-16** | DD-030 cumplido en componentes pero los patterns nunca lo verificaron. headerCard sin border-left ✅. ListPage sin rombo ✅. FormPage sin rombo ✅. | Confirmado en auditoría. Nada que cambiar. |
| **D3-17** | Voz Aelium presente en componentes pero NO en headers de página. Patterns deben documentar el copy: title, subtitle, eyebrow. | Sección "Voz aplicada" en cada spec con ejemplos. |

---

## Decisión: APIs públicas estables

Las extensiones de variante van en **props opcionales con default
backward-compatible**. Migrations:

```ts
// ListPage
variant?: 'standard' | 'grid' | 'timeline' | 'split'  // default 'standard'

// DetailPage
variant?: 'standard' | 'with-aside' | 'workspace-lite'  // default 'standard'
aside?: ReactNode  // solo se renderiza si variant === 'with-aside'
tabs?: ReactNode   // pasar <Tabs ... /> DS, no array de objetos
                   // legacy `tabs: DetailTab[]` se mantiene mientras se migra

// FormPage
variant?: 'standard' | 'wizard' | 'long-form'  // default 'standard'
steps?: WizardStep[]            // requerido si variant === 'wizard'
currentStep?: string
toc?: TocItem[]                 // requerido si variant === 'long-form'
actionsSticky?: boolean         // default false
```

La fase 3 entrega especificación + CSS + mockups. Implementación TS de
las variantes nuevas se ejecuta en su sprint propio (registrado en
`NOTES.md`).
