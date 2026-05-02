import { Injectable, Logger } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';

import { PrismaService } from '../../../core/database/prisma.service';
import { PluginRegistryService } from '../../../core/provisioning/plugin-registry';
import { getErrorMessage } from '../../../core/common/utils/error.util';

/**
 * ProvisioningOnTaskCompletedListener — Sprint 11 Fase 11.C (ADR-077 + EC-P11-07).
 *
 * Cierra el ciclo del flujo `manual` (y futuros plugins con
 * `capabilities.completes_via_task=true`): cuando un agente completa la
 * Task `support_setup` (o cualquier tarea que vincule a un service cuyo
 * plugin declare ese flag), el listener marca `services.status='active'`
 * y emite `service.activated`.
 *
 * Filtrado canónico (mutuamente excluyente con el bridge ticket↔task de
 * Sprint 8 — ADR-074 — EC-P11-07):
 *
 *   ┌──────────────────────────┬──────────────────────────────────────┐
 *   │ Listener                 │ Predicado                            │
 *   ├──────────────────────────┼──────────────────────────────────────┤
 *   │ TasksService bridge      │ task.conversation_id !== null        │
 *   │ ProvisioningOnTask...    │ task.conversation_id === null   &&   │
 *   │                          │ task.service_id      !== null   &&   │
 *   │                          │ plugin.capabilities.               │
 *   │                          │   completes_via_task === true        │
 *   └──────────────────────────┴──────────────────────────────────────┘
 *
 * Race imposible: una Task no puede tener `conversation_id` Y `service_id`
 * con plugin `completes_via_task` simultáneamente (la Task del bridge se
 * crea desde `SupportTicketTaskCreatorListener` con conversation_id; la
 * Task `support_setup` la crea el orquestador con service_id y
 * conversation_id=null).
 *
 * Diseño abierto (NO hardcoded por `task.type`):
 *   - El listener filtra por `plugin.capabilities.completes_via_task`.
 *   - Sprint 22 Projects podrá registrar plugin `project` con el mismo
 *     flag y reusar este listener sin modificarlo (`task.type='project_task'`
 *     funcionará automáticamente).
 *
 * Idempotencia:
 *   - Si el service ya está `active` no hace nada.
 *   - Si el service está en estado terminal (`cancelled`/`terminated`)
 *     loguea warning y no actúa (la cancelación admin tuvo precedencia).
 *
 * Errores:
 *   - Plugin no registrado al consumir el evento: log error + emit
 *     `service.provisioning_failed` (degradación elegante).
 *   - Cualquier otro fallo: log + degradación silenciosa (R7) — el
 *     admin puede reprovisionar manualmente desde `/admin/services/:id/reprovision`.
 */
@Injectable()
export class ProvisioningOnTaskCompletedListener {
  private readonly logger = new Logger(
    ProvisioningOnTaskCompletedListener.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PluginRegistryService,
    private readonly events: EventEmitter2,
  ) {}

  @OnEvent('task.completed')
  async handle(payload: {
    task: {
      id: string;
      source_system: string;
      source_id: string;
    };
    completedBy?: string;
  }): Promise<void> {
    const { task } = payload;

    // Sprint 16 (ADR-079): filtramos por source_system canónico. Sólo las
    // tasks `provisioning_manual` activan service vía este listener; el
    // bridge ticket↔task (`source_system='support_ticket'`) lo gestiona
    // module support y los mantenimientos `support_inside_slot` no
    // activan services.
    if (task.source_system !== 'provisioning_manual') return;

    try {
      // El `source_id` apunta directamente al service.
      const service = await this.prisma.service.findUnique({
        where: { id: task.source_id },
        select: {
          id: true,
          user_id: true,
          status: true,
          product: { select: { provisioner: true } },
        },
      });

      if (!service) {
        this.logger.warn(
          `task.completed for task=${task.id} references missing service=${task.source_id}; skipping.`,
        );
        return;
      }

      if (service.status === 'active') {
        this.logger.debug(
          `Service ${service.id} already active — task=${task.id} ignored (idempotent).`,
        );
        return;
      }

      if (service.status === 'cancelled' || service.status === 'terminated') {
        this.logger.warn(
          `Service ${service.id} terminal (${service.status}); ignoring task=${task.id} completion.`,
        );
        return;
      }

      // 3. Resolver plugin y verificar capability flag — el filtro real.
      const pluginSlug = service.product.provisioner;
      const plugin = this.registry.get(pluginSlug);

      if (!plugin) {
        // El service apunta a un plugin no registrado al boot. Notificar
        // y dejar el service en su estado actual. Admin puede reasignar
        // el plugin del producto + reprovisionar.
        this.logger.error(
          `Plugin "${pluginSlug}" not registered while activating service ${service.id} from task=${task.id}.`,
        );
        this.events.emit('service.provisioning_failed', {
          service_id: service.id,
          user_id: service.user_id,
          provisioner_slug: pluginSlug,
          reason: 'plugin_not_registered',
          correlation_id: `task-${task.id}`,
        });
        return;
      }

      if (!plugin.capabilities.completes_via_task) {
        // Plugin no declara este flag — el listener no debe activar el
        // service. Silencioso: el plugin tiene su propio mecanismo
        // (markActive directo, webhook, etc.).
        return;
      }

      // 4. Activar service + emit canónico.
      await this.prisma.service.update({
        where: { id: service.id },
        data: { status: 'active' },
      });

      this.events.emit('service.activated', {
        service_id: service.id,
        user_id: service.user_id,
        correlation_id: `task-${task.id}`,
      });

      this.logger.log(
        `Service ${service.id} activated via task=${task.id} (plugin=${pluginSlug}, completedBy=${payload.completedBy ?? 'unknown'}).`,
      );
    } catch (err) {
      // Degradación elegante: el provisioning ya consiguió crear la
      // task; el cliente la verá completada en su timeline. La
      // activación queda en hands-on del admin (reprovision).
      this.logger.error(
        `provisioning-on-task-completed failed for task=${task.id}: ${getErrorMessage(err)}`,
      );
    }
  }
}
