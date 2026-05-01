import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ExecutionContext } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { SupportInsideIsolationGuard } from './support-inside-isolation.guard';

/**
 * Tests unit SupportInsideIsolationGuard — Sprint 8 Fase D + ADR-075 §A.2.
 *
 * Cobertura:
 *   - POST con body.type=support_inside sin header interno → 400.
 *   - POST con body.type=support_inside CON header interno → bypass.
 *   - PATCH /:id sobre product type=support_inside sin header → 400.
 *   - DELETE /:id sobre product type=support_inside sin header → 400.
 *   - POST con type distinto (hosting_web) → bypass.
 *   - PATCH /:id sobre product type distinto → bypass.
 */
describe('SupportInsideIsolationGuard — Sprint 8 Fase D + ADR-075', () => {
  let guard: SupportInsideIsolationGuard;
  let prisma: { product: { findUnique: jest.Mock } };

  function ctxFor(req: {
    method: string;
    body?: Record<string, unknown>;
    params?: Record<string, string>;
    headers?: Record<string, string>;
  }): ExecutionContext {
    const httpCtx = {
      getRequest: () => ({
        method: req.method,
        body: req.body ?? {},
        params: req.params ?? {},
        headers: req.headers ?? {},
      }),
    };
    return {
      switchToHttp: () => httpCtx,
    } as unknown as ExecutionContext;
  }

  beforeEach(async () => {
    prisma = { product: { findUnique: jest.fn() } };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupportInsideIsolationGuard,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    guard = module.get(SupportInsideIsolationGuard);
  });

  it('POST type=support_inside SIN header interno → 400', async () => {
    await expect(
      guard.canActivate(
        ctxFor({ method: 'POST', body: { type: 'support_inside' } }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('POST type=support_inside CON header interno → bypass (true)', async () => {
    const result = await guard.canActivate(
      ctxFor({
        method: 'POST',
        body: { type: 'support_inside' },
        headers: { 'x-aelium-source': 'support-inside-admin' },
      }),
    );
    expect(result).toBe(true);
    expect(prisma.product.findUnique).not.toHaveBeenCalled();
  });

  it('PATCH /:id sobre product type=support_inside sin header → 400', async () => {
    prisma.product.findUnique.mockResolvedValue({ type: 'support_inside' });
    await expect(
      guard.canActivate(
        ctxFor({ method: 'PATCH', params: { id: 'product-id' } }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('DELETE /:id sobre product type=support_inside sin header → 400', async () => {
    prisma.product.findUnique.mockResolvedValue({ type: 'support_inside' });
    await expect(
      guard.canActivate(
        ctxFor({ method: 'DELETE', params: { id: 'product-id' } }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('POST type=hosting_web → bypass (no aplica el guard)', async () => {
    const result = await guard.canActivate(
      ctxFor({ method: 'POST', body: { type: 'hosting_web' } }),
    );
    expect(result).toBe(true);
  });

  it('PATCH /:id sobre product NO support_inside → bypass', async () => {
    prisma.product.findUnique.mockResolvedValue({ type: 'hosting_web' });
    const result = await guard.canActivate(
      ctxFor({ method: 'PATCH', params: { id: 'product-id' } }),
    );
    expect(result).toBe(true);
  });
});
