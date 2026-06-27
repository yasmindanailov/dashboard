# Bitácora del rediseño UI — sesión 2026-06-27

> Registro riguroso de lo trabajado en una sesión densa de arranque del
> **rediseño UI completo** (track activo: hacer el dashboard 1:1 con los mockups
> de `mockup-uiux/` antes del go-live). Acompaña al
> [`ui-migration-plan`](./ui-migration-plan-2026-06-26.md) /
> [`ui-migration-backlog`](./ui-migration-backlog-2026-06-26.md) /
> [`ui-migration-gap`](./ui-migration-gap-2026-06-26.md).

## 0. Resumen ejecutivo

Se completaron **F0 (cimientos)** y **F1 (primitivas + marca + gobernanza)** del
plan, se **sincronizaron los mockups** a la versión viva, se construyeron los
**componentes nuevos** que piden las páginas nuevas, y se documentó todo. Método:
cada pieza extraída del **spec real del mockup** → traducida a **tokens del DS
(R16)** → verificada **empíricamente** (typecheck + lint + login Playwright +
screenshot de `/dashboard/ds-preview`). Todo verde.

## 1. Qué se hizo (por fase)

### F0 — Cimientos (PR #135, rama `redesign/f0-tokens`)
- **F0.2/F0.3** — bugs de token reales (audit GL-27/§4.3): elimina el púrpura
  prohibido `#635BFF` (4 ficheros) → `var(--brand)`; define 5 tokens
  referenciados-pero-inexistentes (`--brand-600`, `--border-subtle/-default`,
  `--surface(-2)`, `--text-link`, `--primary`) que rompían bordes/colores en runtime.
- **F0.6** — parte `lib/api.ts` (2197 LOC, 5.5× R15) en `lib/api/` (19 archivos por
  dominio + barrel). 68 importadores intactos (cero churn, typecheck project-wide).
- **F0.1** — paleta **slate** del mockup en `globals.css` (texto `#0F172A/#64748B/
  #94A3B8`, bordes `#E2E8F0/#CBD5E1/#94A3B8`) + tokens nuevos (peso 700, H1 28px,
  tracking). Verificado con screenshot login vs mockup.
- **F0.4** — sistema de iconos **Lucide React** + retira picture-emojis (D1):
  `source-labels` + icon-buttons `↻/⏳`. (Residual de dingbats inline → F4,
  inventariado en el backlog.)

### F1a — Primitivas del DS (rama `redesign/f1a-primitivas`) — **11 primitivas**
`Toggle` · `IconWell` · `SegmentedControl` · `PasswordStrengthMeter` ·
`NotificationRow` · `OTPInput` · `Stepper` · `PricingCard` · `OrderSummary` ·
`PaymentMethodCard` · `ActivityRow`. Todas desde el spec real del mockup, con
showcase en `ds-preview` y verificación por screenshot.

### F1c — Gobernanza (rama `redesign/f1cd-marca`)
- **Amendment A1 de D10** (decisión D-1): StatsCards permitidas en detalle/gestión
  con KPIs accionables (máx. 1 fila, sin duplicar badges); list pages siguen sin
  StatsCards. En `rules.md` + `DESIGN_SYSTEM.md`.

### F1d — Marca
- **BrandMark** = logo **copiado verbatim del mockup vivo**: dos cuadrados
  redondeados CSS rotados 45° **horizontales** (claro `#BFDBFE` + brand `#3B82F6`,
  base 28px). Sustituye el "A" de Sidebar/AdminSidebar y el `<img>` viejo de
  AuthLayout. **Pendiente F1d:** favicon/export SVG + loader animado
  (keyframes en `LogotipoAnimado.dc.html`).

### Sincronización de mockups
- Se espejó `Downloads/mockup-uiux` (versión viva, fuente de verdad) sobre el
  `mockup-uiux/` del repo (estaba desactualizado): borra el `Logotipo.dc.html`
  viejo (logo descartado), añade 6 páginas nuevas (Carrito, ChatBubble,
  FacturaDetalle, GestionDNS, TransferenciaDominio, admin/SolicitudesBorrado) y
  trae ediciones reales (widget del shell, etc.).

### Componentes de las páginas nuevas (gap analizado → §9.1 del backlog)
- **CartLineItem** (Carrito), **Stepper** variante `vertical` (TransferenciaDominio),
  **SidebarConversationList** (widget del shell). El resto de páginas nuevas son
  **reskins F4 de componentes que ya existen en código** (DnsRecordsManager,
  DomainTransferPanel, billing/[id], DeletionRequestsManager, ChatWidget).

## 2. Decisiones tomadas (Yasmin)
- **Rediseño completo F0→F4 ANTES del go-live** (Stripe pasa a ser la vertical F3·E6).
- **GL-27 absorbido** por el rediseño (no es sprint suelto).
- Iconos = **Lucide React** (lo que cita D1).
- Política de enforcement = estricto (se materializa progresivamente).
- **Fuente de verdad de mockups = `Downloads/mockup-uiux`** (working dir adicional),
  ahora sincronizada al repo.

## 3. Corrección importante (lección)
El primer BrandMark copió el logo del **`Logotipo.dc.html` viejo del repo** (SVG
diagonal con máscara) que Yasmin **había descartado**. El logo canónico es el CSS
de dos rombos horizontales embebido en las páginas de la carpeta viva. **Lección:
leer siempre de `Downloads/mockup-uiux`** (ya sincronizado). Documentado en la
memoria del agente.

## 4. Verificación (empírica)
- `pnpm --dir frontend typecheck && lint:check` verdes tras cada commit; **44 tests**
  de frontend pasan (la red de #133); el split de `api.ts` no rompió imports.
- Render verificado levantando el stack (docker + backend `:3001` 4/4 plugins +
  frontend `:3002`) y **screenshots de `/dashboard/ds-preview`** vía login Playwright
  (`cliente@aelium.test`), comparando contra los mockups.

## 5. Estado y siguiente paso
- **Pendiente del rediseño:** **F2 (shells)** — reconstruir DashboardShell +
  AdminShell idénticos al mockup, integrando el `SidebarConversationList` nuevo y
  el BrandMark. Depende de F0+F1a+F1d (ya listos). Luego F3 (verticales con backend)
  y F4 (reskin página a página, con los reskins de las páginas nuevas).
- **Pendiente F1d:** favicon + loader animado.
- DoD por fase y mapa de épicas en el backlog.
