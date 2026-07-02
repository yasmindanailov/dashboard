# Bitácora F4·W3·U04 — "Mis servicios" (lista cliente) → hub unificado

> Reskin 1:1 de la lista de servicios del cliente (`/dashboard/services`) hacia
> el **`Servicios Cards Spec`** (Variante A · ficha), que **supersede** a
> `MisServicios.dc.html`. Rama `redesign/f4-servicios-cliente` desde `master`
> (`8cc5cb7`). **🟢 CÓDIGO-COMPLETO.** DoD verde (front typecheck+lint+**96**
> test+build · back typecheck+lint+**1550** test). Es el **detalle** cliente
> (U05) el que va en su propio PR (arrastra la decisión del `TAB_ORDER` frozen).

## 1. Conflicto mockup-mockup resuelto (gap §U04)

`MisServicios.dc.html` (gauges técnicos + botón azul por card + tono "panel
técnico") está **repudiado** por `Servicios Cards Spec.dc.html`
(:57-59), alineado con UI_SPEC §2.4/§5.14. **Decisión Yasmin 2026-07-02: gana el
spec → Variante A (ficha).** Doctrina aplicada:

- **Identidad primero** (icon-well + nombre + badge + metadata inline), sin
  bloques de stats/gauges (viven en el Detalle U05).
- **Estado en lenguaje claro** (tira footer con tono: "Todo en orden" /
  "Se renueva el X · te avisaremos antes" / …), voz Aelium (§1.2 P5).
- **1 sola primaria por vista** ("Contratar servicio"); las quick-actions
  (Abrir panel / Gestionar DNS / Ver detalle) → **menú ⋯**.
- **Card navegable entera** (onClick → detalle).

## 2. Decisiones Yasmin (durables)

1. **Alcance del PR:** lista (U04) ahora; detalle (U05) en PR aparte.
2. **Doctrina de card:** Variante A (ficha). (Variante B = fila densa, reservada
   para cuando el cliente acumule muchos servicios — no ahora.)
3. **Hub unificado:** la lista combina **3 grupos** — Webs y hosting · Dominios ·
   Support Inside — cada uno con contador. Coherente con la nav F2 (que sacó
   "Dominios" del sidebar: "se alcanza desde Mis servicios").

## 3. Hecho

**Frontend**
- `page.tsx` reescrito (SC): 3 fetches en paralelo con `Promise.allSettled`
  (`/services?exclude_type=domain` · `/domains` · `/dashboard/support-inside/status`)
  → cada origen degrada por separado (si SI falla, hosting/dominios se muestran).
  Header con primaria "Contratar servicio" (→ Tienda) + **banner de salud global**
  (verde "Todo funciona" / ámbar "Hay algo que requiere tu atención", agregado de
  las tiras de estado). Empty state + estado de error.
- `_components/ServiceHubCard.tsx` (CC): card ficha — IconWell (Monitor/Globe/
  ShieldCheck por tipo) + Badge + metadata inline + tira de estado (StatusDot por
  tono) + menú ⋯ (`Dropdown`). Navega entera por `onClick`; el ⋯ hace
  `stopPropagation`. **Sin stretched-link ni z-index/transform en la card** → no
  crea stacking context → el popover del ⋯ (z-index alto del DS) nunca queda
  tapado por cards vecinas del grid.
- `_components/ServiceHubGroup.tsx` (SC): encabezado (título + píldora contador) +
  grid responsive.
- `_components/service-hub-vm.ts`: view-models **puros** (SC-compatibles) que
  traducen servicio/dominio/SI → datos de card (badge + tira en lenguaje claro +
  metadata). Dominios: estado "Renueva pronto" (ámbar) si caduca en ≤30 días.
- `_components/services-hub.module.css`: **CSS Module tokens-only** (cero inline,
  R16/D1).
- **DRY:** extraído el hook compartido `_shared/services/useServiceSso.ts` (action
  SSO + toast + error-key por rol); **`SsoButton` refactorizado** para consumirlo
  (misma lógica; el ⋯ del hub reusa el hook para "Abrir panel").
- Borrado `ServicesListView.tsx` (tabla plana, código muerto tras el reskin).

**Backend** (additivo, sin cambios de DI)
- `serviceSummarySelect()` += `next_due_date` (renovación para la metadata).
- `listForUser()` enriquece cada item con `capabilities: { has_sso_panel,
  has_dns_management } | null` + `panel_label`, resueltas por `PluginRegistryService`
  (estáticas, Map en memoria O(1), **sin `getInfo`** = sin llamada al proveedor).
  Slug efectivo = `provisioner_slug ?? product.provisioner`. R4/ADR-070: la UI
  gatea por capability, nunca por slug.
- Tipo frontend `ServiceListItem` extendido (additivo).

## 4. Honestidad de datos (nota)

- **`auto_renew` NO existe** como columna ni toggle (verificado en `schema.prisma`;
  el único `autoRenew` es display-only del plugin vía `getInfo`, caro). No se
  fabricó columna: la card muestra **"Auto-renovación activada"** solo para
  servicios **activos con `next_due_date`**, como reflejo **derivado** del
  comportamiento real (Aelium renueva automáticamente; no hay opt-out). Si se
  quiere un toggle real de auto-renovación → es feature de backend (PR propio).

## 5. DoD

- Frontend: `typecheck` ✅ · `lint:check` ✅ · `test` **96** ✅ · `build` ✅.
- Backend: `typecheck` ✅ · `lint:check` ✅ · `test` **1550** ✅ (0 fallos; el
  cambio de shape de `listForUser` no rompió specs).
- **Boot smoke: N/A** — no se tocó ningún `@Module`/imports/exports/DI (el
  `registry` ya estaba inyectado; solo lógica de un método).

## 6. Pendiente (Yasmin) / re-smoke

- **Smoke visual 1:1** del hub en `:3002` (reiniciar `frontend dev` para tomar el
  cliente Prisma nuevo del backend si se levanta): 3 grupos, cards ficha, banner
  de salud, menú ⋯ (Abrir panel / DNS gateados por capability), navegación de card.
- **Re-smoke `SsoButton`** en el **detalle** de servicio (`/dashboard/services/[id]`)
  — se refactorizó al hook compartido (misma lógica, verificar que abre el panel).
- **Diferido:** el hub no pagina (fetch `limit=100`; cliente real tiene pocos
  servicios) → truncado >100 = borde no esperado. El estado de dominio
  "Transferencia en curso" no se muestra en la lista (vive en el detalle;
  `transfer_state` no está en el payload de `/domains`).

## 7. Siguiente

**U05 Detalle servicio cliente** (`/dashboard/services/[id]`) — reskin dentro de
la plantilla frozen `ServiceDetailLayout` + strip de metadata + tabs del mockup
(Resumen · Cuidado · Plan y facturación · Actividad). ⚠️ **Decisión pendiente:**
el `TAB_ORDER (summary/notes/audit)` está **frozen** → las tabs nuevas (Cuidado,
Plan y facturación) requieren **ADR/Amendment** vs plegar en Resumen.

## 8. Actualización 2026-07-02 (tarde) — review Yasmin

- **Confirmado 1:1 = Variante A ficha** (no MisServicios literal). **Refinada a
  exacto:** título `--font-size-md` (16 ≈ 15.5 del spec), metadata inline incluye
  el **tipo** ("Web Pro · **Hosting** · Renueva… · Auto-renovación…"), y la tira de
  estado pasa a fondo **casi neutro** (`--surface-secondary`) con el tono en el
  punto + el texto (el spec la dibuja casi blanca, no con tinte saturado).
- **Auto-renovación:** decisión Yasmin = **toggle REAL, hosting + dominios**
  ("permitir eso es parte de Aelium"). Verificado empíricamente que hoy **no
  existe**: ni columna `Service.auto_renew`, ni acción de toggle; `autoRenew` es
  solo display-only del plugin (`getInfo`), y en RC un dominio **expira** sin
  auto-renew (`resellerclub.plugin.ts:925`). ⇒ Es una **feature nueva** que va en
  **PR dedicado** (no se mezcla con el reskin de la lista): columna
  `Service.auto_renew` + el **worker de facturación** la respeta (OFF → deja
  expirar en `next_due_date` con avisos) + **endpoint** de toggle (owner/admin) +
  **acción del plugin RC** para propagar al registrar (ADR-077 amendment additivo,
  capability-driven) + **control toggle** en el detalle (dominio + servicio). La
  lista entonces leerá el valor real (hoy muestra "Auto-renovación activada"
  derivado para activos, honesto pero no toggleable aún).

## 9. Actualización 2026-07-02 (2ª review Yasmin) — cards 1:1 con `MisServicios.dc.html`

Yasmin pidió que las cards sean **idénticas al mockup real**, por tipo, con estas
reglas. Rediseño (mismos archivos, verde front typecheck+lint+**96**+build):

- **Layout:** hosting **2 columnas** (grid responsive), dominios **1 columna**,
  Support Inside **1 columna**.
- **Anatomía por tipo** (header icon-well + nombre + badge + subtítulo · cuerpo de
  **key-values** · footer de acciones):
  - **Hosting:** subtítulo "Producto · Hosting" · key-values Renueva /
    Auto-renovación (derivada) · footer **Abrir panel** (SSO, si capability) +
    **Gestionar DNS** (si capability) + **Ver detalle →**.
  - **Dominio:** key-value **Renueva** · footer **Gestionar DNS** + **Ver detalle →**.
  - **Support Inside:** card **destacada** (borde/sombra de marca + header
    tintado + icon filled) · key-values Mantenimientos (`slots_included`/mes) /
    Respuesta (SLA) / Tu técnico · footer **Gestionar mi plan** + **Ver planes
    superiores**.
- **Quitado (decisión Yasmin):** el **⋯** (redundante con "Ver detalle") y la
  **tira "Todo en orden"** (redundante con el estado del header/banner). La card ya
  **no** navega entera (usa las CTAs explícitas del mockup).
- **Fuera (coste/no disponible):** gauges de hosting + nameservers de dominio
  (`getInfo`, caro) · detalles de "transferencia en curso" (`transfer_state` no
  viene en la lista).
- **⚠️ Honestidad (dominios):** NO se muestra "Auto-renovación" en la card de
  dominio — hoy los dominios (ResellerClub) **expiran** (no auto-renuevan);
  afirmar "Activada" sería falso y con **riesgo real** de perder el dominio. Se
  añadirá cuando el toggle de auto-renovación (vía registrar) sea real.
- **Auto-renovación (toggle real):** decisión Yasmin = **hosting + dominios**,
  **PR dedicado** tras el merge de U04. Toggle en **ambos detalles** (dominio +
  servicio). Plan: Amendment ADR-077 additivo + columna `Service.auto_renew` +
  worker respeta el OFF + acción del plugin RC hacia el registrar + UI.
