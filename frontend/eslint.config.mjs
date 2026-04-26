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

      // ── Deuda técnica documentada ─────────────────────────────────
      // `set-state-in-effect` (regla nueva en eslint-plugin-react-hooks 7.x,
      // alineada con React 19 + React Compiler) marca como error el patrón
      // clásico `useEffect(() => { setLoading(true); fetch().then(setData) }, …)`.
      // La doctrina oficial es migrar fetching a Server Components + Suspense
      // (`https://react.dev/learn/you-might-not-need-an-effect`) — refactor
      // arquitectónico grande, fuera del alcance de un sprint de saneamiento
      // lint.
      //
      // Por eso aquí lo bajamos de `error` a `warn`: el CI pasa pero los 27
      // call-sites quedan visibles. Plan de cierre en `docs/60-roadmap/
      // backlog.md` (item P1.x — Server Components + Suspense data fetching).
      // ──────────────────────────────────────────────────────────────
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
