import * as fs from 'fs';
import * as path from 'path';

/**
 * Sprint 8 Fase B EC-T8-17 (2026-04-29) + GL-25 (audit 2026-06-25) — Guard de
 * seguridad de plantillas Handlebars seedeadas.
 *
 * Dos clases de patrón inseguro que abren XSS si la variable contiene HTML
 * controlado por usuario:
 *  1. Render crudo explícito: `{{{...}}}` (triple-stash) o `{{& ...}}`.
 *  2. ⚠️ **GL-25** — `{{var}}` a secas en una plantilla de **canal email**: el
 *     render compila email con `noEscape:true` (el HTML lo escribe el admin),
 *     así que `{{var}}` **NO escapa** ahí. El contenido de origen usuario DEBE
 *     usar el helper `{{e var}}` (escape vía SafeString). Antes de GL-25 el
 *     comentario del seed afirmaba (erróneamente) que `{{var}}` escapaba siempre.
 *
 * Este test fija la regla leyendo el fuente del seed como texto y rechazando los
 * patrones unsafe. Deliberadamente simple: cualquier futuro override del seed
 * ejecuta el guard en `pnpm test`.
 */
describe('notification-templates.ts — EC-T8-17 + GL-25 sin patrones unsafe', () => {
  const seedPath = path.resolve(
    __dirname,
    '../../../prisma/seeds/notification-templates.ts',
  );

  /** Comentarios de línea/bloque fuera (mencionan los patrones prohibidos). */
  function codeOnly(): string {
    const src = fs.readFileSync(seedPath, 'utf8');
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  }

  it('el archivo de seed existe y es legible', () => {
    expect(fs.existsSync(seedPath)).toBe(true);
  });

  it('no contiene `{{{...}}}` (triple-stash unescaped)', () => {
    expect(codeOnly()).not.toMatch(/\{\{\{[^}]+\}\}\}/);
  });

  it('no contiene `{{& ...}}` (ampersand unescaped)', () => {
    expect(codeOnly()).not.toMatch(/\{\{\s*&/);
  });

  // GL-25: las variables de origen USUARIO deben ir como `{{e var}}` (nunca
  // `{{var}}` a secas), porque en el canal email `{{var}}` no escapa. Esta lista
  // es la de contenido controlable por el usuario/cliente que llega a un email.
  it('contenido de usuario usa `{{e var}}`, no `{{var}}` a secas (anti-inyección email)', () => {
    const src = codeOnly();
    const USER_VARS = [
      'subject',
      'preview',
      'channel',
      'notes',
      'client_notes',
      'task_reason',
      'recipient.first_name',
      'recipient.last_name',
    ];
    const offenders: string[] = [];
    for (const v of USER_VARS) {
      // `{{ var }}` a secas (no `{{e var}}`, no `{{#if var}}`): el `\s*` tras
      // `{{` no casa con `#if ` ni con `e `.
      const bare = new RegExp(`\\{\\{\\s*${v.replace(/\./g, '\\.')}\\s*\\}\\}`);
      if (bare.test(src)) offenders.push(v);
    }
    expect(offenders).toEqual([]);
  });
});
