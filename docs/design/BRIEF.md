# BRIEF.md — Aelium Dashboard, programa de evolución UI/UX

> Brief de producto, audiencia y restricciones. Input de fase 0.
> Cerrado y aprobado. No editar sin registrar la decisión en `DECISIONS.md`.

---

## Producto

Aelium Dashboard es un panel B2B SaaS para una plataforma española de hosting
y cloud management. Es el panel de control donde:

- **Clientes** gestionan sus servicios contratados, facturación y soporte.
- **Staff** (agente / admin) gestiona la operación, soporte y catálogo.
- **Partners** (resellers / agencias) ven sus referidos y comisiones.

---

## Audiencia y tono

| Rol | Perfil | Densidad UI | Tono |
|-----|--------|-------------|------|
| Cliente | Pyme/emprendedor español, NO técnico | Baja | "Alguien real al lado" — simpleza, claridad, cero jerga |
| Agente | Técnico operativo (soporte/billing) | Media-alta | Productividad, velocidad, control |
| Admin | Técnico + business | Alta | Control total, observabilidad |
| Partner | Técnico-comercial (agencias) | Media | Profesional, datos claros |

Personalidad de marca: socio cercano, profesional pero humano, sin jerga
técnica innecesaria. Voz de marca cortada y cercana ("Ya lo miro" sí,
"Procederemos" no).

---

## Ambición visual

No solo "profesional y robusto", también **moderno y diferenciador**, sin
romper la filosofía D1–D11 de minimalismo funcional.

Para conseguirlo:

1. **Firma visual recurrente**: extender el lenguaje de `GradientMesh`
   (hoy en auth) al producto de forma sutil. Acento de color distinto por
   portal manteniendo brand `#3B82F6` como base.
2. **Motion choreography sistemática** vía Framer Motion: patrones
   consistentes de entrada/salida/transición a nivel de design system,
   no por componente. Silencioso, no decorativo.
3. **Densidad como dialecto**: mismo design system con personalidades
   visibles — Cliente respira, Agente/Admin densos tipo Linear/Attio.
4. **Detalles deliberados**:
   - Skeletons morfológicos (forma exacta del contenido)
   - Focus rings con personalidad de marca
   - Command palette con preview de resultados
   - `tabular-nums` en tablas y métricas
   - Transiciones suaves entre rutas
   - Empty states con personalidad (voz de marca + ilustración mínima)
5. **Empty states y errores con personalidad de marca** (texto que suena
   a Aelium, no genérico).

Estas piezas son **disciplina, no decoración**. No deben añadir ruido.

---

## Restricciones técnicas (inviolables)

| Capa | Restricción |
|------|-------------|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript estricto |
| Estilos | CSS Modules + Tailwind CSS 4 con tokens CSS centralizados |
| Tipografía | DM Sans (400/500/600) — única familia |
| UI libs | Sin shadcn, MUI, Chakra, Radix, Headless UI |
| Iconos | SVG inline (Lucide no instalado) |
| Animación | Framer Motion 12 disponible |
| Realtime | Socket.io para chat y notificaciones |
| Gráficos | Sin librería instalada — evaluar caso por caso si hace falta |
| Tokens | Cero hex hardcoded ni magic numbers — todo via variables CSS |
| Componentes | 35 ya codeados en `frontend/app/components/` (lista en `PLAN.md`) |

---

## Identidad visual actual

- **Brand:** `#3B82F6` (azul medio)
- **Brand hover:** `#2563EB`
- **Brand light:** `#DBEAFE`
- **Brand subtle:** `rgba(59, 130, 246, 0.06)`
- **Surface primary / secondary:** `#FFFFFF` / `#F7F7F8`
- **Text primary / secondary / tertiary:** `#0A0A0B` / `#6B7280` / `#9CA3AF`
- **Border:** `rgba(0, 0, 0, 0.06)`
- **Spacing scale:** 4px (4, 8, 12, 16, 20, 24, 32, 40, 48, 64)
- **Aurora gradient** (`GradientMesh`) en pantallas de auth — referencia para
  la firma visual a extender

Reglas D1–D11 en `docs/DESIGN_SYSTEM.md` son la columna vertebral. No
contradecirlas sin marcar propuesta de cambio.

---

## Páginas y features (resumen)

> Detalle completo en `docs/UI_SPEC.md` y `docs/features/`.

**Auth:** `/`, `/register`, `/verify-email`, `/forgot-password`,
`/reset-password`.

**Cliente:** `/dashboard`, `/dashboard/services[/:id]`,
`/dashboard/billing[/:id, /checkout]`, `/dashboard/support[/:id]`,
`/dashboard/support-inside`, `/dashboard/transparency`.

**Admin/Agente:** `/admin`, `/admin/clients[/:id]`,
`/admin/products[/new, /:id, /:id/edit]`, `/admin/billing[/:id, /checkout]`,
`/admin/support[/:id, /chats]`, `/admin/tasks[/:id]`,
`/admin/support-inside-plans[/:slug]`, `/admin/services`,
`/admin/notifications/templates`, `/admin/jobs/failed`, `/admin/error-log`.

**Features clave:** Auth con 2FA, gestión de servicios, facturación con
checkout multi-step, soporte con chat IA-first, transparencia, gestión de
clientes con notas estructuradas, tareas del día con checklist, catálogo
de productos, planes Support Inside, métricas globales, observabilidad
(jobs fallidos, error log), referidos partner + comisiones.

---

## Componentes existentes

35 componentes en `frontend/app/components/` (lista completa en `PLAN.md`).

Categorías:
- **Base:** Button, Badge, Card, Modal, Input, Select, Textarea, Toast, Avatar,
  Skeleton, StatusDot, Tooltip, Dropdown, Tabs, Breadcrumb, AlertBanner,
  SearchInput, HelpTip
- **Data:** Table, Pagination, StatsCard, BulkActionBar, FilterBar,
  CommandPalette
- **Patrones:** DetailPage, ListPage, FormPage, PageHeader, EditorSectionCard
- **Shell:** Sidebar, AdminSidebar, Topbar, NotificationBell, PortalBadge
- **Soporte:** ChatWidget, SupportPanel
- **Decoración:** GradientMesh

---

## Backend (contexto rápido)

NestJS 11 + PostgreSQL 16 (Prisma 7) + Redis 7 (BullMQ) + Socket.io +
Sentry. Auth JWT + 2FA. Swagger en `/api/v1/docs`. PBAC granular por rol.

No relevante para el diseño excepto para entender qué datos están disponibles.

---

## Estado de desarrollo

- Sprints 0–11 completados (auth, notificaciones, clientes, productos,
  facturación, soporte, tasks, provisioning, audit log, Support Inside,
  Partner).
- Sprint 12 en curso (tareas sin asignar, admin federada).
- La mayoría de páginas funcionales. El programa de diseño es la **capa
  sistemática de UI/UX** sobre algo que ya funciona.

---

## Lo que NO entra en este programa

- Cambios en lógica de negocio o backend.
- Cambios en arquitectura del frontend más allá de tokens/componentes/páginas.
- Renombrar carpetas o reestructurar el árbol de `frontend/app/`.
- Sustituir librerías existentes (Framer Motion, Socket.io, etc.).

Cualquier cosa fuera de scope se escala al usuario.
