# Bitácora del rediseño UI — F2 (shells) · sesión 2026-06-27

> Registro riguroso de la **fase F2 del rediseño UI** (reconstruir
> `DashboardShell` + `AdminShell` 1:1 con los mockups vivos `Shell.dc.html` /
> `admin/Shell.dc.html`). Continúa la
> [bitácora F0+F1](./ui-redesign-bitacora-2026-06-27.md) y el
> [plan](./ui-migration-plan-2026-06-26.md) /
> [backlog](./ui-migration-backlog-2026-06-26.md).
> **Rama:** `redesign/f2-shells` (desde `redesign/f1cd-marca`). **Todo verde.**

## 0. Resumen ejecutivo

Se reconstruyeron **ambos shells** (cliente + admin) idénticos al mockup,
**primero componentes y luego layouts** (directriz Yasmin). Método por pieza:
spec exacto del mockup → tokens del DS (R16) → iconos Lucide (D1) → verificación.
**12 commits** atómicos. Cierre: typecheck + lint:check (max-warnings 0) +
**48/48 tests** + `next build` (boot smoke) + **screenshots Playwright de los dos
shells sobre build limpio** (cliente y admin, login real con 2FA). Todo verde.

## 1. Decisiones tomadas (Yasmin, esta sesión)

- **Sidebar admin = solo grupo "Operaciones" (7 items)**: Inicio, Clientes,
  Productos, Support Inside, Servicios, Facturación, Soporte. Las tools de
  plataforma (Settings, Equipo, Error Log, Jobs DLQ, Plantillas, Borrado) **salen
  del nav** → viven como **cards en Settings** (reskin F4). "Chat en vivo" →
  tarjeta del footer; "Tareas" → pill del topbar. Rutas vivas, solo desenlazadas.
- **Sidebar cliente = 6 items**: Inicio, Tienda, Mis servicios, Mis facturas,
  Soporte, Support Inside. Fuera "Dominios" y "Mi perfil" (IA reordenada; perfil
  en el menú del topbar). Solo se tocó la sección `client`; **rama `partner`
  intacta**.
- **«Equipo»** (gestión de usuarios/agentes, `/admin/users`): **no estaba en el
  mockup de Settings** → Yasmin lo confirma como **card en Settings (F4)** y
  encargará su mockup a claude design al llegar a esa página. En F2 se quita del
  sidebar (ruta viva, accesible por URL hasta F4).
- **⌘K**: el admin lo mantiene (el mockup lo trae, con palette rica); el **cliente
  no** (el mockup cliente no lo tiene) → se retira trigger + listener +
  `CommandPalette` del shell cliente.

## 2. Qué se construyó (por commit)

**Tokens + componentes (1-8):**
- **Tokens de shell** en `globals.css` (R16): `--shell-sidebar-bg #F8FAFF`,
  `--sidebar-width-admin 256px`, item activo "Tarjeta" (bg/ring/shadow), iconos
  nav, `--brand-wash`, presencia, badge "en espera", estado vencido. Arregla el
  token muerto `--topbar-height` (56→64). Keyframes (`aelPing`, etc.) en el CSS
  module de su componente.
- **`CollapseToggle`** (compartido): chevron flotante `right:-13px`, rota 180°.
- **`NotificationBell`** reskin del popover (chrome, "Marcar leídas", "Ver todas",
  badge); arregla el púrpura residual `rgba(99,91,255)`→`--brand-subtle` que F0.2
  no cazó; bell inline→Lucide. Icon-wells por categoría/tono → `TODO(E10)`.
- **`SidebarSupportCard` + `SidebarSupportMini`** (cliente): técnico + presencia
  (fallback, `TODO(F3/E8)`) sobre `SidebarConversationList` (F1) + FAB colapsado.
- **`Breadcrumbs`** (cliente).
- **`AdminLiveChatCard` + `AdminLiveChatMini`** (footer admin): ping `aelPing`,
  "N en espera", "Abrir panel de chats"→ruta real; cola enriquecida `TODO(F3)`.
- **`TasksPill` + `TasksPopover`** (topbar admin): datos **reales** vía
  `listTasksAction` (scope mine, poll 60s); agrupa Vencidas/Hoy/Semana/Más
  adelante; mapea el modelo `Task` al mockup vía `SOURCE_LABELS`; helpers puros
  separados (R15).

**Layouts (9-12):**
- **`ClientSidebar`** reconstruido: 6 items, skin Tarjeta + rombo, Lucide, slot de
  soporte, `CollapseToggle`. Config de nav extraída a `nav-items.ts` (módulo puro,
  testeable) + **test de matriz de nav** (cliente=6, partner intacto).
- **`AdminSidebar`** reconstruido: 7 Operaciones, slot "Chat en vivo", sin
  `useTasksBadge`. **Fix bug latente**: "Inicio" (`/admin`) se activaba en toda
  subruta por `startsWith` → lógica de prefijo más largo (igual que el cliente).
- **`Topbar`** por slots (`left` = migas/título, `actions` = TasksPill, ⌘K
  condicional); quita el SupportButton (soporte → sidebar); iconos Lucide.
- **`DashboardShell`/`AdminShell`** compuestos: márgenes tokenizados, **fix del
  margen admin (256 vía `--sidebar-width-admin`, antes 260 hardcodeado)**,
  contenedor centrado del mockup (max-width 1320/1200), `padding-top` tokenizado;
  cliente sin `CommandPalette`/⌘K. `portalLabelForRole` alineado al mockup
  ("Portal de cliente" / "Panel de administración").

## 3. Datos reales vs. frontera F3 (lo diferido, trazado)

| Widget | F2 (real) | Diferido |
|---|---|---|
| TasksPill admin | `listTasksAction` (mine, 60s) + agrupado + navegación | **inline-complete con nota** (ADR-079 exige nota/bridge) → follow-up F3 |
| Tarjeta soporte cliente | conversaciones reales (`listChatsAction`) + CTA→`SupportPanel` real | **técnico + presencia** (sin endpoint) → **F3/E8** |
| Tarjeta "Chat en vivo" admin | estructura + "Abrir panel"→ruta real | **cola enriquecida** (nombre/iniciales/espera) → **F3** |
| Campana, perfil/avatar | reales (`fetchUnreadNotificationsAction`, `useAuth`) | icon-wells por categoría/tono → **E10** |

> **Desviación dictada por regla (L18):** el "completar inline con nota" del
> popover de tareas del mockup NO se incluye — `completeTaskAction` exige nota (y
> bridge/log según tipo, ADR-079). El popover es triage + navegación; el cierre
> con nota vive en el detalle de la tarea. Como D-2/D-3, el dashboard se aparta del
> mockup en ese punto por regla.

## 4. Verificación (empírica)

- `pnpm --dir frontend typecheck && lint:check` (max-warnings 0) verdes tras cada
  commit; **48/48 tests** (incluido el nuevo de matriz de nav + ajuste de
  `portal.test.ts`).
- **`pnpm --dir frontend build`** (boot smoke) OK — `/dashboard` y `/admin` en el
  manifiesto, sin errores de SSR.
- **QA visual Playwright** (login real: cliente sin 2FA + superadmin con 2FA vía
  MailPit) **sobre build limpio (`next start`)**, viewport 1440×900:
  - **Cliente** ✓: 6 items, activo Tarjeta+rombo, fondo `#F8FAFF`, toggle
    flotante, **tarjeta de soporte con conversación real + "Escribir a Soporte"**,
    topbar = migas + campana + perfil (sin ⌘K).
  - **Admin** ✓: 7 Operaciones, activo Tarjeta+rombo, **tarjeta "Chat en vivo"**,
    topbar = **título** (cambia por ruta Inicio→Clientes) + **⌘K** + **TasksPill**
    + campana + perfil; nav activo conmuta correctamente.

> **Caveat de entorno (no es bug):** el `next dev` (Turbopack) **no aplicó por HMR
> el token nuevo `--sidebar-width-admin`** de `globals.css` → en `:3002` el shell
> admin se veía con el sidebar/topbar mal posicionados. El **build de producción
> sí tiene el token** (verificado) y renderiza correcto. **Acción:** reiniciar el
> `pnpm --dir frontend dev` para ver F2 bien en `:3002`.

## 5. Estado y siguiente paso

- **F2 CÓDIGO-COMPLETO y verde** (12 commits en `redesign/f2-shells`). Falta el
  **merge** (cuando Yasmin valide) y su smoke visual en `:3002` tras reiniciar dev.
- **Pendiente del rediseño:** **F3** (verticales con backend: Stripe E6, dashboard
  ejecutivo E7, SI gestionado E8, SLA E9, notificaciones E10, registro fiscal E11,
  macros E12, IA E13) y **F4** (reskin página a página, incluyendo el **hub de
  Settings con las cards de plataforma + Equipo**, el ChatWidget/FloatingChat que
  hoy solapa el footer del sidebar, y el resto de superficies).
- **Pendiente F1d:** favicon + loader animado (la entrada animada del logo
  `aelLogoL/R` se difirió a ese trabajo).
