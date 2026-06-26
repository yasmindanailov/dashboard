# Análisis de Gap — Mockups UI/UX vs. Frontend real (Aelium Dashboard)

> Informe de decisión para una migración/refactor de UI. Compara los mockups del lenguaje de diseño (`mockup-uiux/`, DSL "claude design") contra el frontend real (Next.js 16 + React 19, `frontend/app/`). Verificado contra el código vivo; las afirmaciones de "existe / no existe" se han contrastado con grep/lectura sobre el repositorio real, no con la documentación.

---

## 1. Resumen ejecutivo

> **Cobertura: 37/37 unidades.** Las unidades **U10** (carrito/checkout), **U15** (Support Inside cliente) y **U30** (Configuración admin) se analizaron y verificaron en una **segunda pasada** tras fallos transitorios de API (Overloaded/stalled) en su verificación durante la primera; sus cifras ya están incorporadas a TODOS los totales de este informe. Esa pasada **reforzó** el hallazgo de tokens rotos: confirmó `var(--border-default)` y `var(--border-subtle)` sin fallback en `CartView.tsx:186,282`, y `var(--surface)`/`var(--surface-2)` inexistentes en `DeletionRequestsManager.tsx:75,89` y `LogoUploader.tsx:74-75` — bordes/superficies rotos hoy, igual que el `#635BFF`.

Se analizaron **37 unidades de UI** (pares mockup↔código que cubren todo el dashboard: autenticación, shell de cliente y admin, 12 superficies de cliente, 18 de admin, más marca y chat-widget compartido). El resultado es inequívoco y favorable a una migración por fases:

- **0 unidades en estado `mismatch`**, **3 `matched`** (U21 Clientes-lista, U25 Productos-lista, U26 Producto-detalle, todas admin-CRUD ya construidas sobre el Design System) y **34 `partial`**. No hay un abismo arquitectónico: el código real **casi siempre tiene el esqueleto funcional** (rutas, server actions, RBAC/PBAC, WebSocket en tiempo real, paginación, estados de error/empty) y **en lógica suele superar al mockup**.
- En agregado: **435 features "mockup-only"** (presentes en el diseño, ausentes en código) frente a **288 "code-only"** → el diseño pide **~1,51×** más de lo que hoy se ve, pero el código aporta una base sustancial que el diseño ignora.
- **Esfuerzo ponderado total estimado: ~124 puntos** (S=1, M=2, L=3, XL=5), repartido **59 admin / 54 client / 11 resto**. Distribución por talla: **S=3, M=3, L=20, XL=11**.
- **El gap es transversal, no página-específico.** Se concentra en tres capas compartidas (tokens, primitivas, shell) que, migradas página a página, se reimplementarían N veces con drift garantizado.

**Hallazgos de mayor severidad (bugs reales de render, verificados):**

- **`#635BFF` (púrpura Stripe, prohibido por el DS) hardcodeado y renderizándose en 4 ficheros** — verificado: `NotificationBell.module.css`, `admin-sidebar.module.css`, `transparency/page.tsx`, `TemplatesEditor.tsx`.
- **Tokens inexistentes referenciados en 12+ ficheros** — verificado en `globals.css`: NO existen `--brand-600`, `--border-subtle`, `--text-link` ni el bare `--surface` (solo `--surface-primary/secondary/tertiary/dark`). El uso de `var(--brand-600)` en `ServicesListView.tsx:103` (link "Ver detalle") y `var(--primary,#635BFF)` en `transparency/page.tsx:170` resuelven a valor inválido/heredado o al púrpura prohibido. Son **colores rotos hoy en producción**.

**Tres mockup-orphans (superficies de diseño sin ruta en código):** página de notificaciones cliente (`/dashboard/notifications`), bandeja de notificaciones admin (`/admin/notifications`) y detalle de tarea (`/admin/tasks/[id]`). Verificado: no existe ruta de notificaciones bajo `/dashboard`; `/admin/tasks` solo tiene `page.tsx` (sin `[id]`).

**Recomendación:** **Sí, refactorizar primero el design system (tokens + primitivas + shell) antes de migrar páginas una a una.** Detalle en §8.

---

## 2. Metodología

**Qué se comparó.** 37 unidades, cada una un par mockup(s)↔página(s) real(es). Para cada unidad se clasificó la correspondencia (`matched`/`partial`/`mismatch`), y se enumeraron tres listas: *mockupOnly* (en diseño, no en código), *codeOnly* (en código, no en diseño) y deltas de *layout*/*visual*/*reuse*, con marca de `needsBackend` por item.

**Cómo.** El insumo primario es la auditoría de conformidad por unidad (fundamentos de mockup y de código, tokens del DSL vs `globals.css`, deltas de design-system, gap por página). Sobre ese insumo se aplicó **verificación adversarial**: cada afirmación load-bearing de "existe / no existe / file:line" se contrastó con `grep`/lectura sobre el repositorio real, no con la documentación (regla canónica del proyecto: la doc es un mapa, no un evangelio).

**Verificación adversarial — evidencia y honestidad sobre el rigor.** Se re-verificaron en esta sesión los hallazgos de mayor impacto:

| Afirmación | Verificación | Resultado |
|---|---|---|
| `--brand-600`, `--border-subtle`, `--text-link`, bare `--surface` no existen en globals.css | `grep` sobre `globals.css` | **Confirmado**: solo existen `--surface-primary/secondary/tertiary/dark` (líneas 42-45); ninguno de los otros aparece |
| `#635BFF` hardcodeado en 4 ficheros | `grep -l` sobre `frontend/app` | **Confirmado**: exactamente 4 ficheros (NotificationBell.module.css, admin-sidebar.module.css, transparency/page.tsx, TemplatesEditor.tsx) |
| `--brand-600` roto en link "Ver detalle" | lectura `ServicesListView.tsx:103` | **Confirmado**: `color: 'var(--brand-600)'` sin fallback |
| `/dashboard/notifications` no existe (mockup-orphan U13) | `ls` del directorio | **Confirmado**: no existe la ruta |
| `/admin/tasks/[id]` no existe (mockup-orphan U35) | `ls` de `admin/tasks/` | **Confirmado**: solo `page.tsx`, `_components/`, `tasks.module.css` |

El resto de afirmaciones por unidad (file:line de componentes, contratos de tipos en `api.ts`, gates de capability, choques con ADR) proceden de la auditoría por unidad, que a su vez declara `grep -> N resultados` para los hallazgos de ausencia. **Límite de rigor honesto:** no se re-ejecutó cada uno de los ~723 items individuales en esta sesión; se re-verificó la muestra de mayor impacto (los bugs de token y los orphans) y se confió en la verificación documentada por unidad para el resto. La confianza declarada por unidad es **alta** en las 37. Donde el insumo señala correcciones a análisis previos (off-by-one de líneas, falsos positivos de grep, conteos), se ha respetado la versión corregida.

**Qué NO se hizo.** No se ejecutó el frontend ni se hicieron capturas; la comparación es estática (código + mockups). No se auditó el backend salvo donde el insumo ya citaba controllers/DTOs concretos para distinguir "falta UI" de "falta endpoint".

---

## 3. Matriz de correspondencia (todas las unidades)

| Unidad | Mockup(s) | Página(s) real(es) | Estado |
|---|---|---|---|
| U01-auth | Login / Registro / Recuperar / Reset / Verify `.dc.html` | `app/_components/LoginForm.tsx`, `register/`, `forgot-password/`, `reset-password/`, `verify-email/`, `AuthLayout.tsx` | partial |
| U02-shell-cli | `Shell.dc.html`, `Sidebar Toggle Variantes` | `dashboard/Sidebar.tsx`, `_shared/shell/Topbar.tsx`, `NotificationBell.tsx` | partial |
| U03-overview-cli | `Inicio.dc.html` | `dashboard/page.tsx`, `overview/Sections.tsx`, `StatsGrids.tsx` | partial |
| U04-services-list-cli | `MisServicios.dc.html`, `Servicios Cards Spec` | `dashboard/services/_components/ServicesListView.tsx` | partial |
| U05-service-detail-cli | `ServicioDetalle.dc.html` | `_shared/services/ServiceDetailLayout.tsx`, `[id]/dns`, `[id]/audit` | partial |
| U06-domains-search | `BuscadorDominios.dc.html` | `dashboard/store/_components/DomainSearch.tsx`, `DomainStoreTabs.tsx` | partial |
| U07-domain-detail-cli | `DominioDetalle.dc.html` | `dashboard/domains/[id]/`, `_shared/services/dns/` | partial |
| U08-store | `Tienda.dc.html` | `dashboard/store/_components/StoreView.tsx`, `StoreHeader.tsx` | partial |
| U09-store-configure | `TiendaConfigurar.dc.html` | `dashboard/store/[slug]/_components/ProductConfig.tsx` | partial |
| U10-cart-confirm | Confirmar.dc.html | frontend/app/dashboard/store/cart/page.tsx · _components/CartView.tsx · _shared/cart/{useCart,_actions}.ts · _shared/billing/checkout/StepConfirm.tsx · dashboard/billing/[id]/page.tsx | partial |
| U11-billing-cli | `Facturas.dc.html`, `Facturacion.dc.html` | `dashboard/billing/`, `billing/[id]/`, `checkout/` | partial |
| U12-profile-cli | `Perfil.dc.html` | `_shared/account/AccountView.tsx`, `SecurityPanel.tsx`, `BillingProfilesPanel.tsx` | partial |
| U13-notifications-cli | `Notificaciones.dc.html` | (solo `_shared/shell/NotificationBell.tsx`) | partial / **mockup-orphan página** |
| U14-support-cli | `Soporte.dc.html` | `dashboard/support/`, `_shared/support/` | partial |
| U15-support-inside-cli | SupportInside.dc.html | frontend/app/dashboard/support-inside/{page.tsx,page.module.css,_actions.ts} · lib/api.ts:1300-1330 · _shared/tasks/MaintenanceLogModal.tsx | partial |
| U16-transparency | `Transparencia.dc.html` | `dashboard/transparency/page.tsx` | partial |
| U17-chat-widget | `ChatWidget.dc.html` | `components/SupportPanel/` (vivo) + `components/ChatWidget/` (huérfano) | partial |
| U18-brand | `Logotipo.dc.html`, `LogotipoAnimado.dc.html` | `public/brand/*.svg`, `AuthLayout.tsx`, sidebars (letra 'A') | partial |
| U19-shell-adm | `admin/Shell.dc.html` | `admin/AdminSidebar.tsx`, `_shared/shell/Topbar.tsx` | partial |
| U20-overview-adm | `admin/Inicio.dc.html` | `admin/page.tsx`, `_shared/widgets/TasksWidget.tsx` | partial |
| U21-clients-list | `admin/Clientes.dc.html` | `admin/clients/_components/ClientsListView.tsx` | **matched** |
| U22-client-detail | `admin/ClienteDetalle.dc.html` | `admin/clients/[id]/` | partial |
| U23-services-list-adm | `admin/Servicios.dc.html` | `admin/services/_components/AdminServicesView.tsx` | partial |
| U24-service-detail-adm | `admin/ServicioDetalleAdmin`, `DominioDetalleAdmin` | `admin/services/[id]/`, `_shared/services/` | partial |
| U25-products-list | `admin/Productos.dc.html` | `admin/products/_components/ProductsListView.tsx` | **matched** |
| U26-product-detail | `admin/ProductoDetalle.dc.html` | `admin/products/[id]/` | **matched** |
| U27-product-form | `admin/ProductoForm.dc.html` | `admin/products/new/`, `[id]/edit/` | partial |
| U28-billing-adm | `admin/Facturacion`, `FacturaDetalle` | `admin/billing/`, `billing/[id]/` | partial |
| U29-plugins-adm | `admin/Plugins.dc.html` | `admin/settings/plugins/`, `_shared/plugins/` | partial |
| U30-settings-adm | Configuracion.dc.html | frontend/app/admin/settings/{page.tsx,_components/SettingsManager.tsx,LogoUploader.tsx} · admin/account-deletion/{page.tsx,DeletionRequestsManager.tsx} | partial |
| U31-notif-templates-adm | `NotificacionesAdmin`, `PlantillasNotif`, `PlantillaDetalleAdmin` | `admin/notifications/templates/` | partial / **mockup-orphan bandeja** |
| U32-support-inbox-adm | `admin/BandejaTickets`, `TicketConversacion` | `admin/support/`, `_shared/support/conversation/` | partial |
| U33-chats-workspace-adm | `admin/ChatsWorkspace.dc.html` | `admin/support/chats/` | partial |
| U34-support-inside-adm | `admin/SupportInside`, `SupportInsideDetalleAdmin` | `admin/support-inside-plans/`, `[slug]/` | partial |
| U35-tasks-adm | `admin/Tareas`, `TareaDetalleAdmin` | `admin/tasks/page.tsx` | partial / **mockup-orphan detalle** |
| U36-ops-adm | `admin/JobsDLQ`, `ErrorLog` | `admin/jobs/failed/`, `admin/error-log/` | partial |
| U37-profile-adm | `admin/PerfilAdmin.dc.html` | `admin/profile/`, `_shared/account/` | partial |

Resumen: **3 matched · 34 partial · 0 mismatch · 3 mockup-orphans · 6 code-orphans** (ver Anexo §9).

---

## 4. Gap a nivel de DESIGN SYSTEM

El gap dominante no es de páginas: es de **tokens, primitivas y shell** compartidos. Esta capa, si se migra por página, se reimplementa N veces.

### 4.1 Componentes que faltan crear (primitivas ausentes que el diseño asume repetidamente)

| Primitiva | Evidencia mockup | Unidades que la piden | Severidad |
|---|---|---|---|
| **Toggle / Switch** (track+knob, ~42×24) | rol switch, auto-renovación, notif perfil, consentimiento, plantilla, plugin | U06, U07, U12, U16, U19, U29, U31, U34, U37 (≥8) | alta |
| **IconWell** (cuadrado tintado + icono semántico por tono) | headers de card, filas notif, decision rows, timeline | U02, U03, U05, U13, U20, U22, U24, U26, U27, U28, U34, U35 (≥12) | alta |
| **BrandMark** (isotipo bicolor dos rombos SVG) | sidebar/auth/favicon | U18, U02, U19 | alta |
| **Timeline / ActivityRow** (avatar/icon-well + texto + meta + conector) | auditoría servicio/cliente, billing, tasks, Support Inside, overview | U03, U05, U24, U28, U34, U35, U37 | media |
| **NotificationRow** (fila rica: icon-well + título + tag + body + CTA + dot, 5 tonos) | página de notificaciones | U13, U31 | media |
| **Hero/Banner de marca azul** (full-width con persona/CTA) | Support Inside, técnico, asesor Luis | U03, U08, U14 | media |
| **Pricing card** (features con check + badge "Recomendado" flotante) | catálogo y planes | U08, U09 | media |
| **OrderSummary sticky** (resumen + desglose IVA) | checkout, billing | U09, U11 | media |
| **SegmentedControl** (pista + knob deslizante) | tabs Por nombre/Con IA, prioridad SI, ciclo | U06, U09, U34 | baja |
| **Fila expandible / acordeón** (Table no lo soporta) | DLQ, error log | U36 | media |
| **OTP input** (6 casillas), **PasswordStrength meter** (4 barras), **PaymentMethodCard**, **ColorPicker**, **Stepper/Checklist** | login, perfil, checkout, SI, onboarding | U01, U12, U37, U11, U34, U03 | baja |

### 4.2 Componentes reales sin diseño (code-only) — NO migrar a partir del mockup

`HelpTip` (ⓘ ayuda contextual cliente), `CopyableId` (UUID + copy), `PortalBadge`, `DangerZone` (materialización canónica de D5), `NoPermission` (PBAC), `EditorSectionCard` (forms con dirty-tracking por sección, ADR-075), `GradientMesh` (aurora animada en canvas). Son enriquecimiento funcional o doctrina del DS; el mockup debería **absorberlos**, no al revés.

**Caso doctrinal — StatusTabs vs StatsCards (D10):** varios mockups (billing, client-detail, plugins, overview) ponen StatsCards fuera de Overview. El código respeta D10 (rules.md:521: "StatsCards solo en Overview"). **Aquí el mockup diverge de la regla canónica; el código es el correcto.**

### 4.3 Divergencias de tokens (mockup vs real)

| Token | Mockup | Código (`globals.css`) | Severidad | Acción |
|---|---|---|---|---|
| Azul del logo | `#3B82F6` + rombo `#93C5FD/#BFDBFE` | UI `--brand=#3B82F6` OK, pero SVG en `public/brand` usan `#4b77bb` monocromo | alta | Reexportar SVG a marca |
| `#635BFF` (Stripe, prohibido) | no usar | hardcodeado en 4 ficheros, renderizado | alta | Sustituir por `var(--brand)` |
| Tokens inexistentes | n/a | `--brand-600`, `--border-subtle`, `--text-link`, bare `--surface`, `--primary` referenciados en 12+ ficheros | alta | **BUG**: definir alias o migrar a canónicos |
| Texto primario | `#0F172A` (slate) | `--text-primary=#0A0A0B` (near-black) | media | Decisión sistémica slate vs neutro |
| Texto secundario/terciario | `#64748B / #94A3B8` (slate) | `--text-secondary=#6B7280 / --text-tertiary=#9CA3AF` (gray) | media | Mismo eje slate-vs-gray |
| Bordes | `#E2E8F0` (slate-200 opaco) | `--border=rgba(0,0,0,.06)` (alfa) | media | Define carácter de toda card/input |
| Radio de card | 16px (18px grandes) | `--radius-md=12px` | media | Subir Card a `--radius-lg` o escala intermedia |
| Forma de Badge/chip | pill `9999px` | `--radius-sm=8px` (rectángulo) | media | Cambio sistémico de forma |
| Peso de Badge/celda/heading | 600-700 | `--font-weight-medium=500` | media | Subir pesos |
| H1 página | 26-28px / 700 / `-0.02em` | `--font-size-xl=24` o `2xl=32` sin tracking | media | Falta token de tamaño 26-28 + tracking |
| Verde/ámbar de chip | textos oscuros saturados `#0E8C5F` / `#B27A12` | derivados de `--success`/`--warning` brillantes | media | Revisar contraste/tono |
| Mono (DNS/importes) | `DM Mono` + `tabular-nums` | `--font-mono` genérico, sin tabular-nums | baja | Cargar DM Mono + tabular-nums |

### 4.4 Deltas de shell / layout

| Área | Mockup | Código | Severidad |
|---|---|---|---|
| Logo del shell | isotipo bicolor doble-rombo + wordmark | cuadrado con letra 'A' (`Sidebar.tsx:189`, `AdminSidebar.tsx:294`); admin con gradiente `#635BFF` | alta |
| Topbar height | 64px | `--topbar-height=56px` pero `Topbar.module.css` fuerza `height:64px !important` | media |
| Sidebar background | `#F8FAFF` (azul tenue) | `--surface-primary=#FFFFFF` / bare `--surface` (inexistente) | media |
| Toggle de colapso | topbar (A) / cabecera (B) / borde flotante (C) — nunca footer | botón full-width en el **footer** del sidebar (lo que el spec busca eliminar) | media |
| Footer del sidebar | tarjeta soporte "Luis Ferrer" (cliente) / "Chat en vivo" (admin) | solo el botón de colapso; soporte movido a topbar | media |
| Topbar izquierda | breadcrumbs/título contextual | sin breadcrumb; aloja hamburguesa móvil + Cmd+K | media |
| Topbar acciones admin | `[⌘K][Tareas][Notif] | divisor | [pill perfil con borde+chevron]` | Cmd+K a la izquierda; sin icono Tareas, sin divisor, pill sin borde/chevron | media |
| Item nav activo | variante "Tarjeta" (bg blanco + ring azul) | tinte plano `--brand-light`, sin ring | media |
| Stroke iconos | 1.6 (1.7 login/perfil) | 1.5 | baja |

### 4.5 Divergencias de marca

El **documento de marca existe** (`docs/40-reference/aelium-documento-de-marca.md`, v1.6) y **coincide con los mockups** (color `#3B82F6`, wordmark "aelium" DM Sans minúscula, isotipo de dos rombos bicolor, eslogan). La divergencia es **mockup/doc ↔ SVG reales ↔ UI implementada**:

- Los 3 SVG en `public/brand/` usan **`#4b77bb` monocromo** (azul grisáceo) con geometría tipo flecha/reloj de arena, **no** los dos rombos redondeados bicolor del doc. `logo-blue-black.svg` no tiene tinta negra (nombre engañoso).
- La UI viva **ni usa el isotipo**: sidebars pintan un cuadrado con 'A'. Solo `AuthLayout.tsx` incrusta un SVG.
- El **logo animado** (6 variantes en `LogotipoAnimado.dc.html`) **no existe en código** (grep `aelm*`/`rombo`/`diamond` → 0). No hay loader/favicon de marca.
- Conviven **dos azules en pantalla**: UI `#3B82F6` vs logo SVG `#4b77bb`. Causa raíz de la deuda de marca.

---

## 5. Gap por página (por área)

Notación: impacto (alto/medio/bajo), **¿bk?** = needsBackend (S/N).

### ÁREA: AUTH

**U01 — Autenticación (login/registro/recuperar/reset/verify)** · partial · esfuerzo **L**

| Falta en código | Impacto | ¿bk? |
|---|---|---|
| Panel lateral con 3 value props + titular de marca | alto | N |
| Registro: selector tipo cuenta (Personal/Autónomo/Empresa) + campos fiscales condicionales + IVA por país | alto | **S** |
| Registro: teléfono, checkbox de términos | alto/medio | S/N |
| 2FA: 6 casillas OTP con auto-avance; "Reenviar código" | medio | N/S |
| Login: pantalla éxito intermedia; banner "Cuenta bloqueada" | bajo/medio | N |

| Solo en código | Impacto |
|---|---|
| `GradientMesh` aurora canvas (vs gradiente azul estático del mockup) | medio |
| brand card glassmorphism; reenvío verificación inline; guards de sesión/rol server-side; framer-motion | bajo-medio |

Layout: split-screen con ratios fijos `55fr/45fr` (>1024px) vs flex elástico; panel izquierdo `display:none` <1024px. Reuse: inputs/botones son CSS module local, **no** `components/ui/Button|Input` → `adaptar`. OTP y checkbox términos → `nuevo`. **El grueso del esfuerzo es el Registro** (amplía contrato `registerAction`, `auth-actions.ts:336`, y endpoint `/auth/register`).

### ÁREA: SHELL

**U02 — Shell cliente** · partial · **L** · **U19 — Shell admin** · partial · **L**

| Falta en código (cliente + admin) | Impacto | ¿bk? |
|---|---|---|
| Breadcrumbs/título en topbar (el `Breadcrumb` del DS existe pero no se usa ahí) | alto | N |
| Tarjeta soporte "Luis Ferrer" (cli) / "Chat en vivo" + ping (adm) en footer sidebar | alto/medio | S (presencia) |
| Logo isotipo doble-rombo bicolor animado | medio | N |
| Reubicar toggle de colapso (footer → B/C); icon-wells por tono en notif | medio/bajo | N |
| Popover de Tareas en topbar admin + divisor + pill perfil con borde/chevron | alto | S |
| Pools de búsqueda de entidades en ⌘K (admin) | medio | S |

| Solo en código | Impacto |
|---|---|
| ⌘K CommandPalette; botón Soporte topbar con popover de canales; drawer móvil; nav role-aware PBAC; notif reales con Server Actions + polling; guards de rol | alto-medio |

Visual: `#635BFF` en `NotificationBell.module.css` (`.dot`, `.itemUnread`, fallback `--text-link`); bg sidebar `#F8FAFF` no aplicado; gradiente admin `#635BFF→#8B5CF6` (prohibido). Decisiones de UX abiertas (variante de toggle, soporte sidebar vs topbar) requieren cerrar vía UI_SPEC/ADR.

### ÁREA: CLIENTE

**U03 — Inicio/Overview cliente** · partial · **XL**

| Falta en código | Impacto | ¿bk? |
|---|---|---|
| Estado onboarding "primer día" (hero técnico + checklist) | alto | **S** |
| Card "Tu presencia digital" (dominio/SSL/incidencias — no en contrato `ClientOverview` api.ts:655-670) | alto | **S** |
| Feed "Lo que Aelium hace por ti" (timeline inline) | alto | **S** |
| Hero "Support Inside" full-width con Meter + chips + gestión | alto | N |

Solo en código: multiplexación por rol (admin/client/agent/partner en `page.tsx:71`), sección Alertas (`buildAlerts`), Accesos rápidos, HelpTip. El mockup contradice **D10** (no usa StatsCards sino cards cualitativas) → decisión de diseño.

**U04 — Mis Servicios (lista)** · partial · **L**

| Falta en código | Impacto | ¿bk? |
|---|---|---|
| CTA "Contratar servicio" en header; agrupación por categoría con contadores | alto | N |
| Metadata renovación/auto-renovación (no en `ServiceListItem` api.ts:1550-1568); banner salud global | medio | **S** |
| Menú ⋯ por fila; acciones inline (SSO/DNS); estado en lenguaje claro | medio/bajo | N |

**Conflicto mockup-mockup:** `MisServicios.dc.html` (gauges+botones-azules) vs `Servicios Cards Spec` que **lo repudia** (:57-59). Decidir doctrina (gana el spec, alineado UI_SPEC §2.4). Bug: `var(--brand-600)` en `ServicesListView.tsx:103`.

**U05 — Detalle servicio cliente** · partial · **L**

| Falta en código | Impacto | ¿bk? |
|---|---|---|
| Tab "Cuidado por Aelium" (mantenimiento gestionado, slots, checklist, revisor — no existe, grep 0) | alto | **S** |
| Tab "Plan y facturación" dedicada con narrativa de renovación | medio | N |
| Strip metadata header (Estado real/Auto-renovación/pill cuidado) | medio | **S** |
| Timeline enriquecido; CTA "Visitar sitio"; "Pausar servicio" | medio/bajo | N/S |

Solo en código (más rico que el mockup): página DNS CRUD dedicada, página auditoría con cursor, cambio de plan con prorrateo (ADR-029), banners terminal/suspendido/drift, capability-gating ADR-070/077. **El TAB_ORDER (summary/notes/audit) está frozen** → introducir tabs nuevas requiere ADR.

**U06 — Buscador de dominios** · partial · **XL**

| Falta en código | Impacto | ¿bk? |
|---|---|---|
| Modo "Con IA" (descripción de negocio) + regeneración | alto | **S** |
| Config avanzada (chips TLD + presets); bundle de marca con descuento | alto | S |
| Precio de renovación + warning "Sube al renovar" (no en `types.ts:17-28`) | alto | **S** |
| Toggle "Solo disponibles", sort, recomendación/pills | medio | N/S |

Solo en código: búsqueda bulk multi-nombre, estados Premium/error. Drift: `var(--border-subtle)` (4 sitios) y `var(--brand-600)` (StoreHeader:53) inexistentes. Esencialmente una **reescritura del buscador**.

**U07 — Detalle dominio cliente** · partial · **L**

| Falta en código | Impacto | ¿bk? |
|---|---|---|
| Zona DNS CRUD embebida (existe en `/services/[id]/dns`, no enlazada aquí) | alto | N |
| Header card rico (icon-well + chip estado + meta inline) | alto | N |
| "Renovar ahora"; toggle auto-renovación (campo existe sin usar, api.ts:1773) | medio | **S** |

Solo en código: `DomainTransferPanel` (transfer-in FSM), recovery hints, NS editables, privacidad WHOIS, DNSSEC/proxy, validación por tipo. **La pieza DNS es reusable** (`DnsRecordsManager`); el trabajo es integración + algo de backend.

**U08 — Tienda (catálogo)** · partial · **L**

| Falta en código | Impacto | ¿bk? |
|---|---|---|
| Agrupación por categorías (Hosting/Dominios/SI); features con check; recomendado destacado | alto | N |
| Banner asesor "Hablar con Luis"; sección Support Inside con plan actual | medio/alto | S |

Solo en código: sub-nav Productos/Dominios, ficha config `/store/[slug]`, purchase-context, transferencia, carrito persistente. Bug `var(--brand-600)` (StoreHeader:53). `Product.features` existe en el tipo pero no se renderiza.

**U09 — Configurar producto** · partial · **L**

| Falta en código | Impacto | ¿bk? |
|---|---|---|
| Layout 2-col con panel "Resumen del pedido" sticky + desglose IVA 21% | alto | N |
| Upsell Support Inside como add-on (CartItem no lo modela) | alto | **S** |
| Stepper 4 pasos; 3ª opción dominio "registrar nuevo" inline | medio | N |

Solo en código: purchase-context (owns/at-limit), validación regex de dominio, setup fee, ciclos dinámicos. El "IVA incluido" y "Dominio incluido" implican lógica de desglose backend.

**U10 — Carrito / Confirmar pedido (checkout)** · partial · esfuerzo **XL**

El mockup describe un flujo de 3 fases (review 2-col sticky → procesando → done con timeline) muy por encima del `CartView` actual (lista plana + total + AlertBanner de éxito). Conviven además **dos confirm** en código —`CartView` (carrito unificado, Sprint 15D) y `StepConfirm` (legacy de 4 pasos)— y el mockup mezcla rasgos de ambos; decidir el flujo canónico es trabajo previo no trivial.

Falta en código:

| Item | Impacto | ¿bk? |
| --- | --- | --- |
| Sticky OrderSummary (resumen lateral, grid 1.6fr/1fr, `position:sticky top:80px`) | alto | no |
| Desglose fiscal: Base imponible + IVA (21%) + Total hoy | alto | sí |
| Tarjeta de método de pago (Visa ···· 4242 vía Stripe) | alto | sí |
| Pantalla de éxito rica: check animado + factura pagada + Timeline + CTAs | alto | sí |
| Estado intermedio 'Procesando tu pago' (spinner a pantalla completa) | medio | no |
| Tarjeta de perfil de facturación (con icono) en la confirmación | medio | no |
| Stepper horizontal de 4 pasos con checks | medio | no |
| Aviso 'factura completa válida para deducir IVA' (callout verde) | bajo | no |
| Banda de confianza 'Cuidado por Aelium desde el primer día' | bajo | no |
| Botón 'Volver a facturación' (back link) | bajo | no |

Solo en código:

| Item | Impacto |
| --- | --- |
| Manejo de transferencias de dominio (`deferBilling`) en resumen y CTA | alto |
| Quitar ítem por fila (carrito editable) | medio |
| Error de elegibilidad de registrante (`REGISTRANT_INELIGIBLE`) accionable | medio |
| Flujo legacy de checkout de 4 pasos (`StepConfirm` + `setup_fee`) | medio |
| Estado de carrito vacío (EmptyState con CTAs) | bajo |
| Estado de hidratación (Skeleton mientras se lee localStorage) | bajo |

Layout / visual / reuse: el mockup pasa de una columna (lista en Card + total al pie, CTA fuera de la Card) a un grid 2-col con resumen sticky y CTA dentro de la tarjeta; la pantalla de éxito reduce a `max-width:720px`. **Bug de tokens confirmado:** `CartView.tsx:186` usa `var(--border-default)` y `:282` `var(--border-subtle)`, ninguno definido en `globals.css` (solo existen `--border`/`--border-hover`/`--border-active`) → border shorthand inválido sin fallback, bordes no se pintan en runtime; corregir a `--border`. El `--brand` (#3B82F6) ya coincide. **Riesgo DS:** el mockup muestra el púrpura Stripe #635BFF (`:110`), prohibido por el DS; la integración de pago debe respetar el azul de marca, no copiarlo. Reuse: Card/Button/Badge/AlertBanner encajan directo; son nuevos OrderSummary sticky, PaymentMethodCard, Timeline e IconWell; el stepper de `checkout.module.css` se adapta.

**U11 — Facturación cliente** · partial · **XL**

| Falta en código | Impacto | ¿bk? |
|---|---|---|
| Banner factura pendiente/vencida + CTA Pagar; **pago Stripe desde UI** | alto | **S** |
| Selector método de pago (Tarjeta/SEPA); fila expandible; 3 stat cards | alto/medio | **S**/N |

Solo en código: **página de detalle `/billing/[id]` ya construida y sólida** (el mockup la resuelve como expand inline — decisión de arquitectura), search + paginación, descarga PDF pre-firmada, HelpTip. **Stripe no existe** (verificado: 0 resultados; el propio código lo marca "futuro", support-inside/page.tsx:130). **Bloqueante.**

**U12 — Perfil cliente** · partial · **XL**

| Falta en código | Impacto | ¿bk? |
|---|---|---|
| Métodos de pago (Stripe + SetupIntent); Tu negocio; Notificaciones (toggles) | alto/medio | **S** |
| Identity card; edición inline ver/editar; teléfono; reenvío verificación email | medio | N/S |
| Password-strength meter; selector tipo perfil con campos condicionales + IVA | bajo/medio | N |

Solo en código: 2FA opt-in con modal, Dominios/WHOIS (`RegistrantForm`, ADR-081), idioma/TZ, variante staff. **El mockup es incompleto, no fuente de verdad** (omite 2FA y WHOIS reales).

**U13 — Notificaciones cliente** · partial · **L** · **MOCKUP-ORPHAN (página)**

| Falta en código | Impacto | ¿bk? |
|---|---|---|
| **Página `/dashboard/notifications` completa** (no existe ruta — verificado) | alto | N |
| Tabs Todas/No leídas; chips de categoría (no en modelo `Notification`); icon-well por tono; CTA contextual | alto/medio | **S** (taxonomía) |
| Agrupación temporal; empty state rico | medio | N |

Solo en código: popover NotificationBell con polling, **endpoint paginado `notificationsApi.list` existente pero sin consumir** (api.ts:810). El endpoint está listo y huérfano; la taxonomía categoría/tono requiere migración Prisma o derivación. Bug `#635BFF` en el bell.

**U14 — Soporte cliente** · partial · **L**

| Falta en código | Impacto | ¿bk? |
|---|---|---|
| Brand hero con técnico asignado; selector multi-canal (Chat/WhatsApp/Llamada) | alto | **S** |
| Tira SLA + servicio vinculado en detalle (badge SI hoy `&& isAdmin`); refs de servicio en mensaje | alto/medio | **S** |
| Campo "Servicio relacionado" en alta; variante ticket-block en hilo | medio | S/N |

Solo en código: search server-side, paginación, WS tiempo real, lock-states, modal de resolución, banner de escalado. **Más robusto que el mockup.**

**U15 — Support Inside cliente (planes de soporte premium)** · partial · esfuerzo **XL**

La página actual cubre el esqueleto funcional (comparador, asignar/liberar slot por `slot_type`, cancelar, ciclo, checkout ADR-076, empty states, skeletons), pero el mockup eleva la UX a un producto narrativo completo. Tres bloques de alto impacto —técnico asignado, historial de mantenimientos y value-stats— requieren ampliar el contrato del backend.

Falta en código:

| Item | Impacto | ¿bk? |
| --- | --- | --- |
| Plan Hero — tarjeta bicolor con gradiente brand + KPIs del plan | alto | no |
| Técnico asignado con identidad (avatar + nombre + presencia) | alto | sí |
| Slot cards ricas (última/próxima revisión + estado 'Mantenido') | alto | sí |
| Sección 'Tus canales de contacto' (grid de cards con estado) | alto | sí¹ |
| Sección 'El valor que te aporta' — StatsCards + timeline de mantenimientos | alto | sí |
| Modal 'Detalle de mantenimiento' (historial mensual con tareas) | alto | sí |
| Comparador persistente también en vista de gestión (upsell) | alto | no |
| CTA 'Asignar un slot' como card vacía dashed inline en el grid | medio | no |
| Upsell 'Has usado todos tus slots' (card cuando slots llenos) | medio | no |
| Hero no-plan (intro de adquisición con beneficios) | medio | no |
| Nota informativa bajo el comparador (precio claro / WhatsApp soon) | bajo | no |
| Botón header 'Mejorar mi plan' (scroll al comparador) | bajo | no |
| Danger zone como banda dedicada de cancelación | bajo | no |
| Modal asignar slot con selección visual (cards radio) en vez de Select | bajo | no |

¹ La sección de canales en sí es presentacional (`needsBackend:false` en el dato), pero el estado por canal en vivo no está modelado hoy.

Solo en código:

| Item | Impacto |
| --- | --- |
| Selector de tipo de slot (`maintenance` vs `maintenance_management`) | medio |
| Empty states ricos ('sin planes', 'sin servicios elegibles' por tipo de producto) | medio |
| Datos de slot extra y precio por slot adicional (`is_extra`/`extra_slot_price`) | medio |
| Checkout unificado real (redirige a `/billing/checkout` con `product_pricing_id`) | bajo |
| Sección lateral 'Estado' + '¿Necesitas ayuda?' (aside 2fr/1fr) | bajo |
| Estado de carga con Skeletons | bajo |

Layout / visual / reuse: el mockup adopta una sola columna vertical (hero bicolor → slots en grid auto-fill → canales en grid → valor → comparador → danger zone), frente al layout 2-col (`grid 2fr/1fr`) del código con aside. Los gradientes del hero coinciden exactamente con `--brand`/`--brand-hover` reales. **Riesgo D10 confirmado** (`rules.md:514-521`, 'StatsCards solo en Overview'): esta página no es Overview; usar Meter/DescriptionList (ambos en `ui/`) o tramitar ADR antes de meter StatsCard. El verde de éxito #0E8C5F es más oscuro que `--success` (#10B981) → mapear a `--success`/`--success-light`; el ámbar #B27A12 ya tiene tokens (`--warning`/`--warning-dark`/`--warning-light`). Reuse: plan cards / Modal / AlertBanner / DangerZone directo; son nuevos Timeline/ActivityRow, IconWell y RadioCard; Avatar y el segmented toggle se adaptan.

**U16 — Transparencia (RGPD)** · partial · **L**

| Falta en código | Impacto | ¿bk? |
|---|---|---|
| Navegación 4 tabs; catálogo de categorías de datos (finalidad/base legal/retención) | alto | N |
| Panel Preferencias con toggles de consentimiento; derechos RGPD en grid; export CSV | alto/medio/bajo | **S** (consentimiento) / N (CSV) |
| Modal de borrado (vs `window.confirm`); avatares/badges en log | medio | N |

**Bugs verificados:** `var(--surface)` sin fallback (background indefinido) y `var(--primary,#635BFF)` (token inexistente → púrpura prohibido) en `page.tsx`. El mockup viola §2.8 (`max-width:1060px` inline). Consentimiento = pieza más cara (endpoint + Toggle nuevo).

### ÁREA: ADMIN

**U20 — Overview admin** · partial · **XL**

| Falta en código | Impacto | ¿bk? |
|---|---|---|
| Greeting + eyebrow fecha (lógica greeting existe en `dashboard/page.tsx:28-43`) | medio | N |
| 4 KPIs clicables (parte ya en `AdminOverview` api.ts:644-653); delta MoM; SLA soporte | alto | **S** |
| Sección "Requiere tu decisión" (feed de señales cross-módulo: 5xx, DLQ, drift, SI sin mantenimiento) | alto | **S** |
| Sección "Carga del equipo" (tickets por agente + saturación + presencia) | alto | **S** |

Solo en código: `TasksWidget` ("Tu trabajo de hoy"), cards navegación error-log/DLQ. La home real es un toolbox; el mockup pide dashboard ejecutivo (~8-10 agregaciones net-new). D10 aplica (es Overview, legítimo).

**U21 — Clientes (lista)** · **matched** · **S**

| Falta en código | Impacto | ¿bk? |
|---|---|---|
| Botón "Exportar" en cabecera; filtro "Tipo" (DTO solo tiene status) | medio | **S** |
| Avatar pastel; columna Registro alineada derecha | bajo | N |

Solo en código: error silencioso, navegación a `[id]` real, indeterminate checkbox, URL state. Reuse casi total (Table/Badge/Pagination/BulkActionBar). **Plantilla de referencia.**

**U22 — Detalle de cliente** · partial · **L**

| Falta en código | Impacto | ¿bk? |
|---|---|---|
| Tab "Servicios" (tabla + hero SI + barra slots); menú ⋯ (Contratar/Suspender/Eliminar) | alto | **S** |
| 4 stat-cards + banner "Requiere atención" en Resumen (choca con D10) | medio | **S** |
| Botón "Editar"; contadores agregados | medio/bajo | S |

Solo en código: lazy-load per-tab, deep-link `?tab=`, filtros de notas ricos (8 cat/6 sistemas), `ExceptionalNoteModal`, `ContextBackLink`. **Notas supera al mockup.** Avatar `lg=56px` == mockup (no es delta).

**U23 — Servicios admin (lista)** · partial · **L**

| Falta en código | Impacto | ¿bk? |
|---|---|---|
| StatusTabs con counts + tab Incidencias; columna Cliente (nombre, no `user_id`); Uso (Meter); Renueva | alto/medio | **S** |
| Flags Drift/Desync inline; icono de tipo; chip proveedor color; menú ⋯ | alto/bajo | S/N |

`ServiceListItem` no expone nombre cliente, renovación, uso ni sync (existen en `ServiceInfo` del detalle). Reconcile-all existe **per-plugin**, no global desde lista. El mockup usa "paused" que no está en el enum canónico.

**U24 — Detalle servicio/dominio admin** · partial · **M**

| Falta en código | Impacto | ¿bk? |
|---|---|---|
| Controles de dominio en admin (NS/lock/WHOIS/EPP — solo en ruta cliente, grep `/admin`=0) | alto | N |
| Card DNS resumida; editor de notas internas (hoy read-only); timeline con icon-wells | medio | S |

**El grueso ya está MATCHED** (header, recursos, SSL, apps, datos técnicos, banners, página DNS full-CRUD, auditoría, modales). No hay `/admin/domains/[id]`: el dominio es un servicio `product_type=domain` en la plantilla única.

**U25 — Productos (lista)** · **matched** · **S**

| Falta en código | Impacto | ¿bk? |
|---|---|---|
| Búsqueda en vivo (spinner ya existe en SearchInput, falta debounce); icono ojo en bulk; subtítulo dinámico; col Servicios a la derecha | medio/bajo | N |

Solo en código: paginación/toggle/bulk **reales** con conteo. Constante huérfana `STATUS_STYLES` (hex fuera de marca, 0 usos). La tabla del DS no tiene card-chrome (border/radius/shadow) que el mockup sí dibuja.

**U26 — Detalle de producto** · **matched** · **S**

| Falta en código | Impacto | ¿bk? |
|---|---|---|
| Icon-well de tipo en header; menú kebab (Desactivar/Duplicar/Eliminar) para cumplir D2/D5; "Duplicar"; "Editar→" en planes; margen TLD verde | medio/bajo | S (duplicar) / N |

Solo en código: edición inline de precio por TLD (override/revertir), guard "no eliminar con servicios", modal de borrado, redirect SI. **Más rico que el mockup.**

**U27 — Formulario producto** · partial · **M**

| Falta en código | Impacto | ¿bk? |
|---|---|---|
| Icon-well + iconos en tarjetas de tipo (`constants.icon` vacío); barra de acciones en cabecera (FormPage las fija al pie); banner info gris vs azul | medio/bajo | N |

Solo en código: sub-form `@rjsf/core` schema-driven, select de provisioner desde plugins reales, modal de borrado, gating SI (ADR-075). **Schema-driven supera al mockup.** Mover acciones a cabecera choca con FormPage del DS.

**U28 — Facturación admin** · partial · **L**

| Falta en código | Impacto | ¿bk? |
|---|---|---|
| Banner de dunning; **timeline "Historial de pagos"** (no hay Timeline en DS); fila "Pendiente de cobro" | alto/medio | **S** |
| Filtro periodo; Exportar; tabs en detalle; avatares; tab Borradores (`draft_count` ya existe) | medio/bajo | S/N |

Solo en código: CTA checkout, badge Manual, cols Setup/Descuento, card Notas, banner por cliente. Dunning/pagos = backend nuevo (hoy solo `retry_count/max_retries`). Avatar/Tabs/Dropdown ya existen.

**U29 — Plugins (lista + detalle)** · partial · **L**

| Falta en código | Impacto | ¿bk? |
|---|---|---|
| Barra sticky "Cambios sin guardar" + dirty-tracking (refactor del form); Toggle switch (no existe en DS) | alto/medio | N |
| Latencia p50/p99 + "Errores 24h" (DTO no los expone); avatar de marca por plugin | medio | **S** |
| Chips de drift coloreados + "Corregido"; máscara de secretos con Editar/Cancelar | medio | N |

Solo en código: form rjsf schema-driven, RBAC superadmin, capability gating reconcile-one, estados error/empty. Emojis `↻/⏳/✓/✗` violan D1.

**U30 — Configuración admin (+ borrado de cuentas)** · partial · esfuerzo **L**

El mockup reorganiza los settings en un rail navegable por 5 categorías fijas con stepper, save bar global y secciones ricas (Legal/RGPD, Integraciones), mientras el código real renderiza un catálogo dinámico dirigido por backend en columna única. La página de borrado de cuentas ya existe y es sólida, pero el mockup no la cubre.

Falta en código:

| Item | Impacto | ¿bk? |
| --- | --- | --- |
| Rail de navegación lateral por categorías (sticky, 228px, 5 categorías) | alto | no |
| Sección Legal y RGPD: subprocesadores + editor de documentos legales | alto | sí |
| Sección Integraciones: estado de salud (circuit breaker) de plugins | medio | sí |
| Stepper numérico (botones −/+ con input central) | medio | no |
| Sticky save bar global con contador de cambios y 'Descartar' | medio | no |
| Indicadores de 'Modificado' (dirty) por fila y por categoría | bajo | no |
| Header de sección con icono en well + título + descripción | bajo | no |
| Badge de permiso 'Solo superadmin · permiso Setting' en el header | bajo | no |
| Toast de confirmación ('Configuración guardada') | bajo | no |

Solo en código:

| Item | Impacto |
| --- | --- |
| Sub-página de borrado de cuentas (RGPD / derecho al olvido) — huérfana | alto |
| Sección 'Marca' con uploader de logo (`LogoUploader`, multipart a MinIO) | medio |
| Campos genéricos color / boolean / enum / string[] | medio |
| Catálogo de settings dirigido por backend (grupos dinámicos) | medio |
| Enlace a 'Registro de errores' (`system.error`) | bajo |

Layout / visual / reuse: el mockup pasa de columna única apilada (Card de enlaces + una Card por grupo, todos visibles) a un grid 2-col con rail sticky y solo la sección activa visible; el guardado migra de un botón 'Guardar' por grupo a una save bar global oscura (#0F172A) con contador agregado. **Bug de token confirmado:** `DeletionRequestsManager.tsx:75,89` y `LogoUploader.tsx:74` usan `var(--surface)` bare, y `LogoUploader.tsx:75` `var(--surface-2, var(--surface))`; ninguno existe en `globals.css` (solo `--surface-primary/-secondary/-tertiary/-dark`) → resuelve a vacío/transparente, corregir a `--surface-primary`. **Riesgos de regla:** respetar D1 (sin emojis) y D10 (StatsCards solo en Overview) al añadir badges/salud, y D2 (una acción primaria por vista) con la save bar. Reuse: Card/SectionCard, Badge y Toast directo; el stepper y el IconWell son nuevos; la sticky save bar (BulkActionBar/AlertBanner), el rail (Tabs/StatusTabs), la tabla de subprocesadores (Table/DescriptionList) y los editores de documentos legales se adaptan. **Nota:** la página de borrado usa `window.prompt`/`window.confirm` para acciones destructivas irreversibles — patrón frágil, candidato a Modal/DangerZone.

**U31 — Notif admin + plantillas** · partial · **XL** · **MOCKUP-ORPHAN (bandeja)**

| Falta en código | Impacto | ¿bk? |
|---|---|---|
| **Bandeja `/admin/notifications` completa** (no existe ruta — verificado) | alto | N |
| Plantillas como tabla + StatusTabs + chips canal/audiencia (`audience` no en modelo); switch inline; preview en vivo 2-col; chips de variables insertables; validación Handlebars en cliente | alto | **S** (audience) |

Solo en código: master-detail (lista + editor inline), filtro server-side, preview que persiste draft, catálogo controlado por código (sin creación, ADR-042/065). `#635BFF` en `TemplatesEditor.tsx:463`.

**U32 — Bandeja tickets + conversación** · partial · **XL**

| Falta en código | Impacto | ¿bk? |
|---|---|---|
| **Composer con tabs "Responder/Nota interna"** (ADR-079 §3.8 **lo eliminó**) | alto | N |
| **Sugerencia Aelium IA** (infra inexistente, grep 0); barra SLA en detalle (modelo nuevo) | alto | **S** |
| Filtros prioridad/agente; selección múltiple + BulkActionBar; SLA/SIN-1ª-respuesta/chip SI por fila | alto/medio | S |

Solo en código: tabs incl. "Cerradas", RBAC, manejo unificado chats+tickets, **bridge ticket↔task** (ADR-074/079), lock-states, modal de resolución con nota, WS. **Choque doctrinal frozen** (composer nota interna).

**U33 — Workspace de chats en vivo** · partial · **L**

| Falta en código | Impacto | ¿bk? |
|---|---|---|
| Panel "Respuestas guardadas" (macros); tarjeta "Sugerencia IA" | alto | **S** |
| Support Inside + Plan + Tickets previos en contexto; presencia online/unread/wait-time | medio | **S** |
| Modales Resolver (categoría) / Escalar (asunto+prioridad — la action **ya** acepta `subject?/priority?`, falta UI) | bajo/medio | S/N |

Solo en código: **WS tiempo real**, deep-link `?open=`, asignación de agente, banner escalado, lock terminal. **Más maduro que el mockup.**

**U34 — Support Inside admin** · partial · **L**

| Falta en código | Impacto | ¿bk? |
|---|---|---|
| **Mockup 2: detalle de instancia SI por cliente** (probablemente pertenece a `/admin/services`) | alto | **S** |
| Editor plan: input "Badge destacado" (existe en Detail, **no** en Patch); color del plan; auto-renovación/días gracia; segmented control prioridad | medio/bajo | **S**/N |

Solo en código: short_description, precio slot extra, comisión partner/visibilidad CTA, canal webchat, estado producto editable, guardado por sección con dirty-tracking. La sección 5 diverge totalmente en modelo de datos.

**U35 — Tareas admin** · partial · **XL** · **MOCKUP-ORPHAN (detalle)**

| Falta en código | Impacto | ¿bk? |
|---|---|---|
| **Página `/admin/tasks/[id]`** (no existe — doctrina "listado, no detalle" §3.6) | alto | N |
| Vista tabla; **CTA Nueva tarea + modal** (POST /tasks no existe, ADR-079 §1); búsqueda/filtros; bulk | alto/medio | **S** |
| Cancelar tarea (endpoint existe, cliente retirado); editar estado/prioridad libre; internal_notes (eliminado §3.8) | medio | N |

Solo en código: taxonomía por `source_system` (5 sistemas, ≠ "tipo" del mockup), agrupación en bloques, toggle scope, accionadores inline, `MaintenanceLogModal` con checklist auditable. **Choques doctrinales frozen múltiples.** Inversión D1: el código usa **emojis** (🎫🔧⚙️📞📁) y el mockup SVG.

**U36 — Ops: Jobs/DLQ + Error Log** · partial · **XL**

| Falta en código | Impacto | ¿bk? |
|---|---|---|
| Búsqueda libre (no en controllers); fila expandible (Table no lo soporta); stack trace/payload (persistidos, no en select/tipo) | alto | **S** |
| Bulk-retry/bulk-resolve; export CSV; reopen | alto/bajo | **S** |
| StatusTabs con counts; filtro módulo (backend lo soporta, UI no); empty states; AlertBanner permisos | medio | S/N |

Solo en código: PAGE_SIZE 50, `window.confirm` (debe ser Modal), error banner. Hex hardcodeado (`#DC2626`, etc.) y texto coloreado en vez de Badge/StatusDot (D1). Catálogo de colas hardcodeado divergente.

**U37 — Perfil admin** · partial · **L**

| Falta en código | Impacto | ¿bk? |
|---|---|---|
| Sección "Rol y permisos" (matriz de scopes); "Notificaciones del equipo" (toggles); "Tu actividad de acceso" (log) | alto/medio | **S** |
| Identity hero card; teléfono interno; password-strength meter; sesiones con icono/geo/"esta sesión" | medio/bajo | **S**/N |

Solo en código: tabs Cuenta/Seguridad, idioma/TZ, email read-only verificado, reutilización cliente/staff, 2FA con confirmación. Layout scroll+grid (mockup) vs tabs (código).

### ÁREA: COMPARTIDO

**U17 — Chat Widget / SupportPanel** · partial · **L**

| Falta en código | Impacto | ¿bk? |
|---|---|---|
| Header con avatar técnico + dot online; vista HOME bienvenida; items de conversación enriquecidos (icono/preview/hora) | alto/medio | S |
| Multicanal chat/WhatsApp/llamada en widget (modelo existe en `_shared/support`, no en payload del widget) | alto | **S** |
| Typing 3-dots; separadores de fecha; textarea autoexpandible | bajo | N |

Solo en código: **dos implementaciones** (SupportPanel vivo + ChatWidget flotante **huérfano**, 0 montajes), modo guest, **WS tiempo real**, escalación a ticket, RBAC, read receipts, ESC/scroll-lock. **Decidir consolidación** antes de invertir.

### ÁREA: MARCA

**U18 — Logotipo + logo animado** · partial · **M**

| Falta en código | Impacto | ¿bk? |
|---|---|---|
| Isotipo bicolor dos rombos (SVG monocromo `#4b77bb`); color de marca correcto en SVG; BrandMark en shells (hoy 'A') | alto | N |
| Variantes (reverso/negro real/app-icon); favicon; logo animado 6 variantes (no existe) | medio/bajo | N |

Coincidencia mockup↔doc de marca: **total**. La divergencia es doc/mockup ↔ SVG ↔ UI. `--brand` ya correcto en `globals.css:17`.

---

## 6. Hallazgos transversales / temas clave

1. **Deriva de tokens / DS:** mockups con hex literales (paleta slate) vs código con `var(--token)` gris-neutro. Tono distinto en casi todas las unidades. **Saneamiento previo obligatorio.**
2. **Bugs de token reales y verificados:** `#635BFF` (prohibido) en 4 ficheros renderizándose; 5 tokens inexistentes referenciados en 12+ ficheros → colores rotos hoy.
3. **El código tiene el esqueleto y la lógica** (rutas, server actions, RBAC/PBAC, WebSocket, paginación, estados): el gap es **presentación + features**, no arquitectura. 0 mismatch.
4. **Primitivas de DS ausentes** que el diseño asume repetidamente: Toggle/Switch (≥8), IconWell (≥12), Timeline/ActivityRow (≥6), SegmentedControl, password-strength, payment-selector, BrandMark.
5. **Iconografía incoherente y violaciones de D1:** emojis literales (🎫 ↻ ✓✓ ▪ ●) en tasks, plugins, ops, soporte; el mockup usa `<symbol>` SVG. Falta librería de iconos centralizada.
6. **Features nuevas con backend cross-módulo:** Stripe (pago/métodos/dunning), dashboard ejecutivo admin (8-10 agregaciones), Support Inside gestionado, búsqueda dominios con IA, SLA/IA/macros en soporte.
7. **Mockup-orphans:** notificaciones cliente, bandeja notificaciones admin, detalle de tarea → construcción greenfield consciente.
8. **Code-orphans:** páginas DNS dedicadas, detalle de factura como página, ChatWidget flotante huérfano, endpoint de notificaciones sin consumir → decisiones de consolidación, no deuda accidental.
9. **Choques doctrinales frozen** que requieren ADR/Amendment, no código: ADR-079 (tasks solo-lista, sin nota interna en composer), D10 (StatsCards solo en Overview), contrato ADR-070/077 del detalle de servicio.
10. **Patrón de layout recurrente:** el mockup prefiere single-page con grid asimétrico + cards ricas; el código usa tabs + ListPage/DetailPage + tablas planas. Romper estos patrones recablea paginación/empty/error.

---

## 7. Backlog priorizado

| # | Bloque | Área | Esf. | Impacto | Dependencias |
|---|---|---|---|---|---|
| 1 | **P0 — Saneamiento de tokens y bugs de DS** (`#635BFF`→brand; definir/migrar `--brand-600`, `--border-subtle`, `--surface`, `--primary`, `--text-link`) | transversal | S | alto | ninguna (prerrequisito de todo) |
| 2 | **P0 — Primitivas de DS faltantes** (Toggle, IconWell, Timeline/ActivityRow, SegmentedControl, password-strength, payment-selector, iconos SVG) | design-system | M | alto | #1 (fijar tokens antes) |
| 3 | **P0 — Sistema de marca** (isotipo bicolor + BrandMark en shells + variantes + favicon) | brand | M | alto | #1 |
| 4 | **P1 — Decisiones doctrinales previas (ADR/Amendment)** (tasks detalle/creación, composer nota interna, StatsCards fuera de Overview, toggle sidebar, expand vs página factura) | gobernanza | M | alto | ninguna (en paralelo, sin código) |
| 5 | **P1 — Shells cliente y admin** (breadcrumbs, reubicar toggle, tarjeta soporte/chat, popover Tareas, tokens shell) | shell | L | alto | #1, #2, #3 |
| 6 | **P1 — Integración Stripe** (pago factura, métodos guardados, dunning, timeline pagos) | client+admin | XL | alto | backend |
| 7 | **P1 — Dashboard ejecutivo admin** (~8-10 agregaciones cross-módulo) | admin | XL | alto | backend, #2 |
| 8 | **P2 — Support Inside / Cuidado gestionado** (slots, mantenimientos, checklist, revisor) | client+admin | XL | medio | backend, #2 |
| 9 | **P2 — Buscador de dominios rico** (IA + TLDs avanzado + bundle) | client | XL | medio | backend |
| 10 | **P2 — Soporte admin: SLA + IA + bulk + multicanal** | admin | XL | medio | #4 (ADR-079), backend |
| 11 | **P2 — Páginas de notificaciones** (cliente + admin, greenfield) | client+admin | L | medio | #2, backend (taxonomía) |
| 12 | **P2 — Ops: Jobs/DLQ + Error Log** (search, bulk, export, expand) | admin | XL | medio | backend, #2 |
| 13 | **P2 — Tasks admin** (tabla + detalle, tras ADR) | admin | XL | medio | #4 (ADR-079), backend |
| 14 | **P3 — Detalles cliente/servicio/dominio** (DNS consolidado, header cards, auto-renew) | client | L | medio | #2, backend parcial |
| 15 | **P3 — Plantillas de notificación** (tabla + chips + preview + variables) | admin | XL | medio | backend (audience), #2 |
| 16 | **P3 — Tienda y configuración de producto** (secciones, pricing cards, resumen sticky) | client | L | medio | #2, backend (add-on SI) |
| 17 | **P3 — Perfiles cliente y admin** (identity card, métodos pago, matriz permisos) | client+admin | L-XL | bajo | #6 (Stripe), backend |
| 18 | **P3 — Transparencia RGPD** (tabs, consentimiento, modal borrado) | client | L | bajo | #2 (Toggle), backend |
| 19 | **P4 — Pulido de matched/cercanas** (U21/U25/U26/U27/U24/U23) | admin | S | bajo | #1, #2 |

---

## 8. Readiness y recomendación de enfoque de migración

**Veredicto: PARCIALMENTE LISTO.** Migración viable y de bajo riesgo arquitectónico, pero **no ejecutable "tal cual"** sin trabajo previo de fundaciones y decisiones de producto.

**Señales positivas:**
- 0 unidades en mismatch; la base de código casi siempre supera al mockup en lógica → la migración es **reskin + adiciones, no reescritura**.
- El Design System existe y está maduro (Card, Button, Badge, Table, Modal, StatusTabs, ListPage/DetailPage/FormPage, AlertBanner, Meter, Avatar, BulkActionBar, Dropdown, Tabs).
- 3 unidades ya `matched` que sirven de plantilla de referencia.

**Riesgos/bloqueos:**
- **R1 — Deriva de tokens y bugs verificados** (`#635BFF`, 5 tokens inexistentes): debe sanearse ANTES de reskin o se propaga.
- **R2 — Primitivas ausentes** que el diseño asume en 8+ unidades; sin construirlas primero, cada unidad las reinventa.
- **R3 — Choques doctrinales con reglas frozen** (ADR-079, D10, contrato ADR-070/077): NO se resuelven con código, requieren ADR/Amendment y decisión de producto.
- **R4 — Backend cross-módulo pesado** (Stripe, dashboard ejecutivo, SLA, IA, Support Inside): sin estos endpoints, los CTAs del mockup son no-implementables.
- **R5 — Patrones de layout divergentes** (single-page grid vs ListPage/DetailPage/tablas): romperlos recablea paginación/empty/error.

### Recomendación: **SÍ, rediseñar components + layouts (y shell) PRIMERO. No big-bang por pantalla.**

El gap **no** es mayoritariamente página-específico: es transversal y se concentra en tres capas compartidas (tokens, primitivas, shell). Migrar página a página reimplementaría cada primitiva N veces con drift garantizado. Secuencia profesional:

- **FASE 0 — Fundaciones DS** (barata, transversal, desbloquea decenas de filas): (a) sanear deriva de tokens; (b) construir las primitivas faltantes; (c) cerrar el sistema de marca. **Componentes/primitivas ANTES que layouts; layouts ANTES que páginas.**
- **FASE 1 — Gobernanza** (en paralelo, sin código): cerrar por ADR/Amendment los choques frozen. **El ADR frozen gana sobre el mockup (lección L18).**
- **FASE 2 — Chrome:** migrar los dos shells (marco de todas las páginas).
- **FASE 3 — Verticales de backend de alto valor** (por feature, no por pantalla): Stripe, dashboard ejecutivo, Support Inside, buscador IA, SLA/IA en soporte.
- **FASE 4 — Reskin oportunista del resto:** migrar cada página al tocarla por trabajo de feature, en el mismo PR, empezando por las `matched` y las S/M.

**Reglas operativas:** respetar el DoD verde (typecheck + lint + test, boot smoke si se tocan módulos); una rama por (sub-)fase; citar reglas canónicas en commits. **NO** empezar por las XL de soporte/tasks/ops hasta cerrar F0+F1.

> El **PLAN de migración detallado** (secuenciación fina, asignación de unidades a sprints, contratos de endpoint, ADRs concretos) es el **paso siguiente** a este informe, no su alcance.

---

## 9. Anexo: huérfanos y supuestos/limitaciones

### Mockups sin código (mockup-orphans) — construir greenfield
- **U13** — `/dashboard/notifications` (página de notificaciones cliente). Verificado: no existe ruta; solo el popover del bell.
- **U31** — `/admin/notifications` (bandeja full-page admin). Verificado: no existe; solo el popover.
- **U35** — `/admin/tasks/[id]` (detalle de tarea). Verificado: `/admin/tasks` solo tiene `page.tsx`. Doctrina solo-lista ADR-079 §3.6.

### Código sin mockup (code-orphans) — decisiones de consolidación
- Páginas DNS CRUD dedicadas `/services/[id]/dns` (cliente y admin) — el mockup las embebe.
- `/dashboard/billing/[id]` detalle de factura como página — el mockup usa expand inline.
- `ChatWidget` burbuja flotante huérfana (0 montajes `<ChatWidget>`) — el mockup solo tiene el drawer SupportPanel.
- `notificationsApi.list` paginado existente pero sin consumir (api.ts:810).
- Navegación por tabs (U22/U37) — el mockup usa single-page grid.

- `/admin/account-deletion` (RGPD / derecho al olvido) — unidad funcional completa en código (`DeletionRequestsManager.tsx`) sin contraparte en el mockup `Configuracion.dc.html`. Además, en U10 conviven **dos confirm** (`CartView` carrito unificado vs `StepConfirm` legacy de 4 pasos) — consolidar.

### Supuestos y limitaciones
- **Comparación estática:** no se ejecutó la app ni se hicieron capturas. El análisis es código + mockups.
- **Verificación parcial pero focalizada:** se re-verificó en esta sesión la muestra de mayor impacto (bugs de token `#635BFF` y tokens inexistentes; los 3 mockup-orphans; `ServicesListView.tsx:103`). El resto de file:line procede de la auditoría por unidad (confianza declarada **alta** en las 37), que documenta sus propios grep de ausencia. No se re-ejecutó cada uno de los ~723 items.
- **Mockup como guía visual, no spec funcional:** en varias unidades el código supera al mockup (WS tiempo real, RBAC, estados, capability-gating). Seguir el mockup literalmente **regresionaría** funcionalidad. Donde el mockup viola reglas canónicas (StatsCards fuera de Overview, `max-width` inline, composer nota interna), **el código es el correcto**.
- **Esfuerzo:** escala S=1, M=2, L=3, XL=5; total ~111. Estimación de orden de magnitud para priorización, no compromiso de entrega.
- **Backend fuera de alcance** salvo donde el insumo ya citaba controllers/DTOs para distinguir "falta UI" de "falta endpoint" (p.ej. Stripe, búsqueda en jobs/error-log, `audience` en plantillas, `subject?/priority?` ya en la action de escalado).
- `TareaDetalle.dc.html` está vacío; el detalle de tarea diseñado es `TareaDetalleAdmin.dc.html` (517 líneas).
