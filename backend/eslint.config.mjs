// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      // Permite parámetros/variables con prefijo `_` como "intencionalmente
      // no usado" (ej: contratos de callback, parámetros de interface).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
  // Sprint 11 Fase 11.C — EC-P11-10 + R4: los plugins de provisioning
  // SOLO pueden importar de `core/provisioning/*` (contrato + librería de
  // wrappers). NUNCA de `modules/provisioning/*` (orquestador) — el sentido
  // de la dependencia es plugin → core, no plugin → orquestador. Si se
  // diera, romperíamos R4 + crearíamos ciclo de imports y los plugins
  // tendrían acceso al EventEmitter / Prisma / Redis del orquestador.
  // Esta regla cubre los plugins triviales hoy y los reales (Sprint
  // 15A/C/D/E/G) automáticamente cuando se añadan al directorio.
  {
    files: ['src/plugins/provisioners/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/modules/provisioning/*',
                '**/modules/provisioning',
                '../../modules/provisioning/*',
                '../../../modules/provisioning/*',
              ],
              message:
                'R4 + EC-P11-10: los plugins de provisioning NO importan del orquestador (modules/provisioning). Usa core/provisioning/types (contrato) o core/provisioning/plugin-utils (wrappers). Ver ADR-077 §5.',
            },
          ],
        },
      ],
    },
  },
);
