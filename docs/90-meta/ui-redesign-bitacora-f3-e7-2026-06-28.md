# Bitácora del rediseño UI — F3·E7 (dashboard ejecutivo admin) · sesión 2026-06-28

> Registro riguroso de la **vertical F3·E7**: montar `/admin` como **dashboard
> ejecutivo** 1:1 con el mockup vivo `admin/Inicio.dc.html`. Primera vertical F3
> (backend + frontend) del rediseño. Continúa la fundación F0/F1/F1d/F2 (toda en
> master). **Rama:** `redesign/f3-admin-overview` (desde `origin/master`). Verde.

## 0. Resumen ejecutivo

`/admin` deja de ser el toolbox de GL-22 (para rol admin) y pasa a ser el **panel
ejecutivo** del mockup: cabecera + **4 KPI cards** + columna **"Requiere tu
decisión"** + columna **"Carga del equipo"**. Todo sobre datos que **ya existen**
(cero modelos nuevos). Dos fases: **A** backend (módulo `admin-overview`, 3
endpoints), **B** frontend (reskin de `/admin`). Verde en ambos lados +
boot smoke 4/4. Decisión de alcance de Yasmin: el follow-up de drift **NO** se
hace ahora (queda anotado).

## 1. Phase A — backend (commit `7adb408`)

Módulo **`admin-overview`** (espejo de `DashboardModule`: solo depende de
`PrismaService` global → DI mínima). Gate: `JwtAuthGuard + AdminOnlyGuard` (staff)
+ comprobación explícita de **rol admin** (`superadmin`/`agent_full`) — los KPIs
exponen ingresos globales, que un `agent_*` no debe ver.

| Endpoint | Devuelve | Fuente real (verificada) |
|---|---|---|
| `GET /admin/overview` | KPIs: ingresos del mes (+MoM%), clientes activos (+nuevos), por cobrar vencido (importe+nº+antigüedad), SLA soporte (% + breaches, ventana 30d) | `Invoice` (paid/overdue, `paid_at`/`due_date`), `User` (role client, `created_at`), join SLA `Conversation.first_response_at` vs `SupportInsideConfig.response_sla_hours` |
| `GET /admin/overview/decisions` | feed de señales (solo count>0): facturas vencidas, **5xx última hora** (`ErrorLog.metadata.status≥500`), **DLQ** (`FailedJob.status='failed'`), **SI sin mantenimiento >60d** (`MaintenanceLog.performed_at`) | empírico vía Explore |
| `GET /admin/overview/team-load` | conversaciones abiertas por agente (`Conversation.groupBy(assigned_agent_id)`) + saturación + presencia (`Session.last_used_at <10min`) | — |

**Decisiones de implementación (flageadas):**
- **Drift de configuración** (5ª señal del mockup) — **DIFERIDA**. No hay estado de
  drift persistente: se computa al vuelo por reconcile (`ServiceReconcileResult.
  driftsDetected`, en memoria) y se descarta; el `Service` no tiene columna de
  drift. Contarlo en vivo = re-reconciliar cada servicio contra los proveedores en
  cada carga (inaceptable). Follow-up limpio: `Service.has_drift` escrito por el
  cron de reconcile. **Yasmin: no hacerlo ahora.**
- **Presencia** — no hay infra; derivada de sesiones activas recientes (proxy real).
- **Ventana SLA** — 30 días.

**Verificación:** typecheck + lint + **5 unit** (`admin-overview.service.spec`:
MoM %, antigüedad, breach SLA, filtrado del feed, orden/presencia/max del equipo) +
suite backend completa **1386** + **boot smoke**: `AdminOverviewModule dependencies
initialized` + `Nest application successfully started` + **4/4 plugins** + las **3
rutas mapeadas**. Sin `UnknownDependenciesException`.

## 2. Phase B — frontend (reskin de `/admin`)

- `lib/api/dashboard.ts`: tipos del contrato (`AdminOverviewKpis`,
  `DecisionSignal`, `TeamLoad`…), reexportados por el barrel.
- `admin/_components/ExecutiveDashboard.tsx` (+ `.module.css`): **Server Component**
  presentacional, server-compatible (navega con `<Link>`, sin hooks). Reutiliza
  primitivas F1a: **IconWell** (icon-wells por tono), **Avatar** + **StatusDot**
  (presencia). Las barras (SLA + saturación) son minimalistas inline vía custom
  property `--bar-w` (patrón `Meter`; su semántica used/total no encajaba). Mapea
  cada `DecisionSignal.kind` → icono/tono/título/detalle/acción/href (i18n inline,
  estilo de la página). Plurales + estados vacíos (feed "Todo en orden", equipo
  vacío) + aviso de sobrecarga cubiertos.
- `admin/page.tsx`: branch por rol — **admin** (`superadmin`/`agent_full`) → fetch
  paralelo de los 3 endpoints (`serverFetchOrNull`, degrada si uno falla) +
  `ExecutiveDashboard`; **agente** → su overview operativo GL-22 **intacto** (cero
  regresión). El mockup no lleva TasksWidget ni accesos rápidos (van al pill del
  topbar / sidebar de F2) → fuera del panel admin, presentes en el path de agente.

**Verificación:** typecheck + lint:check (max-warnings 0) + **48/48 tests** +
`next build` (`/admin` compila, sin errores SSR).

## 3. Estado y siguiente paso

- **E7 CÓDIGO-COMPLETO y verde** (back + front) en `redesign/f3-admin-overview`.
  **PR contra master** (back+front en un solo PR).
- **Falta (Yasmin): smoke visual** de `/admin` como superadmin/agent_full.
  **⚠️ Importante:** el backend en `:3001` corre el código viejo — hay que
  **reiniciarlo** para cargar el módulo `admin-overview`; si no, los 3 fetch dan
  404 y el panel sale vacío (degradación controlada).
- Diferido anotado: señal de **drift** del feed (requiere `Service.has_drift`
  persistido por el cron de reconcile).
- Resto de F3: Stripe E6 (cobro), SI gestionado E8, SLA viz E9, notificaciones E10,
  registro fiscal E11, macros E12, IA E13. F4 reskin página a página.
