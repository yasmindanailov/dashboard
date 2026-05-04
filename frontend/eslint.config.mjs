import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Permite parámetros/variables con prefijo `_` como "intencionalmente
      // no usado" (ej: callbacks de evento donde solo importan algunos args).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],

      // ── Sprint 13 §13.AUTH Fase F (Opción B — 2026-05-03) ─────────
      // `react-hooks/set-state-in-effect` (eslint-plugin-react-hooks 7.x,
      // alineada con React 19 + React Compiler) marca como error patrones
      // donde se llama setState dentro del cuerpo síncrono de un useEffect.
      //
      // El antipatrón canónico DC.6
      //   `useEffect(() => { setLoading(true); api.X(token).then(setData) }, [])`
      // está completamente erradicado por la migración a Server Components
      // + Server Actions (ADR-078 Amendment A1).
      //
      // Doctrina Opción B: la regla queda a `error` GLOBAL, sin override
      // de archivo. Los call-sites legítimos con patrones React 19
      // idiomáticos (WS subscribe, polling timers, mobile drawer sync,
      // lazy load on tab/prop, modal reset post-mount) llevan supresión
      // PER-LÍNEA con justificación inline:
      //   // eslint-disable-next-line react-hooks/set-state-in-effect -- <razón>
      // Beneficio: granularidad real (un bug nuevo en otra línea del
      // mismo archivo SÍ se caza); auditable; convención estándar React.
      // ──────────────────────────────────────────────────────────────
      "react-hooks/set-state-in-effect": "error",
    },
  },
  /* ─────────────────────────────────────────────────────────────────
     Override Sprint 13 §13.AUTH Fase F — `react-hooks/exhaustive-deps`.

     Los archivos listados contienen patrones React 19 donde la regla
     `exhaustive-deps` produce falsos positivos masivos por dependencias
     que vienen de refs estables (timers, sockets, route params usadas
     una sola vez por mount). Mantener `off` per-archivo es la convención
     estándar React para estos casos.

     NOTA: `set-state-in-effect` se gestiona ahora con supresión
     per-línea (Opción B), no en este override.
     ───────────────────────────────────────────────────────────────── */
  {
    files: [
      // WS subscribe pattern (Socket.IO handlers).
      "app/_shared/support/conversation/useConversationDetail.ts",
      "app/admin/support/chats/useChatPanel.ts",
      "app/components/ChatWidget/useChatWidget.ts",
      // Polling timers (notifications, tasks badge).
      "app/_shared/shell/NotificationBell.tsx",
      "app/admin/AdminSidebar.tsx",
      // Mobile drawer + command palette sync con route change.
      "app/admin/_components/AdminShell.tsx",
      "app/dashboard/_components/DashboardShell.tsx",
      "app/components/ui/CommandPalette/CommandPalette.tsx",
      // Lazy load on tab/prop change. (Glob patterns escapan `[id]`
      // por incompat ESLint flat config + minimatch).
      "app/admin/clients/**/ClientDetailView.tsx",
      "app/_shared/support/conversation/ConversationSidebar.tsx",
      "app/_shared/support/useTicketInbox.ts",
      "app/_shared/widgets/TasksWidget.tsx",
      "app/_shared/billing/checkout/useCheckout.ts",
      "app/dashboard/support-inside/page.tsx",
      // Modal reset on close + lazy load on open.
      "app/_shared/notes/ExceptionalNoteModal.tsx",
      "app/_shared/tasks/CompleteTaskModal.tsx",
      "app/_shared/tasks/MaintenanceLogModal.tsx",
      "app/_shared/tasks/ReassignTaskModal.tsx",
      // Toast timers + Toast cleanup.
      "app/components/ui/Toast/Toast.tsx",
    ],
    rules: {
      "react-hooks/exhaustive-deps": "off",
    },
  },
]);

export default eslintConfig;
