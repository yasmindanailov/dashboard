import * as fs from 'fs';
import * as path from 'path';

/**
 * Sprint 8 Fase B EC-T8-17 (2026-04-29) — Guard de seguridad de plantillas.
 *
 * Las plantillas Handlebars seedeadas deben usar SIEMPRE `{{var}}` (escape
 * automático). Cualquier introducción de `{{{...}}}` o `{{& ...}}` permite
 * que el contenido se renderice sin escapar y abre XSS si la variable
 * contiene HTML controlado por usuario (ej. `task_url`, `assigned_by`,
 * descripción libre, etc.).
 *
 * Este test fija la regla canónica del seed (`prisma/seeds/notification-
 * templates.ts`) leyendo el fuente como texto y rechazando los patrones
 * unsafe. Es deliberadamente simple: cualquier futuro override del seed
 * ejecuta el guard en `pnpm test`.
 */
describe('notification-templates.ts — EC-T8-17 sin patrones Handlebars unsafe', () => {
  const seedPath = path.resolve(
    __dirname,
    '../../../prisma/seeds/notification-templates.ts',
  );

  it('el archivo de seed existe y es legible', () => {
    expect(fs.existsSync(seedPath)).toBe(true);
  });

  it('no contiene `{{{...}}}` (triple-stash unescaped)', () => {
    const src = fs.readFileSync(seedPath, 'utf8');
    // Filtra el comentario canónico que documenta la regla — sólo ahí se
    // permite mencionar el patrón prohibido para que la regla quede legible.
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(codeOnly).not.toMatch(/\{\{\{[^}]+\}\}\}/);
  });

  it('no contiene `{{& ...}}` (ampersand unescaped)', () => {
    const src = fs.readFileSync(seedPath, 'utf8');
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(codeOnly).not.toMatch(/\{\{\s*&/);
  });
});
