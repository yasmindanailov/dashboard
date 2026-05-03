# Fase 2.D — Navegación

> Estado: **en curso**
> Modo: **diseño**
> Output: 5 specs + 5 mockups + sample detail page + audit + NOTES.

---

## Componentes

Tabs, StatusTabs, Breadcrumb, CommandPalette, NotificationBell, PortalBadge.

> Nota: en el código real existen Tabs **y** StatusTabs como componentes
> separados (StatusTabs = tab + count + variant para filtros de listado).
> Specean juntos en `Tabs.md` con sub-sección.

## Heredamos

- DD-021/022/023/024 (tokens marca, voz, firma visual, StatsCard).
- StatusDot + Badge para indicadores en notification items.
- SearchInput pattern para CommandPalette input.
- Dropdown pattern para NotificationBell panel.

## Validación con documento de marca v1.6

Cada componente se valida contra rasgos de marca:

| Rasgo | Aplicación esperada |
|---|---|
| **Experto que empodera** | CommandPalette (productividad), HelpTip (ya en 2.B), tabs descriptivos. |
| **Proactivo** | NotificationBell — "te avisamos antes de que te enteres". |
| **Trato individualizado** | PortalBadge identifica el contexto. Breadcrumb con nombres reales. |
| **Riguroso y consecuente** | Sort, filter, navigation patterns coherentes en toda la app. |
| **Construido para durar** | Patrones estables — cmd+k, breadcrumb, tabs son patrones que perduran. |

## Features del dashboard donde aparecen

| Componente | Páginas / contexto producto |
|---|---|
| **Tabs** | `/dashboard/services/[id]` (Resumen · Servicios · Logs), `/admin/clients/[id]` (Resumen · Servicios · Facturación · Notas · Soporte), `/admin/products/[id]/edit`, `/admin/tasks/[id]`. |
| **StatusTabs** | `/admin/billing` (Todas · Pendientes · Pagadas · Vencidas con counts), `/admin/clients`, `/admin/support`, `/dashboard/billing` cliente. |
| **Breadcrumb** | Páginas profundas. `Admin > Clientes > Floristería Pérez > Notas`, `Cliente > Mis Servicios > hosting-pro-01`. |
| **CommandPalette** | Global Cmd+K. Saltar a página, crear ticket, contratar servicio, búsqueda directa. Productividad staff. |
| **NotificationBell** | Topbar global, todos los roles. Polling 30s. Notificaciones push de tickets, facturas, caídas. |
| **PortalBadge** | Header del sidebar. Identifica `Portal de Administración`, `Portal de Cliente`, `Portal de Partner`. |

## Decisiones a tomar

- **D2D-1**: NotificationBell hex Stripe legacy `#635BFF` → migrar a `--brand`. Mismo refactor para resto de hex.
- **D2D-2**: NotificationBell badge count usa `#EF4444` literal → `--danger`. Y aplicar StatusDot.pulse cuando hay nuevas (DD-023 firma).
- **D2D-3**: CommandPalette `--surface-hover` no existe en tokens. Bug. Migrar a `--surface-secondary` o `--brand-subtle` según semántica.
- **D2D-4**: PortalBadge falta variant `agent`. Decidir: mismo que admin (comparten shell) o separado.
- **D2D-5**: PortalBadge — aplicar `.aelium-dot.accent` antes del logo según portal — refuerzo de identidad.
- **D2D-6**: Tabs activo border-bottom brand — mantener (es el patrón horizontal correcto). NO aplicar `accent-stripe-left` (es para verticales).

## Plan

1. ✅ Audit (`audit-existing.md`).
2. ✅ CSS compartido en `styles.css`.
3. ✅ 5 specs.
4. ✅ 5 mockups.
5. ✅ **Sample detail page** — `pages/admin-cliente-detalle.html`: detalle de cliente con Breadcrumb + Tabs + StatusTabs interno + NotificationBell en topbar.
6. ✅ NOTES + commit.
