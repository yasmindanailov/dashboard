import { EventEmitter2 } from '@nestjs/event-emitter';

import { SuspensionReasonDto } from '../provisioning/dto/provisioning.dto';
import { ServiceLifecycleWorker } from './service-lifecycle.worker';

/**
 * Tests unit ServiceLifecycleWorker — Sprint 15C.II Fase F.5 (`DC.44`
 * billing-suspend-unify).
 *
 * Foco: `autoSuspendServices` delega en `ProvisioningService.suspendAsAdmin`
 * (punto único de transición de estado) en vez de hacer su propio
 * `prisma.service.update` — con actor sistema (`actorUserId: null` +
 * `actorLabel: 'system:billing-overdue-cron'`) y `allowUnsupported: true`
 * (para que los plugins `internal`/`manual` se sigan suspendiendo del lado de
 * Aelium). Tolera fallos por servicio (catch + log — ej. servicio ya cancelado
 * → 409).
 */
describe('ServiceLifecycleWorker — Fase F.5 (autoSuspendServices → suspendAsAdmin)', () => {
  let prisma: {
    invoice: { findMany: jest.Mock };
    service: { findMany: jest.Mock; update: jest.Mock };
  };
  let calculator: { getSettingValue: jest.Mock };
  let provisioning: { suspendAsAdmin: jest.Mock };
  let worker: ServiceLifecycleWorker;

  beforeEach(() => {
    prisma = {
      invoice: { findMany: jest.fn() },
      service: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    };
    calculator = { getSettingValue: jest.fn().mockResolvedValue(7) };
    provisioning = { suspendAsAdmin: jest.fn().mockResolvedValue({}) };
    worker = new ServiceLifecycleWorker(
      prisma as never,
      new EventEmitter2(),
      calculator as never,
      provisioning as never,
    );
  });

  function overdueInvoice(over: Record<string, unknown> = {}) {
    return {
      id: 'inv-1',
      invoice_number: 'INV-2026-1',
      retry_count: 5,
      max_retries: 3,
      items: [{ service_id: 'svc-1' }, { service_id: null }],
      ...over,
    };
  }

  it('suspende vía suspendAsAdmin (actor sistema + allowUnsupported), con el motivo canónico overdue_payment y el nº de factura en la nota; NO toca prisma.service.update', async () => {
    prisma.invoice.findMany.mockResolvedValueOnce([overdueInvoice()]);

    await worker.autoSuspendServices();

    expect(provisioning.suspendAsAdmin).toHaveBeenCalledTimes(1);
    expect(provisioning.suspendAsAdmin).toHaveBeenCalledWith(
      'svc-1',
      {
        reason: SuspensionReasonDto.overdue_payment,
        internal_note: 'Factura INV-2026-1',
        notify_client: true,
      },
      null,
      undefined,
      { actorLabel: 'system:billing-overdue-cron', allowUnsupported: true },
    );
    expect(prisma.service.update).not.toHaveBeenCalled();
  });

  it('ignora los invoice items sin service_id', async () => {
    prisma.invoice.findMany.mockResolvedValueOnce([
      overdueInvoice({ items: [{ service_id: null }, { service_id: null }] }),
    ]);

    await worker.autoSuspendServices();

    expect(provisioning.suspendAsAdmin).not.toHaveBeenCalled();
  });

  it('no suspende facturas que aún tienen reintentos pendientes (retry_count < max_retries)', async () => {
    prisma.invoice.findMany.mockResolvedValueOnce([
      overdueInvoice({ retry_count: 1, max_retries: 3 }),
    ]);

    await worker.autoSuspendServices();

    expect(provisioning.suspendAsAdmin).not.toHaveBeenCalled();
  });

  it('si suspendAsAdmin lanza para un servicio (ej. ya cancelado → 409), lo registra y sigue con el resto', async () => {
    prisma.invoice.findMany.mockResolvedValueOnce([
      overdueInvoice({
        items: [{ service_id: 'svc-cancelled' }, { service_id: 'svc-ok' }],
      }),
    ]);
    provisioning.suspendAsAdmin
      .mockRejectedValueOnce(new Error('SERVICE_NOT_SUSPENDABLE'))
      .mockResolvedValueOnce({});

    await expect(worker.autoSuspendServices()).resolves.toBeUndefined();

    expect(provisioning.suspendAsAdmin).toHaveBeenCalledTimes(2);
    expect(provisioning.suspendAsAdmin).toHaveBeenNthCalledWith(
      2,
      'svc-ok',
      expect.objectContaining({ reason: SuspensionReasonDto.overdue_payment }),
      null,
      undefined,
      expect.objectContaining({ allowUnsupported: true }),
    );
  });

  it('sin facturas exhaustas → no hace nada', async () => {
    prisma.invoice.findMany.mockResolvedValueOnce([]);

    await worker.autoSuspendServices();

    expect(provisioning.suspendAsAdmin).not.toHaveBeenCalled();
  });
});
