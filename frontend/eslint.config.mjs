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

      // ── Sprint 13 §13.AUTH Fase E (cierre 2026-05-03) ──────────────
      // `react-hooks/set-state-in-effect` (regla nueva en
      // eslint-plugin-react-hooks 7.x, alineada con React 19 + React
      // Compiler) marca como warning patrones donde se llama setState
      // dentro del cuerpo síncrono de un useEffect.
      //
      // Estado: el antipatrón canónico DC.6
      //   `useEffect(() => { setLoading(true); api.X(token).then(setData) }, [])`
      // está completamente erradicado por la migración a Server Components
      // + Server Actions (ADR-078 Amendment A1). Las pages que cargaban
      // datos así son ahora SC nativos con `serverFetch`, o invocan
      // Server Actions desde event handlers (no useEffect).
      //
      // Promovida a `error` para detectar regresiones del antipatrón.
      // Los archivos legítimos con sincronización a sistemas externos
      // (WS subscribe, polling timers, sync UI con route/tab/prop)
      // están listados en el override de abajo con `off` + justificación.
      // ──────────────────────────────────────────────────────────────
      "react-hooks/set-state-in-effect": "error",
    },
  },
  /* ─────────────────────────────────────────────────────────────────
     Override Sprint 13 §13.AUTH Fase E — Patrones React 19 legítimos.
     React docs: https://react.dev/learn/synchronizing-with-effects

     Los archivos listados aquí contienen patrones React 19 idiomáticos
     donde setState dentro de useEffect es el flujo canónico:
       - WS subscribe (Socket.IO handlers que mutan state local en
         respuesta a eventos remotos).
       - Polling timers (setInterval que actualiza counters).
       - Mobile drawer / palette sync con cambio de route.
       - Lazy load on tab/prop change.
       - Modal reset on close.
       - Setup post-mount one-shot (keyboard, ref init).

     NO son el antipatrón DC.6 (`fetch+setState en mount`); ese flujo
     ya está cerrado por la migración SC + Server Actions.
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
      "react-hooks/set-state-in-effect": "off",
      /* Toast también usa ref.current dentro de cleanup — pattern
         válido cuando el ref es una colección de timers que la cleanup
         debe iterar. */
      "react-hooks/exhaustive-deps": "off",
    },
  },
]);

export default eslintConfig;
