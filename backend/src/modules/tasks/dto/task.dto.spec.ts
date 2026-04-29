import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CreateTaskDto,
  UpdateTaskDto,
  TaskTypeDto,
  TaskPriorityDto,
} from './task.dto';

/**
 * Sprint 8 Fase B EC-T8-14/15/16 (2026-04-29) — validaciones declarativas
 * en los DTOs. Cubierto a nivel DTO porque el `ValidationPipe` corre
 * exactamente este flujo (`plainToInstance` + `validate`) antes de invocar
 * el controller. No requieren reachability a Prisma ni HTTP.
 */
describe('CreateTaskDto / UpdateTaskDto — EC-T8-14/15/16 validaciones DTO', () => {
  const baseValid: Partial<CreateTaskDto> = {
    type: TaskTypeDto.custom_work,
    title: 'Tarea test',
    client_id: '00000000-0000-4000-8000-000000000001',
    priority: TaskPriorityDto.medium,
  };

  function buildCreate(extra: Partial<CreateTaskDto> = {}): CreateTaskDto {
    return plainToInstance(CreateTaskDto, { ...baseValid, ...extra });
  }

  function buildUpdate(extra: Partial<UpdateTaskDto> = {}): UpdateTaskDto {
    return plainToInstance(UpdateTaskDto, extra);
  }

  /* ── EC-T8-14: is_recurring requiere recurrence_day ── */
  describe('EC-T8-14 — is_recurring + recurrence_day coherentes', () => {
    it('acepta is_recurring=true con recurrence_day en rango 1..31', async () => {
      const errs = await validate(
        buildCreate({ is_recurring: true, recurrence_day: 15 }),
      );
      expect(errs).toHaveLength(0);
    });

    it('rechaza is_recurring=true SIN recurrence_day', async () => {
      const errs = await validate(buildCreate({ is_recurring: true }));
      expect(errs.length).toBeGreaterThan(0);
      const offending = errs.find((e) => e.property === 'recurrence_day');
      expect(offending).toBeDefined();
    });

    it('rechaza recurrence_day fuera de rango (0, 32) cuando is_recurring=true', async () => {
      for (const day of [0, 32, -5, 99]) {
        const errs = await validate(
          buildCreate({ is_recurring: true, recurrence_day: day }),
        );
        const offending = errs.find((e) => e.property === 'recurrence_day');
        expect(offending).toBeDefined();
      }
    });

    it('ignora recurrence_day cuando is_recurring=false (no obligatorio)', async () => {
      const errs = await validate(buildCreate({ is_recurring: false }));
      expect(errs).toHaveLength(0);
    });
  });

  /* ── EC-T8-15: billing_month formato YYYY-MM con mes 01-12 ── */
  describe('EC-T8-15 — billing_month regex', () => {
    it('acepta formato canónico (varios meses válidos)', async () => {
      for (const month of ['2026-01', '2026-04', '2026-12', '2099-07']) {
        const errs = await validate(buildCreate({ billing_month: month }));
        expect(errs).toHaveLength(0);
      }
    });

    it('rechaza mes inválido (00, 13)', async () => {
      for (const month of ['2026-00', '2026-13', '2026-99']) {
        const errs = await validate(buildCreate({ billing_month: month }));
        const offending = errs.find((e) => e.property === 'billing_month');
        expect(offending).toBeDefined();
      }
    });

    it('rechaza mes sin pad (1 dígito) o año corto', async () => {
      for (const month of ['2026-1', '26-04', '2026-4', '2026/04']) {
        const errs = await validate(buildCreate({ billing_month: month }));
        const offending = errs.find((e) => e.property === 'billing_month');
        expect(offending).toBeDefined();
      }
    });

    it('aplica la misma regla en UpdateTaskDto', async () => {
      const errs = await validate(buildUpdate({ billing_month: '2026-13' }));
      const offending = errs.find((e) => e.property === 'billing_month');
      expect(offending).toBeDefined();
    });
  });

  /* ── EC-T8-16: description ≤50000 chars ── */
  describe('EC-T8-16 — description MaxLength 50000', () => {
    it('acepta description en el límite (50000 chars)', async () => {
      const errs = await validate(
        buildCreate({ description: 'x'.repeat(50000) }),
      );
      expect(errs).toHaveLength(0);
    });

    it('rechaza description >50000 chars', async () => {
      const errs = await validate(
        buildCreate({ description: 'x'.repeat(50001) }),
      );
      const offending = errs.find((e) => e.property === 'description');
      expect(offending).toBeDefined();
    });

    it('aplica la misma regla en UpdateTaskDto', async () => {
      const errs = await validate(
        buildUpdate({ description: 'x'.repeat(50001) }),
      );
      const offending = errs.find((e) => e.property === 'description');
      expect(offending).toBeDefined();
    });
  });
});
