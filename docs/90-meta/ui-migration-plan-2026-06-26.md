# Plan de migración UI — mockups como fuente de verdad (Aelium Dashboard)

> Plan de ejecución para hacer el dashboard real **idéntico** a los mockups de
> `mockup-uiux/` (DSL "claude design"). Acompaña y depende del
> [`ui-migration-gap-2026-06-26.md`](./ui-migration-gap-2026-06-26.md) (gap
> verificado de 37/37 unidades). Este documento responde a tres preguntas:
> **(1)** cómo se migra; **(2)** qué **features** faltan y se programan;
> **(3)** qué **diseños** faltan y hay que encargar a claude design — con el
> brief exacto para cada uno.

---

## 0. Principio rector y supuestos (léelo, define todo lo demás)

1. **El mockup manda en diseño, layout y organización.** El objetivo es paridad
   visual 1:1. Donde mockup y código difieren en *aspecto/estructura*, gana el
   mockup.
2. **Ningún feature real se pierde.** Lo que existe en código y el mockup no
   dibujó **no se borra**: se le crea un diseño coherente con el lenguaje del
   mockup (lista en §3). Esto incluye páginas, modales, estados (vacío/carga/
   error) y paneles que el prototipo no cubrió.
3. **Lo que el mockup diseñó y no existe en código se programa** (features +
   backend cuando aplique; lista en §4).
4. **Logo:** se adopta el del diseño — isotipo bicolor de dos rombos + wordmark
   `aelium` + variantes y loader animado (`Logotipo.dc.html`,
   `LogotipoAnimado.dc.html`). Reemplaza la "A" de los sidebars y los SVG
   `#4b77bb` de `public/brand/`.
5. **Conflictos con reglas frozen → ADR Amendment, nunca desvío silencioso**
   (lección L18 de `CLAUDE.md`). "Idéntico al mockup" obliga a amendar varios
   ADR; están listados y marcados como **decisión requerida** en §2. No se toca
   esa página en F4 hasta que su ADR esté amendado.
6. **Orden de trabajo:** primero las **capas compartidas** (tokens → primitivas
   → shell), luego features con backend, luego reskin página a página. El gap es
   transversal: migrar página por página sin sanear la base reimplementaría cada
   primitiva N veces con drift. (Ver gap report §8.)

> **Si discrepas del supuesto 2** (p. ej. prefieres *eliminar* algún feature que
> el mockup no contempla para quedar literalmente idéntico), dímelo por ítem: por
> defecto **conservo y diseño**.

---

## 1. Mapa de fases

| Fase | Nombre | Qué entra | Bloquea a | Código/Diseño/Decisión |
|---|---|---|---|---|
| **F0** | Cimientos de tokens | Paridad de tokens del mockup en `globals.css`; arreglar bugs de tokens; sistema de iconos SVG (fin de emojis, D1) | todo | Código |
| **F1a** | Primitivas | Construir las primitivas que el mockup asume (Toggle, IconWell, Timeline, SegmentedControl, OrderSummary, PaymentMethodCard, BrandMark, NotificationRow, PricingCard, Stepper, OTP, PasswordStrength) | F2, F4 | Código (a partir del mockup) |
| **F1b** | **Diseños que faltan** (track claude design, en paralelo) | Encargar y producir los diseños del §3 (features reales sin mockup) | F4 de cada página afectada | **Diseño** |
| **F1c** | Gobernanza (en paralelo, sin código) | Amendments de ADR/reglas del §2 | F4 de las páginas afectadas | **Decisión** |
| **F1d** | Marca | Implementar isotipo + wordmark + favicon + loader animado; retirar "A" y SVG `#4b77bb` | F2 | Código (diseño ya existe) |
| **F2** | Shells | Reconstruir `DashboardShell` y `AdminShell` idénticos a `Shell.dc.html` / `admin/Shell.dc.html` | F4 | Código |
| **F3** | Verticales con backend | Features grandes del §4 que necesitan endpoint (Stripe, dashboard ejecutivo, Support Inside gestionado, buscador IA, SLA/IA soporte, taxonomía de notificaciones) | F4 de su página | Código + backend |
| **F4** | Reskin página a página | Migrar cada pantalla al diseño del mockup, integrando primitivas (F1a), diseños nuevos (F1b) y features (F3) | — | Código |

**F0, F1a, F1b, F1c, F1d corren en paralelo.** F2 espera a F0/F1a/F1d. F4 de
cada página espera a que estén listos los diseños (F1b) y ADR (F1c) que la tocan.

**Orden interno de F4** (de menor a mayor riesgo, para rodar el método):
`U21 Clientes → U25 Productos → U26 Producto-detalle` (ya `matched`, talla S) →
formularios y detalles M → listas y detalles L → las XL (overview, billing,
soporte, tasks, ops, support-inside, buscador) al final, ya con backend y
diseños resueltos.

---

## 2. Decisiones requeridas (ADR / producto) — **necesito tu OK**

"Idéntico al mockup" choca con reglas frozen. Por cada una: lo que el mockup
pide, la regla que rompe, y mi recomendación. **Marca las que apruebas;** las que
rechaces, adapto el diseño a la regla en vez de amendar.

| # | Página(s) | El mockup pide… | Regla/ADR frozen | Recomendación |
|---|---|---|---|---|
| D-1 | Overview, Client-detail, Billing, Plugins, Support-Inside | StatsCards (métricas en tarjeta) fuera del Overview | **D10** — "StatsCards solo en Overview" (`rules.md:514-521`) | **Amendar D10** para permitir StatsCards en detalle/gestión, o sustituir por `Meter`/`DescriptionList`. Recomiendo amendar (es lo idéntico). |
| D-2 | Soporte admin (ticket) | Composer con pestañas "Responder / Nota interna" | **ADR-079 §3.8** lo eliminó | **Amendar ADR-079** para reintroducir nota interna en el composer. |
| D-3 | Tareas admin | Página de detalle `/admin/tasks/[id]` + crear tarea (`POST /tasks`) + edición libre de estado | **ADR-079 §1/§3.6** — tareas "listado, no detalle"; sin creación manual | **Amendar ADR-079** (detalle + creación) — es el cambio más profundo; confirmar. |
| D-4 | Servicio detalle (cliente/admin) | Pestañas nuevas ("Cuidado por Aelium", "Plan y facturación") | **TAB_ORDER frozen** (contrato ADR-070/077) | **Amendar el contrato** para añadir pestañas, o materializar como secciones dentro del summary. |
| D-5 | Factura cliente/admin | Detalle de factura como **expand inline** en la lista | Hoy es **página** `/billing/[id]` (más rica) | Decisión de producto: **mantener la página** y diseñarla (recomendado, no se pierde nada) **o** adoptar el inline del mockup y retirar la página. |
| D-6 | Servicio / Dominio | DNS y auditoría **embebidos** en el detalle | Hoy son **páginas dedicadas** `/services/[id]/dns` y `/audit` | Recomiendo **conservar las páginas** y enlazarlas desde el detalle reskineado (no se pierde el CRUD completo). |
| D-7 | Chat | Una sola superficie de chat (drawer) | Conviven `SupportPanel` (vivo) + `ChatWidget` (burbuja huérfana, 0 montajes) | **Consolidar en uno** antes de invertir en su reskin. |
| D-8 | Todo | Logo del diseño en todas partes | SVG actuales `#4b77bb` + placeholder "A" | **Aprobado por ti** — se ejecuta en F1d. |

> Nota canónica: estas amendments deben materializarse como **Amendment del ADR**
> correspondiente (no como excepción puntual), citando la regla en el commit.

---

## 3. DISEÑOS QUE FALTAN — catálogo para claude design (entregable clave)

Son superficies/estados que **existen (o deben existir) en la app real** pero que
claude design **no dibujó**. Para que la migración sea idéntica *en todas partes*
(no solo donde el mockup llegó), hay que diseñarlos en el mismo lenguaje del
mockup. Cada fila es un encargo. Usa la **plantilla de prompt del §6** y rellena
con la columna "Qué debe mostrar".

> Granularidad: este catálogo está a nivel de superficie/estado, derivado de las
> listas "Solo en código" del gap report §5 y de los huérfanos del §9. Si quieres
> que lo expanda a wireframe-por-modal con todos los campos, hago una pasada
> profunda dedicada.

### 3.1 Compartidos / cross-página (diséñalos una vez, se reutilizan)

| ID | Diseño que falta | Qué debe mostrar | De dónde sale (código real) |
|---|---|---|---|
| DS-G1 | **Estados vacíos / carga / error** unificados por tipo de página | EmptyState con ilustración+CTA; Skeletons de lista/detalle; banners de error accionables | `EmptyState`, `Skeleton` ya existen; el mockup casi nunca los dibuja |
| DS-G2 | **Command Palette (⌘K)** | Overlay de búsqueda con resultados por entidad y atajos | `components/ui/CommandPalette` |
| DS-G3 | **Drawer de navegación móvil** | Sidebar colapsado a drawer en <1024px | `DashboardShell`/`AdminShell` responsive |
| DS-G4 | **2FA**: opt-in, modal de configuración (QR/código), estado activado | Flujo completo de segundo factor | perfil cliente/admin (`SecurityPanel`) |
| DS-G5 | **Lock-states de conversación** (bloqueada, en edición por otro agente, terminal) | Banners/overlays de estado de bloqueo en hilos | `_shared/support/conversation` |
| DS-G6 | **Modal de resolución con nota** (categoría + nota obligatoria) | Modal de cerrar ticket/chat con clasificación | `DetailResolutionModal` |
| DS-G7 | **Formularios schema-driven (rjsf)** | Patrón visual para forms dinámicos generados por backend (plugins, producto/provisioner, settings) | `_shared/plugins/rjsf-theme`, `@rjsf/core` |
| DS-G8 | **Banners de drift/desync discriminados por rol** | Aviso de detección externa (cliente: tranquilizador; admin: accionable + reconciliar) | capability ADR-070/077, `DriftRowReconcileButton` |

### 3.2 Cliente

| ID | Página | Diseño que falta | De dónde sale |
|---|---|---|---|
| DS-C1 | Auth | Pantalla de **verificación de email** (éxito + reenvío inline) | `verify-email/`, resend action |
| DS-C2 | Overview | Sección **"Alertas"** y **"Accesos rápidos"** (si el mockup `Inicio` no las incluye) | `dashboard/page.tsx` `buildAlerts`, HelpTip |
| DS-C3 | Servicio detalle | **Gestor DNS** (CRUD de registros) como página/panel diseñado | `_shared/services/dns/DnsRecordsManager` |
| DS-C4 | Servicio detalle | **Timeline de auditoría** paginada | `services/[id]/audit` |
| DS-C5 | Servicio detalle | **Cambio de plan con prorrateo** (tarjeta/modal, ADR-029) | `ChangePlanCard` |
| DS-C6 | Servicio detalle | **Banners terminal / suspendido** | `service-detail-blocks` |
| DS-C7 | Dominio detalle | **Panel de transferencia entrante** (FSM + código EPP + estados) | `DomainTransferPanel` |
| DS-C8 | Dominio detalle | **WHOIS/privacidad, NS editables, DNSSEC/glue** (controles avanzados) | `_registrant-actions`, ADR-081 |
| DS-C9 | Buscador dominios | **Resultado de búsqueda masiva** (multi-nombre) y **estado Premium/error** | `DomainSearch` bulk |
| DS-C10 | Carrito | **Filas de transferencia con cobro diferido** + **estado de éxito EPP** | `CartView.tsx:44-51,104-115` |
| DS-C11 | Carrito | **Carrito vacío** + **error de elegibilidad de registrante** (accionable) | `CartView` EmptyState / `REGISTRANT_INELIGIBLE` |
| DS-C12 | Perfil | **Gestión WHOIS/registrante** (`RegistrantForm`) e **idioma/zona horaria** | `_shared/account`, ADR-081 |
| DS-C13 | Support Inside | **Selector de tipo de slot** (mantenimiento vs gestión), **precio de slot extra**, **empty states** ("sin planes", "sin servicios elegibles") | `support-inside/page.tsx` |
| DS-C14 | Transparencia | **Modal de borrado de cuenta** (sustituye `window.confirm`) | `transparency/page.tsx` |
| DS-C15 | Factura detalle | **Página de detalle de factura** (si se mantiene, D-5) | `dashboard/billing/[id]` |

### 3.3 Admin

| ID | Página | Diseño que falta | De dónde sale |
|---|---|---|---|
| DS-A1 | **Borrado de cuentas** (`/admin/account-deletion`) | **Página RGPD completa** — sin mockup alguno | `DeletionRequestsManager.tsx` |
| DS-A2 | Settings | **Uploader de logo / sección Marca** | `LogoUploader.tsx` (multipart→MinIO) |
| DS-A3 | Settings | **Campos genéricos** color / boolean / enum / string[] y **catálogo dirigido por backend** | `SettingsManager.tsx` |
| DS-A4 | Settings | **Sección Integraciones: salud (circuit breaker) de plugins** | estado de plugins |
| DS-A5 | Client detail | **Panel de Notas** con filtros (8 categorías / 6 sistemas) + **ExceptionalNoteModal** | `_shared/notes` |
| DS-A6 | Servicio detalle admin | **Editor de notas internas** + **controles de dominio en admin** (NS/lock/WHOIS/EPP) | hoy solo en ruta cliente |
| DS-A7 | Producto form / Plugins | **Sub-form dinámico de provisioner / config de plugin** (rjsf) + **máscara de secretos editar/cancelar** | `@rjsf/core`, plugins |
| DS-A8 | Plugins | **Gating superadmin** (estado "sin permiso") | `NoPermission`, RBAC |
| DS-A9 | Billing admin | **Tarjeta de Notas** + **badge factura Manual** + columnas Setup/Descuento | `admin/billing` |
| DS-A10 | Notif templates | **Editor maestro-detalle** (lista + editor inline + preview que persiste borrador) | `TemplatesEditor` |
| DS-A11 | Notif admin | **Bandeja de notificaciones full-page** `/admin/notifications` (huérfano: el popover existe, la página no) | `NotificationBell` |
| DS-A12 | Soporte admin | **Bridge ticket↔task**, **pestaña "Cerradas"**, **asignación de agente**, **banner de escalado** | ADR-074/079, `_shared/support` |
| DS-A13 | Chats workspace | **Asignación de agente** + **modal de escalado** (asunto+prioridad) + estados terminal/lock | `support/chats` |
| DS-A14 | Tareas admin | **Página de detalle de tarea** (si D-3) + **MaintenanceLogModal con checklist auditable** + **agrupación por `source_system`** (5 sistemas) | `admin/tasks`, `MaintenanceLogModal` |
| DS-A15 | Ops (Jobs/DLQ, Error Log) | **Fila expandible** (stack trace/payload), **bulk-retry/resolve**, **modales** (sustituir `window.confirm`), **filtro por módulo** | `jobs/failed`, `error-log` |
| DS-A16 | Overview admin | **Widget "Tu trabajo de hoy"** (`TasksWidget`) integrado en el dashboard ejecutivo del mockup | `_shared/widgets/TasksWidget` |
| DS-A17 | Profile admin | **2FA** (comparte DS-G4) + **idioma/zona horaria** + **email verificado read-only** | `admin/profile` |

### 3.4 Marca (el diseño existe; es implementación, no encargo)

`Logotipo.dc.html` y `LogotipoAnimado.dc.html` ya contienen el isotipo bicolor,
el wordmark y 6 variantes animadas. **No hay que diseñar nada nuevo**: hay que
**exportar SVGs** (isotipo, lockup horizontal, reverso, app-icon, favicon) y
**implementar el loader animado**, reemplazando `public/brand/*.svg` (`#4b77bb`)
y los placeholders "A" de `Sidebar.tsx:189` / `AdminSidebar.tsx:294`.

---

## 4. FEATURES QUE FALTAN — para programar (resumen; detalle en gap report §5)

El gap report enumera **435 ítems "solo-diseño"** por página. Aquí van los
**bloques grandes**; el detalle fino vive en `ui-migration-gap-2026-06-26.md §5`.

**Con backend nuevo (entran en F3, lo más caro):**
- **Stripe** end-to-end: pago de factura desde UI, métodos de pago guardados
  (SetupIntent), dunning, timeline de pagos. (Hoy 0 en código; marcado "futuro".)
- **Dashboard ejecutivo admin**: ~8-10 agregaciones cross-módulo (KPIs con delta
  MoM, "Requiere tu decisión", "Carga del equipo", SLA soporte).
- **Support Inside gestionado**: técnico asignado, última/próxima revisión, log
  de mantenimientos al cliente, slots ricos.
- **Buscador de dominios con IA** + config avanzada de TLDs + bundle de marca +
  precio de renovación.
- **Soporte**: SLA (modelo nuevo), sugerencia IA, respuestas guardadas (macros),
  multicanal (WhatsApp/llamada) en el widget.
- **Notificaciones**: taxonomía categoría/tono (migración Prisma o derivación)
  para las páginas full-page de cliente y admin.
- **Registro**: tipo de cuenta (Personal/Autónomo/Empresa) + campos fiscales
  condicionales + IVA por país.

**Sin backend (presentación pura, entran en F4 con su página):**
- Paneles laterales de auth (value props), stepper de checkout, OrderSummary con
  desglose IVA, agrupación por categorías en tienda/servicios, breadcrumbs en
  topbar, tarjeta de soporte en footer del sidebar, icon-wells, toggles de
  notificación, pricing cards, callouts informativos, etc.

---

## 5. Definition of Done por página (en F4)

Para cada pantalla migrada:
1. **Paridad visual** con el mockup (layout, tipografía, color, spacing, iconos).
2. **Cero features perdidas**: todo lo "solo-código" sigue presente, con su
   diseño nuevo (§3) integrado.
3. **Features del mockup** implementados o con TODO trazado a su vertical de F3.
4. Tokens y primitivas **del sistema** (F0/F1a), nada hardcodeado, sin emojis (D1).
5. ADR amendado si la página estaba en §2.
6. **Verde local** completo (typecheck + lint:check + test front; boot smoke si
   se tocan módulos del backend) y `pnpm ci:check` antes de pushear.
7. Una rama por (sub-)fase; Conventional Commits citando reglas.

---

## 6. Plantilla de prompt para claude design (rellena por ítem del §3)

```
Diseña la pantalla/superficie: <ID + nombre del §3, p.ej. "DS-A1 — Página de
borrado de cuentas (/admin/account-deletion)">.

CONTEXTO: Aelium Dashboard. Esta superficie YA existe en el código real pero no
fue diseñada. Debe encajar idéntica al resto de mockups de mockup-uiux/.

QUÉ DEBE MOSTRAR (de la columna del catálogo / del código real):
<pega aquí lo de "Qué debe mostrar"; abre el archivo de código indicado para
ver campos, estados y acciones reales y respétalos todos>.

REGLAS (no negociables):
- Lenguaje visual idéntico a los mockups existentes: DM Sans; brand #3B82F6 (con
  rombos #93C5FD/#BFDBFE); texto slate #0F172A/#64748B/#94A3B8; borde #E2E8F0;
  cards radio 16px; badges pill; iconos SVG stroke 1.6; SIN emojis (regla D1).
- Reutiliza los COMPONENTES del mockup (cards, badges, tablas, botones, toggles,
  icon-wells, timeline), pero NO reutilices layouts de otras páginas: diseña el
  layout propio de esta superficie.
- Respeta el documento de marca (docs/40-reference/aelium-documento-de-marca.md)
  y el UI_SPEC (anchos §2.8, una acción primaria por vista D2, máx. 2 badges D3).
- Cubre los estados: normal, vacío, carga (skeleton) y error.
- Entrega un .dc.html en mockup-uiux/ (o admin/) con el mismo formato que el resto.
```

---

## 7. Qué necesito de ti para arrancar

1. **Aprobar/rechazar las decisiones del §2** (D-1…D-7; D-8 ya OK). Son la puerta
   de F1c y condicionan varias páginas.
2. Confirmar el **supuesto 2** (conservar+diseñar features sin mockup; no borrar).
3. Decir si quieres que **expanda el §3** a wireframe-por-modal (pasada profunda
   por página) antes de empezar a encargar diseños, o si con este catálogo ya
   puedes ir dándole prompts a claude design.
4. Con eso, redacto el **backlog ejecutable** (F0→F4 en sprints, con ramas,
   contratos de endpoint para F3 y los ADR Amendment concretos de F1c).
```
