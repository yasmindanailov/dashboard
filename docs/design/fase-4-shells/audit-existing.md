# Audit · shells existentes (fase 4)

> Estado: **lectura cerrada · drift identificado**
> Fuentes auditadas:
> - `frontend/app/AuthLayout.tsx` + `auth.module.css`
> - `frontend/app/dashboard/{layout.tsx,Sidebar.tsx}`
> - `frontend/app/admin/{layout.tsx,AdminSidebar.tsx}`
> - `frontend/app/_shared/shell/Topbar.{tsx,module.css}`
> - `frontend/app/components/ui/PortalBadge/`
> - `docs/UI_SPEC.md` §2.0, §3.9, §5.13
> - `docs/design/DECISIONS.md` DD-016, DD-025, DD-030

---

## Resumen ejecutivo

Existen 3 shells funcionales (Auth, Client/Partner mezclados, Admin).
**No existe** PartnerShell propio — los partners se sirven hoy desde el
mismo `dashboard/layout.tsx` que cliente, con items filtrados en el
sidebar. El topbar es compartido (`_shared/shell/Topbar.tsx`) tras
ADR-066.

12 driftings identificados. Ninguno bloqueante; todos comprometen
disciplina de marca o densidad.

---

## Shell 1 · `AuthLayout`

| ID | Drift | Severidad | Resolución |
|---|---|---|---|
| **D4-1** | Logo `/brand/logo-blue-black.svg` (asset legacy). Marca v1.6 establece `aelium_logo_blue.svg` como primario. | Media | Migrar a `aelium_logo_blue.svg` (ya disponible en `mockup/`) — primary identity. |
| **D4-2** | Slogan **"Tu socio digital, a tu lado"** ✅ correcto, pero hardcoded en código. | Baja | Mantener. Promover a constante si se quiere variar por contexto (login vs register). |
| **D4-3** | Sin variante para confirmaciones de estado (verify-email, link-expired). Hoy esas pantallas reusan AuthLayout sin matiz. | Media | Añadir variante `centered-status` con icon estado + título + body + CTA único. Sin formulario. |
| **D4-12** | GradientMesh estático — no se cae sutilmente al tabular el form. | Baja | Confirmar que el mesh respeta `prefers-reduced-motion`. Fuera de scope si ya cumple. |

---

## Shell 2 · `dashboard/layout.tsx` + `Sidebar.tsx` (Cliente + Partner mezclados)

| ID | Drift | Severidad | Resolución |
|---|---|---|---|
| **D4-4** | "A" hardcoded como logo cuadrado en sidebar. La marca tiene rombo real (`aelium_logo_blue.svg`). | Media | Sustituir por SVG inline del rombo Aelium. Estado colapsado: solo rombo. Estado expandido: rombo + wordmark. |
| **D4-5** | Sidebar mezcla items de cliente + partner, filtrando por rol en runtime. Funcional pero impide diseñar una **PartnerShell propia** con su voz. | Alta | Separar PartnerShell en su propio layout `/partner/*`. Sprint 19 ya planificado en código. |
| **D4-6** | `style={{ marginLeft }}` inline en `<main>`. Frágil cuando cambian breakpoints. | Baja | Mover a CSS variable `--sidebar-width` declarada en el shell root. |
| **D4-7** | Sin atributo `data-density="comfortable"` en el shell de cliente. | Media | Añadir `data-density="comfortable"` al root del ClientShell. Permitir override por preferencia futura. |
| **D4-13** | Sidebar items sin agrupar por sección visual ("Operaciones / Plataforma" como en Admin). El cliente tiene 5 items — no hace falta sección, pero el partner sí necesita ("Tu cartera / Recursos"). | Media | Añadir sectionTitle solo cuando hay 2+ grupos. Cliente puro: sin secciones. Partner: 2 secciones. |

---

## Shell 3 · `admin/layout.tsx` + `AdminSidebar.tsx`

| ID | Drift | Severidad | Resolución |
|---|---|---|---|
| **D4-4'** | Mismo "A" cuadrado. | Media | Resolver con el mismo SVG rombo Aelium. Variant del PortalBadge `admin` aplicado. |
| **D4-8** | Sin atributo `data-density="compact"`. | Media | Añadir `data-density="compact"` al root del AdminShell. |
| **D4-14** | AdminSidebar **no soporta collapsed** — el ancho es fijo. ClientShell sí. Inconsistencia. | Media | Aplicar el mismo collapse pattern. Operativos prefieren más densidad — collapsed por defecto en admin podría ser razonable. Decisión en spec. |

---

## Shell 4 · `Topbar` compartido

| ID | Drift | Severidad | Resolución |
|---|---|---|---|
| **D4-9** | `searchTrigger` con `<kbd>⌘K</kbd>` visible — DD-025 ya removió esto del spec pero el código aún lo tiene. | **Alta** | Eliminar `<kbd>` del trigger. Mantener atajo Cmd+K funcional. Texto solo: "Buscar" + icono. |
| **D4-10** | Topbar idéntico para cliente y admin. Cliente NO necesita search de palette (no es operativo) — su entrada es la nav y Soporte. | Alta | Diferenciar: `topbar variant="cliente"` (sin search button, con SupportButton) vs `variant="admin"` (con search button, sin SupportButton). |
| **D4-11** | Profile avatar usa iniciales sin `<Avatar>` componente DS. Drift DD-029 (no usa el sistema). | Media | Migrar a `<Avatar size="sm" name={...} />` con paleta brand. |
| **D4-15** | Sin estado loading en topbar mientras `useAuth` resuelve. El sidebar muestra loadingScreen completo, pero topbar parpadea. | Baja | Skeleton del avatar mientras carga. |

---

## Drift transversal

| ID | Tema | Resolución |
|---|---|---|
| **D4-16** | DD-016 sin materializar — densidad declarada pero no aplicada por portal. | Decisión propia de fase 4: añadir `data-density` en cada shell root y verificar tokens resueltos. |
| **D4-17** | PortalBadge variants `cliente` / `admin` ya existen, pero **no hay variant `partner`** ni una `agente` distinguible del admin. | Añadir variants `partner`, mantener `admin` para staff todo. |
| **D4-18** | Skip link a `#main` ausente. Accesibilidad mínima. | Añadir `<a class="skip-link" href="#main">Saltar al contenido</a>` antes del sidebar en cada shell. |
| **D4-19** | DD-030 cumplido en componentes pero **el sidebar tiene border-left brand 3px en active** — confirmado correcto (es navegación funcional, DD-030 lo permite). Verificar también accent en applied filters. | Confirmado en auditoría. Mantener. |

---

## Decisiones a registrar (DD-032)

1. **Densidad por portal materializada**:
   - ClientShell · `comfortable` (espacios `--space-4` mínimo entre bloques)
   - PartnerShell · `standard`
   - AdminShell · `compact` (espacios `--space-3`)
   - AuthShell · n/a

2. **Topbar variantes nativas (DD-029)**: `cliente` (sin search palette,
   con SupportButton, sin secciones admin) · `admin` (con search palette,
   sin SupportButton) · `partner` (sin search palette, sin SupportButton).

3. **Sidebar logo** = SVG rombo Aelium real, NO "A" cuadrada.

4. **Sidebar active item** mantiene border-left brand 3px (navegación
   funcional, DD-030 explícito).

5. **PartnerShell separado** del ClientShell — implementación en sprint
   propio (Sprint 19 según comentario en código).

6. **AuthShell variantes**: `split-aurora` (login/register/forgot/reset)
   y `centered-status` (verify-email, confirmaciones, links expirados).

---

## Lista de migración (NOTES.md)

| ID | Drift | Sprint estimado |
|---|---|---|
| D4-1 | Migrar logo a aelium_logo_blue.svg | Pequeño · 1h |
| D4-3 | Variante centered-status en AuthShell | Mediano · 4h |
| D4-4/4' | SVG rombo en sidebar | Pequeño · 1h |
| D4-5 | PartnerShell propio | Sprint 19 (planificado) |
| D4-6 | CSS var --sidebar-width | Pequeño · 1h |
| D4-7/4-8 | data-density en shells | Pequeño · 30 min cada uno |
| D4-9 | Eliminar `<kbd>⌘K</kbd>` | Pequeño · 15 min |
| D4-10 | Topbar variants cliente/admin/partner | Mediano · 4h |
| D4-11 | Migrar Avatar DS en topbar | Pequeño · 30 min |
| D4-13 | Section titles en sidebar partner | Pequeño · 1h |
| D4-14 | Collapse en AdminSidebar | Mediano · 3h |
| D4-15 | Skeleton del topbar avatar | Pequeño · 30 min |
| D4-17 | PortalBadge variant partner | Pequeño · 30 min |
| D4-18 | Skip link en cada shell | Pequeño · 15 min |
