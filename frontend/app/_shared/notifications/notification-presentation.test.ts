/**
 * Tests de la capa de PRESENTACIÓN de notificaciones (F3·E10). Solo visual:
 * categoría → {label, icono/tono por defecto} con override fino por evento, y
 * extracción segura de `metadata.event`. La clasificación real (event→categoría)
 * vive y se testea en el backend (`notification-taxonomy.spec.ts`).
 */
import {
  presentNotification,
  eventOf,
  CLIENT_CATEGORY_CHIPS,
  ADMIN_CATEGORY_CHIPS,
} from './notification-presentation';

describe('presentNotification', () => {
  it('usa el default de la categoría cuando el evento no tiene override de tono', () => {
    const v = presentNotification('dominios', 'domain.transfer_initiated');
    expect(v.categoryLabel).toBe('Dominios');
    expect(v.tone).toBe('brand');
  });

  it('aplica el override de tono por evento (pago confirmado = success)', () => {
    expect(presentNotification('facturacion', 'invoice.paid').tone).toBe(
      'success',
    );
  });

  it('seguridad usa el tono security (violeta del mockup)', () => {
    expect(
      presentNotification('seguridad', 'domain.nameservers_changed').tone,
    ).toBe('security');
  });

  it('cae en General/neutral con categoría desconocida', () => {
    const v = presentNotification('inexistente', null);
    expect(v.categoryLabel).toBe('General');
    expect(v.tone).toBe('neutral');
  });

  it('devuelve la etiqueta de categoría aunque el evento sea null', () => {
    expect(presentNotification('soporte', null).categoryLabel).toBe('Soporte');
  });
});

describe('eventOf', () => {
  it('extrae metadata.event cuando es string', () => {
    expect(eventOf({ event: 'invoice.paid' })).toBe('invoice.paid');
  });

  it('devuelve null si falta o no es string', () => {
    expect(eventOf(null)).toBeNull();
    expect(eventOf(undefined)).toBeNull();
    expect(eventOf({})).toBeNull();
    expect(eventOf({ event: 5 })).toBeNull();
  });
});

describe('chips de categoría', () => {
  it('cliente: "Todas" es la primera opción y no filtra (value vacío)', () => {
    expect(CLIENT_CATEGORY_CHIPS[0]).toEqual({ value: '', label: 'Todas' });
  });

  it('admin: incluye la categoría Negocio', () => {
    expect(ADMIN_CATEGORY_CHIPS.some((c) => c.value === 'negocio')).toBe(true);
  });

  it('cliente y admin difieren en su conjunto de categorías', () => {
    const client = CLIENT_CATEGORY_CHIPS.map((c) => c.value);
    expect(client).toContain('facturacion');
    expect(client).not.toContain('plugins');
  });
});
