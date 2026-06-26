/**
 * Setup global de Jest — se ejecuta antes de cada suite (setupFilesAfterEnv).
 *
 * Importa los matchers de DOM de Testing Library (`toBeInTheDocument`,
 * `toHaveClass`, `toHaveTextContent`, …) y registra su augmentación de tipos
 * sobre `expect`, válida en todo el programa de tests.
 *   Ref: node_modules/next/dist/docs/01-app/02-guides/testing/jest.md §"custom matchers"
 */
import '@testing-library/jest-dom';
