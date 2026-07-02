import {
  buildEmailLayout,
  emailButton,
  emailCodeBox,
  emailDataBox,
  emailHeading,
  emailSemanticVars,
  esc,
  isEmailSemantic,
} from './email-layout';

/**
 * Tests unit del layout maestro de email (F4·W3). Ancla lo robusto: HTML
 * email-safe (tablas), banda de acento por `semantic`, cabecera/footer fijos,
 * escape del contenido, y los bloques del cuerpo.
 */
describe('email-layout', () => {
  describe('esc', () => {
    it('escapa los caracteres peligrosos de HTML', () => {
      expect(esc('<script>&"\'')).toBe('&lt;script&gt;&amp;&quot;&#39;');
    });
  });

  describe('isEmailSemantic', () => {
    it('acepta los 4 tonos y rechaza el resto', () => {
      for (const v of ['info', 'success', 'warning', 'danger']) {
        expect(isEmailSemantic(v)).toBe(true);
      }
      expect(isEmailSemantic('nope')).toBe(false);
      expect(isEmailSemantic(null)).toBe(false);
      expect(isEmailSemantic(undefined)).toBe(false);
    });
  });

  describe('emailSemanticVars', () => {
    it('devuelve los colores del tono', () => {
      expect(emailSemanticVars('success')).toEqual({
        accent: '#10B981',
        tint: '#ECFDF5',
        fg: '#059669',
      });
    });
  });

  describe('buildEmailLayout', () => {
    it('genera un documento HTML email-safe (tablas, sin flexbox/svg)', () => {
      const html = buildEmailLayout({
        semantic: 'info',
        bodyHtml: '<p>Cuerpo</p>',
      });
      expect(html).toContain('<!DOCTYPE');
      expect(html).toContain('role="presentation"'); // tablas de layout
      expect(html).not.toContain('display:flex');
      expect(html).not.toContain('<svg');
      expect(html).toContain('<p>Cuerpo</p>');
      // cabecera + footer fijos
      expect(html).toContain('aelium');
      expect(html).toContain('Responde a este correo');
      expect(html).toContain('Tus datos, en Europa');
    });

    it('la banda de acento sigue el `semantic`', () => {
      expect(buildEmailLayout({ semantic: 'success', bodyHtml: '' })).toContain(
        '#10B981',
      );
      expect(buildEmailLayout({ semantic: 'danger', bodyHtml: '' })).toContain(
        '#EF4444',
      );
    });

    it('renderiza el preheader oculto cuando se pasa', () => {
      const html = buildEmailLayout({
        semantic: 'info',
        preheader: 'Vista previa',
        bodyHtml: '',
      });
      expect(html).toContain('Vista previa');
      expect(html).toContain('mso-hide:all');
    });

    it('renderiza la fila de estado con etiqueta + subetiqueta (escapadas)', () => {
      const html = buildEmailLayout({
        semantic: 'success',
        status: { label: 'Pago confirmado', sublabel: 'AEL-2026-0042' },
        bodyHtml: '',
      });
      expect(html).toContain('Pago confirmado');
      expect(html).toContain('AEL-2026-0042');
    });
  });

  describe('bloques', () => {
    it('emailHeading escapa el texto', () => {
      expect(emailHeading('<b>Hola</b>')).toContain('&lt;b&gt;Hola&lt;/b&gt;');
    });

    it('emailButton genera un enlace con la URL y la etiqueta escapadas', () => {
      const html = emailButton('Ver factura', 'https://x.test/a?b=1&c=2');
      expect(html).toContain('href="https://x.test/a?b=1&amp;c=2"');
      expect(html).toContain('Ver factura');
      expect(html).toContain('bgcolor'); // botón bulletproof (celda con bgcolor)
    });

    it('emailDataBox renderiza filas + total con el color del tono', () => {
      const html = emailDataBox(
        [
          { label: 'Factura', value: 'AEL-1' },
          { label: 'Vía', value: 'tarjeta' },
        ],
        { label: 'Total', value: '119,88 €', semantic: 'success' },
      );
      expect(html).toContain('Factura');
      expect(html).toContain('AEL-1');
      expect(html).toContain('119,88 €');
      expect(html).toContain('#059669'); // total en color success
    });

    it('emailCodeBox muestra el código', () => {
      expect(emailCodeBox('123456')).toContain('123456');
    });
  });
});
