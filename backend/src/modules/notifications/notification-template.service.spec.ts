import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../core/database/prisma.service';
import { NotificationTemplateService } from './notification-template.service';

/**
 * Tests unit NotificationTemplateService — Sprint 9 Fase D (ADR-065).
 *
 * Cobertura:
 *  - Lookup exitoso → render Handlebars con variables del payload.
 *  - Locale fallback `es` cuando el solicitado no existe.
 *  - Sin plantilla → null (caller omite el canal).
 *  - Plantilla mal formada → null (no relanza, log y omite).
 *  - Helpers `lt`/`gt`/`eq` activos.
 *  - HTML escape: email NO escapa (HTML raw OK), in_app SÍ escapa.
 */
describe('NotificationTemplateService', () => {
  let service: NotificationTemplateService;
  let prisma: { notificationTemplate: { findFirst: jest.Mock } };

  beforeEach(async () => {
    prisma = { notificationTemplate: { findFirst: jest.fn() } };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationTemplateService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(NotificationTemplateService);
  });

  it('renderiza variables del payload con Handlebars', async () => {
    prisma.notificationTemplate.findFirst.mockResolvedValueOnce({
      subject: 'Factura {{invoice_number}}',
      body: 'Hola {{recipient.first_name}}, {{total}} {{currency}}',
    });

    const out = await service.render('invoice.created', 'email', 'es', {
      invoice_number: 'AEL-2026-0001',
      total: 60.5,
      currency: 'EUR',
      recipient: { first_name: 'Yasmin' },
    });

    expect(out).not.toBeNull();
    expect(out?.subject).toBe('Factura AEL-2026-0001');
    expect(out?.body).toBe('Hola Yasmin, 60.5 EUR');
  });

  it('fallback a locale `es` cuando el pedido no existe', async () => {
    prisma.notificationTemplate.findFirst
      .mockResolvedValueOnce(null) // pedido (en)
      .mockResolvedValueOnce({ subject: 'Hola {{name}}', body: 'Adiós' });

    const out = await service.render('greeting', 'email', 'en', {
      name: 'World',
    });

    expect(out?.subject).toBe('Hola World');
    expect(prisma.notificationTemplate.findFirst).toHaveBeenCalledTimes(2);
  });

  it('devuelve null cuando no hay plantilla activa para (event, channel)', async () => {
    prisma.notificationTemplate.findFirst.mockResolvedValue(null);
    const out = await service.render('foo.bar', 'email', 'es', {});
    expect(out).toBeNull();
  });

  it('devuelve null si la plantilla está mal formada (no relanza)', async () => {
    prisma.notificationTemplate.findFirst.mockResolvedValueOnce({
      subject: '{{unclosed',
      body: 'OK',
    });
    const out = await service.render('broken', 'email', 'es', {});
    expect(out).toBeNull();
  });

  it('helper `lt` activo: condicional retry_count < max_retries', async () => {
    prisma.notificationTemplate.findFirst.mockResolvedValueOnce({
      subject: 'X',
      body: '{{#if (lt retry_count max_retries)}}seguimos{{else}}último intento{{/if}}',
    });

    const stillRetrying = await service.render('test', 'email', 'es', {
      retry_count: 2,
      max_retries: 5,
    });
    expect(stillRetrying?.body).toBe('seguimos');

    prisma.notificationTemplate.findFirst.mockResolvedValueOnce({
      subject: 'X',
      body: '{{#if (lt retry_count max_retries)}}seguimos{{else}}último intento{{/if}}',
    });
    const exhausted = await service.render('test', 'email', 'es', {
      retry_count: 5,
      max_retries: 5,
    });
    expect(exhausted?.body).toBe('último intento');
  });

  it('canal email NO escapa HTML (admin curra el HTML); canal internal SÍ', async () => {
    // email: noEscape=true → < y > pasan tal cual
    prisma.notificationTemplate.findFirst.mockResolvedValueOnce({
      subject: 'X',
      body: '<b>{{name}}</b>',
    });
    const email = await service.render('x', 'email', 'es', {
      name: '<script>',
    });
    expect(email?.body).toBe('<b><script></b>');

    // internal: noEscape=false → escape estricto del valor inyectado
    prisma.notificationTemplate.findFirst.mockResolvedValueOnce({
      subject: 'X',
      body: 'Hola {{name}}',
    });
    const internal = await service.render('x', 'internal', 'es', {
      name: '<script>',
    });
    expect(internal?.body).toBe('Hola &lt;script&gt;');
  });
});
