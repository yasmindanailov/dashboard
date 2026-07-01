# Bitácora F4·W2 — U24 Servicio-detalle admin · 2026-07-01

> Documentación **empírica** del reskin 1:1 de **U24 Servicio-detalle admin**
> (`/admin/services/[id]`) hacia `mockup-uiux/admin/ServicioDetalleAdmin.dc.html`
> + `SupportInsideDetalleAdmin.dc.html`. Rama `redesign/f4-servicio-detalle`
> **apilada sobre** `redesign/f4-producto-form` (U27). **🟡 EN CURSO** — parte 1
> + gran parte de la parte 2 hechas y verdes; quedan 2 items (timeline de
> auditoría + feature C backend). Mapa: `ui-migration-{plan,backlog,gap}-2026-06-26.md`
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

## 4. Pendiente (otra sesión)

1. **Auditoría — timeline**: reskin de `ServiceAuditTimeline` con la primitiva DS
   `IconWell` (icon-well por tono/tipo de evento + línea conectora). Se **compone
   IconWell** (no `ActivityRow`) porque el timeline admin conserva **detalle rico**
   (SSO/impersonation, `changes` JSON, IP) que `ActivityRow` no soporta → cero
   features perdidas + primitiva DS coherente.
2. **Feature C — badge cobertura SI**: **backend** — `GET /admin/services/:id`
   debe incluir el `slot_type` del slot SI activo que cubre el servicio (SI-INV-8
   single-query, capability-driven, NUNCA por slug) + poblar
   `ctx.siCoverageBadge` (ya cableado en `ServiceHeaderCard`, campo opcional) →
   **boot smoke** (toca módulo/DI backend).
3. **Diferidos** (decisión Yasmin): composer de nota manual (sin endpoint POST) ·
   controles de dominio admin (NS/lock/WHOIS/EPP, no en el mockup).

## 5. ⚠️ Re-smoke sistémico (esta sesión)

El cambio afecta a **toda la app**: `AlertBanner` (todos los banners/errores ahora
cálidos) · `IconWell` (type-cards U27 + notificaciones + header ahora `#EFF4FF`) ·
`SectionCard`/`Meter`/`DescriptionList` (todos los detalles/overviews) · **notas
del cliente** (`/admin/clients/[id]` tab Notas — mismo diseño, ahora vía
`NotesTimeline`). Verde de build/tests NO cubre regresión visual.

## 6. DoD (parcial)

`frontend`: typecheck + lint + **96** test + build ✅ (en cada commit). **No toca
backend todavía** → boot smoke pendiente para feature C. `ci:check` completo +
boot smoke al cerrar la parte 2.
