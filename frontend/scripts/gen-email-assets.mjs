// Genera los assets PNG del correo (logo + iconos de estado) desde SVG, con
// sharp (supersampling). Fuente de verdad de diseño: mockup-uiux/Layout de
// Correo.dc.html + Correo Ejemplo Pago.dc.html.
//
// Email-safe: los correos NO renderizan SVG (Gmail lo elimina) → servimos PNG
// hospedados en /public/brand/email/*.png referenciados por URL absoluta.
// Degradación elegante: si el cliente bloquea imágenes, la banda de acento +
// la etiqueta de color + el texto "aelium" siguen comunicando todo.
//
//   node scripts/gen-email-assets.mjs   (desde frontend/)
import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../public/brand/email');
mkdirSync(OUT, { recursive: true });

// Rombo de marca: dos cuadrados redondeados rotados 45° (claro detrás + azul
// delante), 1:1 con la cabecera del mockup del correo.
// viewBox recortado a la caja real del rombo (sin padding sobrante).
const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="6 7 34 22">
  <rect x="7.5" y="8.5" width="19" height="19" rx="6" fill="#BFDBFE" transform="rotate(45 17 18)"/>
  <rect x="19.5" y="8.5" width="19" height="19" rx="6" fill="#3B82F6" transform="rotate(45 29 18)"/>
</svg>`;

// Iconos de línea del mockup (viewBox 24), trazo en el color fg del tono.
const icon = (stroke, inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

const icons = {
  'status-info': icon(
    '#2563EB',
    '<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  ),
  'status-success': icon(
    '#059669',
    '<circle cx="12" cy="12" r="9"/><polyline points="8.4 12.3 11 14.8 15.8 9.4"/>',
  ),
  'status-warning': icon(
    '#B45309',
    '<path d="M10.3 4.4 2.5 18a1.5 1.5 0 0 0 1.3 2.2h16.4A1.5 1.5 0 0 0 21.5 18L13.7 4.4a1.5 1.5 0 0 0-2.6 0z"/><line x1="12" y1="10" x2="12" y2="14"/><line x1="12" y1="17.4" x2="12.01" y2="17.4"/>',
  ),
  'status-danger': icon(
    '#DC2626',
    '<polygon points="8 3 16 3 21 8 21 16 16 21 8 21 3 16 3 8"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16.4" x2="12.01" y2="16.4"/>',
  ),
};

const render = (svg, width, file) =>
  sharp(Buffer.from(svg), { density: 384 })
    .resize({ width })
    .png()
    .toFile(resolve(OUT, file));

await render(logoSvg, 120, 'logo.png'); // ~120x94 → se muestra a 40x31
for (const [name, svg] of Object.entries(icons)) {
  await render(svg, 84, `${name}.png`); // 84x84 → se muestra a 21x21
}
console.log('✓ email assets generados en', OUT);
