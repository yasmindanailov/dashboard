import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { OutboxService } from '../../core/outbox/outbox.service';
import { BillingCalculatorService } from './billing-calculator.service';
import { BillingInvoiceService } from './billing-invoice.service';
import { InvoicePdfStorageService } from './invoice-pdf-storage.service';
import { PDF_GENERATION_QUEUE } from './pdf-generation.processor';
import { getQueueToken } from '@nestjs/bullmq';

/**
 * Tests unit `BillingInvoiceService.getServiceBillingCrossLink` —
 * Sprint 15C.II Fase F.11.3 (§A.11.10.8.2).
 *
 * Cobertura:
 *   - Owner check: !isAdmin && service.user_id !== userId → 403.
 *   - isAdmin=true saltea owner check.
 *   - Service no existe → 404.
 *   - Service sin facturas → lastInvoice null + nextDueDate/amount/currency
 *     desde service.
 *   - Service con facturas → última (ordered by created_at DESC).
 *   - Decimal serializado como string.
 */

describe('BillingInvoiceService.getServiceBillingCrossLink — Sprint 15C.II Fase F.11.3', () => {
  let service: BillingInvoiceService;
  let serviceFindUnique: jest.Mock;
  let invoiceFindFirst: jest.Mock;

  const SERVICE_ID = '11111111-1111-1111-1111-111111111111';
  const OWNER_ID = '22222222-2222-2222-2222-222222222222';
  const OTHER_USER_ID = '33333333-3333-3333-3333-333333333333';
  const ADMIN_ID = '44444444-4444-4444-4444-444444444444';

  beforeEach(async () => {
    serviceFindUnique = jest.fn();
    invoiceFindFirst = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingInvoiceService,
        {
          provide: PrismaService,
          useValue: {
            service: { findUnique: serviceFindUnique },
            invoice: { findFirst: invoiceFindFirst },
          },
        },
        { provide: OutboxService, useValue: {} },
        { provide: BillingCalculatorService, useValue: {} },
        { provide: InvoicePdfStorageService, useValue: {} },
        {
          provide: getQueueToken(PDF_GENERATION_QUEUE),
          useValue: { add: jest.fn() } as unknown as Queue,
        },
      ],
    }).compile();

    service = module.get(BillingInvoiceService);
  });

  it('!isAdmin && service.user_id !== userId → 403 Forbidden', async () => {
    serviceFindUnique.mockResolvedValue({
      id: SERVICE_ID,
      user_id: OWNER_ID,
      next_due_date: new Date('2026-06-15T00:00:00.000Z'),
      amount: new Prisma.Decimal(19.99),
      currency: 'EUR',
    });

    await expect(
      service.getServiceBillingCrossLink(SERVICE_ID, OTHER_USER_ID, false),
    ).rejects.toThrow(ForbiddenException);
  });

  it('isAdmin=true saltea owner check', async () => {
    serviceFindUnique.mockResolvedValue({
      id: SERVICE_ID,
      user_id: OWNER_ID,
      next_due_date: new Date('2026-06-15T00:00:00.000Z'),
      amount: new Prisma.Decimal(19.99),
      currency: 'EUR',
    });
    invoiceFindFirst.mockResolvedValue(null);

    const result = await service.getServiceBillingCrossLink(
      SERVICE_ID,
      ADMIN_ID,
      true,
    );

    expect(result).toEqual({
      nextDueDate: '2026-06-15T00:00:00.000Z',
      amount: '19.99',
      currency: 'EUR',
      lastInvoice: null,
    });
  });

  it('service no existe → 404 NotFound', async () => {
    serviceFindUnique.mockResolvedValue(null);

    await expect(
      service.getServiceBillingCrossLink(SERVICE_ID, OWNER_ID, false),
    ).rejects.toThrow(NotFoundException);
  });

  it('owner consulta su servicio sin facturas → lastInvoice null', async () => {
    serviceFindUnique.mockResolvedValue({
      id: SERVICE_ID,
      user_id: OWNER_ID,
      next_due_date: new Date('2026-07-01T00:00:00.000Z'),
      amount: new Prisma.Decimal(9.95),
      currency: 'EUR',
    });
    invoiceFindFirst.mockResolvedValue(null);

    const result = await service.getServiceBillingCrossLink(
      SERVICE_ID,
      OWNER_ID,
      false,
    );

    expect(result.lastInvoice).toBeNull();
    expect(result.nextDueDate).toBe('2026-07-01T00:00:00.000Z');
    expect(result.amount).toBe('9.95');
    expect(result.currency).toBe('EUR');
  });

  it('service sin next_due_date pero con última factura → nextDueDate null + lastInvoice presente', async () => {
    serviceFindUnique.mockResolvedValue({
      id: SERVICE_ID,
      user_id: OWNER_ID,
      next_due_date: null,
      amount: new Prisma.Decimal(0),
      currency: 'EUR',
    });
    const lastInvoice = {
      id: 'inv-1',
      invoice_number: 'AEL-2026-0001',
      status: 'paid' as const,
      total: new Prisma.Decimal(19.99),
      due_date: new Date('2026-05-01T00:00:00.000Z'),
      paid_at: new Date('2026-05-02T10:00:00.000Z'),
    };
    invoiceFindFirst.mockResolvedValue(lastInvoice);

    const result = await service.getServiceBillingCrossLink(
      SERVICE_ID,
      OWNER_ID,
      false,
    );

    expect(result.nextDueDate).toBeNull();
    expect(result.amount).toBe('0');
    expect(result.lastInvoice).toEqual({
      id: 'inv-1',
      invoice_number: 'AEL-2026-0001',
      status: 'paid',
      total: '19.99',
      due_date: '2026-05-01T00:00:00.000Z',
      paid_at: '2026-05-02T10:00:00.000Z',
    });
  });

  it('lookup invoice via InvoiceItem.service_id ordered by created_at DESC', async () => {
    serviceFindUnique.mockResolvedValue({
      id: SERVICE_ID,
      user_id: OWNER_ID,
      next_due_date: new Date('2026-06-15T00:00:00.000Z'),
      amount: new Prisma.Decimal(29),
      currency: 'EUR',
    });
    invoiceFindFirst.mockResolvedValue({
      id: 'inv-2',
      invoice_number: 'AEL-2026-0002',
      status: 'pending' as const,
      total: new Prisma.Decimal(29),
      due_date: new Date('2026-06-15T00:00:00.000Z'),
      paid_at: null,
    });

    await service.getServiceBillingCrossLink(SERVICE_ID, OWNER_ID, false);

    expect(invoiceFindFirst).toHaveBeenCalledWith({
      where: { items: { some: { service_id: SERVICE_ID } } },
      orderBy: { created_at: 'desc' },
      select: expect.objectContaining({
        id: true,
        invoice_number: true,
        status: true,
        total: true,
        due_date: true,
        paid_at: true,
      }),
    });
  });
});
