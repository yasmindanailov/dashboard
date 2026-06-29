import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SupportInsideService } from './support-inside.service';
import { PrismaService } from '../../core/database/prisma.service';
import { BillingCheckoutService } from '../billing/billing-checkout.service';
import { SubscriptionPlanChangeService } from '../billing/subscription-plan-change.service';
import { PresenceService } from '../presence/presence.service';

/**
 * SupportInsideService — vista gestionada F3·E8 (getStatus enriquecido +
 * getMaintenanceHistory). Instanciación directa con mocks sueltos para no
 * tocar el spec estricto del lifecycle.
 */
describe('SupportInsideService — gestionado F3·E8', () => {
  function makeService(
    prismaPartial: Record<string, unknown>,
    presencePartial?: Partial<PresenceService>,
  ) {
    const prisma = prismaPartial as unknown as PrismaService;
    const events = { emit: jest.fn() } as unknown as EventEmitter2;
    const checkout = {} as unknown as BillingCheckoutService;
    const planChange = {} as unknown as SubscriptionPlanChangeService;
    const presence = {
      getPresence: jest.fn().mockResolvedValue('online'),
      getPresenceMap: jest.fn().mockResolvedValue({}),
      ...presencePartial,
    } as unknown as PresenceService;
    return new SupportInsideService(
      prisma,
      events,
      checkout,
      planChange,
      presence,
    );
  }

  describe('getStatus — enriquecimiento', () => {
    it('añade técnico+presencia y, por slot, última/próxima/estado', async () => {
      // Slot con aniversario 14; "hoy" lo fija el sistema, así que el test
      // verifica forma + coherencia, no fechas absolutas.
      const subscription = {
        id: 'sub-1',
        status: 'active',
        technician: { id: 'tech-1', first_name: 'Luis', last_name: 'Ferrer' },
        slots: [{ id: 'slot-1', service_id: 'svc-1', anniversary_day: 14 }],
      };
      const service = makeService({
        supportInsideSubscription: {
          findUnique: jest.fn().mockResolvedValue(subscription),
        },
        maintenanceLog: {
          // Objeto combinado: satisface enrichSlots (service_id+performed_at)
          // y el bloque "recent" (id+month_year+notes+service).
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'log-1',
              service_id: 'svc-1',
              month_year: '2026-05',
              client_facing_notes: 'WordPress actualizado.',
              performed_at: new Date('2026-05-14T06:30:00.000Z'),
              service: {
                label: 'Mi web',
                domain: null,
                product: { name: 'Web Pro' },
              },
            },
          ]),
          count: jest.fn().mockResolvedValue(3),
        },
        task: { findMany: jest.fn().mockResolvedValue([]) },
        conversation: {
          findMany: jest.fn().mockResolvedValue([
            {
              created_at: new Date('2026-06-14T10:00:00.000Z'),
              first_response_at: new Date('2026-06-14T11:00:00.000Z'),
            },
          ]),
        },
      });

      const result = (await service.getStatus('client-1')) as unknown as {
        technician: { id: string; presence: string } | null;
        maintenance_count: number;
        avg_first_response_minutes: number | null;
        recent_maintenances: Array<{ service_name: string }>;
        slots: Array<{
          last_maintenance_at: string | null;
          next_maintenance_at: string;
          maintenance_status: string;
        }>;
      };

      expect(result.technician).toEqual(
        expect.objectContaining({ id: 'tech-1', presence: 'online' }),
      );
      expect(result.maintenance_count).toBe(3);
      // 1 conversación: 10:00 → 11:00 = 60 min.
      expect(result.avg_first_response_minutes).toBe(60);
      expect(result.recent_maintenances[0].service_name).toBe('Mi web');
      const slot = result.slots[0];
      expect(slot.last_maintenance_at).toBe('2026-05-14T06:30:00.000Z');
      expect(slot.next_maintenance_at).toMatch(/T06:00:00\.000Z$/);
      // Mayo hecho, junio+ pendiente → no es up_to_date (depende de "hoy"),
      // pero siempre es uno de los estados válidos.
      expect(['up_to_date', 'due_soon', 'overdue', 'in_progress']).toContain(
        slot.maintenance_status,
      );
    });

    it('devuelve null si no hay suscripción activa', async () => {
      const service = makeService({
        supportInsideSubscription: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      });
      await expect(service.getStatus('client-1')).resolves.toBeNull();
    });

    it('technician null cuando no hay técnico asignado', async () => {
      const service = makeService({
        supportInsideSubscription: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'sub-1',
            status: 'active',
            technician: null,
            slots: [],
          }),
        },
        maintenanceLog: {
          count: jest.fn().mockResolvedValue(0),
          findMany: jest.fn().mockResolvedValue([]),
        },
        conversation: { findMany: jest.fn().mockResolvedValue([]) },
      });
      const result = (await service.getStatus('client-1')) as unknown as {
        technician: unknown;
      };
      expect(result.technician).toBeNull();
    });
  });

  describe('getMaintenanceHistory', () => {
    it('rechaza si el slot no es del cliente (NotFound)', async () => {
      const service = makeService({
        supportInsideSlot: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'slot-1',
            service_id: 'svc-1',
            subscription: { client_id: 'OTHER-client' },
            service: { label: null, domain: null, product: { name: 'Web' } },
          }),
        },
      });
      await expect(
        service.getMaintenanceHistory('client-1', 'slot-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('mapea resumen + técnico + tareas hechas (labels de checklist)', async () => {
      const service = makeService({
        supportInsideSlot: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'slot-1',
            service_id: 'svc-1',
            subscription: { client_id: 'client-1' },
            service: {
              label: 'Mi web',
              domain: 'sara.com',
              product: { name: 'Web Pro' },
            },
          }),
        },
        maintenanceLog: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'log-1',
              month_year: '2026-06',
              client_facing_notes: 'WordPress actualizado.',
              performed_at: new Date('2026-06-14T06:30:00.000Z'),
              performer: { first_name: 'Luis', last_name: 'Ferrer' },
              task: {
                checklist_completions: [
                  { item_id: 'si-1', item_kind: 'service' },
                  { item_id: 'pi-1', item_kind: 'product' },
                ],
              },
            },
          ]),
        },
        serviceChecklistItem: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'si-1', label: 'Actualizar WordPress' }]),
        },
        productChecklistItem: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'pi-1', label: 'Verificar copias' }]),
        },
      });

      const result = await service.getMaintenanceHistory('client-1', 'slot-1');
      expect(result.service.product_name).toBe('Web Pro');
      expect(result.history).toHaveLength(1);
      const entry = result.history[0];
      expect(entry.summary).toBe('WordPress actualizado.');
      expect(entry.performed_by).toBe('Luis Ferrer');
      expect(entry.tasks_done).toEqual([
        'Actualizar WordPress',
        'Verificar copias',
      ]);
    });
  });
});
