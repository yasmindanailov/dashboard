import { InvoicePdfService } from './invoice-pdf.service';

/**
 * Tests unit `InvoicePdfService` — Sprint 12 (ADR-044 Amendment A1).
 *
 * Foco: el PDF lee los datos de empresa desde `branding.*` (vía SettingsService,
 * crudo — no del muerto `category:'company'`/`{value}`) y el logo es fail-soft
 * (un download fallido o una imagen corrupta NO rompe la factura).
 */
function makeInvoice() {
  return {
    id: 'inv-1',
    invoice_number: 'AEL-2026-0001',
    status: 'pending',
    created_at: new Date('2026-06-01T00:00:00Z'),
    due_date: new Date('2026-06-08T00:00:00Z'),
    paid_at: null,
    subtotal: 10,
    tax_rate: 21,
    tax_amount: 2.1,
    discount_amount: 0,
    total: 12.1,
    currency: 'EUR',
    items: [
      {
        description: 'Hosting Pro',
        quantity: 1,
        unit_price: 10,
        setup_fee: 0,
        total: 10,
        period_start: null,
        period_end: null,
      },
    ],
    billing_profile: null,
    user: { first_name: 'Ana', last_name: 'Cliente', email: 'ana@ejemplo.com' },
  };
}

function setup(overrides: { logoKey?: string; download?: jest.Mock } = {}) {
  const branding: Record<string, string> = {
    company_name: 'Acme Hosting',
    company_nif: 'B99999999',
    company_address: 'Av. Test 2',
    company_city: 'Valencia',
    company_postal_code: '46001',
    company_country: 'España',
    company_email: 'facturas@acme.test',
    logo_key: overrides.logoKey ?? '',
    primary_color: '#112233',
  };
  const prisma = {
    invoice: { findUnique: jest.fn().mockResolvedValue(makeInvoice()) },
  };
  const settings = {
    get: jest
      .fn()
      .mockImplementation((category: string, key: string, fallback: string) =>
        Promise.resolve(
          category === 'branding' ? (branding[key] ?? fallback) : fallback,
        ),
      ),
  };
  const storage = {
    download: overrides.download ?? jest.fn(),
  };
  const service = new InvoicePdfService(
    prisma as never,
    settings as never,
    storage as never,
  );
  return { service, prisma, settings, storage };
}

describe('InvoicePdfService — branding', () => {
  it('lee los datos de empresa de branding.* y genera un PDF (%PDF)', async () => {
    const { service, settings, storage } = setup();

    const buffer = await service.generatePdf('inv-1');

    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    // Lee branding.company_name (no el muerto category:'company')
    expect(settings.get).toHaveBeenCalledWith(
      'branding',
      'company_name',
      expect.any(String),
    );
    // Sin logo_key → no toca el storage
    expect(storage.download).not.toHaveBeenCalled();
  });

  it('descarga el logo cuando hay logo_key', async () => {
    const download = jest.fn().mockRejectedValue(new Error('not found'));
    const { service, storage } = setup({
      logoKey: 'branding/logo-x.png',
      download,
    });

    const buffer = await service.generatePdf('inv-1');

    // Download fallido → fail-soft: el PDF se genera igual
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(storage.download).toHaveBeenCalledWith('branding/logo-x.png');
  });

  it('una imagen corrupta no rompe la factura (fail-soft de doc.image)', async () => {
    const download = jest.fn().mockResolvedValue(Buffer.from('no-soy-png'));
    const { service } = setup({ logoKey: 'branding/logo-x.png', download });

    const buffer = await service.generatePdf('inv-1');

    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
