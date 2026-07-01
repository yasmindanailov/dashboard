# Bitácora F4·W2 — U24 Servicio-detalle admin · 2026-07-01

> Documentación **empírica** del reskin 1:1 de **U24 Servicio-detalle admin**
> (`/admin/services/[id]`) hacia `mockup-uiux/admin/ServicioDetalleAdmin.dc.html`
> + `SupportInsideDetalleAdmin.dc.html`. Rama `redesign/f4-servicio-detalle`
> **apilada sobre** `redesign/f4-producto-form` (U27). **🟢 CÓDIGO-COMPLETO** — parte 1
> + parte 2 (incl. los 2 items finales: **timeline de auditoría reskineado** +
> **feature C backend**) hechas y verdes. Mapa: `ui-migration-{plan,backlog,gap}-2026-06-26.md`
> (gap U24 = `ui-migration-gap-2026-06-26.md:441-448`).

---

## 1. Contexto arquitectónico (verificado)

`/admin/services/[id]` **NO es una página aislada**: es la extensión admin de una
**plantilla ÚNICA frozen** `ServiceDetailLayout` (ADR-070, R2+R3) que compone dos
registries declarativos capability-routed — BASE (`SERVICE_DETAIL_SECTIONS`, scope
`both/client`) + ADMIN (`ADMIN_SERVICE_DETAIL_SECTIONS`) — filtrados por
`matchesScope` (ruta) + `shouldRender` (capability). Tabs `Resumen/Notas/Auditoría`
ya existen. Header = slot `<DetailPage header>` (`ServiceHeaderCard` + kebab
inyectado). **El reskin respeta el registry (sin branching por provisioner, R4).**
Los bloques `scope:both` son **compartidos con el detalle de cliente**
(`/dashboard/services/[id]`, mockup propio = W3).

## 2. Decisiones Yasmin (durables)

- **Máxima coherencia → todo al nivel del DS (genérico/sistémico), sin forks
  page-local.** (Vetó explícitamente hacer banners custom en la página.)
- **Sistémico DS ahora** (como U27): SectionCard/Meter/DescriptionList, AlertBanner,
  IconWell → 1:1 en toda la app + re-smoke.
- **Scope = admin + cards compartidas** (alinean ambos mockups; el chrome propio
  del cliente se completa en W3).
- **Feature C** (badge cobertura SI) = **SÍ**; **notas-composer** y **controles de
  dominio admin** = **diferidos**.
- **Notas del servicio = MISMO diseño que la tab "Notas" del cliente-detalle**
  (reutilizar, no inventar).

## 3. Lo hecho — 5 commits verdes (typecheck+lint+96 test+build)

| Commit | Qué |
|---|---|
| `011fe4e` **A** | **Sistémico DS**: `SectionCard` → `--radius-lg`(16)+`--shadow-sm`+título 13/700 · `Meter` track 7px+`--border-faint` · `DescriptionList` **variante additiva `divided`** (filas space-between + separador) · token `--border-faint`. |
| `3ce4114` **B** | **Parte 1**: header con icon-well por tipo (sólido en SI) + link **"Cliente"** (admin) + h1 lg/700 + slot para badge SI · cards **Info/Datos técnicos/SSL** a **filas divididas** · **footer con reloj**. |
| `6b30cfa` **C** | **AlertBanner** sistémico → superficie sólida cálida del mockup (amber/rojo; tokens `--warning-surface`/`--danger-surface`+border, `--danger-dark`) · **IconWell** `size="xl"`(50px)+`filled`+tono `brand`→`--brand-wash`(#EFF4FF); el header usa `IconWell` (elimina el fork `.serviceIcon`) · **Facturación** a filas divididas + CTA. |
| `e8cc156` **D** | **`NotesTimeline` compartido**: extrae el render de notas (fila punto-categoría + cuerpo + meta; card fijadas + timeline por mes) de `ClientNotesTab` a `_shared/notes/NotesTimeline` + `note-meta`. Reutilizado por **ClientNotesTab** (interactivo, Fijar/Desfijar) y **ServiceNotesCard** (read-only, "Notas internas"). **Mismo diseño, cero fork** — refactorizó U22 sin romperlo (96 test verdes). |
| `3fbd761` **E** | **SupportInsidePlanCard** mini-tiles SLA/técnico 1:1 (fondo blanco + `--border-faint`, valor 14/700) · banner de suspensión: caja **"Nota interna"** anidada (token `--warning-surface-strong`). |

**Primitivas DS tocadas (sistémico → re-smoke):** `SectionCard`, `Meter`,
`DescriptionList` (+`divided`), `AlertBanner` (cálido), `IconWell`
(`xl`/`filled`/tono brand→wash). **Compartidos nuevos:** `_shared/notes/{NotesTimeline,note-meta}`.
**Tokens nuevos:** `--border-faint`, `--warning-surface`/`-border`/`-strong`,
`--danger-surface`/`-border`, `--danger-dark`.

## 4. Cierre — los 2 items finales ✅ (2026-07-01)

1. **Auditoría — timeline ✅**: `ServiceAuditTimeline` reskineado al DS — cada
   evento es fila con **`IconWell`** (tono/icono por tipo de acción: acceso→neutral,
   SSO/impersonación→security, activado/reanudado→success, suspendido/reconciliado→
   warning, cancelado→danger, reprovisión→brand) + **línea conectora** vertical
   (oculta en la última fila, 1:1 mockup) + **CSS Module** (`ServiceAuditTimeline.module.css`,
   cero inline, tokens del DS). Se **compone `IconWell`** (no `ActivityRow`) porque
   conserva el **detalle rico** admin (actor+rol, IP, `<details>` con `changes_*` JSON)
   que `ActivityRow` no soporta → cero features perdidas. Es `_shared` ⇒ el reskin
   alcanza también el **timeline cliente** (preview + `/dashboard/services/[id]/audit`),
   coherente con "todo sistémico" (W3 lo hereda).
2. **Feature C — badge cobertura SI ✅**: **backend** — `ProvisioningService.getInfoForUser`
   expone `service.si_coverage_slot_type` (`GET /admin/services/:id`) con **una** query
   indexada `supportInsideSlot.findFirst({ where: { service_id, released_at: null },
   select: { slot_type } })`, **gateada a `isAdmin`** y a servicios técnicos (excluye
   `product.type='support_inside'`). Presencia del slot, **nunca por slug** (R4, SI-INV-8).
   **Frontend** — el wrapper admin mapea `slot_type`→i18n (`service.si_coverage.*`) y
   puebla `ctx.siCoverageBadge` (ya cableado en `ServiceHeaderCard`). **+4 tests unit**
   (cobertura, sin slot, gating cliente, gating SI-product). **Boot smoke: DI graph OK +
   `4/4 plugins`** (`[internal, manual, enhance_cp, resellerclub]`). Doc: `admin.md §11.3 (C)`.
3. **Diferidos** (decisión Yasmin, siguen fuera de U24): composer de nota manual
   (sin endpoint POST) · controles de dominio admin (NS/lock/WHOIS/EPP, no en el mockup)
   · filtros (A)/(B) de la lista `/admin/services` (`admin.md §11.3`).

## 5. ⚠️ Re-smoke sistémico (esta sesión)

El cambio afecta a **toda la app**: `AlertBanner` (todos los banners/errores ahora
cálidos) · `IconWell` (type-cards U27 + notificaciones + header ahora `#EFF4FF`) ·
`SectionCard`/`Meter`/`DescriptionList` (todos los detalles/overviews) · **notas
del cliente** (`/admin/clients/[id]` tab Notas — mismo diseño, ahora vía
`NotesTimeline`). Verde de build/tests NO cubre regresión visual.

## 6. DoD (completo · 2026-07-01)

- **frontend**: typecheck + lint (0 warnings) + **96** test + build ✅.
- **backend**: typecheck + lint + **1533** test (12 skip · **+4** de feature C) ✅.
- **boot smoke**: DI graph completo sin `UnknownDependenciesException` +
  `Validated 4/4 provisioner plugin(s): [internal, manual, enhance_cp, resellerclub]`
  + `Nest application successfully started` ✅. *(El `EADDRINUSE :::3001` del smoke fue
  colisión con el backend de dev ya levantado — el grafo se inicializó entero antes del
  bind, que es justo lo que valida el smoke.)*
- Docs al día: esta bitácora · `admin.md §11.3 (C)` · `current.md`.

**⚠️ RE-SMOKE visual (Yasmin)** — además del re-smoke sistémico de la parte 1
(AlertBanner/IconWell/SectionCard/Meter/DescriptionList + notas del cliente), el reskin del
timeline es `_shared` ⇒ revisar **ambos** timelines de auditoría: admin
(`/admin/services/[id]` tab Auditoría + `…/audit`) y **cliente**
(`/dashboard/services/[id]` tab Auditoría + `…/audit`). Y el **badge de cobertura SI** en el
header de un servicio técnico cubierto por un slot activo.

## 7. Ronda de ajustes de fidelidad (review Yasmin · 2026-07-01)

5 puntos de la revisión visual del detalle admin — todo **frontend**, `frontend`
typecheck + lint (0 warn) + **96** test + build ✅ (sin tocar backend → sin boot smoke):

1. **P1 · "Cambiar plan" al kebab.** Se retiró la card `plan-change-card` del Resumen
   admin (ahora `scope: 'client'`; el cliente la conserva para W3) y la acción vive en
   "Más acciones" (1:1 mockup). Extraído **`ChangePlanModal`** (`_shared/services/_components/`,
   prorrateo ADR-029) de `ChangePlanCard` → lo lanzan **la card cliente** y **el kebab admin**.
   Kebab admin: un solo **"Cambiar plan…"** = prorrateo (no-terminal/no-dominio/no-suspendido).
   ⚠️ El `change_package` de Enhance (capability distinta) se **renombró** a "Cambiar paquete
   de hosting…" para no colisionar (solo aparece si el plugin lo expone; ausente en dev).
2. **P2 · Redundancia de "Activo".** `ServiceOverviewCard` ya no repite el estado: se quitó
   el **Badge de estado** (duplicaba el badge del header, D4) y la **narrativa** "El servicio
   está activo y operativo." La card se queda con los hechos (plan/alta/renovación) + el motivo
   técnico si lo hay. El estado vive **solo** en el badge del header.
3. **P3 · Tab Auditoría 1:1.** `ServiceAuditTabSection` → título **"Actividad reciente"** +
   contador **"Últimas N"** a la derecha + enlace **"Ver historial completo →" al pie** (antes
   arriba). Preview a **5** filas (mockup). Timeline: iconos alineados al mockup (SSO→candado
   morado `security`, aprovisionado→caja verde `success`). *(No hay total en el API → "Últimas
   N", sin "de M".)*
4. **P4 · Tab Notas = diseño del cliente.** Extraído **`NotesExplorer`** (`_shared/notes/`,
   cabecera + resumen + chips de categoría + filtro de origen + `NotesTimeline`) desde
   `ClientNotesTab`. Lo usan **cliente** (interactivo: fijar/desfijar + "Nota excepcional") y
   **servicio** (`ServiceNotesCard`, **read-only**, composer sigue diferido). Opciones de
   origen compartidas en `note-meta` (`NOTE_SOURCE_FILTER_OPTIONS`). ⚠️ Re-smoke: el tab Notas
   del **cliente** (`/admin/clients/[id]`) también cambió de wrapper (mismo diseño).
5. **P5 · Header/botones.** Verificado 1:1 al nivel DS (icon-well 50px · h1 `--font-size-lg`
   20px ≈ 21px mockup · badge de estado · metadata inline · clúster Abrir panel/Gestionar DNS/⋯).
   **Decisión Yasmin:** la píldora superior "Proveedor · Healthy" NO se añade — la salud sigue
   solo en "Datos técnicos" (Amendment VII).

**Nota P1 (pendiente de confirmación):** la opción elegida decía "si el proveedor expone
change_package, se ofrece dentro del mismo flujo". Por ahora se dejaron como **dos ítems
distintos** ("Cambiar plan…" prorrateo + "Cambiar paquete de hosting…" proveedor) para no
fusionar dos backends distintos ni perder la capability de Enhance. Si se quiere un único
flujo que englobe ambos, es trabajo adicional (a decidir).
