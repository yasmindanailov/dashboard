/**
 * Configuración de commitlint para Aelium Dashboard.
 *
 * Basado en Conventional Commits (https://www.conventionalcommits.org/)
 * con tipos extendidos y scopes alineados a la estructura modular del proyecto.
 *
 * Formato esperado:
 *   <type>(<scope>): <subject>
 *
 *   [body opcional]
 *
 *   [footer opcional]
 *
 * Ejemplos válidos:
 *   feat(auth): añade refresh token
 *   fix(billing): corrige cálculo IVA en facturas con descuento
 *   refactor(regla-15): divide billing.service en sub-servicios
 *   docs(adr): añade ADR-014 sobre estrategia de provisioning
 *   ci: actualiza pnpm a 10.33.0
 *   chore(format): aplica prettier al codebase
 */

module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Tipos permitidos. Alineados con la convención del proyecto observada en
    // commits previos: feat, fix, refactor, chore, docs, ci, build, test, perf, style.
    'type-enum': [
      2,
      'always',
      [
        'feat', // Nueva funcionalidad
        'fix', // Corrección de bug
        'refactor', // Cambio de código sin cambiar comportamiento
        'chore', // Tareas de mantenimiento (deps, format, configs)
        'docs', // Solo documentación
        'ci', // Cambios en CI/CD
        'build', // Cambios en build system o dependencias
        'test', // Añadir o modificar tests
        'perf', // Mejoras de rendimiento
        'style', // Cambios de estilo (espacios, formato — no afecta lógica)
        'revert', // Revertir un commit anterior
      ],
    ],

    // Scope opcional pero, si se usa, debe ser de la lista. Refleja módulos
    // del proyecto. Añadir nuevos scopes aquí cuando aparezcan módulos.
    'scope-enum': [
      1, // Nivel 1 = warning. No bloquea, solo avisa si el scope no está listado.
      'always',
      [
        // Backend modules
        'auth',
        'clients',
        'products',
        'billing',
        'support',
        'tasks',
        'dashboard',
        'partner',
        'audit',
        'settings',
        'email',
        'notifications',
        'casl',
        'prisma',

        // Frontend areas
        'ds', // Design System
        'ui', // UI genérico
        'layout',

        // Cross-cutting
        'regla-15', // Refactorizaciones por Regla 15
        'sprint-0',
        'sprint-1',
        'sprint-2',
        'sprint-3',
        'sprint-4',
        'sprint-5',
        'sprint-6',
        'sprint-7',
        'sprint-8',

        // Tooling
        'ci',
        'deps',
        'format',
        'adr',
        'F0',
        'F0.1',
        'F0.2',
        'F0.3',
        'F0.4',
        'F0.5',
        'F0.6',
        'F0.7',
      ],
    ],

    // Sujeto: longitud razonable para que git log sea legible.
    'subject-max-length': [2, 'always', 100],
    'subject-min-length': [2, 'always', 5],

    // Cabecera completa: tipo + scope + sujeto.
    'header-max-length': [2, 'always', 120],

    // Permitir sujetos en español sin restringir mayúsculas/minúsculas iniciales.
    // (config-conventional fuerza lower-case por defecto, lo desactivamos.)
    'subject-case': [0],
  },
};
