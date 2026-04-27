import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../database/prisma.service';
import { RetryService } from './retry.service';

describe('RetryService', () => {
  let service: RetryService;
  let prisma: { failedJob: { findUnique: jest.Mock; update: jest.Mock } };
  let queue: { add: jest.Mock };

  beforeEach(async () => {
    prisma = {
      failedJob: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    queue = { add: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetryService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(5) },
        },
      ],
    }).compile();

    service = module.get(RetryService);
    service.register('pdf-generation', queue as unknown as Queue);
  });

  describe('retry()', () => {
    it('lanza NotFoundException si el failed_job no existe', async () => {
      prisma.failedJob.findUnique.mockResolvedValue(null);
      await expect(service.retry('missing-id', 'admin-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('lanza BadRequestException si el job ya fue reintentado', async () => {
      prisma.failedJob.findUnique.mockResolvedValue({
        id: 'fj-1',
        status: 'retrying',
        queue: 'pdf-generation',
        name: 'invoice-pdf',
        payload: {},
      });
      await expect(service.retry('fj-1', 'admin-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('lanza BadRequestException si la cola no está registrada', async () => {
      prisma.failedJob.findUnique.mockResolvedValue({
        id: 'fj-1',
        status: 'failed',
        queue: 'unknown-queue',
        name: 'foo',
        payload: {},
      });
      await expect(service.retry('fj-1', 'admin-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('reencola el job y marca la fila como retrying con audit', async () => {
      const failed = {
        id: 'fj-42',
        status: 'failed',
        queue: 'pdf-generation',
        name: 'invoice-pdf',
        payload: { invoice_id: 'inv-9' },
      };
      prisma.failedJob.findUnique.mockResolvedValue(failed);
      prisma.failedJob.update.mockResolvedValue({});

      const result = await service.retry('fj-42', 'admin-7');

      expect(result).toEqual({ retried: true });
      expect(queue.add).toHaveBeenCalledWith(
        'invoice-pdf',
        { invoice_id: 'inv-9' },
        { jobId: 'retry-fj-42', attempts: 5 },
      );
      type UpdateArg = {
        where: { id: string };
        data: { status: string; retried_by: string; retried_at: Date };
      };
      const calls = prisma.failedJob.update.mock.calls as UpdateArg[][];
      const updateCall = calls[0][0];
      expect(updateCall.where).toEqual({ id: 'fj-42' });
      expect(updateCall.data.status).toBe('retrying');
      expect(updateCall.data.retried_by).toBe('admin-7');
      expect(updateCall.data.retried_at).toBeInstanceOf(Date);
    });
  });

  describe('register()', () => {
    it('es idempotente — la segunda llamada con la misma cola no la sobrescribe', async () => {
      const queue2 = { add: jest.fn() };
      service.register('pdf-generation', queue2 as unknown as Queue);

      prisma.failedJob.findUnique.mockResolvedValue({
        id: 'fj-1',
        status: 'failed',
        queue: 'pdf-generation',
        name: 'x',
        payload: {},
      });
      prisma.failedJob.update.mockResolvedValue({});

      await service.retry('fj-1', 'admin-1');

      // El primer queue (registrado en beforeEach) sigue siendo el activo
      expect(queue.add).toHaveBeenCalledTimes(1);
      expect(queue2.add).not.toHaveBeenCalled();
    });
  });
});
