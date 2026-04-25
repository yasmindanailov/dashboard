/**
 * Configuración de lint-staged para el monorepo Aelium Dashboard.
 *
 * Backend y frontend son proyectos pnpm independientes con su propio ESLint.
 * lint-staged pasa rutas absolutas; convertimos a rutas relativas al proyecto
 * y ejecutamos el ESLint correspondiente con `cd <proyecto>`.
 *
 * Solo se procesan archivos staged en el commit (rápido).
 */

const path = require('path');

const repoRoot = __dirname;

/**
 * Convierte rutas absolutas a relativas a un subproyecto y filtra solo las
 * que pertenecen a ese subproyecto.
 */
function relativeTo(subproject, files) {
  const projectRoot = path.join(repoRoot, subproject);
  return files
    .filter((f) => f.startsWith(projectRoot))
    .map((f) => path.relative(projectRoot, f).replace(/\\/g, '/'));
}

/**
 * Construye comando ESLint para un subproyecto, escapando rutas con espacios.
 */
function buildEslintCommand(subproject, files) {
  if (files.length === 0) return [];
  const quoted = files.map((f) => `"${f}"`).join(' ');
  // Sin --max-warnings=0 hasta que F0.6 sanee los 344 errores existentes.
  // Por ahora ESLint solo bloquea por errores reales, no por warnings.
  return [`cd ${subproject} && pnpm exec eslint --fix ${quoted}`];
}

module.exports = {
  // Archivos backend
  'backend/**/*.{ts,js}': (files) => {
    const rel = relativeTo('backend', files);
    return buildEslintCommand('backend', rel);
  },

  // Archivos frontend
  'frontend/**/*.{ts,tsx,js,jsx}': (files) => {
    const rel = relativeTo('frontend', files);
    return buildEslintCommand('frontend', rel);
  },
};
