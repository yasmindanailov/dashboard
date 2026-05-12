import { ReactivateServicesOnInvoicePaidListener } from './reactivate-services-on-invoice-paid.listener';

/**
 * Tests unit ReactivateServicesOnInvoicePaidListener — Sprint 15C.II Fase F.5.3.
 *
 * El listener resuelve el `invoice_id → service_id[]` y delega en
 * `ProvisioningService.reactivateSuspendedServiceOnPayment` por cada servicio
 * (que decide si reactivar — solo si está `suspended` por `overdue_payment`).
 * Degradación elegante (R7): un fallo por servicio no rompe el resto ni relanza.
 */
describe('ReactivateServicesOnInvoicePaidListener', () => {
  let prisma: { invoice: { findUnique: jest.Mock } };
  let provisioning: { reactivateSuspendedServiceOnPayment: jest.Mock };
  let listener: ReactivateServicesOnInvoicePaidListener;

  beforeEach(() => {
    prisma = { invoice: { findUnique: jest.fn() } };
    provisioning = {
      reactivateSuspendedServiceOnPayment: jest
        .fn()
        .mockResolvedValue(undefined),
    };
    listener = new ReactivateServicesOnInvoicePaidListener(
      prisma as never,
      provisioning as never,
    );
  });

  it('resuelve los service_id de la factura y llama a reactivateSuspendedServiceOnPayment por cada uno (dedup)', async () => {
    prisma.invoice.findUnique.mockResolvedValueOnce({
      id: 'inv-1',
      items: [
        { service_id: 'svc-1' },
        { service_id: 'svc-2' },
        { service_id: 'svc-1' }, // duplicado → dedup
        { service_id: null }, // ítem sin servicio (línea de descuento, etc.)
      ],
    });

    await listener.handleInvoicePaid({ invoice_id: 'inv-1', user_id: 'u-1' });

    expect(
      provisioning.reactivateSuspendedServiceOnPayment,
    ).toHaveBeenCalledTimes(2);
    expect(
      provisioning.reactivateSuspendedServiceOnPayment,
    ).toHaveBeenCalledWith('svc-1');
    expect(
      provisioning.reactivateSuspendedServiceOnPayment,
    ).toHaveBeenCalledWith('svc-2');
  });

  it('factura sin items de servicio → no llama a nada', async () => {
    prisma.invoice.findUnique.mockResolvedValueOnce({
      id: 'inv-1',
      items: [{ service_id: null }],
    });

    await listener.handleInvoicePaid({ invoice_id: 'inv-1' });

    expect(
      provisioning.reactivateSuspendedServiceOnPayment,
    ).not.toHaveBeenCalled();
  });

  it('factura no encontrada → no llama a nada, no relanza', async () => {
    prisma.invoice.findUnique.mockResolvedValueOnce(null);

    await expect(
      listener.handleInvoicePaid({ invoice_id: 'inv-unknown' }),
    ).resolves.toBeUndefined();
    expect(
      provisioning.reactivateSuspendedServiceOnPayment,
    ).not.toHaveBeenCalled();
  });

  it('si reactivar un servicio lanza, lo registra y sigue con el resto; no relanza', async () => {
    prisma.invoice.findUnique.mockResolvedValueOnce({
      id: 'inv-1',
      items: [{ service_id: 'svc-bad' }, { service_id: 'svc-ok' }],
    });
    provisioning.reactivateSuspendedServiceOnPayment
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);

    await expect(
      listener.handleInvoicePaid({ invoice_id: 'inv-1' }),
    ).resolves.toBeUndefined();
    expect(
      provisioning.reactivateSuspendedServiceOnPayment,
    ).toHaveBeenCalledTimes(2);
  });
});
