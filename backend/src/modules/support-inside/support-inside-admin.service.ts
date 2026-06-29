import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../core/database/prisma.service';
import {
  eligibleAssigneeRoles,
  isAssigneeEligible,
} from '../../core/tasks/auto-assign';
import type { PresenceStatus } from '../../core/presence/presence.helper';
import { PresenceService } from '../presence/presence.service';
import {
  enrichSlotsMaintenance,
  type SlotMaintenanceStatus,
} from './maintenance.helper';

/** Técnico (cuidador estable) de una suscripción, con su presencia derivada. */
export interface AdminManagedTechnician {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  presence: PresenceStatus;
}

/** Slot de mantenimiento con su estado del periodo (derivado, sin persistir). */
export interface AdminManagedSlot {
  id: string;
  slot_type: string;
  service_label: string;
  last_maintenance_at: string | null;
  next_maintenance_at: string;
  maintenance_status: SlotMaintenanceStatus;
}

/**
 * Bloque "gestionado" de una suscripción Support Inside para la vista admin
 * del detalle de servicio (sección "Plan de soporte" del mockup
 * `SupportInsideDetalleAdmin`): técnico + presencia + progreso de
 * mantenimiento + SLA. Capability-driven por presencia (solo existe si el
 * servicio ES una suscripción SI).
 */
export interface AdminSupportInsideManaged {
  subscription_id: string;
  service_id: string;
  status: string;
  started_at: string;
  plan: {
    slug: string;
    name: string;
    priority_tier: string;
    response_sla_hours: number;
  };
  technician: AdminManagedTechnician | null;
  maintenance: {
    period_done: number;
    period_total: number;
    overdue_count: number;
    slots: AdminManagedSlot[];
  };
}

/** Candidato a "técnico asignado" para el picker admin (DS-A18). */
export interface AdminEligibleTechnician {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  role: string;
  avatar_url: string | null;
  presence: PresenceStatus;
  active_maintenance_tasks: number;
}

/** SLA por defecto (h) si el plan no declara `response_sla_hours`. Espejo del cliente. */
const DEFAULT_RESPONSE_SLA_HOURS = 24;

/**
 * SupportInsideAdminService — Rediseño UI F3·E8 (Support Inside gestionado).
 *
 * Gestión admin por-cliente de las suscripciones Support Inside (distinto de
 * `SupportInsidePlansAdminService`, que edita los 3 planes). Cubre:
 *   - asignar/reasignar el "técnico asignado" (cuidador estable por cliente);
 *   - exponer el bloque gestionado de una suscripción por su servicio
 *     (`getManagedByService`) → sección "Plan de soporte" del detalle admin;
 *   - listar los técnicos elegibles con presencia + carga (`listEligibleTechnicians`)
 *     → picker "Reasignar técnico" (DS-A18).
 *
 * Cumple R1 (audita por evento, no llama a AuditService directo): emite
 * `support_inside.technician_assigned` → `SupportInsideAuditListener`.
 * Cumple R4: la presencia se lee vía `PresenceService` (interfaz), no se
 * duplica la derivación. La elegibilidad reusa `core/tasks/auto-assign` —
 * misma doctrina de roles que la auto-asignación de tareas (cero divergencia).
 */
@Injectable()
export class SupportInsideAdminService {
  private readonly logger = new Logger(SupportInsideAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly presence: PresenceService,
  ) {}

  /**
   * Asigna/reasigna el técnico de una suscripción. `technicianId=null`
   * desasigna. El técnico debe ser un asignatario elegible (staff de soporte
   * activo) — misma doctrina de roles que la auto-asignación de tareas.
   *
   * **Reasignación de la tarea del periodo en curso (decisión Yasmin):** se
   * reasignan SOLO las tareas de mantenimiento `pending` de los slots de la
   * suscripción (nadie las ha empezado); las `in_progress` se respetan. Las
   * futuras las hereda el cron mensual.
   */
  async assignTechnician(
    subscriptionId: string,
    technicianId: string | null,
  ): Promise<{
    subscription_id: string;
    technician_id: string | null;
    reassigned_pending_tasks: number;
  }> {
    const subscription = await this.prisma.supportInsideSubscription.findUnique(
      {
        where: { id: subscriptionId },
        select: {
          id: true,
          client_id: true,
          assigned_technician_id: true,
          slots: { where: { released_at: null }, select: { id: true } },
        },
      },
    );
    if (!subscription) {
      throw new NotFoundException('Suscripción Support Inside no encontrada.');
    }

    if (
      technicianId &&
      !(await isAssigneeEligible(
        this.prisma,
        technicianId,
        'support_inside_slot',
      ))
    ) {
      throw new BadRequestException(
        'El técnico debe ser un agente de soporte activo.',
      );
    }

    const previousTechnicianId = subscription.assigned_technician_id;
    const slotIds = subscription.slots.map((s) => s.id);

    const reassignedPendingTasks = await this.prisma.$transaction(
      async (tx) => {
        await tx.supportInsideSubscription.update({
          where: { id: subscriptionId },
          data: { assigned_technician_id: technicianId },
        });
        if (slotIds.length === 0) return 0;
        const res = await tx.task.updateMany({
          where: {
            source_system: 'support_inside_slot',
            source_id: { in: slotIds },
            status: 'pending',
          },
          data: { assigned_to: technicianId },
        });
        return res.count;
      },
    );

    this.events.emit('support_inside.technician_assigned', {
      subscription_id: subscription.id,
      client_id: subscription.client_id,
      technician_id: technicianId,
      previous_technician_id: previousTechnicianId,
      reassigned_pending_tasks: reassignedPendingTasks,
    });

    this.logger.log(
      `technician ${technicianId ?? 'unassigned'} on subscription=${subscription.id} (reassigned ${reassignedPendingTasks} pending tasks)`,
    );

    return {
      subscription_id: subscription.id,
      technician_id: technicianId,
      reassigned_pending_tasks: reassignedPendingTasks,
    };
  }

  /**
   * Bloque gestionado de la suscripción SI dueña de `serviceId` (el servicio
   * interno de la suscripción). Lo consume la sección "Plan de soporte" del
   * detalle de servicio admin. 404 si el servicio no es una suscripción SI
   * (el wrapper del frontend lo trata fail-soft → no renderiza la sección).
   *
   * SI-INV-8: una sola query (include anidado) + presencia + derivación de
   * mantenimiento reusando el helper compartido — sin N+1.
   */
  async getManagedByService(
    serviceId: string,
  ): Promise<AdminSupportInsideManaged> {
    const subscription = await this.prisma.supportInsideSubscription.findUnique(
      {
        where: { service_id: serviceId },
        select: {
          id: true,
          service_id: true,
          status: true,
          started_at: true,
          product: {
            select: {
              slug: true,
              name: true,
              support_inside_config: {
                select: { priority_tier: true, response_sla_hours: true },
              },
            },
          },
          technician: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              avatar_url: true,
            },
          },
          slots: {
            where: { released_at: null },
            select: {
              id: true,
              service_id: true,
              anniversary_day: true,
              slot_type: true,
              service: {
                select: {
                  label: true,
                  domain: true,
                  product: { select: { name: true } },
                },
              },
            },
            orderBy: { assigned_at: 'desc' },
          },
        },
      },
    );

    if (!subscription) {
      throw new NotFoundException(
        'El servicio no es una suscripción Support Inside.',
      );
    }

    const now = new Date();
    const technician = subscription.technician
      ? {
          id: subscription.technician.id,
          first_name: subscription.technician.first_name,
          last_name: subscription.technician.last_name,
          avatar_url: subscription.technician.avatar_url,
          presence: await this.presence.getPresence(
            subscription.technician.id,
            now,
          ),
        }
      : null;

    const enriched = await enrichSlotsMaintenance(
      this.prisma,
      subscription.slots,
      now,
    );

    const config = subscription.product.support_inside_config;

    return {
      subscription_id: subscription.id,
      service_id: subscription.service_id,
      status: subscription.status,
      started_at: subscription.started_at.toISOString(),
      plan: {
        slug: subscription.product.slug,
        name: subscription.product.name,
        priority_tier: config?.priority_tier ?? 'standard',
        response_sla_hours:
          config?.response_sla_hours ?? DEFAULT_RESPONSE_SLA_HOURS,
      },
      technician,
      maintenance: {
        period_total: enriched.length,
        period_done: enriched.filter(
          (s) => s.maintenance_status === 'up_to_date',
        ).length,
        overdue_count: enriched.filter(
          (s) => s.maintenance_status === 'overdue',
        ).length,
        slots: enriched.map((s) => ({
          id: s.id,
          slot_type: s.slot_type,
          service_label:
            s.service.label || s.service.domain || s.service.product.name,
          last_maintenance_at: s.last_maintenance_at,
          next_maintenance_at: s.next_maintenance_at,
          maintenance_status: s.maintenance_status,
        })),
      },
    };
  }

  /**
   * Técnicos elegibles para el picker "Reasignar técnico" (DS-A18): staff de
   * soporte activo (mismos roles que la auto-asignación de `support_inside_slot`),
   * cada uno con su presencia (heartbeat) y su carga de mantenimiento activa
   * (tareas `pending`/`in_progress` de slots SI). Una query de usuarios + una
   * de presencia (mapa) + un groupBy de carga — sin N+1.
   */
  async listEligibleTechnicians(): Promise<AdminEligibleTechnician[]> {
    const roles = eligibleAssigneeRoles('support_inside_slot');
    if (roles.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: {
        status: 'active',
        role: { slug: { in: [...roles] } },
      },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
        avatar_url: true,
        role: { select: { slug: true } },
      },
      orderBy: [{ first_name: 'asc' }, { last_name: 'asc' }],
    });
    if (users.length === 0) return [];

    const ids = users.map((u) => u.id);
    const [presenceMap, loadRows] = await Promise.all([
      this.presence.getPresenceMap(ids, new Date()),
      this.prisma.task.groupBy({
        by: ['assigned_to'],
        where: {
          assigned_to: { in: ids },
          source_system: 'support_inside_slot',
          status: { in: ['pending', 'in_progress'] },
        },
        _count: { _all: true },
      }),
    ]);
    const loadById = new Map<string, number>();
    for (const row of loadRows) {
      if (row.assigned_to) loadById.set(row.assigned_to, row._count._all);
    }

    return users.map((u) => ({
      id: u.id,
      first_name: u.first_name,
      last_name: u.last_name,
      full_name: `${u.first_name} ${u.last_name}`.trim(),
      email: u.email,
      role: u.role.slug,
      avatar_url: u.avatar_url,
      presence: presenceMap[u.id] ?? 'offline',
      active_maintenance_tasks: loadById.get(u.id) ?? 0,
    }));
  }
}
