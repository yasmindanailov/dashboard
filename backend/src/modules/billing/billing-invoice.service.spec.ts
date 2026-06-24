import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import { getQueueToken } from '@nestjs/bullmq';
import { Prisma, type Invoice, type InvoiceStatus } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { OutboxService } from '../../core/outbox/outbox.service';
import { SettingsService } from '../../core/settings/settings.service';
import { BillingCalculatorService } from './billing-calculator.service';
import { BillingInvoiceService } from './billing-invoice.service';
import { InvoicePdfStorageService } from './invoice-pdf-storage.service';
import { PDF_GENERATION_QUEUE } from './pdf-generation.processor';

/**
 * Tests unit `BillingInvoiceService` — transiciones financieras irreversibles.
 *
 * Cierra la auditoría 2026-06-21 HIGH-3 (`TQ-BILLING-INVOICE-NOSPEC`): el
 * service concentra todas las transiciones de dinero (`markAsPaid` / `cancel` /
 * `refund` / `sendToPending` / `markAsOverdue` / `recalculate`) y los guards de
 * inmutabilidad, sin un solo test que los proteja de regresión. El camino de
 * renovación de dominios (Sprint 15D.E) reutiliza `createInvoice` + `markAsPaid`,
 * así que esta red de seguridad entra como commit-0 de la fase.
 *
 * Foco (no re-testea el cross-link, ya cubierto en
 * `billing-invoice.service.cross-link.spec.ts`):
 *   - Rechazo de transiciones desde estados terminales (paid/cancelled/refunded).
 *   - Precondiciones de `sendToPending` (finalize) / `refundInvoice` / `markAsOverdue`.
 *   - Inmutabilidad de items en facturas no-`draft` (vía `updateInvoice`).
 *   - `recalculateInvoice` borra items SOLO de la factura (scope `invoice_id`) y
 *     SOLO en `draft`.
 *   - **Ningún path borra una factura** (`invoice.delete`/`deleteMany` jamás).
 *   - Emisión Outbox transaccional en las transiciones que la requieren (R8).
 */

const INVOICE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice & {
  items: unknown[];
  user: unknown;
} {
  return {
    id: INVOICE_ID,
    invoice_number: 'AELIUM-2026-0001',
    user_id: USER_ID,
    status: 'pending' as InvoiceStatus,
    total: new Prisma.Decimal(19.99),
    currency: 'EUR',
    payment_provider: 'manual',
    payment_ref: null,
    retry_count: 0,
    max_retries: 3,
    ...overrides,
    items: [],
    user: {
      id: USER_ID,
      first_name: 'Carla',
      last_name: 'Cliente',
      email: 'c@a.test',
    },
  } as unknown as Invoice & { items: unknown[]; user: unknown };
}

describe('BillingInvoiceService — transiciones financieras (auditoría HIGH-3)', () => {
  let service: BillingInvoiceService;
  let invoiceFindUnique: jest.Mock;
  let invoiceUpdate: jest.Mock;
  let invoiceDelete: jest.Mock;
  let invoiceDeleteMany: jest.Mock;
  let invoiceItemDeleteMany: jest.Mock;
  let outboxEnqueue: jest.Mock;
  let pdfQueueAdd: jest.Mock;
  let calculateInvoiceTotals: jest.Mock;
  let refund: jest.Mock;

  beforeEach(async () => {
    invoiceFindUnique = jest.fn();
    // Misma referencia para el update transaccional (tx.invoice.update) y el
    // no-transaccional (prisma.invoice.update) → simplifica las aserciones.
    invoiceUpdate = jest.fn();
    invoiceDelete = jest.fn();
    invoiceDeleteMany = jest.fn();
    invoiceItemDeleteMany = jest.fn();
    outboxEnqueue = jest.fn();
    pdfQueueAdd = jest.fn();
    calculateInvoiceTotals = jest.fn();
    refund = jest.fn();

    const txMock = {
      invoice: { update: invoiceUpdate },
      invoiceItem: { deleteMany: invoiceItemDeleteMany },
    };

    const prismaMock = {
      invoice: {
        findUnique: invoiceFindUnique,
        update: invoiceUpdate,
        delete: invoiceDelete,
        deleteMany: invoiceDeleteMany,
      },
      invoiceItem: { deleteMany: invoiceItemDeleteMany },
      $transaction: jest.fn((arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: typeof txMock) => unknown)(txMock)
          : Promise.all(arg as Promise<unknown>[]),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingInvoiceService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: OutboxService, useValue: { enqueue: outboxEnqueue } },
        {
          provide: BillingCalculatorService,
          useValue: {
            getSettingValue: jest.fn().mockResolvedValue(3),
            calculateInvoiceTotals,
          },
        },
        { provide: InvoicePdfStorageService, useValue: {} },
        {
          provide: SettingsService,
          useValue: {
            get: jest.fn().mockResolvedValue('AEL'),
            getNumber: jest.fn().mockResolvedValue(7),
          },
        },
        {
          provide: getQueueToken(PDF_GENERATION_QUEUE),
          useValue: { add: pdfQueueAdd } as unknown as Queue,
        },
      ],
    }).compile();

    service = module.get(BillingInvoiceService);
    // El provider de pago por defecto es Manual; inyectamos el refund espía.
    service.setPaymentProvider({
      name: 'manual',
      createPayment: jest.fn(),
      refund,
    } as never);
  });

  /** Tras cualquier operación: jamás se borra una factura del sistema. */
  const expectNoInvoiceEverDeleted = () => {
    expect(invoiceDelete).not.toHaveBeenCalled();
    expect(invoiceDeleteMany).not.toHaveBeenCalled();
  };

  // ─── markAsPaid ──────────────────────────────────────────────────────────

  describe('markAsPaid', () => {
    it('factura ya pagada → ConflictException (no re-cobra ni re-emite)', async () => {
      invoiceFindUnique.mockResolvedValue(makeInvoice({ status: 'paid' }));
      await expect(service.markAsPaid(INVOICE_ID)).rejects.toThrow(
        ConflictException,
      );
      expect(invoiceUpdate).not.toHaveBeenCalled();
      expect(outboxEnqueue).not.toHaveBeenCalled();
      expectNoInvoiceEverDeleted();
    });

    it('factura cancelada → BadRequestException', async () => {
      invoiceFindUnique.mockResolvedValue(makeInvoice({ status: 'cancelled' }));
      await expect(service.markAsPaid(INVOICE_ID)).rejects.toThrow(
        BadRequestException,
      );
      expect(invoiceUpdate).not.toHaveBeenCalled();
    });

    it('factura reembolsada → BadRequestException', async () => {
      invoiceFindUnique.mockResolvedValue(makeInvoice({ status: 'refunded' }));
      await expect(service.markAsPaid(INVOICE_ID)).rejects.toThrow(
        BadRequestException,
      );
      expect(invoiceUpdate).not.toHaveBeenCalled();
    });

    it('pending → paid: actualiza, emite invoice.paid en la MISMA tx y encola PDF', async () => {
      invoiceFindUnique.mockResolvedValue(makeInvoice({ status: 'pending' }));
      invoiceUpdate.mockResolvedValue(
        makeInvoice({ status: 'paid', payment_provider: 'manual' }),
      );

      await service.markAsPaid(INVOICE_ID, {
        payment_provider: 'manual',
        payment_method: 'manual',
        payment_ref: 'ref-1',
      });

      expect(invoiceUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: INVOICE_ID },
          data: expect.objectContaining({
            status: 'paid',
          }) as Record<string, unknown>,
        }),
      );
      expect(outboxEnqueue).toHaveBeenCalledWith(
        expect.anything(),
        'invoice.paid',
        expect.objectContaining({ invoice_id: INVOICE_ID, user_id: USER_ID }),
      );
      expect(pdfQueueAdd).toHaveBeenCalledTimes(1);
      expectNoInvoiceEverDeleted();
    });
  });

  // ─── markAsOverdue ─────────────────────────────────────────────────────────

  describe('markAsOverdue', () => {
    it('solo desde pending; paid → BadRequestException', async () => {
      invoiceFindUnique.mockResolvedValue(makeInvoice({ status: 'paid' }));
      await expect(service.markAsOverdue(INVOICE_ID)).rejects.toThrow(
        BadRequestException,
      );
      expect(invoiceUpdate).not.toHaveBeenCalled();
    });

    it('pending → overdue: incrementa retry_count + emite invoice.overdue (Outbox)', async () => {
      invoiceFindUnique.mockResolvedValue(makeInvoice({ status: 'pending' }));
      invoiceUpdate.mockResolvedValue(
        makeInvoice({ status: 'overdue', retry_count: 1 }),
      );

      await service.markAsOverdue(INVOICE_ID);

      expect(invoiceUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'overdue',
            retry_count: { increment: 1 },
          }) as Record<string, unknown>,
        }),
      );
      expect(outboxEnqueue).toHaveBeenCalledWith(
        expect.anything(),
        'invoice.overdue',
        expect.objectContaining({ invoice_id: INVOICE_ID }),
      );
      expectNoInvoiceEverDeleted();
    });
  });

  // ─── cancelInvoice ──────────────────────────────────────────────────────────

  describe('cancelInvoice', () => {
    it('factura pagada → BadRequestException (debe usarse el reembolso)', async () => {
      invoiceFindUnique.mockResolvedValue(makeInvoice({ status: 'paid' }));
      await expect(service.cancelInvoice(INVOICE_ID)).rejects.toThrow(
        BadRequestException,
      );
      expect(invoiceUpdate).not.toHaveBeenCalled();
      expectNoInvoiceEverDeleted();
    });

    it('factura ya cancelada → ConflictException', async () => {
      invoiceFindUnique.mockResolvedValue(makeInvoice({ status: 'cancelled' }));
      await expect(service.cancelInvoice(INVOICE_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it('pending → cancelled (status update, NO delete)', async () => {
      invoiceFindUnique.mockResolvedValue(makeInvoice({ status: 'pending' }));
      invoiceUpdate.mockResolvedValue(makeInvoice({ status: 'cancelled' }));

      await service.cancelInvoice(INVOICE_ID);

      expect(invoiceUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'cancelled' },
        }),
      );
      expectNoInvoiceEverDeleted();
    });
  });

  // ─── sendToPending (finalize) ────────────────────────────────────────────────

  describe('sendToPending (finalize)', () => {
    it('solo desde draft; pending → BadRequestException', async () => {
      invoiceFindUnique.mockResolvedValue(makeInvoice({ status: 'pending' }));
      await expect(service.sendToPending(INVOICE_ID)).rejects.toThrow(
        BadRequestException,
      );
      expect(invoiceUpdate).not.toHaveBeenCalled();
    });

    it('draft → pending + encola PDF', async () => {
      invoiceFindUnique.mockResolvedValue(makeInvoice({ status: 'draft' }));
      invoiceUpdate.mockResolvedValue(makeInvoice({ status: 'pending' }));

      await service.sendToPending(INVOICE_ID);

      expect(invoiceUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'pending' } }),
      );
      expect(pdfQueueAdd).toHaveBeenCalledTimes(1);
    });
  });

  // ─── refundInvoice ────────────────────────────────────────────────────────────

  describe('refundInvoice', () => {
    it('solo facturas pagadas; pending → BadRequestException', async () => {
      invoiceFindUnique.mockResolvedValue(makeInvoice({ status: 'pending' }));
      await expect(service.refundInvoice(INVOICE_ID)).rejects.toThrow(
        BadRequestException,
      );
      expect(refund).not.toHaveBeenCalled();
      expect(invoiceUpdate).not.toHaveBeenCalled();
    });

    it('refund del proveedor falla → BadRequestException SIN mutar la factura', async () => {
      invoiceFindUnique.mockResolvedValue(
        makeInvoice({ status: 'paid', payment_ref: 'ext-123' }),
      );
      refund.mockResolvedValue({ success: false, error: 'gateway down' });

      await expect(service.refundInvoice(INVOICE_ID)).rejects.toThrow(
        BadRequestException,
      );
      expect(invoiceUpdate).not.toHaveBeenCalled();
      expectNoInvoiceEverDeleted();
    });

    it('paid con payment_ref → refund OK → status refunded', async () => {
      invoiceFindUnique.mockResolvedValue(
        makeInvoice({ status: 'paid', payment_ref: 'ext-123' }),
      );
      refund.mockResolvedValue({ success: true });
      invoiceUpdate.mockResolvedValue(makeInvoice({ status: 'refunded' }));

      await service.refundInvoice(INVOICE_ID);

      expect(refund).toHaveBeenCalledTimes(1);
      expect(invoiceUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'refunded' } }),
      );
      expectNoInvoiceEverDeleted();
    });
  });

  // ─── updateInvoice (inmutabilidad de items) ──────────────────────────────────

  describe('updateInvoice', () => {
    it('factura pagada → BadRequestException (no editable)', async () => {
      invoiceFindUnique.mockResolvedValue(makeInvoice({ status: 'paid' }));
      await expect(
        service.updateInvoice(INVOICE_ID, { notes: 'x' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('editar items en factura no-draft (pending) → BadRequestException', async () => {
      invoiceFindUnique.mockResolvedValue(makeInvoice({ status: 'pending' }));
      await expect(
        service.updateInvoice(INVOICE_ID, {
          items: [{ description: 'x', quantity: 1, unit_price: 1 }],
        } as never),
      ).rejects.toThrow(BadRequestException);
      expect(invoiceItemDeleteMany).not.toHaveBeenCalled();
    });

    it('cambiar status vía updateInvoice → BadRequestException (usa endpoints de estado)', async () => {
      invoiceFindUnique.mockResolvedValue(makeInvoice({ status: 'draft' }));
      await expect(
        service.updateInvoice(INVOICE_ID, { status: 'paid' } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('recalcular items en draft → borra SOLO los items de ESA factura (scope invoice_id), nunca la factura', async () => {
      invoiceFindUnique.mockResolvedValue(makeInvoice({ status: 'draft' }));
      calculateInvoiceTotals.mockResolvedValue({
        subtotal: 10,
        taxRate: 21,
        taxAmount: 2.1,
        total: 12.1,
        calculatedItems: [],
      });
      invoiceUpdate.mockResolvedValue(makeInvoice({ status: 'draft' }));

      await service.updateInvoice(INVOICE_ID, {
        items: [{ description: 'y', quantity: 1, unit_price: 10 }],
      } as never);

      expect(invoiceItemDeleteMany).toHaveBeenCalledWith({
        where: { invoice_id: INVOICE_ID },
      });
      expectNoInvoiceEverDeleted();
    });
  });

  // ─── findOneOrFail ──────────────────────────────────────────────────────────

  it('findOneOrFail → NotFoundException si la factura no existe', async () => {
    invoiceFindUnique.mockResolvedValue(null);
    await expect(service.findOne(INVOICE_ID)).rejects.toThrow(
      NotFoundException,
    );
  });
});
