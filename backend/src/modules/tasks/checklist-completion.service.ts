import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ChecklistItemKind } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { CompleteChecklistItemDto, ChecklistItemKindDto } from './dto/task.dto';

/**
 * ChecklistCompletionService — Sprint 8 Fase B.5 (2026-04-29).
 *
 * Gestión de `task_checklist_completions`. Funcionalidad mínima del sprint:
 *
 *   - `complete(taskId, dto, completerId)` → marca un item como completado
 *     dentro de la task. Idempotente por UNIQUE `(task_id, item_id, item_kind)`:
 *     si el item ya estaba completo, devuelve la fila existente sin error.
 *   - `findByTask(taskId)` → lista todos los items completados de la task,
 *     con datos del completer enriquecido. Consumido por la UI checklist.
 *   - `validateRequiredCompleted(taskId, serviceId)` → comprueba que todos
 *     los items `is_required=true` del service están en `task_checklist_completions`.
 *     Usado por `MaintenanceLogService` antes de cerrar la task (EC-T8-01).
 *
 * El item al que apunta `item_id` puede vivir en `service_checklist_items`
 * (snapshot post-Sprint 11) o `product_checklist_items` (fallback global).
 * `item_kind` lo distingue. Aquí se hace una validación ligera de existencia
 * para que `item_id` no apunte a UUIDs inventados; la integridad estricta
 * se delega al cliente backend (es FK polimórfica gestionada en código,
 * no en BD — schema canónico Sprint 8 Fase A `30-data/tasks.md`).
 */
@Injectable()
export class ChecklistCompletionService {
  private readonly logger = new Logger(ChecklistCompletionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async complete(
    taskId: string,
    dto: CompleteChecklistItemDto,
    completerId: string,
  ) {
    await this.assertItemExists(dto);

    try {
      return await this.prisma.taskChecklistCompletion.upsert({
        where: {
          uniq_completion_per_item: {
            task_id: taskId,
            item_id: dto.item_id,
            item_kind: dto.item_kind,
          },
        },
        create: {
          task_id: taskId,
          item_id: dto.item_id,
          item_kind: dto.item_kind,
          completed_by: completerId,
          notes: dto.notes,
        },
        update: {
          // Idempotencia: si el agente vuelve a marcar el mismo item con
          // `notes` distintas, actualizamos notas pero conservamos
          // completed_at original (no se "re-completa", sigue siendo el
          // mismo evento de cierre desde el punto de vista de auditoría).
          notes: dto.notes,
        },
      });
    } catch (err) {
      // FK violation sobre task_id → task no existe (validación dura BD)
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2003'
      ) {
        throw new NotFoundException('Task no encontrada');
      }
      throw err;
    }
  }

  /**
   * Lista los items completados de una task con datos del agente que los
   * marcó. Consumido por la UI para mostrar el progreso del checklist
   * ("3/7 completados") + tooltip con autor y timestamp.
   */
  findByTask(taskId: string) {
    return this.prisma.taskChecklistCompletion.findMany({
      where: { task_id: taskId },
      include: {
        completer: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
      orderBy: { completed_at: 'asc' },
    });
  }

  /**
   * Devuelve los IDs de items requeridos del servicio que NO están
   * completados en la task. Si el servicio no tiene snapshot todavía
   * (Sprint 11 lo populará al provisionar), cae al checklist global del
   * producto via `product_checklist_items` para que el flujo siga
   * funcionando antes de Sprint 11.
   *
   * Retorna lista vacía cuando todos los `is_required=true` están
   * completados — usado por `MaintenanceLogService` para validar
   * EC-T8-01 antes de cerrar la task.
   */
  async findMissingRequiredItems(
    taskId: string,
    serviceId: string | null,
    productId: string | null,
  ): Promise<{ id: string; label: string; kind: ChecklistItemKindDto }[]> {
    const completions = await this.prisma.taskChecklistCompletion.findMany({
      where: { task_id: taskId },
      select: { item_id: true, item_kind: true },
    });
    const completedSet = new Set(
      completions.map((c) => `${c.item_kind}:${c.item_id}`),
    );

    const missing: {
      id: string;
      label: string;
      kind: ChecklistItemKindDto;
    }[] = [];

    if (serviceId) {
      const serviceItems = await this.prisma.serviceChecklistItem.findMany({
        where: { service_id: serviceId, is_required: true },
        select: { id: true, label: true },
        orderBy: { order_index: 'asc' },
      });
      for (const item of serviceItems) {
        if (!completedSet.has(`service:${item.id}`)) {
          missing.push({
            id: item.id,
            label: item.label,
            kind: ChecklistItemKindDto.service,
          });
        }
      }
      // Si el servicio tiene snapshot (al menos 1 item), no buscamos en
      // product (el snapshot es la fuente canónica una vez provisionado).
      if (serviceItems.length > 0) return missing;
    }

    if (productId) {
      const productItems = await this.prisma.productChecklistItem.findMany({
        where: { product_id: productId, is_required: true },
        select: { id: true, label: true },
        orderBy: { order_index: 'asc' },
      });
      for (const item of productItems) {
        if (!completedSet.has(`product:${item.id}`)) {
          missing.push({
            id: item.id,
            label: item.label,
            kind: ChecklistItemKindDto.product,
          });
        }
      }
    }

    return missing;
  }

  /**
   * Lista los items disponibles del checklist para una task de
   * mantenimiento. Devuelve los del `service` snapshot si existen,
   * o los del `product` si no. Consumido por la UI para renderizar
   * los checkboxes con su estado (completado / pendiente).
   */
  async findChecklistForTask(
    serviceId: string | null,
    productId: string | null,
  ): Promise<
    {
      id: string;
      label: string;
      is_required: boolean;
      order_index: number;
      kind: ChecklistItemKindDto;
    }[]
  > {
    if (serviceId) {
      const items = await this.prisma.serviceChecklistItem.findMany({
        where: { service_id: serviceId },
        orderBy: { order_index: 'asc' },
      });
      if (items.length > 0) {
        return items.map((i) => ({
          id: i.id,
          label: i.label,
          is_required: i.is_required,
          order_index: i.order_index,
          kind: ChecklistItemKindDto.service,
        }));
      }
    }
    if (productId) {
      const items = await this.prisma.productChecklistItem.findMany({
        where: { product_id: productId },
        orderBy: { order_index: 'asc' },
      });
      return items.map((i) => ({
        id: i.id,
        label: i.label,
        is_required: i.is_required,
        order_index: i.order_index,
        kind: ChecklistItemKindDto.product,
      }));
    }
    return [];
  }

  /**
   * Sprint 16 (ADR-079): cuando la task es `support_inside_slot`, el
   * `source_id` apunta al slot. Para resolver el checklist hay que cargar
   * el slot → service → product. Helper canónico para uso del controller.
   */
  async getSlotForTask(
    slotId: string,
  ): Promise<{ service_id: string; product_id: string | null } | null> {
    const slot = await this.prisma.supportInsideSlot.findUnique({
      where: { id: slotId },
      select: {
        service_id: true,
        service: { select: { product_id: true } },
      },
    });
    if (!slot) return null;
    return {
      service_id: slot.service_id,
      product_id: slot.service?.product_id ?? null,
    };
  }

  private async assertItemExists(dto: CompleteChecklistItemDto): Promise<void> {
    if (dto.item_kind === ChecklistItemKind.service) {
      const item = await this.prisma.serviceChecklistItem.findUnique({
        where: { id: dto.item_id },
        select: { id: true },
      });
      if (!item) {
        throw new BadRequestException(
          `Service checklist item ${dto.item_id} no existe`,
        );
      }
    } else {
      const item = await this.prisma.productChecklistItem.findUnique({
        where: { id: dto.item_id },
        select: { id: true },
      });
      if (!item) {
        throw new BadRequestException(
          `Product checklist item ${dto.item_id} no existe`,
        );
      }
    }
  }
}
